'use strict';
// Relay self-update. The relay cannot write /opt or restart itself (hardened unit), so it only reports
// versions and drops a request file; a root systemd path unit runs lodica-relay-update, which pulls the
// newest official v* tag and restarts. Nothing from the request reaches that script.
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');
const updates = require('./updates');

const REQUEST = () => path.join(cfg.dataDir, 'update.request');

function current() {
  try { return String(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'package.json'), 'utf8')).version); }
  catch { return ''; }
}

async function status() {
  const cur = current();
  const info = await updates.latest('android');
  return { current: cur, latest: info.version, newer: updates.newer(info.version, cur), pending: fs.existsSync(REQUEST()) };
}

// -> status; throws {status} when there is nothing to update or one is already queued.
async function request() {
  const s = await status();
  if (!s.newer) throw Object.assign(new Error('already up to date'), { status: 409 });
  if (s.pending) throw Object.assign(new Error('update already requested'), { status: 409 });
  fs.writeFileSync(REQUEST(), String(Date.now()), { mode: 0o640 });
  return { ...s, pending: true };
}

module.exports = { current, status, request };
