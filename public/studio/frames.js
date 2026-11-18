// Motion Studio, frames of a motion outside its editor: the script runtime (sandboxed iframe,
// runtime.html), the web fonts, and Stills, which renders any frame of a motion with the
// editor's compositor (storyboard thumbnails, animatic). Shared by studio.js and production.js.

import { drawFrame, ensureFonts, preloadImages, resolve, resolveParams, isScript, activeAt } from './engine.js';
import { Pool } from './video.js';

export const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@300..800&family=Inter:wght@300..800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400..700&family=Space+Grotesk:wght@300..700&display=swap';

export function loadFonts() {
  if (document.querySelector('link[data-studio-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = FONTS_CSS;
  l.dataset.studioFonts = '';
  document.head.append(l);
}

// =====================================================================
// Runtime bridge (sandboxed iframe)
// =====================================================================

// three: r170 WebGL; three-gpu: r187 WebGPU + TSL + post addons (tools/vendor-three-gpu.sh).
const VENDOR = [['three', '/vendor/three.module.min.js'], ['three-gpu', '/vendor/three-gpu.min.js']];

export class Runtime {
  constructor({ onError, onLog }) {
    this.frame = document.createElement('iframe');
    this.frame.sandbox = 'allow-scripts';
    // srcdoc rather than src: the document stays an opaque origin and no service worker
    // or navigation handling can get in the way.
    fetch('/studio/runtime.html').then((r) => r.text()).then((html) => { this.frame.srcdoc = html; });
    this.frame.className = 'st-runtime';
    // Inline too: pages without studio.css (the storyboard) host a runtime as well.
    this.frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none';
    this.frame.title = 'Exécution des scripts';
    this.n = 0;
    this.waiting = new Map();
    this.sig = '';
    this.sent = new Set();
    this.ready = new Promise((r) => { this.setReady = r; });
    this.onMsg = (e) => {
      if (e.source !== this.frame.contentWindow) return;
      const m = e.data;
      if (m.type === 'ready') this.setReady();
      else if (m.type === 'frame') { this.waiting.get(m.n)?.(m.bitmaps); this.waiting.delete(m.n); }
      else if (m.type === 'error') onError(m);
      else if (m.type === 'log') onLog(m);
    };
    window.addEventListener('message', this.onMsg);
    document.body.append(this.frame);
  }
  // Decoded once per URL, shared by every layer and every sync.
  bitmap(url) {
    this.bitmaps ??= new Map();
    if (!this.bitmaps.has(url)) {
      this.bitmaps.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      }).then((b) => createImageBitmap(b)).catch(() => null));
    }
    return this.bitmaps.get(url);
  }
  async sync(project, scale) {
    const defs = (project.layers || []).filter(isScript).map((l) => {
      const p = resolve(l, 0, project);
      const assets = l.assets && typeof l.assets === 'object' ? l.assets : {};
      return { id: l.id, type: l.type, backend: l.backend, code: l.code || '', w: p.w, h: p.h, assets, assetSig: JSON.stringify(assets) };
    });
    const sig = JSON.stringify([defs, scale]);
    // Same layers as the sync still in flight (assets loading): wait for it rather than render early.
    if (sig === this.sig) { await this.pending; return false; }
    this.sig = sig;
    // Chained so a slow asset load never lets an older sync land after a newer one.
    this.pending = (this.pending || Promise.resolve()).then(() => this.post(defs, scale));
    await this.pending;
    return true;
  }
  async post(defs, scale) {
    await this.ready;
    // Script layers get their images (layer.assets: { name: url }) as ImageBitmaps.
    defs = await Promise.all(defs.map(async (d) => {
      const names = Object.keys(d.assets);
      const maps = await Promise.all(names.map((n) => this.bitmap(d.assets[n])));
      const assets = {};
      names.forEach((n, i) => { if (maps[i]) assets[n] = maps[i]; });
      return { ...d, assets };
    }));
    // Each 3D type gets its own three.js build, sent once, the first time a layer needs it.
    for (const [type, file] of VENDOR) {
      if (this.sent.has(type) || !defs.some((d) => d.type === type)) continue;
      this.sent.add(type);
      const src = await fetch(file).then((r) => r.text());
      this.frame.contentWindow.postMessage({ type, src }, '*');
    }
    this.frame.contentWindow.postMessage({ type: 'sync', layers: defs, scale }, '*');
    return true;
  }
  async render(items) {
    await this.ready;
    const n = ++this.n;
    return new Promise((resolve) => {
      this.waiting.set(n, resolve);
      this.frame.contentWindow.postMessage({ type: 'render', n, items }, '*');
      // A script stuck in an infinite loop must not freeze the editor forever.
      setTimeout(() => { if (this.waiting.has(n)) { this.waiting.delete(n); resolve({}); } }, 10000);
    });
  }
  destroy() {
    window.removeEventListener('message', this.onMsg);
    this.frame.remove();
  }
}

