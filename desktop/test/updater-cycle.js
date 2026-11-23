// Repeated check() must replace an already-available offer. Run: node test/updater-cycle.js (plain node, no electron).
const http = require('http');
const assert = require('assert');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (r, ...a) { return r === 'electron' ? {} : origLoad.call(this, r, ...a); };
const up = require('../main/updater');

let tag = 'v1.20.4';
const seen = [];
const srv = http.createServer((req, res) => {
  seen.push(req.url);
  if (req.url.startsWith('/releases/latest')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: tag, name: tag, body: 'notes', assets: [
      { name: 'Lodica-x.AppImage', size: 1234, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: 'http://127.0.0.1/x.AppImage' },
    ] }));
  }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  up._setEnv({ api: 'http://127.0.0.1:' + srv.address().port, version: '1.0.0', platform: 'linux', dir: () => '/tmp' });

  let s = await up.check();
  assert.deepStrictEqual([s.state, s.version], ['available', '1.20.4']);

  tag = 'v1.20.5';
  s = await up.check(); // no _reset(): the stale 1.20.4 offer must be gone
  assert.deepStrictEqual([s.state, s.version], ['available', '1.20.5']);
  assert.notStrictEqual(s.version, '1.20.4');

  tag = 'v1.20.6';
  s = await up.check();
  assert.deepStrictEqual([s.state, s.version], ['available', '1.20.6']);

  const checks = seen.filter((u) => u.startsWith('/releases/latest'));
  assert.strictEqual(checks.length, 3, 'three real checks');
  assert(checks.every((u) => /[?&]_=\d+/.test(u)), 'each check has a no-cache bust param');
  srv.close();
  console.log('updater-cycle: all PASS');
})().catch((e) => { console.error('FAIL', e); try { srv.close(); } catch {} process.exit(1); });
