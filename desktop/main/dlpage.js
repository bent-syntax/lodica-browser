// Download start animation drawn over the active page: a sheet of paper in the theme colours lifts off where the cursor is and flies up to the toolbar's Downloads button.
// Runs in an isolated world with styles from insertCSS and DOM built without innerHTML, so page CSP and Trusted Types cannot block it.
const WORLD = 1047;
const ID = "lodica-dl-anim";

const CSS = `
#${ID}{all:initial;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important}
#${ID} div{all:initial;position:absolute;display:block;box-sizing:border-box;left:-22px;top:-28px;width:44px;height:56px;border-radius:6px}
#${ID} i{all:initial;position:absolute;display:block;left:8px;right:8px;height:3px;border-radius:2px}
`;

// c: theme colours { bg, amber, text }; from: cursor in page coordinates; to: toolbar button in page coordinates (above the page, so it is negative in y).
function script(short, c, from, to) {
  return `(() => {
  const old = document.getElementById(${JSON.stringify(ID)}); if (old) old.remove();
  const c = ${JSON.stringify(c)}, from = ${JSON.stringify(from)}, to = ${JSON.stringify(to)};
  const root = document.createElement("div"); root.id = ${JSON.stringify(ID)};
  const sheet = document.createElement("div");
  sheet.style.cssText = "background:" + c.bg + ";border:2px solid " + c.amber + ";box-shadow:0 6px 16px rgba(0,0,0,.35)";
  [12, 24, 36].forEach((y, n) => { const l = document.createElement("i"); l.style.top = y + "px"; l.style.background = n === 0 ? c.amber : c.text; l.style.opacity = n === 0 ? "1" : ".45"; sheet.append(l); });
  root.append(sheet);
  (document.body || document.documentElement).append(root);
  const done = () => { root.remove(); return true; };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    return root.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 600 }).finished.then(done, done);
  const T = ${short ? 1500 : 3000};
  const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) + 40;
  return sheet.animate([
    { transform: "translate(" + from.x + "px," + from.y + "px) scale(.4) rotate(-8deg)", opacity: 0 },
    { transform: "translate(" + from.x + "px," + (from.y - 24) + "px) scale(1) rotate(0deg)", opacity: 1, offset: .2 },
    { transform: "translate(" + mx + "px," + my + "px) scale(.8) rotate(6deg)", opacity: 1, offset: .6 },
    { transform: "translate(" + to.x + "px," + to.y + "px) scale(.2) rotate(0deg)", opacity: 0 },
  ], { duration: T, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" }).finished.then(done, done);
})()`;
}

// Cursor and Downloads button in the page's own coordinates. The page view sits at the bottom right of the window content, so the gap between window and page size is its offset.
async function where(wc) {
  const { screen } = require("electron");
  const win = wc.getOwnerBrowserWindow && wc.getOwnerBrowserWindow();
  const [vw, vh] = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: "[innerWidth, innerHeight]" }]);
  let from = { x: vw / 2, y: vh - 48 }, to = { x: vw - 120, y: -20 };
  if (win) {
    const cb = win.getContentBounds(), p = screen.getCursorScreenPoint();
    const ox = cb.width - vw, oy = cb.height - vh;
    const x = p.x - cb.x - ox, y = p.y - cb.y - oy;
    if (x >= 0 && x <= vw && y >= 0 && y <= vh) from = { x, y };
    to = { x: Math.max(40, vw - 120), y: -oy + 20 };
  }
  return { from, to };
}

async function draw(wc, short) {
  let key = null;
  try {
    key = await wc.insertCSS(CSS);
    const t = global.lodicaTheme || { bg: "#1F2937", amber: "#F59E0B", text: "#E5E7EB" };
    const { from, to } = await where(wc);
    await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: script(short, t, from, to) }], true);
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

module.exports = { play, CSS, script };
