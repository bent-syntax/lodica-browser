'use strict';
// Spotify playback + local lyrics: pure parsing, LRC syncing and the main-process state machine. No network or Electron.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const music = require('../main/music');

assert.deepStrictEqual(music.parseTrack('Around The World - Daft Punk | Spotify'), { title: 'Around The World', artist: 'Daft Punk' });
assert.deepStrictEqual(music.parseTrack('Song Name • Artist Name | Spotify Web Player: Music for everyone'), { title: 'Song Name', artist: 'Artist Name' });
assert.deepStrictEqual(music.parseTrack('No Artist Here | Spotify'), { title: 'No Artist Here', artist: '' });
assert.strictEqual(music.parseTrack('Spotify'), null);
assert.strictEqual(music.parseTrack('Spotify Web Player: Music for everyone'), null);
assert.strictEqual(music.parseTrack(''), null);

assert.strictEqual(music.spotifyUrl('https://open.spotify.com/track/1234567890123456789012'), 'https://open.spotify.com/track/1234567890123456789012');
assert.strictEqual(music.spotifyUrl('spotify:track:1234567890123456789012'), 'https://open.spotify.com/track/1234567890123456789012');
assert.strictEqual(music.spotifyUrl('Daft Punk'), 'https://open.spotify.com/search/Daft%20Punk');
assert.strictEqual(music.spotifyUrl(''), 'https://open.spotify.com/');
assert.strictEqual(music.spotifyUrl('spotify:TRACK:1234567890123456789012'), 'https://open.spotify.com/track/1234567890123456789012');
assert.strictEqual(music.spotifyUrl('https://evil.example.com'), '');

const lrc = '[00:00.00]First line\n[00:12.50]Second line\n[01:03.20]Third line\nnot a line\n';
const lines = music.parseLrc(lrc);
assert.strictEqual(lines.length, 3);
assert.strictEqual(lines[0].time, 0);
assert.strictEqual(lines[1].text, 'Second line');
assert.strictEqual(music.lineAt(lines, 0), 0);
assert.strictEqual(music.lineAt(lines, 12), 0);
assert.strictEqual(music.lineAt(lines, 13), 1);
assert.strictEqual(music.lineAt(lines, 500), 2);

const picked = music.pickLyrics([
  { trackName: 'Other', artistName: 'Someone', plainLyrics: 'Wrong' },
  { trackName: 'Around The World', artistName: 'Daft Punk', syncedLyrics: lrc },
], { title: 'Around The World', artist: 'Daft Punk' });
assert.strictEqual(picked.source, 'synced');
assert.strictEqual(picked.lines[1].text, 'Second line');
const plain = music.pickLyrics([{ trackName: 'X', plainLyrics: 'First plain\nSecond plain' }], { title: 'X' });
assert.strictEqual(plain.source, 'plain');
assert.deepStrictEqual(plain.lines.map(l => l.text), ['First plain', 'Second plain']);
assert.strictEqual(music.pickLyrics([], {}).lines.length, 0);

