'use strict';
// Static configuration plus token handling. The token is never logged or echoed.
const fs = require('fs');
const crypto = require('crypto');

const env = process.env;
const cfg = {
  proxyHost: env.LODICA_PROXY_HOST || '::',
  proxyPort: Number(env.LODICA_PROXY_PORT || 44742),
  // Public HTTPS API (same cert as the proxy). Ports 44741/44742 are unassigned and not used by
  // common services, so the relay can sit next to a web server on 80/443 without touching it.
  apiHost: env.LODICA_API_HOST || '::',
  apiPort: Number(env.LODICA_API_PORT || 44741),
  // Optional plain-HTTP loopback listener for use behind your own reverse proxy (0 = off).
  apiLocalPort: Number(env.LODICA_API_LOCAL_PORT || 0),
  // Optional port-443 front door (0 = off): SNI routing to the API, the proxy or the web server.
  edgePort: Number(env.LODICA_EDGE_PORT || 0),
  edgeFallbackPort: Number(env.LODICA_EDGE_FALLBACK_PORT || 8443),
  edgeApiHost: (env.LODICA_EDGE_API_HOST || '').toLowerCase(),
  edgeTunnelHost: (env.LODICA_EDGE_TUNNEL_HOST || '').toLowerCase(),
  tokenPath: env.LODICA_TOKEN_PATH || '/etc/lodica-relay/token',
  tlsCert: env.LODICA_TLS_CERT || '/etc/lodica-relay/tls/tunnel.crt',
  tlsKey: env.LODICA_TLS_KEY || '/etc/lodica-relay/tls/tunnel.key',
  // API may use its own cert (lodica.<domain>); defaults to the proxy cert
  apiTlsCert: env.LODICA_API_TLS_CERT || env.LODICA_TLS_CERT || '/etc/lodica-relay/tls/tunnel.crt',
  apiTlsKey: env.LODICA_API_TLS_KEY || env.LODICA_TLS_KEY || '/etc/lodica-relay/tls/tunnel.key',
  dataDir: env.LODICA_DATA_DIR || '/var/lib/lodica-relay',
  mailDomain: env.LODICA_MAIL_DOMAIN || '',
  aliasRe: /^[a-z0-9][a-z0-9.-]{0,63}$/,
  tabIdRe: /^[A-Za-z0-9_-]{22,43}$/,
  mailTtlMs: 7 * 24 * 3600e3,
  tabTtlMs: 30 * 24 * 3600e3,
  tabMaxBytes: 512 * 1024,
  tabMinBytes: 12 + 16 + 1,           // iv + GCM tag + >=1 byte ciphertext
  mailMaxPerAlias: 500,
  mailListMax: 100,
  proxyIdleMs: 5 * 60e3,
  proxyConnectMs: 10e3,
  proxyHandshakeMs: 15e3,
  proxyHeadersMs: 20e3,
  certCheckMs: 3600e3,
  certForceReloadMs: 12 * 3600e3,
  sweepMs: 3600e3,
  // Lodica Search: SearXNG JSON API (loopback only) and the WebP image proxy.
  searxUrl: env.LODICA_SEARX_URL || 'http://127.0.0.1:8888',
  searchTimeoutMs: 12e3,
  imgTtlMs: 5 * 24 * 3600e3,
  imgMaxBytes: 5 * 1024 * 1024,
  imgTimeoutMs: 10e3,
  imgWidths: new Set([160, 320, 640, 1080]),
  imgJobs: 4,
  statsMs: 3600e3,
  // Proxy ports refused outright (SMTP abuse prevention).
  blockedPorts: new Set([0, 25]),
};

let tokenDigest = null;
function loadToken() {
  const t = fs.readFileSync(cfg.tokenPath, 'utf8').trim();
  if (t.length < 16) throw new Error('token file too short');
  tokenDigest = crypto.createHash('sha256').update(t, 'utf8').digest();
}
// Constant-time comparison: hash both sides to fixed length, then timingSafeEqual.
function tokenOk(candidate) {
  if (!tokenDigest || typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 4096) return false;
  const d = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  return crypto.timingSafeEqual(d, tokenDigest);
}

// Simple per-IP auth-failure limiter (brute-force damping).
const fails = new Map();
const FAIL_WINDOW = 15 * 60e3, FAIL_MAX = 20;
// Connections relayed by the edge (see edge.js) all come from loopback, so the real client is
// unknown there; the token is 256-bit random, so skip the limiter rather than lock everyone out.
const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
function limited(ip) {
  if (isLoopback(ip)) return false;
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.start > FAIL_WINDOW) { fails.delete(ip); return false; }
  return f.n >= FAIL_MAX;
}
function noteFail(ip) {
  if (isLoopback(ip)) return;
  const now = Date.now();
  const f = fails.get(ip);
  if (!f || now - f.start > FAIL_WINDOW) fails.set(ip, { start: now, n: 1 });
  else f.n++;
  if (fails.size > 10000) fails.clear();
}

module.exports = { cfg, loadToken, tokenOk, limited, noteFail };
