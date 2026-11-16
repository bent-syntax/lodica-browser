'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { cfg } = require('../src/config');
const { search } = require('../src/search');
const { parseDdg, parseMojeek } = require('../src/websearch');

// No live DuckDuckGo or Mojeek calls from tests; the direct path gets its own fake below.
cfg.directSearch = false;

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

test('nothing in the asked language: ask again with any language', async (t) => {
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x').searchParams;
    const results = u.get('engines') === 'bing' && u.get('language') === 'all' ? [{ url: 'https://b.example/1', title: 'B' }] : [];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ results }));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => { s.closeAllConnections(); s.close(); });
  cfg.searxUrl = 'http://127.0.0.1:' + s.address().port;
  const out = await search(new URL('http://r/search?q=langretry&l=nl'));
  assert.deepStrictEqual(out.results.map((x) => x.u), ['https://b.example/1']);
});

test('Wikipedia-only answers still ask each web engine (they do not count as results)', async (t) => {
  const engines = [];
  const s = http.createServer((req, res) => {
    const e = new URL(req.url, 'http://x').searchParams.get('engines');
    engines.push(e);
    const wiki = [{ url: 'https://en.wikipedia.org/wiki/Banana', title: 'Banana' }, { url: 'https://www.wikidata.org/wiki/Q503', title: 'Q' },
      { url: 'https://nl.wikipedia.org/wiki/Banaan', title: 'Banaan' }];
    const results = e === 'mojeek' ? [{ url: 'https://fruit.example/banana', title: 'Bananas' }] : e ? [] : wiki;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ results, infoboxes: e ? [] : [{ infobox: 'Banana', content: 'A fruit', id: 'https://en.wikipedia.org/wiki/Banana' }] }));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => { s.closeAllConnections(); s.close(); });
  cfg.searxUrl = 'http://127.0.0.1:' + s.address().port;
  const out = await search(new URL('http://r/search?q=bananawiki'));
  assert.ok(engines.includes('mojeek'));
  assert.ok(out.results.some((x) => x.u === 'https://fruit.example/banana'));
  assert.strictEqual(out.box.t, 'Banana');
});

test('every SearXNG engine blocked: DuckDuckGo and Mojeek pages are used directly', async (t) => {
  const searx = http.createServer((req, res) => { res.statusCode = 503; res.end(); });
  const pages = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.method === 'POST') return res.end('<div><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fd.example%2Fx&amp;rut=1">D &amp; co</a>'
      + '<a class="result__snippet" href="#">About <b>d</b></a></div>');
    res.end('<ul><li><h2><a class="title" href="https://m.example/y">M</a></h2><p class="s">Snip &#39;m&#39;</p></li></ul>');
  });
  await Promise.all([searx, pages].map((x) => new Promise((r) => x.listen(0, '127.0.0.1', r))));
  t.after(() => { for (const x of [searx, pages]) { x.closeAllConnections(); x.close(); } cfg.directSearch = false; });
  cfg.searxUrl = 'http://127.0.0.1:' + searx.address().port;
  cfg.ddgUrl = 'http://127.0.0.1:' + pages.address().port + '/html/';
  cfg.mojeekUrl = 'http://127.0.0.1:' + pages.address().port + '/search';
  cfg.directSearch = true;
  const out = await search(new URL('http://r/search?q=allblocked'));
  assert.deepStrictEqual(out.results.map((x) => [x.u, x.t, x.c]), [['https://d.example/x', 'D & co', 'About d'], ['https://m.example/y', 'M', "Snip 'm'"]]);
});

test('page parsers skip ads and bad links', () => {
  assert.deepStrictEqual(parseDdg('<a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a><a class="result__a" href="javascript:x">J</a>'), []);
  assert.deepStrictEqual(parseMojeek('<a class="title" href="/rel">R</a>'), []);
});
