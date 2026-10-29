'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parse, blocked, levelOf, sets } = require('../src/adblock');

test('parses hosts files and plain host lists, skips comments, addresses and junk', () => {
  const s = parse(`# comment
127.0.0.1 localhost
0.0.0.0 ads.example.com # trailing comment
tracker.example.org
Mixed.Case.Example.NET.
10.0.0.1
not a host line extra words
-bad-.
`);
  assert.deepStrictEqual([...s].sort(), ['ads.example.com', 'mixed.case.example.net', 'tracker.example.org']);
});

test('light blocks the ad servers and their subdomains, not other sites', () => {
  assert.ok(blocked('doubleclick.net', 'light'));
  assert.ok(blocked('stats.g.doubleclick.net', 'light'));
  assert.ok(!blocked('example.com', 'light'));
  assert.ok(!blocked('notdoubleclick.net', 'light'));
});

test('standard adds the tracker list and strict the larger one', () => {
  sets.hosts.add('tracker.example.org');
  sets.pro.add('scam.example.net');
  assert.ok(!blocked('tracker.example.org', 'light'));
  assert.ok(blocked('tracker.example.org', 'standard'));
  assert.ok(blocked('a.b.tracker.example.org', 'strict'));
  assert.ok(!blocked('scam.example.net', 'standard'));
  assert.ok(blocked('scam.example.net', 'strict'));
  sets.hosts.delete('tracker.example.org');
  sets.pro.delete('scam.example.net');
});

test('never blocks addresses, bare top levels or empty hosts', () => {
  sets.ads.add('com');
  assert.ok(!blocked('example.com', 'light'));
  sets.ads.delete('com');
  assert.ok(!blocked('127.0.0.1', 'strict'));
  assert.ok(!blocked('::1', 'strict'));
  assert.ok(!blocked('', 'strict'));
  assert.ok(!blocked(undefined, 'strict'));
});

test('an unknown strength counts as standard', () => {
  sets.hosts.add('t.example.org');
  assert.ok(blocked('t.example.org', 'whatever'));
  sets.hosts.delete('t.example.org');
});

test('the proxy user name asks for a strength', () => {
  assert.strictEqual(levelOf('lodica+ads-light'), 'light');
  assert.strictEqual(levelOf('lodica+ads-strict'), 'strict');
  assert.strictEqual(levelOf('lodica'), null);
  assert.strictEqual(levelOf('lodica+ads-extreme'), null);
  assert.strictEqual(levelOf('x+ads-light'), null);
});

test('the proxy login accepts "lodica" and "lodica+ads-<strength>" with the token, nothing else', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { cfg, loadToken } = require('../src/config');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lodica-tok-')), 'token');
  fs.writeFileSync(file, 'a-long-enough-test-token-0123456789');
  cfg.tokenPath = file;
  loadToken();
  const { authOf } = require('../src/proxy');
  const req = (user, pass) => ({ headers: { 'proxy-authorization': 'Basic ' + Buffer.from(user + ':' + pass).toString('base64') } });
  const tok = 'a-long-enough-test-token-0123456789';
  assert.deepStrictEqual(authOf(req('lodica', tok)), { ads: null });
  assert.deepStrictEqual(authOf(req('lodica+ads-strict', tok)), { ads: 'strict' });
  assert.deepStrictEqual(authOf(req('lodica+ads-light', tok)), { ads: 'light' });
  assert.strictEqual(authOf(req('lodica+ads-strict', 'wrong-token-wrong-token')), null);
  assert.strictEqual(authOf(req('evil+ads-strict', tok)), null);
  assert.strictEqual(authOf(req('lodica+ads-extreme', tok)), null);
  assert.strictEqual(authOf({ headers: {} }), null);
});
