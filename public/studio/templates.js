// Starter projects. Each one shows a different side of the engine: keyframed 2D layers,
// text reveals, Canvas 2D scripts and Three.js scenes, all driven by time only.

const k = (t, v, e = 'inOutCubic') => ({ t, v, e });

// ---------- Ident: glass crystal and title ----------

const CRYSTAL = `// Cristal de verre, noyau lumineux et éclats en orbite.
function setup(s) {
  const { THREE, scene } = s;
  s.env({ intensity: 1.3 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.6,
    ior: 1.7, dispersion: 6, iridescence: 1, iridescenceIOR: 1.35, clearcoat: 1, flatShading: true,
  });
  s.crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 0), glass);
  s.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 3), new THREE.MeshBasicMaterial({ color: s.params.core }));
  scene.add(s.crystal, s.core);

  const n = 180;
  s.shards = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.07, 0),
    new THREE.MeshPhysicalMaterial({ color: s.params.shards, metalness: 1, roughness: 0.22, clearcoat: 1 }),
    n,
  );
  const r = s.rand(7);
  s.seeds = Array.from({ length: n }, () => ({ a: r() * s.TAU, r: 2.3 + r() * 1.6, y: (r() - 0.5) * 0.9, v: 0.15 + r() * 0.35, k: 0.6 + r() * 1.4 }));
  s.dummy = new THREE.Object3D();
  scene.add(s.shards);
  const key = new THREE.DirectionalLight('#ffffff', 2);
  key.position.set(3, 4, 5);
  scene.add(key);
}

function render(s) {
  const { t } = s;
  const intro = s.range(t, 0, 2.6, s.ease.outExpo);
  s.camera.position.set(0, s.lerp(1.6, 0.25, intro), s.lerp(15, 9, intro));
  s.camera.lookAt(0, 0, 0);
  s.crystal.rotation.set(t * 0.3 + intro, t * 0.45 + intro * 2.4, t * 0.1);
  s.crystal.scale.setScalar(s.lerp(0.15, 1, s.ease.outBack(s.clamp(t / 1.8))));
  const beat = 0.5 + 0.5 * Math.sin(t * 3.2);
  s.core.scale.setScalar((0.75 + beat * 0.12) * s.clamp(t / 1.2));
  s.core.material.color.set(s.params.core).multiplyScalar(1.4 + beat);
  const spread = s.lerp(0.2, 1, intro);
  s.seeds.forEach((d, i) => {
    const a = d.a + t * d.v;
    s.dummy.position.set(Math.cos(a) * d.r * spread, d.y + Math.sin(t * 0.8 + i) * 0.12, Math.sin(a) * d.r * spread * 0.55);
    s.dummy.rotation.set(t * d.k, t * d.k * 0.7, i);
    s.dummy.scale.setScalar(s.clamp((t - 0.4 - i * 0.004) * 2));
    s.dummy.updateMatrix();
    s.shards.setMatrixAt(i, s.dummy.matrix);
  });
  s.shards.instanceMatrix.needsUpdate = true;
  s.shards.rotation.x = 0.35;
}
`;

const GRAIN = `// Vignette et grain de film, recalculé à chaque image.
function setup(s) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const r = s.rand(3);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  s.noiseTile = c;
}

function render(s) {
  const { ctx, w, h } = s;
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, \`rgba(0,0,0,\${s.params.vignette})\`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  const r = s.rand(s.frame + 1);
  ctx.globalAlpha = s.params.grain;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(s.noiseTile, 'repeat');
  ctx.translate(-r() * 256, -r() * 256);
  ctx.fillRect(0, 0, w + 256, h + 256);
}
`;

