'use strict';
// Live view of a linked PC's screen, used by the Android "PC screen" controller. The desktop sends full-OS JPEG frames;
// a phone shows them and sends input back. Channels are keyed by target device id so several PCs and phones can be linked.
//   PUT    /api/pcscreen?deviceId=<phone>       body: one JPEG -> { seq }
//   GET    /api/pcscreen?deviceId=<phone>&after=<seq>&wait=<s> -> JPEG (header X-Frame-Seq) or 204
//   GET    /api/pcscreen?deviceId=<phone>&status=1 -> { live, seq }
//   DELETE /api/pcscreen?deviceId=<phone>       -> stops sharing for that phone
//   POST   /api/pcscreen/input                  body: { deviceId: <desktop>, events: [...] } -> { queued }
//   GET    /api/pcscreen/input?deviceId=<desktop>&wait=<s> -> { events: [...] }
//   POST   /api/pcscreen/request                body: { deviceId: <desktop>, from: <phone> } -> { pending }
//   GET    /api/pcscreen/request?deviceId=<desktop> -> { pending, requests: [{ from, at }] }
//   DELETE /api/pcscreen/request?deviceId=<desktop>&from=<phone> -> clears handled requests
const FRAME_MAX = 1024 * 1024;
const EXPIRE_MS = 10000;
const REQUEST_MS = 60000;
const channels = new Map();

const cleanId = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
};
function channelOf(req, body) {
  const q = new URL(req.url, 'http://x').searchParams;
  return cleanId(q.get('deviceId') || q.get('target') || q.get('from') || (body && (body.deviceId || body.target || body.from)));
}
function channel(id) {
  const key = cleanId(id);
  let c = channels.get(key);
  if (!c) {
    c = { frame: null, seq: 0, waiters: [], queue: [], inWaiters: [], requests: [] };
    channels.set(key, c);
  }
  return c;
}
const live = (c) => !!c.frame && Date.now() - c.frame.at < EXPIRE_MS;
const requestPending = (id) => channel(id).requests.some((r) => Date.now() - r.at < REQUEST_MS);

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
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return h.sendText(req, res, 400, 'not a jpeg');
  const phoneId = cleanId(channelOf(req));
  const c = channel(phoneId);
  c.frame = { seq: ++c.seq, at: Date.now(), data: b };
  c.requests = []; // a running share makes any earlier request to this channel irrelevant
  // A frame also answers that phone's pending request to any desktop.
  if (phoneId) for (const other of channels.values()) other.requests = other.requests.filter((r) => r.from !== phoneId);
  wake(c);
  h.sendJson(req, res, 200, { seq: c.seq });
}

function get(req, res, h) {
  const q = new URL(req.url, 'http://x').searchParams;
  const c = channel(channelOf(req));
  if (q.get('status') === '1') return h.sendJson(req, res, 200, { live: live(c), seq: live(c) ? c.frame.seq : 0 });
  const after = Number(q.get('after')) || 0;
  const wait = Math.min(25, Math.max(0, Number(q.get('wait')) || 0));
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
  c.queue = [];
  wake(c);
  wakeInput(c);
  res.writeHead(204); res.end();
}

/** Test hook. */
function reset() { channels.clear(); }

// A phone with the "Allow phone to control this PC" setting on can ask a chosen desktop to start sharing.
async function requestPost(req, res, h) {
  let body = {};
  try { body = JSON.parse((await h.readBody(req, 4096)).toString('utf8')) || {}; }
  catch { /* an empty body is the legacy one-channel request */ }
  const c = channel(channelOf(req, body));
  const from = cleanId(body.from);
  const now = Date.now();
  c.requests = c.requests.filter((r) => now - r.at < REQUEST_MS && (!from || r.from !== from)).slice(-19);
  c.requests.push({ from, at: now });
  h.sendJson(req, res, 200, { pending: true });
}
function requestGet(req, res, h) {
  const c = channel(channelOf(req));
  const now = Date.now();
  c.requests = c.requests.filter((r) => now - r.at < REQUEST_MS);
  const from = cleanId(new URL(req.url, 'http://x').searchParams.get('from'));
  const requests = c.requests.filter((r) => !from || r.from === from);
  h.sendJson(req, res, 200, { pending: requests.length > 0, requests });
}
function requestDelete(req, res) {
  const c = channel(channelOf(req));
  const from = cleanId(new URL(req.url, 'http://x').searchParams.get('from'));
  c.requests = from ? c.requests.filter((r) => r.from !== from) : [];
  res.writeHead(204); res.end();
}

// Input events use fractions (0..1) of the shared PC screen. Only known kinds are relayed.
const KEYS = new Set(['back', 'home', 'enter', 'escape', 'tab', 'space', 'backspace', 'delete', 'left', 'right', 'up', 'down']);
const QUEUE_MAX = 50;
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
  if (e.t === 'right') {
    const x = frac(e.x), y = frac(e.y);
    if (x === null || y === null) return null;
    return { t: 'right', x, y };
  }
  if (e.t === 'scroll') {
    const x = frac(e.x), y = frac(e.y);
    if (x === null || y === null) return null;
    const steps = Math.max(-10, Math.min(10, Math.trunc(Number(e.steps) || 1)));
    return { t: 'scroll', x, y, steps };
  }
  if (e.t === 'key' && KEYS.has(e.key)) return { t: 'key', key: e.key };
  if (e.t === 'text' && typeof e.text === 'string') return { t: 'text', text: e.text.slice(0, 500) };
  return null;
}

async function inputPost(req, res, h) {
  let b;
  try { b = JSON.parse((await h.readBody(req, 16384)).toString('utf8')); }
  catch (e) { return h.sendText(req, res, e.status || 400, 'bad body', { Connection: 'close' }); }
  const c = channel(channelOf(req, b));
  const list = Array.isArray(b && b.events) ? b.events.slice(0, 20) : [];
  const ok = list.map(cleanEvent).filter(Boolean);
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

module.exports = {
  put, get, remove, reset, inputPost, inputGet, cleanEvent,
  requestPost, requestGet, requestDelete, requestPending, channelOf, live: (id) => live(channel(id)),
};
