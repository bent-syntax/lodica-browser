'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { brand, codesIn } = require('../src/coupons');

test('shop name from host', () => {
  assert.strictEqual(brand('www.zalando.be'), 'zalando');
  assert.strictEqual(brand('shop.asos.co.uk'), 'asos');
  assert.strictEqual(brand('bol.com'), 'bol');
});

test('codes only next to a coupon word, no plain words', () => {
  const c = codesIn('Zalando kortingscode: gebruik WELCOME10 voor 10% korting. FREE SHIPPING on all orders. Promo code SAVE-20NOW today');
  assert.deepStrictEqual([...c].sort(), ['SAVE-20NOW', 'WELCOME10']);
  assert.deepStrictEqual([...codesIn('Our ABCD12 store opens in 2026')], []);
});
