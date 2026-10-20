// Blocks written by the editor save as a real .docx that mammoth reads back with text, headings, lists and bold intact.
const Module = require("module");
const orig = Module._load;
Module._load = function (r, ...a) { return r === "electron" ? { BrowserWindow: class {}, net: {} } : orig.call(this, r, ...a); };
const { fromBlocks } = require("../main/docx");
const mammoth = require("mammoth");
let bad = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " " + extra)); if (!ok) bad++; };
(async () => {
  const buf = await fromBlocks([
    { tag: "h1", runs: [{ t: "Title & <x>" }] },
    { tag: "p", runs: [{ t: "plain " }, { t: "bold", b: true }, { t: " end", i: true }] },
    { tag: "p", list: "ul", runs: [{ t: "item" }] },
  ]);
  check("zip magic", buf[0] === 0x50 && buf[1] === 0x4b);
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  check("heading", /<h1>Title &amp; &lt;x&gt;<\/h1>/.test(value), value);
  check("bold", /<strong>bold<\/strong>/.test(value), value);
  check("list", /<ul><li>item<\/li><\/ul>/.test(value), value);
  process.exit(bad ? 1 : 0);
})();
