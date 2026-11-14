'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { cfg } = require('../src/config');
const { search } = require('../src/search');

// Fake SearXNG: the plain call returns only Wikipedia, brave works, bing hangs, google errors.
const asked = [];
const fake = http.createServer((req, res) => {
  const e = new URL(req.url, 'http://x').searchParams.get('engines');
  asked.push(e);
  if (e === 'bing') return;
  if (e === 'google') { res.statusCode = 503; return res.end(); }
  const wiki = { url: 'https://en.wikipedia.org/wiki/Test', title: 'W' };
  const results = e === 'brave' ? [{ url: 'https://a.example/1', title: 'A' }, { url: 'https://a.example/2', title: 'B' }, wiki] : [wiki];
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ results }));
});

test('thin result is topped up per engine, hung or failing engines ignored', async (t) => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  t.after(() => { fake.closeAllConnections(); fake.close(); });
  cfg.searxUrl = 'http://127.0.0.1:' + fake.address().port;
  cfg.searchTimeoutMs = 500;
  const out = await search(new URL('http://r/search?q=retrytest'));
  assert.deepStrictEqual(out.results.map((x) => x.u), ['https://en.wikipedia.org/wiki/Test', 'https://a.example/1', 'https://a.example/2']);
  assert.ok(asked.includes('brave') && asked.includes('bing'));
});

test('an empty answer is not memoized, so the next search asks again', async (t) => {
  let hits = 0, results = [];
  const s = http.createServer((req, res) => { hits++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ results })); });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => { s.closeAllConnections(); s.close(); });
  cfg.searxUrl = 'http://127.0.0.1:' + s.address().port;
  const first = await search(new URL('http://r/search?q=emptymemo'));
  assert.strictEqual(first.results.length, 0);
  await new Promise((r) => setImmediate(r));
  const before = hits;
  results = [{ url: 'https://b.example/1', title: 'B' }];
  const second = await search(new URL('http://r/search?q=emptymemo'));
  assert.ok(hits > before);
  assert.strictEqual(second.results[0].u, 'https://b.example/1');
});
