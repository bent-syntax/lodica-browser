"use strict";
// YouTube ads. The shared block lists stop the ad servers, but YouTube also sends its ads inside the player data, so this
// preload (registered per session in main.js) runs a script in the page itself, before YouTube's own scripts:
//   1. it removes the ad entries from the player data (ytInitialPlayerResponse, JSON.parse, fetch and Response.json),
//   2. it hides the ad slots and banners,
//   3. when an ad still plays, it skips it, or mutes it and runs it to the end at once.
// Sites on the allow lists (Settings) are left alone.
const { ipcRenderer, webFrame } = require("electron");

if (/(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(location.hostname) && /^https?:$/.test(location.protocol)) {
  let on = true;
  try { on = ipcRenderer.sendSync("lodica-adblock", location.hostname) !== false; } catch (e) { /* keep blocking */ }
  if (on) webFrame.executeJavaScript("(" + inPage.toString() + ")()").catch(() => {});
}

// Runs in the page, not here: it only uses what the page has.
function inPage() {
  if (window.__lodicaYtAds) return;
  window.__lodicaYtAds = true;
  const KEYS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
  const prune = (o) => {
    try {
      if (o && typeof o === "object") {
        for (const k of KEYS) if (k in o) delete o[k];
        if (o.playerResponse && typeof o.playerResponse === "object") prune(o.playerResponse);
        if (Array.isArray(o.response)) o.response.forEach(prune); else if (o.response && typeof o.response === "object") prune(o.response);
      }
    } catch (e) { /* frozen object */ }
    return o;
  };
  // The first player data sits in the page itself.
  let first;
  try {
    Object.defineProperty(window, "ytInitialPlayerResponse", { configurable: true, get() { return first; }, set(v) { first = prune(v); } });
  } catch (e) { /* already defined */ }
  // Later player data comes from JSON.parse and from fetch.
  const parse = JSON.parse;
  JSON.parse = function () { return prune(parse.apply(this, arguments)); };
  const json = Response.prototype.json;
  Response.prototype.json = function () { return json.apply(this, arguments).then(prune); };

  const style = document.createElement("style");
  style.textContent = "#masthead-ad,#player-ads,ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer," +
    "ytd-display-ad-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytd-companion-slot-renderer,.ytp-ad-overlay-container,.ytp-ad-module," +
    "ytd-engagement-panel-section-list-renderer[target-id=engagement-panel-ads]{display:none!important}";
  // This runs before the page has a root element: adding the style to the document then would make it the root.
  const addStyle = () => { if (!document.documentElement) return false; document.documentElement.appendChild(style); return true; };
  if (!addStyle()) {
    const wait = new MutationObserver(() => { if (addStyle()) wait.disconnect(); });
    wait.observe(document, { childList: true });
  }

  // An ad that still gets through: press Skip, or mute it and jump to its end.
  let muted = null;
  setInterval(() => {
    const player = document.querySelector(".html5-video-player");
    const video = player && player.querySelector("video");
    if (player && video && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) {
      if (muted === null) muted = video.muted;
      video.muted = true;
      if (isFinite(video.duration) && video.duration > 0) { video.playbackRate = 16; video.currentTime = Math.max(0, video.duration - 0.1); }
      const skip = player.querySelector(".ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern");
      if (skip) skip.click();
    } else if (muted !== null && video) {
      video.muted = muted; video.playbackRate = 1; muted = null;
    }
  }, 250);
}
