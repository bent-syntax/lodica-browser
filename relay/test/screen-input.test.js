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
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/input')) return (req.method === 'POST' ? screen.inputPost : screen.inputGet)(req, res, h);
  return (req.method === 'PUT' ? screen.put : screen.get)(req, res, h);
});
const call = (port, method, path, body) => new Promise((ok, bad) => {
  const r = http.request({ port, method, path }, (res) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ status: res.statusCode, json: c.length && res.headers['content-type'] === 'application/json' ? JSON.parse(Buffer.concat(c)) : null }));
  });
  r.on('error', bad); r.end(body);
});

test('screen input', async () => {
  screen.reset();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  const post = (events) => call(port, 'POST', '/input', JSON.stringify({ events }));
  try {
    // not sharing: nothing is queued
    assert.strictEqual((await post([{ t: 'tap', x: 0.5, y: 0.5 }])).json.queued, 0);
    await call(port, 'PUT', '/', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]));
    const r = await post([{ t: 'tap', x: 0.5, y: 0.5 }, { t: 'tap', x: 2, y: 0 }, { t: 'key', key: 'back' }, { t: 'key', key: 'power' }, { t: 'swipe', x: 0.5, y: 0.8, x2: 0.5, y2: 0.2 }, 'x']);
    assert.strictEqual(r.json.queued, 3);
    const got = await call(port, 'GET', '/input');
    assert.deepStrictEqual(got.json.events.map((e) => e.t), ['tap', 'key', 'swipe']);
    assert.strictEqual((await call(port, 'GET', '/input')).json.events.length, 0); // drained
    // a waiting phone is woken by a new event
    const waiting = call(port, 'GET', '/input?wait=5');
    await new Promise((ok) => setTimeout(ok, 50));
    await post([{ t: 'key', key: 'home' }]);
    assert.strictEqual((await waiting).json.events[0].key, 'home');
  } finally { server.close(); }
});
