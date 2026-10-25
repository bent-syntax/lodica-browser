'use strict';
/* The support desk: sign in with an emailed code, send requests, answer them by replying to an email. No third party, no account system.
   Mail to the support address only becomes a request when its sender linked that address in Lodica first (Settings > Support, with an emailed code). */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const mail = require('./mail');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const SESSION_MS = 90 * 86400e3, CODE_MS = 10 * 60e3;

function createApp({ dataDir, transport, from, owners = [], toRelay = async () => true, resolveMx = async (d) => { try { const r = await dns.resolveMx(d); if (r.length) return true; } catch { /* try A below */ } try { return (await dns.resolve4(d)).length > 0; } catch { return false; } }, now = () => Date.now(), onOwnerMail = async () => {}, secret = '' }) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'support.json');
  let db = { sessions: {}, codes: {}, tickets: {}, outbox: [], relayOut: [], byRelay: {}, seq: 1000, links: {}, linked: {}, nudged: {} };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(db), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
  const ownerSet = new Set([from, ...owners].map((x) => String(x).toLowerCase()));
  const ownerTo = [...new Set([from, ...owners].map((x) => String(x).toLowerCase()))].join(', ');   // the support mailbox and the owners (e.g. your own Gmail): an answer from any of them goes out from the support address
  const plus = (id) => from.replace('@', '+' + id + '@');

  // ── limits ──
  const hits = new Map();
  const limited = (key, max, ms) => { const t = now(), a = (hits.get(key) || []).filter((x) => t - x < ms); if (a.length >= max) { hits.set(key, a); return true; } a.push(t); hits.set(key, a); return false; };

  // ── mail ──
  async function send(m, to) {
    const msg = { from: `Lodica Support <${from}>`, to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo, headers: { 'X-Lodica-Mail': '1' } };
    try { await transport.sendMail(msg); return true; } catch (e) { db.outbox.push({ msg, at: now(), tries: 1, last: String(e.message).slice(0, 120) }); save(); return false; }
  }
  async function flushOutbox() {
    const left = [];
    for (const o of db.outbox) { try { await transport.sendMail(o.msg); } catch (e) { o.tries++; o.last = String(e.message).slice(0, 120); if (o.tries < 20 && now() - o.at < 2 * 86400e3) left.push(o); } }
    db.outbox = left;
    const relayLeft = [];   // answers for in-app tickets that the relay could not take yet
    for (const o of db.relayOut) { let ok = false; try { ok = await toRelay(o.relayId, o.text); } catch { /* retry */ } if (!ok) { o.tries++; if (o.tries < 50 && now() - o.at < 2 * 86400e3) relayLeft.push(o); } }
    db.relayOut = relayLeft; save();
  }

  // ── people ──
  async function sendCode(email, ip, template) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 120) return { code: 400, error: 'That does not look like an email address.' };
    if (limited('ip:' + ip, 20, 3600e3) || limited('em:' + email, 5, 3600e3)) return { code: 429, error: 'Too many tries. Please wait a while and try again.' };
    if (!(await resolveMx(email.split('@')[1]))) return { code: 400, error: 'That email domain does not exist. Check the spelling.' };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    db.codes[email] = { hash: sha(code), exp: now() + CODE_MS, tries: 0 }; save();
    const ok = await send(template(code), email);
    return ok ? { code: 200, body: { ok: true } } : { code: 502, error: 'We could not send the email right now. Please try again in a minute.' };
  }
  /** null when the code is right (it is used up then), otherwise the error answer */
  function checkCode(email, code) {
    const c = db.codes[email];
    if (!c || now() > c.exp) return { code: 400, error: 'That code ran out. Ask for a new one.' };
    if (++c.tries > 5) { delete db.codes[email]; save(); return { code: 429, error: 'Too many wrong codes. Ask for a new one.' }; }
    if (c.hash !== sha(String(code || '').replace(/\s/g, ''))) { save(); return { code: 400, error: 'That code is not right.' }; }
    delete db.codes[email]; return null;
  }
  const authStart = (email, ip) => sendCode(email, ip, mail.loginCode);
  function authVerify(email, code) {
    email = String(email || '').trim().toLowerCase();
    const bad = checkCode(email, code); if (bad) return bad;
    const token = crypto.randomBytes(32).toString('hex'); db.sessions[sha(token)] = { email, exp: now() + SESSION_MS }; save();
    return { code: 200, body: { token, email } };
  }
  // linking an email in the app: after that, mail from that address is taken as a request, and in-app requests get email updates too
  const linkStart = (email, ip) => sendCode(email, ip, mail.linkCode);
  function linkVerify(email, code) {
    email = String(email || '').trim().toLowerCase();
    const bad = checkCode(email, code); if (bad) return bad;
    const link = crypto.randomBytes(32).toString('hex');
    db.links[sha(link)] = { email, at: now() }; db.linked[email] = now(); delete db.nudged[email]; save();
    return { code: 200, body: { link, email } };
  }
  function unlink(link) {
    const k = sha(link || ''), l = db.links[k]; if (!l) return { code: 200, body: { ok: true } };
    delete db.links[k];
    if (!Object.values(db.links).some((x) => x.email === l.email)) delete db.linked[l.email];
    save(); return { code: 200, body: { ok: true } };
  }
  const linkedEmail = (link) => { const l = typeof link === 'string' && db.links[sha(link)]; return l ? l.email : ''; };
  const who = (token) => { const s = db.sessions[sha(token || '')]; return s && now() < s.exp ? s.email : null; };

  // ── requests ──
  const brief = (t) => ({ id: t.id, title: t.title, category: t.category, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, last: t.messages[t.messages.length - 1].text.slice(0, 120), from: t.messages[t.messages.length - 1].from, count: t.messages.length });
  async function create(email, b) {
    const category = ['bug', 'question', 'idea', 'other'].includes(b.category) ? b.category : 'other';
    const title = String(b.title || '').trim().slice(0, 120), text = String(b.text || '').trim().slice(0, 5000);
    if (title.length < 3) return { code: 400, error: 'Please give your request a short title.' };
    if (text.length < 10) return { code: 400, error: 'Please explain a little more (at least a sentence).' };
    if (limited('new:' + email, 6, 86400e3)) return { code: 429, error: 'You sent a lot of requests today. Please wait until tomorrow, or reply to an earlier one.' };
    const id = nextId();
    const m = b.meta || {};
    const t = { id, email, category, title, status: 'open', createdAt: now(), updatedAt: now(), meta: { app: String(m.app || '').slice(0, 30), version: String(m.version || '').slice(0, 20), platform: String(m.platform || '').slice(0, 80) }, messages: [{ from: 'user', text, at: now() }] };
    db.tickets[id] = t; save();
    const sent = await Promise.all([send(mail.confirmation(t, plus(id)), email), send(mail.notifyOwner(t, plus(id)), ownerTo)]);
    Promise.resolve(onOwnerMail({ kind: 'new', id, title, category, from: email, text })).catch(() => {});   // phone notification + Google Task
    return { code: 200, body: { id, mailed: sent.every(Boolean) } };
  }
  async function addUserMessage(t, text) {
    t.messages.push({ from: 'user', text, at: now() }); t.updatedAt = now(); t.status = 'open'; save();
    Promise.resolve(onOwnerMail({ kind: 'follow-up', id: t.id, title: t.title, category: t.category, from: t.email || 'in-app', text })).catch(() => {});
    return send(mail.followUpOwner(t, text, plus(t.id)), ownerTo);
  }
  async function addSupportMessage(t, text) {
    t.messages.push({ from: 'support', text, at: now() }); t.updatedAt = now(); t.status = 'answered'; save();
    let ok = true;
    if (t.relay) {   // in-app ticket: the answer goes back through the relay, the app shows it
      ok = false; try { ok = await toRelay(t.relay, text); } catch { /* queued below */ }
      if (!ok) { db.relayOut.push({ relayId: t.relay, text, at: now(), tries: 1 }); save(); }
    }
    if (t.email) ok = (await send(mail.reply(t, text, plus(t.id)), t.email)) && ok;   // a linked email gets every answer too
    return ok;
  }
  /** The request was put on the work list ('listed') or is done ('fixed' or 'added'): the person gets a message, once per step. */
  async function notify(id, event, note) {
    const t = db.tickets[String(id || '')];
    if (!t) return { code: 404, error: 'no such request' };
    if (!['listed', 'fixed', 'added'].includes(event)) return { code: 400, error: 'event must be listed, fixed or added' };
    const key = event === 'listed' ? 'listed' : 'done';
    t.auto = t.auto || {}; if (t.auto[key] || (key === 'done' && t.auto.fixed)) return { code: 200, body: { ok: true, already: true } };
    t.auto[key] = now();
    note = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const text = event === 'listed'
      ? `Thank you for your message about "${t.title}". We read it and added it to our list. You will get another email when it is done.`
      : `Good news: ${event === 'added' ? `what you asked for in "${t.title}" is now added to Lodica.` : `what you told us about "${t.title}" is fixed.`}${note ? `\n\nWhat we did: ${note}` : ''}\n\nUpdate Lodica to the newest version to get it. If something is still wrong, just reply to this email.`;
    await addSupportMessage(t, text); return { code: 200, body: { ok: true } };
  }
  const nextId = () => { let id; do { id = 'LOD-' + String(++db.seq).padStart(4, '0'); } while (db.tickets[id]); return id; };
  /** A ticket or message from the in-app support (via the relay). { relayId, kind: 'new'|'message', text, name, app, version, platform } */
  async function fromRelay(b) {
    const relayId = String(b.relayId || '').slice(0, 64), text = String(b.text || '').trim().slice(0, 5000);
    if (!/^[0-9a-f]{16}$/.test(relayId) || !text) return { code: 400, error: 'bad request' };
    const email = linkedEmail(b.link);
    let t = db.tickets[db.byRelay[relayId]];
    if (t) { if (email && !t.email) { t.email = email; save(); } await addUserMessage(t, text); return { code: 200, body: { id: t.id } }; }
    const id = nextId(), title = (text.split(/\r?\n/)[0] || 'In-app message').slice(0, 80);
    t = { id, email, relay: relayId, category: 'other', title, status: 'open', createdAt: now(), updatedAt: now(), meta: { app: String(b.app || '').slice(0, 30), version: String(b.version || '').slice(0, 20), platform: String(b.platform || '').slice(0, 80) }, messages: [{ from: 'user', text, at: now() }] };
    if (b.name) t.meta.name = String(b.name).slice(0, 40);
    db.tickets[id] = t; db.byRelay[relayId] = id; save();
    await Promise.all([send(mail.notifyOwner(t, plus(id)), ownerTo), email ? send(mail.confirmation(t, plus(id)), email) : true]);
    Promise.resolve(onOwnerMail({ kind: 'new', id, title, category: 'other', from: email || ('in-app' + (t.meta.name ? ' (' + t.meta.name + ')' : '')), text })).catch(() => {});
    return { code: 200, body: { id } };
  }

  // ── mail that comes in (replies) ──
  const stripQuoted = (text) => {
    const out = []; for (const line of String(text || '').split(/\r?\n/)) {
      if (/^>/.test(line) || /^On .+ wrote:\s*$/i.test(line) || /^-{2,}\s*(Original|Forwarded)/i.test(line) || /^_{5,}/.test(line) || /^From:\s.+@/.test(line)) break; out.push(line);
    } return out.join('\n').trim().slice(0, 5000);
  };
  const guess = (s) => (/\b(crash|bug|broken|error|freez|not working|doesn'?t work|does not work|stopped)/i.test(s) ? 'bug' : /\b(idea|feature|suggest|would be nice|could you add|please add|wish)/i.test(s) ? 'idea' : /\?/.test(s) ? 'question' : 'other');
  const once = (key) => { const t = now(); for (const k in db.nudged) if (t - db.nudged[k] > 86400e3) delete db.nudged[k]; if (db.nudged[key]) return false; db.nudged[key] = t; save(); return true; };
  /** A new mail without a request number: a new request from a linked address, otherwise a short "link your email first" answer. */
  async function fresh(m) {
    const sender = String(m.from || '').trim().toLowerCase();
    if (!EMAIL.test(sender) || ownerSet.has(sender)) return { handled: false, why: 'not a request' };
    if (m.auto || /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.-]|$)/i.test(sender.split('@')[0])) return { handled: false, why: 'automatic mail' };
    if (!m.authOk) return { handled: false, why: 'unverified sender' };
    if (!db.linked[sender]) {
      if (!once(sender)) return { handled: false, why: 'not linked, already told' };
      await send(mail.linkFirst(), sender); return { handled: true, kind: 'link-first' };
    }
    const text = stripQuoted(m.text), subject = String(m.subject || '').replace(/^\s*((re|fwd?|aw|wg)\s*:\s*)+/i, '').trim();
    const r = await create(sender, { category: guess(subject + '\n' + text), title: subject || text.split(/\r?\n/)[0].slice(0, 80), text, meta: { platform: 'email' } });
    if (r.error) { if (once('err:' + sender)) await send(mail.notTaken(r.error), sender); return { handled: true, kind: 'refused' }; }
    return { handled: true, kind: 'new request' };
  }
  /** { from, to: [addresses], subject, text, authOk, auto } */
  async function inbound(m) {
    const hay = [...(m.to || []), m.subject || ''].join(' '), id = (/LOD-\d{4,}/i.exec(hay) || [])[0], idU = id && id.toUpperCase(), t = idU && db.tickets[idU];
    if (!id) return fresh(m);
    if (!t) return { handled: false, why: 'unknown request ' + idU };
    const text = stripQuoted(m.text); if (text.length < 1) return { handled: false };
    const sender = String(m.from || '').toLowerCase();
    if (ownerSet.has(sender)) { if (!m.authOk) return { handled: false, why: 'unverified sender' }; await addSupportMessage(t, text); return { handled: true, kind: 'reply' }; }
    if (t.email && sender === t.email) { await addUserMessage(t, text); return { handled: true, kind: 'follow-up' }; }
    return { handled: false, why: 'unknown sender' };
  }

  // ── HTTP ──
  const readJson = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 40000) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } }); });
  async function handle(req, res) {
    const send = (code, obj) => { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); res.end(b); };
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const u = new URL(req.url, 'http://x'), parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    const out = (r) => (r.error ? send(r.code, { error: r.error }) : send(r.code, r.body));
    try {
      if (req.method === 'GET' && parts[0] === 'health') return send(200, { ok: true });
      if (req.method === 'POST' && parts[0] === 'auth' && parts[1] === 'start') return out(await authStart((await readJson(req)).email, ip));
      if (req.method === 'POST' && parts[0] === 'auth' && parts[1] === 'verify') { const b = await readJson(req); if (limited('v:' + ip, 30, 3600e3)) return send(429, { error: 'Too many tries.' }); return out(authVerify(b.email, b.code)); }
      const trusted = () => { const given = String(req.headers.authorization || '').replace(/^Bearer /, ''); return !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret)); };
      if (req.method === 'POST' && parts[0] === 'relay' && parts[1] === 'ticket') {   // the relay (same machine) hands over in-app tickets and messages
        if (!trusted()) return send(401, { error: 'not allowed' });
        return out(await fromRelay(await readJson(req)));
      }
      if (req.method === 'POST' && parts[0] === 'relay' && parts[1] === 'link') {   // the relay passes on "link my email" from the app; the client's address comes in the body
        if (!trusted()) return send(401, { error: 'not allowed' });
        const b = await readJson(req), cip = String(b.ip || ip).slice(0, 64);
        if (parts[2] === 'start') return out(await linkStart(b.email, cip));
        if (parts[2] === 'verify') { if (limited('v:' + cip, 30, 3600e3)) return send(429, { error: 'Too many tries.' }); return out(linkVerify(b.email, b.code)); }
        if (parts[2] === 'remove') return out(unlink(b.link));
        return send(404, { error: 'unknown' });
      }
      if (req.method === 'POST' && parts[0] === 'owner' && parts[1] === 'notify') {   // a request was put on the list / is done → the person gets a message
        if (!trusted()) return send(401, { error: 'not allowed' });
        const b = await readJson(req); return out(await notify(b.id, b.event, b.note));
      }
      const token = String(req.headers.authorization || '').replace(/^Bearer /, ''), email = who(token);
      if (!email) return send(401, { error: 'Please sign in again.' });
      if (req.method === 'GET' && parts[0] === 'me') return send(200, { email });
      if (req.method === 'POST' && parts[0] === 'auth' && parts[1] === 'logout') { delete db.sessions[sha(token)]; save(); return send(200, { ok: true }); }
      if (parts[0] === 'tickets') {
        const owner = ownerSet.has(String(email).toLowerCase());   // signed in as an owner: every request of everybody, read only (answers go by email)
        if (req.method === 'GET' && !parts[1]) return send(200, Object.values(db.tickets).filter((t) => owner || t.email === email).sort((a, b) => b.updatedAt - a.updatedAt).map((t) => (owner ? { ...brief(t), email: t.email, owner: true, theirs: t.email !== email, thread: t.messages.map((m) => (m.from === 'support' ? 'Support' : t.email) + ': ' + m.text).join('\n\n').slice(0, 5000), category: t.category } : brief(t))));
        if (req.method === 'POST' && !parts[1]) return out(await create(email, await readJson(req)));
        const t = db.tickets[parts[1]]; if (!t || (t.email !== email && !owner)) return send(404, { error: 'No such request.' });
        if (req.method === 'GET' && !parts[2]) return send(200, { ...brief(t), messages: t.messages, ...(owner ? { email: t.email, owner: true, theirs: t.email !== email } : {}) });
        if (req.method === 'POST' && parts[2] === 'messages' && t.email !== email) return send(403, { error: 'This is somebody else\'s request. Answer it by replying to its email, so nothing is sent or changed by accident.' });
        if (req.method === 'POST' && parts[2] === 'messages') {
          const text = String((await readJson(req)).text || '').trim().slice(0, 5000);
          if (text.length < 2) return send(400, { error: 'Write a message first.' });
          if (limited('msg:' + email, 30, 86400e3)) return send(429, { error: 'Too many messages today.' });
          await addUserMessage(t, text); return send(200, { ok: true });
        }
      }
      return send(404, { error: 'unknown' });
    } catch (e) { return send(500, { error: 'Something went wrong on our side.' }); }
  }
  return { handle, inbound, fromRelay, flushOutbox, db: () => db, save, plus, stripQuoted, addSupportMessage, notify };
}
module.exports = { createApp };
