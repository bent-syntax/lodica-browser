'use strict';
// HTTPS forward proxy (TLS to the proxy itself, then CONNECT tunnel or absolute-URI plain HTTP).
// Pure tunnel: no TLS interception. Never logs target hosts; counters only.
const https = require('https');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { cfg, tokenOk, limited, noteFail } = require('./config');
const { resolveSafe, GuardError } = require('./ssrf');
const adblock = require('./adblock');

const stats = {
  connectOk: 0, connectFail: 0, httpOk: 0, httpFail: 0,
  authFail: 0, adBlocked: 0, ssrfDenied: 0, portDenied: 0, badRequest: 0,
  bytesUp: 0, bytesDown: 0, active: 0, certReloads: 0,
};

const HOP = new Set(['proxy-authorization', 'proxy-connection', 'proxy-authenticate', 'connection', 'keep-alive',
  'te', 'trailer', 'transfer-encoding', 'upgrade']);

function clientIp(sock) { return (sock && sock.remoteAddress) || '?'; }

// The proxy login. The user name is "lodica", or "lodica+ads-<strength>" to have ad and tracker hosts refused (see adblock.js).
function authOf(req) {
  const h = req.headers['proxy-authorization'];
  if (typeof h !== 'string') return null;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(h);
  if (!m) return null;
  const dec = Buffer.from(m[1], 'base64').toString('utf8');
  const i = dec.indexOf(':');
  if (i < 0) return null;
  const user = dec.slice(0, i), ads = adblock.levelOf(user);
  const userOk = user === 'lodica' || ads !== null;
  const passOk = tokenOk(dec.slice(i + 1));
  return userOk && passOk ? { ads } : null;
}
const checkProxyAuth = (req) => authOf(req) !== null;

const AUTH_407 = 'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Lodica"\r\n' +
  'Content-Type: text/plain\r\nContent-Length: 29\r\nConnection: close\r\n\r\nProxy authentication required';

