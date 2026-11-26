'use strict';
// Run: node test/chatpersist.test.js   Chat must survive a relay restart (an update restarts the relay).
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const store = process.env.LODICA_CHAT_STORE || path.join(os.tmpdir(), 'lodica-chat-persist-' + process.pid + '.json');
process.env.LODICA_CHAT_STORE = process.env.LODICA_CHAT_STORE || store;
process.env.LODICA_CHATFILE_DIR = path.join(os.tmpdir(), 'lodica-chatfile-persist-' + process.pid);
const { spawnSync } = require('child_process');

if (process.argv[2] === 'child') {
  const chat = require('../src/chat');
  chat.load();
  const out = { sent: [], got: null };
  const h = {
    sendJson: (req, res, s, o) => res.push(o), sendText: (req, res, s, t) => res.push(t),
    readBody: async (req) => Buffer.from(JSON.stringify(req.body)),
  };
  (async () => {
    if (process.argv[3] === 'write') {
      await chat.post({ body: { name: 'Ann', text: 'hello after update', room: '' } }, [], '9.9.9.9', h);
      chat.save();
    } else {
      const res = [];
      chat.get({ headers: {} }, { writeHead() {}, end(b) { res.push(b); } }, new URL('http://x/api/chat?after=0'), {
        sendJson: (rq, rs, s, o) => res.push(o), sendText: () => {},
      });
      console.log(JSON.stringify(res[0]?.messages?.map((m) => m.text)));
    }
    process.exit(0);
  })();
} else {
  const run = (mode) => spawnSync(process.execPath, [__filename, 'child', mode], { env: process.env, encoding: 'utf8' });
  run('write');
  assert.ok(fs.existsSync(store), 'chat saved to disk');
  assert.strictEqual(fs.statSync(store).mode & 0o077, 0, 'chat file is private');
  const second = run('read');
  assert.deepStrictEqual(JSON.parse(second.stdout.trim().split('\n').pop()), ['hello after update'], 'message restored after a restart');
  fs.rmSync(store, { force: true });
  console.log('chat persist ok');
}
