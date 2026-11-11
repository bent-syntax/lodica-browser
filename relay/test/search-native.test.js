'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { _native: native, _js: js } = require('../src/search');

const skip = native ? false : 'native addon not built';

test('native wantsFresh matches JS', { skip }, () => {
  for (const q of ['latest news', 'Weather today', 'rust book', 'iphone 2026', 'results', 'nowhere', '']) {
    assert.strictEqual(native.wantsFresh(q), js.wantsFresh(q), q);
  }
});

test('native host matches JS', { skip }, () => {
  for (const u of ['https://www.example.com/a', 'http://sub.example.org:8080/x?y=1', 'not a url', '']) {
    assert.strictEqual(native.host(u), js.host(u), u);
  }
});

test('native freshOrder matches JS freshFirst', { skip }, () => {
  const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const list = [{ d: iso(90) }, { d: iso(2) }, {}, { d: 'garbage' }, { d: iso(10) }, { d: iso(40) }];
  const want = js.freshFirst(list);
  const got = native.freshOrder(list.map((x) => x.d || ''), Date.now()).map((i) => list[i]);
  assert.deepStrictEqual(got, want);
});
