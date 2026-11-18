// Studio engine: keyframe evaluation and the 2D compositor. No DOM besides canvases.
//
// A project is plain JSON (see docs/studio.md). Every property of a layer is either a
// static value or a keyframe list [{t, v, e}], t in composition seconds, e the easing
// from this key to the next. Script layers (canvas, three) are rendered by the
// sandboxed runtime and handed back as bitmaps; video layers are handed in the same way, as
// the video element of the layer seeked by video.js. Sound layers (audio) draw nothing:
// audio.js plays and mixes them, and the sound of video layers too.

// ---------- Easing ----------

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const bounceOut = (x) => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

export const EASES = {
  linear: (x) => x,
  inSine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  outSine: (x) => Math.sin((x * Math.PI) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  inQuart: (x) => x ** 4,
  outQuart: (x) => 1 - (1 - x) ** 4,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  inExpo: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
  outExpo: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  inBack: (x) => c3 * x * x * x - c1 * x * x,
  outBack: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2,
  inOutBack: (x) => (x < 0.5 ? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2 : ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2),
  outElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),
  outBounce: bounceOut,
  hold: (x) => (x < 1 ? 0 : 1),
};

export const EASE_LABELS = {
  linear: 'Linéaire', inSine: 'Entrée douce', outSine: 'Sortie douce', inOutSine: 'Douce',
  inCubic: 'Entrée cubique', outCubic: 'Sortie cubique', inOutCubic: 'Cubique',
  inQuart: 'Entrée quartique', outQuart: 'Sortie quartique', inOutQuart: 'Quartique',
  inExpo: 'Entrée expo', outExpo: 'Sortie expo', inOutExpo: 'Expo',
  inBack: 'Entrée élan', outBack: 'Sortie élan', inOutBack: 'Élan',
  outElastic: 'Élastique', outBounce: 'Rebond', hold: 'Maintien',
};

// ---------- Values ----------

export const isAnimated = (v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 't' in v[0];

function parseColor(s) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(s).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length === 6) h += 'ff';
  if (h.length !== 8) return null;
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