const ident = () => ({
  name: "Ident · Studio",
  width: 1920, height: 1080, fps: 30, duration: 7, background: '#06070b',
  layers: [
    { id: 'grain', name: 'Grain et vignette', type: 'canvas', in: 0, out: 7, code: GRAIN, params: { grain: 0.09, vignette: 0.75 }, props: { x: 960, y: 540, w: 1920, h: 1080 } },
    { id: 'sub', name: 'Sous-titre', type: 'text', in: 3.1, out: 7, props: {
      x: 960, y: 838, text: 'MOTION DESIGN DANS LE NAVIGATEUR', font: 'JetBrains Mono', weight: '500', size: 22, fill: '#9aa1b2',
      tracking: [k(3.1, 2, 'outExpo'), k(4.6, 12)], opacity: [k(3.1, 0, 'outCubic'), k(3.9, 1), k(6.4, 1, 'inCubic'), k(6.9, 0)],
    } },
    { id: 'rule', name: 'Filet', type: 'shape', in: 2.9, out: 7, props: {
      x: 960, y: 790, shape: 'line', w: 560, fill: '', stroke: '#ffffff', strokeWidth: 1.5, opacity: [k(2.9, 0.35), k(6.4, 0.35, 'inCubic'), k(6.9, 0)],
      trim: [k(2.9, 0, 'inOutExpo'), k(4.1, 1)],
    } },
    { id: 'title', name: 'Titre', type: 'text', in: 2.5, out: 7, props: {
      x: 960, y: 700, text: "Studio", font: 'Inter', weight: '800', size: 200, tracking: -9, fill: '#d6d0ff', fill2: '#5ee1d6', gradientAngle: 0,
      reveal: [k(2.5, 0, 'outExpo'), k(3.5, 1)], revealStyle: 'rise', glow: [k(2.5, 0, 'outCubic'), k(3.4, 26), k(4.4, 8)],
      opacity: [k(6.4, 1, 'inCubic'), k(6.9, 0)],
    } },
    { id: 'crystal', name: 'Cristal 3D', type: 'three', in: 0, out: 7, code: CRYSTAL, params: { core: '#9b8cff', shards: '#c9c1ff' }, props: {
      x: 960, w: 1920, h: 1080,
      y: [k(0, 540), k(2.2, 540, 'inOutExpo'), k(3.4, 410)],
      scale: [k(2.2, 1, 'inOutExpo'), k(3.4, 0.66), k(6.3, 0.7, 'inExpo'), k(7, 0.2)],
      opacity: [k(6.4, 1, 'inCubic'), k(6.95, 0)],
    } },
    { id: 'ring', name: 'Anneau', type: 'shape', in: 0.3, out: 7, props: {
      x: 960, shape: 'ellipse', w: 620, h: 620, fill: '', stroke: '#9b8cff', strokeWidth: 1.2, glow: 14,
      y: [k(2.2, 540, 'inOutExpo'), k(3.4, 410)], scale: [k(0.3, 0.6, 'outExpo'), k(2.2, 1, 'inOutExpo'), k(3.4, 0.62)],
      trim: [k(0.3, 0, 'inOutExpo'), k(2.3, 1)], rotation: [k(0.3, -120, 'outCubic'), k(7, 40)],
      opacity: [k(0.3, 0.7), k(5.5, 0.7, 'inCubic'), k(6.4, 0)],
    } },
    { id: 'halo', name: 'Halo', type: 'shape', in: 0, out: 7, blend: 'screen', props: {
      x: 960, shape: 'ellipse', w: 900, h: 900, fill: '#4f46e5', blur: 140,
      y: [k(2.2, 540, 'inOutExpo'), k(3.4, 430)], scale: [k(0, 0.3, 'outExpo'), k(2.5, 1), k(7, 1.15)],
      opacity: [k(0, 0, 'outCubic'), k(1.8, 0.42), k(6.2, 0.42, 'inCubic'), k(7, 0)],
    } },
    { id: 'bg', name: 'Fond', type: 'shape', in: 0, out: 7, props: { x: 960, y: 540, shape: 'rect', w: 1920, h: 1080, fill: '#0d0f18', fill2: '#05060a', gradientAngle: 90 } },
  ],
});

// ---------- Kinetic type: editorial, vertical ----------

const DOTS = `// Trame de points déformée par une onde.
function render(s) {
  const { ctx, w, h, t } = s;
  const gap = 54;
  ctx.fillStyle = s.params.ink;
  for (let y = gap / 2; y < h; y += gap) {
    for (let x = gap / 2; x < w; x += gap) {
      const d = Math.hypot(x - w / 2, y - h * 0.45) / 300;
      const wave = Math.sin(d * 2.4 - t * 3.2) * 0.5 + 0.5;
      const r = 1.2 + wave * 3.4 * s.range(t, 0.2, 1.4);
      ctx.globalAlpha = 0.1 + wave * 0.22;
      ctx.beginPath();
      ctx.arc(x, y + wave * 6, r, 0, s.TAU);
      ctx.fill();
    }
  }
}
`;

