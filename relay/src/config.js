'use strict';
// Static configuration plus token handling. The token is never logged or echoed.
const fs = require('fs');
const crypto = require('crypto');

const env = process.env;
const cfg = {
  proxyHost: env.LODICA_PROXY_HOST || '::',
  proxyPort: Number(env.LODICA_PROXY_PORT || 3443),
  apiHost: env.LODICA_API_HOST || '127.0.0.1',
  apiPort: Number(env.LODICA_API_PORT || 3400),
  tokenPath: env.LODICA_TOKEN_PATH || '/etc/lodica-relay/token',
  tlsCert: env.LODICA_TLS_CERT || '/etc/lodica-relay/tls/tunnel.crt',
  tlsKey: env.LODICA_TLS_KEY || '/etc/lodica-relay/tls/tunnel.key',
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
function limited(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.start > FAIL_WINDOW) { fails.delete(ip); return false; }
  return f.n >= FAIL_MAX;
}
function noteFail(ip) {
  const now = Date.now();
  const f = fails.get(ip);
  if (!f || now - f.start > FAIL_WINDOW) fails.set(ip, { start: now, n: 1 });
  else f.n++;
  if (fails.size > 10000) fails.clear();
}

module.exports = { cfg, loadToken, tokenOk, limited, noteFail };
