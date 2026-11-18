// Studio video: video layers (type "video") drawn from one muted HTMLVideoElement per layer.
// A video layer is a clip of a file, like a sound layer: it starts at layer.in and shows the
// file from props.offset. Its sound is decoded and mixed by audio.js, so the elements never
// play sound. The preview lets the elements play and corrects their drift; the export and the
// poster seek them to every frame and wait until the frame is decoded (frame-exact).

import { valueAt, activeAt } from './engine.js';

export const isVideo = (l) => l.type === 'video';

const WAIT_MS = 10000;
// Seek a hair past the frame start: offset + t - in, in floating point, often lands a few
// nanoseconds before it, and the browser then shows the previous frame of the file.
const NUDGE = 0.001;

/** Time in the file shown at composition time t (seconds). */
export function fileTime(l, t) {
  const off = Math.max(0, +valueAt(l.props?.offset ?? 0, 0) || 0);
  return off + (t - l.in) + NUDGE;
}

const srcOf = (l) => String(valueAt(l.props?.src ?? '', 0) || '');

function once(el, events, ms = WAIT_MS) {
  return new Promise((ok) => {
    const done = () => { clearTimeout(timer); for (const e of events) el.removeEventListener(e, done); ok(); };
    const timer = setTimeout(done, ms);
    for (const e of events) el.addEventListener(e, done, { once: true });
  });
}

/** A set of video elements, one per layer. The editor keeps one for the preview, the export another. */
export class Pool {
  /** onFrame: a new frame can be drawn; onMeta: a file's duration is known, or it failed. */
  constructor({ onFrame = null, onMeta = null } = {}) {
    this.items = new Map(); // layer id -> { el, src, failed }
    this.onFrame = onFrame;
    this.onMeta = onMeta;
  }

  item(l) {
    const src = srcOf(l);
    let it = this.items.get(l.id);
    if (it && it.src !== src) { this.drop(l.id); it = null; }
    if (!it && src) {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      it = { el, src, failed: false };
      el.addEventListener('error', () => { it.failed = true; this.onMeta?.(l.id); });
      if (this.onMeta) el.addEventListener('loadedmetadata', () => this.onMeta(l.id));
      if (this.onFrame) { el.addEventListener('seeked', this.onFrame); el.addEventListener('loadeddata', this.onFrame); }
      el.src = src;
      this.items.set(l.id, it);
    }
    return it;
  }

  drop(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.el.pause();
    it.el.removeAttribute('src');
    it.el.load();
    this.items.delete(id);
  }

  /** Forgets the elements of layers that left the project. */
  prune(project) {
    const ids = new Set((project.layers || []).filter(isVideo).map((l) => l.id));
    for (const id of [...this.items.keys()]) if (!ids.has(id)) this.drop(id);
  }

  destroy() {
    for (const id of [...this.items.keys()]) this.drop(id);
  }

  pause() {
    for (const it of this.items.values()) if (!it.el.paused) it.el.pause();
  }

  /** Duration of a layer's file once its metadata is in, or null. */
  duration(l) {
    const d = this.items.get(l.id)?.el.duration;
    return Number.isFinite(d) ? d : null;
  }

  failed(l) { return !!this.items.get(l.id)?.failed; }

  /**
   * Preview: points every element at time t, playing while the editor plays, and returns the
   * elements that have a frame to draw ({ layer id: element }). Never waits.
   */
  sync(project, t, { playing = false, rate = 1 } = {}) {
    this.prune(project);
    const out = {};
    for (const l of project.layers || []) {
      if (!isVideo(l)) continue;
      const it = this.item(l);
      if (!it || it.failed) continue;
      const el = it.el;
      if (!activeAt(l, t)) { if (!el.paused) el.pause(); continue; }
      const dur = Number.isFinite(el.duration) ? el.duration : Infinity;
      const ft = Math.max(0, Math.min(fileTime(l, t), dur - 0.001));
      if (playing && ft < dur - 0.05) {
        if (el.playbackRate !== rate) el.playbackRate = rate;
        if (el.paused) { el.currentTime = ft; el.play().catch(() => {}); }
        else if (!el.seeking && Math.abs(el.currentTime - ft) > 0.25) el.currentTime = ft;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - ft) > 0.001 && el.readyState >= 1) el.currentTime = ft;
      }
      if (el.readyState >= 2) out[l.id] = el;
    }
    return out;
  }

  /** Export: seeks every active element to time t and resolves once each frame is decoded. */
  async seek(project, t) {
    this.prune(project);
    const out = {};
    await Promise.all((project.layers || []).filter((l) => isVideo(l) && activeAt(l, t)).map(async (l) => {
      const it = this.item(l);
      if (!it || it.failed) return;
      const el = it.el;
      if (!el.paused) el.pause();
      if (el.readyState < 1) await once(el, ['loadedmetadata', 'error']);
      if (it.failed) return;
      const ft = Math.max(0, Math.min(fileTime(l, t), el.duration - 0.001));
      if (Math.abs(el.currentTime - ft) > 1e-6 || el.seeking || el.readyState < 2) {
        const ready = once(el, ['seeked', 'error']);
        el.currentTime = ft;
        await ready;
      }
      if (el.readyState < 2) await once(el, ['loadeddata', 'canplay', 'error']);
      if (!it.failed && el.readyState >= 2) out[l.id] = el;
    }));
    return out;
  }
}
