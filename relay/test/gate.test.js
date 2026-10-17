'use strict';
// Run: node test/gate.test.js
// Drives tools/lodica-gate.py against an in-process relay (enroll.js) and temp dirs, then evaluates the generated
// .htaccess rules with a small interpreter of the RewriteCond/RewriteRule subset used. No root, no network, no live host.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawn } = require('child_process');
const enroll = require('../src/enroll');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
const etc = path.join(tmp, 'etc'), dirA = path.join(tmp, 'a'), dirB = path.join(tmp, 'b');
fs.mkdirSync(etc); fs.mkdirSync(dirA); fs.writeFileSync(path.join(etc, 'dirs.conf'), dirA + '\n' + dirB + '\n');
fs.writeFileSync(path.join(tmp, 'token'), 'relay-token\n');
fs.writeFileSync(path.join(dirA, '.htaccess'), '<FilesMatch "^x$">\nRequire all denied\n</FilesMatch>\n');

const h = {
  sendJson: (q, s, st, o) => { s.writeHead(st, { 'content-type': 'application/json' }); s.end(JSON.stringify(o)); },
  sendText: (q, s, st, t) => { s.writeHead(st); s.end(t); },
  readBody: (q) => new Promise((ok) => { const c = []; q.on('data', (d) => c.push(d)); q.on('end', () => ok(Buffer.concat(c))); }),
};
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer relay-token') return h.sendText(req, res, 401, 'no');
  if (req.method === 'POST') return enroll.post(req, res, '1.1.1.1', h);
  enroll.take(req, res, '2.2.2.2', decodeURIComponent(req.url.split('/')[2]), h);
});

/** Evaluate the managed block: returns 200 or 403 for a request with the given header and cookie. */
function gate(dir, header, cookie) {
  const lines = fs.readFileSync(path.join(dir, '.htaccess'), 'utf8').split('\n');
  const b = lines.slice(lines.findIndex((l) => l.startsWith('# BEGIN lodica-gate')), lines.findIndex((l) => l.startsWith('# END lodica-gate')));
  const conds = []; let ok = false, pending = [];
  for (const l of b) {
    let m;
    if ((m = /^RewriteCond %\{(HTTP:X-Lodica-Gate|HTTP_COOKIE)\} (\S+?)( \[OR\])?$/.exec(l))) {
      const v = m[1] === 'HTTP_COOKIE' ? cookie || '' : header || '';
      const hit = m[1] === 'HTTP_COOKIE' ? new RegExp(m[2]).test(v) : v === m[2].replace(/^=/, '');
      pending.push(hit);
      if (!m[3]) { conds.push(pending.some(Boolean)); pending = []; }
    } else if (l.startsWith('RewriteRule ^ - [S=1]')) { ok = conds.length > 0 && conds.every(Boolean) || conds.some(Boolean); return ok ? 200 : (b.some((x) => x.includes('[F,L]')) ? 403 : 200); }
    else if (l.startsWith('RewriteRule ^ - [F,L]')) return 403;
  }
  return 403;
}

const py = (cmd, ...args) => new Promise((ok) => {
  const c = spawn('python3', ['-I', path.join(__dirname, '../tools/lodica-gate.py'), cmd, ...args], {
    env: { PATH: process.env.PATH, LODICA_GATE_ETC: etc, LODICA_GATE_TOKEN_FILE: path.join(tmp, 'token'), LODICA_GATE_RELAY: 'http://127.0.0.1:' + server.address().port, LODICA_GATE_PUSH: 'none' },
  });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
  c.on('close', (status) => ok({ status, stdout, stderr }));
});
const post = (body) => new Promise((ok) => { const r = http.request({ port: server.address().port, method: 'POST', path: '/enroll', headers: { authorization: 'Bearer relay-token' } }, (s) => { let d = ''; s.on('data', (c) => (d += c)); s.on('end', () => ok(JSON.parse(d))); }); r.end(JSON.stringify(body)); });

server.listen(0, '127.0.0.1', async () => {
  try {
    const t1 = 'a1'.repeat(32), t2 = 'b2'.repeat(32);
    const c1 = (await post({ token: t1, label: 'bent desktop' })).code, c2 = (await post({ token: t2 })).code;
    let r = await py('approve', c1, 'bent-desktop'); assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(t1), 'token never printed');
    r = await py('approve', c2, 'warre-phone'); assert.strictEqual(r.status, 0, r.stderr);
    assert.notStrictEqual((await py('approve', c2, 'x')).status, 0, 'code is single use');
    for (const d of [dirA, dirB]) {
      assert.strictEqual(gate(d, t1), 200); assert.strictEqual(gate(d, null, 'a=b; lodica_gate=' + t2), 200);
      assert.strictEqual(gate(d), 403); assert.strictEqual(gate(d, 'x'.repeat(64)), 403);
      assert.strictEqual(gate(d, null, 'lodica_gate=' + t1 + 'ff'), 403, 'prefix is not a match');
    }
    assert.ok(fs.readFileSync(path.join(dirA, '.htaccess'), 'utf8').includes('Require all denied'), 'existing rules kept');
    assert.ok(!(await py('devices')).stdout.includes(t1), 'devices hides tokens');
    assert.match((await py('devices')).stdout, /bent-desktop[\s\S]*warre-phone/);
    r = await py('revoke', 'bent-desktop'); assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(gate(dirA, t1), 403); assert.strictEqual(gate(dirB, t2), 200);
    await py('revoke', 'warre-phone'); assert.strictEqual(gate(dirA, t2), 403, 'empty list denies all');
    assert.notStrictEqual((await py('revoke', 'nobody')).status, 0);
    console.log('gate ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close(); fs.rmSync(tmp, { recursive: true });
});
