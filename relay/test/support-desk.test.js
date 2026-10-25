'use strict';
// The relay hands new tickets and user messages to the support desk. Run: node test/support-desk.test.js (loopback only)
const http = require('http');
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lodica-desk-test-'));
process.env.LODICA_DATA_DIR = dir;
const secretFile = path.join(dir, 'desk-secret');
fs.writeFileSync(secretFile, 'desk-secret-for-tests\n');
process.env.LODICA_DESK_SECRET_PATH = secretFile;

const got = [];
const desk = http.createServer((req, res) => {
  let d = ''; req.on('data', (c) => (d += c));
  req.on('end', () => { got.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(d) }); res.end('{}'); });
});
desk.listen(0, '127.0.0.1', async () => {
  process.env.LODICA_DESK_URL = 'http://127.0.0.1:' + desk.address().port;
  const support = require('../src/support');
  support.load();
  const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
  const h = {
    sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
    sendText: (req, res, s, t) => send(req, res, s, t),
    readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => ok(Buffer.concat(c))); }),
  };
  const api = http.createServer((req, res) => {
    let r;
    if (req.url === '/api/support') return support.create(req, res, '9.9.9.9', h);
    if ((r = /^\/api\/support\/([0-9a-f]{16})$/.exec(req.url))) return support.reply(req, res, r[1], '9.9.9.9', h);
    send(req, res, 404, 'no');
  });
  const call = (port, p, body) => new Promise((ok, bad) => {
    const r = http.request({ port, method: 'POST', path: p, headers: { 'content-type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok(res.statusCode === 200 ? JSON.parse(d) : { status: res.statusCode, text: d }));
    });
    r.on('error', bad); r.end(JSON.stringify(body));
  });
  const wait = async (n) => { for (let i = 0; i < 50 && got.length < n; i++) await new Promise((r) => setTimeout(r, 20)); };
  api.listen(0, '127.0.0.1', async () => {
    const port = api.address().port;
    try {
      const refused = await call(port, '/api/support', { text: 'no email linked' });
      assert.strictEqual(refused.status, 403);
      const link = 'a'.repeat(64);
      const t = await call(port, '/api/support', { text: 'tabs crash', name: 'Sam', app: 'android', version: '1.13.1', platform: 'Android 15', link });
      await wait(1);
      assert.strictEqual(got[0].url, '/relay/ticket');
      assert.strictEqual(got[0].auth, 'Bearer desk-secret-for-tests');
      assert.deepStrictEqual(got[0].body, { relayId: t.id, text: 'tabs crash', name: 'Sam', app: 'android', version: '1.13.1', platform: 'Android 15', link });
      await call(port, '/api/support/' + t.id, { text: 'still crashing' });
      await wait(2);
      assert.strictEqual(got[1].body.text, 'still crashing');
      assert.strictEqual(got[1].body.relayId, t.id);
      console.log('support-desk: ok');
    } catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
    api.close(); desk.close(); fs.rmSync(dir, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
});
