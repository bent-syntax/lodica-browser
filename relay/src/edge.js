'use strict';
// Optional port-443 front door for networks that block the relay's own ports. It reads only the
// TLS SNI name (no decryption) and passes the raw connection on:
//   lodica.<domain> -> the relay API, tunnel.<domain> -> the relay proxy, anything else -> the
//   web server that used to own 443 (Caddy, moved to a loopback-reachable port).
const net = require('net');
const { cfg } = require('./config');

const MAX_HELLO = 16384 + 5;

// Returns the SNI host, '' (no SNI), or null when more bytes are needed.
function parseSni(b) {
  if (b.length < 5) return null;
  if (b[0] !== 0x16) return '';
  const recLen = b.readUInt16BE(3);
  if (b.length < 5 + recLen) return null;
  try {
    let p = 5;
    if (b[p] !== 1) return '';
    p += 4 + 2 + 32;
    p += 1 + b[p];
    p += 2 + b.readUInt16BE(p);
    p += 1 + b[p];
    const end = p + 2 + b.readUInt16BE(p);
    p += 2;
    while (p + 4 <= end) {
      const type = b.readUInt16BE(p), len = b.readUInt16BE(p + 2);
      p += 4;
      if (type === 0) {
        const nameLen = b.readUInt16BE(p + 3);
        return b.toString('latin1', p + 5, p + 5 + nameLen).toLowerCase();
      }
      p += len;
    }
  } catch { /* malformed hello */ }
  return '';
}

function start(log) {
  const routes = new Map();
  if (cfg.edgeApiHost) routes.set(cfg.edgeApiHost, cfg.apiPort);
  if (cfg.edgeTunnelHost) routes.set(cfg.edgeTunnelHost, cfg.proxyPort);

  const server = net.createServer((client) => {
    client.on('error', () => {});
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => client.destroy(), 10e3);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const sni = parseSni(buf);
      if (sni === null && buf.length < MAX_HELLO) return;
      client.removeListener('data', onData);
      client.pause();
      clearTimeout(timer);
      const port = routes.get(sni) || cfg.edgeFallbackPort;
      const up = net.connect({ host: '127.0.0.1', port });
      up.on('error', () => client.destroy());
      client.on('close', () => up.destroy());
      up.on('close', () => client.destroy());
      up.on('connect', () => {
        up.write(buf);
        client.pipe(up); up.pipe(client);
        client.resume();
      });
    };
    client.on('data', onData);
  });
  server.listen({ host: '::', port: cfg.edgePort, ipv6Only: false }, () =>
    log(`edge: listening on [::]:${cfg.edgePort}, fallback 127.0.0.1:${cfg.edgeFallbackPort}`));
  return server;
}

module.exports = { start, parseSni };
