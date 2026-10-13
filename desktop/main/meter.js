// Per-host counters: blocked requests ("b:"+host) and saved bytes ("s:"+host).
const store = require("./store");

let data = store.load("meter", {});
const persist = () => store.save("meter", () => data);

function add(key, n) { data[key] = (data[key] || 0) + n; persist(); }
function blocked(host) { if (host) add("b:" + host, 1); }
function used(host, bytes) { if (host && bytes > 0) add("s:" + host, bytes); }

function list() {
  const hosts = new Map();
  for (const [k, v] of Object.entries(data)) {
    const host = k.slice(2);
    const e = hosts.get(host) || { host, blocked: 0, saved: 0 };
    if (k.startsWith("b:")) e.blocked += v; else if (k.startsWith("s:")) e.saved += v;
    hosts.set(host, e);
  }
  const rows = [...hosts.values()].sort((a, b) => b.blocked - a.blocked || b.saved - a.saved);
  const total = { blocked: rows.reduce((s, r) => s + r.blocked, 0), saved: rows.reduce((s, r) => s + r.saved, 0) };
  return { total, totals: total, hosts: rows };
}

function reset() { data = {}; persist(); }

module.exports = { blocked, used, list, reset };
