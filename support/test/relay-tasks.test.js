// In-app tickets from the relay, owner notification payloads and the Google Tasks helper. Run: node test/relay-tasks.test.js
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { createApp } = require('../app');
const { createTasks } = require('../tasks');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const sent = [], events = [], toRelayCalls = []; let relayUp = true;
const app = createApp({
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'lodica-relay-')), transport: { sendMail: async (m) => { sent.push(m); } },
  from: 'lodica@syntaxya.be', owners: ['me@example.com'], secret: 'shared-secret-1', resolveMx: async () => true,
  onOwnerMail: async (m) => { events.push(m); }, toRelay: async (id, text) => { if (!relayUp) return false; toRelayCalls.push({ id, text }); return true; },
});
const srv = http.createServer((q, r) => app.handle(q, r));
const call = (p, tok, body) => new Promise((res) => { const d = Buffer.from(JSON.stringify(body)); const r = http.request({ host: '127.0.0.1', port: srv.address().port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => res({ code: x.statusCode, j: JSON.parse(b || '{}') })); }); r.end(d); });
const rid = 'a1b2c3d4e5f60718';
srv.listen(0, '127.0.0.1', async () => {
  ok('1 relay endpoint needs the shared secret', (await call('/relay/ticket', 'nope', { relayId: rid, text: 'hi' })).code === 401 && (await call('/relay/ticket', '', { relayId: rid, text: 'hi' })).code === 401);
  ok('2 bad relay id or empty text refused', (await call('/relay/ticket', 'shared-secret-1', { relayId: 'zz', text: 'hi' })).code === 400 && (await call('/relay/ticket', 'shared-secret-1', { relayId: rid, text: ' ' })).code === 400);
  const a = await call('/relay/ticket', 'shared-secret-1', { relayId: rid, text: 'Tabs vanish <script>x</script>\nafter restart', app: 'Phone', version: '1.13.1', platform: 'Android 15' });
  const id = a.j.id;
  ok('3 in-app ticket gets a LOD-NNNN id', a.code === 200 && /^LOD-\d{4}$/.test(id));
  const note = sent.find((m) => String(m.to).includes('me@example.com'));
  ok('4 owner gets a mail with escaped text and plus-address', note && note.subject.includes(id) && !note.html.includes('<script>') && note.replyTo === 'lodica+' + id + '@syntaxya.be');
  ok('5 owner hook gets {kind:new,id,title,category,from,text}', events.length === 1 && events[0].kind === 'new' && events[0].id === id && events[0].title.startsWith('Tabs vanish') && events[0].from.startsWith('in-app') && events[0].text.includes('after restart') && events[0].category);
  const b = await call('/relay/ticket', 'shared-secret-1', { relayId: rid, text: 'Still happening' });
  ok('6 second message on the same relay id is a follow-up, same ticket', b.j.id === id && events[1].kind === 'follow-up' && events[1].id === id && events[1].text === 'Still happening');
  const c = await call('/relay/ticket', 'shared-secret-1', { relayId: 'ffffffffffffffff', text: 'Other problem' });
  ok('7 different relay id gives next id', c.j.id !== id && /^LOD-\d{4}$/.test(c.j.id));
  sent.length = 0;
  const r = await app.inbound({ from: 'me@example.com', to: ['lodica+' + id + '@syntaxya.be'], subject: 'Re: x', text: 'Please update.\n\n> old', authOk: true });
  ok('8 owner mail reply goes to the relay, not to email', r.handled && toRelayCalls.length === 1 && toRelayCalls[0].id === rid && toRelayCalls[0].text === 'Please update.' && sent.length === 0);
  ok('9 unauthenticated reply is ignored', (await app.inbound({ from: 'me@example.com', to: [], subject: '[' + id + ']', text: 'pay me', authOk: false })).handled === false && toRelayCalls.length === 1);
  relayUp = false;
  await app.inbound({ from: 'me@example.com', to: [], subject: '[' + id + ']', text: 'Second answer', authOk: true });
  ok('10 relay down: answer is queued', app.db().relayOut.length === 1);
  relayUp = true; await app.flushOutbox();
  ok('11 queued answer is delivered later', app.db().relayOut.length === 0 && toRelayCalls[1].text === 'Second answer');
  // tasks helper with a fake Google
  const calls = []; const lists = [{ id: 'L9', title: 'other' }];
  const fakeFetch = async (url, o) => {
    calls.push(o.method + ' ' + new URL(url).pathname);
    const j = (x) => ({ ok: true, status: 200, json: async () => x });
    if (url.includes('oauth2')) return j({ access_token: 'tok', expires_in: 3600 });
    if (o.method === 'GET') return j({ items: lists });
    if (url.endsWith('/lists')) { const l = { id: 'NEW', title: JSON.parse(o.body).title }; lists.push(l); return j(l); }
    return j({ id: 't1', ...JSON.parse(o.body) });
  };
  const cfg = { client_id: 'x', client_secret: 'y', refresh_token: 'z' };
  const t = createTasks({ fetchFn: fakeFetch, config: cfg });
  await t.addTask('LOD-1001 Title', 'notes'); await t.addTask('second', '');
  ok('12 list "lodica" created when missing, then reused', calls.filter((x) => x === 'POST /tasks/v1/users/@me/lists').length === 1 && calls.filter((x) => x === 'POST /tasks/v1/lists/NEW/tasks').length === 2 && calls.filter((x) => x === 'POST /token').length === 1);
  const t2 = createTasks({ fetchFn: fakeFetch, config: cfg }); calls.length = 0;
  await t2.addTask('again', '');
  ok('13 existing list found by title', !calls.includes('POST /tasks/v1/users/@me/lists') && calls.includes('POST /tasks/v1/lists/NEW/tasks'));
  srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
});
