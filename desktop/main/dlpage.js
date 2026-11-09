// Download start animation drawn over the active page: a sheet of paper in the theme colours lifts off where the cursor is and drops into a folder at the bottom of the window, drawn in the theme colours with the shape of the user's operating system folder.
// Runs in an isolated world with styles from insertCSS and DOM built without innerHTML, so page CSP and Trusted Types cannot block it.
const WORLD = 1047;
const ID = "lodica-dl-anim";

const CSS = `
#${ID}{all:initial;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important}
#${ID} div{all:initial;position:absolute;display:block;box-sizing:border-box;left:-22px;top:-28px;width:44px;height:56px;border-radius:6px}
#${ID} i{all:initial;position:absolute;display:block;left:8px;right:8px;height:3px;border-radius:2px}
`;

// Folder shape per operating system, so it looks like the folder the user knows: [corner radius, tab width %, tab height, tab radius, front gradient].
const FOLDERS = {
  win32: [3, 42, 10, 3, "linear-gradient(transparent,transparent)"],
  darwin: [12, 38, 12, 8, "linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0))"],
  linux: [8, 44, 12, 6, "linear-gradient(transparent,transparent)"],
};

// c: theme colours { bg, amber, text }; from: cursor in page coordinates; to: folder centre in page coordinates; os: process.platform.
function script(short, c, from, to, os) {
  const f = FOLDERS[os] || FOLDERS.linux;
  return `(() => {
  const old = document.getElementById(${JSON.stringify(ID)}); if (old) old.remove();
  const c = ${JSON.stringify(c)}, from = ${JSON.stringify(from)}, to = ${JSON.stringify(to)}, f = ${JSON.stringify(f)};
  const mk = (css, parent) => { const e = document.createElement("div"); e.style.cssText = css; parent.append(e); return e; };
  const root = document.createElement("div"); root.id = ${JSON.stringify(ID)};
  const W = 96, H = 72;
  const box = mk("left:" + (to.x - W / 2) + "px;top:" + (to.y - H / 2) + "px;width:" + W + "px;height:" + H + "px;perspective:300px;opacity:0;filter:drop-shadow(0 8px 14px rgba(0,0,0,.4))", root);
  const dark = "color-mix(in srgb," + c.amber + " 62%,black)";
  mk("left:0;top:0;width:" + f[1] + "%;height:" + (f[2] + 6) + "px;background:" + dark + ";border-radius:" + f[3] + "px " + f[3] + "px 0 0", box);
  mk("left:0;top:" + f[2] + "px;width:" + W + "px;height:" + (H - f[2]) + "px;background:" + dark + ";border-radius:" + f[0] + "px", box);
  const sheet = mk("left:" + (W / 2 - 22) + "px;top:" + (f[2] + 4) + "px;width:44px;height:56px;border-radius:4px;background:" + c.bg + ";border:2px solid " + c.amber + ";opacity:0;z-index:2", box);
  [12, 24, 36].forEach((y, n) => { const l = document.createElement("i"); l.style.top = y + "px"; l.style.background = n === 0 ? c.amber : c.text; l.style.opacity = n === 0 ? "1" : ".45"; sheet.append(l); });
  const front = mk("left:0;top:" + (f[2] + 14) + "px;width:" + W + "px;height:" + (H - f[2] - 14) + "px;background:" + f[4] + "," + c.amber + ";border-radius:" + f[0] + "px;transform-origin:50% 100%;z-index:3", box);
  (document.body || document.documentElement).append(root);
  const done = () => { root.remove(); return true; };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    return box.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 600 }).finished.then(done, done);
  const T = ${short ? 1500 : 3000}, o = { duration: T, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" };
  const lin = { duration: T, fill: "both" };
  const dx = from.x - to.x, dy = from.y - to.y;
  return Promise.all([
    box.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none", offset: .12 }, { opacity: 1, offset: .9 }, { opacity: 0, transform: "translateY(-6px)" }], lin).finished,
    front.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-55deg)", offset: .14 }, { transform: "rotateX(-55deg)", offset: .72 }, { transform: "rotateX(0deg)", offset: .9 }, { transform: "rotateX(0deg)" }], o).finished,
    sheet.animate([
      { transform: "translate(" + dx + "px," + dy + "px) scale(.4) rotate(-8deg)", opacity: 0 },
      { transform: "translate(" + dx + "px," + (dy - 24) + "px) scale(1) rotate(0deg)", opacity: 1, offset: .12 },
      { transform: "translate(" + (dx * .35) + "px," + (dy * .35 - 40) + "px) scale(.9) rotate(5deg)", opacity: 1, offset: .45 },
      { transform: "translate(0,-14px) scale(.75) rotate(0deg)", opacity: 1, offset: .68 },
      { transform: "translate(0,2px) scale(.6)", opacity: 1, offset: .82 },
      { transform: "translate(0,2px) scale(.6)", opacity: 1 },
    ], o).finished,
  ]).then(done, done);
})()`;
}

// Cursor and Downloads button in the page's own coordinates. The page view sits at the bottom right of the window content, so the gap between window and page size is its offset.
async function where(wc) {
  const { screen } = require("electron");
  const win = wc.getOwnerBrowserWindow && wc.getOwnerBrowserWindow();
  const [vw, vh] = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: "[innerWidth, innerHeight]" }]);
  let from = { x: vw / 2, y: vh / 2 };
  const to = { x: vw / 2, y: Math.max(60, vh - 60) };
  if (win) {
    const cb = win.getContentBounds(), p = screen.getCursorScreenPoint();
    const ox = cb.width - vw, oy = cb.height - vh;
    const x = p.x - cb.x - ox, y = p.y - cb.y - oy;
    if (x >= 0 && x <= vw && y >= 0 && y <= vh) from = { x, y };
  }
  return { from, to };
}

async function draw(wc, short) {
  let key = null;
  try {
    key = await wc.insertCSS(CSS);
    const t = global.lodicaTheme || { bg: "#1F2937", amber: "#F59E0B", text: "#E5E7EB" };
    const { from, to } = await where(wc);
    await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: script(short, t, from, to, process.platform) }], true);
  } catch {}
  if (key && !wc.isDestroyed()) wc.removeInsertedCSS(key).catch(() => {});
}

// src: the webContents that started the download; falls back to the active tab when it is gone or blank (link opened a throwaway tab).
function play({ src, active, total }) {
  setTimeout(() => {
    try {
      const ok = w => w && !w.isDestroyed() && w.getURL() && w.getURL() !== "about:blank" && w.getType() !== "backgroundPage";
      const wc = ok(active()) ? active() : ok(src) ? src : null;
      if (wc) draw(wc, total > 0 && total < 1 << 20);
    } catch {}
  }, 150);
}

module.exports = { play, CSS, script, FOLDERS };
