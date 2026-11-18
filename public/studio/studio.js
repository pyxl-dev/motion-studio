// Motion Studio: gallery of motions and a timeline editor. Loaded on demand
// by home.js for #/studio/motions and #/studio/m/<id>. Motions live on the server
// (/api/studio/projects) and may belong to a production (`production`); script layers
// run in a sandboxed iframe (runtime.html).

import {
  EASES, EASE_LABELS, SCHEMA, TYPES, BLEND_LABELS, isAnimated, valueAt, resolve, resolveParams, defaultLayer,
  drawFrame, hitTest, boxOf, matrixOf, isScript, activeAt, ensureFonts, timecode,
} from './engine.js';
import { TEMPLATES } from './templates.js';
import { codeEditor } from './code.js';
import { Runtime, loadFonts } from './frames.js';
import * as A from './audio.js';
import * as V from './video.js';
import * as comments from './comments.js';
import * as assets from './assets.js';

let H = null; // host helpers from app.js: { api, toast, esc }
const esc = (s) => H.esc(s);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const fmt = (v) => (typeof v === 'number' ? String(round(v, 3)).replace('.', ',') : v);
const num = (s) => parseFloat(String(s).replace(',', '.'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRESETS = [
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '1:1', w: 1080, h: 1080 },
  { label: '4:5', w: 1080, h: 1350 },
  { label: '21:9', w: 2560, h: 1080 },
];
const nameW = () => (innerWidth < 900 ? 136 : 232);
const ROW_H = 30;

// Icons used only by the studio (Lucide-like strokes, 24 grid).
const I = {
  back: '<path d="m15 18-6-6 6-6"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  start: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
  end: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  prev: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="2.5"/>',
  ellipse: '<circle cx="12" cy="12" r="8"/>',
  star: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
  canvas: '<path d="M4 20c4-1 5-6 8-9s6-3 8-7"/><circle cx="7" cy="7" r="2"/><path d="M15 20h5v-5"/>',
  cube: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  gpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  comp: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  safe: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6.5" y="7.5" width="11" height="9" rx="1" stroke-dasharray="2 2"/>',
  checker: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18" /><path d="M3 3h9v9H3zM12 12h9v9h-9z" fill="currentColor" stroke="none" opacity=".35"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  key: '<path d="M12 3 21 12 12 21 3 12z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  expand: '<path d="M15 4h5v5M9 20H4v-5M20 4l-7 7M4 20l7-7"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  chat: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4.5 3.5V17H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;
const TYPE_ICON = { text: 'text', shape: 'rect', image: 'image', video: 'video', canvas: 'canvas', three: 'cube', 'three-gpu': 'gpu', audio: 'sound' };

function relTime(ts) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 45) return "à l'instant";
  if (d < 3600) return `il y a ${Math.round(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const byLabel = (by) => (by === 'app' ? 'toi' : by === 'api' ? 'un script' : by);
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'projet';
const newId = (name) => `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`;

function loadCss() {
  if ($('link[data-studio-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/studio/studio.css';
  l.dataset.studioCss = '';
  document.head.append(l);
}

// =====================================================================
// Gallery
// =====================================================================

const G = { list: null, el: null, embedded: false, prods: {} };

/** `embedded`: inside the Studio home, which has its own header. */
export async function gallery(el, host, { embedded = false } = {}) {
  H = host;
  loadCss();
  G.el = el;
  G.embedded = embedded;
  if (!G.list) el.innerHTML = galleryHTML();
  try {
    const [list, prods] = await Promise.all([H.api('/api/studio/projects'), H.api('/api/productions').catch(() => [])]);
    G.list = list;
    G.prods = Object.fromEntries(prods.map((p) => [p.id, p.name || p.id]));
  } catch (e) {
    if (e.message === 'login required') return;
    H.toast(e.message);
    G.list = [];
  }
  if (G.el === el && el.isConnected) el.innerHTML = galleryHTML();
}

function posterHTML(p) {
  const ratio = `${p.width || 16} / ${p.height || 9}`;
  if (p.poster) return `<div class="sg-frame"><img src="${esc(p.poster)}" alt="" loading="lazy"></div>`;
  return `<div class="sg-frame"><div class="sg-ph" style="aspect-ratio:${ratio}">${ic('film')}</div></div>`;
}

function galleryHTML() {
  const list = G.list;
  const cards = list == null
    ? '<div class="sg-skel"></div><div class="sg-skel"></div><div class="sg-skel"></div>'
    : list.map((p) => `<a class="sg-card" href="#/studio/m/${esc(p.id)}">
        ${posterHTML(p)}
        <div class="sg-info">
          <div class="sg-name">${esc(p.name || p.id)}</div>
          ${p.production ? `<div class="sg-prod">${ic('film')}${esc(G.prods[p.production] || p.production)}</div>` : ''}
          <div class="sg-meta"><span>${esc(p.width)}×${esc(p.height)}</span><span>${fmt(p.duration)} s</span><span>${esc(p.fps)} i/s</span></div>
          <div class="sg-by">${p.updated_by && p.updated_by !== 'app' ? ic('sparkle') : ''}${relTime(p.updated_at)} · ${esc(byLabel(p.updated_by))}</div>
        </div>
        <div class="sg-actions">
          <button data-sg="dup" data-id="${esc(p.id)}" title="Dupliquer" aria-label="Dupliquer">${ic('copy')}</button>
          <button data-sg="del" data-id="${esc(p.id)}" title="Supprimer" aria-label="Supprimer">${ic('trash')}</button>
        </div>
      </a>`).join('');
  const hero = G.embedded ? `<div class="sg-embed-head"><p>Les animations poussées par un script ou un agent IA arrivent ici en direct. Prévisualise, retouche la timeline, exporte la vidéo.</p>
      <button class="btn primary" data-sg="new">${ic('plus')}Nouveau motion</button></div>` : `
    <section class="sg-hero">
      <div class="sg-hero-art" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
      <div class="sg-hero-text">
        <div class="sg-kicker">${ic('film')} Studio</div>
        <h1>Motion design</h1>
        <p>Les projets poussés par un script ou un agent IA (tools/motion.ts push) arrivent ici en direct. Prévisualise, retouche la timeline, ajuste les paramètres 3D, exporte la vidéo.</p>
      </div>
      <button class="btn primary" data-sg="new">${ic('plus')}Nouveau projet</button>
    </section>`;
  return `${hero}
    <h2>Projets ${list?.length ? `<span class="sg-count">${list.length}</span>` : ''}</h2>
    ${list && !list.length ? '<div class="empty">Aucun projet pour l’instant. Pars d’un modèle ci-dessous ou fais écrire le JSON par ton agent IA (docs/format.md).</div>' : `<div class="sg-grid">${cards}</div>`}
    <h2>Modèles</h2>
    <div class="sg-grid sg-tpl">${TEMPLATES.map((t) => `
      <button class="sg-card tpl" data-sg="tpl" data-tpl="${t.id}" style="--a:${t.tone[0]};--b:${t.tone[1]}">
        <div class="sg-frame"><div class="sg-tpl-art" data-format="${t.format}"><i></i><span>${esc(t.format)}</span></div></div>
        <div class="sg-info"><div class="sg-name">${esc(t.name)}</div><div class="sg-desc">${esc(t.desc)}</div></div>
      </button>`).join('')}
    </div>`;
}

async function createProject(doc) {
  const id = newId(doc.name);
  await H.api(`/api/studio/projects/${id}`, { method: 'PUT', body: doc });
  location.hash = `#/studio/m/${id}`;
}

function newProjectDialog() {
  const dlg = document.createElement('div');
  dlg.className = 'st-modal-wrap studio-ui';
  dlg.innerHTML = `<form class="st-modal" method="dialog">
    <div class="st-modal-head"><h3>Nouveau projet</h3><button type="button" class="st-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <label class="st-field"><span>Nom</span><input name="name" value="Sans titre" required maxlength="80"></label>
    <div class="st-field"><span>Format</span><div class="st-presets">${PRESETS.map((p, i) => `
      <label class="st-preset"><input type="radio" name="fmt" value="${i}" ${i ? '' : 'checked'}>
        <i style="aspect-ratio:${p.w}/${p.h}"></i><b>${p.label}</b><small>${p.w}×${p.h}</small></label>`).join('')}</div></div>
    <div class="st-row2">
      <label class="st-field"><span>Images par seconde</span><select name="fps">${[24, 25, 30, 50, 60].map((f) => `<option ${f === 30 ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="st-field"><span>Durée (s)</span><input name="duration" type="number" min="0.5" max="600" step="0.5" value="6"></label>
    </div>
    <div class="st-modal-foot"><button type="button" class="st-btn" data-close>Annuler</button><button class="st-btn primary">Créer</button></div>
  </form>`;
  document.body.append(dlg);
  const form = $('form', dlg);
  form.name.select();
  const close = () => dlg.remove();
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = PRESETS[+form.fmt.value];
    try {
      await createProject({ name: form.name.value.trim() || 'Sans titre', width: p.w, height: p.h, fps: +form.fps.value, duration: clamp(num(form.duration.value) || 6, 0.5, 600), background: '#0b0c10', layers: [] });
      close();
    } catch (err) { H.toast(err.message); }
  });
}

async function galleryClick(e) {
  const b = e.target.closest('[data-sg]');
  if (!b || !G.el?.contains(b)) return;
  e.preventDefault();
  e.stopPropagation();
  const act = b.dataset.sg;
  try {
    if (act === 'new') newProjectDialog();
    else if (act === 'tpl') {
      const t = TEMPLATES.find((x) => x.id === b.dataset.tpl);
      b.classList.add('busy');
      await createProject(t.make());
    } else if (act === 'dup') {
      const doc = await H.api(`/api/studio/projects/${b.dataset.id}`);
      for (const k of ['id', 'rev', 'updated_at', 'updated_by', 'created_at']) delete doc[k];
      doc.name = `${doc.name} (copie)`;
      const id = newId(doc.name);
      await H.api(`/api/studio/projects/${id}`, { method: 'PUT', body: doc });
      gallery(G.el, H);
    } else if (act === 'del') {
      const p = G.list.find((x) => x.id === b.dataset.id);
      if (!confirm(`Supprimer « ${p?.name || b.dataset.id} » ? Cette action est définitive.`)) return;
      await H.api(`/api/studio/projects/${b.dataset.id}`, { method: 'DELETE' });
      H.toast('Projet supprimé');
    }
  } catch (err) { H.toast(err.message); }
}
document.addEventListener('click', galleryClick, true);

// =====================================================================
// Editor state
// =====================================================================

const S = {
  id: null, project: null, rev: 0, t: 0, playing: false, loop: true, speed: 1,
  sel: null, key: null, quality: 1, zoom: 'fit', tlZoom: 90, guides: false, safe: false, checker: false,
  dirty: false, saving: false, saveTimer: 0, posterAt: 0, conflict: false,
  undo: [], redo: [], gesture: null, coalesce: null,
  errors: new Map(), logs: new Map(), rt: null, root: null, ctx: null, octx: null, ce: null, ceLayer: null,
  fps: { n: 0, at: 0, v: 0 }, lastTick: 0, raf: 0, exporting: false, pendingEvent: null, wideInsp: false,
};
const P = () => S.project;
const layerById = (id) => P()?.layers.find((l) => l.id === id);
const selLayer = () => layerById(S.sel);
const frameT = (t) => Math.round(t * P().fps) / P().fps;
const halfFrame = () => 0.5 / P().fps;

function prefs() {
  try { return JSON.parse(localStorage.getItem('hub.studio') || '{}'); } catch { return {}; }
}
function savePrefs() {
  try {
    localStorage.setItem('hub.studio', JSON.stringify({ tlH: S.tlH, quality: S.quality, guides: S.guides, safe: S.safe, checker: S.checker, loop: S.loop, wideInsp: S.wideInsp }));
  } catch { /* private mode */ }
}

// =====================================================================
// Mount / unmount
// =====================================================================

export async function openEditor(id, host) {
  H = host;
  if (S.id === id && S.root) return setTitle();
  closeEditor();
  loadCss();
  loadFonts();
  let doc;
  try {
    doc = await H.api(`/api/studio/projects/${id}`);
  } catch (e) {
    if (e.message !== 'login required') { H.toast(e.message); location.hash = '#/studio/motions'; }
    return;
  }
  comments.all(H).then(() => S.root && (renderBar(), renderRuler())).catch(() => {});
  H.api('/api/productions').then((l) => { S.prods = l; if (S.root && !S.sel) renderInspector(); }).catch(() => {});
  const pr = prefs();
  Object.assign(S, {
    id, project: normalize(doc), rev: doc.rev || 0, t: 0, playing: false, sel: null, key: null,
    undo: [], redo: [], dirty: false, conflict: false, errors: new Map(), logs: new Map(),
    zoom: 'fit', posterAt: doc.poster ? Date.now() : 0,
    quality: pr.quality ?? (innerWidth < 900 ? 0.5 : 1), guides: !!pr.guides, safe: !!pr.safe, checker: !!pr.checker,
    loop: pr.loop ?? true, tlH: pr.tlH || 248, wideInsp: !!pr.wideInsp,
  });
  S.tlZoom = 0;
  document.body.classList.add('studio-open');
  const root = document.createElement('div');
  root.className = 'st studio-ui';
  root.id = 'studio';
  root.innerHTML = shellHTML();
  document.body.append(root);
  S.root = root;
  S.ctx = $('#stCanvas', root).getContext('2d');
  S.octx = $('#stOverlay', root).getContext('2d');
  S.rt = new Runtime({ onError: onScriptError, onLog: onScriptLog });
  // Video layers: the preview's elements play and follow the playhead; the export and the
  // poster seek their own elements frame by frame.
  S.vids = new V.Pool({ onFrame: () => requestPaint(), onMeta: videoLoaded });
  S.vexp = new V.Pool();
  bindEditor();
  applyLayout();
  fitTimeline();
  renderAll();
  A.preload(P(), soundLoaded);
  await S.rt.sync(P(), S.quality);
  ensureFonts(P(), requestPaint);
  requestPaint();
  // A CLI push keeps the previous poster: re-render on open (saved only if it changed).
  setTimeout(() => S.root && savePoster(), 1500);
}

const setTitle = () => H.setTitle(P().name || 'Sans titre', 'Studio');

export function closeEditor() {
  if (!S.root) return;
  stop();
  A.stopAll();
  if (S.dirty) save(true);
  S.rt?.destroy();
  S.vids?.destroy();
  S.vexp?.destroy();
  S.root.remove();
  S.root = null;
  S.id = null;
  S.ce = null;
  S.fb = false;
  document.body.classList.remove('studio-open');
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('beforeunload', onBeforeUnload);
  resizeObs?.disconnect();
}

/** SSE from app.js. */
export function onEvent(type, data) {
  if (type === 'studio' || type === 'studio_deleted') {
    if (G.el?.isConnected && !S.root) gallery(G.el, H, { embedded: G.embedded });
  }
  if (!S.root || data.id !== S.id) return;
  if (type === 'studio_deleted') {
    H.toast('Ce projet a été supprimé');
    location.hash = P().production ? `#/studio/p/${P().production}/motions` : '#/studio/motions';
    return;
  }
  if (S.saving) { S.pendingEvent = data; return; }
  remoteUpdate(data);
}