function mix(a, b, k) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  const ca = parseColor(a), cb = parseColor(b);
  if (ca && cb) {
    const c = ca.map((x, i) => x + (cb[i] - x) * k);
    return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${c[3] >= 254.5 ? '' : hex2(c[3])}`;
  }
  return k < 1 ? a : b;
}

/** Value of a property at composition time t. */
export function valueAt(v, t) {
  if (!isAnimated(v)) return v;
  if (t <= v[0].t) return v[0].v;
  const last = v[v.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i], b = v[i + 1];
    if (t >= a.t && t < b.t) {
      const k = (EASES[a.e] || EASES.linear)((t - a.t) / (b.t - a.t || 1));
      return mix(a.v, b.v, k);
    }
  }
  return last.v;
}

// ---------- Schema ----------
// Drives the inspector and the defaults. `anim` marks properties that take keyframes.

const TRANSFORM = [
  { key: 'x', label: 'Position X', kind: 'num', step: 1, anim: true, group: 'Transformation' },
  { key: 'y', label: 'Position Y', kind: 'num', step: 1, anim: true, group: 'Transformation' },
  { key: 'scale', label: 'Échelle', kind: 'num', step: 0.01, anim: true, group: 'Transformation' },
  { key: 'scaleX', label: 'Échelle X', kind: 'num', step: 0.01, anim: true, group: 'Transformation' },
  { key: 'scaleY', label: 'Échelle Y', kind: 'num', step: 0.01, anim: true, group: 'Transformation' },
  { key: 'rotation', label: 'Rotation', kind: 'num', step: 0.5, unit: '°', anim: true, group: 'Transformation' },
  { key: 'opacity', label: 'Opacité', kind: 'num', step: 0.01, min: 0, max: 1, anim: true, group: 'Transformation' },
  { key: 'blur', label: 'Flou', kind: 'num', step: 0.5, min: 0, unit: 'px', anim: true, group: 'Transformation' },
];

const FONTS = ['Inter', 'Space Grotesk', 'Instrument Serif', 'JetBrains Mono', 'Bricolage Grotesque', 'system-ui'];

export const SCHEMA = {
  text: [
    { key: 'text', label: 'Texte', kind: 'textarea', group: 'Texte' },
    { key: 'font', label: 'Police', kind: 'select', options: FONTS, group: 'Texte' },
    { key: 'weight', label: 'Graisse', kind: 'select', options: ['300', '400', '500', '600', '700', '800'], group: 'Texte' },
    { key: 'italic', label: 'Italique', kind: 'bool', group: 'Texte' },
    { key: 'size', label: 'Taille', kind: 'num', step: 1, min: 1, unit: 'px', anim: true, group: 'Texte' },
    { key: 'tracking', label: 'Approche', kind: 'num', step: 0.5, unit: 'px', anim: true, group: 'Texte' },
    { key: 'lineHeight', label: 'Interligne', kind: 'num', step: 0.05, anim: true, group: 'Texte' },
    { key: 'align', label: 'Alignement', kind: 'select', options: ['center', 'left', 'right'], group: 'Texte' },
    { key: 'fill', label: 'Couleur', kind: 'color', anim: true, group: 'Texte' },
    { key: 'fill2', label: 'Dégradé vers', kind: 'color', anim: true, optional: true, group: 'Texte' },
    { key: 'reveal', label: 'Révélation', kind: 'num', step: 0.01, min: 0, max: 1, anim: true, group: 'Animation du texte' },
    { key: 'revealStyle', label: 'Style', kind: 'select', options: ['rise', 'fade', 'scale', 'blur', 'type'], group: 'Animation du texte' },
    { key: 'glow', label: 'Lueur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Animation du texte' },
  ],
  shape: [
    { key: 'shape', label: 'Forme', kind: 'select', options: ['rect', 'ellipse', 'polygon', 'star', 'line'], group: 'Forme' },
    { key: 'w', label: 'Largeur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Forme' },
    { key: 'h', label: 'Hauteur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Forme' },
    { key: 'radius', label: 'Arrondi', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Forme' },
    { key: 'sides', label: 'Côtés', kind: 'num', step: 1, min: 3, max: 24, group: 'Forme' },
    { key: 'fill', label: 'Remplissage', kind: 'color', anim: true, optional: true, group: 'Remplissage' },
    { key: 'fill2', label: 'Dégradé vers', kind: 'color', anim: true, optional: true, group: 'Remplissage' },
    { key: 'gradientAngle', label: 'Angle du dégradé', kind: 'num', step: 1, unit: '°', anim: true, group: 'Remplissage' },
    { key: 'stroke', label: 'Contour', kind: 'color', anim: true, optional: true, group: 'Contour' },
    { key: 'strokeWidth', label: 'Épaisseur', kind: 'num', step: 0.5, min: 0, unit: 'px', anim: true, group: 'Contour' },
    { key: 'trim', label: 'Tracé', kind: 'num', step: 0.01, min: 0, max: 1, anim: true, group: 'Contour' },
    { key: 'glow', label: 'Lueur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Contour' },
  ],
  image: [
    { key: 'src', label: 'Source', kind: 'text', group: 'Image' },
    { key: 'w', label: 'Largeur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Image' },
    { key: 'h', label: 'Hauteur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Image' },
    { key: 'fit', label: 'Ajustement', kind: 'select', options: ['cover', 'contain', 'fill'], group: 'Image' },
    { key: 'radius', label: 'Arrondi', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Image' },
  ],
  video: [
    { key: 'src', label: 'Source', kind: 'text', group: 'Vidéo' },
    { key: 'offset', label: 'Décalage', kind: 'num', step: 0.01, min: 0, unit: 's', group: 'Vidéo' },
    { key: 'w', label: 'Largeur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Vidéo' },
    { key: 'h', label: 'Hauteur', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Vidéo' },
    { key: 'fit', label: 'Ajustement', kind: 'select', options: ['cover', 'contain', 'fill'], group: 'Vidéo' },
    { key: 'radius', label: 'Arrondi', kind: 'num', step: 1, min: 0, unit: 'px', anim: true, group: 'Vidéo' },
    { key: 'volume', label: 'Volume', kind: 'num', step: 0.01, min: 0, max: 4, anim: true, group: 'Son de la vidéo' },
    { key: 'muted', label: 'Couper le son', kind: 'bool', group: 'Son de la vidéo' },
  ],
  canvas: [
    { key: 'w', label: 'Largeur', kind: 'num', step: 1, min: 1, unit: 'px', group: 'Surface' },
    { key: 'h', label: 'Hauteur', kind: 'num', step: 1, min: 1, unit: 'px', group: 'Surface' },
  ],
  three: [
    { key: 'w', label: 'Largeur', kind: 'num', step: 1, min: 1, unit: 'px', group: 'Surface' },
    { key: 'h', label: 'Hauteur', kind: 'num', step: 1, min: 1, unit: 'px', group: 'Surface' },
  ],
};
SCHEMA['three-gpu'] = SCHEMA.three;
for (const k of Object.keys(SCHEMA)) SCHEMA[k] = [...TRANSFORM, ...SCHEMA[k]];
// Sound: no transform.
SCHEMA.audio = [
  { key: 'src', label: 'Fichier', kind: 'text', group: 'Son' },
  { key: 'volume', label: 'Volume', kind: 'num', step: 0.01, min: 0, max: 4, anim: true, group: 'Son' },
  { key: 'offset', label: 'Décalage', kind: 'num', step: 0.01, min: 0, unit: 's', group: 'Son' },
  { key: 'fadeIn', label: 'Entrée', kind: 'num', step: 0.05, min: 0, unit: 's', group: 'Fondus' },
  { key: 'fadeOut', label: 'Sortie', kind: 'num', step: 0.05, min: 0, unit: 's', group: 'Fondus' },
];

export const TYPES = {
  text: { label: 'Texte', hue: 268 },
  shape: { label: 'Forme', hue: 195 },
  image: { label: 'Image', hue: 145 },
  video: { label: 'Vidéo', hue: 230 },
  canvas: { label: 'Canvas 2D', hue: 32 },
  three: { label: 'Three.js 3D', hue: 330 },
  'three-gpu': { label: 'Three.js WebGPU', hue: 300 },
  audio: { label: 'Son', hue: 85 },
};

export const BLENDS = { normal: 'source-over', screen: 'screen', add: 'lighter', multiply: 'multiply', overlay: 'overlay', difference: 'difference' };
export const BLEND_LABELS = { normal: 'Normal', screen: 'Superposition claire', add: 'Addition', multiply: 'Produit', overlay: 'Incrustation', difference: 'Différence' };

const BASE = { scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0 };
const DEFAULTS = {
  text: { text: 'Texte', font: 'Inter', weight: '700', size: 120, tracking: 0, lineHeight: 1.1, align: 'center', fill: '#ffffff', reveal: 1, revealStyle: 'rise', glow: 0 },
  shape: { shape: 'rect', w: 400, h: 400, radius: 0, sides: 6, fill: '#9b8cff', gradientAngle: 90, strokeWidth: 4, trim: 1, glow: 0 },
  image: { src: '', w: 800, h: 450, fit: 'cover', radius: 0 },
  video: { src: '', w: 800, h: 450, fit: 'cover', radius: 0, offset: 0, volume: 1, muted: false },
  canvas: {},
  three: {},
  'three-gpu': {},
  audio: { src: '', volume: 1, offset: 0, fadeIn: 0, fadeOut: 0 },
};

/** Fully resolved properties of a layer at time t (comp-dependent defaults included). */
export function resolve(layer, t, comp) {
  const out = { ...BASE, x: comp.width / 2, y: comp.height / 2, w: comp.width, h: comp.height, ...DEFAULTS[layer.type] };
  const props = layer.props || {};
  for (const k in props) out[k] = valueAt(props[k], t);
  return out;
}

/** Custom script parameters (layer.params), evaluated at t. */
export function resolveParams(layer, t) {
  const out = {};
  for (const k in layer.params || {}) out[k] = valueAt(layer.params[k], t);
  return out;
}

export function defaultLayer(type, comp, extra = {}) {
  const id = 'l' + Math.random().toString(36).slice(2, 8);
  const base = { id, name: TYPES[type].label, type, in: 0, out: comp.duration, props: { x: comp.width / 2, y: comp.height / 2 } };
  if (type === 'text') base.props = { ...base.props, text: 'Titre', size: Math.round(comp.height / 9), fill: '#ffffff', font: 'Inter', weight: '700' };
  if (type === 'shape') base.props = { ...base.props, shape: 'rect', w: Math.round(comp.height / 3), h: Math.round(comp.height / 3), radius: 24, fill: '#9b8cff' };
  if (type === 'image') base.props = { ...base.props, src: '', w: Math.round(comp.width / 2), h: Math.round(comp.height / 2) };
  if (type === 'video') base.props = { ...base.props, src: '', w: comp.width, h: comp.height, fit: 'cover', offset: 0, volume: 1 };
  if (type === 'canvas') { base.props = { ...base.props, w: comp.width, h: comp.height }; base.code = CANVAS_STARTER; base.params = { speed: 1, color: '#5ee1d6' }; }
  if (type === 'audio') base.props = { src: '', volume: 1 };
  if (type === 'three') { base.props = { ...base.props, w: comp.width, h: comp.height }; base.code = THREE_STARTER; base.params = { speed: 1, color: '#9b8cff' }; }
  if (type === 'three-gpu') { base.props = { ...base.props, w: comp.width, h: comp.height }; base.code = THREE_GPU_STARTER; base.params = { speed: 1, color: '#9b8cff', glow: '#5ee1d6' }; }
  return { ...base, ...extra };
}

export const CANVAS_STARTER = `// Calque Canvas 2D. render(s) dessine l'image au temps s.t (secondes).
// s.ctx, s.w, s.h, s.p (progression 0-1), s.params, s.ease, s.noise, s.rand, s.lerp, s.clamp.
function render(s) {
  const { ctx, w, h, t } = s;
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * s.params.speed;
    const r = h * 0.28 + Math.sin(t * 2 + i * 0.5) * h * 0.04;
    ctx.beginPath();
    ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 6, 0, Math.PI * 2);
    ctx.fillStyle = s.params.color;
    ctx.globalAlpha = 0.4 + 0.6 * (i / n);
    ctx.fill();
  }
}
`;

export const THREE_STARTER = `// Calque Three.js. setup(s) construit la scène une fois, render(s) l'anime au temps s.t.
// s.THREE, s.scene, s.camera, s.renderer, s.env() (éclairage studio), s.params.
function setup(s) {
  const { THREE, scene } = s;
  s.env();
  s.mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.2, 0.38, 220, 32),
    new THREE.MeshPhysicalMaterial({ color: s.params.color, metalness: 0.2, roughness: 0.15, clearcoat: 1, iridescence: 1 }),
  );
  scene.add(s.mesh);
}

