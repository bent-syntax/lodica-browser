'use strict';
// Firebase Cloud Messaging sender (HTTP v1) with no dependencies. Needs a Firebase service account JSON at
// LODICA_FCM_SERVICE_ACCOUNT; without it push is off and clients keep polling.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const PATH = process.env.LODICA_FCM_SERVICE_ACCOUNT || '/etc/lodica-relay/fcm-service-account.json';
let acct = null, tok = null, tokExp = 0;
try { acct = JSON.parse(fs.readFileSync(PATH, 'utf8')); if (!acct.private_key || !acct.client_email || !acct.project_id) acct = null; } catch { acct = null; }

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function post(host, path, headers, data) {
  return new Promise((resolve, reject) => {
    const r = https.request({ host, path, method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(data) }, timeout: 10000 }, (res) => {
      let s = ''; res.on('data', (c) => { if (s.length < 20000) s += c; }); res.on('end', () => resolve([res.statusCode, s]));
    });
    r.on('error', reject); r.on('timeout', () => r.destroy(new Error('timeout')));
    r.end(data);
  });
}

async function token() {
  if (tok && Date.now() < tokExp - 60e3) return tok;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: acct.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), acct.private_key).toString('base64url');
  const [st, resp] = await post('oauth2.googleapis.com', '/token', { 'content-type': 'application/x-www-form-urlencoded' },
    'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig);
  const j = st === 200 ? JSON.parse(resp) : null;
  if (!j) throw new Error('fcm auth ' + st);
  tok = j.access_token; tokExp = Date.now() + (j.expires_in || 3600) * 1000;
  return tok;
}

/** Sends a data-only message so the app decides what to show. Resolves false when the token is dead. */
async function send(deviceToken, data) {
  if (!acct || !deviceToken) return true;
  try {
    const [st, resp] = await post('fcm.googleapis.com', '/v1/projects/' + acct.project_id + '/messages:send',
      { 'content-type': 'application/json', authorization: 'Bearer ' + (await token()) },
      JSON.stringify({ message: { token: deviceToken, data, android: { priority: 'HIGH' } } }));
    return !(st === 404 || (st === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(resp)));
  } catch { return true; }
}

module.exports = { send, enabled: () => !!acct };
