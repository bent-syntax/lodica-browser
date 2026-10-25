// Lodica <-> Claude Code bridge. Runs inside Termux, started by Lodica through RUN_COMMAND as
//   node -e <this file> <token> <port> <system prompt>
// Listens on 127.0.0.1 only. One JSON line in, one JSON line out:
//   {token, prompt} -> {text} | {error}     {token, ping: true} -> {ok: true}
// Keeps one Claude Code process warm (small model, no tools) and replaces it after every answer,
// so no conversation history builds up between requests.
const net = require('net');
const { spawn } = require('child_process');

const [token, port, system] = process.argv.slice(1);
const BIN = '/data/data/com.termux/files/usr/bin';
// The npm package has no Android native binary since 2.1.113, so Termux uses the last JS release.
// Run its cli.js through this node directly: a background RUN_COMMAND may lack termux-exec,
// which the #!/usr/bin/env shebang needs.
const CLI = '/data/data/com.termux/files/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js';
const fs = require('fs');
const IDLE_EXIT_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_MS = 60 * 1000;

let proc = null;
let pending = null; // {resolve, timer}
let buf = '';
let queue = Promise.resolve();
let idle = null;

function warm() {
  if (proc) return;
  const env = Object.assign({}, process.env, {
    PATH: BIN + ':' + (process.env.PATH || ''),
    MAX_THINKING_TOKENS: '0',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '2000',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  });
  const [cmd, pre] = fs.existsSync(CLI) ? [process.execPath, [CLI]] : [BIN + '/claude', []];
  proc = spawn(cmd, [...pre,
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--model', 'haiku', '--system-prompt', system, '--tools', '',
    '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
  ], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  buf = '';
  const me = proc;
  proc.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.type === 'result') finish(m.is_error ? { error: String(m.result || 'error'), usage: m.usage } : { text: String(m.result || ''), usage: m.usage });
    }
  });
  proc.on('exit', () => {
    if (proc === me) proc = null;
    finish({ error: 'Claude Code stopped. Is it installed and signed in?' });
  });
  proc.on('error', () => { if (proc === me) proc = null; finish({ error: 'Claude Code could not start. Is it installed?' }); });
  proc.stdin.on('error', () => {});
}

function finish(r) {
  if (!pending) return;
  const p = pending; pending = null;
  clearTimeout(p.timer);
  p.resolve(r);
  // Fresh process for the next question: no history, and the warm-up happens now instead of later.
  if (proc) { const old = proc; proc = null; old.kill(); }
  warm();
}

function ask(prompt) {
  return new Promise(resolve => {
    warm();
    pending = { resolve, timer: setTimeout(() => finish({ error: 'timeout' }), TIMEOUT_MS) };
    proc.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n');
  });
}

function touch() {
  clearTimeout(idle);
  idle = setTimeout(() => { if (proc) proc.kill(); process.exit(0); }, IDLE_EXIT_MS);
}

const server = net.createServer(sock => {
  let input = '';
  sock.setEncoding('utf8');
  sock.on('data', d => {
    input += d;
    if (input.length > 8192) return sock.destroy();
    const i = input.indexOf('\n');
    if (i < 0) return;
    let req; try { req = JSON.parse(input.slice(0, i)); } catch (e) { return sock.destroy(); }
    if (!req || req.token !== token) return sock.destroy();
    touch();
    if (req.ping) return sock.end(JSON.stringify({ ok: true }) + '\n');
    const prompt = String(req.prompt || '').slice(0, 2000);
    queue = queue.then(() => ask(prompt)).then(r => { sock.end(JSON.stringify(r) + '\n'); });
  });
  sock.on('error', () => {});
});
server.on('error', () => process.exit(1)); // port taken: another bridge is already running
server.listen(Number(port), '127.0.0.1', () => { touch(); warm(); });
