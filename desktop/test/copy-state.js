// The AI answer copy button must report success and then reset, and report failure without hiding the button.
const assert = require("assert");
const fs = require("fs"), path = require("path"), vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "ui", "js", "aipanel.js"), "utf8");
const timers = [];
let fail = false;
const fakeEl = () => ({ className: "", textContent: "", title: "", value: "", hidden: false, dataset: {}, style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, children: [], append(...c) { this.children.push(...c); }, add(...c) { this.children.push(...c); }, addEventListener() {}, focus() {}, querySelectorAll: () => [] });
const ctx = {
  window: { lodica: { on() {}, invoke: async () => null } },
  document: { createElement: fakeEl, getElementById: fakeEl, addEventListener() {}, documentElement: fakeEl(), body: fakeEl() },
  navigator: { clipboard: { writeText: async () => { if (fail) throw new Error("no clipboard"); } } },
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout() {},
  applyCustom() {},
  Option: function (text, value) { return { text, value }; },
  console,
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

(async () => {
  const buttonFor = async (shouldFail) => {
    fail = shouldFail;
    const row = ctx.message({ role: "assistant", text: "answer" });
    assert.strictEqual(row.className, "a");
    const button = row.children[1];
    assert.strictEqual(button.className, "msg-copy");
    await button.onclick();
    return button;
  };
  const ok = await buttonFor(false);
  assert.strictEqual(ok.textContent, "Copied");
  timers.pop()();
  assert.strictEqual(ok.textContent, "Copy");
  const bad = await buttonFor(true);
  assert.strictEqual(bad.textContent, "Failed");
  timers.pop()();
  assert.strictEqual(bad.textContent, "Copy");
  console.log("copy state ok");
})().catch((e) => { console.error(e); process.exit(1); });
