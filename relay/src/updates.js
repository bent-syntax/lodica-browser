'use strict';
// Update proxy for the Lodica releases on GitHub.
//
// The releases are public, so no credential is needed. If you point this at a
// private fork, set a read-only fine-grained token (Contents: read) in
// LODICA_GH_TOKEN through a root-owned systemd EnvironmentFile. The token is
// never logged, echoed or forwarded to the client, and is not sent to the
// redirect target when GitHub hands the download off to its object storage.
const { Readable } = require('stream');
const { cfg } = require('./config');

const API = process.env.LODICA_GH_API || 'https://api.github.com';
const OWNER = process.env.LODICA_GH_OWNER || 'bent-syntax';
const REPO = process.env.LODICA_GH_REPO || 'lodica-browser';

// Which release asset each client wants.
const TARGETS = {
  'android': { repo: REPO, asset: /\.apk$/i },
  'desktop-win': { repo: REPO, asset: /^Lodica-Setup-.*\.exe$/i },
  'desktop-linux': { repo: REPO, asset: /\.AppImage$/i },
};

const CACHE_MS = 10e3;
const cache = new Map();       // target -> { at, info }

function err(status, message) { return Object.assign(new Error(message), { status }); }

function token() { return process.env.LODICA_GH_TOKEN || ''; }
const configured = () => true;

function ghHeaders(accept) {
  const h = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'lodica-relay' };
  if (token()) h.Authorization = 'Bearer ' + token();
  return h;
}

function targetOf(url) {
  const app = url.searchParams.get('app');
  const platform = url.searchParams.get('platform');
  const key = app === 'android' ? 'android' : app === 'desktop' && (platform === 'win' || platform === 'linux') ? 'desktop-' + platform : null;
  if (!key) throw err(400, 'bad app/platform');
  return key;
}

// Compare dotted numeric versions; a leading "v" and any suffix after "-" are ignored.
function parseVer(v) {
  return String(v || '').replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
}
function newer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

async function gh(path, accept = 'application/vnd.github+json') {
  let r;
  try {
    r = await fetch(API + path, { headers: ghHeaders(accept), redirect: 'manual', signal: AbortSignal.timeout(cfg.searchTimeoutMs) });
  } catch { throw err(502, 'upstream unreachable'); }
  return r;
}

async function sha256Of(release, asset) {
  if (typeof asset.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(asset.digest)) return asset.digest.slice(7).toLowerCase();
  // Fallback: a "<asset>.sha256" or SHA256SUMS file attached to the release.
  const sums = release.assets.find((a) => a.name === asset.name + '.sha256' || /^SHA256SUMS(\.txt)?$/i.test(a.name));
  if (!sums || sums.size > 64 * 1024) return null;
  const r = await gh(`/repos/${OWNER}/${release.repo}/releases/assets/${sums.id}`, 'application/octet-stream');
  let body;
  if (r.status === 302 && r.headers.get('location')) {
    body = await fetch(r.headers.get('location'), { signal: AbortSignal.timeout(cfg.searchTimeoutMs) });
  } else body = r;
  if (!body.ok) return null;
  const text = await body.text();
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})(?:\s+\*?(.+?))?\s*$/i.exec(line);
    if (m && (!m[2] || m[2] === asset.name)) return m[1].toLowerCase();
  }
  return null;
}

async function latest(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info;
  const t = TARGETS[key];
  const r = await gh(`/repos/${OWNER}/${t.repo}/releases/latest`);
  if (r.status === 404) throw err(404, 'no release published');
  if (r.status === 401 || r.status === 403) throw err(502, 'upstream refused the update token');
  if (!r.ok) throw err(502, 'upstream error ' + r.status);
  const rel = await r.json();
  rel.repo = t.repo;
  const asset = (rel.assets || []).find((a) => t.asset.test(a.name) && a.state === 'uploaded');
  if (!asset) throw err(404, 'release has no matching file');
  const info = {
    version: String(rel.tag_name || '').replace(/^v/i, ''),
    tag: rel.tag_name,
    name: rel.name || rel.tag_name,
    notes: String(rel.body || '').slice(0, 4000),
    published: rel.published_at,
    file: asset.name,
    size: asset.size,
    sha256: await sha256Of(rel, asset),
    assetId: asset.id,
    repo: t.repo,
  };
  cache.set(key, { at: Date.now(), info });
  return info;
}

// -> JSON for the client (no GitHub ids, URLs or tokens).
async function check(url) {
  if (!configured()) throw err(503, 'updates not configured');
  const key = targetOf(url);
  const info = await latest(key);
  const cur = url.searchParams.get('version') || '';
  return {
    version: info.version, name: info.name, notes: info.notes, published: info.published,
    file: info.file, size: info.size, sha256: info.sha256,
    newer: cur ? newer(info.version, cur) : true,
  };
}

// -> { stream, size, name, sha256 }. Streams the asset; the token never leaves this process.
async function download(url) {
  if (!configured()) throw err(503, 'updates not configured');
  const info = await latest(targetOf(url));
  const r = await gh(`/repos/${OWNER}/${info.repo}/releases/assets/${info.assetId}`, 'application/octet-stream');
  let body = r;
  if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
    const loc = new URL(r.headers.get('location'));
    if (loc.protocol !== 'https:' && !process.env.LODICA_GH_API) throw err(502, 'bad upstream redirect');
    try { body = await fetch(loc, { signal: AbortSignal.timeout(10 * 60e3) }); } catch { throw err(502, 'upstream unreachable'); }
  }
  if (!body.ok || !body.body) { cache.delete(targetOf(url)); throw err(502, 'upstream error ' + body.status); }
  return { stream: Readable.fromWeb(body.body), size: info.size, name: info.file, sha256: info.sha256 };
}

module.exports = { check, download, newer, configured, TARGETS };
