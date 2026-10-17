'use strict';
// Chat attachments, held in memory only (nothing is written to disk).
//   POST /api/chat/file?name=<file name>&room=<room>   raw body -> the chat message, with message.file = { id, name, size, type }
//   GET  /api/chat/file/<id>                           -> the bytes
// Limits: 5 MB per file, 40 MB in total, kept 24 hours. Executable and script types are refused. Only a small set of
// image types is ever served inline, and only when the leading bytes really are that image; everything else is
// served as an octet-stream download. Names are reduced to a safe base name.
const crypto = require('crypto');

const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const TTL = 24 * 3600e3;
const BLOCKED = new Set(['exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'lnk', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'hta',
  'jar', 'apk', 'aab', 'sh', 'bash', 'zsh', 'csh', 'run', 'bin', 'elf', 'app', 'command', 'deb', 'rpm', 'appimage', 'dmg', 'pkg', 'reg', 'scf', 'url', 'inf',
  'html', 'htm', 'xhtml', 'svg', 'swf', 'php', 'py', 'pl', 'rb']);
const IMAGES = [
  ['image/png', (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47],
  ['image/jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/gif', (b) => b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8'],
  ['image/webp', (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
];

const files = new Map(); // id -> { name, size, type, data, at }
let total = 0;

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

function prune(now = Date.now()) {
  for (const [id, f] of files) if (now - f.at > TTL) { files.delete(id); total -= f.size; }
}

/** Validates and stores. Returns { file } or { status, error }. */
function put(name, buf) {
  prune();
  if (!buf.length) return { status: 400, error: 'empty file' };
  if (buf.length > MAX_FILE) return { status: 413, error: 'file too large (5 MB limit)' };
  const clean = cleanName(name);
  // Any dot-separated part can be an executable extension (photo.exe.png is harmless, photo.png.exe is not).
  if (clean.split('.').slice(1).some((e) => BLOCKED.has(e.toLowerCase()))) return { status: 415, error: 'this file type is not allowed' };
  if (buf.length > 2 && buf[0] === 0x4d && buf[1] === 0x5a) return { status: 415, error: 'this file type is not allowed' }; // MZ
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x7f454c46) return { status: 415, error: 'this file type is not allowed' }; // ELF
  if (buf.length > 2 && buf[0] === 0x23 && buf[1] === 0x21) return { status: 415, error: 'this file type is not allowed' }; // #!
  while (total + buf.length > MAX_TOTAL && files.size) { const [id, f] = files.entries().next().value; files.delete(id); total -= f.size; }
  const id = crypto.randomBytes(12).toString('hex');
  const type = sniff(buf);
  files.set(id, { name: clean, size: buf.length, type, data: buf, at: Date.now() });
  total += buf.length;
  return { file: { id, name: clean, size: buf.length, type } };
}

/** GET /api/chat/file/<id>. Add ?dl=1 to force a download of an image too. */
function serve(req, res, id, dl) {
  prune();
  const f = files.get(id);
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('gone'); }
  const inline = f.type !== 'application/octet-stream' && !dl;
  res.writeHead(200, {
    'content-type': f.type,
    'content-length': f.size,
    'content-disposition': (inline ? 'inline' : 'attachment') + '; filename="' + f.name.replace(/[^\x20-\x7e]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(f.name),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : f.data);
}

function reset() { files.clear(); total = 0; }

module.exports = { put, serve, cleanName, reset, MAX_FILE, ext };