function rawReply(sock, code, text) {
  if (sock.destroyed) return;
  const body = text + '\n';
  sock.end(`HTTP/1.1 ${code} ${http.STATUS_CODES[code] || 'Error'}\r\nContent-Type: text/plain\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

function guardStatus(e) {
  if (e instanceof GuardError) {
    if (e.code === 'forbidden') { stats.ssrfDenied++; return [403, 'Destination not allowed']; }
    if (e.code === 'badhost') { stats.badRequest++; return [400, 'Bad target host']; }
    return [502, 'Could not resolve target'];
  }
  return [502, 'Upstream connection failed'];
}

// Connect to the first reachable validated address.
function connectAny(addrs, port) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= addrs.length) return reject(new Error('connect failed'));
      const s = net.connect({ host: addrs[i++], port });
      const t = setTimeout(() => s.destroy(new Error('connect timeout')), cfg.proxyConnectMs);
      s.once('connect', () => { clearTimeout(t); s.removeAllListeners('error'); resolve(s); });
      s.once('error', () => { clearTimeout(t); s.destroy(); tryNext(); });
    };
    tryNext();
  });
}

function parseAuthority(a) {
  let m = /^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/.exec(a) || /^([^:\[\]\/\s@]+):(\d{1,5})$/.exec(a);
  if (!m) return null;
  const port = Number(m[2]);
  if (!(port >= 1 && port <= 65535)) return null;
  return { host: m[1].toLowerCase(), port };
}

async function onConnect(req, client, head) {
  client.on('error', () => {});
  const ip = clientIp(client);
  if (limited(ip)) { rawReply(client, 429, 'Too many failed attempts'); return; }
  const auth = authOf(req);
  if (!auth) { stats.authFail++; noteFail(ip); client.end(AUTH_407); return; }
  const t = parseAuthority(req.url || '');
  if (!t) { stats.badRequest++; return rawReply(client, 400, 'Bad CONNECT target'); }
  if (auth.ads && adblock.blocked(t.host, auth.ads)) { stats.adBlocked++; return rawReply(client, 403, 'Blocked by the ad filter'); }
  if (cfg.blockedPorts.has(t.port)) { stats.portDenied++; return rawReply(client, 403, 'Port not allowed'); }
  let upstream;
  try {
    const addrs = await resolveSafe(t.host);
    upstream = await connectAny(addrs, t.port);
  } catch (e) {
    stats.connectFail++;
    const [code, msg] = guardStatus(e);
    return rawReply(client, code, msg);
  }
  if (client.destroyed) { upstream.destroy(); return; }
  stats.connectOk++; stats.active++;
  let closed = false;
  const done = () => {
    if (closed) return; closed = true; stats.active--;
    stats.bytesUp += upstream.bytesWritten || 0; stats.bytesDown += upstream.bytesRead || 0;
    client.destroy(); upstream.destroy();
  };
  upstream.on('error', done); upstream.on('close', done);
  client.on('error', done); client.on('close', done);
  upstream.setTimeout(cfg.proxyIdleMs, done);
  client.setTimeout(cfg.proxyIdleMs, done);
  upstream.setNoDelay(true);
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if (head && head.length) upstream.write(head);
  client.pipe(upstream);
  upstream.pipe(client);
}

function filterHeaders(raw) {
  // raw = [k, v, k, v, ...]; also drop headers named in Connection.
  const conn = new Set();
  for (let i = 0; i < raw.length; i += 2) {
    if (raw[i].toLowerCase() === 'connection') for (const x of raw[i + 1].split(',')) conn.add(x.trim().toLowerCase());
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    const k = raw[i].toLowerCase();
    if (HOP.has(k) || conn.has(k)) continue;
    out.push([raw[i], raw[i + 1]]);
  }
  return out;
}

async function onRequest(req, res) {
  const ip = clientIp(req.socket);
  const deny = (code, msg, extra) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(code, Object.assign({ 'Content-Type': 'text/plain', Connection: 'close' }, extra || {}));
    res.end(msg + '\n');
  };
  if (limited(ip)) return deny(429, 'Too many failed attempts');
  const auth = authOf(req);
  if (!auth) {
    stats.authFail++; noteFail(ip);
    return deny(407, 'Proxy authentication required', { 'Proxy-Authenticate': 'Basic realm="Lodica"' });
  }
  let u;
  try { u = new URL(req.url); } catch { u = null; }
  if (!u || u.protocol !== 'http:' || !/^https?:\/\//i.test(req.url)) {
    stats.badRequest++;
    return deny(400, 'Only CONNECT and absolute http:// URIs are supported');
  }
  if (u.username || u.password) { stats.badRequest++; return deny(400, 'Credentials in URL not supported'); }
  if (auth.ads && adblock.blocked(u.hostname, auth.ads)) { stats.adBlocked++; return deny(403, 'Blocked by the ad filter'); }
  const port = u.port ? Number(u.port) : 80;
  if (cfg.blockedPorts.has(port)) { stats.portDenied++; return deny(403, 'Port not allowed'); }
  let addrs;
  try { addrs = await resolveSafe(u.hostname); } catch (e) {
    stats.httpFail++;
    const [code, msg] = guardStatus(e); return deny(code, msg);
  }
  const headers = filterHeaders(req.rawHeaders);
  if (!headers.some(([k]) => k.toLowerCase() === 'host')) headers.push(['Host', u.host]);
  const flat = [];
  for (const [k, v] of headers) flat.push(k, v);
  let attempt = 0;
  const go = () => {
    const up = http.request({
      host: addrs[attempt], port, method: req.method, path: u.pathname + u.search,
      headers: flat, setHost: false, agent: false, timeout: cfg.proxyConnectMs,
    });
    let gotResponse = false;
    up.on('socket', (s) => s.once('connect', () => up.setTimeout(cfg.proxyIdleMs)));
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('response', (ur) => {
      gotResponse = true;
      const rh = filterHeaders(ur.rawHeaders);
      const out = [];
      for (const [k, v] of rh) out.push(k, v);
      res.writeHead(ur.statusCode, ur.statusMessage, out);
      ur.on('data', (c) => { stats.bytesDown += c.length; });
      ur.pipe(res);
      ur.on('error', () => res.destroy());
      ur.on('end', () => { stats.httpOk++; });
    });
    up.on('error', () => {
      if (!gotResponse && !res.headersSent && attempt + 1 < addrs.length && !bodyStarted) { attempt++; return go(); }
      stats.httpFail++;
      deny(502, 'Upstream connection failed');
    });
    let bodyStarted = false;
    req.on('data', (c) => { bodyStarted = true; stats.bytesUp += c.length; });
    req.pipe(up);
    res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  };
  go();
}

function loadCert() {
  const st = [fs.statSync(cfg.tlsCert).mtimeMs, fs.statSync(cfg.tlsKey).mtimeMs].join('/');
  return { cert: fs.readFileSync(cfg.tlsCert), key: fs.readFileSync(cfg.tlsKey), st };
}

function start(log) {
  let cur = loadCert();
  const server = https.createServer({
    cert: cur.cert, key: cur.key, minVersion: 'TLSv1.2', ALPNProtocols: ['http/1.1'],
    handshakeTimeout: cfg.proxyHandshakeMs,
  });
  server.headersTimeout = cfg.proxyHeadersMs;
  server.requestTimeout = 0;            // long uploads allowed; idle timeout applies instead
  server.keepAliveTimeout = 30e3;
  server.timeout = cfg.proxyIdleMs;     // idle socket timeout for plain-HTTP proxying
  server.maxHeadersCount = 200;
  server.on('connect', (req, sock, head) => { onConnect(req, sock, head).catch(() => sock.destroy()); });
  server.on('request', (req, res) => { onRequest(req, res).catch(() => res.destroy()); });
  server.on('upgrade', (req, sock) => rawReply(sock, 501, 'Upgrade over plain-HTTP proxy not supported; use CONNECT'));
  server.on('tlsClientError', () => {});
  server.on('clientError', (err, sock) => { if (sock.writable) rawReply(sock, 400, 'Bad request'); else sock.destroy(); });

  // Cert reload: check mtime hourly, force reload every 12h.
  let lastForced = Date.now();
  const reload = (force) => {
    try {
      const st = [fs.statSync(cfg.tlsCert).mtimeMs, fs.statSync(cfg.tlsKey).mtimeMs].join('/');
      if (!force && st === cur.st) return;
      const next = loadCert();
      server.setSecureContext({ cert: next.cert, key: next.key, minVersion: 'TLSv1.2' });
      cur = next; stats.certReloads++;
      log('proxy: TLS cert reloaded');
    } catch (e) { log('proxy: cert reload failed: ' + e.message); }
  };
  setInterval(() => {
    const force = Date.now() - lastForced >= cfg.certForceReloadMs;
    if (force) lastForced = Date.now();
    reload(force);
  }, cfg.certCheckMs).unref();

  server.listen({ host: cfg.proxyHost, port: cfg.proxyPort, ipv6Only: false }, () =>
    log(`proxy: listening on [${cfg.proxyHost}]:${cfg.proxyPort}`));
  return server;
}

module.exports = { start, stats, authOf };
