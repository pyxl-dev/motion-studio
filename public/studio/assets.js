// Assets of the Studio: images, sounds, videos and references (links, moodboard) of a
// production, or of the shared library when `production` is empty (a logo, a jingle).
// Files go to /api/media/stream (streamed, up to 4 Go), then the catalogue entry to
// /api/assets. Used by the Assets tab of a production, the storyboard picker and the
// Library page of the Studio home.

import { $, $$, esc, ic, relTime, byLabel, byAgent, duration, bytes, mediaKind, modal } from './ui.js';
import * as comments from './comments.js';

let H = null;
const A = { list: null, loading: null, views: new Set(), uploads: [] };

export const KINDS = [['image', 'Images', 'image'], ['video', 'Vidéos', 'video'], ['audio', 'Sons', 'sound'], ['ref', 'Références', 'link']];
const kindLabel = { image: 'Image', video: 'Vidéo', audio: 'Son', ref: 'Référence' };

export async function all(host) {
  if (host) H = host;
  if (A.list) return A.list;
  A.loading ||= H.api('/api/assets').then((l) => (A.list = l)).catch((e) => { A.loading = null; throw e; });
  return A.loading;
}
export const byId = (id) => A.list?.find((a) => a.id === +id);
export const bySrc = (src) => A.list?.find((a) => a.src === src);
export const ofProduction = (id) => (A.list || []).filter((a) => a.production === id);
export { mediaKind };

export function onEvent(type, data) {
  if (!A.list) return;
  A.list = A.list.filter((a) => a.id !== data.id);
  if (type === 'asset') A.list.unshift(data);
  A.list.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
  refresh();
}

function refresh() {
  for (const v of A.views) {
    if (!v.el.isConnected) A.views.delete(v);
    else v.render();
  }
}

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------

/** Size, duration and, for a video, a poster frame, read in the browser before sending. */
async function probe(file) {
  const kind = file.type.split('/')[0];
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const bmp = await createImageBitmap(file);
      const meta = { w: bmp.width, h: bmp.height };
      bmp.close();
      return { meta };
    }
    if (kind === 'audio') {
      const a = new Audio();
      a.preload = 'metadata';
      a.src = url;
      await new Promise((ok, ko) => { a.onloadedmetadata = ok; a.onerror = ko; });
      return { meta: { dur: +a.duration.toFixed(2) } };
    }
    if (kind === 'video') {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = ko; });
      const meta = { w: v.videoWidth, h: v.videoHeight, dur: +v.duration.toFixed(2) };
      v.currentTime = Math.min(1, v.duration / 3 || 0);
      await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 3000); });
      const scale = Math.min(1, 640 / (v.videoWidth || 640));
      const c = document.createElement('canvas');
      c.width = Math.round((v.videoWidth || 640) * scale);
      c.height = Math.round((v.videoHeight || 360) * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const poster = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
      return { meta, poster };
    }
  } catch { /* a file the browser cannot read is still worth keeping */ } finally {
    URL.revokeObjectURL(url);
  }
  return { meta: {} };
}

function send(file, onProgress) {
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/media/stream');
    x.withCredentials = true;
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) ok(data); else ko(new Error(data.error || `HTTP ${x.status}`));
    };
    x.onerror = () => ko(new Error('connexion interrompue'));
    x.send(file);
  });
}

/** Sends files one by one and catalogues them. Returns the assets made. */
export async function upload(files, production, host) {
  if (host) H = host;
  const made = [];
  const jobs = [...files].map((f) => ({ name: f.name, file: f, p: 0 }));
  A.uploads.push(...jobs);
  refresh();
  for (const job of jobs) {
    try {
      const { meta, poster } = await probe(job.file);
      const res = await send(job.file, (p) => { job.p = p; refreshUploads(); });
      let posterUrl = null;
      if (poster) {
        const r = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', body: poster });
        if (r.ok) posterUrl = (await r.json()).url;
      }
      const asset = await H.api('/api/assets', { method: 'POST', body: {
        production: production || '', kind: res.kind, src: res.url, poster: posterUrl,
        name: job.name.replace(/\.[a-z0-9]+$/i, ''), meta: { ...meta, size: res.size },
      } });
      made.push(asset);
      onEvent('asset', asset);
    } catch (err) {
      H.toast(`${job.name} : ${err.message}`);
    }
    A.uploads.splice(A.uploads.indexOf(job), 1);
    refresh();
  }
  return made;
}

