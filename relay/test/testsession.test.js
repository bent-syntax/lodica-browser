'use strict';
// Remote test session: code join, allowlist, results, user stop. Run: node test/testsession.test.js (loopback only)
const http = require('http');
const assert = require('assert');
const ts = require('../src/testsession');

const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const api = http.createServer((req, res) => {
  const p = req.url.split('?')[0]; let r;
  if (p === '/start') return ts.start(req, res, '9.9.9.9', h);
  if (p === '/join') return ts.join(req, res, h);
  if ((r = /^\/c\/(\w+)$/.exec(p))) return req.method === 'GET' ? ts.clientGet(req, res, r[1], h) : ts.clientPost(req, res, r[1], h);
  if ((r = /^\/a\/(\w+)$/.exec(p))) return req.method === 'GET' ? ts.adminGet(req, res, r[1], h) : ts.command(req, res, r[1], h);
  send(res, 404, 'no');
});
api.listen(0, '127.0.0.1', async () => {
  const port = api.address().port;
  const call = (method, p, body) => new Promise((ok, bad) => {
    const r = http.request({ port, method, path: p, headers: { 'content-type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok(res.statusCode === 200 ? JSON.parse(d) : { status: res.statusCode, text: d }));
    });
    r.on('error', bad); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    const s = await call('POST', '/start', {});
    assert.match(s.code, /^\d{8}$/);
    assert.equal((await call('POST', '/a/' + s.id, { action: 'click', args: {} })).status, 409, 'no commands before join');
    assert.equal((await call('POST', '/join', { code: '00000000' })).status, 404);
    assert.equal((await call('POST', '/join', { code: s.code })).id, s.id);
    assert.equal((await call('POST', '/a/' + s.id, { action: 'readfile', args: {} })).status, 400, 'not on the allowlist');
    assert.equal((await call('POST', '/a/' + s.id, { action: 'click', args: { selector: '#x' } })).seq, 1);
    const c = await call('GET', '/c/' + s.id + '?after=0');
    assert.equal(c.state, 'active'); assert.equal(c.cmds[0].action, 'click');
    await call('POST', '/c/' + s.id, { result: { seq: 1, ok: true, data: { done: 1 } } });
    assert.equal((await call('GET', '/a/' + s.id + '?after=0')).results[0].data.done, 1);
    await call('POST', '/c/' + s.id, { stop: true });
    assert.equal((await call('POST', '/a/' + s.id, { action: 'click', args: {} })).status, 409, 'stopped by user');
    assert.equal((await call('POST', '/join', { code: s.code })).status, 404, 'code dead after stop');
    console.log('ok');
  } finally { api.close(); process.exit(process.exitCode || 0); }
});
