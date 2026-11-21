'use strict';
// Run: node test/selfupdate.test.js   (stubbed release lookup; temp data dir)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfupdate-'));
process.env.LODICA_DATA_DIR = dir;
const updates = require('../src/updates');
const selfupdate = require('../src/selfupdate');

(async () => {
  const cur = selfupdate.current();
  assert.ok(/^\d+\.\d+\.\d+$/.test(cur), 'reads the version from desktop/package.json');

  updates.latest = async () => ({ version: cur });
  let s = await selfupdate.status();
  assert.strictEqual(s.newer, false);
  await assert.rejects(selfupdate.request(), (e) => e.status === 409);
  assert.ok(!fs.existsSync(path.join(dir, 'update.request')));

  updates.latest = async () => ({ version: '999.0.0' });
  s = await selfupdate.status();
  assert.deepStrictEqual([s.newer, s.pending], [true, false]);
  s = await selfupdate.request();
  assert.strictEqual(s.pending, true);
  assert.ok(fs.existsSync(path.join(dir, 'update.request')));
  await assert.rejects(selfupdate.request(), (e) => e.status === 409);

  fs.rmSync(dir, { recursive: true });
  console.log('ok');
})();