function refreshUploads() {
  for (const v of A.views) {
    const el = v.el.isConnected && $('.ax-uploads', v.el);
    if (el) el.innerHTML = uploadsHTML();
  }
}
const uploadsHTML = () => A.uploads.map((j) => `<div class="ax-up"><span class="ellip">${esc(j.name)}</span><i style="--p:${Math.round(j.p * 100)}%"></i><b>${Math.round(j.p * 100)} %</b></div>`).join('');

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

const host_ = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Small picture of an asset, for cards, storyboard frames and pickers. */
export function thumb(a) {
  if (!a) return '';
  if (a.kind === 'image' || (a.kind === 'ref' && a.src)) return `<img src="${esc(a.src)}" alt="" loading="lazy">`;
  if (a.kind === 'video') return a.poster ? `<img src="${esc(a.poster)}" alt="" loading="lazy">` : `<video src="${esc(a.src)}#t=0.5" muted preload="metadata"></video>`;
  return `<div class="ax-ph" data-k="${a.kind}">${ic(a.kind === 'audio' ? 'sound' : 'link')}<span>${esc(a.kind === 'ref' ? host_(a.url) : a.name)}</span></div>`;
}

/** Picture of a media path (a storyboard frame without a catalogued asset). */
export function mediaThumb(src, poster) {
  const a = bySrc(src);
  if (a) return thumb(a);
  const kind = mediaKind(src);
  if (kind === 'video') return poster ? `<img src="${esc(poster)}" alt="">` : `<video src="${esc(src)}#t=0.5" muted preload="metadata"></video>`;
  if (kind === 'audio') return `<div class="ax-ph" data-k="audio">${ic('sound')}</div>`;
  return `<img src="${esc(src)}" alt="">`;
}

function metaLine(a) {
  const m = a.meta || {};
  const bits = [kindLabel[a.kind]];
  if (m.w && m.h) bits.push(`${m.w}×${m.h}`);
  if (m.dur) bits.push(duration(m.dur, true));
  if (a.kind === 'ref' && a.url) bits.push(host_(a.url));
  return bits.join(' · ');
}

function cardHTML(a, v) {
  const open = comments.openOf(null, `asset:${a.id}`).length;
  const prod = v.opts.production == null ? (a.production ? v.opts.names?.[a.production] || a.production : 'Commun') : '';
  return `<button class="ax-card" data-ax="open" data-id="${a.id}">
    <div class="ax-thumb" data-k="${a.kind}">${thumb(a)}
      ${a.kind === 'video' || a.kind === 'audio' ? `<span class="ax-badge">${ic(a.kind === 'video' ? 'video' : 'sound')}${a.meta?.dur ? duration(a.meta.dur, true) : ''}</span>` : ''}
      ${open ? `<span class="ax-cx" title="${open} retour${open > 1 ? 's' : ''} en attente">${ic('chat')}${open}</span>` : ''}</div>
    <div class="ax-name ellip">${byAgent(a.by) ? ic('sparkle') : ''}${esc(a.name || 'Sans nom')}</div>
    <div class="ax-meta ellip">${esc(metaLine(a))}${prod ? ` · ${esc(prod)}` : ''}</div>
  </button>`;
}

/**
 * Asset grid with filters, upload (button and drag and drop) and links.
 * opts: { production (id, '' = shared library, null = everything), names: {id: name},
 * productions: [{id, name}] (library: production filter) }.
 */