async function remoteUpdate(data) {
  if (data.rev <= S.rev) return;
  if (S.dirty) { S.conflict = true; renderBar(); return; }
  await reload(`Mis à jour par ${byLabel(data.by)}`);
}

async function reload(msg) {
  const doc = await H.api(`/api/studio/projects/${S.id}`);
  S.project = normalize(doc);
  S.rev = doc.rev;
  S.dirty = false;
  S.conflict = false;
  if (!selLayer()) S.sel = null;
  S.key = null;
  S.errors.clear();
  renderAll();
  A.preload(P(), soundLoaded);
  await S.rt.sync(P(), S.quality);
  ensureFonts(P(), requestPaint);
  requestPaint();
  if (msg) H.toast(msg);
}

function normalize(doc) {
  const p = { name: 'Sans titre', width: 1920, height: 1080, fps: 30, duration: 6, background: '#000000', layers: [], ...doc };
  p.layers = (p.layers || []).map((l) => ({ in: 0, out: p.duration, props: {}, ...l, id: l.id || 'l' + Math.random().toString(36).slice(2, 8) }));
  return p;
}

// =====================================================================
// Shell
// =====================================================================

function shellHTML() {
  const rail = [
    ['text', 'text', 'Texte', 'T'], ['shape', 'rect', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'E'], ['star', 'star', 'Étoile', ''],
    ['image', 'image', 'Image', ''], ['video', 'video', 'Vidéo', ''], ['sound', 'sound', 'Son et SFX', 'S'], ['canvas', 'canvas', 'Script Canvas 2D', ''], ['three', 'cube', 'Scène Three.js 3D (WebGL)', ''], ['three-gpu', 'gpu', 'Scène Three.js WebGPU (TSL)', ''],
  ];
  return `
  <header class="st-bar" id="stBar"></header>
  <nav class="st-rail" aria-label="Ajouter un calque">
    ${rail.map(([k, i, label, sc]) => `${k === 'canvas' ? '<hr>' : ''}<button class="st-tool t-${k}" data-add="${k}" title="${label}${sc ? ` (${sc})` : ''}" aria-label="Ajouter : ${label}">${ic(i)}</button>`).join('')}
    <div class="st-rail-fill"></div>
    <button class="st-tool" data-cmd="comp" title="Composition" aria-label="Réglages de la composition">${ic('comp')}</button>
    <button class="st-tool" data-cmd="help" title="Raccourcis (?)" aria-label="Raccourcis clavier">${ic('keyboard')}</button>
  </nav>
  <main class="st-stage" id="stStage">
    <div class="st-viewbar">
      <div class="st-seg" role="group" aria-label="Zoom">
        <select id="stZoom" aria-label="Zoom de la vue"><option value="fit">Ajuster</option><option value="0.25">25 %</option><option value="0.5">50 %</option><option value="1">100 %</option></select>
        <select id="stQuality" aria-label="Qualité de l’aperçu"><option value="1">Pleine qualité</option><option value="0.5">1/2</option><option value="0.25">1/4</option></select>
      </div>
      <div class="st-vb-fill"></div>
      <button class="st-ib" data-cmd="guides" title="Grille des tiers (G)" aria-label="Grille des tiers">${ic('grid')}</button>
      <button class="st-ib" data-cmd="safe" title="Zones de sécurité" aria-label="Zones de sécurité">${ic('safe')}</button>
      <button class="st-ib" data-cmd="checker" title="Transparence" aria-label="Afficher la transparence">${ic('checker')}</button>
      <button class="st-ib" data-cmd="still" title="Exporter l’image (PNG)" aria-label="Exporter l’image courante">${ic('photo')}</button>
      <button class="st-ib" data-cmd="full" title="Plein écran (F)" aria-label="Plein écran">${ic('full')}</button>
    </div>
    <div class="st-view" id="stView">
      <div class="st-cwrap" id="stCwrap"><canvas id="stCanvas"></canvas><canvas id="stOverlay"></canvas></div>
    </div>
    <div class="st-transport" id="stTransport">
      <div class="st-tc"><b id="stTc">00:00:00</b><span id="stDur"></span></div>
      <div class="st-tx">
        <button class="st-ib" data-cmd="start" title="Début (Origine)" aria-label="Aller au début">${ic('start')}</button>
        <button class="st-ib" data-cmd="prev" title="Image précédente (←)" aria-label="Image précédente">${ic('prev')}</button>
        <button class="st-play" data-cmd="play" title="Lecture (Espace)" aria-label="Lecture" id="stPlay">${ic('play')}</button>
        <button class="st-ib" data-cmd="next" title="Image suivante (→)" aria-label="Image suivante">${ic('next')}</button>
        <button class="st-ib" data-cmd="end" title="Fin (Fin)" aria-label="Aller à la fin">${ic('end')}</button>
      </div>
      <div class="st-tx-r">
        <button class="st-ib" data-cmd="loop" title="Boucle (L)" aria-label="Lecture en boucle" id="stLoop">${ic('loop')}</button>
        <select id="stSpeed" aria-label="Vitesse"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        <span class="st-fps" id="stFps" title="Images affichées par seconde"></span>
      </div>
    </div>
  </main>
  <aside class="st-insp" id="stInsp" aria-label="Inspecteur"></aside>
  <section class="st-tl" id="stTl" aria-label="Timeline">
    <div class="st-tl-grip" id="stGrip" title="Redimensionner"></div>
    <div class="st-tl-bar">
      <span class="st-tl-title">Timeline</span><span class="st-tl-count" id="stCount"></span>
      <div class="st-vb-fill"></div>
      <button class="st-ib sm" data-cmd="tlfit" title="Ajuster à la durée" aria-label="Ajuster la timeline">${ic('expand')}</button>
      <input type="range" id="stTlZoom" min="20" max="600" step="1" aria-label="Zoom de la timeline">
    </div>
    <div class="st-tl-scroll" id="stTlScroll"><div class="st-tl-grid" id="stTlGrid"></div></div>
  </section>`;
}

function renderAll() {
  renderBar();
  renderTimeline();
  renderInspector();
  syncControls();
  updateTime();
}

