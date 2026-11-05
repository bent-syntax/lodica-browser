// Plain node: the AI agent's action parser and URL guard.
const assert = require("assert");
const { parse, safeUrl, RISKY, decide, MODES, start } = require("../main/aiagent");
assert.deepStrictEqual(parse('Sure {"action":"open","url":"https://a.b"} ok'), { action: "open", url: "https://a.b" });
assert.strictEqual(parse("no json"), null);
assert.strictEqual(parse('{"x":1}'), null);
assert.strictEqual(parse("{bad"), null);
assert.strictEqual(safeUrl("https://example.com/a"), "https://example.com/a");
assert.strictEqual(safeUrl("javascript:alert(1)"), null);
assert.strictEqual(safeUrl("file:///etc/passwd"), null);
assert.strictEqual(safeUrl("nope"), null);
assert.ok(RISKY.test("Buy now"));

// Permission levels: what a click or type may do.
assert.deepStrictEqual(MODES, ["read", "plan", "edit", "auto"]);
for (const m of MODES) for (const a of ["open", "scroll", "back", "tab", "done", "plan"]) assert.strictEqual(decide(m, a, "", false), "allow");
assert.strictEqual(decide("read", "click", "Next", true), "deny");
assert.strictEqual(decide("read", "type", "Search", true), "deny");
assert.strictEqual(decide("plan", "click", "Next", false), "plan");
assert.strictEqual(decide("plan", "type", "Search", false), "plan");
assert.strictEqual(decide("plan", "click", "Next", true), "allow");
assert.strictEqual(decide("plan", "type", "Search", true), "allow");
assert.strictEqual(decide("plan", "click", "Buy now", true), "ask");
assert.strictEqual(decide("edit", "click", "Next", false), "allow");
assert.strictEqual(decide("edit", "click", "Verstuur", false), "ask");
assert.strictEqual(decide("edit", "type", "Search", false), "ask");
assert.strictEqual(decide("auto", "click", "Buy now", false), "allow");
assert.strictEqual(decide("auto", "type", "Search", false), "allow");

// A scripted run with fake tabs, page and AI.
async function run(mode, script, opts = {}) {
  const sent = [], asked = [], clicks = [], pushed = [], systems = [];
  const wc = {
    isDestroyed: () => false, isLoading: () => false, getURL: () => "https://shop.example/page",
    executeJavaScript: async (code) => {
      if (code.includes("const SEL")) return { url: "https://shop.example/page", title: "Shop", els: "0 button Buy now\n1 input Search", text: "hello" };
      if (code.includes("e.click()")) { clicks.push(code); return "ok"; }
      if (code.includes("e.focus()")) { sent.push(code); return "ok"; }
      if (code.includes("getAttribute")) return /\[0\]/.test(code) ? "Buy now" : "";
      if (code.includes("[1]")) return "Search";
      return undefined;
    },
  };
  const tab = { id: 1, title: "Shop", url: "https://shop.example/page" };
  const tabs = { wcOf: () => wc, open: () => [tab], current: () => tab, load() {}, create() {}, back() {}, select() {} };
  let i = 0;
  const ai = { complete: async (_t, system) => { systems.push(system); return JSON.stringify(script[Math.min(i++, script.length - 1)]); } };
  const r = await start("buy a thing", { tabs, ai, mode, push: (p) => pushed.push(p.step), confirm: async (m, d, allow) => { asked.push([m, allow]); return opts.answer !== false; } });
  return { r, sent, asked, clicks, pushed, systems };
}
const done = { action: "done", text: "finished" };
(async () => {
  let o = await run("read", [{ action: "click", id: 0 }, done]);
  assert.strictEqual(o.r.text, "finished");
  assert.strictEqual(o.clicks.length, 0);
  assert.ok(o.pushed[0].startsWith("Level: Read only"));
  assert.ok(o.systems[0].includes("read only"));

  o = await run("plan", [{ action: "click", id: 1 }, { action: "plan", steps: ["search the shop", "open the item"] }, { action: "type", id: 1, text: "shoes" }, done]);
  assert.strictEqual(o.r.text, "finished");
  assert.strictEqual(o.asked.length, 1);
  assert.strictEqual(o.asked[0][1], "Approve plan");
  assert.strictEqual(o.sent.length, 1);

  o = await run("plan", [{ action: "plan", steps: ["buy it"] }, done], { answer: false });
  assert.strictEqual(o.r.error, "Stopped: you declined the plan");

  o = await run("edit", [{ action: "type", id: 1, text: "shoes" }, done], { answer: false });
  assert.strictEqual(o.r.error, "Stopped: you declined typing");
  assert.strictEqual(o.sent.length, 0);

  o = await run("edit", [{ action: "click", id: 0 }, done], { answer: false });
  assert.strictEqual(o.r.error, "Stopped: you declined a click");
  assert.strictEqual(o.clicks.length, 0);

  o = await run("edit", [{ action: "type", id: 1, text: "shoes" }, { action: "click", id: 0 }, done]);
  assert.strictEqual(o.r.text, "finished");
  assert.strictEqual(o.asked.length, 2);
  assert.strictEqual(o.sent.length, 1);
  assert.strictEqual(o.clicks.length, 1);

  o = await run("auto", [{ action: "type", id: 1, text: "shoes" }, { action: "click", id: 0 }, { action: "plan", steps: ["x"] }, done]);
  assert.strictEqual(o.r.text, "finished");
  assert.strictEqual(o.asked.length, 0);
  assert.strictEqual(o.sent.length, 1);
  assert.strictEqual(o.clicks.length, 1);

  o = await run("nonsense", [{ action: "type", id: 1, text: "x" }, done]);
  assert.strictEqual(o.asked.length, 1);
  assert.ok(o.pushed[0].startsWith("Level: Edit"));
  console.log("aiagent ok");
})().catch((e) => { console.error(e); process.exit(1); });