(async () => {
  let now = 1000, title = 'Around The World - Daft Punk | Spotify';
  const pushes = [], created = [], loaded = [], selected = [], titleReads = [], fetchCalls = [];
  let nowPlaying = false, fetchImpl = null;
  const wc = { isDestroyed: () => false, executeJavaScript: async () => { titleReads.push(title); return title; } };
  const tab = { id: 'spotify', url: 'https://open.spotify.com/search/Daft%20Punk', view: { webContents: wc } };
  const tabs = {
    open: () => nowPlaying ? [tab] : [],
    wcOf: (t) => t === tab ? wc : null,
    create: (o) => { created.push(o); nowPlaying = true; tab.url = o.url; },
    load: (u, t) => { loaded.push(u); t.url = u; },
    select: (id) => selected.push(id),
  };
  const ui = { push: (ev, d) => pushes.push({ ev, d }) };
  const prefs = { p: { musicLyrics: false }, set(k, v) { this.p[k] = v; } };
  const fakeFetch = async (url) => {
    fetchCalls.push(url);
    return { ok: true, json: async () => [{ trackName: 'Around The World', artistName: 'Daft Punk', syncedLyrics: lrc }] };
  };
  fetchImpl = fakeFetch;
  music.init({ tabs, ui, prefs, fetch: (u, o) => fetchImpl(u, o), interval: 100000, now: () => now });
  assert.deepStrictEqual(pushes.pop().d.on, false);

  // Off by default: playing Spotify must not read a title or call LRCLIB.
  assert.strictEqual(music.play('Daft Punk').ok, true);
  assert.deepStrictEqual(created, [{ url: 'https://open.spotify.com/search/Daft%20Punk' }]);
  await music.tick();
  assert.strictEqual(titleReads.length, 0);
  assert.strictEqual(fetchCalls.length, 0);
  assert.strictEqual(music.current().playing, false);

  // Turning it on starts polling and fetches lyrics once for the track.
  const on = music.setOn(true);
  assert.deepStrictEqual(on, { on: true, changed: true });
  assert.strictEqual(prefs.p.musicLyrics, true);
  await music.tick();
  let s = music.current();
  assert.strictEqual(s.playing, true);
  assert.strictEqual(s.track.title, 'Around The World');
  assert.strictEqual(s.lines.length, 3);
  assert.strictEqual(s.index, 0);
  assert.ok(fetchCalls.some(u => u.includes('lrclib.net')));

  now += 14000;
  await music.tick();
  assert.strictEqual(music.current().index, 1);
  assert.strictEqual(fetchCalls.length, 1, 'lyrics are fetched once per track, not on every poll');

  // A private Spotify tab is never inspected, even while the toggle is on.
  tab.private = true;
  const readsBefore = titleReads.length;
  await music.tick();
  assert.strictEqual(titleReads.length, readsBefore);
  assert.strictEqual(music.current().track, null);
  tab.private = false;

  // A request still in flight must not write stale lyrics after the feature is turned off.
  let release;
  fetchImpl = async () => {
    fetchCalls.push('slow');
    return new Promise((ok) => { release = () => ok({ ok: true, json: async () => [{ trackName: 'Around The World', syncedLyrics: lrc }] }); });
  };
  const inFlight = music.tick();
  await new Promise(r => setImmediate(r));
  assert.strictEqual(fetchCalls.length, 2);
  music.setOn(false);
  release();
  await inFlight;
  assert.strictEqual(music.current().lines.length, 0);
  const readsOff = titleReads.length;
  await music.tick();
  assert.strictEqual(titleReads.length, readsOff, 'off means no title reads, no network');
  assert.strictEqual(fetchCalls.length, 2);
  assert.deepStrictEqual(music.setOn(false), { on: false, changed: false });

  // The same Spotify tab is reused for the next search.
  music.play('https://open.spotify.com/track/1234567890123456789012');
  assert.deepStrictEqual(loaded, ['https://open.spotify.com/track/1234567890123456789012']);
  assert.deepStrictEqual(selected, ['spotify']);
  assert.strictEqual(created.length, 1);

  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const js = read('ui/js/music.js');
  assert.ok(js.includes('document.body.append(MUSIC.panel)'));
  assert.ok(js.includes('inv("music.toggle")') && js.includes('inv("music.play"'));
  assert.ok(!js.includes('play.act()'), 'Enter uses the extracted handler, not a WeakMap-only .act property');
  assert.ok(js.includes('r && typeof r === "object" ? !!r.on'), 'the switch follows main\'s returned state');
  assert.ok(read('main/commands.js').includes('music: music.current()'));
  assert.ok(read('ui/js/main.js').includes('renderMusic(r.music)'));
  assert.ok(read('main/music.js').includes('!t.private'));
  assert.ok(read('ui/ui.css').includes('z-index:55'));
  assert.ok(read('ui/index.html').includes('js/music.js'));
  assert.ok(read('main/commands.js').includes('on("music.play"'));
  music.stop();
  console.log('spotify lyrics ok');
})().catch(e => { console.error(e); process.exitCode = 1; });