function renderBar() {
  const p = P();
  setTitle();
  const st = S.conflict ? 'conflict' : S.saving ? 'saving' : S.dirty ? 'dirty' : 'saved';
  const label = { conflict: 'Version plus récente', saving: 'Enregistrement…', dirty: 'Modifié', saved: 'Enregistré' }[st];
  $('#stBar', S.root).innerHTML = `
    <a class="st-back" href="${p.production ? `#/studio/p/${esc(p.production)}/motions` : '#/studio/motions'}" title="${p.production ? 'Retour à la production' : 'Tous les motions'}" aria-label="Retour">${ic('back')}</a>
    <div class="st-logo" aria-hidden="true"></div>
    <input class="st-name" id="stName" value="${esc(p.name)}" aria-label="Nom du projet" maxlength="80">
    <button class="st-chip" data-cmd="comp" title="Réglages de la composition">${p.width}×${p.height}<i></i>${p.fps} i/s<i></i>${fmt(p.duration)} s</button>
    <div class="st-vb-fill"></div>
    ${S.conflict ? `<div class="st-conflict">Ce projet a été modifié ailleurs.<button class="st-btn sm" data-cmd="reload">Recharger</button><button class="st-btn sm ghost" data-cmd="force">Garder ma version</button></div>` : ''}
    <div class="st-save" data-state="${st}"><i></i><span>${label}</span></div>
    <button class="st-btn sm ghost st-fb-btn${S.fb ? ' on' : ''}" data-cmd="feedback" title="Retours épinglés à l’instant courant (lus par tools/motion.ts feedback)">${ic('chat')}<span>Retours</span>${openFeedback().length ? `<b>${openFeedback().length}</b>` : ''}</button>
    <div class="st-sep"></div>
    <button class="st-ib" data-cmd="undo" title="Annuler (⌘Z)" aria-label="Annuler" ${S.undo.length ? '' : 'disabled'}>${ic('undo')}</button>
    <button class="st-ib" data-cmd="redo" title="Rétablir (⇧⌘Z)" aria-label="Rétablir" ${S.redo.length ? '' : 'disabled'}>${ic('redo')}</button>
    <button class="st-btn primary" data-cmd="export">${ic('download')}<span>Exporter</span></button>`;
}

function syncControls() {
  const r = S.root;
  $('#stZoom', r).value = String(S.zoom);
  $('#stQuality', r).value = String(S.quality);
  $('#stSpeed', r).value = String(S.speed);
  $('#stTlZoom', r).value = S.tlZoom;
  $('#stLoop', r).classList.toggle('on', S.loop);
  for (const k of ['guides', 'safe', 'checker']) $(`[data-cmd=${k}]`, r).classList.toggle('on', S[k]);
  $('#stView', r).classList.toggle('checker', S.checker);
  $('#stInsp', r).classList.toggle('wide', S.wideInsp);
  $('#stDur', r).textContent = ` / ${timecode(P().duration, P().fps)}`;
  r.style.setProperty('--tl-h', `${S.tlH}px`);
}

// =====================================================================
// Viewer
// =====================================================================

let resizeObs;
function applyLayout() {
  const p = P();
  const c = $('#stCanvas', S.root), o = $('#stOverlay', S.root);
  const cw = Math.round(p.width * S.quality), ch = Math.round(p.height * S.quality);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const view = $('#stView', S.root);
  const vr = view.getBoundingClientRect();
  const pad = innerWidth < 900 ? 12 : 28;
  const z = S.zoom === 'fit' ? Math.min((vr.width - pad * 2) / p.width, (vr.height - pad * 2) / p.height) : +S.zoom;
  S.viewScale = Math.max(0.02, z);
  const w = p.width * S.viewScale, h = p.height * S.viewScale;
  const wrap = $('#stCwrap', S.root);
  wrap.style.width = `${w}px`;
  wrap.style.height = `${h}px`;
  view.classList.toggle('scroll', S.zoom !== 'fit');
  const dpr = devicePixelRatio || 1;
  o.width = Math.round(w * dpr);
  o.height = Math.round(h * dpr);
  drawOverlay();
}

function onResize() { applyLayout(); renderRuler(); }

let painting = false, again = false;
function requestPaint() {
  if (!S.root || S.exporting) return;
  if (painting) { again = true; return; }
  paint();
}

async function paint() {
  painting = true;
  try {
    do {
      again = false;
      const t = S.t;
      const bitmaps = await scriptFrames(t);
      if (!S.root) return;
      Object.assign(bitmaps, S.vids.sync(P(), t, { playing: S.playing, rate: S.speed }));
      drawFrame(S.ctx, P(), t, { scale: S.quality, bitmaps, onAsset: requestPaint, transparent: S.checker });
      for (const b of Object.values(bitmaps)) b.close?.();
      drawOverlay();
      countFps();
    } while (again && !S.exporting);
  } finally {
    painting = false;
  }
}

async function scriptFrames(t, project = P()) {
  const items = project.layers.filter((l) => isScript(l) && activeAt(l, t)).map((l) => {
    const dur = Math.max(0.0001, l.out - l.in);
    return { id: l.id, t: t - l.in, time: t, p: clamp((t - l.in) / dur, 0, 1), frame: Math.round(t * project.fps), fps: project.fps, dur, params: resolveParams(l, t),
      still: S.exporting || !S.playing };
  });
  if (!items.length) return {};
  const bitmaps = await S.rt.render(items);
  for (const id of Object.keys(bitmaps)) if (S.errors.has(id) && !S.errors.get(id).sticky) clearError(id);
  return bitmaps;
}

function countFps() {
  const f = S.fps, now = performance.now();
  f.n++;
  if (now - f.at > 500) {
    f.v = Math.round((f.n * 1000) / (now - f.at));
    f.n = 0;
    f.at = now;
    const el = $('#stFps', S.root);
    if (el) el.textContent = S.playing ? `${f.v} i/s` : '';
  }
}

function drawOverlay() {
  const o = S.octx;
  if (!o) return;
  const p = P();
  const dpr = devicePixelRatio || 1;
  const k = S.viewScale * dpr;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, o.canvas.width, o.canvas.height);
  o.setTransform(k, 0, 0, k, 0, 0);
  const px = 1 / k;
  if (S.guides) {
    o.strokeStyle = 'rgba(255,255,255,.28)';
    o.lineWidth = px;
    o.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      o.moveTo(p.width * f, 0); o.lineTo(p.width * f, p.height);
      o.moveTo(0, p.height * f); o.lineTo(p.width, p.height * f);
    }
    o.stroke();
  }
  if (S.safe) {
    o.lineWidth = px;
    o.setLineDash([6 * px, 4 * px]);
    for (const [f, a] of [[0.9, 0.35], [0.8, 0.22]]) {
      o.strokeStyle = `rgba(94,225,214,${a})`;
      o.strokeRect(p.width * (1 - f) / 2, p.height * (1 - f) / 2, p.width * f, p.height * f);
    }
    o.setLineDash([]);
    o.beginPath();
    o.moveTo(p.width / 2 - 14 * px, p.height / 2); o.lineTo(p.width / 2 + 14 * px, p.height / 2);
    o.moveTo(p.width / 2, p.height / 2 - 14 * px); o.lineTo(p.width / 2, p.height / 2 + 14 * px);
    o.strokeStyle = 'rgba(94,225,214,.5)';
    o.stroke();
  }
  const l = selLayer();
  if (l && !A.isAudio(l) && activeAt(l, S.t)) {
    const r = resolve(l, S.t, p);
    const b = boxOf(S.ctx, l, r);
    const m = matrixOf(r);
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
    o.strokeStyle = '#9b8cff';
    o.lineWidth = 1.5 * px;
    o.beginPath();
    pts.forEach((q, i) => (i ? o.lineTo(q.x, q.y) : o.moveTo(q.x, q.y)));
    o.closePath();
    o.stroke();
    const hs = 7 * px;
    o.fillStyle = '#ffffff';
    for (const q of pts) { o.fillRect(q.x - hs / 2, q.y - hs / 2, hs, hs); o.strokeRect(q.x - hs / 2, q.y - hs / 2, hs, hs); }
    o.beginPath();
    o.arc(r.x, r.y, 4 * px, 0, Math.PI * 2);
    o.moveTo(r.x - 9 * px, r.y); o.lineTo(r.x + 9 * px, r.y);
    o.moveTo(r.x, r.y - 9 * px); o.lineTo(r.x, r.y + 9 * px);
    o.stroke();
    S.handles = pts;
  } else S.handles = null;
}

function compPoint(e) {
  const r = $('#stOverlay', S.root).getBoundingClientRect();
  return { x: (e.clientX - r.left) / S.viewScale, y: (e.clientY - r.top) / S.viewScale };
}

function viewerPointer(e) {
  if (e.button !== 0 || S.exporting) return;
  const pt = compPoint(e);
  const o = e.currentTarget;
  // Corner handle: uniform scale around the anchor.
  const tol = 9 / S.viewScale;
  const hi = S.handles?.findIndex((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < tol) ?? -1;
  let l = selLayer();
  let mode = 'move';
  if (hi >= 0 && l) mode = 'scale';
  else {
    l = hitTest(S.ctx, P(), S.t, pt.x, pt.y);
    select(l?.id || null);
    if (!l) return;
  }
  const r0 = resolve(l, S.t, P());
  const d0 = Math.hypot(pt.x - r0.x, pt.y - r0.y) || 1;
  beginGesture();
  o.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const q = compPoint(ev);
    if (mode === 'move') {
      let dx = q.x - pt.x, dy = q.y - pt.y;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      setProp(l, 'x', Math.round(r0.x + dx));
      setProp(l, 'y', Math.round(r0.y + dy));
    } else {
      const s = Math.hypot(q.x - r0.x, q.y - r0.y) / d0;
      setProp(l, 'scale', round(Math.max(0.01, r0.scale * s), 3));
    }
    changed({ light: true });
  };
  const up = () => {
    o.removeEventListener('pointermove', move);
    o.removeEventListener('pointerup', up);
    o.removeEventListener('pointercancel', up);
    endGesture();
    renderTimeline();
  };
  o.addEventListener('pointermove', move);
  o.addEventListener('pointerup', up);
  o.addEventListener('pointercancel', up);
}

function viewerHover(e) {
  if (!S.handles || e.buttons) return;
  const pt = compPoint(e);
  const tol = 9 / S.viewScale;
  const onHandle = S.handles.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < tol);
  e.currentTarget.style.cursor = onHandle ? 'nwse-resize' : '';
}

// =====================================================================
// Playback and time
// =====================================================================

function setTime(t, { paint = true } = {}) {
  S.t = clamp(t, 0, P().duration);
  updateTime();
  if (paint) requestPaint();
}

function updateTime() {
  if (!S.root) return;
  $('#stTc', S.root).textContent = timecode(S.t, P().fps);
  const ph = $('#stPh', S.root);
  if (ph) ph.style.transform = `translateX(${S.t * S.tlZoom}px)`;
  const corner = $('.tl-corner span', S.root);
  if (corner) corner.textContent = timecode(S.t, P().fps);
  if (!S.playing) updateInspectorValues();
}

function play() {
  if (S.playing) return;
  if (S.t >= P().duration - halfFrame()) S.t = 0;
  S.playing = true;
  S.lastTick = performance.now();
  S.fps = { n: 0, at: performance.now(), v: 0 };
  $('#stPlay', S.root).innerHTML = ic('pause');
  $('#stPlay', S.root).setAttribute('aria-label', 'Pause');
  S.root.classList.add('playing');
  startSound();
  const tick = (now) => {
    if (!S.playing) return;
    const dt = Math.min(0.1, (now - S.lastTick) / 1000) * S.speed;
    S.lastTick = now;
    // With sound, the audio clock leads so picture and sound stay in sync.
    let t = (S.sound ? A.clockTime() : null) ?? S.t + dt;
    if (t >= P().duration) {
      if (S.loop) { t %= P().duration; S.t = t; startSound(); }
      else { setTime(P().duration); stop(); return; }
    }
    setTime(t);
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}

function stop() {
  if (!S.playing) return;
  S.playing = false;
  cancelAnimationFrame(S.raf);
  A.stopAll();
  S.vids?.pause();
  S.sound = false;
  if (!S.root) return;
  $('#stPlay', S.root).innerHTML = ic('play');
  $('#stPlay', S.root).setAttribute('aria-label', 'Lecture');
  S.root.classList.remove('playing');
  $('#stFps', S.root).textContent = '';
  setTime(frameT(S.t));
}

const toggle = () => (S.playing ? stop() : play());

/** (Re)starts the soundtrack at the playhead while playing. */
function startSound() {
  S.sound = S.playing && A.audibleLayers(P()).length > 0;
  if (S.sound) A.play(P(), S.t, S.speed); else A.stopAll();
}

function soundLoaded() {
  if (!S.root) return;
  renderTimeline();
  const l = selLayer();
  if (l && A.isAudio(l) && !S.ce) renderInspector();
  if (S.playing) startSound();
}

function videoLoaded(id) {
  if (!S.root) return;
  renderTimeline();
  if (id === S.sel && !S.ce) renderInspector();
}

function scrubSound(t) {
  if (A.audibleLayers(P()).length) A.scrub(P(), t);
}

/**
 * Keeps a sound or video clip on its file after a trim: moving the in point moves the start in
 * the file (props.offset), and the out point cannot go past the end of the file.
 */
function fitSound(l, in0, off0) {
  if (!A.isAudio(l) && !V.isVideo(l)) return;
  let off = off0 + (l.in - in0);
  if (off < 0) { l.in = round(l.in - off, 4); off = 0; }
  l.props.offset = round(off, 4);
  const dur = A.isAudio(l) ? A.bufferOf(l.props.src)?.duration : S.vids.duration(l);
  if (dur) l.out = Math.max(l.in + 1 / P().fps, Math.min(l.out, frameT(l.in + dur - off)));
}

// =====================================================================
// Mutations, history, autosave
// =====================================================================

function snapshot() { return JSON.stringify(P()); }

function pushUndo(snap) {
  S.undo.push(snap);
  if (S.undo.length > 120) S.undo.shift();
  S.redo = [];
}

/** Wraps a mutation: one undo step, coalesced for repeated edits of the same field. */
function mutate(fn, coalesceKey = null) {
  const now = performance.now();
  const merge = coalesceKey && S.coalesce?.key === coalesceKey && now - S.coalesce.at < 1200;
  const before = merge || S.gesture ? null : snapshot();
  fn();
  if (before && before !== snapshot()) pushUndo(before);
  S.coalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
}

function beginGesture() { S.gesture = snapshot(); }
function endGesture() {
  const before = S.gesture;
  S.gesture = null;
  if (before && before !== snapshot()) { pushUndo(before); renderBar(); }
}

function undo() {
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  S.project = JSON.parse(S.undo.pop());
  afterHistory();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  S.project = JSON.parse(S.redo.pop());
  afterHistory();
}
function afterHistory() {
  if (!selLayer()) S.sel = null;
  S.key = null;
  changed({ structure: true });
}

/** Everything that must follow a change of the document. */
function changed({ structure = false, light = false, inspector = false } = {}) {
  S.dirty = true;
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(() => save(), 900);
  if (structure) { renderTimeline(); renderInspector(); applyLayout(); syncControls(); }
  else if (!light) renderTimeline();
  if (inspector) renderInspector();
  else updateInspectorValues();
  renderBar();
  S.rt.sync(P(), S.quality).then(() => requestPaint());
  ensureFonts(P(), requestPaint);
  A.preload(P(), soundLoaded);
  if (S.playing && !light) startSound();
  requestPaint();
}

async function save(force = false) {
  if (!S.id || (!S.dirty && !force)) return;
  if (S.saving) { S.saveTimer = setTimeout(() => save(force), 400); return; }
  clearTimeout(S.saveTimer);
  S.saving = true;
  if (S.root) renderBar();
  const body = { ...P() };
  delete body.id; delete body.rev; delete body.updated_at; delete body.updated_by;
  if (!S.conflict || force !== 'overwrite') body.base_rev = S.rev;
  if (force === 'overwrite') delete body.base_rev;
  try {
    const res = await H.api(`/api/studio/projects/${S.id}`, { method: 'PUT', body });
    S.rev = res.rev;
    S.dirty = false;
    S.conflict = false;
    if (Date.now() - S.posterAt > 20000) setTimeout(() => S.root && savePoster(), 300);
  } catch (e) {
    if (/récente/.test(e.message)) S.conflict = true;
    else H.toast(`Enregistrement impossible : ${e.message}`);
  } finally {
    S.saving = false;
    if (S.root) renderBar();
    const ev = S.pendingEvent;
    S.pendingEvent = null;
    if (ev && S.root) remoteUpdate(ev);
  }
}

/** Gallery poster: the frame at mid-duration, small JPEG, saved with the project. */
async function savePoster() {
  if (!S.root || S.exporting) return;
  S.posterAt = Date.now();
  const p = P();
  const t = p.poster_time ?? p.duration * 0.5;
  const w = 480, h = Math.round((480 * p.height) / p.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const bitmaps = { ...await scriptFrames(t), ...await S.vexp.seek(p, t) };
  if (!S.root) return;
  drawFrame(c.getContext('2d'), p, t, { scale: w / p.width, bitmaps });
  for (const b of Object.values(bitmaps)) b.close?.();
  const poster = c.toDataURL('image/jpeg', 0.82);
  if (poster === p.poster) return;
  p.poster = poster;
  S.dirty = true;
  save();
}

function onBeforeUnload(e) {
  if (S.dirty) { save(true); e.preventDefault(); }
}

// ---------- Property helpers ----------

function bagOf(l, bag) { return bag === 'params' ? (l.params ||= {}) : (l.props ||= {}); }
function currentValue(l, key, bag) {
  return bag === 'params' ? resolveParams(l, S.t)[key] : resolve(l, S.t, P())[key];
}
const keyIndexAt = (arr, t) => arr.findIndex((k) => Math.abs(k.t - t) < halfFrame());

/** Sets a property; on an animated property it writes a keyframe at the playhead. */
function setProp(l, key, value, bag = 'props') {
  const obj = bagOf(l, bag);
  const cur = obj[key];
  if (isAnimated(cur)) {
    const t = frameT(S.t);
    const i = keyIndexAt(cur, t);
    if (i >= 0) cur[i].v = value;
    else {
      const prev = [...cur].reverse().find((k) => k.t < t);
      cur.push({ t, v: value, e: prev?.e || 'inOutCubic' });
      cur.sort((a, b) => a.t - b.t);
    }
  } else obj[key] = value;
}

function toggleKey(l, key, bag = 'props', all = false) {
  const obj = bagOf(l, bag);
  const cur = obj[key];
  const t = frameT(S.t);
  if (all) { if (isAnimated(cur)) obj[key] = currentValue(l, key, bag); return; }
  if (!isAnimated(cur)) { obj[key] = [{ t, v: currentValue(l, key, bag), e: 'inOutCubic' }]; return; }
  const i = keyIndexAt(cur, t);
  if (i >= 0) {
    const [k] = cur.splice(i, 1);
    if (!cur.length) obj[key] = k.v;
  } else setProp(l, key, currentValue(l, key, bag), bag);
}

function shiftLayer(l, dt) {
  l.in += dt;
  l.out += dt;
  for (const bag of [l.props, l.params]) {
    for (const k in bag || {}) if (isAnimated(bag[k])) bag[k].forEach((kf) => (kf.t = round(kf.t + dt, 4)));
  }
}

function keyTimes(l) {
  const set = new Set();
  for (const bag of [l.props, l.params]) for (const k in bag || {}) if (isAnimated(bag[k])) bag[k].forEach((kf) => set.add(kf.t));
  return [...set].sort((a, b) => a - b);
}

function animatedProps(l) {
  const out = [];
  for (const bag of ['props', 'params']) for (const k in l[bag] || {}) if (isAnimated(l[bag][k])) out.push({ bag, key: k });
  return out;
}

function propLabel(l, key, bag) {
  if (bag === 'params') return key;
  return SCHEMA[l.type]?.find((d) => d.key === key)?.label || key;
}

// ---------- Layer commands ----------

function select(id, key = null) {
  const changedSel = id !== S.sel;
  S.sel = id;
  S.key = key;
  if (changedSel) { S.ce = null; renderInspector(); }
  else if (key) renderInspector();
  renderTimeline();
  drawOverlay();
}

function addLayer(kind) {
  if (kind === 'sound') { soundLibrary(); return; }
  if (kind === 'video') { videoPicker(); return; }
  const p = P();
  const type = ['ellipse', 'star'].includes(kind) ? 'shape' : kind;
  const l = defaultLayer(type, p);
  if (kind === 'ellipse') { l.props.shape = 'ellipse'; l.props.radius = 0; l.name = 'Ellipse'; l.props.fill = '#5ee1d6'; }
  if (kind === 'star') { l.props.shape = 'star'; l.props.sides = 5; l.name = 'Étoile'; l.props.fill = '#ffb547'; }
  if (kind === 'shape') l.name = 'Rectangle';
  l.in = frameT(S.t >= p.duration - 0.1 ? 0 : S.t);
  l.out = p.duration;
  let n = 1;
  const base = l.name;
  while (p.layers.some((x) => x.name === l.name)) l.name = `${base} ${++n}`;
  if (type === 'image') {
    const src = prompt('Adresse de l’image (URL, ou /media/... après tools/motion.ts media) :', '');
    if (!src) return;
    l.props.src = src.trim();
  }
  mutate(() => p.layers.unshift(l));
  S.sel = l.id;
  S.key = null;
  S.ce = null;
  changed({ structure: true });
}

function duplicateLayer() {
  const l = selLayer();
  if (!l) return;
  const c = JSON.parse(JSON.stringify(l));
  c.id = 'l' + Math.random().toString(36).slice(2, 8);
  c.name = `${l.name} copie`;
  mutate(() => P().layers.splice(P().layers.indexOf(l), 0, c));
  S.sel = c.id;
  changed({ structure: true });
}

function deleteSelection() {
  const l = selLayer();
  if (!l) return;
  if (S.key) {
    const { bag, key, i } = S.key;
    mutate(() => {
      const arr = bagOf(l, bag)[key];
      if (!isAnimated(arr)) return;
      const [k] = arr.splice(i, 1);
      if (!arr.length) bagOf(l, bag)[key] = k.v;
    });
    S.key = null;
    changed({ inspector: true });
    return;
  }
  mutate(() => P().layers.splice(P().layers.indexOf(l), 1));
  S.sel = null;
  changed({ structure: true });
}

// =====================================================================
// Timeline
// =====================================================================

function fitTimeline() {
  const sc = $('#stTlScroll', S.root);
  const w = (sc?.clientWidth || 900) - nameW() - 40;
  S.tlZoom = clamp(Math.floor(w / P().duration), 20, 600);
}

function timelineRows() {
  const rows = [];
  for (const l of P().layers) {
    rows.push({ l });
    if (l.id === S.sel) for (const a of animatedProps(l)) rows.push({ l, sub: a });
  }
  return rows;
}

function renderTimeline() {
  if (!S.root) return;
  const p = P();
  const z = S.tlZoom;
  const width = p.duration * z;
  const rows = timelineRows();
  const grid = $('#stTlGrid', S.root);
  $('#stCount', S.root).textContent = `${p.layers.length} calque${p.layers.length > 1 ? 's' : ''}`;
  grid.style.setProperty('--tl-w', `${width}px`);
  grid.style.setProperty('--name-w', `${nameW()}px`);
  const html = rows.map(({ l, sub }) => {
    const hue = TYPES[l.type]?.hue ?? 260;
    const on = l.id === S.sel;
    if (sub) {
      const arr = l[sub.bag][sub.key];
      return `<div class="tl-row sub" style="--h:${hue}">
        <div class="tl-name"><span class="tl-sub-l">${esc(propLabel(l, sub.key, sub.bag))}</span>
          <button class="tl-kbtn on" data-kf="${esc(sub.key)}" data-bag="${sub.bag}" title="Image clé au temps courant" aria-label="Basculer l’image clé">${ic('key')}</button></div>
        <div class="tl-lane">${arr.map((k, i) => `<button class="tl-key ${S.key && S.key.key === sub.key && S.key.bag === sub.bag && S.key.i === i ? 'sel' : ''} e-${esc(k.e || 'linear')}"
          style="left:${k.t * z}px" data-key="${i}" data-prop="${esc(sub.key)}" data-bag="${sub.bag}" data-layer="${esc(l.id)}"
          title="${fmt(k.t)} s · ${esc(EASE_LABELS[k.e] || k.e || 'Linéaire')}" aria-label="Image clé à ${fmt(k.t)} s"></button>`).join('')}</div>
      </div>`;
    }
    const err = S.errors.has(l.id);
    return `<div class="tl-row ${on ? 'sel' : ''} ${l.hidden ? 'off' : ''}" data-layer="${esc(l.id)}" style="--h:${hue}">
      <div class="tl-name" data-drag="${esc(l.id)}">
        <button class="tl-vis" data-vis="${esc(l.id)}" aria-label="${l.hidden ? 'Afficher' : 'Masquer'}" title="${l.hidden ? 'Afficher' : 'Masquer'}">${ic(l.hidden ? 'eyeOff' : 'eye')}</button>
        <span class="tl-type">${ic(TYPE_ICON[l.type] || 'rect')}</span>
        <span class="tl-label" title="${esc(l.name)}">${esc(l.name)}</span>
        ${err ? '<span class="tl-err" title="Erreur de script"></span>' : ''}
        <button class="tl-lock ${l.locked ? 'on' : ''}" data-lock="${esc(l.id)}" aria-label="${l.locked ? 'Déverrouiller' : 'Verrouiller'}" title="${l.locked ? 'Déverrouiller' : 'Verrouiller'}">${ic(l.locked ? 'lock' : 'unlock')}</button>
      </div>
      <div class="tl-lane">
        <div class="tl-clip ${err || (A.isAudio(l) && A.hasFailed(l.props?.src)) || (V.isVideo(l) && S.vids.failed(l)) ? 'err' : ''} ${A.isAudio(l) ? 'snd' : ''}" data-clip="${esc(l.id)}" style="left:${l.in * z}px;width:${Math.max(4, (l.out - l.in) * z)}px">
          ${A.isAudio(l) ? `<canvas class="tl-wave" data-wave="${esc(l.id)}"></canvas>` : ''}
          <i class="tl-h in" data-trim="in"></i><span>${esc(l.name)}</span>
          ${keyTimes(l).map((t) => `<b style="left:${(t - l.in) * z}px"></b>`).join('')}
          <i class="tl-h out" data-trim="out"></i>
        </div>
      </div>
    </div>`;
  }).join('');
  grid.innerHTML = `
    <div class="tl-top"><div class="tl-corner"><span>${timecode(S.t, p.fps)}</span></div><div class="tl-ruler" id="stRuler"><canvas></canvas></div></div>
    <div class="tl-rows">${html || `<div class="tl-empty">Ajoute un calque avec la barre d’outils à gauche, ou fais écrire le JSON par ton agent IA (docs/format.md).</div>`}
      <div class="tl-end" style="left:calc(var(--name-w) + ${width}px)"></div>
      <div class="tl-ph" id="stPh" style="transform:translateX(${S.t * z}px)"><i></i></div>
    </div>`;
  renderRuler();
  for (const c of $$('[data-wave]', grid)) { const l = layerById(c.dataset.wave); if (l) A.drawWave(c, l, 'rgba(255,255,255,.5)'); }
  updateTime();
}

function renderRuler() {
  const ruler = $('#stRuler', S.root);
  if (!ruler) return;
  const c = $('canvas', ruler);
  const p = P();
  const z = S.tlZoom;
  const w = Math.ceil(p.duration * z) + 1, h = 26;
  const dpr = devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr;
  c.style.width = `${w}px`; c.style.height = `${h}px`;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const cs = getComputedStyle(S.root);
  g.fillStyle = cs.getPropertyValue('--st-faint');
  g.strokeStyle = cs.getPropertyValue('--st-line-2');
  g.font = '500 10px ui-monospace, "SF Mono", Menlo, monospace';
  // Major step in seconds so labels stay ~70px apart; minor ticks per frame when zoomed in.
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const major = steps.find((s) => s * z >= 70) || 60;
  const minor = major / (major * z > 160 && p.fps * major <= 60 ? p.fps * major : 5);
  g.beginPath();
  for (let t = 0, i = 0; t <= p.duration + 1e-6; t = ++i * minor) {
    const x = Math.round(t * z) + 0.5;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    g.moveTo(x, h); g.lineTo(x, isMajor ? 8 : h - 5);
    if (isMajor) g.fillText(t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${fmt(round(t, 1))}s`, x + 4, 15);
  }
  g.stroke();
  // Open feedback pinned to an instant: a small flag above the ticks.
  g.fillStyle = cs.getPropertyValue('--st-key');
  for (const c of openFeedback()) {
    const at = feedbackTime(c);
    if (at == null) continue;
    const x = Math.round(at * z) + 0.5;
    g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x, 6); g.closePath(); g.fill();
  }
}

