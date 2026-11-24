'use strict';
// Wireless ADB pairing: pair once, discover the real connection serial, remember it and reconnect later. No device needed.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const storePath = require.resolve('../main/store');
const disk = {};
require.cache[storePath] = {
  id: storePath, filename: storePath, loaded: true, exports: {
    load: (k, d) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : d),
    save: (k, get) => { disk[k] = JSON.parse(JSON.stringify(get())); return true; },
  },
};
const adb = require('../main/adb');
const noDelay = () => Promise.resolve();
const reset = () => { delete disk.adbPaired; delete disk.adbSerials; };

(async () => {
  assert.strictEqual(adb.cleanPairCode('123456'), '123456');
  assert.strictEqual(adb.cleanPairCode('123 456'), '123456');
  assert.strictEqual(adb.cleanPairCode('12-45-6'), '');
  assert.strictEqual(adb.cleanPairCode('abcdef'), '');
  assert.strictEqual(adb.cleanPairCode('12345'), '');
  assert.strictEqual(adb.cleanPairCode('1234567'), '');
  assert.strictEqual(adb.cleanAddress('192.168.1.20:65536'), '');
  assert.strictEqual(adb.cleanAddress('999.1.1.1:5555'), '');
  assert.strictEqual(adb.cleanAddress('192.168.1.20:5555'), '192.168.1.20:5555');
  assert.strictEqual(adb.cleanSerial('adb-1234._adb-tls-connect._tcp'), 'adb-1234._adb-tls-connect._tcp');
  assert.strictEqual(adb.cleanSerial('a b'), '');
  assert.strictEqual(adb.cleanSerial('__proto__'), '');
  assert.strictEqual(adb.isWirelessSerial('adb-1234._adb-tls-connect._tcp'), true);
  assert.strictEqual(adb.isWirelessSerial('emulator-5554'), false);

  const SERIAL = 'adb-ABC123-XYZ._adb-tls-connect._tcp';
  const PAIR = '192.168.1.20:44444';
  const CONNECT = '192.168.1.20:5555';

  // mDNS auto-connect: pairing succeeds and the real serial appears in `adb devices` on its own.
  reset();
  const calls = [];
  let live = true;
  const mDnsApi = adb.create(async (args) => {
    calls.push(args);
    if (args[0] === 'pair') return Buffer.from('Successfully paired to ' + PAIR + ' [guid=ABC123]\n');
    if (args[0] === 'connect') return Buffer.from('connected to ' + args[1] + '\n');
    if (args[0] === 'devices') return Buffer.from(live ? 'List of devices attached\n' + SERIAL + '\tdevice model:Pixel_9\n' : 'List of devices attached\n');
    return Buffer.from('List of discovered mdns services\n');
  }, null, noDelay);
  const paired = await mDnsApi.pairWireless(PAIR, '123456');
  assert.strictEqual(paired.ok, true);
  assert.strictEqual(paired.serial, SERIAL);
  assert.ok(calls.some(a => a[0] === 'pair' && a[1] === PAIR && a[2] === '123456'));
  assert.ok(!calls.some(a => a[0] === 'connect' && a[1] === PAIR), 'the one-shot pairing port is never reconnected');
  // screen.adbPairWireless persists the discovered serial and associates it with the linked phone.
  assert.strictEqual(adb.rememberPaired(paired.serial, paired.model), true);
  assert.strictEqual(adb.pairSerial('phoneA', paired.serial), true);
  assert.deepStrictEqual(adb.pairedList(), [{ serial: SERIAL, name: 'Pixel_9', wireless: true }]);

  // Later launches reconnect the remembered serial itself, even when it is an mDNS service name.
  const reconnects = [];
  await adb.create(async (args) => { reconnects.push(args); return Buffer.from('already connected\n'); }, null, noDelay).autoConnect();
  assert.deepStrictEqual(reconnects, [['connect', SERIAL]]);

  // Explicit connection address: used when mDNS auto-connect is blocked.
  reset();
  const explicitCalls = [];
  const explicit = await adb.create(async (args) => {
    explicitCalls.push(args);
    if (args[0] === 'pair') return Buffer.from('Successfully paired\n');
    if (args[0] === 'connect') return Buffer.from('connected to ' + args[1] + '\n');
    if (args[0] === 'devices') return Buffer.from('List of devices attached\n' + CONNECT + '\tdevice model:Pixel_9\n');
    return Buffer.from('List of discovered mdns services\n');
  }, null, noDelay).pairWireless(PAIR, '123456', CONNECT);
  assert.strictEqual(explicit.ok, true);
  assert.strictEqual(explicit.serial, CONNECT);
  assert.ok(explicitCalls.some(a => a[0] === 'connect' && a[1] === CONNECT));
  assert.ok(!explicitCalls.some(a => a[0] === 'connect' && a[1] === PAIR));

  // No serial found: pairing is reported honestly and the one-shot pairing port is never stored.
  reset();
  const failed = await adb.create(async (args) => {
    if (args[0] === 'pair') return Buffer.from('Successfully paired\n');
    return Buffer.from(args[0] === 'devices' ? 'List of devices attached\n' : 'List of discovered mdns services\n');
  }, null, noDelay).pairWireless(PAIR, '123456');
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.paired, true);
  assert.match(failed.error, /connection port/);
  assert.deepStrictEqual(adb.pairedList(), []);

  // mDNS discovery fallback: ADB reports the connect service when auto-connect is disabled.
  reset();
  let connected = false;
  const mdns = await adb.create(async (args) => {
    if (args[0] === 'pair') return Buffer.from('Successfully paired\n');
    if (args[0] === 'connect') { connected = true; return Buffer.from('connected to ' + args[1] + '\n'); }
    if (args[0] === 'devices') return Buffer.from(connected ? 'List of devices attached\n' + CONNECT + '\tdevice model:Pixel_9\n' : 'List of devices attached\n');
    return Buffer.from('List of discovered mdns services\nPixel_9\tadb-ABC123._adb-tls-connect._tcp\t192.168.1.20\t5555\n');
  }, null, noDelay).pairWireless(PAIR, '123456');
  assert.strictEqual(mdns.ok, true);
  assert.strictEqual(mdns.serial, CONNECT);

  // A wrong pairing code never reaches adb and leaves remembered devices untouched.
  reset();
  adb.rememberPaired(SERIAL, 'Pixel_9');
  const before = adb.pairedList().slice();
  let ran = false;
  const bad = await adb.create(async () => { ran = true; return Buffer.from(''); }, null, noDelay).pairWireless(PAIR, '12');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(ran, false);
  assert.deepStrictEqual(adb.pairedList(), before);

  // A later connect must not wipe the phone's model name; forgetting removes the phone association too.
  assert.strictEqual(adb.rememberPaired(SERIAL, ''), true);
  assert.strictEqual(adb.pairedList()[0].name, 'Pixel_9');
  assert.strictEqual(adb.pairSerial('phoneA', SERIAL), true);
  assert.strictEqual(adb.serialFor('phoneA'), SERIAL);
  assert.strictEqual(adb.forgetPaired(SERIAL), true);
  assert.deepStrictEqual(adb.pairedList(), []);
  assert.strictEqual(adb.serialFor('phoneA'), '');
  assert.strictEqual(adb.forgetPaired('toString'), false);
  assert.strictEqual(adb.pairSerial('__proto__', SERIAL), false);
  assert.strictEqual(typeof adb.serialFor('phoneA'), 'string');

  const js = fs.readFileSync(path.join(__dirname, '..', 'ui', 'js', 'phonescreen.js'), 'utf8');
  assert.ok(js.includes('inv("adb.pairWireless", L.adbAddress.value, L.adbCode.value, L.adbConnectAddress.value)'));
  assert.ok(js.includes('inv("adb.connect", L.adbConnectAddress.value)'));
  assert.ok(js.includes('inv("adb.select", serial)'));
  assert.ok(js.includes('No paired devices yet'));
  const cmds = fs.readFileSync(path.join(__dirname, '..', 'main', 'commands.js'), 'utf8');
  for (const cmd of ['adb.devices', 'adb.connect', 'adb.pairWireless', 'adb.select', 'adb.forget']) {
    assert.ok(cmds.includes('on("' + cmd + '"'), cmd + ' handler is registered');
  }
  console.log('adb pairing ok');
})().catch(e => { console.error(e); process.exitCode = 1; });
