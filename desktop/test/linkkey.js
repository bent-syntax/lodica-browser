"use strict";
// The link key and its two ways to reach a new device. Runs in plain node: the secret store is replaced by a plain object.
const test = require("node:test"), assert = require("node:assert");
const crypto = require("crypto");
const path = require("path");

const storePath = require.resolve("../main/store"), keyPath = require.resolve("../main/linkkey");
function device() {
  const mem = {};
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { loadSecret: (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d), saveSecret: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; } } };
  delete require.cache[keyPath];
  return require(keyPath);
}
const linkKey = crypto.randomBytes(32);   // what both linked devices share

test("code flow: the new device gets the key only with the code", () => {
  const A = device(); A.create();
  const B = device();
  const file = A.makeFile(false);
  assert.ok(!B.hasKey());
  const f = B.readFile(file);
  const session = "s1", code = A.request(session, f.id);
  assert.match(code, /^\d{6}$/);
  const res = A.answer(session, B.proofOf(linkKey, session, code), linkKey);
  assert.ok(res.wrap);
  const w = B.unwrapAnswer(res.wrap, linkKey, session, code);
  assert.ok(B.adopt(f, w));
  const data = { passwords: [{ origin: "https://a.example", user: "u", pass: "p" }] };
  assert.deepStrictEqual(B.openData(A.sealData(data)), data);   // same key on both
});

test("the file alone is useless, and a wrong code does not open the answer", () => {
  const A = device(); A.create();
  const B = device();
  const f = B.readFile(A.makeFile(false));
  assert.strictEqual(f.w, null);
  assert.ok(!B.adopt(f, Buffer.alloc(32, 1).toString("base64")));
  const code = A.request("s", f.id);
  const ok = A.answer("s", B.proofOf(linkKey, "s", code), linkKey);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
  assert.strictEqual(B.unwrapAnswer(ok.wrap, linkKey, "s", wrong), null);
});

test("a wrong code is refused, three tries then dead", () => {
  const A = device(); A.create();
  const f = A.readFile(A.makeFile(false));
  const code = A.request("s", f.id);
  const bad = A.proofOf(linkKey, "s", code === "000000" ? "111111" : "000000");
  for (let i = 0; i < 3; i++) assert.strictEqual(A.answer("s", bad, linkKey).error, "wrong code");
  assert.strictEqual(A.answer("s", A.proofOf(linkKey, "s", code), linkKey).error, "too many tries");
  assert.strictEqual(A.answer("s", A.proofOf(linkKey, "s", code), linkKey).error, "no code");
});

test("the code is valid for 30 seconds", () => {
  const A = device(); A.create();
  const f = A.readFile(A.makeFile(false));
  const t0 = Date.now();
  const code = A.request("s", f.id, t0);
  assert.strictEqual(A.answer("s", A.proofOf(linkKey, "s", code), linkKey, t0 + 31000).error, "expired");
  const code2 = A.request("s2", f.id, t0);
  assert.ok(A.answer("s2", A.proofOf(linkKey, "s2", code2), linkKey, t0 + 29000).wrap);
});

test("one use: the same file cannot be inserted twice", () => {
  const A = device(); A.create();
  const f = A.readFile(A.makeFile(false));
  const code = A.request("s", f.id);
  assert.ok(A.answer("s", A.proofOf(linkKey, "s", code), linkKey).wrap);
  assert.strictEqual(A.request("s2", f.id), null);   // the file key was used up
});

test("a device that made no such file shows no code", () => {
  const A = device(), C = device(); A.create();
  const f = A.readFile(A.makeFile(false));
  assert.strictEqual(C.request("s", f.id), null);
});

test("cable file: carries its own file key and inserts with no code", () => {
  const A = device(); A.create();
  const B = device();
  const f = B.readFile(A.makeFile(true));
  assert.ok(f.w);
  assert.ok(B.adopt(f, f.w));
  assert.deepStrictEqual(B.openData(A.sealData({ x: 1 })), { x: 1 });
});

test("data sealed under another key does not open", () => {
  const A = device(); A.create();
  const sealed = A.sealData({ secret: 1 });
  const B = device(); B.create();
  assert.strictEqual(B.openData(sealed), null);
  assert.strictEqual(device().sealData({ a: 1 }), null);   // no key at all
});

test("bad key files are rejected", () => {
  const A = device();
  assert.strictEqual(A.readFile("not json"), null);
  assert.strictEqual(A.readFile(JSON.stringify({ v: 2, id: "0123456789abcdef", wrapped: "x" })), null);
  assert.strictEqual(A.readFile(JSON.stringify({ v: 1, id: "zz", wrapped: "x" })), null);
});