// =====================================================================
// Feedback, pinned to an instant (`motion:<id>@<t>`)
// =====================================================================

const openFeedback = () => (S.id ? comments.openOf(null, `motion:${S.id}`) : []);
const feedbackTime = (c) => { const at = c.target.split('@')[1]; return at == null ? null : +at; };

function toggleFeedback() {
  S.fb = !S.fb;
  $('.st-fb', S.root)?.remove();
  if (S.fb) {
    const el = document.createElement('aside');
    el.className = 'st-fb';
    el.innerHTML = `<div class="st-fb-head"><b>Retours</b><button class="st-ib sm" data-cmd="feedback" aria-label="Fermer">${ic('close')}</button></div>
      <p class="st-note">Un retour est épinglé à l’instant de la tête de lecture. Clique sur l’instant pour y revenir.</p><div class="st-fb-body"></div>`;
    S.root.append(el);
    comments.mount($('.st-fb-body', el), H, {
      production: P().production || '', target: () => `motion:${S.id}@${round(frameT(S.t), 2)}`,
      filter: (c) => c.target === `motion:${S.id}` || c.target.startsWith(`motion:${S.id}@`),
      labels: true, names: { [`motion:${S.id}`]: 'Instant' },
      onTarget: (c) => { const at = feedbackTime(c); if (at != null) { stop(); setTime(at); } },
      placeholder: 'Ce qu’il faut changer ici…', empty: 'Aucun retour sur ce motion.',
    });
    $('.st-fb-body textarea', el)?.focus();
  }
  renderBar();
}

/** Comment events relayed by home.js. */
export function onFeedback() {
  if (!S.root) return;
  renderBar();
  renderRuler();
}

function laneTime(e) {
  const grid = $('#stTlGrid', S.root);
  const r = grid.getBoundingClientRect();
  return (e.clientX - r.left - nameW()) / S.tlZoom;
}

function snapTime(t, l, threshold) {
  const p = P();
  const cands = [0, p.duration, S.t, ...p.layers.filter((x) => x !== l).flatMap((x) => [x.in, x.out])];
  let best = null;
  for (const c of cands) if (Math.abs(c - t) < threshold && (best == null || Math.abs(c - t) < Math.abs(best - t))) best = c;
  return best ?? frameT(t);
}

function timelinePointer(e) {
  if (e.button !== 0 || S.exporting) return;
  const tgt = e.target;
  const scroller = $('#stTlScroll', S.root);
  const capture = (move, up) => {
    scroller.setPointerCapture(e.pointerId);
    const mv = (ev) => move(ev);
    const end = (ev) => {
      scroller.removeEventListener('pointermove', mv);
      scroller.removeEventListener('pointerup', end);
      scroller.removeEventListener('pointercancel', end);
      up?.(ev);
    };
    scroller.addEventListener('pointermove', mv);
    scroller.addEventListener('pointerup', end);
    scroller.addEventListener('pointercancel', end);
  };

  if (tgt.closest('.tl-ruler, .tl-corner')) {
    stop();
    const scrub = (ev) => { setTime(frameT(laneTime(ev))); scrubSound(S.t); };
    scrub(e);
    capture(scrub);
    return;
  }
  const vis = tgt.closest('[data-vis]');
  if (vis) { const l = layerById(vis.dataset.vis); mutate(() => (l.hidden = !l.hidden)); changed(); return; }
  const lock = tgt.closest('[data-lock]');
  if (lock) { const l = layerById(lock.dataset.lock); mutate(() => (l.locked = !l.locked)); changed(); return; }
  const kbtn = tgt.closest('[data-kf]');
  if (kbtn) { const l = selLayer(); mutate(() => toggleKey(l, kbtn.dataset.kf, kbtn.dataset.bag)); changed({ inspector: true }); return; }

  const key = tgt.closest('.tl-key');
  if (key) {
    const l = layerById(key.dataset.layer);
    const ref = { bag: key.dataset.bag, key: key.dataset.prop, i: +key.dataset.key };
    S.key = ref;
    const arr = l[ref.bag][ref.key];
    const kf = arr[ref.i];
    setTime(kf.t);
    renderInspector();
    renderTimeline();
    const x0 = e.clientX, t0 = kf.t;
    beginGesture();
    let moved = false;
    capture((ev) => {
      const dt = (ev.clientX - x0) / S.tlZoom;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      kf.t = clamp(frameT(t0 + dt), 0, P().duration);
      arr.sort((a, b) => a.t - b.t);
      S.key = { ...ref, i: arr.indexOf(kf) };
      setTime(kf.t, { paint: false });
      changed({ light: true });
      renderTimeline();
    }, () => { endGesture(); renderInspector(); });
    return;
  }

  const clip = tgt.closest('.tl-clip');
  if (clip) {
    const l = layerById(clip.dataset.clip);
    if (S.sel !== l.id) select(l.id);
    const trim = tgt.dataset.trim;
    const x0 = e.clientX, in0 = l.in, out0 = l.out, off0 = A.offsetOf(l);
    const thr = 8 / S.tlZoom;
    beginGesture();
    capture((ev) => {
      const dt = (ev.clientX - x0) / S.tlZoom;
      if (trim === 'in') l.in = clamp(ev.altKey ? frameT(in0 + dt) : snapTime(in0 + dt, l, thr), 0, l.out - 1 / P().fps);
      else if (trim === 'out') l.out = clamp(ev.altKey ? frameT(out0 + dt) : snapTime(out0 + dt, l, thr), l.in + 1 / P().fps, P().duration);
      if (trim) fitSound(l, in0, off0);
      else {
        let ni = frameT(in0 + dt);
        if (!ev.altKey) {
          const si = snapTime(in0 + dt, l, thr), so = snapTime(out0 + dt, l, thr);
          if (Math.abs(si - (in0 + dt)) <= thr && si !== frameT(in0 + dt)) ni = si;
          else if (Math.abs(so - (out0 + dt)) <= thr && so !== frameT(out0 + dt)) ni = so - (out0 - in0);
        }
        shiftLayer(l, round(ni - l.in, 4));
      }
      changed({ light: true });
      renderTimeline();
    }, () => { endGesture(); renderInspector(); });
    return;
  }

  const name = tgt.closest('[data-drag]');
  if (name) {
    const l = layerById(name.dataset.drag);
    select(l.id);
    const y0 = e.clientY;
    const from = P().layers.indexOf(l);
    let to = from;
    const rowsEl = $$('.tl-row:not(.sub)', S.root);
    capture((ev) => {
      if (Math.abs(ev.clientY - y0) < 4) return;
      to = clamp(from + Math.round((ev.clientY - y0) / ROW_H), 0, P().layers.length - 1);
      rowsEl.forEach((r, i) => r.classList.toggle('drop', i === to && to !== from));
      rowsEl[from]?.classList.add('lift');
    }, () => {
      rowsEl.forEach((r) => r.classList.remove('drop', 'lift'));
      if (to === from) return;
      mutate(() => { const arr = P().layers; arr.splice(from, 1); arr.splice(to, 0, l); });
      changed({ structure: true });
    });
    return;
  }

  if (tgt.closest('.tl-lane')) {
    stop();
    S.key = null;
    setTime(frameT(laneTime(e)));
    scrubSound(S.t);
    capture((ev) => { setTime(frameT(laneTime(ev))); scrubSound(S.t); });
  }
}

function timelineDblClick(e) {
  const label = e.target.closest('.tl-label');
  if (!label) return;
  const l = layerById(label.closest('[data-layer]').dataset.layer);
  label.contentEditable = 'plaintext-only';
  label.focus();
  document.getSelection().selectAllChildren(label);
  const done = (ok) => {
    label.contentEditable = 'false';
    const v = label.textContent.trim();
    if (ok && v && v !== l.name) { mutate(() => (l.name = v)); changed({ inspector: true }); } else label.textContent = l.name;
  };
  label.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); label.blur(); }
    if (ev.key === 'Escape') { label.textContent = l.name; label.blur(); }
  });
  label.addEventListener('blur', () => done(true), { once: true });
}

function timelineWheel(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const sc = $('#stTlScroll', S.root);
  const r = sc.getBoundingClientRect();
  const x = e.clientX - r.left - nameW() + sc.scrollLeft;
  const t = x / S.tlZoom;
  setTlZoom(S.tlZoom * Math.exp(-e.deltaY * 0.004));
  sc.scrollLeft = t * S.tlZoom - (e.clientX - r.left - nameW());
}

function setTlZoom(z) {
  S.tlZoom = clamp(Math.round(z), 20, 600);
  $('#stTlZoom', S.root).value = S.tlZoom;
  renderTimeline();
}

// =====================================================================
// Inspector
// =====================================================================

function diamond(l, key, bag) {
  const v = l[bag]?.[key];
  const anim = isAnimated(v);
  const at = anim && keyIndexAt(v, frameT(S.t)) >= 0;
  const st = at ? 'at' : anim ? 'anim' : '';
  return `<button class="kf ${st}" data-kf="${esc(key)}" data-bag="${bag}" title="${anim ? 'Ajouter ou retirer une image clé (⌥ clic : supprimer l’animation)' : 'Animer cette propriété'}" aria-label="Image clé : ${esc(key)}">${ic('key')}</button>`;
}