function render(s) {
  s.mesh.rotation.set(s.t * 0.4 * s.params.speed, s.t * 0.6 * s.params.speed, 0);
  s.mesh.material.color.set(s.params.color);
}
`;

export const THREE_GPU_STARTER = `// Calque Three.js WebGPU (r187, TSL). setup(s) construit la scène une fois, render(s) l'anime au temps s.t.
// s.THREE (three/webgpu), s.TSL, s.addons (ao, bloom, dof, traa, ssr...), s.scene, s.camera, s.renderer,
// s.env(), s.post({ ao, bloom, dof, motion, lens }), s.params. En TSL, time vaut s.t.
function setup(s) {
  const { THREE, TSL, scene } = s;
  s.env();
  s.mat = new THREE.MeshPhysicalNodeMaterial({ color: s.params.color, metalness: 0.2, roughness: 0.2, clearcoat: 1 });
  // liseré lumineux qui court sur la surface : seul l'émissif passe dans le bloom
  const band = TSL.sin(TSL.positionLocal.y.mul(6).sub(TSL.time.mul(3))).smoothstep(0.92, 1);
  s.glow = TSL.uniform(new THREE.Color(s.params.glow));
  s.mat.emissiveNode = s.glow.mul(band).mul(3);
  s.mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.38, 220, 32), s.mat);
  scene.add(s.mesh);
  s.post({ ao: { radius: 0.4 }, bloom: { strength: 0.6, radius: 0.3 } });
}

