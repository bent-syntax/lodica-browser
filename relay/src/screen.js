'use strict';
// Live view of a linked phone's screen, used by the desktop phone controller. The phone sends JPEG frames (the desktop app
// produces them from ADB screencap), a desktop shows them. Every target device has its own channel; the empty id is the legacy
// channel used by older clients. Only the newest frame per channel is kept, in memory, and it expires when sharing stops.
//   PUT    /api/screen?deviceId=<desktop>     body: one JPEG -> { seq }
//   GET    /api/screen?deviceId=<desktop>&after=<seq>&wait=<s> -> JPEG (header X-Frame-Seq) or 204
//   GET    /api/screen?deviceId=<desktop>&status=1 -> { live, seq }
//   DELETE /api/screen?deviceId=<desktop>     -> queues one stop event for that phone
//   POST   /api/screen/input                  body: { deviceId: <phone>, events: [...] } -> { queued }
//   GET    /api/screen/input?deviceId=<phone>&wait=<s> -> { events: [...] }
const FRAME_MAX = 1024 * 1024;
const EXPIRE_MS = 10000;
const TEXT_MAX = 500;
const KEYS = new Set(['back', 'home', 'recents', 'notifications']);
const QUEUE_MAX = 50;
const channels = new Map();

const cleanId = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
};
function channelOf(req, body) {
  const q = new URL(req.url, 'http://x').searchParams;
  return cleanId(q.get('deviceId') || q.get('target') || (body && (body.deviceId || body.target)));
}
function channel(id) {
  const key = cleanId(id);
  let c = channels.get(key);
  if (!c) {
    c = { frame: null, seq: 0, waiters: [], queue: [], inWaiters: [] };
    channels.set(key, c);
  }
  return c;
}
const live = (c) => !!c.frame && Date.now() - c.frame.at < EXPIRE_MS;

function wake(c) { const w = c.waiters; c.waiters = []; for (const f of w) f(); }
function wakeInput(c) { const w = c.inWaiters; c.inWaiters = []; for (const f of w) f(); }
function sendFrame(req, res, c) {
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': c.frame.data.length, 'X-Frame-Seq': String(c.frame.seq), 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : c.frame.data);
}

async function put(req, res, h) {
  let b;
  try { b = await h.readBody(req, FRAME_MAX); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  // JPEG files start with FF D8 FF.
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return h.sendText(req, res, 400, 'not a jpeg');
  const c = channel(channelOf(req));
  c.frame = { seq: ++c.seq, at: Date.now(), data: b };
  // A new frame starts a new share; a stop left over from the previous one must not shut this one down.
  c.queue = c.queue.filter((e) => e.t !== 'stop');
  wake(c);
  h.sendJson(req, res, 200, { seq: c.seq });
}

function get(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  const c = channel(channelOf(req));
  if (q.get('status') === '1') return h.sendJson(req, res, 200, { live: live(c), seq: live(c) ? c.frame.seq : 0 });
  const after = Number(q.get('after')) || 0;
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
  // A cursor ahead of the relay means the relay restarted, so any frame counts as new.
  const fresh = () => live(c) && (c.frame.seq > after || after > c.seq);
  if (fresh()) return sendFrame(req, res, c);
  if (!wait) { res.writeHead(204); return res.end(); }
  const timer = setTimeout(done, wait * 1000);
  function done() {
    clearTimeout(timer);
    c.waiters = c.waiters.filter((f) => f !== done);
    if (res.writableEnded || res.destroyed) return;
    if (fresh()) sendFrame(req, res, c); else { res.writeHead(204); res.end(); }
  }
  c.waiters.push(done);
  req.on('close', () => { clearTimeout(timer); c.waiters = c.waiters.filter((f) => f !== done); });
}

function remove(req, res) {
  const c = channel(channelOf(req));
  c.frame = null;
  // The relay has no separate control channel: the phone sees the stop in the same event stream as taps and keys.
  c.queue = [{ t: 'stop' }];
  wake(c);
  wakeInput(c);
  res.writeHead(204); res.end();
}

/** Test hook. */
function reset() { channels.clear(); }

// Remote control: the desktop queues input events, the phone fetches them. Coordinates are fractions (0..1) of the shared screen.
const frac = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);

/** Returns a clean event or null. Anything unknown is dropped. */
function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.t === 'tap') {
    const x = frac(e.x), y = frac(e.y);
    if (x === null || y === null) return null;
    return { t: 'tap', x, y, ms: Math.min(1500, Math.max(10, Number(e.ms) || 50)) };
  }
  if (e.t === 'swipe') {
    const a = [frac(e.x), frac(e.y), frac(e.x2), frac(e.y2)];
    if (a.includes(null)) return null;
    return { t: 'swipe', x: a[0], y: a[1], x2: a[2], y2: a[3], ms: Math.min(2000, Math.max(50, Number(e.ms) || 250)) };
  }
  if (e.t === 'key' && KEYS.has(e.key)) return { t: 'key', key: e.key };
  if (e.t === 'text' && typeof e.text === 'string') return { t: 'text', text: e.text.slice(0, TEXT_MAX) };
  if (e.t === 'stop') return { t: 'stop' };
  return null;
}

async function inputPost(req, res, h) {
  let b;
  try { b = JSON.parse((await h.readBody(req, 16384)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  const c = channel(channelOf(req, b));
  const list = Array.isArray(b && b.events) ? b.events.slice(0, 20) : [];
  const ok = list.map(cleanEvent).filter(Boolean);
  // Controls only make sense while that phone is sharing.
  if (!live(c)) return h.sendJson(req, res, 200, { queued: 0 });
  c.queue.push(...ok);
  if (c.queue.length > QUEUE_MAX) c.queue = c.queue.slice(-QUEUE_MAX);
  wakeInput(c);
  h.sendJson(req, res, 200, { queued: ok.length });
}

function inputGet(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  const c = channel(channelOf(req));
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
  const take = () => { const events = c.queue; c.queue = []; h.sendJson(req, res, 200, { events }); };
  if (c.queue.length || !wait) return take();
  const timer = setTimeout(done, wait * 1000);
  function done() {
    clearTimeout(timer);
    c.inWaiters = c.inWaiters.filter((f) => f !== done);
    if (res.writableEnded || res.destroyed) return;
    take();
  }
  c.inWaiters.push(done);
  req.on('close', () => { clearTimeout(timer); c.inWaiters = c.inWaiters.filter((f) => f !== done); });
}

module.exports = { put, get, remove, reset, inputPost, inputGet, cleanEvent, channelOf, live: (id) => live(channel(id)) };