const word = (id, text, y, t0, fill, extra = {}) => ({
  id, name: `Mot · ${text}`, type: 'text', in: t0, out: 6,
  props: {
    x: 540, y, text, font: 'Space Grotesk', weight: '700', size: 250, tracking: -14, fill,
    reveal: [k(t0, 0, 'outExpo'), k(t0 + 0.7, 1)], revealStyle: 'rise',
    scale: [k(4.25, 1, 'inExpo'), k(4.75, 0.82)], opacity: [k(4.3, 1, 'inCubic'), k(4.75, 0)],
    ...extra,
  },
});

const kinetic = () => ({
  name: 'Typo cinétique',
  width: 1080, height: 1920, fps: 30, duration: 6, background: '#f1ece4',
  layers: [
    { id: 'wipe2', name: 'Volet de sortie', type: 'shape', in: 4.2, out: 6, props: {
      shape: 'rect', w: 1080, h: 1920, fill: '#111111', y: 960, x: [k(4.2, -540, 'inOutExpo'), k(4.9, 540)],
    } },
    { id: 'end', name: 'Signature', type: 'text', in: 4.8, out: 6, props: {
      x: 540, y: 930, text: 'Motion\ndesign', font: 'Instrument Serif', italic: true, weight: '400', size: 190, lineHeight: 0.95, fill: '#f1ece4',
      reveal: [k(4.8, 0, 'outCubic'), k(5.6, 1)], revealStyle: 'blur',
    } },
    { id: 'end2', name: 'Signature · ligne', type: 'text', in: 5.1, out: 6, props: {
      x: 540, y: 1150, text: 'MOTION · STUDIO', font: 'JetBrains Mono', weight: '500', size: 30, tracking: 10, fill: '#ff4d2e',
      opacity: [k(5.1, 0, 'outCubic'), k(5.6, 1)],
    } },
    { id: 'sticker', name: 'Pastille', type: 'shape', in: 2.2, out: 4.6, props: {
      x: 820, y: 560, shape: 'star', sides: 12, w: 230, h: 230, fill: '#5b4ce0',
      scale: [k(2.2, 0, 'outBack'), k(2.7, 1), k(4.2, 1, 'inBack'), k(4.6, 0)], rotation: [k(2.2, -40, 'linear'), k(4.6, 120)],
    } },
    { id: 'sticker-t', name: 'Pastille · texte', type: 'text', in: 2.2, out: 4.6, props: {
      x: 820, y: 560, text: 'v1', font: 'Space Grotesk', weight: '700', size: 74, fill: '#f1ece4',
      scale: [k(2.3, 0, 'outBack'), k(2.8, 1), k(4.2, 1, 'inBack'), k(4.6, 0)], rotation: [k(2.2, -10, 'linear'), k(4.6, 14)],
    } },
    { id: 'circle', name: 'Entourage', type: 'shape', in: 2.6, out: 4.6, props: {
      x: 540, y: 960, shape: 'ellipse', w: 760, h: 300, fill: '', stroke: '#ff4d2e', strokeWidth: 9, rotation: -5,
      trim: [k(2.6, 0, 'inOutCubic'), k(3.3, 1)], opacity: [k(4.2, 1), k(4.5, 0)],
    } },
    word('w1', 'Pense', 720, 1.0, '#111111'),
    word('w2', 'Code', 960, 1.35, '#111111'),
    word('w3', 'Anime', 1200, 1.7, '#ff4d2e'),
    { id: 'label', name: 'Étiquette', type: 'text', in: 0.6, out: 4.6, props: {
      x: 96, y: 300, align: 'left', text: '01 — MANIFESTE', font: 'JetBrains Mono', weight: '500', size: 30, tracking: 4, fill: '#111111',
      reveal: [k(0.6, 0, 'linear'), k(1.4, 1)], revealStyle: 'type', opacity: [k(4.2, 1), k(4.5, 0)],
    } },
    { id: 'bar', name: 'Barre', type: 'shape', in: 0.6, out: 4.6, props: {
      x: 540, y: 1640, shape: 'line', w: 888, fill: '', stroke: '#111111', strokeWidth: 6,
      trim: [k(0.6, 0, 'linear'), k(4.2, 1)], opacity: [k(4.2, 1), k(4.5, 0)],
    } },
    { id: 'dots', name: 'Trame', type: 'canvas', in: 0, out: 6, code: DOTS, params: { ink: '#111111' }, props: { x: 540, y: 960, w: 1080, h: 1920 } },
    { id: 'wipe', name: "Volet d'entrée", type: 'shape', in: 0, out: 1.2, props: {
      shape: 'rect', w: 1080, h: 1920, fill: '#ff4d2e', y: 960, x: [k(0, 540, 'inOutExpo'), k(0.9, 1620)],
    } },
  ],
});