function render(s) {
  s.mesh.rotation.set(s.t * 0.4 * s.params.speed, s.t * 0.6 * s.params.speed, 0);
  s.mat.color.set(s.params.color);
  s.glow.value.set(s.params.glow);
}
`;

// ---------- Fonts ----------

const fontState = new Map();
/** Loads the web fonts a project uses; resolves when the canvas can draw them. */
export function ensureFonts(project, onReady) {
  const wanted = new Set();
  for (const l of project.layers || []) {
    if (l.type !== 'text') continue;
    const f = valueAt(l.props?.font, 0) || 'Inter';
    const w = valueAt(l.props?.weight, 0) || '700';
    const i = valueAt(l.props?.italic, 0) ? 'italic ' : '';
    if (f !== 'system-ui') wanted.add(`${i}${w} 64px "${f}"`);
  }
  const pending = [...wanted].filter((k) => !fontState.has(k));
  if (!pending.length) return;
  for (const k of pending) fontState.set(k, document.fonts.load(k).catch(() => {}));
  Promise.all(pending.map((k) => fontState.get(k))).then(onReady);
}

// ---------- Drawing ----------

const images = new Map();
function image(src, onLoad) {
  let e = images.get(src);
  if (!e) {
    e = { img: new Image(), ok: false };
    e.img.crossOrigin = 'anonymous';
    e.ready = new Promise((done) => {
      e.img.onload = () => { e.ok = true; onLoad?.(); done(); };
      e.img.onerror = done;
    });
    e.img.src = src;
    images.set(src, e);
  }
  return e.ok ? e.img : null;
}

/** Resolves once every image a project draws is loaded (or failed): a still can then draw at once. */
export function preloadImages(project) {
  const srcs = (project.layers || []).filter((l) => l.type === 'image').map((l) => valueAt(l.props?.src ?? '', 0)).filter(Boolean);
  return Promise.all(srcs.map((src) => (image(src), images.get(src).ready)));
}

function fillStyle(ctx, p, w, h) {
  if (!p.fill2) return p.fill;
  const a = ((p.gradientAngle ?? 90) * Math.PI) / 180;
  const dx = (Math.cos(a) * w) / 2, dy = (Math.sin(a) * h) / 2;
  const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
  g.addColorStop(0, p.fill);
  g.addColorStop(1, p.fill2);
  return g;
}

function shapePath(ctx, p) {
  const w = p.w, h = p.h;
  ctx.beginPath();
  if (p.shape === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, -Math.PI / 2, Math.PI * 1.5);
    const a = w / 2, b = h / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  if (p.shape === 'line') {
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    return w;
  }
  if (p.shape === 'polygon' || p.shape === 'star') {
    const n = Math.max(3, Math.round(p.sides || 6));
    const pts = p.shape === 'star' ? n * 2 : n;
    let len = 0, px, py;
    for (let i = 0; i <= pts; i++) {
      const a = -Math.PI / 2 + (i / pts) * Math.PI * 2;
      const r = p.shape === 'star' && i % 2 ? 0.45 : 1;
      const x = (Math.cos(a) * w * r) / 2, y = (Math.sin(a) * h * r) / 2;
      if (i === 0) ctx.moveTo(x, y); else { ctx.lineTo(x, y); len += Math.hypot(x - px, y - py); }
      px = x; py = y;
    }
    ctx.closePath();
    return len;
  }
  const r = Math.max(0, Math.min(p.radius || 0, w / 2, h / 2));
  // Start at the top centre so a trimmed stroke draws on symmetrically.
  ctx.moveTo(0, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, 0, -h / 2, r);
  ctx.closePath();
  return 2 * (w + h) - (8 - 2 * Math.PI) * r;
}

function drawShape(ctx, p) {
  const len = shapePath(ctx, p);
  if (p.glow > 0) { ctx.shadowColor = p.stroke || p.fill || '#fff'; ctx.shadowBlur = p.glow; }
  if (p.fill && p.shape !== 'line') { ctx.fillStyle = fillStyle(ctx, p, p.w, p.h); ctx.fill(); }
  if (p.stroke && p.strokeWidth > 0) {
    const trim = Math.max(0, Math.min(1, p.trim ?? 1));
    if (trim <= 0) return;
    if (trim < 1) ctx.setLineDash([len * trim, len + 1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = p.strokeWidth;
    ctx.strokeStyle = p.stroke;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawImage(ctx, img, p) {
  const { w, h } = p;
  const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
  if (!iw || !ih) return;
  if (p.fit === 'contain') {
    const r = Math.min(w / iw, h / ih);
    ctx.drawImage(img, (-iw * r) / 2, (-ih * r) / 2, iw * r, ih * r);
    return;
  }
  if (p.radius > 0) { shapePath(ctx, { ...p, shape: 'rect' }); ctx.clip(); }
  if (p.fit === 'fill') { ctx.drawImage(img, -w / 2, -h / 2, w, h); return; }
  const r = Math.max(w / iw, h / ih), sw = w / r, sh = h / r;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
}

function fontOf(p) {
  const fam = p.font === 'system-ui' ? 'system-ui, sans-serif' : `"${p.font}", system-ui, sans-serif`;
  return `${p.italic ? 'italic ' : ''}${p.weight} ${p.size}px ${fam}`;
}

/** Lays text out character by character: tracking and per-character reveal need it. */
function layoutText(ctx, p) {
  ctx.font = fontOf(p);
  const lines = String(p.text ?? '').split('\n');
  const lh = p.size * (p.lineHeight || 1.1);
  const rows = lines.map((line) => {
    const chars = [...line].map((c) => ({ c, w: ctx.measureText(c).width }));
    const width = chars.reduce((s, c) => s + c.w, 0) + Math.max(0, chars.length - 1) * (p.tracking || 0);
    return { chars, width };
  });
  const width = Math.max(0, ...rows.map((r) => r.width));
  return { rows, lh, width, height: rows.length * lh };
}

function drawText(ctx, p) {
  const L = layoutText(ctx, p);
  const total = L.rows.reduce((s, r) => s + r.chars.length, 0);
  const reveal = Math.max(0, Math.min(1, p.reveal ?? 1));
  const soft = p.revealStyle === 'type' ? 0.0001 : Math.max(1, total * 0.35);
  const head = reveal * (total + soft);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fillStyle(ctx, p, L.width, L.height);
  if (p.glow > 0) { ctx.shadowColor = p.fill; ctx.shadowBlur = p.glow; }
  const baseAlpha = ctx.globalAlpha;
  let idx = 0;
  L.rows.forEach((row, ri) => {
    const y = -L.height / 2 + L.lh * (ri + 0.5);
    let x = p.align === 'left' ? 0 : p.align === 'right' ? -row.width : -row.width / 2;
    for (const ch of row.chars) {
      const k = reveal >= 1 ? 1 : Math.max(0, Math.min(1, (head - idx) / soft));
      idx++;
      if (k > 0) {
        const e = EASES.outCubic(k);
        ctx.save();
        ctx.translate(x + ch.w / 2, y);
        if (p.revealStyle === 'rise') ctx.translate(0, (1 - e) * p.size * 0.55);
        if (p.revealStyle === 'scale') ctx.scale(0.4 + 0.6 * EASES.outBack(k), 0.4 + 0.6 * EASES.outBack(k));
        if (p.revealStyle === 'blur' && k < 1) ctx.filter = `blur(${(1 - e) * p.size * 0.12}px)`;
        ctx.globalAlpha = baseAlpha * (p.revealStyle === 'type' ? 1 : e);
        ctx.fillText(ch.c, -ch.w / 2, 0);
        ctx.restore();
      }
      x += ch.w + (p.tracking || 0);
    }
  });
}

/** Local size of a layer's content box, for selection and hit testing. */
export function boxOf(ctx, layer, p) {
  if (layer.type === 'text') {
    const L = layoutText(ctx, p);
    const x0 = p.align === 'left' ? 0 : p.align === 'right' ? -L.width : -L.width / 2;
    return { x: x0, y: -L.height / 2, w: L.width, h: L.height };
  }
  const w = p.w, h = p.shape === 'line' ? Math.max(p.strokeWidth || 2, 8) : p.h;
  return { x: -w / 2, y: -h / 2, w, h };
}

export function matrixOf(p) {
  return new DOMMatrix()
    .translateSelf(p.x, p.y)
    .rotateSelf(p.rotation || 0)
    .scaleSelf((p.scale ?? 1) * (p.scaleX ?? 1), (p.scale ?? 1) * (p.scaleY ?? 1));
}

export const isScript = (l) => l.type === 'canvas' || l.type === 'three' || l.type === 'three-gpu';
export const activeAt = (l, t) => !l.hidden && t >= (l.in ?? 0) && t < (l.out ?? Infinity);

/**
 * Draws the composition at time t. `scale` maps composition pixels to canvas pixels;
 * `bitmaps` holds the script layers' frames and the video layers' elements by layer id.
 */
export function drawFrame(ctx, project, t, { scale = 1, bitmaps = {}, onAsset, transparent = false } = {}) {
  const W = project.width, H = project.height;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  if (!transparent && project.background) {
    ctx.fillStyle = project.background;
    ctx.fillRect(0, 0, W, H);
  }
  const layers = project.layers || [];
  // First layer in the list is in front, as in every compositing tool.
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.type === 'audio' || !activeAt(l, t)) continue;
    const p = resolve(l, t, project);
    if (p.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.opacity);
    ctx.globalCompositeOperation = BLENDS[l.blend] || 'source-over';
    if (p.blur > 0) ctx.filter = `blur(${p.blur}px)`;
    const m = matrixOf(p);
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    try {
      if (l.type === 'text') drawText(ctx, p);
      else if (l.type === 'shape') drawShape(ctx, p);
      else if (l.type === 'image' && p.src) {
        const img = image(p.src, onAsset);
        if (img) drawImage(ctx, img, p);
      } else if (l.type === 'video' && bitmaps[l.id]) {
        drawImage(ctx, bitmaps[l.id], p);
      } else if (isScript(l) && bitmaps[l.id]) {
        ctx.drawImage(bitmaps[l.id], -p.w / 2, -p.h / 2, p.w, p.h);
      }
    } catch { /* a malformed property must not stop the frame */ }
    ctx.restore();
  }
}

/** Topmost layer whose box contains the composition point (x, y). */
export function hitTest(ctx, project, t, x, y) {
  for (const l of project.layers || []) {
    if (l.type === 'audio' || !activeAt(l, t) || l.locked) continue;
    const p = resolve(l, t, project);
    const b = boxOf(ctx, l, p);
    const q = matrixOf(p).inverse().transformPoint(new DOMPoint(x, y));
    if (q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) return l;
  }
  return null;
}

// ---------- Timecode ----------

export function timecode(t, fps) {
  const f = Math.round(t * fps);
  const s = Math.floor(f / fps);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f % fps)}`;
}
