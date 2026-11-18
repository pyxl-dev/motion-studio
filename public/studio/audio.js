// Studio audio: sound layers (type "audio") played with the Web Audio API in the editor and
// mixed offline for the export. A sound layer is a clip of a file: it starts at layer.in, plays
// the file from props.offset, stops at layer.out; volume takes keyframes, fades are in seconds.
// A video layer's own sound is played and mixed the same way, unless props.muted.

import { valueAt } from './engine.js';

export const isAudio = (l) => l.type === 'audio';
/** Layers whose file is heard: sound layers, and video layers not muted. */
export const sounds = (l) => isAudio(l) || (l.type === 'video' && !valueAt(l.props?.muted ?? false, 0));

// A video's sound is decoded from the whole file: past this size it stays silent rather than
// filling the memory of the tab (a long rush is better cut first).
const MAX_FETCH = 1.5e9;

let actx = null;
export function context() {
  actx ||= new AudioContext({ latencyHint: 'interactive' });
  return actx;
}

// ---------- Decoding ----------

const loading = new Map(); // src -> Promise<AudioBuffer | null>
const decoded = new Map(); // src -> AudioBuffer
const failed = new Set();

export const bufferOf = (src) => decoded.get(src) || null;
export const hasFailed = (src) => failed.has(src);

export function load(src) {
  if (!src) return Promise.resolve(null);
  if (!loading.has(src)) {
    loading.set(src, fetch(src, { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (+r.headers.get('content-length') > MAX_FETCH) { r.body?.cancel(); throw new Error('too big'); }
        return r.arrayBuffer();
      })
      .then((b) => context().decodeAudioData(b))
      .then((buf) => { decoded.set(src, buf); return buf; })
      .catch(() => { failed.add(src); return null; }));
  }
  return loading.get(src);
}

/** Starts decoding every sound of the project; onLoaded runs when a new one is ready. */
export function preload(project, onLoaded) {
  for (const l of project.layers || []) {
    const src = l.props?.src;
    if (sounds(l) && src && !decoded.has(src) && !failed.has(src)) load(src).then((b) => b && onLoaded?.(l));
  }
}

// ---------- Mixing ----------

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const offsetOf = (l) => Math.max(0, +valueAt(l.props?.offset ?? 0, 0) || 0);

/** Gain of a sound layer at composition time t: volume keyframes times the fades. */
export function gainAt(l, t) {
  const p = l.props || {};
  let g = Math.max(0, +valueAt(p.volume ?? 1, t) || 0);
  const fi = +valueAt(p.fadeIn ?? 0, 0) || 0, fo = +valueAt(p.fadeOut ?? 0, 0) || 0;
  if (fi > 0) g *= clamp01((t - l.in) / fi);
  if (fo > 0) g *= clamp01((l.out - t) / fo);
  return g;
}

/**
 * Schedules the project's sounds on an audio context: composition time `from` plays at context
 * time `at`. Returns a function that stops them. Sounds not decoded yet are skipped.
 */
export function schedule(ctx, dest, project, from, at, { rate = 1, until = project.duration } = {}) {
  const nodes = [];
  for (const l of project.layers || []) {
    if (!sounds(l) || l.hidden) continue;
    const buf = decoded.get(l.props?.src);
    if (!buf) continue;
    const start = Math.max(l.in, from), end = Math.min(l.out, until, project.duration);
    const offset = offsetOf(l) + (start - l.in);
    const len = Math.min(end - start, buf.duration - offset);
    if (len <= 0.001) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    // Volume curve sampled at 100 Hz of composition time: keyframes and fades in one automation.
    const n = Math.max(2, Math.ceil(len * 100) + 1);
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = gainAt(l, start + (len * i) / (n - 1));
    const when = at + (start - from) / rate;
    gain.gain.value = curve[0];
    gain.gain.setValueCurveAtTime(curve, when, len / rate);
    src.connect(gain).connect(dest);
    src.start(when, offset, len);
    nodes.push(src);
  }
  return () => { for (const s of nodes) { try { s.stop(); } catch { /* already ended */ } } };
}

