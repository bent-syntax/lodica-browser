'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseProduct, SHOPS } = require('../src/shop');

test('parseProduct reads JSON-LD offers', () => {
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Mouse","image":"https://x/i.jpg","aggregateRating":{"ratingValue":"4.5","reviewCount":"12"},"offers":{"@type":"Offer","price":"1.299,95","priceCurrency":"eur","availability":"https://schema.org/InStock"}}</script>';
  const p = parseProduct(html);
  assert.strictEqual(p.name, 'Mouse');
  assert.strictEqual(p.price, 1299.95);
  assert.strictEqual(p.cur, 'EUR');
  assert.strictEqual(p.rating, 4.5);
  assert.strictEqual(p.stock, 1);
});

test('parseProduct falls back to meta tags and flags no price', () => {
  assert.strictEqual(parseProduct('<meta property="product:price:amount" content="19.99"><meta property="product:price:currency" content="USD">').price, 19.99);
  assert.strictEqual(parseProduct('<html></html>').price, undefined);
});

test('every country lists shops', () => {
  for (const [k, v] of Object.entries(SHOPS)) assert.ok(v.length >= 4, k);
});

test('withCat adds the category word once and CATEGORIES is a whitelist', () => {
  const { withCat, CATEGORIES } = require('../src/shop');
  assert.strictEqual(withCat('iphone 15', 'phones'), 'smartphone iphone 15');
  assert.strictEqual(withCat('smartphone x', 'phones'), 'smartphone x');
  assert.strictEqual(withCat('iphone', ''), 'iphone');
  assert.ok(!Object.hasOwn(CATEGORIES, 'constructor'));
});
