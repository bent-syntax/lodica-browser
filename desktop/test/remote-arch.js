'use strict';
// Pure checks for the 1.20.8 remote-control rebuild: ADB parsing/input, OS input, and source wiring. No Electron or devices.
const assert = require('node:assert');
const test = require('node:test');
const path = require('path');
const { readFileSync } = require('fs');

const root = path.join(__dirname, '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const adb = require(path.join(root, 'desktop', 'main', 'adb.js'));
const osinput = require(path.join(root, 'desktop', 'main', 'osinput.js'));

test('ADB device parsing, wireless addresses and input commands are safe and injectable', () => {
  const list = adb.parseDevices('List of devices attached\nemulator-5554\tdevice product:sdk_gphone model:Pixel_7\n192.168.1.20:5555\toffline\n');
  assert.deepStrictEqual(list[0], { serial: 'emulator-5554', model: 'Pixel_7', state: 'device', online: true });
  assert.strictEqual(list[1].online, false);
  assert.strictEqual(adb.cleanAddress('192.168.1.20:5555'), '192.168.1.20:5555');
  assert.strictEqual(adb.cleanAddress('999.1.1.1:5555'), '');
  assert.strictEqual(adb.cleanAddress('192.168.1.20:99999'), '');
  assert.strictEqual(adb.cleanAddress('example.com:5555'), '');
  assert.deepStrictEqual(adb.inputArgs('s1', { t: 'tap', x: 0.5, y: 0.25 }, { width: 1000, height: 2000 }),
    ['-s', 's1', 'shell', 'input', 'tap', 500, 500]);
  assert.strictEqual(adb.inputArgs('s1', { t: 'key', key: 'back' })[5], '4');
  assert.strictEqual(adb.inputArgs('s1', { t: 'key', key: 'invalid key' })[5], '111');
  assert.ok(adb.inputArgs('s1', { t: 'text', text: 'hello world' }).includes('hello%sworld'));
  assert.strictEqual(adb.inputArgs('s1', { t: 'nope' }), null);

  const calls = [];
  const api = adb.create(async (args) => {
    calls.push(args);
    return Buffer.from(args[0] === 'devices' ? 'List of devices attached\nserial1\tdevice model:Phone\n' : 'connected to 192.168.1.20:5555\n');
  });
  return api.devices().then((devices) => {
    assert.strictEqual(devices[0].serial, 'serial1');
    return api.connect('192.168.1.20:5555').then((r) => {
      assert.strictEqual(r.ok, true);
      assert.deepStrictEqual(calls[1], ['connect', '192.168.1.20:5555']);
    });
  });
});

test('OS input builders cover clicks, right click, drag, scroll, keys and text', () => {
  assert.deepStrictEqual(osinput.linuxArgs({ t: 'tap', x: 0.5, y: 0.5 }, 1000, 800),
    ['mousemove', '500', '400', 'click', '1']);
  assert.deepStrictEqual(osinput.linuxArgs({ t: 'right', x: 1, y: 1 }, 1000, 800),
    ['mousemove', '1000', '800', 'click', '3']);
  assert.deepStrictEqual(osinput.linuxArgs({ t: 'scroll', x: 0.5, y: 0.5, steps: -2 }, 1000, 800),
    ['mousemove', '500', '400', 'click', '--repeat', '2', '4']);
  assert.deepStrictEqual(osinput.linuxArgs({ t: 'key', key: 'enter' }, 1000, 800), ['key', '--clearmodifiers', 'Return']);
  assert.ok(osinput.linuxArgs({ t: 'text', text: 'hi' }, 1000, 800).includes('hi'));
  assert.strictEqual(osinput.linuxArgs({ t: 'unknown' }, 1000, 800), null);
  assert.ok(osinput.windowsScript({ t: 'tap', x: 0.5, y: 0.5 }, 1000, 800).includes('SetCursorPos(500,400)'));
  assert.ok(osinput.windowsScript({ t: 'right', x: 0.5, y: 0.5 }, 1000, 800).includes('mouse_event(0x8'));
  assert.ok(osinput.windowsScript({ t: 'key', key: 'home' }, 1000, 800).includes('keybd_event'));
});

test('OS input applies events through an injected runner', async () => {
  const calls = [];
  const api = osinput.create({
    platform: 'linux',
    runner: async (command, args) => { calls.push([command, args]); },
    size: () => ({ width: 100, height: 100 }),
  });
  const n = await api.apply([{ t: 'tap', x: 0.5, y: 0.5 }, { t: 'nope' }]);
  assert.strictEqual(n, 1);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 'xdotool');
});

test('remote-control source wiring uses full OS capture, ADB and device targeting', () => {
  const pc = read('desktop/main/pcscreen.js');
  assert.ok(pc.includes('desktopCapturer.getSources({ types: ["screen"]'));
  assert.ok(pc.includes('"/api/pcscreen?deviceId="'));
  assert.ok(pc.includes('"/api/pcscreen/input?deviceId="'));
  assert.ok(pc.includes('osinput.create()'));
  const phone = read('desktop/main/screen.js');
  assert.ok(phone.includes('api.frame(serial)') && phone.includes('api.input(serial, e, size)'));
  assert.ok(phone.includes('"/api/screen?deviceId="'));
  const registry = read('desktop/main/devices.js');
  assert.ok(registry.includes('POST", "/api/devices"') && registry.includes('GET", "/api/devices"'));
  assert.ok(registry.includes('function target(platform)'));
  const pcr = read('android/app/src/main/java/be/syntaxya/lodica/engine/PcRemote.kt');
  assert.ok(pcr.includes('LinkedDevices.target("desktop")') && pcr.includes('frameSeq.value++'));
  assert.ok(pcr.includes('"/api/pcscreen/request"'));
  const share = read('android/app/src/main/java/be/syntaxya/lodica/engine/ScreenShare.kt');
  assert.ok(share.includes('"/api/screen" + screenPath()'));
  assert.ok(share.includes('"/api/screen/input$q"'));
  const relayApi = read('relay/src/api.js');
  assert.ok(relayApi.includes("p === '/api/devices'"));
});
