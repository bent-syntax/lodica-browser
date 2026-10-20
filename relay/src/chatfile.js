'use strict';
// Chat attachments, streamed to a private directory on the relay's disk (never read whole into memory).
//   POST /api/chat/file?name=<file name>&room=<room>   raw body (Content-Length required) -> the chat message, with message.file = { id, name, size, type }
//   GET  /api/chat/file/<id>                           -> the bytes (Range supported)
// Limits: 5 GB per file, 20 GB in total (oldest files are dropped first), kept 24 hours. The directory is emptied at start-up.
// Executable and script types are refused. Only a small set of image types is ever served inline, and only when the
// leading bytes really are that image; everything else is served as an octet-stream download. Names are reduced to a safe base name.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { cfg } = require('./config');

const MAX_FILE = 5 * 1024 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024 * 1024;
const LIMIT_TEXT = 'file too large (5 GB limit)';
const TTL = 24 * 3600e3;
const DIR = process.env.LODICA_CHATFILE_DIR || path.join(cfg.dataDir, 'chatfiles');

const BLOCKED = new Set(['exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'lnk', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'hta',
  'jar', 'apk', 'aab', 'sh', 'bash', 'zsh', 'csh', 'run', 'bin', 'elf', 'app', 'command', 'deb', 'rpm', 'appimage', 'dmg', 'pkg', 'reg', 'scf', 'url', 'inf',
  'html', 'htm', 'xhtml', 'svg', 'swf', 'php', 'py', 'pl', 'rb']);
const IMAGES = [
  ['image/png', (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47],
  ['image/jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/gif', (b) => b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8'],
  ['image/webp', (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
];

const files = new Map(); // id -> { name, size, type, file, at }
let total = 0;
let ready = false;

/** Creates the directory (mode 0700) and removes anything a previous run left behind. */
function init() {
  if (ready) return;
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  ready = true;
}

/** A safe base name: no path, no control or reserved characters, no leading dots, at most 80 characters. */
function cleanName(v) {
  let n = typeof v === 'string' ? v : '';
  n = n.split(/[\\/]/).pop().normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩"*:<>?|;%]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (n.length > 80) { const i = n.lastIndexOf('.'); const ext = i > 0 && n.length - i <= 10 ? n.slice(i) : ''; n = n.slice(0, 80 - ext.length) + ext; }
  return n || 'file';
}

function ext(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }

/** The type used to serve the file: a verified image type or the generic download type. */
function sniff(buf) {
  for (const [t, ok] of IMAGES) if (ok(buf)) return t;
  return 'application/octet-stream';
}

function drop(id) {
  const f = files.get(id);
  if (!f) return;
  files.delete(id); total -= f.size;
  fs.unlink(f.file, () => {});
}

function prune(now = Date.now()) {
  for (const [id, f] of files) if (now - f.at > TTL) drop(id);
}

const bad = (status, error) => ({ status, error });
const refused = () => bad(415, 'this file type is not allowed');

/** The checks that need only the name and the first bytes. Returns an error or null. */
function badHead(clean, head) {
  // Any dot-separated part can be an executable extension (photo.exe.png is harmless, photo.png.exe is not).
  if (clean.split('.').slice(1).some((e) => BLOCKED.has(e.toLowerCase()))) return refused();
  if (head && head.length > 2 && head[0] === 0x4d && head[1] === 0x5a) return refused(); // MZ
  if (head && head.length > 4 && head.readUInt32BE(0) === 0x7f454c46) return refused(); // ELF
  if (head && head.length > 2 && head[0] === 0x23 && head[1] === 0x21) return refused(); // #!
  return null;
}

/**
 * Streams the request body to disk. Content-Length is required; space for it is reserved up front and the oldest files
 * are dropped to make room. Resolves to { file } or { status, error }.
 */
async function put(req, name) {
  prune();
  const cl = req.headers['content-length'];
  if (cl == null || !/^\d{1,15}$/.test(cl)) return bad(411, 'length required');
  const size = Number(cl);
  if (!size) return bad(400, 'empty file');
  if (size > MAX_FILE) return bad(413, LIMIT_TEXT);
  const clean = cleanName(name);
  const early = badHead(clean, null);
  if (early) return early;
  init();
  while (total + size > MAX_TOTAL && files.size) drop(files.keys().next().value);
  if (total + size > MAX_TOTAL) return bad(507, 'the chat file store is full');
  total += size;
  const id = crypto.randomBytes(12).toString('hex');
  const tmp = path.join(DIR, id + '.part');
  let head = Buffer.alloc(0); let n = 0; let rejected = null;
  const gate = new Transform({
    transform(chunk, enc, cb) {
      n += chunk.length;
      if (n > size) return cb(Object.assign(new Error('too long'), { st: bad(400, 'body longer than Content-Length') }));
      if (head.length < 16) {
        head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
        const e = head.length >= 16 ? badHead(clean, head) : null;
        if (e) { rejected = e; return cb(new Error('refused')); }
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, gate, fs.createWriteStream(tmp, { mode: 0o600 }));
    if (n !== size) throw Object.assign(new Error('short'), { st: bad(400, 'body shorter than Content-Length') });
    rejected = badHead(clean, head);
    if (rejected) throw new Error('refused');
  } catch (e) {
    total -= size;
    fs.unlink(tmp, () => {});
    return rejected || e.st || bad(400, 'upload failed');
  }
  const final = path.join(DIR, id);
  try { fs.renameSync(tmp, final); } catch { total -= size; fs.unlink(tmp, () => {}); return bad(500, 'could not store the file'); }
  const type = sniff(head);
  files.set(id, { name: clean, size, type, file: final, at: Date.now() });
  return { file: { id, name: clean, size, type } };
}

/** GET /api/chat/file/<id>. Add ?dl=1 to force a download of an image too. A single byte range is honoured. */
function serve(req, res, id, dl) {
  prune();
  const f = files.get(id);
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('gone'); }
  const inline = f.type !== 'application/octet-stream' && !dl;
  let start = 0; let end = f.size - 1; let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    else { start = Math.max(0, f.size - Number(m[2])); }
    if (start > end || start >= f.size) { res.writeHead(416, { 'content-range': 'bytes */' + f.size }); return res.end(); }
    status = 206;
  }
  const h = {
    'content-type': f.type,
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    'content-disposition': (inline ? 'inline' : 'attachment') + '; filename="' + f.name.replace(/[^\x20-\x7e]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(f.name),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, max-age=3600',
  };
  if (status === 206) h['content-range'] = 'bytes ' + start + '-' + end + '/' + f.size;
  res.writeHead(status, h);
  if (req.method === 'HEAD') return res.end();
  const rs = fs.createReadStream(f.file, { start, end });
  rs.on('error', () => res.destroy());
  res.on('close', () => rs.destroy());
  rs.pipe(res);
}

function reset() { for (const id of [...files.keys()]) drop(id); total = 0; }

module.exports = { put, serve, cleanName, reset, MAX_FILE, LIMIT_TEXT, ext };
