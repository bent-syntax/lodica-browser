'use strict';
// Shared notebook per token, with several notes, so every linked device shows the same ones.
//   GET    /api/notebook                -> { notes: [{ id, title, at }], text, rev, at } (text, rev and at belong to the first note, for older apps)
//   GET    /api/notebook?id=<id>        -> { id, text, rev, at }
//   POST   /api/notebook                -> a new empty note { id, text, rev, at }; 400 when there are too many
//   PUT    /api/notebook?id=<id> { text, base } -> the stored note; 409 with the current note when `base` is not the current rev.
//                                          Without `id` the first note is used.
//   DELETE /api/notebook?id=<id>        -> { notes }; the last note is emptied instead of removed
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { cfg } = require('./config');

const FILE = path.join(cfg.dataDir, 'notebook.json');
const TEXT_MAX = 100000;
const NOTES_MAX = 100;
let notes = null;

const fresh = () => ({ id: crypto.randomBytes(4).toString('hex'), text: '', rev: 0, at: 0 });
const clean = (v) => ({ id: String(v.id || '').slice(0, 16), text: String(v.text || '').slice(0, TEXT_MAX), rev: Number(v.rev) || 0, at: Number(v.at) || 0 });
const title = (n) => (n.text.split('\n').find((l) => l.trim()) || '').trim().slice(0, 60);
const list = () => notes.map((n) => ({ id: n.id, title: title(n), at: n.at }));

async function load() {
  if (notes) return notes;
  try {
    const v = JSON.parse(await fsp.readFile(FILE, 'utf8'));
    // Older files hold one note: { text, rev, at }.
    notes = (Array.isArray(v.notes) ? v.notes : [{ ...v, id: '1' }]).slice(0, NOTES_MAX).map(clean).filter((n) => n.id);
  } catch { notes = []; }
  if (!notes.length) notes = [{ ...fresh(), id: '1' }];
  return notes;
}

async function store() {
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ notes }), { mode: 0o600 });
  await fsp.rename(tmp, FILE);
}

const idOf = (req) => new URL(req.url, 'http://x').searchParams.get('id');

async function get(req, res, h) {
  const all = await load();
  const id = idOf(req);
  if (id) {
    const n = all.find((x) => x.id === id);
    return n ? h.sendJson(req, res, 200, n) : h.sendText(req, res, 404, 'no such note');
  }
  const { text, rev, at } = all[0];
  h.sendJson(req, res, 200, { notes: list(), text, rev, at });
}

async function put(req, res, h) {
  let b;
  try { b = JSON.parse((await h.readBody(req, 256 * 1024)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  if (!b || typeof b.text !== 'string' || b.text.length > TEXT_MAX) return h.sendText(req, res, 400, 'bad note');
  const all = await load();
  const id = idOf(req);
  const i = id ? all.findIndex((x) => x.id === id) : 0;
  if (i < 0) return h.sendText(req, res, 404, 'no such note');
  const cur = all[i];
  if (Number.isInteger(b.base) && b.base !== cur.rev) return h.sendJson(req, res, 409, cur);
  if (b.text === cur.text) return h.sendJson(req, res, 200, cur);
  const next = { id: cur.id, text: b.text, rev: cur.rev + 1, at: Date.now() };
  all[i] = next;
  await store();
  h.sendJson(req, res, 200, next);
}

async function create(req, res, h) {
  const all = await load();
  if (all.length >= NOTES_MAX) return h.sendText(req, res, 400, 'too many notes');
  const n = fresh();
  n.at = Date.now();
  all.push(n);
  await store();
  h.sendJson(req, res, 200, n);
}

async function remove(req, res, h) {
  const all = await load();
  const i = all.findIndex((x) => x.id === idOf(req));
  if (i < 0) return h.sendText(req, res, 404, 'no such note');
  if (all.length === 1) all[0] = { id: all[0].id, text: '', rev: all[0].rev + 1, at: Date.now() };
  else all.splice(i, 1);
  await store();
  h.sendJson(req, res, 200, { notes: list() });
}

/** Test hook. */
function reset() { notes = null; }

module.exports = { get, put, create, remove, reset };
