'use strict';
// Linked devices visible to one relay account. Every device with the shared token announces itself here, so a phone or PC can
// offer a target list without inventing another pairing protocol. Only names, ids and platform labels are kept; no screen data.
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');

const FILE = path.join(cfg.dataDir, 'remote-devices.json');
const ONLINE_MS = 90e3;
const MAX = 100;
const PLATFORMS = new Set(['desktop', 'android']);
let devices = new Map();
let loaded = false;

const cleanId = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
};
const cleanName = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) || 'Unnamed device';

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(list)) for (const d of list) {
      const id = cleanId(d && d.id);
      if (id) devices.set(id, { id, name: cleanName(d.name), platform: PLATFORMS.has(d.platform) ? d.platform : 'desktop', at: Number(d.at) || 0, seen: Number(d.seen) || 0 });
    }
  } catch { /* first run, or no permission yet */ }
}
function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...devices.values()]), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch { /* in-memory registry still works */ }
}

/** Adds or refreshes this device. The self record is stored too, so other devices can show it in their target list. */
function register(body) {
  load();
  const id = cleanId(body && body.id);
  if (!id) return null;
  const now = Date.now();
  const old = devices.get(id);
  const entry = {
    id,
    name: cleanName(body.name || (old && old.name)),
    platform: PLATFORMS.has(body.platform) ? body.platform : (old && old.platform) || 'desktop',
    at: (old && old.at) || now,
    seen: now,
  };
  devices.set(id, entry);
  if (devices.size > MAX) {
    const excess = [...devices.values()].sort((a, b) => a.seen - b.seen).slice(0, devices.size - MAX);
    for (const d of excess) devices.delete(d.id);
  }
  persist();
  return publicOf(entry);
}

function publicOf(d) {
  return { id: d.id, name: d.name, platform: d.platform, online: Date.now() - d.seen < ONLINE_MS, added: d.at };
}

/** All devices on this account, newest activity first. */
function list() {
  load();
  return [...devices.values()].sort((a, b) => b.seen - a.seen).map(publicOf);
}

function heartbeat(id) {
  load();
  const d = devices.get(cleanId(id));
  if (!d) return false;
  d.seen = Date.now();
  persist();
  return true;
}

function remove(id) {
  load();
  return devices.delete(cleanId(id));
}

/** Picks a sensible default target for a controller: another device of the requested platform. */
function defaultTarget(platform, excludeId) {
  const want = PLATFORMS.has(platform) ? platform : '';
  const candidates = list().filter((d) => d.id !== cleanId(excludeId) && (!want || d.platform === want));
  return (candidates.find((d) => d.online) || candidates[0] || null);
}

/** Test hook: clears the in-memory registry without touching the persisted file. */
function reset() { devices = new Map(); loaded = true; }

module.exports = { register, list, heartbeat, remove, defaultTarget, reset, cleanId };
