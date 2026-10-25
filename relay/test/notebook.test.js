'use strict';
const http = require('http');
const assert = require('assert');
const test = require('node:test');
process.env.LODICA_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lodica-notebook-'));
const notebook = require('../src/notebook');

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const server = http.createServer((req, res) => (req.method === 'PUT' ? notebook.put(req, res, h) : notebook.get(req, res, h)));
const call = (port, method, body) => new Promise((ok, bad) => {
  const r = http.request({ port, method, path: '/api/notebook' }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ status: res.statusCode, json: d.startsWith('{') ? JSON.parse(d) : d }));
  });
  r.on('error', bad); r.end(body === undefined ? undefined : JSON.stringify(body));
});

test('notebook', async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  try {
    assert.deepStrictEqual((await call(port, 'GET')).json, { text: '', rev: 0, at: 0 });
    const a = await call(port, 'PUT', { text: 'one', base: 0 });
    assert.strictEqual(a.status, 200); assert.strictEqual(a.json.rev, 1);
    const stale = await call(port, 'PUT', { text: 'two', base: 0 });
    assert.strictEqual(stale.status, 409); assert.strictEqual(stale.json.text, 'one');
    assert.strictEqual((await call(port, 'PUT', { text: 'two', base: 1 })).json.rev, 2);
    assert.strictEqual((await call(port, 'PUT', { text: 5 })).status, 400);
    notebook.reset();
    assert.strictEqual((await call(port, 'GET')).json.text, 'two'); // persisted
  } finally { server.close(); }
});
