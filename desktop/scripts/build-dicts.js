// Dev tool: expands Hunspell dictionaries (npm dictionary-xx packages) into plain, sorted,
// lowercase word lists for the autocorrect feature. Usage: node build-dicts.js <dir-with-dictionary-packages> <out-dir>
// Not shipped; the generated lists live in android/app/src/main/assets/extensions/helper/dict/.
const fs = require("fs");
const path = require("path");

const [src, out, freq] = process.argv.slice(2);
if (!src || !out || !freq) { console.error("usage: build-dicts.js <src> <out> <freq-dir>"); process.exit(1); }
const CAP = 60000, EXTRA_MAX = 150000;

function parseAff(text) {
  const aff = { flag: "char", pfx: new Map(), sfx: new Map(), skip: new Set() };
  const lines = text.split(/\r?\n/);
  const opts = { NEEDAFFIX: "n", ONLYINCOMPOUND: "o", FORBIDDENWORD: "f", CIRCUMFIX: "c" };
  let cur = null;
  const flagsOf = (s) => splitFlags(s || "", aff.flag);
  for (const raw of lines) {
    const l = raw.replace(/#.*$/, "").trim();
    if (!l) continue;
    const p = l.split(/\s+/);
    if (p[0] === "FLAG") aff.flag = p[1] === "long" ? "long" : p[1] === "num" ? "num" : "char";
    else if (opts[p[0]]) for (const f of flagsOf(p[1])) aff.skip.add(f);
    else if (p[0] === "NEEDAFFIX" || p[0] === "PSEUDOROOT") for (const f of flagsOf(p[1])) aff.skip.add(f);
    else if (p[0] === "PFX" || p[0] === "SFX") {
      const map = p[0] === "PFX" ? aff.pfx : aff.sfx;
      if (p.length === 4 && (p[2] === "Y" || p[2] === "N")) {
        const f = flagsOf(p[1])[0];
        cur = { cross: p[2] === "Y", rules: [] };
        map.set(f, cur);
      } else if (cur) {
        const [flag, strip, add, cond] = [p[1], p[2], p[3], p[4] || "."];
        const slash = add.indexOf("/");
        const addS = slash < 0 ? add : add.slice(0, slash);
        const cont = slash < 0 ? [] : flagsOf(add.slice(slash + 1));
        let re;
        try { re = new RegExp(p[0] === "PFX" ? "^" + cond : cond + "$", "u"); } catch { continue; }
        map.get(flagsOf(flag)[0])?.rules.push({
          strip: strip === "0" ? "" : strip, add: addS === "0" ? "" : addS, re, cont,
        });
      }
    }
  }
  return aff;
}

function splitFlags(s, mode) {
  if (!s) return [];
  if (mode === "long") return s.match(/../gu) || [];
  if (mode === "num") return s.split(",");
  return [...s];
}

function apply(word, flags, aff, depth, outSet) {
  const sfxs = [], pfxs = [];
  for (const f of flags) {
    if (aff.sfx.has(f)) sfxs.push(aff.sfx.get(f));
    if (aff.pfx.has(f)) pfxs.push(aff.pfx.get(f));
  }
  const made = [];
  for (const g of sfxs) {
    for (const r of g.rules) {
      if (!r.re.test(word)) continue;
      if (r.strip && !word.endsWith(r.strip)) continue;
      const w = word.slice(0, word.length - r.strip.length) + r.add;
      made.push({ w, cross: g.cross });
      outSet.add(w);
      if (depth > 0 && r.cont.length) apply(w, r.cont, aff, depth - 1, outSet);
    }
  }
  for (const g of pfxs) {
    for (const r of g.rules) {
      if (!r.re.test(word)) continue;
      if (r.strip && !word.startsWith(r.strip)) continue;
      const pre = r.add + word.slice(r.strip.length);
      outSet.add(pre);
      if (g.cross) for (const m of made) if (m.cross && r.re.test(word)) outSet.add(r.add + m.w.slice(r.strip.length));
    }
  }
}

fs.mkdirSync(out, { recursive: true });
for (const dir of fs.readdirSync(src)) {
  const m = /^dictionary-(.+?)-[\d.]+$/.exec(dir);
  if (!m) continue;
  const base = path.join(src, dir, "package");
  if (!fs.existsSync(path.join(base, "index.dic"))) continue;
  const aff = parseAff(fs.readFileSync(path.join(base, "index.aff"), "utf8"));
  const dic = fs.readFileSync(path.join(base, "index.dic"), "utf8").split(/\r?\n/);
  const words = new Set();
  for (let i = 1; i < dic.length; i++) {
    const line = dic[i].trim();
    if (!line || line.startsWith("#")) continue;
    const sp = line.search(/\s/);
    const entry = sp < 0 ? line : line.slice(0, sp);
    const slash = entry.search(/(?<!\\)\//);
    const stem = (slash < 0 ? entry : entry.slice(0, slash)).replace(/\\\//g, "/");
    const flags = slash < 0 ? [] : splitFlags(entry.slice(slash + 1), aff.flag);
    if (flags.some(f => aff.skip.has(f) && !aff.sfx.has(f) && !aff.pfx.has(f))) {
      if (flags.some(f => aff.skip.has(f))) continue;
    }
    const set = new Set([stem]);
    apply(stem, flags, aff, 1, set);
    for (const w of set) words.add(w.toLowerCase());
  }
  const clean = (w) => w.replace(/’/g, "'");
  const ok = (w) => w.length >= 2 && w.length <= 24 && /^[\p{L}'-]+$/u.test(w);
  const ranked = [];
  const seen = new Set();
  const ff = path.join(freq, m[1] + ".txt");
  if (fs.existsSync(ff)) {
    for (const line of fs.readFileSync(ff, "utf8").split(/\r?\n/)) {
      const w = clean(line.split(" ")[0]);
      if (!ok(w) || seen.has(w) || !words.has(w)) continue;
      seen.add(w); ranked.push(w);
      if (ranked.length >= CAP) break;
    }
  }
  // Small dictionaries (English) keep their rarer words too, after the frequent ones.
  if (words.size <= EXTRA_MAX) for (const w of [...words].map(clean).sort()) if (ok(w) && !seen.has(w)) { seen.add(w); ranked.push(w); }
  fs.writeFileSync(path.join(out, m[1] + ".txt"), ranked.join("\n"));
  console.log(m[1], ranked.length);
}
