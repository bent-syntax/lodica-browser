'use strict';
/* Google Tasks helper. Credentials (client_id, client_secret, refresh_token) are read at runtime from
   ~/.lodica-tasks.json (or LODICA_TASKS_CONFIG). Never logged, never stored in the repo.
   Adds a task to the list titled "lodica"; creates the list when it is missing. */
const fs = require('fs'), os = require('os'), path = require('path');
const API = 'https://tasks.googleapis.com/tasks/v1', TOKEN_URL = 'https://oauth2.googleapis.com/token';
const cfgPath = () => process.env.LODICA_TASKS_CONFIG || path.join(os.homedir(), '.lodica-tasks.json');

function createTasks({ listTitle = 'lodica', fetchFn = fetch, config } = {}) {
  let tok = null, listId = null;
  async function token() {
    if (tok && tok.exp > Date.now() + 60000) return tok.value;
    const c = config || JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    const r = await fetchFn(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('token refresh failed: HTTP ' + r.status);
    const j = await r.json(); tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 }; return tok.value;
  }
  async function call(method, url, body) {
    const r = await fetchFn(url, { method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(method + ' ' + new URL(url).pathname + ': HTTP ' + r.status);
    return r.json();
  }
  async function list() {
    if (listId) return listId;
    let page = '';
    do {
      const j = await call('GET', API + '/users/@me/lists?maxResults=100' + page);
      const hit = (j.items || []).find((l) => (l.title || '').trim().toLowerCase() === listTitle.toLowerCase());
      if (hit) return (listId = hit.id);
      page = j.nextPageToken ? '&pageToken=' + encodeURIComponent(j.nextPageToken) : '';
    } while (page);
    return (listId = (await call('POST', API + '/users/@me/lists', { title: listTitle })).id);
  }
  async function addTask(title, notes) {
    const id = await list();
    return call('POST', API + '/lists/' + id + '/tasks', { title: String(title).slice(0, 1000), notes: String(notes || '').slice(0, 8000) });
  }
  return { addTask, list };
}
module.exports = { createTasks };