export const audibleLayers = (project) => (project.layers || []).filter((l) => sounds(l) && !l.hidden && l.props?.src);

/** Renders the whole soundtrack, or null when the project has no sound. */
export async function mixdown(project, sampleRate = 48000) {
  const layers = audibleLayers(project);
  if (!layers.length) return null;
  await Promise.all(layers.map((l) => load(l.props.src)));
  if (!layers.some((l) => decoded.has(l.props.src))) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(project.duration * sampleRate), sampleRate);
  schedule(ctx, ctx.destination, project, 0, 0);
  return ctx.startRendering();
}

// ---------- Live playback ----------

let live = null; // { stop, at, from, rate }

/** Plays the soundtrack from composition time `from`; returns the clock to follow. */
export function play(project, from, rate = 1) {
  stopAll();
  const ctx = context();
  if (ctx.state !== 'running') ctx.resume();
  const at = ctx.currentTime + 0.06;
  live = { stop: schedule(ctx, ctx.destination, project, from, at, { rate }), at, from, rate };
  return live;
}

/** Composition time of the running playback, from the audio clock (null when not playing). */
export function clockTime() {
  if (!live || !actx || actx.state !== 'running') return null;
  return live.from + Math.max(0, actx.currentTime - live.at) * live.rate;
}

export function stopAll() {
  live?.stop();
  live = null;
}

let blipStop = null, blipAt = 0;
/** A few milliseconds of sound under the playhead while scrubbing. */
export function scrub(project, t) {
  const now = performance.now();
  if (now - blipAt < 70) return;
  blipAt = now;
  blipStop?.();
  const ctx = context();
  if (ctx.state !== 'running') ctx.resume();
  blipStop = schedule(ctx, ctx.destination, project, t, ctx.currentTime + 0.01, { until: t + 0.09 });
}

// ---------- Waveforms ----------

const peaksCache = new Map(); // src -> Float32Array, one peak per 1/200 s
const PEAK_RATE = 200;

export function peaks(src) {
  const buf = decoded.get(src);
  if (!buf) return null;
  if (!peaksCache.has(src)) {
    const n = Math.ceil(buf.duration * PEAK_RATE);
    const out = new Float32Array(n);
    const step = buf.sampleRate / PEAK_RATE;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        let m = out[i];
        const end = Math.min(d.length, Math.floor((i + 1) * step));
        for (let j = Math.floor(i * step); j < end; j++) { const v = Math.abs(d[j]); if (v > m) m = v; }
        out[i] = m;
      }
    }
    peaksCache.set(src, out);
  }
  return peaksCache.get(src);
}

/** Draws the part of a layer's file that plays, over its clip in the timeline. */
export function drawWave(canvas, l, color) {
  const pk = peaks(l.props?.src);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!pk || !w || !h) return;
  const dpr = devicePixelRatio || 1;
  const cw = Math.min(8000, Math.round(w * dpr)), ch = Math.round(h * dpr);
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  const off = offsetOf(l), dur = l.out - l.in;
  const mid = ch / 2;
  for (let x = 0; x < cw; x++) {
    const a = Math.floor((off + (x / cw) * dur) * PEAK_RATE);
    const b = Math.max(a + 1, Math.floor((off + ((x + 1) / cw) * dur) * PEAK_RATE));
    let m = 0;
    for (let i = a; i < b && i < pk.length; i++) if (pk[i] > m) m = pk[i];
    const t = l.in + (x / cw) * dur;
    // Square root: quiet tails stay visible in a 20 px lane, as in an editing tool.
    const v = Math.min(1, Math.sqrt(m * Math.min(2, gainAt(l, t))));
    const hh = Math.max(dpr * 0.5, v * mid * 0.92);
    g.fillRect(x, mid - hh, 1, hh * 2);
  }
}
