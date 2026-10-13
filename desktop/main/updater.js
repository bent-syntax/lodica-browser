// Update check for the private repositories. The relay holds the GitHub credential;
// this module only talks to the relay with the existing bearer token.
// Flow: check -> download (streamed, SHA-256 verified) -> install (Windows runs the
// setup, Linux reveals the AppImage).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

let ui = null;
let env = null; // { api, token, version, platform, dir, available }
let state = { state: "idle" };
let job = null;

function init(deps) {
  ui = deps.ui;
  const { app } = require("electron");
  const relay = require("./relay");
  env = {
    api: relay.API, token: relay.token, available: relay.available, version: app.getVersion(),
    platform: process.platform === "win32" ? "win" : process.platform === "linux" ? "linux" : "",
    dir: () => app.getPath("downloads"),
  };
}

function set(patch, replace) {
  state = replace ? patch : Object.assign({}, state, patch);
  ui?.push("update", state);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const q = () => "?app=desktop&platform=" + env.platform;
const auth = () => ({ Authorization: "Bearer " + env.token });

async function check() {
  if (job) return state;
  if (!env.available) { set({ state: "error", message: "Relay not configured" }, true); return state; }
  if (!env.platform) { set({ state: "error", message: "Updates are not available on this system" }, true); return state; }
  set({ state: "checking" }, true);
  try {
    const r = await fetch(env.api + "/api/update/check" + q() + "&version=" + encodeURIComponent(env.version),
      { headers: auth(), signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (r.status === 503) throw new Error("Updates are not set up on the server yet");
    if (r.status === 404) throw new Error("No release published yet");
    if (r.status !== 200) throw new Error("Server answered " + r.status);
    const i = JSON.parse(text);
    if (!i.newer) set({ state: "latest", version: env.version }, true);
    else set({ state: "available", version: i.version, name: i.name, notes: i.notes, size: i.size, file: i.file, sha256: i.sha256 }, true);
  } catch (e) {
    set({ state: "error", message: e.name === "TimeoutError" ? "Server did not answer" : e.message || "Check failed" }, true);
  }
  return state;
}

function safeName(n) { return String(n || "Lodica-update").replace(/[^\w.\-]/g, "_").slice(0, 120); }

async function download() {
  if (job || state.state !== "available") return state;
  const ctl = new AbortController();
  job = ctl;
  const target = path.join(env.dir(), safeName(state.file));
  const part = target + ".part";
  set({ state: "downloading", received: 0 });
  try {
    const r = await fetch(env.api + "/api/update/download" + q(), { headers: auth(), signal: ctl.signal });
    if (r.status !== 200 || !r.body) throw new Error("Server answered " + r.status);
    const expect = (r.headers.get("x-sha256") || state.sha256 || "").toLowerCase();
    const total = Number(r.headers.get("content-length")) || state.size || 0;
    const hash = crypto.createHash("sha256");
    const out = fs.createWriteStream(part);
    let got = 0, last = 0;
    try {
      for await (const chunk of Readable.fromWeb(r.body)) {
        hash.update(chunk);
        got += chunk.length;
        if (!out.write(chunk)) await new Promise(res => out.once("drain", res));
        const now = Date.now();
        if (now - last > 250) { last = now; set({ received: got, size: total }); }
      }
    } finally { await new Promise(res => out.end(res)); }
    const digest = hash.digest("hex");
    if (!expect) throw new Error("Server sent no checksum; refusing to install");
    if (digest !== expect) throw new Error("Checksum mismatch; file discarded");
    fs.renameSync(part, target);
    set({ state: "ready", path: target, received: got, size: total });
  } catch (e) {
    try { fs.unlinkSync(part); } catch {}
    set(ctl.signal.aborted ? { state: "available", received: 0 } : { state: "error", message: e.message || "Download failed" }, ctl.signal.aborted);
  } finally { job = null; }
  return state;
}

function cancel() { job?.abort(); return true; }

async function install() {
  if (state.state !== "ready" || !state.path || !fs.existsSync(state.path)) return false;
  const { app, shell } = require("electron");
  if (env.platform === "win") {
    const err = await shell.openPath(state.path);
    if (err) { set({ state: "error", message: err }, true); return false; }
    await sleep(800);
    app.quit();
  } else {
    try { fs.chmodSync(state.path, 0o755); } catch {}
    shell.showItemInFolder(state.path);
  }
  return true;
}

module.exports = { init, check, download, cancel, install, status: () => state, _setEnv: e => { env = e; }, _reset: () => { state = { state: "idle" }; job = null; } };
