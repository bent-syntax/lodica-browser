'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.LODICA_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lodica-bugfix2-'));
const chat = require('../src/chat');
const enroll = require('../src/enroll');
const { cleanArt } = require('../src/faceart');

const mk = (body) => { const o = { status: 0 }; o.h = { readBody: async () => Buffer.from(body), sendText: (_q, _r, s) => { o.status = s; }, sendJson: (_q, _r, s) => { o.status = s; } }; return o; };

test('chat post and read refuse a non-string room', async () => {
  let o = mk('{"text":"secret","room":123}');
  await chat.post({}, {}, '9.9.9.9', o.h);
  assert.strictEqual(o.status, 400);
  o = mk('{"name":"Ann","room":["x"],"id":1}');
  await chat.read({}, {}, o.h);
  assert.strictEqual(o.status, 400);
});

test('enroll status counts misses and blocks after 10', () => {
  enroll.reset();
  let s = 0;
  const h = { sendText: (_q, _r, st) => { s = st; }, sendJson: (_q, _r, st) => { s = st; } };
  for (let i = 0; i < 10; i++) enroll.status({}, {}, '1.2.3.4', 'ABCD-EFGH', h);
  assert.strictEqual(s, 200);
  enroll.status({}, {}, '1.2.3.4', 'ABCD-EFGH', h);
  assert.strictEqual(s, 429);
});

test('cleanArt keeps shapes that fit instead of dropping everything', () => {
  const svg = Array.from({ length: 40 }, (_, i) => `<circle cx="${10 + i}" cy="20" r="3" fill="#aabbcc" stroke="#112233" stroke-width="1" opacity="0.5"/>`).join('');
  const out = cleanArt(svg);
  assert.ok(out.length > 0 && out.length <= 2400);
});

test('notebook put refuses a non-integer base and takes a 100000-char multibyte note', async () => {
  const nb = require('../src/notebook');
  const run = async (body) => { const o = mk(body); await nb.put({ url: '/api/notebook' }, {}, o.h); return o.status; };
  assert.strictEqual(await run('{"text":"a","base":"0"}'), 400);
  assert.strictEqual(await run('{"text":"a","base":null}'), 400);
  assert.strictEqual(await run(JSON.stringify({ text: '€'.repeat(100000) })), 200);
});

test('chat names lose "|" so post matches users, claim and read', async () => {
  chat.reset();
  const o = { msg: null }; const h = { readBody: async () => Buffer.from('{"name":"A|B","text":"hi"}'), sendText() {}, sendJson: (_q, _r, _s, m) => { o.msg = m; } };
  await chat.post({}, {}, '8.8.8.8', h);
  assert.strictEqual(o.msg.name, 'A B');
});

test('expired status polling does not block take()', () => {
  enroll.reset();
  let s = 0;
  const h = { sendText: (_q, _r, st) => { s = st; }, sendJson: (_q, _r, st) => { s = st; } };
  for (let i = 0; i < 12; i++) enroll.status({}, {}, '5.6.7.8', 'ABCD-EFGH', h);
  assert.strictEqual(s, 429);
  enroll.take({}, {}, '5.6.7.8', 'ABCD-EFGH', h);
  assert.notStrictEqual(s, 429);
});

test('notebook put and create roll back when the disk write fails', async () => {
  const nb = require('../src/notebook');
  nb.reset();
  const fsp = require('fs').promises, real = fsp.writeFile;
  const snap = async () => { const o = mk('{}'); o.h.sendJson = (_q, _r, _s, v) => { o.body = v; }; await nb.get({ url: '/api/notebook' }, {}, o.h); return JSON.stringify(o.body); };
  const before = await snap();
  fsp.writeFile = async () => { throw new Error('disk full'); };
  try {
    await assert.rejects(nb.put({ url: '/api/notebook' }, {}, mk('{"text":"lost"}').h), /disk full/);
    await assert.rejects(nb.create({ url: '/api/notebook' }, {}, mk('{}').h), /disk full/);
  } finally { fsp.writeFile = real; }
  assert.strictEqual(await snap(), before);
});
