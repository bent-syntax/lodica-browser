// Facts the assistant remembers about the user, stored encrypted.
const store = require("./store");

const MAX_FACT = 200, MAX_TOTAL = 4000, PROMPT_BUDGET = 400;
let facts = null; // oldest first; loaded lazily (safeStorage needs app ready)
function ensure() {
  if (!facts) { facts = store.loadSecret("memory", []); if (!Array.isArray(facts)) facts = []; }
  return facts;
}

function trim() {
  facts = facts.map(f => String(f).trim().slice(0, MAX_FACT)).filter(Boolean);
  while (facts.join("\n").length > MAX_TOTAL) facts.shift();
  store.saveSecret("memory", facts);
}

function get() { return ensure().slice(); }

function set(text) {
  facts = String(text || "").split("\n");
  trim();
  return get();
}

function add(fact) {
  const f = String(fact || "").trim();
  if (!f || ensure().includes(f)) return;
  facts.push(f);
  trim();
}

/** Newest facts that fit the prompt budget, oldest of them first. */
function block() {
  ensure();
  const out = [];
  let len = 0;
  for (let i = facts.length - 1; i >= 0; i--) {
    if (len + facts[i].length + 3 > PROMPT_BUDGET) break;
    out.unshift(facts[i]);
    len += facts[i].length + 3;
  }
  return out.length ? "Known about the user:\n" + out.map(f => "- " + f).join("\n") + "\n" : "";
}

module.exports = { get, set, add, block };
