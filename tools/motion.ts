#!/usr/bin/env bun
// Motion Studio from scripts and agents. Server: $MOTION_STUDIO_URL (default http://127.0.0.1:5317).
//
//   motion list                              id, revision, author, name
//   motion push <file.json> [id] [--force]   create or replace a motion; --force skips the revision guard
//   motion pull <id> [file.json]             download (stdout without a file)
//   motion rm <id>                           delete
//   motion url <id>                          editor link
//   motion media <files...>                  upload images, videos or sounds; prints "name /media/..." lines
//   motion feedback [state]                  feedback pinned in the editor (open by default, "all" for every one)
//   motion done <n> "what changed"           answer a feedback and mark it done
//
// Writes say who made them with the header x-studio-author ($MOTION_AUTHOR, default "agent"),
// so the editor marks the change and offers to reload.

import { basename } from 'node:path';

const BASE = (process.env.MOTION_STUDIO_URL || 'http://127.0.0.1:5317').replace(/\/$/, '');
const AUTHOR = process.env.MOTION_AUTHOR || 'agent';
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a) => !a.startsWith('--'));

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { 'x-studio-author': AUTHOR, ...(init.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${data?.error || res.statusText}`);
  return data;
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const ago = (ts: number) => {
  const s = Math.floor(Date.now() / 1000) - ts;
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}min` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}j`;
};
function usage(): never {
  console.error('usage: motion list | push <file.json> [id] [--force] | pull <id> [file] | rm <id> | url <id> | media <files...> | feedback [open|done|all] | done <n> "reply"');
  process.exit(2);
}

switch (cmd) {
  case 'list': {
    for (const m of await api('/api/studio/projects')) console.log([m.id, `r${m.rev}`, m.updated_by || '', ago(m.updated_at || 0), m.name || ''].join('\t'));
    break;
  }
  case 'push': {
    const [file, idArg] = args;
    if (!file) usage();
    const doc = await Bun.file(file).json();
    const id = idArg || doc.id || slug(doc.name || basename(file, '.json'));
    delete doc.id;
    if (flags.has('--force')) delete doc.rev;
    if (typeof doc.rev === 'number') doc.base_rev = doc.rev;
    delete doc.rev; delete doc.updated_at; delete doc.updated_by;
    const r = await api(`/api/studio/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    console.log(`${id} r${r.rev}  ${BASE}/#/m/${id}`);
    break;
  }
  case 'pull': {
    const [id, file] = args;
    if (!id) usage();
    const doc = await api(`/api/studio/projects/${id}`);
    const text = JSON.stringify(doc, null, 2) + '\n';
    if (file) { await Bun.write(file, text); console.log(`${file} r${doc.rev}`); } else process.stdout.write(text);
    break;
  }
  case 'rm': {
    if (!args[0]) usage();
    await api(`/api/studio/projects/${args[0]}`, { method: 'DELETE' });
    console.log(`supprimé ${args[0]}`);
    break;
  }
  case 'url': {
    if (!args[0]) usage();
    console.log(`${BASE}/#/m/${args[0]}`);
    break;
  }
  case 'media': {
    if (!args.length) usage();
    for (const f of args) {
      const file = Bun.file(f);
      const r = await api(`/api/media/stream?name=${encodeURIComponent(basename(f))}`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
      console.log(`${basename(f)} ${r.url}`);
    }
    break;
  }
  case 'feedback': {
    const state = args[0] === 'all' ? '' : `?state=${args[0] || 'open'}`;
    for (const c of await api(`/api/comments${state}`)) {
      const where = c.target?.startsWith('motion:') ? `motion ${c.target.slice(7).replace('@', ' à ')} s` : c.target || 'général';
      console.log(`#${c.id} [${c.state}] ${where}\n  ${c.body.replace(/\n/g, '\n  ')}${c.reply ? `\n  -> ${c.reply}` : ''}`);
    }
    break;
  }
  case 'done': {
    const [n, reply] = args;
    if (!n || !reply) usage();
    await api(`/api/comments/${n}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'done', reply }) });
    console.log(`#${n} fait`);
    break;
  }
  default:
    usage();
}