export function grid(el, host, opts) {
  H = host;
  const v = { el, opts, kind: '', q: '', prod: opts.production == null ? '*' : opts.production };
  v.render = () => {
    const scope = (A.list || []).filter((a) => v.prod === '*' || a.production === v.prod);
    const q = v.q.trim().toLowerCase();
    const shown = scope.filter((a) => (!v.kind || a.kind === v.kind)
      && (!q || `${a.name} ${a.note} ${(a.tags || []).join(' ')} ${a.url || ''}`.toLowerCase().includes(q)));
    const count = (k) => scope.filter((a) => a.kind === k).length;
    const focus = document.activeElement?.id === 'axQ' && el.contains(document.activeElement) ? document.activeElement.selectionStart : null;
    el.innerHTML = `
      <div class="ax-bar">
        <div class="seg">
          <button data-ax="kind" data-k="" class="${v.kind ? '' : 'on'}">Tout <b>${scope.length}</b></button>
          ${KINDS.map(([k, l]) => `<button data-ax="kind" data-k="${k}" class="${v.kind === k ? 'on' : ''}">${l} <b>${count(k)}</b></button>`).join('')}
        </div>
        ${opts.productions ? `<select class="sx-select" data-ax="prod" aria-label="Production">
          <option value="*" ${v.prod === '*' ? 'selected' : ''}>Toutes les productions</option>
          <option value="" ${v.prod === '' ? 'selected' : ''}>Bibliothèque commune</option>
          ${opts.productions.map((p) => `<option value="${esc(p.id)}" ${v.prod === p.id ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select>` : ''}
        <label class="sx-search">${ic('search')}<input id="axQ" type="search" placeholder="Chercher" value="${esc(v.q)}" autocomplete="off"></label>
        <span class="ax-actions">
          <button class="btn sm" data-ax="link">${ic('link')}Lien</button>
          <label class="btn sm primary">${ic('upload')}Ajouter<input type="file" multiple accept="image/*,video/*,audio/*" data-ax="files" hidden></label>
        </span>
      </div>
      <div class="ax-uploads">${uploadsHTML()}</div>
      ${A.list == null ? '<div class="ax-grid"><div class="sx-skel"></div><div class="sx-skel"></div></div>'
        : !shown.length ? `<div class="ax-drop"><b>${scope.length ? 'Aucun asset ne correspond.' : 'Glisse tes fichiers ici'}</b>
            ${scope.length ? '' : 'Captures, rushes, logos, musiques, références : tout ce dont la vidéo a besoin. Un script peut en ajouter avec <code>tools/motion.ts media</code>.'}</div>`
          : `<div class="ax-grid">${shown.map((a) => cardHTML(a, v)).join('')}</div>`}`;
    if (focus != null) { const i = $('#axQ', el); i.focus(); i.setSelectionRange(focus, focus); }
  };
  const target = () => (v.prod === '*' ? '' : v.prod);
  el.onclick = async (e) => {
    const b = e.target.closest('[data-ax]');
    if (!b) return;
    if (b.dataset.ax === 'kind') { v.kind = b.dataset.k; v.render(); }
    else if (b.dataset.ax === 'open') viewer(host, byId(b.dataset.id), opts);
    else if (b.dataset.ax === 'link') addLink(host, target());
  };
  el.oninput = (e) => { if (e.target.id === 'axQ') { v.q = e.target.value; v.render(); } };
  el.onchange = (e) => {
    if (e.target.dataset.ax === 'files' && e.target.files.length) upload(e.target.files, target());
    else if (e.target.dataset.ax === 'prod') { v.prod = e.target.value; v.render(); }
  };
  el.ondragover = (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); el.classList.add('ax-over'); } };
  el.ondragleave = (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('ax-over'); };
  el.ondrop = (e) => {
    el.classList.remove('ax-over');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    upload(e.dataTransfer.files, target());
  };
  A.views.add(v);
  v.render();
  if (!A.list) Promise.all([all(), comments.all(host)]).then(() => v.render()).catch((err) => H.toast(err.message));
  return v;
}

function addLink(host, production) {
  const m = modal(`<form class="cx-form">
    <div class="cx-modal-head"><h3>Ajouter une référence</h3><button type="button" class="sx-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <label class="cx-field"><span>Lien</span><input name="url" type="url" required placeholder="https://…"></label>
    <label class="cx-field"><span>Nom</span><input name="name" maxlength="200" placeholder="Ce que c'est"></label>
    <label class="cx-field"><span>Pourquoi</span><textarea name="note" rows="3" placeholder="Ce qui me plaît : le rythme, la typo, la couleur…"></textarea></label>
    <div class="cx-modal-foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Ajouter</button></div></form>`);
  const f = $('form', m.el);
  f.url.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const a = await host.api('/api/assets', { method: 'POST', body: { production, kind: 'ref', url: f.url.value.trim(), name: f.name.value.trim() || host_(f.url.value), note: f.note.value.trim() } });
      onEvent('asset', a);
      m.close();
    } catch (err) { host.toast(err.message); }
  };
}