// ---------- Flux: particle galaxy ----------

const GALAXY = `// Galaxie de particules : chaque particule suit une orbite déformée par du bruit,
// la traînée est recalculée à partir du temps, donc on peut se déplacer n'importe où.
function setup(s) {
  const r = s.rand(11);
  s.parts = Array.from({ length: s.params.count }, (_, i) => {
    const arm = i % 3;
    const d = Math.pow(r(), 0.7);
    return { d, a: arm * (s.TAU / 3) + d * 5.2 + (r() - 0.5) * 0.9, v: 0.12 + (1 - d) * 0.35, z: r(), s: 0.6 + r() * 1.8 };
  });
}

function pos(s, q, t) {
  const R = s.w * 0.44 * q.d * (0.7 + 0.3 * s.range(t, 0, 3, s.ease.outExpo));
  const a = q.a + t * q.v;
  const wob = s.noise(q.d * 3, t * 0.25, q.z * 4) * 40;
  return [s.w / 2 + Math.cos(a) * (R + wob), s.h / 2 + Math.sin(a) * (R + wob) * 0.62];
}

function render(s) {
  const { ctx, t } = s;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const tail = s.params.trail;
  for (const q of s.parts) {
    const hue = s.lerp(170, 265, q.d);
    const [x, y] = pos(s, q, t);
    ctx.strokeStyle = \`hsla(\${hue}, 90%, \${s.lerp(78, 58, q.d)}%, \${0.06 + 0.25 * (1 - q.d)})\`;
    ctx.lineWidth = q.s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 1; j <= 8; j++) {
      const [px, py] = pos(s, q, t - (j * tail) / 8);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = \`hsla(\${hue}, 100%, 82%, 0.9)\`;
    ctx.fillRect(x - q.s / 2, y - q.s / 2, q.s, q.s);
  }
  const core = ctx.createRadialGradient(s.w / 2, s.h / 2, 0, s.w / 2, s.h / 2, s.w * 0.16);
  core.addColorStop(0, 'rgba(255,240,255,0.55)');
  core.addColorStop(1, 'rgba(120,90,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, s.w, s.h);
}
`;

const flux = () => ({
  name: 'Flux · particules',
  width: 1080, height: 1080, fps: 30, duration: 9, background: '#04050a',
  layers: [
    { id: 'cap', name: 'Légende', type: 'text', in: 3.4, out: 9, props: {
      x: 540, y: 905, text: '2 400 particules · 100 % déterministe', font: 'JetBrains Mono', weight: '500', size: 22, tracking: 2, fill: '#8f96aa',
      reveal: [k(3.4, 0, 'linear'), k(4.6, 1)], revealStyle: 'type', opacity: [k(8.2, 1), k(8.9, 0)],
    } },
    { id: 'title', name: 'Titre', type: 'text', in: 2.6, out: 9, props: {
      x: 540, y: 820, text: 'Flux', font: 'Instrument Serif', italic: true, weight: '400', size: 150, fill: '#f4f1ff',
      reveal: [k(2.6, 0, 'outCubic'), k(3.8, 1)], revealStyle: 'blur', glow: 18, opacity: [k(8.2, 1), k(8.9, 0)],
    } },
    { id: 'orbit', name: 'Orbite', type: 'shape', in: 0.5, out: 9, props: {
      x: 540, y: 470, shape: 'ellipse', w: 860, h: 534, fill: '', stroke: '#8b7dff', strokeWidth: 1, glow: 10,
      trim: [k(0.5, 0, 'inOutExpo'), k(3, 1)], opacity: [k(0.5, 0.5), k(8.2, 0.5), k(8.9, 0)], rotation: [k(0, -8, 'linear'), k(9, 8)],
    } },
    { id: 'galaxy', name: 'Galaxie', type: 'canvas', in: 0, out: 9, code: GALAXY, params: { count: 2400, trail: 0.5 }, props: {
      x: 540, w: 1080, h: 1080, y: [k(0, 540, 'inOutCubic'), k(3, 470)], scale: [k(0, 1.25, 'outCubic'), k(3, 1), k(9, 1.06)],
      opacity: [k(0, 0, 'outCubic'), k(1, 1), k(8.2, 1), k(9, 0)],
    } },
  ],
});