function kfNav(l, key, bag) {
  const v = l[bag]?.[key];
  if (!isAnimated(v)) return '';
  return `<span class="kf-nav"><button data-kfnav="-1" data-k="${esc(key)}" data-bag="${bag}" aria-label="Image clé précédente">${ic('prev')}</button><button data-kfnav="1" data-k="${esc(key)}" data-bag="${bag}" aria-label="Image clé suivante">${ic('next')}</button></span>`;
}

function fieldHTML(l, d, bag = 'props') {
  const v = currentValue(l, d.key, bag);
  const id = `f-${bag}-${d.key}`;
  const attrs = `data-field="${esc(d.key)}" data-bag="${bag}" id="${id}"`;
  let input;
  if (d.kind === 'num') {
    input = `<input class="st-num" ${attrs} value="${esc(fmt(v ?? 0))}" inputmode="decimal" data-step="${d.step ?? 1}" ${d.min != null ? `data-min="${d.min}"` : ''} ${d.max != null ? `data-max="${d.max}"` : ''}>${d.unit ? `<em>${esc(d.unit)}</em>` : ''}`;
  } else if (d.kind === 'color') {
    const has = !!v;
    input = `<span class="st-color ${has ? '' : 'none'}"><input type="color" ${attrs} value="${esc(has ? String(v).slice(0, 7) : '#000000')}" aria-label="${esc(d.label)}">
      <input class="st-hex" data-hex="${esc(d.key)}" data-bag="${bag}" value="${esc(has ? v : '')}" placeholder="Aucun" spellcheck="false" aria-label="${esc(d.label)} (hex)"></span>`;
  } else if (d.kind === 'select') {
    input = `<select ${attrs}>${d.options.map((o) => `<option value="${esc(o)}" ${String(v) === o ? 'selected' : ''}>${esc(OPTION_LABELS[o] || o)}</option>`).join('')}</select>`;
  } else if (d.kind === 'bool') {
    input = `<input type="checkbox" class="st-check" ${attrs} ${v ? 'checked' : ''}>`;
  } else if (d.kind === 'textarea') {
    input = `<textarea ${attrs} rows="${Math.min(5, String(v ?? '').split('\n').length + 1)}">${esc(v ?? '')}</textarea>`;
  } else {
    input = `<input ${attrs} value="${esc(v ?? '')}" spellcheck="false">`;
  }
  return `<div class="st-prop k-${d.kind}">${d.anim ? diamond(l, d.key, bag) : '<span class="kf-ph"></span>'}
    <label for="${id}" class="${d.kind === 'num' ? 'scrub' : ''}" data-scrub="${d.kind === 'num' ? esc(d.key) : ''}" data-bag="${bag}">${esc(d.label)}</label>
    <div class="st-in">${input}</div>${d.anim ? kfNav(l, d.key, bag) : ''}</div>`;
}

const OPTION_LABELS = {
  center: 'Centré', left: 'Gauche', right: 'Droite', rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygone', star: 'Étoile', line: 'Ligne',
  cover: 'Remplir', contain: 'Contenir', fill: 'Étirer', rise: 'Montée', fade: 'Fondu', scale: 'Zoom', blur: 'Flou', type: 'Machine à écrire',
};

function paramDef(key, v) {
  const sample = isAnimated(v) ? v[0].v : v;
  if (typeof sample === 'number') return { key, label: key, kind: 'num', step: Math.abs(sample) >= 10 ? 1 : 0.01, anim: true };
  if (typeof sample === 'boolean') return { key, label: key, kind: 'bool' };
  if (/^#[0-9a-f]{3,8}$/i.test(String(sample))) return { key, label: key, kind: 'color', anim: true };
  return { key, label: key, kind: 'text' };
}

function easeCurve(e) {
  const f = EASES[e] || EASES.linear;
  let d = '';
  for (let i = 0; i <= 40; i++) { const x = i / 40; d += `${i ? 'L' : 'M'}${(x * 100).toFixed(1)},${(70 - f(x) * 50).toFixed(1)}`; }
  return `<svg class="st-curve" viewBox="0 -10 100 90" preserveAspectRatio="none" aria-hidden="true"><path class="g" d="M0,70H100M0,20H100"/><path d="${d}"/></svg>`;
}

function renderInspector() {
  if (!S.root) return;
  const el = $('#stInsp', S.root);
  const l = selLayer();
  if (!l) { el.innerHTML = compInspectorHTML(); S.ce = null; return; }
  const hue = TYPES[l.type]?.hue ?? 260;
  const groups = new Map();
  for (const d of SCHEMA[l.type] || []) {
    if (l.type === 'shape' && d.key === 'sides' && !['polygon', 'star'].includes(resolve(l, S.t, P()).shape)) continue;
    if (l.type === 'shape' && d.key === 'radius' && resolve(l, S.t, P()).shape !== 'rect') continue;
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group).push(d);
  }
  let keyPanel = '';
  if (S.key) {
    const arr = l[S.key.bag]?.[S.key.key];
    const k = isAnimated(arr) ? arr[S.key.i] : null;
    if (k) {
      const last = S.key.i === arr.length - 1;
      keyPanel = `<section class="st-sec key">
        <h4>${ic('key')} Image clé · ${esc(propLabel(l, S.key.key, S.key.bag))}</h4>
        <div class="st-prop"><span class="kf-ph"></span><label>Temps</label><div class="st-in"><input class="st-num" data-keytime value="${esc(fmt(k.t))}" inputmode="decimal"><em>s</em></div></div>
        ${last ? '<p class="st-note">Dernière image clé : l’interpolation se règle sur la précédente.</p>' : `
        <div class="st-prop"><span class="kf-ph"></span><label>Interpolation</label><div class="st-in"><select data-keyease>${Object.keys(EASES).map((e) => `<option value="${e}" ${(k.e || 'linear') === e ? 'selected' : ''}>${esc(EASE_LABELS[e])}</option>`).join('')}</select></div></div>
        <div class="st-curve-wrap">${easeCurve(k.e || 'linear')}</div>`}
      </section>`;
    }
  }
  const scriptPanel = isScript(l) ? `
    <section class="st-sec">
      <h4>Paramètres <button class="st-mini" data-cmd="addparam" title="Ajouter un paramètre">${ic('plus')}</button></h4>
      ${Object.keys(l.params || {}).length ? Object.entries(l.params).map(([k, v]) => fieldHTML(l, paramDef(k, v), 'params')).join('') : '<p class="st-note">Les paramètres sont lus dans le script avec <code>s.params</code> et s’animent comme les autres propriétés.</p>'}
    </section>
    <section class="st-sec code">
      <h4>${ic('code')} Script <span class="st-code-state" id="stCodeState"></span>
        <button class="st-mini" data-cmd="widecode" title="${S.wideInsp ? 'Réduire' : 'Agrandir'} l’éditeur">${ic('expand')}</button></h4>
      <div class="st-code" id="stCode"></div>
      <div class="st-err" id="stErr" hidden></div>
      <div class="st-logs" id="stLogs" hidden></div>
      <p class="st-note">Modifs appliquées en direct. <kbd>⌘</kbd><kbd>↵</kbd> pour forcer, <kbd>⌘</kbd><kbd>/</kbd> pour commenter.</p>
    </section>` : '';
  el.innerHTML = `
    <div class="st-insp-head" style="--h:${hue}">
      <span class="st-badge">${ic(TYPE_ICON[l.type] || 'rect')}${esc(TYPES[l.type]?.label || l.type)}</span>
      <input class="st-lname" data-lname value="${esc(l.name)}" aria-label="Nom du calque">
      <button class="st-ib sm" data-cmd="dup" title="Dupliquer (⌘D)" aria-label="Dupliquer le calque">${ic('copy')}</button>
      <button class="st-ib sm danger" data-cmd="del" title="Supprimer (⌫)" aria-label="Supprimer le calque">${ic('trash')}</button>
    </div>
    <div class="st-insp-body">
      ${keyPanel}
      <section class="st-sec">
        <h4>Calque</h4>
        <div class="st-prop"><span class="kf-ph"></span><label>Entrée</label><div class="st-in"><input class="st-num" data-lprop="in" value="${esc(fmt(l.in))}" inputmode="decimal"><em>s</em></div></div>
        <div class="st-prop"><span class="kf-ph"></span><label>Sortie</label><div class="st-in"><input class="st-num" data-lprop="out" value="${esc(fmt(l.out))}" inputmode="decimal"><em>s</em></div></div>
        ${is3d(l) ? `<div class="st-prop"><span class="kf-ph"></span><label>Rendu</label><div class="st-in"><select data-lprop="engine">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}" ${engineOf(l) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>` : ''}
        ${A.isAudio(l) ? '' : `<div class="st-prop"><span class="kf-ph"></span><label>Fusion</label><div class="st-in"><select data-lprop="blend">${Object.entries(BLEND_LABELS).map(([k, v]) => `<option value="${k}" ${(l.blend || 'normal') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>`}
      </section>
      ${scriptPanel}
      ${[...groups].map(([g, defs]) => `<section class="st-sec"><h4>${esc(g)}</h4>${defs.map((d) => fieldHTML(l, d)).join('')}</section>`).join('')}
      ${A.isAudio(l) ? soundPanelHTML(l) : ''}
      ${V.isVideo(l) ? videoPanelHTML(l) : ''}
    </div>`;
  if (isScript(l)) mountCode(l);
}

function soundPanelHTML(l) {
  const buf = A.bufferOf(l.props?.src);
  const state = A.hasFailed(l.props?.src) ? 'Fichier illisible ou introuvable' : buf ? `Fichier de ${fmt(round(buf.duration, 2))} s` : 'Chargement…';
  return `<section class="st-sec">
      <h4>Fichier</h4>
      <p class="st-note">${esc(state)}. « Décalage » choisit où le fichier commence ; le volume s’anime en images clés ; l’œil de la timeline coupe le son.</p>
      <div class="st-snd-acts"><button class="st-btn sm" data-cmd="replacesound">${ic('sound')}Remplacer le son</button></div>
    </section>`;
}

function videoPanelHTML(l) {
  const dur = S.vids.duration(l);
  const state = S.vids.failed(l) ? 'Fichier illisible ou introuvable' : dur ? `Fichier de ${fmt(round(dur, 2))} s` : 'Chargement…';
  return `<section class="st-sec">
      <h4>Fichier</h4>
      <p class="st-note">${esc(state)}. « Décalage » choisit l’instant de la vidéo montré à l’entrée du calque ; rogner le début du clip l’avance aussi.</p>
      <div class="st-snd-acts"><button class="st-btn sm" data-cmd="replacevideo">${ic('video')}Changer de vidéo</button></div>
    </section>`;
}

function compInspectorHTML() {
  const p = P();
  return `
    <div class="st-insp-head"><span class="st-badge comp">${ic('comp')}Composition</span></div>
    <div class="st-insp-body">
      <section class="st-sec">
        <h4>Format</h4>
        <div class="st-presets sm">${PRESETS.map((x) => `<button class="st-preset ${x.w === p.width && x.h === p.height ? 'on' : ''}" data-preset="${x.w}x${x.h}" title="${x.w}×${x.h}"><i style="aspect-ratio:${x.w}/${x.h}"></i><b>${x.label}</b></button>`).join('')}</div>
        <div class="st-prop"><span class="kf-ph"></span><label>Largeur</label><div class="st-in"><input class="st-num" data-comp="width" value="${p.width}" inputmode="numeric"><em>px</em></div></div>
        <div class="st-prop"><span class="kf-ph"></span><label>Hauteur</label><div class="st-in"><input class="st-num" data-comp="height" value="${p.height}" inputmode="numeric"><em>px</em></div></div>
        <div class="st-prop"><span class="kf-ph"></span><label>Cadence</label><div class="st-in"><select data-comp="fps">${[24, 25, 30, 50, 60].map((f) => `<option value="${f}" ${f === p.fps ? 'selected' : ''}>${f} i/s</option>`).join('')}</select></div></div>
        <div class="st-prop"><span class="kf-ph"></span><label>Durée</label><div class="st-in"><input class="st-num" data-comp="duration" value="${fmt(p.duration)}" inputmode="decimal"><em>s</em></div></div>
        <div class="st-prop k-color"><span class="kf-ph"></span><label>Fond</label><div class="st-in"><span class="st-color"><input type="color" data-comp="background" value="${esc(String(p.background).slice(0, 7))}" aria-label="Fond"><input class="st-hex" data-comp="background" value="${esc(p.background)}" spellcheck="false" aria-label="Fond (hex)"></span></div></div>
      </section>
      <section class="st-sec"${S.prods?.length || p.production ? '' : ' hidden'}>
        <h4>Production</h4>
        <div class="st-prop"><span class="kf-ph"></span><label>Rattaché à</label><div class="st-in"><select data-comp="production">
          <option value="">Aucune (motion seul)</option>
          ${(S.prods || []).map((x) => `<option value="${esc(x.id)}" ${p.production === x.id ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}
          ${p.production && !(S.prods || []).some((x) => x.id === p.production) ? `<option value="${esc(p.production)}" selected>${esc(p.production)}</option>` : ''}
        </select></div></div>
      </section>
      <section class="st-sec">
        <h4>Projet</h4>
        <dl class="st-dl">
          <dt>Calques</dt><dd>${p.layers.length}</dd>
          <dt>Scripts</dt><dd>${p.layers.filter(isScript).length}</dd>
          <dt>Révision</dt><dd>${S.rev}</dd>
          <dt>Modifié</dt><dd>${p.updated_at ? `${relTime(p.updated_at)} · ${esc(byLabel(p.updated_by))}` : '-'}</dd>
          <dt>Identifiant</dt><dd><code>${esc(S.id)}</code></dd>
        </dl>
      </section>
      <section class="st-sec tips">
        <h4>Raccourcis utiles</h4>
        <ul class="st-keys">
          <li><kbd>Espace</kbd> Lecture</li><li><kbd>←</kbd><kbd>→</kbd> Image par image</li>
          <li><kbd>I</kbd><kbd>O</kbd> Entrée, sortie du calque</li><li><kbd>K</kbd> Image clé sur la position</li>
          <li><kbd>⌘</kbd><kbd>Z</kbd> Annuler</li><li><kbd>?</kbd> Tous les raccourcis</li>
        </ul>
      </section>
    </div>`;
}

let codeTimer = 0;
function mountCode(l) {
  const host = $('#stCode', S.root);
  const apply = (src) => {
    let err = null;
    try { new Function('s', src); } catch (e) { err = e; } // eslint-disable-line no-new-func
    const state = $('#stCodeState', S.root);
    if (err) {
      showCodeError({ message: err.message, line: null, syntax: true });
      if (state) { state.textContent = 'Syntaxe'; state.dataset.s = 'err'; }
      return;
    }
    if (l.code === src) return;
    mutate(() => (l.code = src), `code-${l.id}`);
    clearError(l.id);
    S.logs.delete(l.id);
    if (state) { state.textContent = 'Appliqué'; state.dataset.s = 'ok'; }
    changed({ light: true });
  };
  S.ce = codeEditor(host, l.code || '', {
    onChange: (src) => {
      const state = $('#stCodeState', S.root);
      if (state) { state.textContent = '…'; state.dataset.s = ''; }
      clearTimeout(codeTimer);
      codeTimer = setTimeout(() => apply(src), 650);
    },
    onApply: (src) => { clearTimeout(codeTimer); apply(src); },
  });
  S.ceLayer = l.id;
  const e = S.errors.get(l.id);
  if (e) showCodeError(e);
  renderLogs();
}

function showCodeError(e) {
  const box = $('#stErr', S.root);
  if (!box) return;
  if (!e) { box.hidden = true; S.ce?.setError(null); return; }
  box.hidden = false;
  box.textContent = `${e.line ? `Ligne ${e.line} · ` : ''}${e.message}`;
  S.ce?.setError(e.line || null);
}

function onScriptError(m) {
  if (!m.id) { H.toast(`Runtime : ${m.message}`); return; }
  const had = S.errors.get(m.id);
  S.errors.set(m.id, m);
  if (m.id === S.sel && S.ceLayer === m.id) {
    showCodeError(m);
    const st = $('#stCodeState', S.root);
    if (st) { st.textContent = 'Erreur'; st.dataset.s = 'err'; }
  }
  if (!had) renderTimeline();
}

function clearError(id) {
  if (!S.errors.delete(id)) return;
  if (id === S.sel) showCodeError(null);
  renderTimeline();
}

function onScriptLog(m) {
  const arr = S.logs.get(m.id) || [];
  arr.push(m.text);
  if (arr.length > 30) arr.shift();
  S.logs.set(m.id, arr);
  if (m.id === S.sel) renderLogs();
}

function renderLogs() {
  const box = $('#stLogs', S.root);
  if (!box) return;
  const arr = S.logs.get(S.sel) || [];
  box.hidden = !arr.length;
  box.innerHTML = arr.slice(-8).map((t) => `<div>${esc(t)}</div>`).join('');
}

/** Refreshes field values and keyframe states for the playhead, without rebuilding. */
function updateInspectorValues() {
  if (!S.root) return;
  const l = selLayer();
  const el = $('#stInsp', S.root);
  if (!l) return;
  const r = resolve(l, S.t, P());
  const pr = resolveParams(l, S.t);
  for (const f of $$('[data-field]', el)) {
    if (f === document.activeElement) continue;
    const v = f.dataset.bag === 'params' ? pr[f.dataset.field] : r[f.dataset.field];
    if (f.type === 'checkbox') f.checked = !!v;
    else if (f.type === 'color') f.value = v ? String(v).slice(0, 7) : '#000000';
    else f.value = f.classList.contains('st-num') ? fmt(v ?? 0) : v ?? '';
  }
  for (const h of $$('[data-hex]', el)) {
    if (h === document.activeElement) continue;
    const v = h.dataset.bag === 'params' ? pr[h.dataset.hex] : r[h.dataset.hex];
    h.value = v || '';
    h.closest('.st-color').classList.toggle('none', !v);
  }
  for (const b of $$('.kf[data-kf]', el)) {
    const v = l[b.dataset.bag]?.[b.dataset.kf];
    const anim = isAnimated(v);
    b.classList.toggle('anim', anim);
    b.classList.toggle('at', anim && keyIndexAt(v, frameT(S.t)) >= 0);
  }
  for (const b of $$('.tl-kbtn', S.root)) {
    const v = l[b.dataset.bag]?.[b.dataset.kf];
    b.classList.toggle('at', isAnimated(v) && keyIndexAt(v, frameT(S.t)) >= 0);
  }
}

function parseField(f, raw) {
  if (f.classList.contains('st-num')) {
    let v = num(raw);
    if (Number.isNaN(v)) return undefined;
    if (f.dataset.min != null) v = Math.max(+f.dataset.min, v);
    if (f.dataset.max != null) v = Math.min(+f.dataset.max, v);
    return v;
  }
  if (f.type === 'checkbox') return f.checked;
  return raw;
}

// 3D layers: the same script API on two renderers. The script is kept as it is when switching:
// ShaderMaterial and onBeforeCompile only run on WebGL (r170), node materials and TSL only on r187.
const is3d = (l) => l.type === 'three' || l.type === 'three-gpu';
const ENGINES = { three: 'WebGL · r170', gpu: 'WebGPU · r187', 'gpu-webgl': 'WebGL 2 · r187' };
const engineOf = (l) => (l.type === 'three' ? 'three' : l.backend === 'webgl' ? 'gpu-webgl' : 'gpu');

function inspectorInput(e) {
  const f = e.target;
  const l = selLayer();
  if (f.dataset.field != null && l) {
    const v = parseField(f, f.value);
    if (v === undefined) return;
    const live = f.type === 'color' || f.tagName === 'TEXTAREA' || f.tagName === 'SELECT' || f.type === 'checkbox' || e.type === 'change';
    if (!live && f.classList.contains('st-num') && e.type === 'input') return;
    mutate(() => setProp(l, f.dataset.field, v, f.dataset.bag), `f-${l.id}-${f.dataset.bag}-${f.dataset.field}`);
    const rebuild = ['shape'].includes(f.dataset.field) || (f.dataset.field === 'w' && isScript(l));
    changed({ inspector: rebuild });
  } else if (f.dataset.hex != null && l && (e.type === 'change' || /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(f.value))) {
    const v = f.value.trim();
    mutate(() => setProp(l, f.dataset.hex, v || '', f.dataset.bag), `f-${l.id}-${f.dataset.bag}-${f.dataset.hex}`);
    changed();
  } else if (f.dataset.lname != null && l) {
    mutate(() => (l.name = f.value), `name-${l.id}`);
    changed();
  } else if (f.dataset.lprop && l && e.type === 'change') {
    const k = f.dataset.lprop;
    const in0 = l.in, off0 = A.offsetOf(l);
    mutate(() => {
      if (k === 'blend') l.blend = f.value === 'normal' ? undefined : f.value;
      else if (k === 'engine') { l.type = f.value === 'three' ? 'three' : 'three-gpu'; l.backend = f.value === 'gpu-webgl' ? 'webgl' : undefined; }
      else {
        const v = num(f.value);
        if (Number.isNaN(v)) return;
        if (k === 'in') l.in = clamp(frameT(v), 0, l.out - 1 / P().fps);
        else l.out = clamp(frameT(v), l.in + 1 / P().fps, P().duration);
        fitSound(l, in0, off0);
      }
    });
    changed({ inspector: true });
  } else if (f.dataset.comp && (e.type === 'change' || f.type === 'color')) {
    const k = f.dataset.comp;
    mutate(() => {
      const p = P();
      if (k === 'background') { if (/^#[0-9a-f]{3,8}$/i.test(f.value.trim())) p.background = f.value.trim(); }
      else if (k === 'production') p.production = f.value;
      else {
        const v = num(f.value);
        if (Number.isNaN(v)) return;
        if (k === 'duration') {
          p.duration = clamp(v, 0.1, 600);
          for (const l2 of p.layers) { l2.out = Math.min(l2.out, p.duration); l2.in = Math.min(l2.in, l2.out - 1 / p.fps); }
        } else if (k === 'fps') p.fps = clamp(Math.round(v), 1, 120);
        else p[k] = clamp(Math.round(v), 16, 7680);
      }
    }, `comp-${k}`);
    if (k === 'duration') fitTimeline();
    if (k === 'production') renderBar();
    changed({ structure: true });
  } else if (f.dataset.keytime != null && l && S.key && e.type === 'change') {
    const arr = l[S.key.bag][S.key.key];
    const k = arr[S.key.i];
    const v = num(f.value);
    if (Number.isNaN(v)) return;
    mutate(() => { k.t = clamp(frameT(v), 0, P().duration); arr.sort((a, b) => a.t - b.t); });
    S.key.i = arr.indexOf(k);
    setTime(k.t);
    changed({ inspector: true });
  } else if (f.dataset.keyease != null && l && S.key) {
    const k = l[S.key.bag][S.key.key][S.key.i];
    mutate(() => (k.e = f.value));
    changed({ inspector: true });
  }
}

function inspectorKey(e) {
  const f = e.target;
  if (!f.classList?.contains('st-num')) return;
  if (e.key === 'Enter') { f.blur(); return; }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const step = +(f.dataset.step || 1) * (e.shiftKey ? 10 : 1) * (e.altKey ? 0.1 : 1);
  const v = num(f.value) + (e.key === 'ArrowUp' ? step : -step);
  f.value = fmt(round(v, 4));
  f.dispatchEvent(new Event('change', { bubbles: true }));
}

function inspectorPointer(e) {
  const lbl = e.target.closest('label.scrub');
  if (!lbl || e.button !== 0) return;
  const l = selLayer();
  const key = lbl.dataset.scrub, bag = lbl.dataset.bag;
  const input = $(`#f-${bag}-${key}`, S.root);
  if (!l || !input) return;
  e.preventDefault();
  const x0 = e.clientX;
  const v0 = num(input.value) || 0;
  const step = +(input.dataset.step || 1);
  let moved = false;
  beginGesture();
  lbl.setPointerCapture(e.pointerId);
  document.body.classList.add('st-scrubbing');
  const move = (ev) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 2) return;
    moved = true;
    let v = v0 + dx * step * (ev.shiftKey ? 10 : 1) * (ev.altKey ? 0.1 : 1);
    if (input.dataset.min != null) v = Math.max(+input.dataset.min, v);
    if (input.dataset.max != null) v = Math.min(+input.dataset.max, v);
    v = round(v, step < 1 ? 3 : 1);
    input.value = fmt(v);
    setProp(l, key, v, bag);
    changed({ light: true });
  };
  const up = () => {
    lbl.removeEventListener('pointermove', move);
    lbl.removeEventListener('pointerup', up);
    document.body.classList.remove('st-scrubbing');
    endGesture();
    if (moved) renderTimeline(); else input.focus();
  };
  lbl.addEventListener('pointermove', move);
  lbl.addEventListener('pointerup', up);
}

