'use strict';
// Run: node test/updates.test.js   (fake GitHub upstream; no network, no real token)
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');

const blob = crypto.randomBytes(300000);
const sha = crypto.createHash('sha256').update(blob).digest('hex');
let seenAuth = [];
const up = http.createServer((req, res) => {
  seenAuth.push(req.url + ' ' + (req.headers.authorization || '-'));
  if (req.url === '/repos/bent-syntax/lodica-browser/releases/latest') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ tag_name: 'v0.2.0', name: 'Lodica 0.2.0', body: 'notes', published_at: '2026-10-01T00:00:00Z',
      assets: [{ id: 7, name: 'lodica.apk', size: blob.length, state: 'uploaded', digest: 'sha256:' + sha },
        { id: 8, name: 'Lodica-Setup-0.2.0.exe', size: blob.length, state: 'uploaded' },
        { id: 9, name: 'SHA256SUMS', size: 90, state: 'uploaded' }] }));
  }
  if (req.url === '/repos/bent-syntax/lodica-browser/releases/assets/9') {
    res.writeHead(302, { location: 'http://127.0.0.1:' + up.address().port + '/sums' }); return res.end();
  }
  if (req.url === '/sums') return res.end(sha + '  Lodica-Setup-0.2.0.exe\n');
  if (req.url.startsWith('/repos/bent-syntax/lodica-browser/releases/assets/7')) {
    res.writeHead(302, { location: 'http://127.0.0.1:' + up.address().port + '/blob' }); return res.end();
  }
  if (req.url === '/blob') return res.end(blob);
  res.statusCode = 404; res.end('{}');
});

(async () => {
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  process.env.LODICA_GH_API = 'http://127.0.0.1:' + up.address().port;
  delete process.env.LODICA_GH_TOKEN;
  const u = require('../src/updates');
  const U = (q) => new URL('http://x/?' + q);

  process.env.LODICA_GH_TOKEN = 'FAKE_TEST_TOKEN';
  await assert.rejects(u.check(U('app=foo')), (e) => e.status === 400, 'bad app');

  let c = await u.check(U('app=android&version=0.1.0'));
  assert.deepStrictEqual([c.version, c.newer, c.sha256, c.file], ['0.2.0', true, sha, 'lodica.apk']);
  assert.strictEqual((await u.check(U('app=android&version=0.2.0'))).newer, false);
  assert.strictEqual(JSON.stringify(c).includes('FAKE'), false, 'token not in response');

  c = await u.check(U('app=desktop&platform=win&version=0.1.0'));
  assert.deepStrictEqual([c.version, c.newer, c.sha256], ['0.2.0', true, sha], 'checksum file fallback');
  await assert.rejects(u.check(U('app=desktop&platform=linux')), (e) => e.status === 404, 'no AppImage');

  const d = await u.download(U('app=android'));
  const chunks = []; for await (const ch of d.stream) chunks.push(ch);
  assert(Buffer.concat(chunks).equals(blob), 'download bytes');
  assert(seenAuth.some((a) => a.startsWith('/repos/bent-syntax/lodica-browser/releases/assets/7 Bearer ')));
  assert(seenAuth.filter((a) => a.startsWith('/blob')).every((a) => a.endsWith(' -')), 'no token to redirect target');

  assert(u.newer('1.10.0', '1.9.9') && !u.newer('1.0', '1.0.0') && u.newer('v2', '1.9'));
  console.log('updates: all PASS');
  up.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
