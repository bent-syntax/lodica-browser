'use strict';
// Ad and tracker filter for the proxy, by host name. A browser that asks for it logs in to the proxy as "lodica+ads-<strength>"
// and every CONNECT or plain request to a listed host (or a subdomain of one) is refused with 403. The proxy only sees the host
// name of an encrypted connection, so this cannot remove ads that are served from the same host as the content (YouTube video
// ads, for one). The browser handles those.
//
// Strength: light = ad servers, standard = ad and tracker hosts, strict = adds a larger list that also holds malware and scam hosts.
// Lists are downloaded once a day and kept in the data directory; a failed download keeps the copy that is already there.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { cfg } = require('./config');

const URLS = {
  ads: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0&mimetype=plaintext',
  hosts: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
  pro: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/pro.txt',
};
const LEVELS = { light: ['ads'], standard: ['ads', 'hosts'], strict: ['ads', 'hosts', 'pro'] };
// Always there, also before the first download or when the relay is offline.
const BUILTIN = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'adnxs.com', 'adsrvr.org',
  'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'amazon-adsystem.com',
  'scorecardresearch.com', 'moatads.com', 'advertising.com', 'adform.net', 'smartadserver.com', 'casalemedia.com'];
const DAY = 24 * 3600e3;
const MAX_BYTES = 25 * 1024 * 1024;

const sets = { ads: new Set(BUILTIN), hosts: new Set(), pro: new Set() };

// "0.0.0.0 host" (hosts file) or "host" per line; comments and anything that is not a plain host name are skipped.
function parse(text) {
  const out = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const h = (parts.length > 1 ? parts[1] : parts[0]).toLowerCase().replace(/\.$/, '');
    if (/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(h) && !/^[0-9.]+$/.test(h)) out.add(h);
  }
  return out;
}

/** Is [host] (or a parent domain of it) on the lists of this strength? Unknown strengths count as standard. */
function blocked(host, level) {
  let h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h || h.includes(':') || /^[0-9.]+$/.test(h)) return false;
  const names = LEVELS[level] || LEVELS.standard;
  for (;;) {
    for (const n of names) if (sets[n].has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0 || h.indexOf('.', i + 1) < 0) return false;   // never match a bare top level like "com" or "co.uk"
    h = h.slice(i + 1);
  }
}

/** The strength asked for in a proxy user name ("lodica+ads-strict" gives "strict"), or null when ads are not filtered. */
function levelOf(user) {
  const m = /^lodica\+ads-(light|standard|strict)$/.exec(user);
  return m ? m[1] : null;
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > MAX_BYTES) { req.destroy(new Error('too big')); } else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const fileOf = (name) => path.join(cfg.dataDir, 'adlist-' + name + '.txt');

async function refresh(name, log) {
  try {
    const text = await download(URLS[name]);
    const set = parse(text);
    if (set.size < 100) throw new Error('list too short');   // a captive page or an error body, not a list
    if (name === 'ads') for (const b of BUILTIN) set.add(b);
    sets[name] = set;
    await fs.promises.writeFile(fileOf(name), text);
  } catch (e) { log('ad list ' + name + ' not updated: ' + e.message); }
}

/** Loads the saved lists, then downloads fresh ones now and every day. Set LODICA_ADLISTS_OFF=1 to skip the downloads. */
function start(log) {
  for (const name of Object.keys(URLS)) {
    try {
      const set = parse(fs.readFileSync(fileOf(name), 'utf8'));
      if (name === 'ads') for (const b of BUILTIN) set.add(b);
      sets[name] = set;
    } catch { /* first run: nothing saved yet */ }
  }
  if (process.env.LODICA_ADLISTS_OFF) return;
  const all = () => Promise.all(Object.keys(URLS).map((n) => refresh(n, log)));
  all();
  setInterval(all, DAY).unref();
}

/** What the apps read to see that this relay can filter (older relays answer 404): the strengths and how many hosts each list holds. */
function status() {
  return { levels: Object.keys(LEVELS), hosts: { ads: sets.ads.size, hosts: sets.hosts.size, pro: sets.pro.size } };
}

module.exports = { parse, blocked, levelOf, start, status, sets };