// ---------- Data wave: 3D instanced bars ----------

const BARS = `// Paysage de 2 304 barres instanciées : la hauteur suit une onde et du bruit.
function setup(s) {
  const { THREE, scene } = s;
  s.env({ intensity: 0.8 });
  scene.fog = new THREE.Fog(s.params.fog, 14, 34);
  const n = 48;
  s.n = n;
  s.mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 1, 0.34).translate(0, 0.5, 0),
    new THREE.MeshPhysicalMaterial({ metalness: 0.35, roughness: 0.3, clearcoat: 0.6 }),
    n * n,
  );
  s.dummy = new THREE.Object3D();
  s.col = new THREE.Color();
  s.lo = new THREE.Color(s.params.low);
  s.hi = new THREE.Color(s.params.high);
  scene.add(s.mesh);
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-6, 10, 4);
  scene.add(key);
}

function render(s) {
  const { t, n } = s;
  const rise = s.range(t, 0, 2.4, s.ease.outExpo);
  const a = s.lerp(-0.9, 0.35, s.range(t, 0, s.dur, s.ease.inOutSine));
  s.camera.position.set(Math.sin(a) * 22, s.lerp(16, 9.5, rise), Math.cos(a) * 22);
  s.camera.lookAt(0, 0.6, 0);
  s.lo.set(s.params.low);
  s.hi.set(s.params.high);
  let i = 0;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const u = x - n / 2, v = z - n / 2;
      const d = Math.hypot(u, v);
      const wave = Math.sin(d * 0.45 - t * 2.2) * 0.5 + 0.5;
      const k = s.noise(u * 0.09, v * 0.09, t * 0.35) * 0.5 + 0.5;
      const h = 0.06 + (wave * 1.5 + k * 3.2 * s.params.amp) * rise * s.clamp((rise * 60 - d) / 6 + 1);
      s.dummy.position.set(u * 0.42, 0, v * 0.42);
      s.dummy.scale.set(1, Math.max(0.02, h), 1);
      s.dummy.updateMatrix();
      s.mesh.setMatrixAt(i, s.dummy.matrix);
      s.mesh.setColorAt(i, s.col.copy(s.lo).lerp(s.hi, s.clamp(h / 4)));
      i++;
    }
  }
  s.mesh.instanceMatrix.needsUpdate = true;
  s.mesh.instanceColor.needsUpdate = true;
}
`;

const COUNTER = `// Compteur qui s'emballe puis se pose, avec la courbe qui le suit.
function render(s) {
  const { ctx, t } = s;
  const k = s.range(t, 0.8, 3.6, s.ease.outExpo);
  const v = Math.round(k * s.params.target);
  ctx.font = '700 150px Inter';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('+' + v.toLocaleString('fr-FR') + ' %', 0, 150);
  ctx.strokeStyle = s.params.accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * 620;
    if (x / 620 > k) break;
    const y = 250 - Math.pow(i / 120, 2.4) * 60 - s.noise(i * 0.15, 3) * 16;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}
`;

const datawave = () => ({
  name: 'Data wave · 3D',
  width: 1920, height: 1080, fps: 30, duration: 8, background: '#05070d',
  layers: [
    { id: 'label', name: 'Libellé', type: 'text', in: 0.6, out: 8, props: {
      x: 140, y: 236, align: 'left', text: 'ACTIVITÉ · 30 DERNIERS JOURS', font: 'JetBrains Mono', weight: '500', size: 22, tracking: 5, fill: '#5ee1d6',
      reveal: [k(0.6, 0, 'linear'), k(1.6, 1)], revealStyle: 'type', opacity: [k(7.3, 1), k(7.9, 0)],
    } },
    { id: 'counter', name: 'Compteur', type: 'canvas', in: 0.6, out: 8, code: COUNTER, params: { target: 248, accent: '#5ee1d6' }, props: {
      x: 450, y: 420, w: 640, h: 280, opacity: [k(0.6, 0, 'outCubic'), k(1.2, 1), k(7.3, 1), k(7.9, 0)],
    } },
    { id: 'title', name: 'Titre', type: 'text', in: 3.2, out: 8, props: {
      x: 140, y: 600, align: 'left', text: 'Le réseau respire.', font: 'Bricolage Grotesque', weight: '700', size: 64, tracking: -1, fill: '#eef0f6',
      reveal: [k(3.2, 0, 'outExpo'), k(4.2, 1)], revealStyle: 'rise', opacity: [k(7.3, 1), k(7.9, 0)],
    } },
    { id: 'shade', name: 'Dégradé de lecture', type: 'shape', in: 0, out: 8, props: {
      x: 480, y: 540, shape: 'rect', w: 960, h: 1080, fill: '#05070de6', fill2: '#05070d00', gradientAngle: 0,
    } },
    { id: 'bars', name: 'Barres 3D', type: 'three', in: 0, out: 8, code: BARS, params: { low: '#1b1f4b', high: '#5ee1d6', fog: '#05070d', amp: 1 }, props: {
      x: 960, y: 540, w: 1920, h: 1080, opacity: [k(0, 0, 'outCubic'), k(0.8, 1), k(7.3, 1), k(8, 0)],
    } },
  ],
});

