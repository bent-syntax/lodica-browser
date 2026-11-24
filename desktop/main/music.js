"use strict";
// Spotify playback and local lyrics. The web player stays an ordinary Lodica tab; only its window title is read,
// and lyrics come from the public LRCLIB API. Nothing about browsing is sent anywhere else.
const SPOTIFY = /^https:\/\/open\.spotify\.com\//i;
const LRC_TIME = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/;

/** Spotify's web-player title is "Song - Artist | Spotify"; "•" and "by" are also used. */
function parseTrack(title) {
  let s = String(title || "").trim().replace(/\s*\|?\s*Spotify(?:.*)?$/i, "").replace(/^Spotify\s*Web Player:\s*/i, "").trim();
  if (!s || /^Spotify(?:Web Player.*)?$/i.test(s)) return null;
  const m = /^(.{1,120}?)\s+(?:-|–|—|•|\bby\b)\s+(.{1,120})$/i.exec(s);
  const t = m ? m[1].trim() : s, artist = m ? m[2].trim() : "";
  if (!t || t.length > 120 || artist.length > 120) return null;
  return { title: t, artist };
}

/** Accept playlist/track URLs and spotify: links; anything else is a search in the web player. */
function spotifyUrl(input) {
  const s = String(input || "").trim();
  if (!s) return "https://open.spotify.com/";
  if (SPOTIFY.test(s)) return s.slice(0, 1000);
  const uri = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]{22})$/i.exec(s);
  if (uri) return "https://open.spotify.com/" + uri[1].toLowerCase() + "/" + uri[2];
  if (/^https?:\/\//i.test(s)) return ""; // never silently open an arbitrary site as music
  return "https://open.spotify.com/search/" + encodeURIComponent(s.slice(0, 200));
}

function parseLrc(lrc) {
  const out = [];
  for (const raw of String(lrc || "").split(/\r?\n/)) {
    const m = LRC_TIME.exec(raw.trim());
    if (!m) continue;
    const text = m[4].trim();
    if (!text) continue;
    const frac = m[3] ? Number("0." + m[3]) : 0;
    out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: text.slice(0, 300) });
  }
  return out.sort((a, b) => a.time - b.time);
}

const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const plainLines = (text) => String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 200)
  .map(x => ({ time: 0, text: x.slice(0, 300) }));
/** Prefer synced lyrics for a close title/artist match; fall back to plain text. */
function pickLyrics(results, track) {
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) return { lines: [], source: "" };
  const title = norm(track && track.title), artist = norm(track && track.artist);
  const score = (r) => {
    const rt = norm(r.trackName), ra = norm(r.artistName);
    let n = r.syncedLyrics ? 2 : 0;
    if (rt && title && (rt === title || rt.includes(title) || title.includes(rt))) n += 4;
    if (ra && artist && (ra === artist || ra.includes(artist) || artist.includes(ra))) n += 3;
    return n;
  };
  const best = rows.slice().sort((a, b) => score(b) - score(a))[0] || {};
  const synced = parseLrc(best.syncedLyrics);
  return synced.length
    ? { lines: synced, source: "synced" }
    : { lines: plainLines(best.plainLyrics), source: "plain" };
}

function lineAt(lines, seconds) {
  let idx = -1;
  const t = Math.max(0, Number(seconds) || 0);
  for (let i = 0; i < lines.length; i++) if (lines[i].time <= t) idx = i; else break;
  return idx;
}

let ctx = null, timer = null, interval = 4000;
const state = { on: false, track: null, lines: [], index: -1, source: "", position: 0, playing: false, error: "" };
let trackKey = "", since = 0, busy = false;

function emit() {
  if (!ctx || !ctx.ui) return;
  ctx.ui.push("music", { ...state, lines: state.lines.slice(0, 80) });
}

/** Poll only while the lyrics toggle is on: a disabled feature never reads titles or calls LRCLIB. */
function scheduleTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  if (!ctx || !state.on) return;
  timer = setInterval(() => { tick().catch(() => {}); }, interval);
  if (timer.unref) timer.unref();
}

