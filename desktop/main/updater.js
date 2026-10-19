// Update check against the public GitHub releases of bent-syntax/lodica-browser.
// Flow: check -> download (streamed, SHA-256 verified) -> install (Windows runs the
// setup, Linux reveals the AppImage).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

let ui = null;
let env = null; // { api, version, platform, dir }
const REPO = "bent-syntax/lodica-browser";
let state = { state: "idle" };
let job = null;

function init(deps) {
  ui = deps.ui;
  const { app } = require("electron");
  env = {
    api: "https://api.github.com/repos/" + REPO, version: require("../package.json").lodicaVersion || app.getVersion(),
    platform: process.platform === "win32" ? "win" : process.platform === "linux" ? "linux" : "",
    dir: () => app.getPath("downloads"),
  };
}

function set(patch, replace) {
  state = replace ? patch : Object.assign({}, state, patch);
  ui?.push("update", state);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HDR = { Accept: "application/vnd.github+json", "User-Agent": "Lodica-updater" };

function cmp(a, b) {
  const x = String(a).replace(/^v/, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const y = String(b).replace(/^v/, "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

function pick(assets) {
  const re = env.platform === "win" ? /^Lodica-Setup-.*\.exe$/i : /\.AppImage$/i;
  return assets.find(a => re.test(a.name));
}

async function check() {
  if (job) return state;
  if (!env.platform) { set({ state: "error", message: "Updates are not available on this system" }, true); return state; }
  set({ state: "checking" }, true);
  try {
    const r = await fetch(env.api + "/releases/latest", { headers: HDR, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) throw new Error("No release published yet");
    if (r.status !== 200) throw new Error("GitHub answered " + r.status);
    const rel = await r.json();
    const ver = String(rel.tag_name || "").replace(/^v/, "");
    if (!ver || cmp(ver, env.version) <= 0) { set({ state: "latest", version: env.version }, true); return state; }
    const a = pick(rel.assets || []);
    if (!a) throw new Error("This release has no file for this system");
    let sha = String(a.digest || "").replace(/^sha256:/, "").toLowerCase();
    if (!sha) {
      const s = (rel.assets || []).find(x => x.name === a.name + ".sha256");
      if (s) { const t = await (await fetch(s.browser_download_url, { headers: HDR, signal: AbortSignal.timeout(20000) })).text(); sha = (t.match(/[0-9a-f]{64}/i) || [""])[0].toLowerCase(); }
    }
    set({ state: "available", version: ver, name: rel.name || "v" + ver, notes: rel.body || "", size: a.size, file: a.name, url: a.browser_download_url, sha256: sha }, true);
  } catch (e) {
    set({ state: "error", message: e.name === "TimeoutError" ? "GitHub did not answer" : e.message || "Check failed" }, true);
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
    const r = await fetch(state.url, { headers: HDR, signal: ctl.signal, redirect: "follow" });
    if (r.status !== 200 || !r.body) throw new Error("GitHub answered " + r.status);
    const expect = (state.sha256 || "").toLowerCase();
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
    if (!expect) throw new Error("Release has no checksum; refusing to install");
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
