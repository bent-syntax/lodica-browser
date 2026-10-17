'use strict';
// Run: node test/chat.test.js   (in-process; no network beyond loopback, no relay token)
const http = require('http');
const assert = require('assert');
const chat = require('../src/chat');

const send = (req, res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const h = {
  sendJson: (req, res, s, o) => send(req, res, s, JSON.stringify(o), { 'content-type': 'application/json' }),
  sendText: (req, res, s, t) => send(req, res, s, t),
  readBody: (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }),
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') return chat.post(req, res, '1.2.3.4', h);
  if (url.pathname === '/api/chat/users') return chat.users(req, res, url, h);
  chat.get(req, res, url, h);
});

const call = (port, method, path, body) => new Promise((ok, bad) => {
  const r = http.request({ port, method, path, headers: body ? { 'content-type': 'application/json' } : {} }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ status: res.statusCode, json: d.startsWith('{') ? JSON.parse(d) : d }));
  });
  r.on('error', bad); r.end(body && JSON.stringify(body));
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    assert.deepStrictEqual((await call(port, 'GET', '/api/chat')).json, { messages: [], last: 0 });
    assert.strictEqual((await call(port, 'POST', '/api/chat', { name: 'a', text: '   ' })).status, 400);
    const m = (await call(port, 'POST', '/api/chat', { name: 'Ann\n', text: 'hi' })).json;
    assert.strictEqual(m.id, 1); assert.strictEqual(m.name, 'Ann');
    assert.strictEqual((await call(port, 'GET', '/api/chat?after=1')).json.messages.length, 0);
    // A waiting poll is answered as soon as someone posts.
    const t0 = Date.now();
    const poll = call(port, 'GET', '/api/chat?after=1&wait=10');
    setTimeout(() => call(port, 'POST', '/api/chat', { name: 'Bob', text: 'yo' }), 100);
    const got = (await poll).json;
    assert.strictEqual(got.messages.length, 1); assert.strictEqual(got.messages[0].name, 'Bob');
    assert.ok(Date.now() - t0 < 3000, 'long poll returned promptly');
    // Private and group rooms stay apart from the shared room.
    const dm = (await call(port, 'POST', '/api/chat', { name: 'Ann', text: 'psst', room: 'dm:Ann|Bob' })).json;
    assert.strictEqual(dm.room, 'dm:Ann|Bob');
    assert.ok((await call(port, 'GET', '/api/chat')).json.messages.every((x) => x.room === ''));
    assert.strictEqual((await call(port, 'GET', '/api/chat?room=dm:Ann%7CBob')).json.messages.length, 1);
    assert.strictEqual((await call(port, 'POST', '/api/chat', { name: 'Ann', text: 'x', room: 'bogus' })).status, 400);
    // An invalid private room never lands in, or reads from, the shared room.
    assert.strictEqual((await call(port, 'POST', '/api/chat', { name: 'Ann', text: 'leak', room: 'dm:Ann|Bo b' })).status, 400);
    assert.strictEqual((await call(port, 'GET', '/api/chat?room=dm:Ann')).status, 400);
    assert.ok((await call(port, 'GET', '/api/chat')).json.messages.every((x) => x.text !== 'leak'));
    // Users list: posters and `name` pings show up.
    await call(port, 'GET', '/api/chat/users?name=Cy');
    const names = (await call(port, 'GET', '/api/chat/users')).json.users.map((u) => u.name);
    assert.ok(names.includes('Ann') && names.includes('Cy'));
    // Rate limit: more than 20 posts in the window are refused.
    let limited = 0;
    for (let i = 0; i < 25; i++) if ((await call(port, 'POST', '/api/chat', { text: 'x' })).status === 429) limited++;
    assert.ok(limited > 0, 'rate limited');
    console.log('chat ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
  chat.reset(); server.close();
});
