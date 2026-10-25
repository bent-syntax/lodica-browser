'use strict';
// Live view of a linked phone's screen. The phone sends JPEG frames, a desktop browser shows them. Only the newest frame is
// kept, in memory, and it expires a few seconds after the phone stops sending. Nothing is written to disk.
//   PUT    /api/screen               body: one JPEG -> { seq }
//   GET    /api/screen?after=<seq>&wait=<s> -> the JPEG (header X-Frame-Seq) when newer than `after`; 204 when nothing new
//                                       within `wait` seconds (max 25) or no one is sharing
//   GET    /api/screen?status=1      -> { live, seq }
//   DELETE /api/screen               -> stops the share and drops the frame
const FRAME_MAX = 1024 * 1024;
const EXPIRE_MS = 10000;
let frame = null; // { seq, at, data }
let seq = 0;
let waiters = [];

const live = () => !!frame && Date.now() - frame.at < EXPIRE_MS;

function wake() {
  const w = waiters; waiters = [];
  for (const f of w) f();
}

function sendFrame(req, res) {
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': frame.data.length, 'X-Frame-Seq': String(frame.seq), 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : frame.data);
}

async function put(req, res, h) {
  let b;
  try { b = await h.readBody(req, FRAME_MAX); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  // JPEG files start with FF D8 FF.
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return h.sendText(req, res, 400, 'not a jpeg');
  frame = { seq: ++seq, at: Date.now(), data: b };
  wake();
  h.sendJson(req, res, 200, { seq });
}

function get(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('status')) return h.sendJson(req, res, 200, { live: live(), seq: live() ? frame.seq : 0 });
  const after = Number(q.get('after')) || 0;
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
  // A cursor ahead of the relay means the relay restarted, so any frame counts as new.
  const fresh = () => live() && (frame.seq > after || after > seq);
  if (fresh()) return sendFrame(req, res);
  if (!wait) { res.writeHead(204); return res.end(); }
  const timer = setTimeout(done, wait * 1000);
  function done() {
    clearTimeout(timer);
    waiters = waiters.filter((f) => f !== done);
    if (res.writableEnded || res.destroyed) return;
    if (fresh()) sendFrame(req, res); else { res.writeHead(204); res.end(); }
  }
  waiters.push(done);
  req.on('close', () => { clearTimeout(timer); waiters = waiters.filter((f) => f !== done); });
}

function remove(req, res) {
  frame = null;
  wake();
  res.writeHead(204); res.end();
}

/** Test hook. */
function reset() { frame = null; seq = 0; wake(); }

module.exports = { put, get, remove, reset };
