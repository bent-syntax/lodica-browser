'use strict';
const http = require('http');
const assert = require('assert');
const test = require('node:test');
const pcscreen = require('../src/pcscreen');

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const routes = { GET: pcscreen.get, PUT: pcscreen.put, DELETE: pcscreen.remove };
const server = http.createServer((req, res) => routes[req.method](req, res, h));
const input = http.createServer((req, res) => (req.method === 'GET' ? pcscreen.inputGet : pcscreen.inputPost)(req, res, h));
const call = (srv, method, body, q = '') => new Promise((ok, bad) => {
  const r = http.request({ port: srv.address().port, method, path: '/api/pcscreen' + q }, (res) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ status: res.statusCode, seq: res.headers['x-frame-seq'], body: Buffer.concat(c) }));
  });
  r.on('error', bad); r.end(body);
});
const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n]);

test('pcscreen frames and input round-trip', async () => {
  await Promise.all([new Promise((ok) => server.listen(0, '127.0.0.1', ok)), new Promise((ok) => input.listen(0, '127.0.0.1', ok))]);
  try {
    assert.strictEqual((await call(server, 'GET')).status, 204);
    assert.strictEqual((await call(server, 'PUT', Buffer.from('hello'))).status, 400);
    assert.strictEqual(JSON.parse((await call(server, 'PUT', jpeg(1))).body).seq, 1);
    const a = await call(server, 'GET');
    assert.strictEqual(a.status, 200); assert.strictEqual(a.seq, '1'); assert.deepStrictEqual(a.body, jpeg(1));
    const bad = JSON.stringify({ events: [{ t: 'key', key: 'evil' }, { t: 'tap', x: 2, y: 0 }, { t: 'tap', x: 0.5, y: 0.25 }] });
    assert.strictEqual(JSON.parse((await call(input, 'POST', Buffer.from(bad), '/input')).body).queued, 1);
    const got = JSON.parse((await call(input, 'GET', undefined, '/input')).body);
    assert.strictEqual(got.events.length, 1);
    assert.strictEqual(got.events[0].t, 'tap');
    assert.strictEqual(got.events[0].x, 0.5);
    assert.strictEqual((await call(server, 'DELETE')).status, 204);
    assert.strictEqual((await call(server, 'GET')).status, 204);
  } finally { pcscreen.reset(); server.close(); input.close(); }
});
