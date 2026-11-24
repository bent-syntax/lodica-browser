'use strict';
const http = require('http');
const assert = require('node:assert');
const test = require('node:test');
const screen = require('../src/screen');
const pcscreen = require('../src/pcscreen');

const h = {
  sendJson: (req, res, s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); },
  sendText: (req, res, s, t) => { res.writeHead(s); res.end(t); },
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const jpeg = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n]);
function server(routes) {
  const s = http.createServer((req, res) => routes[req.method](req, res, h));
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}
function call(s, method, path, body) {
  return new Promise((ok, bad) => {
    const r = http.request({ port: s.address().port, method, path }, (res) => {
      const c = []; res.on('data', (d) => c.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(c);
        const json = res.headers['content-type'] === 'application/json' && buf.length ? JSON.parse(buf.toString()) : null;
        ok({ status: res.statusCode, body: buf, json, seq: res.headers['x-frame-seq'] });
      });
    });
    r.on('error', bad); r.end(body);
  });
}

test('phone screen frames and input are isolated by deviceId', async () => {
  screen.reset();
  const s = await server({
    PUT: screen.put,
    DELETE: screen.remove,
    GET: (req, res, hh) => (req.url.includes('/input') ? screen.inputGet(req, res, hh) : screen.get(req, res, hh)),
    POST: screen.inputPost,
  });
  try {
    assert.strictEqual((await call(s, 'PUT', '/api/screen?deviceId=pc-one', jpeg(1))).json.seq, 1);
    assert.strictEqual((await call(s, 'GET', '/api/screen?deviceId=pc-two')).status, 204);
    assert.strictEqual((await call(s, 'GET', '/api/screen?deviceId=pc-one')).status, 200);
    assert.strictEqual((await call(s, 'PUT', '/api/screen?deviceId=pc-two', jpeg(2))).json.seq, 1);
    assert.deepStrictEqual((await call(s, 'GET', '/api/screen?deviceId=pc-one')).body, jpeg(1));
    assert.deepStrictEqual((await call(s, 'GET', '/api/screen?deviceId=pc-two')).body, jpeg(2));
    await call(s, 'PUT', '/api/screen?deviceId=pc-one', jpeg(3));
    const posted = await call(s, 'POST', '/api/screen/input', JSON.stringify({ deviceId: 'pc-one', events: [{ t: 'tap', x: 0.2, y: 0.4 }] }));
    assert.strictEqual(posted.json.queued, 1);
    assert.strictEqual((await call(s, 'GET', '/api/screen/input?deviceId=pc-one')).json.events.length, 1);
    assert.strictEqual((await call(s, 'GET', '/api/screen/input?deviceId=pc-two')).json.events.length, 0);
  } finally { screen.reset(); s.close(); }
});

test('PC screen requests target only the chosen desktop', async () => {
  pcscreen.reset();
  const s = await server({
    PUT: pcscreen.put,
    DELETE: (req, res) => (req.url.includes('/request') ? pcscreen.requestDelete(req, res) : pcscreen.remove(req, res)),
    GET: (req, res, hh) => (req.url.includes('/input') ? pcscreen.inputGet(req, res, hh) :
      req.url.includes('/request') ? pcscreen.requestGet(req, res, hh) : pcscreen.get(req, res, hh)),
    POST: (req, res, hh) => (req.url.includes('/input') ? pcscreen.inputPost(req, res, hh) : pcscreen.requestPost(req, res, hh)),
  });
  try {
    assert.strictEqual((await call(s, 'PUT', '/api/pcscreen?deviceId=phone-a', jpeg(1))).json.seq, 1);
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen?deviceId=phone-b')).status, 204);
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen?deviceId=phone-a')).seq, '1');
    const request = JSON.stringify({ deviceId: 'pc-a', from: 'phone-a' });
    assert.strictEqual((await call(s, 'POST', '/api/pcscreen/request', request)).json.pending, true);
    const pending = (await call(s, 'GET', '/api/pcscreen/request?deviceId=pc-a')).json;
    assert.strictEqual(pending.pending, true);
    assert.strictEqual(pending.requests[0].from, 'phone-a');
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen/request?deviceId=pc-b')).json.pending, false);
    assert.strictEqual((await call(s, 'PUT', '/api/pcscreen?deviceId=phone-a', jpeg(2))).json.seq, 2);
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen/request?deviceId=pc-a')).json.pending, false);
    assert.strictEqual((await call(s, 'POST', '/api/pcscreen/request', request)).json.pending, true);
    assert.strictEqual((await call(s, 'DELETE', '/api/pcscreen/request?deviceId=pc-a&from=phone-a')).status, 204);
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen/request?deviceId=pc-a')).json.pending, false);
    await call(s, 'PUT', '/api/pcscreen?deviceId=pc-a', jpeg(3));
    const posted = await call(s, 'POST', '/api/pcscreen/input', JSON.stringify({ deviceId: 'pc-a', from: 'phone-a', events: [{ t: 'right', x: 0.5, y: 0.5 }, { t: 'scroll', x: 0.5, y: 0.5, steps: -2 }] }));
    assert.strictEqual(posted.json.queued, 2);
    const events = (await call(s, 'GET', '/api/pcscreen/input?deviceId=pc-a')).json.events;
    assert.deepStrictEqual(events.map((e) => e.t), ['right', 'scroll']);
    assert.strictEqual(events[1].steps, -2);
    assert.strictEqual((await call(s, 'GET', '/api/pcscreen/input?deviceId=pc-b')).json.events.length, 0);
  } finally { pcscreen.reset(); s.close(); }
});