// =====================================================================
// Commands
// =====================================================================

async function command(cmd, el, e) {
  const l = selLayer();
  switch (cmd) {
    case 'play': toggle(); break;
    case 'start': stop(); setTime(0); break;
    case 'end': stop(); setTime(P().duration); break;
    case 'prev': stop(); setTime(frameT(S.t) - 1 / P().fps); break;
    case 'next': stop(); setTime(frameT(S.t) + 1 / P().fps); break;
    case 'loop': S.loop = !S.loop; savePrefs(); syncControls(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'guides': case 'safe': case 'checker':
      S[cmd] = !S[cmd]; savePrefs(); syncControls(); drawOverlay(); requestPaint(); break;
    case 'full': {
      const st = $('#stStage', S.root);
      if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen?.().catch(() => {});
      break;
    }
    case 'comp': select(null); break;
    case 'dup': duplicateLayer(); break;
    case 'del': S.key = null; deleteSelection(); break;
    case 'tlfit': fitTimeline(); setTlZoom(S.tlZoom); break;
    case 'export': exportDialog(); break;
    case 'still': exportStill(); break;
    case 'help': helpDialog(); break;
    case 'feedback': toggleFeedback(); break;
    case 'replacesound': if (l && A.isAudio(l)) soundLibrary(l); break;
    case 'replacevideo': if (l && V.isVideo(l)) videoPicker(l); break;
    case 'reload': reload('Version du serveur chargée'); break;
    case 'force': S.conflict = false; save('overwrite'); break;
    case 'widecode': S.wideInsp = !S.wideInsp; savePrefs(); syncControls(); setTimeout(onResize, 260); break;
    case 'addparam': {
      if (!l) break;
      const name = prompt('Nom du paramètre (lettres, chiffres, _) :', '');
      if (!name || !/^[A-Za-z_]\w*$/.test(name.trim())) break;
      const raw = prompt('Valeur initiale (nombre, couleur #rrggbb, ou texte) :', '1');
      if (raw == null) break;
      const v = /^-?\d+([.,]\d+)?$/.test(raw.trim()) ? num(raw) : raw.trim();
      mutate(() => ((l.params ||= {})[name.trim()] = v));
      changed({ inspector: true });
      break;
    }
    default:
      if (el?.dataset.kf != null && l) {
        mutate(() => toggleKey(l, el.dataset.kf, el.dataset.bag, e?.altKey));
        changed({ inspector: true });
      }
  }
}

function jumpKey(l, key, bag, dir) {
  const arr = l[bag]?.[key];
  if (!isAnimated(arr)) return;
  const t = frameT(S.t);
  const k = dir > 0 ? arr.find((x) => x.t > t + 1e-6) : [...arr].reverse().find((x) => x.t < t - 1e-6);
  if (k) { stop(); setTime(k.t); }
}

function onKey(e) {
  if (!S.root || S.exporting || $('.st-modal-wrap')) return;
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); return; }
  if (mod && e.key.toLowerCase() === 'd' && !typing) { e.preventDefault(); duplicateLayer(); return; }
  if (typing || mod) return;
  const fps = P().fps;
  const l = selLayer();
  switch (e.key) {
    case ' ': e.preventDefault(); toggle(); break;
    case 'ArrowLeft': e.preventDefault(); stop(); setTime(frameT(S.t) - (e.shiftKey ? 10 : 1) / fps); break;
    case 'ArrowRight': e.preventDefault(); stop(); setTime(frameT(S.t) + (e.shiftKey ? 10 : 1) / fps); break;
    case 'Home': stop(); setTime(0); break;
    case 'End': stop(); setTime(P().duration); break;
    case 'Backspace': case 'Delete': e.preventDefault(); deleteSelection(); break;
    case 'Escape': if (S.key) { S.key = null; renderInspector(); renderTimeline(); } else select(null); break;
    case 'l': case 'L': command('loop'); break;
    case 'g': case 'G': command('guides'); break;
    case 'f': case 'F': command('full'); break;
    case 't': case 'T': addLayer('text'); break;
    case 'r': case 'R': addLayer('shape'); break;
    case 'e': case 'E': addLayer('ellipse'); break;
    case '?': helpDialog(); break;
    case '0': S.zoom = 'fit'; syncControls(); applyLayout(); break;
    case 'i': case 'I': if (l) { const in0 = l.in, off0 = A.offsetOf(l); mutate(() => { l.in = clamp(frameT(S.t), 0, l.out - 1 / fps); fitSound(l, in0, off0); }); changed({ inspector: true }); } break;
    case 'o': case 'O': if (l) { mutate(() => { l.out = clamp(frameT(S.t), l.in + 1 / fps, P().duration); fitSound(l, l.in, A.offsetOf(l)); }); changed({ inspector: true }); } break;
    case 's': case 'S': soundLibrary(); break;
    case 'k': case 'K': if (l && !A.isAudio(l)) { mutate(() => { for (const k of ['x', 'y']) if (!isAnimated(l.props[k]) || keyIndexAt(l.props[k], frameT(S.t)) < 0) toggleKey(l, k); }); changed({ inspector: true }); } break;
    case 'j': case 'J': if (l) { const ts = keyTimes(l).filter((t) => t < frameT(S.t) - 1e-6); if (ts.length) { stop(); setTime(ts.at(-1)); } } break;
    case 'u': case 'U': if (l) { const ts = keyTimes(l).filter((t) => t > frameT(S.t) + 1e-6); if (ts.length) { stop(); setTime(ts[0]); } } break;
    default: return;
  }
}

