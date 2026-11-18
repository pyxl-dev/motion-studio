// Feedback ("retours") of the Studio: notes left on an instant of a motion, for a person
// or an agent to work through (`tools/motion.ts feedback`, then `tools/motion.ts done <n>
// "reply"`). Kept by the server (/api/comments); every
// change comes back as the SSE events `comment` / `comment_deleted`.

import { $, esc, ic, relTime, byLabel, byAgent } from './ui.js';

let H = null;
const C = { list: null, loading: null, views: new Set() };

/** Every comment, loaded once and kept current by the SSE events. */
export async function all(host) {
  if (host) H = host;
  if (C.list) return C.list;
  C.loading ||= H.api('/api/comments').then((l) => (C.list = l)).catch((e) => { C.loading = null; throw e; });
  return C.loading;
}

export const openOf = (production, target) => (C.list || []).filter((c) => c.state === 'open'
  && (production == null || c.production === production) && (target == null || c.target === target || c.target.startsWith(`${target}@`)));

export function onEvent(type, data) {
  if (!C.list) return;
  C.list = C.list.filter((c) => c.id !== data.id);
  if (type === 'comment') C.list.push(data);
  C.list.sort((a, b) => a.created_at - b.created_at || a.id - b.id);
  refresh();
}

/** Re-renders every thread still on screen. */
export function refresh() {
  for (const v of C.views) {
    if (!v.el.isConnected) C.views.delete(v);
    else v.render();
  }
}

/** Short label of what a comment is about. `names` maps asset ids and motion ids to names. */
export function targetLabel(target, names = {}) {
  if (!target) return 'Général';
  const [kind, rest] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)];
  if (kind === 'cue') return `Plan ${rest}`;
  if (kind === 'asset') return names[`asset:${rest}`] || `Asset ${rest}`;
  if (kind === 'motion') {
    const [id, at] = rest.split('@');
    const name = names[`motion:${id}`] || id;
    return at != null ? `${name} à ${Number(at).toFixed(1).replace('.', ',')} s` : name;
  }
  return target;
}

