'use strict';
const assert = require('node:assert');
const test = require('node:test');
const devices = require('../src/devices');

test('linked device registry keeps metadata, online state and a platform target', () => {
  devices.reset();
  const pc = devices.register({ id: 'pc-1', name: 'Desk PC', platform: 'desktop' });
  const phone = devices.register({ id: 'phone-1', name: 'Pocket', platform: 'android' });
  assert.strictEqual(pc.name, 'Desk PC');
  assert.strictEqual(pc.platform, 'desktop');
  assert.strictEqual(phone.online, true);
  assert.strictEqual(devices.register({ id: 'bad id', name: 'x', platform: 'desktop' }), null);
  const list = devices.list();
  assert.strictEqual(list.length, 2);
  assert.ok(list.some((d) => d.id === 'pc-1' && d.platform === 'desktop' && typeof d.online === 'boolean'));
  assert.strictEqual(devices.defaultTarget('android', 'phone-1'), null);
  assert.strictEqual(devices.defaultTarget('desktop', 'phone-1').id, 'pc-1');
  assert.strictEqual(devices.heartbeat('pc-1'), true);
  assert.strictEqual(devices.heartbeat('missing'), false);
  assert.strictEqual(devices.remove('phone-1'), true);
  assert.strictEqual(devices.list().length, 1);
  devices.reset();
});