// =====================================================================
// Stills
// =====================================================================

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Renders frames of motions. `load(id)` returns a full motion document. */
export class Stills {
  constructor(load) {
    this.load = load;
    this.docs = new Map(); // id -> { rev, doc: Promise }
    this.urls = new Map(); // `${id}@${rev}:${t}:${w}` -> data URL
    this.pools = new Map(); // project -> video Pool (layer ids repeat across motions)
    this.rt = null;
    this.queue = Promise.resolve();
  }

  /** The motion document, fetched once per revision (`rev` from the listing). */
  doc(id, rev) {
    const c = this.docs.get(id);
    if (c && c.rev === rev) return c.doc;
    const doc = Promise.resolve(this.load(id)).then(async (d) => {
      loadFonts();
      ensureFonts(d, () => {});
      await Promise.all([document.fonts.ready, preloadImages(d)]);
      return d;
    });
    doc.catch(() => this.docs.delete(id));
    this.docs.set(id, { rev, doc });
    return doc;
  }

  /** Draws frame t of the motion on a canvas sized by the caller. One frame at a time. */
  draw(canvas, project, t) {
    const run = this.queue.then(() => this.paint(canvas, project, clamp(t, 0, project.duration)));
    this.queue = run.catch(() => {});
    return run;
  }

  async paint(canvas, project, t) {
    const scale = canvas.width / project.width;
    if (!this.pools.has(project)) this.pools.set(project, new Pool());
    let bitmaps = await this.pools.get(project).seek(project, t);
    const scripts = project.layers.filter((l) => isScript(l) && activeAt(l, t));
    if (scripts.length) {
      this.rt ||= new Runtime({ onError() {}, onLog() {} });
      await this.rt.sync(project, scale);
      bitmaps = { ...bitmaps, ...await this.rt.render(scripts.map((l) => {
        const dur = Math.max(0.0001, l.out - l.in);
        return { id: l.id, t: t - l.in, time: t, p: clamp((t - l.in) / dur, 0, 1), frame: Math.round(t * project.fps), fps: project.fps, dur, params: resolveParams(l, t) };
      })) };
    }
    drawFrame(canvas.getContext('2d'), project, t, { scale, bitmaps });
    for (const b of Object.values(bitmaps)) b.close?.();
  }

  /** Frame t of motion `id` as a JPEG data URL `w` pixels wide, cached per revision. */
  async url(id, rev, t, w = 480) {
    const key = `${id}@${rev}:${t}:${w}`;
    if (this.urls.has(key)) return this.urls.get(key);
    const p = await this.doc(id, rev);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((w * p.height) / p.width);
    await this.draw(c, p, t);
    const url = c.toDataURL('image/jpeg', 0.82);
    this.urls.set(key, url);
    return url;
  }

  /** Cached frame, or null: lets a synchronous render reuse what is already drawn. */
  cached(id, rev, t, w = 480) {
    return this.urls.get(`${id}@${rev}:${t}:${w}`) || null;
  }

  destroy() {
    this.rt?.destroy();
    this.rt = null;
    for (const v of this.pools.values()) v.destroy();
    this.pools.clear();
  }
}
