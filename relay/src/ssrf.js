'use strict';
// SSRF guard: resolve a target and refuse any non-public address or one of this host's own IPs.
const net = require('net');
const dns = require('dns');
const os = require('os');

function v4ToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// IPv6 text -> BigInt (handles '::' compression and embedded dotted IPv4). Returns null if invalid.
function v6ToBig(ip) {
  if (ip.includes('%')) return null; // zone ids never allowed
  let s = ip.toLowerCase();
  const tail = [];
  const lastColon = s.lastIndexOf(':');
  if (lastColon >= 0 && s.slice(lastColon + 1).includes('.')) {
    const v4 = v4ToInt(s.slice(lastColon + 1));
    if (v4 === null) return null;
    tail.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
    s = s.slice(0, lastColon + 1);           // keep trailing ':' (or '::')
    if (!s.endsWith('::')) s = s.slice(0, -1); // 'a:b:' -> 'a:b'
  }
  const want = 8 - tail.length;
  let groups;
  if (s.includes('::')) {
    const [a, b] = s.split('::');
    if (s.indexOf('::') !== s.lastIndexOf('::')) return null;
    const ga = a ? a.split(':') : [];
    const gb = b ? b.split(':') : [];
    const fill = want - ga.length - gb.length;
    if (fill < 1) return null;
    groups = [...ga, ...Array(fill).fill('0'), ...gb];
  } else {
    groups = s ? s.split(':') : [];
  }
  if (groups.length !== want) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  for (const t of tail) n = (n << 16n) | BigInt(t);
  return n;
}

const V4_DENY = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
  '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
].map((c) => { const [a, l] = c.split('/'); const len = Number(l); return { base: v4ToInt(a) >>> 0, len }; });

function v4InList(n) {
  for (const { base, len } of V4_DENY) {
    const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    if (((n & mask) >>> 0) === ((base & mask) >>> 0)) return true;
  }
  return false;
}

function v6Prefix(cidr) { const [a, l] = cidr.split('/'); return { base: v6ToBig(a), len: BigInt(l) }; }
function inV6(n, p) { const sh = 128n - p.len; return (n >> sh) === (p.base >> sh); }
const V6_GLOBAL = v6Prefix('2000::/3');
const V6_MAPPED = v6Prefix('::ffff:0:0/96');
const V6_NAT64 = v6Prefix('64:ff9b::/96');
const V6_6TO4 = v6Prefix('2002::/16');
// Inside 2000::/3 but not usable public destinations.
const V6_DENY = ['2001::/23', '2001:db8::/32', '3fff::/20'].map(v6Prefix);

let ownV4 = new Set();
let ownV6 = new Set();
function refreshOwnIps() {
  const v4 = new Set(), v6 = new Set();
  let ifs;
  try { ifs = os.networkInterfaces(); } catch { return; }   // keep previous set on failure
  for (const list of Object.values(ifs)) {
    for (const a of list || []) {
      if (a.family === 'IPv4' || a.family === 4) { const n = v4ToInt(a.address); if (n !== null) v4.add(n >>> 0); }
      else { const n = v6ToBig(a.address.split('%')[0]); if (n !== null) v6.add(n); }
    }
  }
  for (const extra of (process.env.LODICA_EXTRA_OWN_IPS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (net.isIPv4(extra)) v4.add(v4ToInt(extra) >>> 0); else { const n = v6ToBig(extra); if (n !== null) v6.add(n); }
  }
  ownV4 = v4; ownV6 = v6;
}
refreshOwnIps();
setInterval(refreshOwnIps, 10 * 60e3).unref();

function v4Forbidden(n) { return v4InList(n >>> 0) || ownV4.has(n >>> 0); }

// true = must not connect
function isForbidden(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) { const n = v4ToInt(ip); return n === null || v4Forbidden(n); }
  if (fam !== 6) return true;
  const n = v6ToBig(ip);
  if (n === null) return true;
  if (inV6(n, V6_MAPPED) || inV6(n, V6_NAT64)) return v4Forbidden(Number(n & 0xffffffffn));
  if (inV6(n, V6_6TO4)) return v4Forbidden(Number((n >> 80n) & 0xffffffffn));
  if (!inV6(n, V6_GLOBAL)) return true;
  for (const p of V6_DENY) if (inV6(n, p)) return true;
  return ownV6.has(n);
}

function validHost(h) {
  if (!h || h.length > 253) return false;
  if (net.isIP(h)) return true;
  return /^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)(\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*\.?$/i.test(h);
}

class GuardError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// Resolve host -> list of validated addresses. Throws GuardError('forbidden'|'dns'|'badhost').
async function resolveSafe(host) {
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!validHost(host)) throw new GuardError('badhost', 'invalid host');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else {
    try {
      addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
    } catch (e) {
      throw new GuardError('dns', 'resolve failed');
    }
  }
  if (!addrs.length) throw new GuardError('dns', 'no addresses');
  // Refuse if ANY address is forbidden (defeats mixed public/private answers).
  for (const a of addrs) if (isForbidden(a.address)) throw new GuardError('forbidden', 'destination not allowed');
  // Prefer IPv4 first, then IPv6 (VPS v6 egress is fine too, but v4 is the most reliable).
  return addrs.sort((x, y) => x.family - y.family).map((a) => a.address).slice(0, 4);
}

module.exports = { isForbidden, resolveSafe, GuardError, v6ToBig, v4ToInt, refreshOwnIps };
