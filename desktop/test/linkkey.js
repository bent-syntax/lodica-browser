"use strict";
// The link key and how it reaches a new device (ECDH). Runs in plain node: the secret store is replaced by a plain object.
const test = require("node:test"), assert = require("node:assert");

const storePath = require.resolve("../main/store"), keyPath = require.resolve("../main/linkkey");
function device() {
  const mem = {};
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { loadSecret: (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d), saveSecret: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; } } };
  delete require.cache[keyPath];
  return require(keyPath);
}

test("confirmed exchange: both devices end up with the same key", () => {
  const A = device(), B = device();
  const pair = B.newPair();
  const w = A.wrapFor(pair.pub);
  assert.ok(A.hasKey() && !B.hasKey());
  assert.ok(B.adoptWrapped(pair.priv, w.pub, w.wrap));
  const data = { passwords: [{ origin: "https://a.example", user: "u", pass: "p" }] };
  assert.deepStrictEqual(B.openData(A.sealData(data)), data);
  assert.strictEqual(A.fingerprint(pair.pub, w.pub), B.fingerprint(pair.pub, w.pub));
});

test("another device cannot open the wrapped key", () => {
  const A = device(), B = device(), E = device();
  const pair = B.newPair(), other = E.newPair();
  const w = A.wrapFor(pair.pub);
  assert.ok(!E.adoptWrapped(other.priv, w.pub, w.wrap));
  assert.ok(!E.hasKey());
});

test("a device with no key seals and opens nothing", () => {
  const A = device();
  assert.strictEqual(A.sealData({ a: 1 }), null);
  assert.strictEqual(A.openData("AAAA"), null);
});

test("forget removes the key", () => {
  const A = device(); A.create(); assert.ok(A.hasKey());
  A.forget(); assert.ok(!A.hasKey());
});
