// Motion Studio shell: hash router and the host helpers the editor expects
// ({ api, toast, esc, setTitle }). Routes: #/ gallery, #/m/<id> editor.
// The editor still writes #/studio/... links, so both forms are accepted.

const $ = (s) => document.querySelector(s);
const view = $('#view');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'x-requested-with': 'studio', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const setTitle = (...parts) => { document.title = [...parts.filter(Boolean), 'Motion Studio'].join(' · '); };

const host = { api, toast, esc, setTitle };
let studio = null;
const load = () => (studio ||= import('/studio/studio.js'));

async function route() {
  const path = location.hash.replace(/^#/, '').replace(/^\/studio(?=\/|$)/, '') || '/';
  const m = await load();
  const motion = path.match(/^\/m\/([^/?]+)/);
  if (motion) return m.openEditor(decodeURIComponent(motion[1]), host);
  m.closeEditor();
  setTitle();
  view.className = 'shell';
  return m.gallery(view, host);
}

addEventListener('hashchange', route);
route();

// Live updates: a motion pushed by a script or an agent reloads in the open editor.
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  let msg;
  try { msg = JSON.parse(e.data); } catch { return; }
  const t = msg.type;
  if (t.startsWith('comment')) import('/studio/comments.js').then((c) => { c.onEvent(t, msg.data); studio && load().then((m) => m.onFeedback()); });
  if (t.startsWith('asset')) import('/studio/assets.js').then((a) => a.onEvent(t, msg.data));
  if (t.startsWith('studio') && studio) load().then((m) => m.onEvent(t, msg.data));
};
