// Update check against the public GitHub releases of bent-syntax/lodica-browser.
// Flow: check -> download (streamed, SHA-256 verified) -> install. On Windows the install follows the download by itself: the
// setup runs silently (no wizard), Lodica stays open with a progress bar, and the setup closes it and starts the new version.
// A portable copy and Linux keep the manual step (the setup opens, the AppImage is revealed).
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
    beta: () => { const { p } = require("./prefs"); return !!(p.betaUnlocked && p.betaEnabled); },
  };
}

function set(patch, replace) {
  state = replace ? patch : Object.assign({}, state, patch);
  ui?.push("update", state);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HDR = { Accept: "application/vnd.github+json", "User-Agent": "Lodica-updater" };

// A "-beta.N" suffix sorts below the same version without one.
function parse(v) {
  const t = String(v).replace(/^v/, "");
  const [core, pre] = [t.split("-")[0], t.includes("-") ? t.slice(t.indexOf("-") + 1) : null];
  return { n: core.split(".").map(n => parseInt(n, 10) || 0), pre: pre === null ? Infinity : parseInt((pre.match(/\d+/) || ["0"])[0], 10) };
}
function cmp(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) { const d = (x.n[i] || 0) - (y.n[i] || 0); if (d) return d; }
  return x.pre === y.pre ? 0 : x.pre < y.pre ? -1 : 1;
}

function pick(assets) {
  const re = env.platform === "win" ? /^Lodica-Setup-.*\.exe$/i : /\.AppImage$/i;
  return assets.find(a => re.test(a.name));
}

// Turns a release into the "available" state. Used for updates and for rollbacks.
async function offer(rel, ver) {
  const a = pick(rel.assets || []);
  if (!a) throw new Error("This release has no file for this system");
  let sha = String(a.digest || "").replace(/^sha256:/, "").toLowerCase();
  if (!sha) {
    const s = (rel.assets || []).find(x => x.name === a.name + ".sha256");
    if (s) { const t = await (await fetch(s.browser_download_url, { headers: HDR, signal: AbortSignal.timeout(20000) })).text(); sha = (t.match(/[0-9a-f]{64}/i) || [""])[0].toLowerCase(); }
  }
  set({ state: "available", version: ver, name: rel.name || "v" + ver, notes: rel.body || "", size: a.size, file: a.name, url: a.browser_download_url, sha256: sha, older: cmp(ver, env.version) < 0 }, true);
}

// Older releases the user can go back to. Betas only show when beta mode is on.
async function versions() {
  if (!env?.platform) return [];
  try {
    const r = await fetch(env.api + "/releases?per_page=50", { headers: HDR, signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) return [];
    const beta = !!(env.beta && env.beta());
    return (await r.json()).filter(x => x && !x.draft && x.tag_name && (beta || !x.prerelease) && pick(x.assets || []))
      .sort((a, b) => cmp(b.tag_name, a.tag_name))
      .map(x => ({ tag: x.tag_name, name: x.name || x.tag_name, date: x.published_at || "", current: cmp(x.tag_name, env.version) === 0 }));
  } catch { return []; }
}

// Picks any listed release (older or newer) as the next download.
async function pickVersion(tag) {
  if (job || !/^v?[\w.\-]{1,40}$/.test(String(tag))) return state;
  set({ state: "checking" }, true);
  try {
    const r = await fetch(env.api + "/releases/tags/" + encodeURIComponent(tag), { headers: HDR, signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) throw new Error("GitHub answered " + r.status);
    await offer(await r.json(), String(tag).replace(/^v/, ""));
  } catch (e) {
    set({ state: "error", message: e.message || "Could not load that version" }, true);
  }
  return state;
}

async function check() {
  if (job) return state;
  if (!env.platform) { set({ state: "error", message: "Updates are not available on this system" }, true); return state; }
  set({ state: "checking" }, true);
  try {
    const beta = !!(env.beta && env.beta());
    const r = await fetch(env.api + (beta ? "/releases?per_page=30" : "/releases/latest"), { headers: HDR, signal: AbortSignal.timeout(20000) });
    if (r.status === 404) throw new Error("No release published yet");
    if (r.status !== 200) throw new Error("GitHub answered " + r.status);
    let rel = await r.json();
    if (beta) rel = (Array.isArray(rel) ? rel : []).filter(x => x && !x.draft && x.tag_name).sort((a, b) => cmp(b.tag_name, a.tag_name))[0] || {};
    const ver = String(rel.tag_name || "").replace(/^v/, "");
    if (!ver || cmp(ver, env.version) <= 0) { set({ state: "latest", version: env.version }, true); return state; }
    await offer(rel, ver);
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
  let sizeOk = false;
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
    sizeOk = true;
  } catch (e) {
    try { fs.unlinkSync(part); } catch {}
    set(ctl.signal.aborted ? { state: "available", received: 0 } : { state: "error", message: e.message || "Download failed" }, ctl.signal.aborted);
  } finally { job = null; }
  // Windows installs by itself once the checksum is right.
  if (sizeOk && env.platform === "win" && !portable()) await install();
  return state;
}

function cancel() { job?.abort(); return true; }

// A portable copy is not what the setup installs, so it must not be updated through it.
const portable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;
const INSTALL_ESTIMATE_MS = 12000, INSTALL_GIVE_UP_MS = 3 * 60 * 1000;
let installTimer = null;
// A silent setup reports nothing, so the bar for this part is an estimate: it slows down as it nears the end and never reaches it.
function installProgress(started) {
  clearInterval(installTimer);
  installTimer = setInterval(() => {
    const t = Date.now() - started;
    if (t > INSTALL_GIVE_UP_MS) {
      clearInterval(installTimer);
      set({ state: "error", message: "The update did not finish. Run the downloaded setup file yourself: " + (state.path || "") }, true);
      return;
    }
    set({ state: "installing", progress: Math.min(0.95, 1 - Math.exp(-t / INSTALL_ESTIMATE_MS)) });
  }, 500);
  installTimer.unref?.();
}

async function install() {
  if (state.state !== "ready" || !state.path || !fs.existsSync(state.path)) return false;
  const { app, shell } = require("electron");
  if (env.platform === "win" && !portable()) {
    // --updated keeps the settings, /S hides the wizard, --force-run starts the new Lodica when it is done (the same flags electron-updater uses).
    try {
      const child = require("child_process").spawn(state.path, ["--updated", "/S", "--force-run"], { detached: true, stdio: "ignore" });
      child.on("error", (e) => set({ state: "error", message: "Could not start the setup: " + e.message }, true));
      child.unref();
    } catch (e) { set({ state: "error", message: "Could not start the setup: " + e.message }, true); return false; }
    set({ state: "installing", progress: 0 });
    installProgress(Date.now());
    // The setup closes this window itself and starts the new version; this window stays open with the bar until then.
    return true;
  }
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

module.exports = { cmp, init, check, versions, pickVersion, download, cancel, install, status: () => state, _setEnv: e => { env = e; }, _reset: () => { state = { state: "idle" }; job = null; } };