// ---------- Nebula: WebGPU compute particles ----------

const NEBULA = `// Nébuleuse WebGPU : 262 144 particules placées par un compute shader à partir du temps
// (on peut se déplacer n'importe où), un socle en argile, GTAO et bloom sur l'émissif.
function setup(s) {
  const { THREE, TSL: N, scene, camera, renderer } = s;
  const { Fn, instancedArray, instanceIndex: i, hash, float, vec2, vec3, uniform, sin, cos, mix, smoothstep, uv, positionWorld, TWO_PI } = N;
  s.env({ intensity: 0.5 });
  scene.environmentIntensity = 0.35;
  renderer.shadowMap.enabled = true;

  const key = new THREE.DirectionalLight('#ffe2c4', 2.4);
  key.position.set(4, 7, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
  key.shadow.bias = -0.0004;
  const rim = new THREE.DirectionalLight('#9fb4ff', 0.9);
  rim.position.set(-5, 3, -6);
  scene.add(key, rim);

  // sol sombre qui se fond dans le fond de la composition
  const ground = new THREE.MeshStandardNodeMaterial({ color: '#0b0c11', roughness: 0.8, transparent: true });
  ground.opacityNode = smoothstep(16, 7, positionWorld.xz.length());
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 96), ground);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // socle : trois blocs arrondis en argile et un anneau émissif
  const clay = new THREE.MeshPhysicalNodeMaterial({ color: s.params.clay, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5 });
  const blocks = [[2.2, 0.5, 2.2, 0.25], [1.5, 0.9, 1.5, 0.7], [0.9, 1.4, 0.9, 1.4]];
  for (const [w, h, d, y] of blocks) {
    const m = new THREE.Mesh(s.roundedBox(w, h, d, 0.14, 5), clay);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  s.ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 24, 160), new THREE.MeshStandardNodeMaterial({ color: '#000000', emissive: s.params.cool, emissiveIntensity: 5 }));
  s.ring.position.y = 2.25;
  scene.add(s.ring);

  // particules : tout se recalcule à partir de uT, aucune mémoire d'une image à l'autre
  const COUNT = 262144;
  s.uT = uniform(0); s.uGrow = uniform(0);
  s.cool = uniform(new THREE.Color(s.params.cool)); s.warm = uniform(new THREE.Color(s.params.warm));
  const pos = instancedArray(COUNT, 'vec3'), col = instancedArray(COUNT, 'vec3');
  s.place = Fn(() => {
    const h1 = hash(i), h2 = hash(i.add(7)), h3 = hash(i.add(19)), h4 = hash(i.add(31));
    const base = mix(1.8, 6.5, h1.pow(1.3));
    const r = base.mul(s.uGrow);
    const a = h2.mul(3).floor().mul(TWO_PI.div(3)).add(base.mul(1.1)).add(h3.sub(0.5).pow(3).mul(4)).add(s.uT.mul(float(1.1).div(base.add(0.5))));
    const y = h4.sub(0.5).pow(3).mul(1.2).add(sin(a.mul(2).add(s.uT.mul(0.8))).mul(base.mul(0.05))).add(1.35);
    const wob = vec3(sin(a.mul(5).add(h3.mul(20)).add(s.uT)), cos(a.mul(4).sub(s.uT.mul(0.7)).add(h1.mul(20))), sin(a.mul(7).add(s.uT.mul(1.3)))).mul(0.09);
    pos.element(i).assign(vec3(cos(a).mul(r), y, sin(a).mul(r)).add(wob));
    col.element(i).assign(mix(s.cool, s.warm, h1.pow(1.6)).mul(h3.mul(0.75).add(0.25)));
  })().compute(COUNT);
  const mat = new THREE.SpriteNodeMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const c = col.toAttribute();
  mat.positionNode = pos.toAttribute();
  mat.colorNode = c.mul(0.06);
  mat.emissiveNode = c.mul(s.params.glow);
  mat.opacityNode = smoothstep(0.5, 0.1, uv().distance(vec2(0.5)));
  mat.scaleNode = hash(i.add(3)).pow(3).mul(0.05).add(0.016);
  const parts = new THREE.Sprite(mat);
  parts.count = COUNT;
  parts.frustumCulled = false;
  scene.add(parts);

  s.post({ ao: { radius: 0.6, intensity: 1.4 }, bloom: { strength: 0.8, radius: 0.4 }, motion: { samples: 6, shutter: 0.5 } });
}

function render(s) {
  const { camera, t } = s;
  s.uT.value = t * s.params.speed;
  s.uGrow.value = 0.25 + 0.75 * s.range(t, 0, 2.6, s.ease.outExpo);
  s.cool.value.set(s.params.cool); s.warm.value.set(s.params.warm);
  s.renderer.compute(s.place);
  const a = 0.5 + t * 0.11, d = s.lerp(12.5, 9, s.range(t, 0, s.dur, s.ease.inOutSine));
  camera.position.set(Math.cos(a) * d, s.lerp(3.6, 2.6, s.p), Math.sin(a) * d);
  camera.lookAt(0, 1.2, 0);
  s.ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.25, t * 0.4, 0);
}
`;