function helpDialog() {
  const rows = [
    ['Lecture', [['Espace', 'Lecture, pause'], ['← →', 'Image précédente, suivante'], ['⇧ ← →', '10 images'], ['Origine Fin', 'Début, fin'], ['L', 'Boucle'], ['J U', 'Image clé précédente, suivante du calque']]],
    ['Édition', [['T R E', 'Texte, rectangle, ellipse'], ['S', 'Sons et SFX'], ['I O', 'Entrée, sortie du calque au temps courant'], ['K', 'Image clé de position'], ['⌘ D', 'Dupliquer'], ['⌫', 'Supprimer le calque ou l’image clé'], ['⌘ Z  ⇧⌘Z', 'Annuler, rétablir'], ['⌘ S', 'Enregistrer maintenant']]],
    ['Vue', [['0', 'Ajuster la vue'], ['G', 'Grille des tiers'], ['F', 'Plein écran'], ['⌘ molette', 'Zoom de la timeline'], ['⇧ glisser', 'Déplacement contraint'], ['⌥ glisser', 'Sans magnétisme']]],
  ];
  modal(`<div class="st-modal-head"><h3>Raccourcis clavier</h3><button type="button" class="st-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <div class="st-help">${rows.map(([g, list]) => `<div><h5>${g}</h5>${list.map(([k, d]) => `<div class="st-hk"><span>${k.split(' ').filter(Boolean).map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</span><em>${esc(d)}</em></div>`).join('')}</div>`).join('')}</div>`, 'wide');
}

// ---------- Sound library ----------

let sfxIndex = null; // Promise of /sfx/index.json (DATA_DIR/sfx, see docs/sfx.md)
const durLabel = (d) => (d >= 60 ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : `${fmt(round(d, 1))} s`);

/** Browses the sound library and adds a sound at the playhead (or replaces `target`'s file). */
async function soundLibrary(target = null) {
  stop();
  const pr = prefs();
  const preview = new Audio();
  let index = null, failed = null, cat = pr.sfxCat || null, query = '';
  const { wrap, close } = modal(`
    <div class="st-modal-head"><h3>${target ? 'Remplacer le son' : 'Sons et SFX'}</h3><button type="button" class="st-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <div class="sfx">
      <nav class="sfx-cats" id="sfxCats" aria-label="Catégories"></nav>
      <div class="sfx-main">
        <div class="sfx-tools">
          <label class="sfx-search">${ic('search')}<input type="search" id="sfxQ" placeholder="Rechercher : whoosh, impact, clic…" aria-label="Rechercher un son" autocomplete="off"></label>
          <label class="st-btn sm sfx-import" title="Importer un son depuis l’appareil">${ic('upload')}<span>Importer</span><input type="file" accept="audio/*" id="sfxFile" hidden></label>
        </div>
        <div class="sfx-list" id="sfxList" role="list"><p class="st-note">Chargement de la bibliothèque…</p></div>
      </div>
    </div>
    <p class="st-note">${target ? 'Le nouveau son garde la place, le volume et les fondus du calque.' : `Ajouté à ${timecode(S.t, P().fps)}, à sa durée réelle.`} Clique sur un son pour l’écouter.</p>`, 'wide sfx-modal', () => { preview.pause(); preview.src = ''; });

  const all = () => (index?.packs || []).flatMap((p) => p.categories.map((c) => ({ p, c, key: `${p.id}/${c.id}` })));
  const norm = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const playing = () => (preview.paused ? null : preview.dataset.src);

  const drawCats = () => {
    const el = $('#sfxCats', wrap);
    if (!index) { el.innerHTML = ''; return; }
    el.innerHTML = index.packs.map((p) => `<div class="sfx-pack"><h5>${esc(p.name)}</h5>${p.categories.map((c) => {
      const key = `${p.id}/${c.id}`;
      return `<button class="sfx-cat ${!query && key === cat ? 'on' : ''}" data-cat="${esc(key)}">${esc(c.name)}<i>${c.items.length}</i></button>`;
    }).join('')}</div>`).join('');
  };
  const drawList = () => {
    const el = $('#sfxList', wrap);
    if (failed) { el.innerHTML = `<p class="st-note">${esc(failed)}</p>`; return; }
    if (!index) return;
    const words = norm(query).split(/\s+/).filter(Boolean);
    const groups = words.length
      ? all().map((g) => ({ ...g, items: g.c.items.filter((it) => words.every((w) => norm(`${g.p.name} ${g.c.name} ${it.name}`).includes(w))) })).filter((g) => g.items.length)
      : all().filter((g) => g.key === cat).map((g) => ({ ...g, items: g.c.items }));
    const rows = groups.flatMap((g) => g.items.map((it) => ({ it, where: words.length ? `${g.p.name} · ${g.c.name}` : '' })));
    el.innerHTML = rows.length ? rows.slice(0, 300).map(({ it, where }) => `
      <div class="sfx-row ${playing() === it.src ? 'on' : ''}" role="listitem" data-src="${esc(it.src)}" data-name="${esc(it.name)}" data-dur="${it.dur}">
        <button class="sfx-play" data-preview aria-label="Écouter ${esc(it.name)}">${ic(playing() === it.src ? 'pause' : 'play')}</button>
        <span class="sfx-name">${esc(it.name)}${where ? `<em>${esc(where)}</em>` : ''}</span>
        <span class="sfx-dur">${durLabel(it.dur)}</span>
        <button class="st-btn sm" data-pick>${target ? 'Choisir' : 'Ajouter'}</button>
      </div>`).join('') : `<p class="st-note">${words.length ? 'Aucun son ne correspond.' : 'Choisis une catégorie.'}</p>`;
  };

  const pick = async (item) => {
    close();
    let dur = +item.dur || 0;
    if (!dur) dur = (await A.load(item.src))?.duration || P().duration;
    addSound(item, dur, target);
  };

  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) {
      cat = c.dataset.cat; query = ''; $('#sfxQ', wrap).value = '';
      const p2 = prefs(); p2.sfxCat = cat;
      try { localStorage.setItem('hub.studio', JSON.stringify(p2)); } catch { /* private mode */ }
      drawCats(); drawList(); $('#sfxList', wrap).scrollTop = 0;
      return;
    }
    const row = e.target.closest('.sfx-row');
    if (!row) return;
    const item = { src: row.dataset.src, name: row.dataset.name, dur: +row.dataset.dur };
    if (e.target.closest('[data-pick]')) { pick(item); return; }
    if (playing() === item.src) preview.pause();
    else { preview.src = item.src; preview.dataset.src = item.src; preview.currentTime = 0; preview.play().catch(() => {}); }
  });
  wrap.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.sfx-row');
    if (row && !e.target.closest('button')) pick({ src: row.dataset.src, name: row.dataset.name, dur: +row.dataset.dur });
  });
  preview.addEventListener('play', drawList);
  preview.addEventListener('pause', drawList);
  preview.addEventListener('ended', drawList);
  $('#sfxQ', wrap).addEventListener('input', (e) => { query = e.target.value; drawCats(); drawList(); });
  $('#sfxQ', wrap).addEventListener('keydown', (e) => e.stopPropagation());
  $('#sfxFile', wrap).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('#sfxList', wrap).innerHTML = `<p class="st-note">Envoi de ${esc(file.name)}…</p>`;
    try {
      const res = await fetch('/api/media', { method: 'POST', body: file, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const buf = await A.load(data.url);
      if (!buf) throw new Error('Ce fichier ne se lit pas comme un son.');
      pick({ src: data.url, name: file.name.replace(/\.[^.]+$/, ''), dur: buf.duration });
    } catch (err) {
      H.toast(err.message);
      drawList();
    }
  });

  sfxIndex ||= H.api('/sfx/index.json').catch((e) => { sfxIndex = null; throw e; });
  try {
    index = await sfxIndex;
    if (!all().some((g) => g.key === cat)) cat = all()[0]?.key || null;
  } catch {
    failed = 'Bibliothèque de sons absente (voir docs/sfx.md). Tu peux importer un son depuis l’appareil.';
  }
  drawCats();
  drawList();
  if (innerWidth >= 900) $('#sfxQ', wrap).focus();
}

function addSound(item, dur, target) {
  const p = P();
  if (target) {
    mutate(() => {
      target.props.src = item.src;
      target.props.offset = 0;
      target.name = item.name;
      target.out = Math.min(p.duration, Math.max(target.in + 1 / p.fps, frameT(target.in + dur)));
    });
    changed({ structure: true });
    return;
  }
  const l = defaultLayer('audio', p);
  l.name = item.name;
  l.props.src = item.src;
  l.in = frameT(S.t >= p.duration - 0.05 ? 0 : S.t);
  l.out = Math.min(p.duration, Math.max(l.in + 1 / p.fps, frameT(l.in + dur)));
  // Sounds go under the picture layers, like audio tracks in an editing tool.
  mutate(() => p.layers.push(l));
  S.sel = l.id;
  S.key = null;
  S.ce = null;
  changed({ structure: true });
}

// ---------- Video picker ----------

/** Picks a video among the assets (or uploads one) and adds it at the playhead, or replaces `target`'s file. */
async function videoPicker(target = null) {
  stop();
  const prod = P().production || '';
  let list = null, failed = null;
  const { wrap, close } = modal(`
    <div class="st-modal-head"><h3>${target ? 'Changer de vidéo' : 'Ajouter une vidéo'}</h3><button type="button" class="st-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <div class="vp-tools">
      <label class="st-btn sm sfx-import" title="Envoyer une vidéo depuis l’appareil (rush, capture d’écran)">${ic('upload')}<span>Importer</span><input type="file" accept="video/*" id="vpFile" hidden></label>
      <form class="vp-url" id="vpUrl"><input name="src" placeholder="ou une adresse : /media/….mp4" spellcheck="false" aria-label="Adresse de la vidéo"><button class="st-btn sm">Utiliser</button></form>
    </div>
    <div class="vp-list" id="vpList"><p class="st-note">Chargement des assets…</p></div>
    <p class="st-note">${prod ? 'Vidéos de la production et de la bibliothèque commune.' : 'Toutes les vidéos des assets.'} ${target ? 'Le calque garde sa place et ses réglages.' : `Ajoutée à ${timecode(S.t, P().fps)}, à sa durée réelle.`}</p>`, 'wide vp-modal');
  const draw = () => {
    const el = $('#vpList', wrap);
    if (failed) { el.innerHTML = `<p class="st-note">${esc(failed)}</p>`; return; }
    if (!list) return;
    el.innerHTML = list.length ? `<div class="vp-grid">${list.map((a) => `<button class="vp-card ${target?.props?.src === a.src ? 'on' : ''}" data-id="${a.id}" title="${esc(a.name || a.src)}">
        <span class="vp-thumb">${a.poster ? `<img src="${esc(a.poster)}" alt="" loading="lazy">` : `<video src="${esc(a.src)}#t=0.5" muted preload="metadata"></video>`}${a.meta?.dur ? `<em>${durLabel(a.meta.dur)}</em>` : ''}</span>
        <span class="vp-name">${esc(a.name || 'Sans nom')}</span></button>`).join('')}</div>`
      : '<p class="st-note">Aucune vidéo dans les assets. Importe un rush ou une capture d’écran.</p>';
  };
  const pick = (a) => { close(); addVideo({ src: a.src, name: a.name || 'Vidéo', dur: +a.meta?.dur || 0, w: +a.meta?.w || 0, h: +a.meta?.h || 0 }, target); };
  wrap.addEventListener('click', (e) => {
    const card = e.target.closest('.vp-card');
    if (card) pick(list.find((a) => a.id === +card.dataset.id));
  });
  $('#vpUrl', wrap).addEventListener('submit', (e) => {
    e.preventDefault();
    const src = e.target.src.value.trim();
    if (src) { close(); addVideo({ src, name: src.split('/').pop().replace(/\.[^.]+$/, '') || 'Vidéo' }, target); }
  });
  $('#vpUrl input', wrap).addEventListener('keydown', (e) => e.stopPropagation());
  $('#vpFile', wrap).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('#vpList', wrap).innerHTML = `<p class="st-note">Envoi de ${esc(file.name)}…</p>`;
    const [a] = await assets.upload([file], prod, H);
    if (a?.kind === 'video') pick(a);
    else { if (a) H.toast('Ce fichier n’est pas une vidéo.'); draw(); }
  });
  try {
    const got = prod
      ? (await Promise.all([H.api(`/api/assets?production=${encodeURIComponent(prod)}`), H.api('/api/assets?production=')])).flat()
      : await H.api('/api/assets');
    list = got.filter((a) => a.kind === 'video' && a.src);
  } catch (err) {
    failed = err.message;
  }
  draw();
}

/** Adds a video layer at the playhead (fitted inside the frame), or swaps `target`'s file. */
async function addVideo(item, target) {
  const p = P();
  let { dur = 0, w = 0, h = 0 } = item;
  if (!dur || !w) {
    // Not catalogued: read the file's size and length first.
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.src = item.src;
    const ok = await new Promise((r) => { v.onloadedmetadata = () => r(true); v.onerror = () => r(false); });
    if (!ok) { H.toast('Cette vidéo ne se lit pas dans le navigateur.'); return; }
    dur = v.duration; w = v.videoWidth; h = v.videoHeight;
    v.removeAttribute('src');
  }
  if (!Number.isFinite(dur) || dur <= 0) dur = p.duration;
  if (target) {
    mutate(() => {
      target.props.src = item.src;
      target.props.offset = 0;
      target.name = item.name;
      target.out = Math.min(p.duration, Math.max(target.in + 1 / p.fps, frameT(target.in + dur)));
    });
    changed({ structure: true });
    return;
  }
  const l = defaultLayer('video', p);
  l.name = item.name;
  l.props.src = item.src;
  if (w && h) {
    const r = Math.min(p.width / w, p.height / h);
    l.props.w = Math.round(w * r);
    l.props.h = Math.round(h * r);
  }
  l.in = frameT(S.t >= p.duration - 0.05 ? 0 : S.t);
  l.out = Math.min(p.duration, Math.max(l.in + 1 / p.fps, frameT(l.in + dur)));
  mutate(() => p.layers.unshift(l));
  S.sel = l.id;
  S.key = null;
  S.ce = null;
  changed({ structure: true });
}

