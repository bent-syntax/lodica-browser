'use strict';
const http = require('http');
const assert = require('assert');
const test = require('node:test');
const screen = require('../src/screen');

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const routes = { GET: screen.get, PUT: screen.put, DELETE: screen.remove };
const server = http.createServer((req, res) => routes[req.method](req, res, h));
const call = (port, method, body, q = '') => new Promise((ok, bad) => {
  const r = http.request({ port, method, path: '/api/screen' + q }, (res) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ status: res.statusCode, seq: res.headers['x-frame-seq'], body: Buffer.concat(c) }));
  });
  r.on('error', bad); r.end(body);
});
const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n]);

test('screen', async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  try {
    assert.strictEqual((await call(port, 'GET')).status, 204); // nobody sharing
    assert.strictEqual((await call(port, 'PUT', Buffer.from('hello'))).status, 400); // not a jpeg
    assert.strictEqual(JSON.parse((await call(port, 'PUT', jpeg(1))).body).seq, 1);
    const a = await call(port, 'GET');
    assert.strictEqual(a.status, 200); assert.strictEqual(a.seq, '1'); assert.deepStrictEqual(a.body, jpeg(1));
    assert.strictEqual((await call(port, 'GET', undefined, '?after=1')).status, 204); // nothing newer
    // a waiting viewer gets the next frame as soon as it arrives
    const waiting = call(port, 'GET', undefined, '?after=1&wait=5');
    await new Promise((ok) => setTimeout(ok, 50));
    await call(port, 'PUT', jpeg(2));
    const b = await waiting;
    assert.strictEqual(b.status, 200); assert.strictEqual(b.seq, '2');
    assert.strictEqual((await call(port, 'DELETE')).status, 204);
    assert.strictEqual((await call(port, 'GET')).status, 204);
    assert.strictEqual(JSON.parse((await call(port, 'GET', undefined, '?status=1')).body).live, false);
  } finally { screen.reset(); server.close(); }
});
