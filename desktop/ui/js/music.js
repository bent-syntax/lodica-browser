"use strict";
// Spotify controls and an all-tab lyrics panel. The panel lives outside the layer stack so switching tabs never closes it.
const MUSIC = { state: null, panel: null, head: null, title: null, error: null, lines: null, lastIndex: -1, lastTrack: "" };

function musicPanel() {
  if (!MUSIC.panel) {
    MUSIC.panel = h("div", { class: "lyrics-panel" });
    MUSIC.title = h("span", { class: "lyrics-title", text: "Spotify is not playing" });
    MUSIC.error = h("div", { class: "lyrics-muted" });
    MUSIC.lines = h("div", { class: "lyrics-lines" });
    MUSIC.panel.append(h("div", { class: "lyrics-head" },
      MUSIC.title,
      h("button", { class: "ib", title: "Open Spotify", text: "♫", act: () => inv("music.play", "") }),
      h("button", { class: "ib", title: "Hide lyrics", text: "✕", act: () => inv("music.toggle") })),
      MUSIC.error, MUSIC.lines);
    document.body.append(MUSIC.panel);
  }
  return MUSIC.panel;
}

function renderMusic(d) {
  const prev = MUSIC.state;
  MUSIC.state = d || null;
  const on = !!(d && d.on);
  if (!on) {
    if (MUSIC.panel) { MUSIC.panel.remove(); MUSIC.panel = null; MUSIC.lastIndex = -1; MUSIC.lastTrack = ""; }
    if (!prev || prev.on) refreshSettings();
    return;
  }
  const p = musicPanel();
  const t = d.track;
  const track = t ? (t.title + "|" + (t.artist || "")) : "";
  const changedTrack = track !== MUSIC.lastTrack;
  MUSIC.lastTrack = track;
  MUSIC.title.textContent = t ? (t.artist ? t.title + " — " + t.artist : t.title) : "Spotify is not playing";
  MUSIC.error.textContent = d.error || "";
  MUSIC.error.style.display = d.error ? "" : "none";

  // Keep the scroll container itself: rebuilding it every four seconds used to reset the user's position.
  const scroll = MUSIC.lines.scrollTop || 0;
  clear(MUSIC.lines);
  const idx = Math.max(-1, Number(d.index) || 0);
  const start = Math.max(0, idx - 2);
  for (let i = start; i < Math.min(d.lines ? d.lines.length : 0, start + 14); i++) {
    const line = d.lines[i];
    MUSIC.lines.append(h("div", { class: "lyrics-line" + (i === idx ? " cur" : "") + (i < idx ? " past" : ""), text: line.text }));
  }
  if (!d.lines || !d.lines.length) MUSIC.lines.append(h("div", { class: "lyrics-muted", text: t ? "No lyrics found for this song" : "Play a song in Spotify to see its lyrics here" }));
  MUSIC.lines.scrollTop = changedTrack ? 0 : scroll;
  if (idx !== MUSIC.lastIndex || changedTrack) {
    const cur = MUSIC.lines.querySelector(".lyrics-line.cur");
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    MUSIC.lastIndex = idx;
  }
  if (!prev || !prev.on) refreshSettings();
}

function openMusic() {
  return sheet({ title: "Spotify", key: "music" }, (b) => {
    const input = h("input", { class: "sp-find", type: "text", placeholder: "Spotify link or song / artist", "aria-label": "Spotify search" });
    const doPlay = async () => {
      const r = await inv("music.play", input.value);
      toast(r && r.ok ? "Opening Spotify" : (r && r.error) || "Could not open Spotify");
    };
    const play = btn("Play in browser", doPlay);
    // h() stores handlers in a WeakMap, so call the extracted function instead of `play.act`.
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doPlay(); } });
    const on = !!(MUSIC.state && MUSIC.state.on);
    const sw = h("span", { class: "sw-t" + (on ? " on" : ""), role: "switch", "aria-checked": on ? "true" : "false" });
    const toggle = h("button", { class: "set-row click", act: async () => {
      const r = await inv("music.toggle");
      const next = r && typeof r === "object" ? !!r.on : !!(MUSIC.state && MUSIC.state.on);
      sw.classList.toggle("on", next);
      sw.setAttribute("aria-checked", next ? "true" : "false");
    } },
      h("div", { class: "main" },
        h("div", { class: "t1", text: "Lyrics on every tab" }),
        h("div", { class: "t2", text: "A small lyric panel follows the song playing in Spotify." })), sw);
    const s = MUSIC.state && MUSIC.state.track;
    b.append(h("div", { class: "row" }, input, play), toggle,
      h("div", { class: "t2", text: s ? "Now playing: " + s.title + (s.artist ? " — " + s.artist : "") : "No Spotify tab playing yet" }),
      h("div", { class: "t2", text: "Open a track, playlist or search in the browser. Lyrics are fetched locally from LRCLIB." }));
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
