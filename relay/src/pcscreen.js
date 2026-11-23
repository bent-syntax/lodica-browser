'use strict';
// Live view of a linked PC's screen. The desktop sends JPEG frames, a phone shows them. Only the newest frame is kept in
// memory and it expires a few seconds after the PC stops sending. Nothing is written to disk.
//   PUT    /api/pcscreen               body: one JPEG -> { seq }
//   GET    /api/pcscreen?after=<seq>&wait=<s> -> JPEG (header X-Frame-Seq) when newer than `after`; 204 on timeout
//   GET    /api/pcscreen?status=1      -> { live, seq }
//   DELETE /api/pcscreen               -> stops sharing and drops the frame
//   POST   /api/pcscreen/input         body: { events: [...] } from the phone -> { queued }
//   GET    /api/pcscreen/input?wait=<s> -> { events: [...] } for the desktop; long-polls up to `wait` seconds (max 25)
const FRAME_MAX = 1024 * 1024;
const EXPIRE_MS = 10000;
let frame = null;
let seq = 0;
let waiters = [];

const live = () => !!frame && Date.now() - frame.at < EXPIRE_MS;

function wake() { const w = waiters; waiters = []; for (const f of w) f(); }
function sendFrame(req, res) {
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': frame.data.length, 'X-Frame-Seq': String(frame.seq), 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : frame.data);
}

async function put(req, res, h) {
  let b;
  try { b = await h.readBody(req, FRAME_MAX); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return h.sendText(req, res, 400, 'not a jpeg');
  frame = { seq: ++seq, at: Date.now(), data: b };
  wake();
  h.sendJson(req, res, 200, { seq });
}

function get(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('status') === '1') return h.sendJson(req, res, 200, { live: live(), seq: live() ? frame.seq : 0 });
  const after = Number(q.get('after')) || 0;
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
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
  queue = [];
  wake();
  wakeInput();
  res.writeHead(204); res.end();
}
/** Test hook. */
function reset() { frame = null; seq = 0; queue = []; wake(); wakeInput(); }

// Input events use fractions (0..1) of the shared PC screen. Only known kinds are relayed.
const KEYS = new Set(['back', 'home', 'enter', 'escape', 'tab', 'space', 'backspace', 'delete', 'left', 'right', 'up', 'down']);
const QUEUE_MAX = 50;
let queue = [];
let inWaiters = [];
const frac = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);

function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.t === 'tap') {
    const x = frac(e.x), y = frac(e.y);
    if (x === null || y === null) return null;
    return { t: 'tap', x, y, ms: Math.min(1500, Math.max(10, Number(e.ms) || 50)) };
  }
  if (e.t === 'swipe' || e.t === 'move') {
    const a = [frac(e.x), frac(e.y), frac(e.x2), frac(e.y2)];
    if (a.includes(null)) return null;
    return { t: e.t, x: a[0], y: a[1], x2: a[2], y2: a[3], ms: Math.min(2000, Math.max(50, Number(e.ms) || 250)) };
  }
  if (e.t === 'key' && KEYS.has(e.key)) return { t: 'key', key: e.key };
  if (e.t === 'text' && typeof e.text === 'string') return { t: 'text', text: e.text.slice(0, 500) };
  return null;
}

function wakeInput() { const w = inWaiters; inWaiters = []; for (const f of w) f(); }

async function inputPost(req, res, h) {
  let b;
  try { b = JSON.parse((await h.readBody(req, 16384)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  const list = Array.isArray(b && b.events) ? b.events.slice(0, 20) : [];
  const ok = list.map(cleanEvent).filter(Boolean);
  if (!live()) return h.sendJson(req, res, 200, { queued: 0 });
  queue.push(...ok);
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
  wakeInput();
  h.sendJson(req, res, 200, { queued: ok.length });
}

function inputGet(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
  const take = () => { const events = queue; queue = []; h.sendJson(req, res, 200, { events }); };
  if (queue.length || !wait) return take();
  const timer = setTimeout(done, wait * 1000);
  function done() {
    clearTimeout(timer);
    inWaiters = inWaiters.filter((f) => f !== done);
    if (res.writableEnded || res.destroyed) return;
    take();
  }
  inWaiters.push(done);
  req.on('close', () => { clearTimeout(timer); inWaiters = inWaiters.filter((f) => f !== done); });
}

module.exports = { put, get, remove, reset, inputPost, inputGet, cleanEvent };