const nebula = () => ({
  name: 'Nébuleuse · WebGPU',
  width: 1920, height: 1080, fps: 30, duration: 8, background: '#05060b',
  layers: [
    { id: 'cap', name: 'Légende', type: 'text', in: 3.2, out: 8, props: {
      x: 164, y: 990, align: 'left', text: '262 144 PARTICULES · COMPUTE WEBGPU', font: 'JetBrains Mono', weight: '500', size: 22, tracking: 3, fill: '#8f96aa',
      reveal: [k(3.2, 0, 'linear'), k(4.4, 1)], revealStyle: 'type', opacity: [k(7.3, 1), k(7.9, 0)],
    } },
    { id: 'title', name: 'Titre', type: 'text', in: 2.4, out: 8, props: {
      x: 160, y: 900, align: 'left', text: 'Nébuleuse', font: 'Instrument Serif', italic: true, weight: '400', size: 128, fill: '#f4f1ff',
      reveal: [k(2.4, 0, 'outCubic'), k(3.5, 1)], revealStyle: 'blur', opacity: [k(7.3, 1), k(7.9, 0)],
    } },
    { id: 'nebula', name: 'Nébuleuse 3D', type: 'three-gpu', in: 0, out: 8, code: NEBULA,
      params: { speed: 1, cool: '#5ee1d6', warm: '#ff9a5c', clay: '#d8d2c8', glow: 0.06 }, props: {
        x: 960, y: 540, w: 1920, h: 1080, opacity: [k(0, 0, 'outCubic'), k(0.8, 1), k(7.3, 1), k(8, 0)],
      } },
  ],
});

export const TEMPLATES = [
  { id: 'ident', name: "Ident · Studio", desc: 'Cristal de verre Three.js, anneau tracé, titre révélé.', format: '16:9', make: ident, tone: ['#4f46e5', '#5ee1d6'] },
  { id: 'kinetic', name: 'Typo cinétique', desc: 'Manifeste vertical, volets, pastille et trame animée.', format: '9:16', make: kinetic, tone: ['#ff4d2e', '#f1ece4'] },
  { id: 'flux', name: 'Flux · particules', desc: '2 400 particules en Canvas 2D, traînées calculées.', format: '1:1', make: flux, tone: ['#8b7dff', '#5ee1d6'] },
  { id: 'datawave', name: 'Data wave · 3D', desc: '2 304 barres instanciées, compteur et caméra en orbite.', format: '16:9', make: datawave, tone: ['#1b1f4b', '#5ee1d6'] },
  { id: 'nebula', name: 'Nébuleuse · WebGPU', desc: '262 144 particules en compute WebGPU, GTAO et bloom sur l’émissif.', format: '16:9', make: nebula, tone: ['#05060b', '#ff9a5c'] },
];