function itemHTML(c, opts) {
  const label = opts.labels ? [opts.prefix?.(c), targetLabel(c.target, opts.names)].filter(Boolean).join(' · ') : '';
  const href = opts.href?.(c);
  const target = label ? (href ? `<a class="cx-target" href="${esc(href)}">${esc(label)}</a>` : `<button class="cx-target" data-cx="target">${esc(label)}</button>`) : '';
  return `<div class="cx-c ${c.state}" data-cid="${c.id}">
    <div class="cx-c-head">
      <span class="cx-who">${byAgent(c.by) ? ic('sparkle') : ''}${esc(byLabel(c.by))}</span>${target}
      <span class="cx-time">${relTime(c.created_at)}</span>
      <button class="cx-ib" data-cx="toggle" title="${c.state === 'open' ? 'Marquer fait' : 'Rouvrir'}" aria-label="${c.state === 'open' ? 'Marquer fait' : 'Rouvrir'}">${ic(c.state === 'open' ? 'check' : 'restart')}</button>
      <button class="cx-ib" data-cx="del" title="Supprimer" aria-label="Supprimer">${ic('trash')}</button>
    </div>
    <div class="cx-c-body">${esc(c.body).replace(/\n/g, '<br>')}</div>
    ${c.reply ? `<div class="cx-reply"><b>${byAgent(c.reply_by) ? ic('sparkle') : ''}${esc(byLabel(c.reply_by))}</b> ${esc(c.reply).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`;
}

/**
 * A thread in `el`: the comments `filter` keeps, open first, and a box to add one.
 * opts: { production, target() (target of a new comment), filter(c), labels, names,
 * prefix(c) (before the label), href(c), onTarget(c), placeholder, compose (default true), empty }.
 */
export function mount(el, host, opts) {
  H = host;
  const view = { el, opts, showDone: false };
  view.render = () => {
    const list = (C.list || []).filter(opts.filter);
    const open = list.filter((c) => c.state === 'open');
    const done = list.filter((c) => c.state !== 'open').reverse();
    const draft = $('.cx-compose textarea', el)?.value || '';
    el.innerHTML = `
      ${opts.compose === false ? '' : `<form class="cx-compose">
        <textarea rows="2" placeholder="${esc(opts.placeholder || 'Un retour à cet instant…')}">${esc(draft)}</textarea>
        <button class="btn sm primary" type="submit">${ic('chat')}Envoyer</button></form>`}
      ${C.list == null ? '<div class="cx-empty">Chargement…</div>' : ''}
      ${open.map((c) => itemHTML(c, opts)).join('')}
      ${C.list && !open.length ? `<div class="cx-empty">${esc(opts.empty || 'Aucun retour en attente.')}</div>` : ''}
      ${done.length ? `<button class="cx-more" data-cx="done">${view.showDone ? 'Masquer' : 'Voir'} les ${done.length} retour${done.length > 1 ? 's' : ''} traité${done.length > 1 ? 's' : ''}</button>
        ${view.showDone ? done.map((c) => itemHTML(c, opts)).join('') : ''}` : ''}`;
  };
  el.onsubmit = async (e) => {
    e.preventDefault();
    const ta = $('.cx-compose textarea', el);
    const body = ta.value.trim();
    if (!body) return;
    try {
      const c = await H.api('/api/comments', { method: 'POST', body: { production: opts.production || '', target: opts.target?.() || '', body } });
      // The SSE echo may have re-rendered the thread already: clear the box on screen now.
      const cur = $('.cx-compose textarea', el);
      if (cur) cur.value = '';
      onEvent('comment', c);
    } catch (err) { H.toast(err.message); }
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('.cx-compose textarea')) { e.preventDefault(); el.querySelector('.cx-compose').requestSubmit(); }
  };
  el.onclick = async (e) => {
    const b = e.target.closest('[data-cx]');
    if (!b) return;
    const act = b.dataset.cx;
    if (act === 'done') { view.showDone = !view.showDone; return view.render(); }
    const c = C.list?.find((x) => x.id === +b.closest('[data-cid]')?.dataset.cid);
    if (!c) return;
    try {
      if (act === 'target') opts.onTarget?.(c);
      else if (act === 'toggle') onEvent('comment', await H.api(`/api/comments/${c.id}`, { method: 'PATCH', body: { state: c.state === 'open' ? 'done' : 'open' } }));
      else if (act === 'del' && confirm('Supprimer ce retour ?')) {
        await H.api(`/api/comments/${c.id}`, { method: 'DELETE' });
        onEvent('comment_deleted', c);
      }
    } catch (err) { H.toast(err.message); }
  };
  C.views.add(view);
  view.render();
  if (!C.list) all().then(() => view.render()).catch((err) => H.toast(err.message));
  return view;
}

/** Floating thread next to `anchor` (a storyboard frame, an asset). */
export function popover(anchor, host, opts) {
  document.querySelector('.cx-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'cx-pop';
  pop.innerHTML = `<div class="cx-pop-head"><b>${esc(opts.title || 'Retours')}</b><button class="cx-ib" data-close aria-label="Fermer">${ic('close')}</button></div><div class="cx-pop-body"></div>`;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(360, innerWidth - 24);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left))}px`;
  pop.style.top = `${r.bottom + scrollY + 8}px`;
  mount($('.cx-pop-body', pop), host, opts);
  $('.cx-pop-body textarea', pop)?.focus();
  const off = (e) => {
    if (pop.contains(e.target) && !e.target.closest('[data-close]')) return;
    pop.remove();
    document.removeEventListener('pointerdown', off, true);
    document.removeEventListener('keydown', esc_, true);
  };
  const esc_ = (e) => { if (e.key === 'Escape') off(e); };
  setTimeout(() => {
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', esc_, true);
  });
  pop.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) off(e); });
}