function setOn(on) {
  const v = !!on;
  const changed = state.on !== v;
  state.on = v;
  if (!v) { trackKey = ""; state.track = null; state.lines = []; state.index = -1; state.playing = false; state.error = ""; }
  if (ctx && ctx.prefs && ctx.prefs.p.musicLyrics !== v) ctx.prefs.set("musicLyrics", v);
  scheduleTimer();
  emit();
  return { on: v, changed };
}

async function loadLyrics(track, key) {
  if (!ctx || !ctx.fetch) return;
  const q = "track_name=" + encodeURIComponent(track.title.slice(0, 120)) +
    (track.artist ? "&artist_name=" + encodeURIComponent(track.artist.slice(0, 120)) : "");
  try {
    const r = await ctx.fetch("https://lrclib.net/api/search?" + q, {
      headers: {
        "User-Agent": "Lodica-Browser/1.0 (local lyrics)",
        "Lrclib-Client": "Lodica Browser 1.21.0 (https://github.com/bent-syntax/lodica-browser)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r || !r.ok) throw new Error("lyrics service unavailable");
    const picked = pickLyrics(await r.json(), track);
    if (key !== trackKey || !state.on) return; // the song changed while the request was in flight
    state.lines = picked.lines; state.source = picked.source; state.error = "";
  } catch {
    if (key !== trackKey || !state.on) return;
    state.lines = []; state.source = ""; state.error = "Lyrics are unavailable right now";
  }
}

function spotifyTab() {
  if (!ctx || !ctx.tabs) return null;
  // Never read the title of a private tab: it may be someone else's music or a private session.
  return ctx.tabs.open().find((t) => !t.private && SPOTIFY.test(t.url || "")) || null;
}

async function tick() {
  if (!ctx || !state.on || busy) return;
  const tab = spotifyTab();
  const wc = tab && ctx.tabs.wcOf(tab);
  let title = "";
  try { if (wc && !wc.isDestroyed()) title = String(await wc.executeJavaScript("document.title", true) || "").slice(0, 300); } catch {}
  const track = parseTrack(title);
  state.playing = !!track;
  if (!track) {
    if (trackKey) { trackKey = ""; state.track = null; state.lines = []; state.index = -1; emit(); }
    return;
  }
  const key = norm(track.title) + "|" + norm(track.artist);
  if (key !== trackKey) {
    trackKey = key; since = ctx.now(); state.track = track; state.index = -1; state.lines = [];
    emit();
    busy = true;
    try { await loadLyrics(track, key); } finally { busy = false; }
  }
  state.position = Math.max(0, Math.floor((ctx.now() - since) / 1000));
  state.index = lineAt(state.lines, state.position);
  emit();
}

function play(input) {
  if (!ctx || !ctx.tabs) return { ok: false, error: "Music is not ready" };
  const url = spotifyUrl(input);
  if (!url) return { ok: false, error: "Enter a Spotify link, a spotify: URI or a search" };
  const tab = spotifyTab();
  if (tab) {
    if (tab.url !== url) ctx.tabs.load(url, tab);
    ctx.tabs.select(tab.id);
  } else ctx.tabs.create({ url });
  return { ok: true, url };
}

function init({ tabs, ui, prefs, fetch, interval: ms = 4000, now = Date.now } = {}) {
  if (!tabs || !ui) return;
  stop();
  interval = ms;
  ctx = { tabs, ui, prefs, fetch, now };
  state.on = !!(prefs && prefs.p && prefs.p.musicLyrics);
  if (!state.on) { trackKey = ""; state.track = null; state.lines = []; state.index = -1; }
  emit();
  scheduleTimer();
}

function stop() { if (timer) clearInterval(timer); timer = null; }
function current() { return { ...state, lines: state.lines.slice(0, 80) }; }

module.exports = { init, stop, play, current, setOn, tick, parseTrack, spotifyUrl, parseLrc, pickLyrics, lineAt };
