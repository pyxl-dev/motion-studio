// Motion Studio server: serves the editor (public/) and a small JSON API that stores
// everything on disk under DATA_DIR. No dependencies, run with `bun server.ts`.
//
// Motions:  GET/PUT/DELETE /api/studio/projects[/<id>]  one JSON file per motion, with a
//           revision counter; `base_rev` in a PUT guards against overwriting a newer one.
// Media:    POST /api/media/stream (raw body), POST /api/media (multipart or raw) -> /media/<file>
// Assets:   GET/POST /api/assets, PATCH/DELETE /api/assets/<n>   the media library
// Feedback: GET/POST /api/comments, PATCH/DELETE /api/comments/<n>  notes pinned to an instant
// Events:   GET /api/events (SSE) so an open editor reloads when a script pushes a motion.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, 'public');
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 5317);
const HOST = process.env.HOST || '127.0.0.1';
const DIRS = { motions: join(DATA, 'motions'), media: join(DATA, 'media') };
const MAX_DOC = 8 * 1024 * 1024;
const SUMMARY = ['id', 'name', 'width', 'height', 'fps', 'duration', 'background', 'production', 'rev', 'updated_at', 'updated_by', 'poster'];

await mkdir(DIRS.motions, { recursive: true });
await mkdir(DIRS.media, { recursive: true });

const now = () => Math.floor(Date.now() / 1000);
const json = (data: unknown, status = 200) => Response.json(data, { status });
const err = (msg: string, status = 400) => json({ error: msg }, status);
const validId = (id: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
const author = (req: Request) => req.headers.get('x-studio-author')?.slice(0, 40) || (req.headers.get('x-requested-with') === 'studio' ? 'app' : 'api');

// ---------- Events (SSE) ----------
const clients = new Set<ReadableStreamDefaultController>();
function emit(type: string, data: unknown) {
  const msg = new TextEncoder().encode(`data: ${JSON.stringify({ type, data })}\n\n`);
  for (const c of clients) try { c.enqueue(msg); } catch { clients.delete(c); }
}
function events() {
  let ctl: ReadableStreamDefaultController;
  let ping: Timer;
  return new Response(new ReadableStream({
    start(c) { ctl = c; clients.add(c); ping = setInterval(() => { try { c.enqueue(new TextEncoder().encode(': ping\n\n')); } catch {} }, 25000); },
    cancel() { clients.delete(ctl); clearInterval(ping); },
  }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}

// ---------- Small JSON tables (assets, comments) ----------
async function table<T extends { id: number }>(name: string): Promise<T[]> {
  try { return JSON.parse(await readFile(join(DATA, `${name}.json`), 'utf8')); } catch { return []; }
}
async function saveTable(name: string, rows: unknown[]) {
  const f = join(DATA, `${name}.json`);
  await writeFile(`${f}.tmp`, JSON.stringify(rows, null, 1));
  await rename(`${f}.tmp`, f);
}
const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

// ---------- Motions ----------
const motionPath = (id: string) => join(DIRS.motions, `${id}.json`);
async function readMotion(id: string) {
  try { return JSON.parse(await readFile(motionPath(id), 'utf8')); } catch { return null; }
}
let writing = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = writing.then(fn); writing = p.then(() => {}, () => {}); return p; };

async function listMotions() {
  const out = [];
  for (const f of await readdir(DIRS.motions)) {
    if (!f.endsWith('.json')) continue;
    const d = await readMotion(f.slice(0, -5));
    if (!d) continue;
    const s: Record<string, unknown> = {};
    for (const k of SUMMARY) if (d[k] !== undefined) s[k] = d[k];
    s.layers = Array.isArray(d.layers) ? d.layers.length : 0;
    out.push(s);
  }
  return out.sort((a: any, b: any) => (b.updated_at || 0) - (a.updated_at || 0));
}

async function putMotion(req: Request, id: string) {
  const text = await req.text();
  if (text.length > MAX_DOC) return err('projet trop lourd (8 Mo)', 413);
  let doc: any;
  try { doc = JSON.parse(text); } catch { return err('JSON invalide'); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return err('le projet doit être un objet JSON');
  if (doc.layers !== undefined && !Array.isArray(doc.layers)) return err('layers doit être une liste');
  const by = author(req);
  return serial(async () => {
    const old = await readMotion(id);
    const rev = old?.rev || 0;
    const base = doc.base_rev;
    delete doc.base_rev;
    if (old && typeof base === 'number' && base !== rev) return json({ error: 'version plus récente sur le serveur', rev }, 409);
    // A writer without a poster (the CLI) keeps the last one the editor made.
    if (doc.poster === undefined && old?.poster) doc.poster = old.poster;
    Object.assign(doc, { id, rev: rev + 1, updated_at: now(), updated_by: by });
    await writeFile(`${motionPath(id)}.tmp`, JSON.stringify(doc));
    await rename(`${motionPath(id)}.tmp`, motionPath(id));
    const meta = { id, rev: doc.rev, updated_at: doc.updated_at, by, name: doc.name };
    emit('studio', meta);
    return json(meta);
  });
}

// ---------- Media ----------
const MEDIA_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
const kindOf = (url: string) => {
  const e = extname(url).slice(1).toLowerCase();
  if (['mp4', 'webm', 'mov'].includes(e)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(e)) return 'audio';
  return 'image';
};
const EXT_OF_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
};
async function storeMedia(blob: Blob, name = '') {
  let ext = extname(name).slice(1).toLowerCase();
  if (!MEDIA_EXT.has(ext)) ext = EXT_OF_TYPE[blob.type.split(';')[0]] || '';
  if (!ext) {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const sig = (a: number[], o = 0) => a.every((b, i) => head[o + i] === b);
    ext = sig([0x89, 0x50, 0x4e, 0x47]) ? 'png' : sig([0xff, 0xd8]) ? 'jpg' : sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8) ? 'webp'
      : sig([0x66, 0x74, 0x79, 0x70], 4) ? 'mp4' : sig([0x1a, 0x45, 0xdf, 0xa3]) ? 'webm' : sig([0x49, 0x44, 0x33]) ? 'mp3' : '';
  }
  if (!ext) throw new Error('type de fichier non reconnu');
  const file = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await Bun.write(join(DIRS.media, file), blob);
  return { url: `/media/${file}`, kind: kindOf(file), size: blob.size };
}
async function mediaUpload(req: Request) {
  const type = req.headers.get('content-type') || '';
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData();
    const f = [...form.values()].find((v): v is File => v instanceof Blob);
    if (!f) return err('aucun fichier');
    return json(await storeMedia(f, (f as File).name));
  }
  const name = new URL(req.url).searchParams.get('name') || req.headers.get('x-filename') || '';
  return json(await storeMedia(new Blob([await req.arrayBuffer()], { type }), name));
}

