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
const REQ = path.join(dir, 'update.request');

(async () => {
  const cur = selfupdate.current();
  assert.ok(/^\d+\.\d+\.\d+$/.test(cur), 'reads the version from desktop/package.json');

  const latestCalls = [];
  let ver = cur;
  updates.latest = async (key, fresh) => { latestCalls.push([key, fresh]); return { version: ver }; };

  // Running version: no update, no request, explicit state.
  let s = await selfupdate.status();
  assert.deepStrictEqual([s.newer, s.pending, s.state], [false, false, 'current']);
  assert.strictEqual(s.current, cur);
  assert(latestCalls.length > 0 && latestCalls.every((c) => c[0] === 'android' && c[1] === true), 'status forces a fresh upstream check');
  await assert.rejects(selfupdate.request(), (e) => e.status === 409, 'no update => 409');
  assert.ok(!fs.existsSync(REQ));

  // New version: one request only. EEXIST from the atomic write maps to 409 on a race.
  ver = '999.0.0';
  s = await selfupdate.status();
  assert.deepStrictEqual([s.newer, s.pending, s.state], [true, false, 'available']);
  s = await selfupdate.request();
  assert.deepStrictEqual([s.pending, s.state], [true, 'pending']);
  assert.ok(fs.existsSync(REQ));
  await assert.rejects(selfupdate.request(), (e) => e.status === 409, 'already queued => 409');

  fs.unlinkSync(REQ); // the root helper consumed the request; do not leave pending stuck
  s = await selfupdate.status();
  assert.deepStrictEqual([s.pending, s.state], [false, 'available']);

  const race = await Promise.allSettled([selfupdate.request(), selfupdate.request()]);
  assert.strictEqual(race.filter((r) => r.status === 'fulfilled').length, 1, 'only one atomic write wins');
  assert.strictEqual(race.filter((r) => r.status === 'rejected' && r.reason.status === 409).length, 1, 'duplicate write is 409');

  // A request whose timestamp expired is not pending, and a new one may be queued.
  fs.writeFileSync(REQ, String(Date.now() - 121e3));
  s = await selfupdate.status();
  assert.deepStrictEqual([s.pending, s.state], [false, 'expired']);
  assert.ok(!fs.existsSync(REQ), 'stale request is cleared so retry can write');
  s = await selfupdate.request();
  assert.strictEqual(s.pending, true);

  // Pending but already current: the UI must not claim an upgrade is still running.
  ver = cur;
  s = await selfupdate.status();
  assert.deepStrictEqual([s.newer, s.pending, s.state], [false, true, 'pending']);

  // Unparseable timestamps are stale too, never a forever-pending request.
  fs.writeFileSync(REQ, 'not-a-timestamp');
  s = await selfupdate.status();
  assert.deepStrictEqual([s.pending, s.state], [false, 'expired']);
  assert.ok(!fs.existsSync(REQ));

  fs.rmSync(dir, { recursive: true });
  console.log('selfupdate: all PASS');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
