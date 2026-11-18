// Helpers shared by the pages of the Studio that use the shell theme: home, productions,
// assets and feedback. The motion editor (studio.js) keeps its own dark chrome and icons.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const STATUSES = [
  ['idee', 'Idée', 'gray'],
  ['ecriture', 'En écriture', 'amber'],
  ['pret', 'Prêt à tourner', 'blue'],
  ['tourne', 'Tourné', 'violet'],
  ['publie', 'Publié', 'green'],
];
export const statusOf = (k) => STATUSES.find((s) => s[0] === k) || STATUSES[1];

/** Formats of a production, with the size of the motions made for it. */
export const FORMATS = [
  ['youtube', 'Vidéo YouTube', 1920, 1080],
  ['short', 'Short vertical', 1080, 1920],
  ['teaser', 'Teaser', 1920, 1080],
  ['post', 'Post réseaux', 1080, 1350],
  ['autre', 'Autre', 1920, 1080],
];
export const formatOf = (k) => FORMATS.find((f) => f[0] === k) || FORMATS[0];

// Icons (24 grid, Lucide-like strokes).
const I = {
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
  next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  auto: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  flipX: '<path d="M12 3v18"/><path d="M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z"/>',
  flipY: '<path d="M3 12h18"/><path d="M7 8l5-5 5 5H7zM7 16l5 5 5-5H7z"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  window: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4l-1.5 5M13.5 4 12 9M19 4l-1.5 5"/>',
  cam: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  screen: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  remote: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="8" r="2"/><path d="M10 14h4M10 17h4"/>',
  prompter: '<rect x="3" y="3" width="18" height="12" rx="2"/><path d="M7 7h10M7 11h6M12 15v3M8 21h8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>',
  part: '<path d="M4 6h16M4 12h10M4 18h7"/>',
  cue: '<path d="M8 4H5v16h3M16 4h3v16h-3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  video: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/>',
  chat: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4.5 3.5V17H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  brief: '<path d="M8 4h8v3H8z"/><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 12h8M8 16h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  library: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="16" rx="1.5"/><path d="m17.5 5.5 3 14.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.7 4.4L21 15"/><path d="M21 20v-5h-5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
export const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

export function relTime(ts) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 45) return "à l'instant";
  if (d < 3600) return `il y a ${Math.round(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
export const byLabel = (by) => (by === 'app' ? 'toi' : by === 'api' ? 'un script' : by || '?');
/** Writers other than the app are agents: a sparkle marks their work. */
export const byAgent = (by) => !!by && by !== 'app';

const slug = (s, fallback) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
export const newId = (name, fallback = 'production') => `${slug(name, fallback)}-${Math.random().toString(36).slice(2, 6)}`;

export function duration(s, short = false) {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  if (short) return `${m}:${String(s % 60).padStart(2, '0')}`;
  return m ? `${m} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')}` : ''}` : `${s} s`;
}

export function bytes(n) {
  if (!n) return '';
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} ko`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} Mo`;
  return `${(n / 1e9).toFixed(1).replace('.', ',')} Go`;
}

/** Kind of a media path, from its extension (the server names files by format). */
export function mediaKind(src) {
  const ext = String(src || '').split('.').pop().toLowerCase();
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
  return 'image';
}

export function loadCss() {
  if ($('link[data-production-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/studio/production.css';
  l.dataset.productionCss = '';
  document.head.append(l);
}

/** Modal on the shell theme. Returns `{ el, close }`; `onClose` runs once. */
export function modal(html, { onClose, wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'cx-modal-wrap';
  wrap.innerHTML = `<div class="cx-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(wrap);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    document.removeEventListener('keydown', key, true);
    onClose?.();
  };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  return { el: $('.cx-modal', wrap), close };
}
