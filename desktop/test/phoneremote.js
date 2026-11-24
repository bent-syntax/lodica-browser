'use strict';
// Pure checks for PC -> phone remote control. No Electron, no DOM, no builds: only relay validation, source wiring and pure UI helpers.
const assert = require('node:assert');
const test = require('node:test');
const path = require('path');
const { readFileSync } = require('fs');

const root = path.join(__dirname, '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const screen = require(path.join(root, 'relay', 'src', 'screen.js'));
const ui = require(path.join(root, 'desktop', 'ui', 'js', 'phonescreen.js'));

test('relay accepts text and stop in the screen input stream', () => {
  assert.deepStrictEqual(screen.cleanEvent({ t: 'text', text: 'hello' }), { t: 'text', text: 'hello' });
  assert.strictEqual(screen.cleanEvent({ t: 'text', text: 'x'.repeat(501) }).text.length, 500);
  assert.strictEqual(screen.cleanEvent({ t: 'text', text: 42 }), null);
  assert.strictEqual(screen.cleanEvent({ t: 'text' }), null);
  assert.deepStrictEqual(screen.cleanEvent({ t: 'stop' }), { t: 'stop' });
  assert.strictEqual(screen.cleanEvent({ t: 'stop', extra: 1 }).extra, undefined);
  assert.strictEqual(screen.cleanEvent({ t: 'power' }), null);
});

test('phone screen UI is docked, rotatable and wired to text/stop', () => {
  const js = read('desktop/ui/js/phonescreen.js');
  assert.ok(js.includes('inv("ui.dock", 360)'));
  assert.ok(js.includes('inv("ui.dock", 0)'));
  assert.ok(js.includes('cls: "spage-layer settings-tab nb-dock phone-dock"'));
  assert.ok(js.includes('classList.toggle("phone-full", on)'));
  assert.ok(js.includes('inv("ui.dock", on ? 0 : 360)'));
  assert.ok(js.includes('phonePointer(') && js.includes('phoneContent('));
  assert.ok(js.includes('inv("screen.text", v, L.target)'));
  assert.ok(js.includes('inv("screen.stop", L.target)'));
  assert.ok(js.includes('inv("screen.frame", after, L.target)'));
  assert.ok(js.includes('inv("devices.list", "android")') && js.includes('inv("devices.setTarget", "android", d.id)'));
  assert.ok(js.includes('inv("adb.devices")') && js.includes('inv("adb.pairWireless"') && js.includes('inv("adb.select"'));
  assert.ok(js.includes('key("back"') && js.includes('key("home"') && js.includes('key("recents"'));

  const main = read('desktop/main/screen.js');
  assert.ok(main.includes('async function text(value, target)'));
  assert.ok(main.includes('value.slice(0, 500)'));
  assert.ok(main.includes('api.frame(serial)') && main.includes('"/api/screen?deviceId="'));
  assert.ok(main.includes('adb.serialFor(getTarget())') && main.includes('adb.pairSerial'));

  const css = read('desktop/ui/polish.css') + read('desktop/ui/ui.css');
  const phoneCss = (css.match(/\/\* Phone screen[\s\S]*?body\.keep\.bt\.ov #dock/) || [''])[0];
  assert.ok(phoneCss.includes('.layer.settings-tab.phone-dock'));
  assert.ok(phoneCss.includes('aspect-ratio:9/16'));
  assert.ok(phoneCss.includes('.layer.settings-tab.phone-dock.phone-full .phone-frame-box'));
  assert.ok(phoneCss.includes('min(100vh,calc(100vw * 9 / 16))'));
  assert.ok(phoneCss.includes('rotate(90deg)'));
  assert.ok(phoneCss.includes('var(--raised)') && phoneCss.includes('var(--line)'));
  assert.ok(!/(gradient|box-shadow|text-shadow|filter\s*:)/.test(phoneCss));

  const settings = read('android/app/src/main/java/be/syntaxya/lodica/ui/Settings.kt');
  assert.ok(settings.includes('val url = PcTabs.safeUrl(t.url)'));
  assert.ok(settings.includes('runCatching { TabManager.open(url); Ui.screen = Screen.Browser }'));
  assert.ok(settings.includes('val stray = TabManager.tabs.firstOrNull { it !in before }'));
  assert.ok(settings.includes('"That tab has an invalid address"'));
  const pcTabs = read('android/app/src/main/java/be/syntaxya/lodica/engine/PcTabs.kt');
  assert.ok(pcTabs.includes('fun safeUrl(raw: String?): String') && pcTabs.includes('s.length > 2000'));

  const rc = read('android/app/src/main/java/be/syntaxya/lodica/engine/RemoteControl.kt');
  assert.ok(rc.includes('ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE'));
  assert.ok(rc.includes('ACTION_SET_TEXT'));
  assert.ok(/finally\s*\{\s*node\?\.recycle\(\)/.test(rc));
  assert.ok(rc.includes('FOCUS_INPUT'));
  assert.ok(rc.includes('ScreenShare.capturedWidth') && rc.includes('rotation(this)'));
  const pcr = read('android/app/src/main/java/be/syntaxya/lodica/engine/PcRemote.kt');
  assert.ok(pcr.includes('fun request()') && pcr.includes('"/api/pcscreen/request"'));

  // PC controller is an opaque docked panel, not a transparent overlay above the AI view.
  const pc = read('desktop/ui/js/pcscreen.js');
  assert.ok(pc.includes('cls: "spage-layer settings-tab nb-dock pc-dock"'));
  assert.ok(pc.includes('inv("ai.panel.close")') && pc.includes('inv("ui.dock", 360)'));
  assert.ok(pc.includes('inv("pcscreen.stop")') && pc.includes('inv("ui.dock", 0)'));
  assert.ok(pc.includes('inv("devices.list", "android")') && pc.includes('inv("pcscreen.start", d.id)'));
  assert.ok(!pc.includes('pc-panel-layer'));
  const pcm = read('desktop/main/pcscreen.js');
  assert.ok(pcm.includes('async function checkRequest()'));
  assert.ok(pcm.includes('/api/pcscreen/request'));
  assert.ok(!pcm.includes('setPanelWidth'));
  assert.ok(pcm.includes('types: ["screen"]'));
  assert.ok(pcm.includes('osinput.create()') && pcm.includes('inputApi.apply(events)'));
  const rp = read('relay/src/pcscreen.js');
  assert.ok(rp.includes('function requestPost') && rp.includes('function requestGet') && rp.includes('function requestDelete'));

  const screenUi = read('android/app/src/main/java/be/syntaxya/lodica/ui/PcScreen.kt');
  assert.ok(screenUi.includes('horizontalScroll(rememberScrollState())'));
  assert.ok(screenUi.includes('maxLines = 1, softWrap = false'));
  assert.ok(screenUi.includes('Ask desktop to share'));
  assert.ok(screenUi.includes('➤ Send'));

  const ss = read('android/app/src/main/java/be/syntaxya/lodica/engine/ScreenShare.kt');
  assert.ok(ss.includes('e.optString("t") == "stop"'));
  assert.ok(ss.includes('Handler(Looper.getMainLooper()).post { shutdown() }'));
  assert.ok(ss.includes('RemoteControl.run(e)'));
  assert.ok(ss.includes('capturedWidth = w'));
});

test('pointer fractions invert a 90 degree CSS rotation', () => {
  assert.deepStrictEqual(ui.phonePointer(0.25, 0.75, false), { x: 0.25, y: 0.75 });
  assert.deepStrictEqual(ui.phonePointer(0, 0, true), { x: 0, y: 1 });
  assert.deepStrictEqual(ui.phonePointer(1, 0, true), { x: 0, y: 0 });
  assert.deepStrictEqual(ui.phonePointer(1, 1, true), { x: 1, y: 0 });
  assert.deepStrictEqual(ui.phonePointer(0, 1, true), { x: 1, y: 1 });
  const out = ui.phonePointer(-2, 4, false);
  assert.strictEqual(out.x, 0); assert.strictEqual(out.y, 1);
});

test('pointer fractions use the contained picture, not its letterboxed box', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
  const normal = ui.phoneContent({ left: 0, top: 0, width: 200, height: 200 }, 720, 1280, false);
  near(normal.left, 43.75); near(normal.top, 0); near(normal.width, 112.5); near(normal.height, 200);
  const rotated = ui.phoneContent({ left: 50, top: 100, width: 320, height: 180 }, 720, 1280, true);
  near(rotated.left, 50); near(rotated.top, 100); near(rotated.width, 320); near(rotated.height, 180);
  assert.strictEqual(ui.phoneContent({ left: 0, top: 0, width: 0, height: 0 }, 720, 1280, false), null);
});
