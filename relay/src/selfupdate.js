'use strict';
// Relay self-update. The relay cannot write /opt or restart itself (hardened unit), so it only reports
// versions and drops a request file; a root systemd path unit runs lodica-relay-update, which pulls the
// newest official v* tag and restarts. Nothing from the request reaches that script.
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');
const updates = require('./updates');

const REQUEST = () => path.join(cfg.dataDir, 'update.request');
const REQUEST_TTL_MS = 120e3;

function current() {
  try { return String(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'package.json'), 'utf8')).version); }
  catch { return ''; }
}

// The request is just a timestamp. A helper that never consumed it must not leave "pending" stuck forever.
function readRequest() {
  let raw;
  try { raw = fs.readFileSync(REQUEST(), 'utf8').trim(); }
  catch (e) {
    if (e.code === 'ENOENT') return { pending: false, expired: false, at: 0 };
    return { pending: false, expired: true, at: 0, unreadable: true };
  }
  const at = Number(raw);
  if (!Number.isFinite(at) || at <= 0) return { pending: false, expired: true, at: 0 };
  if (Date.now() - at >= REQUEST_TTL_MS) return { pending: false, expired: true, at };
  return { pending: true, expired: false, at };
}

function clearRequest() {
  try { fs.unlinkSync(REQUEST()); return true; }
  catch (e) { return e.code === 'ENOENT'; }
}

async function status() {
  const cur = current();
  const info = await updates.latest('android', true);
  const req = readRequest();
  if (req.expired) clearRequest();
  const latest = info && info.version ? info.version : '';
  const newer = updates.newer(latest, cur);

  let state = 'current', message = 'Server is up to date';
  if (!latest) { state = 'failed'; message = 'Could not read the latest server release'; }
  else if (req.unreadable) { state = 'failed'; message = 'Could not read the update request state'; }
  else if (req.expired) { state = 'expired'; message = 'The previous update request timed out. You can try again'; }
  else if (req.pending) { state = 'pending'; message = 'Server update in progress'; }
  else if (newer) { state = 'available'; message = 'Server update available'; }

  return {
    current: cur,
    latest,
    newer,
    pending: req.pending,
    state,
    message,
    ...(req.at ? { requestedAt: req.at } : {}),
  };
}

// -> status; throws {status} when there is nothing to update or one is already queued.
async function request() {
  const s = await status();
  if (!s.newer) throw Object.assign(new Error('already up to date'), { status: 409 });
  if (s.pending) throw Object.assign(new Error('update already requested'), { status: 409 });
  try {
    fs.writeFileSync(REQUEST(), String(Date.now()), { flag: 'wx', mode: 0o640 });
  } catch (e) {
    if (e.code === 'EEXIST') throw Object.assign(new Error('update already requested'), { status: 409 });
    throw e;
  }
  return { ...s, pending: true, state: 'pending', message: 'Server update requested' };
}

module.exports = { current, status, request };
