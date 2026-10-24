'use strict';
// Run: node test/support.test.js   (in-process; loopback only)
const http = require('http');
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lodica-support-test-'));
process.env.LODICA_DATA_DIR = dir;
const tokenFile = path.join(dir, 'admin-token');
fs.writeFileSync(tokenFile, 'a-long-admin-token-for-tests');
process.env.LODICA_SUPPORT_ADMIN_TOKEN_PATH = tokenFile;
const support = require('../src/support');
support.load();

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let r;
  if (url.pathname === '/api/support') return support.create(req, res, '9.9.9.9', h);
  if (url.pathname === '/api/support/admin') return support.adminList(req, res, url, h);
  if ((r = /^\/api\/support\/admin\/([0-9a-f]{16})$/.exec(url.pathname))) return support.adminPost(req, res, r[1], h);
  if ((r = /^\/api\/support\/(.+)$/.exec(url.pathname))) return req.method === 'GET' ? support.get(req, res, r[1], h) : support.reply(req, res, r[1], '9.9.9.9', h);
  send(req, res, 404, 'no');
});
const call = (port, method, p, body, auth) => new Promise((ok, bad) => {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.authorization = 'Bearer ' + auth;
  const r = http.request({ port, method, path: p, headers }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ status: res.statusCode, json: d.startsWith('{') ? JSON.parse(d) : d }));
  });
  r.on('error', bad); r.end(body && JSON.stringify(body));
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const ADMIN = 'a-long-admin-token-for-tests';
  try {
    assert.strictEqual((await call(port, 'POST', '/api/support', { text: '  ' })).status, 400);
    const c = await call(port, 'POST', '/api/support', { text: 'tabs crash', name: 'Sam', app: 'android', version: '1.12.9' });
    assert.strictEqual(c.status, 200);
    const id = c.json.id;
    assert.match(id, /^[0-9a-f]{16}$/);
    assert.strictEqual((await call(port, 'GET', '/api/support/' + id)).json.messages[0].text, 'tabs crash');
    assert.strictEqual((await call(port, 'GET', '/api/support/nope')).status, 404);

    assert.strictEqual((await call(port, 'GET', '/api/support/admin')).status, 401);
    assert.strictEqual((await call(port, 'GET', '/api/support/admin', null, 'wrong')).status, 401);
    const l = await call(port, 'GET', '/api/support/admin?after=0', null, ADMIN);
    assert.strictEqual(l.json.tickets.length, 1);
    const rev = l.json.rev;
    assert.strictEqual((await call(port, 'GET', '/api/support/admin?after=' + rev, null, ADMIN)).json.tickets.length, 0);

    const waiting = call(port, 'GET', '/api/support/admin?after=' + rev + '&wait=5', null, ADMIN);
    await new Promise((r) => setTimeout(r, 100));
    const a = await call(port, 'POST', '/api/support/admin/' + id, { status: 'needs-info', text: 'Which site?' }, ADMIN);
    assert.strictEqual(a.json.status, 'needs-info');
    assert.strictEqual((await waiting).json.tickets[0].messages.length, 2);

    assert.strictEqual((await call(port, 'POST', '/api/support/admin/' + id, { status: 'bogus' }, ADMIN)).status, 400);
    const r = await call(port, 'POST', '/api/support/' + id, { text: 'example.com' });
    assert.strictEqual(r.json.status, 'new');
    assert.strictEqual(r.json.messages[2].from, 'user');
    console.log('support ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close(); process.exit(process.exitCode || 0);
});
