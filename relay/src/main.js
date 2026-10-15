'use strict';
const { cfg, loadToken } = require('./config');
const api = require('./api');
const proxy = require('./proxy');
const edge = require('./edge');

const log = (msg) => console.log(msg);   // journald adds timestamps

loadToken();
setInterval(() => {
  try { loadToken(); } catch (e) { log('token reload failed: ' + e.message); }
}, 3600e3).unref();

const apiServer = api.start(log);
const proxyServer = proxy.start(log);
const edgeServer = cfg.edgePort ? edge.start(log) : null;

// Counters only; never hostnames, IPs or tokens.
function logStats() {
  log('stats proxy ' + JSON.stringify(proxy.stats) + ' api ' + JSON.stringify(api.stats));
}
setInterval(logStats, cfg.statsMs).unref();

let stopping = false;
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log(`${sig}: shutting down`);
  logStats();
  apiServer.close();
  proxyServer.close();
  if (edgeServer) edgeServer.close();
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => { log('uncaught: ' + (e && e.stack ? e.stack.split('\n')[0] : e)); process.exit(1); });
