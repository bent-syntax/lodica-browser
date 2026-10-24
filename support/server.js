#!/usr/bin/env node
'use strict';
/* Runs the support desk. Settings come from the environment (see install.sh):
   see env.template */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const nodemailer = require('nodemailer');
const { createApp } = require('./app');
const { createTasks } = require('./tasks');

const user = process.env.SUPPORT_USER, pass = process.env.SUPPORT_PASS;
if (!user || !pass) { console.error('SUPPORT_USER and SUPPORT_PASS are not set. Run install.sh first.'); process.exit(1); }
const flag = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));
const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT || 465), secure: flag(process.env.SMTP_SECURE, true), auth: { user, pass } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fileOrEnv = (name) => { if (process.env[name]) return process.env[name].trim(); const f = process.env[name + '_FILE']; try { return f ? fs.readFileSync(f, 'utf8').trim() : ''; } catch { return ''; } };

// every new ticket and follow-up: (a) phone notification via the owner's local server, (b) a Google Task in the list "lodica"
const notifyUrl = process.env.SUPPORT_NOTIFY_URL || 'http://127.0.0.1:47601/support/incoming', notifyToken = process.env.SUPPORT_NOTIFY_TOKEN || '';
const tasks = createTasks({ listTitle: process.env.SUPPORT_TASKS_LIST || 'lodica' });
async function onOwnerMail(m) {
  if (notifyToken) {
    const r = await fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + notifyToken }, body: JSON.stringify({ kind: m.kind, id: m.id, title: m.title, category: m.category, from: m.from, text: m.text }), signal: AbortSignal.timeout(10000) }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) log('could not notify about', m.id, r.status);
  }
  if (process.env.SUPPORT_TASKS !== '0') {
    // ticket text is untrusted data: it only becomes plain task text
    try { await tasks.addTask((m.kind === 'new' ? '' : 'Follow-up ') + m.id + ' ' + String(m.title || '').slice(0, 120), 'From: ' + m.from + '\nType: ' + m.category + '\n\n' + String(m.text || '').slice(0, 4000)); }
    catch (e) { log('could not add Google Task for', m.id, e.message); }
  }
}

// answers to in-app tickets go back through the relay's admin API; the app shows them
const relayUrl = (process.env.SUPPORT_RELAY_URL || 'https://127.0.0.1:44741').replace(/\/$/, '');
const insecure = flag(process.env.SUPPORT_INSECURE_TLS, false);
function toRelay(relayId, text) {
  const admin = fileOrEnv('SUPPORT_RELAY_ADMIN_TOKEN');
  if (!admin) return Promise.resolve(false);
  const u = new URL(relayUrl + '/api/support/admin/' + relayId), body = JSON.stringify({ text, status: 'needs-info' });
  return new Promise((resolve) => {
    const req = (u.protocol === 'https:' ? https : http).request(u, { method: 'POST', rejectUnauthorized: !insecure, timeout: 15000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + admin } }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); }); req.end(body);
  });
}
const secret = fileOrEnv('SUPPORT_SECRET');
if (!secret) log('SUPPORT_SECRET is not set: in-app tickets from the relay are refused');
const app = createApp({ onOwnerMail, toRelay, secret, dataDir: process.env.SUPPORT_DATA || path.join(__dirname, 'data'), transport, from: user, owners: (process.env.SUPPORT_OWNERS || '').split(',').map((s) => s.trim()).filter(Boolean) });
const port = Number(process.env.SUPPORT_PORT || 47610);

http.createServer((req, res) => app.handle(req, res)).listen(port, '127.0.0.1', () => console.log('Support desk on 127.0.0.1:' + port));

// answers come back as emails: look at the mailbox now and then.
// Messages are followed by number (UID), not by "unread": reading a mail in Gmail must never make us miss it.
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
let busy = false;
async function poll() {
  if (busy) return; busy = true;
  const db = app.db(); db.mail = db.mail || { lastUid: 0, ids: [] };
  const c = new ImapFlow({ host: process.env.IMAP_HOST || 'imap.gmail.com', port: Number(process.env.IMAP_PORT || 993), secure: flag(process.env.IMAP_SECURE, true), auth: { user, pass }, logger: false, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000 });
  c.on('error', (e) => log('mailbox connection problem:', e.message));   // without this a timeout would stop the whole program
  try {
    await c.connect(); const lock = await c.getMailboxLock('INBOX');
    try {
      const top = c.mailbox.uidNext - 1;
      if (db.mail.lastUid === 0 && top > 0) db.mail.lastUid = Math.max(0, top - 200);   // the first time: look at the newest 200 messages
      if (top > db.mail.lastUid) {
        const found = [];
        for await (const msg of c.fetch(`${db.mail.lastUid + 1}:*`, { source: true, uid: true }, { uid: true })) if (msg.uid > db.mail.lastUid) found.push(msg);
        for (const msg of found.sort((x, y) => x.uid - y.uid)) {
          try {
            const m = await simpleParser(msg.source), mid = String(m.messageId || msg.uid);
            if (!db.mail.ids.includes(mid) && !m.headers.get('x-lodica-mail')) {
              const arH = m.headers.get('authentication-results'), auth = arH ? (typeof arH === 'string' ? arH : JSON.stringify(arH)) : '';
              // a mail that Gmail did not receive from outside (we answered from the mailbox itself) has no such header; anything from outside always has one, and must pass
              const r = await app.inbound({ from: (m.from && m.from.value[0] && m.from.value[0].address) || '', to: (m.to ? m.to.value : []).map((x) => x.address).concat(m.headers.get('delivered-to') ? [String(m.headers.get('delivered-to'))] : []), subject: m.subject || '', text: m.text || '', authOk: !arH || (/(dkim|spf)=pass/i.test(auth) && !/dkim=fail/i.test(auth)) });
              if (r.handled) log('handled a', r.kind, 'from the mailbox:', m.subject); else if (r.why) log('ignored a mail:', r.why, '-', m.subject);
              if (r.handled || !r.why) db.mail.ids = [...db.mail.ids, mid].slice(-500);
            }
          } catch (e) { log('could not read mail', msg.uid, e.message); }
          db.mail.lastUid = Math.max(db.mail.lastUid, msg.uid); app.save();
        }
      }
      db.mail.lastUid = Math.max(db.mail.lastUid, top); app.save();
    } finally { lock.release(); }
    await c.logout();
  } catch (e) { log('mailbox check failed:', e.message); try { c.close(); } catch { /* gone */ } }
  busy = false;
}
setInterval(poll, 30000); setTimeout(poll, 3000);
setInterval(() => app.flushOutbox().catch((e) => log('outbox:', e.message)), 60000);
process.on('uncaughtException', (e) => log('problem (kept running):', e.message));