// ---------- Static files ----------
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serveFile(base: string, rel: string) {
  const p = resolve(base, '.' + decodeURIComponent(rel));
  if (!p.startsWith(base + '/') || !existsSync(p)) return null;
  const file = Bun.file(p);
  const type = TYPES[extname(p)];
  return new Response(file, { headers: { 'cache-control': 'no-cache', ...(type ? { 'content-type': type } : {}) } });
}

// ---------- Router ----------
async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const m = req.method;

  if (path === '/api/events') return events();
  if (path === '/api/studio/projects' && m === 'GET') return json(await listMotions());
  let r = path.match(/^\/api\/studio\/projects\/([^/]+)$/);
  if (r) {
    const id = r[1];
    if (!validId(id)) return err('id invalide : minuscules, chiffres et tirets');
    if (m === 'GET') { const d = await readMotion(id); return d ? json(d) : err('projet introuvable', 404); }
    if (m === 'PUT') return putMotion(req, id);
    if (m === 'DELETE') {
      if (!existsSync(motionPath(id))) return err('projet introuvable', 404);
      await rm(motionPath(id));
      emit('studio_deleted', { id });
      return json({ ok: true });
    }
  }
  // Productions belong to the full Hub; the editor works without them.
  if (path === '/api/productions' && m === 'GET') return json([]);

  if ((path === '/api/media' || path === '/api/media/stream') && m === 'POST') {
    try { return await mediaUpload(req); } catch (e) { return err((e as Error).message); }
  }

  if (path === '/api/assets') {
    const rows = await table<any>('assets');
    if (m === 'GET') {
      const p = url.searchParams.get('production');
      return json(p === null ? rows : rows.filter((a) => (a.production || '') === p));
    }
    if (m === 'POST') {
      const a = await req.json().catch(() => null);
      if (!a || (!a.src && !a.url)) return err('un asset a un fichier (src) ou un lien (url)');
      const row = {
        id: nextId(rows), production: a.production || '', kind: a.kind || (a.src ? kindOf(a.src) : 'ref'), name: String(a.name || ''),
        src: a.src || null, poster: a.poster || null, url: a.url || null, tags: Array.isArray(a.tags) ? a.tags : [], note: String(a.note || ''),
        meta: a.meta || {}, by: author(req), created_at: now(),
      };
      rows.push(row);
      await saveTable('assets', rows);
      emit('asset', row);
      return json(row);
    }
  }
  r = path.match(/^\/api\/assets\/(\d+)$/);
  if (r) {
    const rows = await table<any>('assets');
    const i = rows.findIndex((a) => a.id === +r![1]);
    if (i < 0) return err('asset introuvable', 404);
    if (m === 'PATCH') {
      const p = await req.json().catch(() => ({}));
      for (const k of ['name', 'production', 'tags', 'note', 'poster', 'meta', 'url']) if (k in p) rows[i][k] = p[k];
      await saveTable('assets', rows);
      emit('asset', rows[i]);
      return json(rows[i]);
    }
    if (m === 'DELETE') {
      const [a] = rows.splice(i, 1);
      await saveTable('assets', rows);
      emit('asset_deleted', { id: a.id });
      return json({ ok: true });
    }
  }

  if (path === '/api/comments') {
    const rows = await table<any>('comments');
    if (m === 'GET') {
      const p = url.searchParams.get('production');
      const s = url.searchParams.get('state');
      return json(rows.filter((c) => (p === null || c.production === p) && (s === null || c.state === s)));
    }
    if (m === 'POST') {
      const c = await req.json().catch(() => null);
      const body = String(c?.body || '').trim();
      if (!body || body.length > 4000) return err('retour vide ou trop long (4 000 caractères)');
      const row = { id: nextId(rows), production: c.production || '', target: c.target || '', body, by: author(req), state: 'open', reply: null, reply_by: null, created_at: now(), done_at: null };
      rows.push(row);
      await saveTable('comments', rows);
      emit('comment', row);
      return json(row);
    }
  }
  r = path.match(/^\/api\/comments\/(\d+)$/);
  if (r) {
    const rows = await table<any>('comments');
    const i = rows.findIndex((c) => c.id === +r![1]);
    if (i < 0) return err('retour introuvable', 404);
    if (m === 'PATCH') {
      const p = await req.json().catch(() => ({}));
      const c = rows[i];
      if (typeof p.body === 'string') c.body = p.body.trim();
      if (p.state === 'open' || p.state === 'done') { c.state = p.state; c.done_at = p.state === 'done' ? now() : null; }
      if (typeof p.reply === 'string') { c.reply = p.reply; c.reply_by = author(req); }
      await saveTable('comments', rows);
      emit('comment', c);
      return json(c);
    }
    if (m === 'DELETE') {
      const [c] = rows.splice(i, 1);
      await saveTable('comments', rows);
      emit('comment_deleted', { id: c.id });
      return json({ ok: true });
    }
  }
  if (path.startsWith('/api/')) return err('route inconnue', 404);

  if (path.startsWith('/media/')) return serveFile(DIRS.media, path.slice(6)) || err('média introuvable', 404);
  // Optional sound library: drop packs and an index.json (see docs/sfx.md) in DATA_DIR/sfx.
  if (path.startsWith('/sfx/')) return serveFile(join(DATA, 'sfx'), path.slice(4)) || err('bibliothèque de sons absente', 404);
  return serveFile(PUBLIC, path === '/' ? '/index.html' : path) || serveFile(PUBLIC, '/index.html')!;
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 0,
  maxRequestBodySize: 4 * 1024 ** 3,
  fetch: (req) => route(req).catch((e) => err(String(e?.message || e), 500)),
});
console.log(`Motion Studio: http://${HOST}:${PORT}  (data: ${DATA})`);
