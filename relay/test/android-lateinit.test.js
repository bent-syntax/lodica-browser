'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const source = (relative) => fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'java', 'be', 'syntaxya', 'lodica', relative),
  'utf8',
);

test('SilentInstall never reads an uninitialized app context', () => {
  const src = source(path.join('engine', 'SilentInstall.kt'));
  assert.doesNotMatch(src, /lateinit\s+var\s+app\b/);
  assert.match(src, /private\s+var\s+app:\s*Context\?\s*=\s*null/);
  assert.match(src, /fun init\(ctx: Context\) \{[\s\S]*?val base = ctx\.applicationContext \?: ctx[\s\S]*?if \(app == null\) app = base[\s\S]*?if \(started\) return/);
  assert.match(src, /fun refresh\(\) \{[\s\S]*?val context = app \?: return[\s\S]*?installed\(context\)/);
  assert.match(src, /private fun developerOptions\(\): Boolean \{[\s\S]*?val context = app \?: return false/);
});

test('LinkedDevices renders safely before its deferred init', () => {
  const src = source(path.join('engine', 'LinkedDevices.kt'));
  assert.doesNotMatch(src, /lateinit\s+var\s+app\b/);
  assert.doesNotMatch(src, /::app\.isInitialized/);
  assert.match(src, /private val prefs get\(\) = app\?\.getSharedPreferences\(PREF, Context\.MODE_PRIVATE\)/);
  assert.match(src, /private var app: Context\? = null/);
  assert.match(src, /fun init\(ctx: Context\) \{[\s\S]*?val base = ctx\.applicationContext \?: ctx[\s\S]*?if \(app == null\) app = base/);
  assert.match(src, /fun name\(\): String \{[\s\S]*?val context = app \?: return "Phone"/);
  assert.match(src, /fun id\(\): String \{[\s\S]*?val p = prefs \?: return ""/);
  assert.match(src, /fun target\(platform: String\): String \{[\s\S]*?val p = prefs \?: return ""/);
  assert.match(src, /fun setTarget\(platform: String, deviceId: String\) \{[\s\S]*?val p = prefs \?: return/);
  assert.match(src, /fun refresh\(\) \{[\s\S]*?if \(app == null \|\| !Relay\.available\) return/);
});
