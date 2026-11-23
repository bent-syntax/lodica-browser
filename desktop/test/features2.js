// Plain checks for the cross-platform feature batch: QR input, AI bubble parsing, PC input validation and UI syntax.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const qr = require("../main/qr");
const bubble = require("../main/bubble");
const pcscreen = require("../../relay/src/pcscreen");

assert.strictEqual(qr.normalise("  https://example.com/a  "), "https://example.com/a");
assert.strictEqual(qr.normalise(""), null);
assert.strictEqual(qr.normalise("x".repeat(2001)), null);
assert.strictEqual(qr.normalise(null), null);

let b = bubble.parseJs("Here you go: {\"color\":\"#12abCD\",\"shape\":\"leaf\"}");
assert.deepStrictEqual(b, { color: "#12ABCD", shape: "Leaf", radius: "20px 4px 20px 4px" });
assert.strictEqual(bubble.parseJs("{\"color\":\"red\",\"shape\":\"Round\"}"), null);
assert.strictEqual(bubble.parseJs("{\"color\":\"#123456\",\"shape\":\"Oval\"}"), null);
assert.strictEqual(bubble.parseJs("ignore <script>alert(1)</script>"), null);

assert.deepStrictEqual(pcscreen.cleanEvent({ t: "tap", x: 0.5, y: 0.4 }), { t: "tap", x: 0.5, y: 0.4, ms: 50 });
assert.strictEqual(pcscreen.cleanEvent({ t: "tap", x: 1.2, y: 0 }), null);
assert.deepStrictEqual(pcscreen.cleanEvent({ t: "key", key: "enter" }), { t: "key", key: "enter" });
assert.strictEqual(pcscreen.cleanEvent({ t: "key", key: "sudo" }), null);
assert.strictEqual(pcscreen.cleanEvent({ t: "text", text: "hello" }).text, "hello");

for (const f of ["qr.js", "pcscreen.js", "settings.js", "settings4.js", "switcher.js", "room.js", "aipanel.js", "menu.js"]) {
  const file = path.join(__dirname, "..", "ui", "js", f);
  new Function(fs.readFileSync(file, "utf8")); // compile only: catches syntax errors without a display
}

// QR hover wiring stays local and uses text nodes, never innerHTML.
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const qrUi = read("ui/js/qr.js");
assert.ok(qrUi.includes("function showQrDecoded"));
assert.ok(qrUi.includes('inv("qr.decode", img.src)'));
assert.ok(!/showQrDecoded[\s\S]*?innerHTML/.test(qrUi));
assert.ok(read("ui/js/main.js").includes('on("qrDecoded", showQrDecoded)'));
assert.ok(read("ui/ui.css").includes(".hoverqr.qr-decoded"));
assert.ok(read("scripts/build-preload.js").includes('overlay("qrhover.js")'));
assert.ok(read("main/totp.js").includes('require("./qrdecode")'));
assert.ok(read("IPC.md").includes("qr.decode(dataUrl)"));
console.log("feature batch ok");
