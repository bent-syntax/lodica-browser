// Plain node: the AI agent's action parser and URL guard.
const assert = require("assert");
const { parse, safeUrl, RISKY } = require("../main/aiagent");
assert.deepStrictEqual(parse('Sure {"action":"open","url":"https://a.b"} ok'), { action: "open", url: "https://a.b" });
assert.strictEqual(parse("no json"), null);
assert.strictEqual(parse('{"x":1}'), null);
assert.strictEqual(parse("{bad"), null);
assert.strictEqual(safeUrl("https://example.com/a"), "https://example.com/a");
assert.strictEqual(safeUrl("javascript:alert(1)"), null);
assert.strictEqual(safeUrl("file:///etc/passwd"), null);
assert.strictEqual(safeUrl("nope"), null);
assert.ok(RISKY.test("Buy now"));
console.log("aiagent ok");
