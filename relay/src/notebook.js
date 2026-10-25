'use strict';
// One shared notebook per token, so every linked device shows the same text.
//   GET /api/notebook                -> { text, rev, at }
//   PUT /api/notebook { text, base } -> the stored note; 409 with the current note when `base` is not the current rev
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { cfg } = require('./config');

const FILE = path.join(cfg.dataDir, 'notebook.json');
const TEXT_MAX = 100000;
let note = null;

async function load() {
  if (note) return note;
  try {
    const v = JSON.parse(await fsp.readFile(FILE, 'utf8'));
    note = { text: String(v.text || '').slice(0, TEXT_MAX), rev: Number(v.rev) || 0, at: Number(v.at) || 0 };
  } catch { note = { text: '', rev: 0, at: 0 }; }
  return note;
}

async function get(req, res, h) {
  h.sendJson(req, res, 200, await load());
}

async function put(req, res, h) {
  let b;
  try { b = JSON.parse((await h.readBody(req, 256 * 1024)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  if (!b || typeof b.text !== 'string' || b.text.length > TEXT_MAX) return h.sendText(req, res, 400, 'bad note');
  const cur = await load();
  if (Number.isInteger(b.base) && b.base !== cur.rev) return h.sendJson(req, res, 409, cur);
  if (b.text === cur.text) return h.sendJson(req, res, 200, cur);
  const next = { text: b.text, rev: cur.rev + 1, at: Date.now() };
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
  await fsp.rename(tmp, FILE);
  note = next;
  h.sendJson(req, res, 200, next);
}

/** Test hook. */
function reset() { note = null; }

module.exports = { get, put, reset };
