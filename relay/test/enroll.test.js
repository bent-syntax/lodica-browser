'use strict';
// Run: node test/enroll.test.js   (in-process; loopback only, no relay token)
const http = require('http');
const assert = require('assert');
const enroll = require('../src/enroll');

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o, x) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json', ...x }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const server = http.createServer((req, res) => {
  const r = /^\/pending\/(.+)$/.exec(req.url);
  const st = /^\/gate\/state\/(.+)$/.exec(req.url);
  if (st) return enroll.status(req, res, '5.6.7.8', decodeURIComponent(st[1]), h);
  if (req.method === 'POST') return enroll.start(req, res, '1.2.3.4', h);
  enroll.take(req, res, '5.6.7.8', decodeURIComponent(r[1]), h);
});
const call = (port, method, path, host = 'lodica.example.org:44741') => new Promise((ok, bad) => {
  const r = http.request({ port, method, path, headers: { host } }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ status: res.statusCode, cookie: res.headers['set-cookie'], json: d.startsWith('{') ? JSON.parse(d) : d }));
  });
  r.on('error', bad); r.end();
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    assert.strictEqual((await call(port, 'POST', '/gate/start', 'evil.example.org')).status, 400, 'host must be lodica.<domain>');
    const r = await call(port, 'POST', '/gate/start');
    assert.strictEqual(r.status, 200);
    assert.match(r.json.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const m = /^lodica_gate=([0-9a-f]{64}); Domain=example\.org; Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax$/.exec(r.cookie[0]);
    assert.ok(m, 'cookie ' + r.cookie);
    const token = m[1];
    assert.strictEqual((await call(port, 'GET', '/gate/state/' + r.json.code)).json.state, 'pending');
    const g = await call(port, 'GET', '/pending/' + r.json.code.toLowerCase());
    assert.strictEqual((await call(port, 'GET', '/gate/state/' + r.json.code)).json.state, 'approved');
    assert.strictEqual(g.status, 200); assert.strictEqual(g.json.token, token);
    assert.strictEqual((await call(port, 'GET', '/pending/' + r.json.code)).status, 404, 'single use');
    // Expiry.
    const e = (await call(port, 'POST', '/gate/start')).json;
    const real = Date.now; Date.now = () => real() + enroll.TTL + 1000;
    const x = await call(port, 'GET', '/pending/' + e.code); Date.now = real;
    assert.strictEqual(x.status, 404, 'expired');
    // Guess limiter.
    let last;
    for (let i = 0; i < 12; i++) last = await call(port, 'GET', '/pending/AAAA-AAAA');
    assert.strictEqual(last.status, 429);
    console.log('enroll ok');
  } catch (err) { console.error(err); process.exitCode = 1; }
  server.close();
});