function modal(html, cls = '', onClose = null) {
  const wrap = document.createElement('div');
  wrap.className = 'st-modal-wrap studio-ui';
  wrap.innerHTML = `<div class="st-modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc_, true); onClose?.(); };
  const esc_ = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc_, true);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  return { wrap, close };
}

// =====================================================================
// Export
// =====================================================================

function pickMime() {
  const c = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return c.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || null;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportStill() {
  stop();
  const prevQ = S.quality;
  if (prevQ !== 1) { S.quality = 1; applyLayout(); await S.rt.sync(P(), 1); }
  await S.vids.seek(P(), S.t);
  await paint();
  $('#stCanvas', S.root).toBlob((b) => {
    download(b, `${slug(P().name)}-${timecode(S.t, P().fps).replaceAll(':', '-')}.png`);
    H.toast('Image exportée');
  }, 'image/png');
  if (prevQ !== 1) { S.quality = prevQ; applyLayout(); await S.rt.sync(P(), prevQ); requestPaint(); }
}

function exportDialog() {
  stop();
  const mime = pickMime();
  const p = P();
  const webcodecs = 'VideoEncoder' in window;
  const heard = A.audibleLayers(p).filter((l) => !A.hasFailed(l.props.src)).length;
  const ext = webcodecs || mime?.startsWith('video/mp4') ? 'MP4 (H.264)' : 'WebM';
  const { wrap, close } = modal(`
    <div class="st-modal-head"><h3>Exporter la vidéo</h3><button type="button" class="st-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    ${mime || webcodecs ? `${heard ? `<p class="st-note">${ic('sound', 'st-note-ic')} ${heard} son${heard > 1 ? 's' : ''} mixé${heard > 1 ? 's' : ''} dans la vidéo (AAC 48 kHz).</p>` : ''}<div class="st-export-sum"><div><b>${p.width}×${p.height}</b><span>Résolution</span></div><div><b>${p.fps} i/s</b><span>Cadence</span></div><div><b>${fmt(p.duration)} s</b><span>Durée</span></div><div><b>${ext}</b><span>Format</span></div></div>
    <label class="st-field"><span>Débit</span><select id="stBitrate"><option value="8">8 Mb/s · léger</option><option value="16" selected>16 Mb/s · recommandé</option><option value="32">32 Mb/s · maximum</option></select></label>
    <p class="st-note">Le rendu se fait en pleine qualité, image par image : la vidéo reste fluide même si l’appareil calcule lentement. Garde l’onglet au premier plan.</p>
    <div class="st-progress" hidden><div class="st-bar-track"><i id="stProg"></i></div><span id="stProgT">0 %</span></div>
    <div class="st-modal-foot"><button type="button" class="st-btn" data-close>Annuler</button><button class="st-btn primary" id="stGo">${ic('download')}Exporter</button></div>`
    : '<p class="st-note">Ce navigateur ne sait pas enregistrer de vidéo (MediaRecorder absent). Utilise Chrome, Edge, Firefox ou Safari récent.</p>'}`);
  $('#stGo', wrap)?.addEventListener('click', async () => {
    const btn = $('#stGo', wrap);
    btn.disabled = true;
    $('.st-progress', wrap).hidden = false;
    let cancelled = false;
    $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', () => (cancelled = true), { capture: true }));
    try {
      await renderVideo({ mime, bitrate: +$('#stBitrate', wrap).value * 1e6, cancelled: () => cancelled || !wrap.isConnected, progress: (k) => {
        $('#stProg', wrap).style.width = `${k * 100}%`;
        $('#stProgT', wrap).textContent = `${Math.round(k * 100)} %`;
      } });
      close();
    } catch (err) {
      H.toast(err.message);
      btn.disabled = false;
    }
  });
}

// Frame-exact H.264 through WebCodecs: every frame carries its own timestamp, so a frame that
// takes long to draw (3D, big canvases, a phone) can never show up as a stutter in the file.
// MediaRecorder, which films the canvas in real time, is only the fallback.
const AVC = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'];
async function pickEncoder(p, bitrate) {
  if (!('VideoEncoder' in window) || p.width % 2 || p.height % 2) return null;
  for (const codec of AVC) {
    const config = { codec, width: p.width, height: p.height, bitrate, framerate: p.fps, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch { /* next codec */ }
  }
  return null;
}

async function drawExportFrame(p, i) {
  const t = i / p.fps;
  S.t = t;
  // Each video is seeked to this frame and decoded before drawing: never real-time playback.
  const bitmaps = { ...await scriptFrames(t), ...await S.vexp.seek(p, t) };
  drawFrame(S.ctx, p, t, { scale: 1, bitmaps });
  for (const b of Object.values(bitmaps)) b.close?.();
  if (i % 3 === 0) updateTime();
}

// Soundtrack: AAC (plays everywhere), Opus in MP4 when the browser has no AAC encoder.
const AUDIO_CODECS = [['mp4a.40.2', 'aac'], ['opus', 'opus']];
async function pickAudioEncoder(buf) {
  if (!('AudioEncoder' in window)) return null;
  for (const [codec, mux] of AUDIO_CODECS) {
    const config = { codec, sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, mux }; } catch { /* next codec */ }
  }
  return null;
}

// Encoders prepend priming samples (AAC: 2112) that MP4 players skip only through an edit list.
// Opus states its pre-skip in the OpusHead; for AAC, encode a click and find it in the decoded output.
const AAC_PRIMING = 2112;
const primingCache = new Map();
async function encoderDelay(config, decoderConfig) {
  const head = decoderConfig?.description;
  if (config.codec === 'opus') {
    if (!(head?.byteLength >= 12)) return 3840; // mp4-muxer's dOps default
    const bytes = ArrayBuffer.isView(head) ? head : new Uint8Array(head);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true);
  }
  const key = JSON.stringify(config);
  if (!primingCache.has(key)) primingCache.set(key, measurePriming(config).catch(() => AAC_PRIMING));
  return primingCache.get(key);
}

async function measurePriming(config) {
  const n = 9600, at = 4800;
  const click = new AudioBuffer({ length: n, numberOfChannels: config.numberOfChannels, sampleRate: config.sampleRate });
  for (let c = 0; c < click.numberOfChannels; c++) click.getChannelData(c)[at] = 0.9;
  const { chunks, decoderConfig } = await encodeAudio(click, config);
  let failure = null, pos = 0, peak = 0, delay = -1;
  const dec = new AudioDecoder({ output: (a) => {
    const b = new Float32Array(a.numberOfFrames);
    a.copyTo(b, { planeIndex: 0, format: 'f32-planar' });
    a.close();
    b.forEach((v, k) => { if (Math.abs(v) > peak) peak = Math.abs(v), delay = pos + k - at; });
    pos += b.length;
  }, error: (e) => (failure = e) });
  try {
    dec.configure(decoderConfig);
    for (const c of chunks) dec.decode(c.chunk);
    await dec.flush();
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
  if (failure) throw failure;
  if (delay < 0 || delay > 8192) throw new Error(`Unexpected encoder priming: ${delay}`);
  return delay;
}

// Returns the encoded chunks (with their metadata) so the muxer can be told the priming first.
async function encodeAudio(buf, config) {
  let failure = null, decoderConfig = null;
  const chunks = [];
  const enc = new AudioEncoder({ output: (chunk, meta) => {
    if (meta?.decoderConfig) decoderConfig ??= meta.decoderConfig;
    chunks.push({ chunk, meta });
  }, error: (e) => (failure = e) });
  enc.configure(config);
  const chans = [...Array(buf.numberOfChannels).keys()].map((c) => buf.getChannelData(c));
  const step = 4096;
  try {
    for (let i = 0; i < buf.length; i += step) {
      const n = Math.min(step, buf.length - i);
      const data = new Float32Array(n * chans.length);
      chans.forEach((d, c) => data.set(d.subarray(i, i + n), c * n));
      const ad = new AudioData({ format: 'f32-planar', sampleRate: buf.sampleRate, numberOfFrames: n, numberOfChannels: chans.length, timestamp: Math.round((i / buf.sampleRate) * 1e6), data });
      enc.encode(ad);
      ad.close();
      if (failure) throw failure;
    }
    await enc.flush();
    if (failure) throw failure;
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
  return { chunks, decoderConfig };
}

async function encodeFrames({ p, config, canvas, frames, cancelled, progress }) {
  const { Muxer, ArrayBufferTarget } = await import('/vendor/mp4-muxer.mjs');
  const sound = await A.mixdown(p).catch(() => null);
  const audio = sound && await pickAudioEncoder(sound);
  if (sound && !audio) H.toast('Ce navigateur n’encode pas le son : vidéo exportée sans son.');
  const encoded = audio && await encodeAudio(sound, audio.config);
  // The edit list skips the priming and the end padding: the soundtrack starts with frame 0.
  const edit = encoded && { mediaTime: await encoderDelay(audio.config, encoded.decoderConfig), duration: sound.length / sound.sampleRate };
  const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: p.width, height: p.height, frameRate: p.fps },
    ...(audio ? { audio: { codec: audio.mux, sampleRate: sound.sampleRate, numberOfChannels: sound.numberOfChannels, edit } } : {}) });
  for (const { chunk, meta } of encoded?.chunks ?? []) muxer.addAudioChunk(chunk, meta);
  let failure = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  enc.configure(config);
  const step = 1e6 / p.fps;
  try {
    for (let i = 0; i < frames; i++) {
      if (cancelled()) return null;
      await drawExportFrame(p, i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * step), duration: Math.round(step) });
      enc.encode(frame, { keyFrame: i % (p.fps * 2) === 0 });
      frame.close();
      // Keep memory flat on long films: let the encoder catch up.
      while (enc.encodeQueueSize > 6) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }));
      if (failure) throw failure;
      progress((i + 1) / frames);
    }
    await enc.flush();
    if (failure) throw failure;
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

async function recordFrames({ p, mime, bitrate, canvas, frames, cancelled, progress }) {
  if (A.audibleLayers(p).length) H.toast('Export de secours (sans WebCodecs) : la vidéo sera sans son.');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(250);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (cancelled()) break;
    await drawExportFrame(p, i);
    track.requestFrame?.();
    progress((i + 1) / frames);
    const wait = t0 + ((i + 1) * 1000) / p.fps - performance.now();
    if (wait > 0) await sleep(wait);
  }
  rec.stop();
  await done;
  track.stop();
  return cancelled() ? null : new Blob(chunks, { type: mime.split(';')[0] });
}

async function renderVideo({ mime, bitrate, cancelled, progress }) {
  const p = P();
  const prevQ = S.quality, prevT = S.t;
  S.exporting = true;
  S.root.classList.add('exporting');
  try {
    S.quality = 1;
    applyLayout();
    await S.rt.sync(p, 1);
    const canvas = $('#stCanvas', S.root);
    const frames = Math.round(p.duration * p.fps);
    const config = await pickEncoder(p, bitrate);
    if (!config && !mime) throw new Error('Ce navigateur ne sait pas encoder de vidéo.');
    const blob = config
      ? await encodeFrames({ p, config, canvas, frames, cancelled, progress })
      : await recordFrames({ p, mime, bitrate, canvas, frames, cancelled, progress });
    if (blob && !cancelled()) {
      const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
      download(blob, `${slug(p.name)}.${ext}`);
      H.toast('Vidéo exportée');
    }
  } finally {
    S.exporting = false;
    S.root?.classList.remove('exporting');
    S.quality = prevQ;
    S.t = prevT;
    S.vexp.destroy();
    if (S.root) { applyLayout(); await S.rt.sync(P(), prevQ); updateTime(); requestPaint(); }
  }
}

// =====================================================================
// Bindings
// =====================================================================

function bindEditor() {
  const r = S.root;
  r.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { addLayer(add.dataset.add); return; }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const [w, h] = preset.dataset.preset.split('x').map(Number);
      mutate(() => {
        const p = P();
        const sx = w / p.width, sy = h / p.height;
        // Keep layers where they were relative to the frame.
        for (const l of p.layers) for (const [k, s] of [['x', sx], ['y', sy]]) {
          const v = l.props?.[k];
          if (isAnimated(v)) v.forEach((kf) => (kf.v = Math.round(kf.v * s)));
          else if (typeof v === 'number') l.props[k] = Math.round(v * s);
        }
        p.width = w; p.height = h;
      });
      changed({ structure: true });
      return;
    }
    const nav = e.target.closest('[data-kfnav]');
    if (nav) { jumpKey(selLayer(), nav.dataset.k, nav.dataset.bag, +nav.dataset.kfnav); return; }
    const b = e.target.closest('[data-cmd], .kf[data-kf]');
    if (b && !b.closest('.tl-name')) command(b.dataset.cmd, b, e);
  });
  r.addEventListener('input', (e) => {
    if (e.target.id === 'stName') { mutate(() => (P().name = e.target.value), 'pname'); setTitle(); S.dirty = true; clearTimeout(S.saveTimer); S.saveTimer = setTimeout(() => save(), 900); return; }
    if (e.target.closest('#stInsp')) inspectorInput(e);
  });
  r.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'stZoom') { S.zoom = t.value === 'fit' ? 'fit' : +t.value; applyLayout(); }
    else if (t.id === 'stQuality') { S.quality = +t.value; savePrefs(); applyLayout(); S.rt.sync(P(), S.quality).then(requestPaint); }
    else if (t.id === 'stSpeed') { S.speed = +t.value; if (S.playing) startSound(); }
    else if (t.closest('#stInsp')) inspectorInput(e);
  });
  r.addEventListener('focusout', (e) => {
    if (e.target.id === 'stName') renderBar();
  });
  $('#stInsp', r).addEventListener('keydown', inspectorKey);
  $('#stInsp', r).addEventListener('pointerdown', inspectorPointer);
  $('#stTlZoom', r).addEventListener('input', (e) => setTlZoom(+e.target.value));
  const ov = $('#stOverlay', r);
  ov.addEventListener('pointerdown', viewerPointer);
  ov.addEventListener('pointermove', viewerHover);
  const sc = $('#stTlScroll', r);
  sc.addEventListener('pointerdown', timelinePointer);
  sc.addEventListener('dblclick', timelineDblClick);
  sc.addEventListener('wheel', timelineWheel, { passive: false });
  $('#stView', r).addEventListener('pointerdown', (e) => { if (e.target.id === 'stView') select(null); });
  // Timeline height grip.
  $('#stGrip', r).addEventListener('pointerdown', (e) => {
    const y0 = e.clientY, h0 = S.tlH;
    e.target.setPointerCapture(e.pointerId);
    const move = (ev) => { S.tlH = clamp(h0 - (ev.clientY - y0), 140, innerHeight * 0.7); r.style.setProperty('--tl-h', `${S.tlH}px`); applyLayout(); };
    const up = () => { e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); savePrefs(); };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
  });
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  window.addEventListener('beforeunload', onBeforeUnload);
  resizeObs = new ResizeObserver(() => applyLayout());
  resizeObs.observe($('#stView', r));
}