/** Big view of an asset: preview, name, tags, note, production, feedback, delete. */
export function viewer(host, a, opts = {}) {
  if (!a) return;
  H = host;
  const preview = a.kind === 'video' ? `<video src="${esc(a.src)}" controls playsinline preload="metadata" ${a.poster ? `poster="${esc(a.poster)}"` : ''}></video>`
    : a.kind === 'audio' ? `<div class="ax-audio">${ic('sound')}<audio src="${esc(a.src)}" controls preload="metadata"></audio></div>`
      : a.src ? `<img src="${esc(a.src)}" alt="">` : `<div class="ax-ph big" data-k="ref">${ic('link')}<span>${esc(host_(a.url))}</span></div>`;
  const m = modal(`
    <div class="cx-modal-head"><h3 class="ellip">${esc(kindLabel[a.kind])}</h3><button class="sx-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
    <div class="ax-view">
      <div class="ax-preview">${preview}</div>
      <div class="ax-side">
        <label class="cx-field"><span>Nom</span><input data-k="name" value="${esc(a.name)}" maxlength="200"></label>
        ${a.url ? `<a class="ax-url ellip" href="${esc(a.url)}" target="_blank" rel="noopener">${ic('open')}${esc(a.url)}</a>` : ''}
        ${opts.productions ? `<label class="cx-field"><span>Production</span><select class="sx-select" data-k="production">
          <option value="">Bibliothèque commune</option>${opts.productions.map((p) => `<option value="${esc(p.id)}" ${a.production === p.id ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('')}</select></label>` : ''}
        <label class="cx-field"><span>Tags</span><input data-k="tags" value="${esc((a.tags || []).join(', '))}" placeholder="logo, intro, b-roll"></label>
        <label class="cx-field"><span>Note</span><textarea data-k="note" rows="3" placeholder="Ce que c'est, où l'utiliser">${esc(a.note)}</textarea></label>
        <div class="ax-facts">
          <span>${esc(metaLine(a))}${a.meta?.size ? ` · ${bytes(a.meta.size)}` : ''}</span>
          <span>${byAgent(a.by) ? ic('sparkle') : ''}${esc(byLabel(a.by))} · ${relTime(a.created_at)}</span>
          ${a.src ? `<button class="ax-path" data-ax="copy" title="Copier le chemin à donner à un agent ou à un motion"><code>${esc(a.src)}</code>${ic('copy')}</button>` : ''}
        </div>
        <h4>Retours</h4>
        <div class="ax-thread"></div>
        <button class="btn sm ax-del" data-ax="del">${ic('trash')}Supprimer l’asset</button>
      </div>
    </div>`, { wide: true });
  comments.mount($('.ax-thread', m.el), host, {
    production: a.production, target: () => `asset:${a.id}`, filter: (c) => c.target === `asset:${a.id}`,
    placeholder: 'Ce qu’il faut changer sur cet asset…', empty: 'Aucun retour sur cet asset.',
  });
  const patch = async (body) => {
    try { onEvent('asset', Object.assign(a, await host.api(`/api/assets/${a.id}`, { method: 'PATCH', body }))); } catch (err) { host.toast(err.message); }
  };
  m.el.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (k === 'tags') patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) });
    else if (k) patch({ [k]: e.target.value.trim() });
  });
  m.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-ax]')?.dataset.ax;
    if (act === 'copy') { await navigator.clipboard.writeText(a.src); host.toast('Chemin copié'); }
    else if (act === 'del' && confirm(`Supprimer « ${a.name || 'cet asset'} » ? Le fichier part à la prochaine purge s’il ne sert plus.`)) {
      try { await host.api(`/api/assets/${a.id}`, { method: 'DELETE' }); onEvent('asset_deleted', a); m.close(); } catch (err) { host.toast(err.message); }
    }
  });
}

/**
 * Picker for a storyboard frame: the images and videos of the production (and the shared
 * library), the motions of the production, and an upload. Resolves to
 * `{ media, poster }`, `{ motion }`, `{ clear: true }` or null.
 */
export function pick(host, { production, motions = [], current, title = 'Visuel du plan' }) {
  H = host;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } m.close(); };
    const m = modal(`
      <div class="cx-modal-head"><h3>${esc(title)}</h3><button class="sx-ib" data-close aria-label="Fermer">${ic('close')}</button></div>
      <div class="ax-pick"></div>`, { wide: true, onClose: () => { if (!done) { done = true; resolve(null); } } });
    const body = $('.ax-pick', m.el);
    const render = () => {
      const list = (A.list || []).filter((a) => (a.production === production || a.production === '') && (a.kind === 'image' || a.kind === 'video' || (a.kind === 'ref' && a.src)));
      body.innerHTML = `
        <div class="ax-pick-bar">
          <label class="btn sm primary">${ic('upload')}Téléverser<input type="file" multiple accept="image/*,video/*" data-p="files" hidden></label>
          ${current ? `<button class="btn sm" data-p="clear">${ic('close')}Retirer le visuel</button>` : ''}
        </div>
        <div class="ax-uploads">${uploadsHTML()}</div>
        ${motions.length ? `<h4>Motions</h4><div class="ax-grid sm">${motions.map((p) => `<button class="ax-card" data-p="motion" data-id="${esc(p.id)}">
          <div class="ax-thumb">${p.poster ? `<img src="${esc(p.poster)}" alt="">` : `<div class="ax-ph">${ic('film')}</div>`}</div><div class="ax-name ellip">${esc(p.name || p.id)}</div></button>`).join('')}</div>` : ''}
        <h4>Images et vidéos</h4>
        ${list.length ? `<div class="ax-grid sm">${list.map((a) => `<button class="ax-card${current === a.src ? ' on' : ''}" data-p="asset" data-id="${a.id}">
          <div class="ax-thumb" data-k="${a.kind}">${thumb(a)}</div><div class="ax-name ellip">${esc(a.name || 'Sans nom')}</div></button>`).join('')}</div>`
          : '<div class="cx-empty">Aucune image ni vidéo dans cette production : téléverse-en une.</div>'}`;
    };
    body.onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      if (b.dataset.p === 'clear') finish({ clear: true });
      else if (b.dataset.p === 'motion') finish({ motion: b.dataset.id });
      else if (b.dataset.p === 'asset') { const a = byId(b.dataset.id); finish({ media: a.src, poster: a.poster || undefined }); }
    };
    body.onchange = async (e) => {
      if (e.target.dataset.p !== 'files') return;
      const made = await upload(e.target.files, production, host);
      if (made.length === 1) finish({ media: made[0].src, poster: made[0].poster || undefined });
      else render();
    };
    const v = { el: body, render };
    A.views.add(v);
    render();
    if (!A.list) all().then(render).catch((err) => host.toast(err.message));
  });
}

// ---------------------------------------------------------------------
// Sound library (/sfx, bought packs, behind the login)
// ---------------------------------------------------------------------

let sfx = null;
let playing = null;

/** Read-only browser of the SFX packs, with listening and the path to copy. */
export async function sfxBrowser(el, host) {
  el.innerHTML = '<div class="sx-skel"></div>';
  try { sfx ||= await fetch('/sfx/index.json', { credentials: 'same-origin' }).then((r) => r.json()); } catch { sfx = null; }
  if (!el.isConnected) return;
  if (!sfx?.packs?.length) { el.innerHTML = '<div class="cx-empty">Bibliothèque de sons introuvable.</div>'; return; }
  el.innerHTML = sfx.packs.map((p) => `<details class="sfx-pack"><summary>${esc(p.name)} <small>${p.categories.reduce((n, c) => n + c.items.length, 0)} sons</small></summary>
    ${p.categories.map((c) => `<h4>${esc(c.name)}</h4><div class="sfx-items">${c.items.map((i) => `<div class="sfx-item">
      <button class="cx-ib" data-sfx="play" data-src="${esc(i.src)}" aria-label="Écouter">${ic('play')}</button>
      <span class="ellip">${esc(i.name)}</span><small>${i.dur ? `${String(i.dur).replace('.', ',')} s` : ''}</small>
      <button class="cx-ib" data-sfx="copy" data-src="${esc(i.src)}" title="Copier le chemin" aria-label="Copier le chemin">${ic('copy')}</button></div>`).join('')}</div>`).join('')}</details>`).join('');
  el.onclick = async (e) => {
    const b = e.target.closest('[data-sfx]');
    if (!b) return;
    if (b.dataset.sfx === 'copy') { await navigator.clipboard.writeText(b.dataset.src); host.toast('Chemin copié'); return; }
    const same = playing?.src.endsWith(b.dataset.src);
    playing?.pause();
    $$('[data-sfx=play]', el).forEach((x) => { x.innerHTML = ic('play'); });
    if (same) { playing = null; return; }
    playing = new Audio(b.dataset.src);
    playing.play();
    b.innerHTML = ic('pause');
    playing.onended = () => { b.innerHTML = ic('play'); playing = null; };
  };
}
