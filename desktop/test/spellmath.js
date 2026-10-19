// Pure-logic tests for the helper's math answer and spell suggestions.
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "..", "android", "app", "src", "main", "assets", "extensions", "helper");
const src = fs.readFileSync(path.join(dir, "content.js"), "utf8");
const cut = (n) => src.slice(src.indexOf(`// lodica:${n}:start`), src.indexOf(`// lodica:${n}:end`));
const assert = require("assert");

const calc = new Function(cut("math") + "; return calc;")();
const cases = [
  ["2+2", "4"], ["12 * 3", "36"], ["(1+2)*3", "9"], ["10/4", "2.5"], ["2^10", "1024"], ["2**3", "8"],
  ["50% * 80", "40"], ["3 x 4", "12"], ["6 × 7", "42"], ["20 ÷ 5", "4"], ["sqrt(16)+1", "5"], ["-3 + 5", "2"],
  ["1,5 + 1,5", "3"], ["1,000 + 1", "1001"], ["0.1+0.2", "0.3"], ["2+2 =", "4"], ["7 - 2", "5"], ["2*-3", "-6"],
  ["2^3^2", "512"], ["1/0", null],
  ["42", null], ["2024-01-05", null], ["555-1234", null], ["hello", null], ["1+", null], ["(1+2", null], ["", null],
  ["alert(1)+1", null], ["1+1; 2", null], ["3 4", null],
];
for (const [i, o] of cases) assert.strictEqual(calc(i), o, `calc(${JSON.stringify(i)}) = ${calc(i)}, want ${o}`);

// spell: tiny fake dictionaries
const body = cut("spell").replace("const SPELL_LANGS", "const SPELL_LANGS");
const mk = new Function("browser", "fetchImpl", `
  const fetch = fetchImpl;
  ${body}
  return { setLangs: async (l) => { spell = { on: true, auto: true, langs: l }; await ensureDicts(); }, known, suggest, loadDict };
`);
const files = { en: "the\nhello\nworld\nhouse\nreceive\nwith", nl: "huis\nwereld\nhallo\nmet" };
const api = mk({ runtime: { getURL: (p) => p } }, async (u) => ({ text: async () => files[u.match(/dict\/(\w+)/)[1]] || "" }));
(async () => {
  await api.setLangs(["en", "nl"]);
  assert(api.known("hello") && api.known("Huis") && api.known("hallo"), "cross-language known");
  assert(!api.known("helo") && !api.known("huos"));
  assert.deepStrictEqual(api.suggest("helo", 3), ["hello"]);
  assert.deepStrictEqual(api.suggest("huos", 3)[0], "huis");
  assert.strictEqual(api.suggest("Wrold", 1)[0], "World");
  assert.strictEqual(api.suggest("recieve", 1)[0], "receive");
  assert.strictEqual(api.known("dog's") || api.known("hello's"), true);
  await api.setLangs(["en"]);
  assert(!api.known("huis"), "dutch word unknown when only English is selected");
  console.log("spellmath ok");
})();
