// Chat outbox: messages queue while the server is down and go out in order when it is back.
const assert = require("assert");
const Module = require("module");
const disk = {};
let up = false, status = 200;
const sent = [];
const stubs = {
  "./relay": { available: true, request: async (m, p, t, body) => { if (!up) throw new Error("down"); if (status !== 200) return [status, ""]; sent.push(body.text); return [200, "{}"]; } },
  "./store": { load: (k, d) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : d), save: (k, g) => { disk[k] = JSON.parse(JSON.stringify(g())); } },
};
const orig = Module._load;
Module._load = function (req, ...a) { return stubs[req] || orig.call(this, req, ...a); };
const room = require("../main/room");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  assert.strictEqual(await room.send("one"), null);
  assert.strictEqual(await room.send("two"), null);
  assert.deepStrictEqual(room.state.pending, ["one", "two"]);
  assert.deepStrictEqual(disk.roomOutbox.map(m => m.text), ["one", "two"]);
  assert.strictEqual(sent.length, 0);
  up = true;
  await sleep(5600);
  assert.deepStrictEqual(sent, ["one", "two"]);
  assert.deepStrictEqual(room.state.pending, []);
  assert.deepStrictEqual(disk.roomOutbox, []);
  assert.strictEqual(await room.send("three"), null);
  assert.deepStrictEqual(sent, ["one", "two", "three"]);
  status = 400;
  assert.ok(/not valid/.test(await room.send("bad")));
  assert.deepStrictEqual(room.state.pending, []);
  status = 503;
  assert.strictEqual(await room.send("later"), null);
  assert.deepStrictEqual(room.state.pending, ["later"]);
  console.log("outbox ok");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
