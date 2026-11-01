// Download start animation drawn over the active page: an amber folder opens, a sheet of paper drops in, and the folder closes with the top of the paper still showing.
// Runs in an isolated world with styles from insertCSS and DOM built without innerHTML, so page CSP and Trusted Types cannot block it.
const WORLD = 1047;
const ID = "lodica-dl-anim";

const CSS = `
#${ID}{all:initial;position:fixed!important;left:50%!important;bottom:32px!important;width:112px!important;height:132px!important;margin-left:-56px!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;filter:drop-shadow(0 8px 16px rgba(0,0,0,.45))}
#${ID} div{all:initial;position:absolute;display:block;box-sizing:border-box}
#${ID} .b{left:0;bottom:0;width:112px;height:84px;border-radius:8px;background:#B45309}
#${ID} .t{left:8px;top:-12px;width:44px;height:16px;border-radius:6px 6px 0 0;background:#B45309}
#${ID} .i{left:6px;right:6px;top:6px;bottom:6px;border-radius:6px;background:#111827}
#${ID} .p{left:24px;bottom:12px;width:64px;height:80px;border-radius:4px;background:#FFFFFF;transform-origin:50% 100%}
#${ID} .l{left:10px;right:10px;height:3px;border-radius:2px;background:#D1D5DB}
#${ID} .g{background:#10B981}
#${ID} .f{left:0;bottom:0;width:112px;height:72px;border-radius:8px;background:#F59E0B;transform-origin:50% 100%}
`;

function script(short) {
  return `(() => {
  const old = document.getElementById(${JSON.stringify(ID)}); if (old) old.remove();
  const el = (c, p) => { const d = document.createElement("div"); d.className = c; p.append(d); return d; };
  const root = document.createElement("div"); root.id = ${JSON.stringify(ID)};
  const back = el("b", root); el("t", back); el("i", back);
  const paper = el("p", root);
  [10, 20, 30, 40, 50].forEach((y, n) => { const l = el(n === 0 ? "l g" : "l", paper); l.style.top = y + "px"; });
  const front = el("f", root);
  (document.body || document.documentElement).append(root);
  const done = () => { root.remove(); return true; };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    paper.style.transform = "translateY(0)";
    return root.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 900 }).finished.then(done, done);
  }
  const T = ${short ? 1500 : 3000};
  const ease = "cubic-bezier(.4,0,.2,1)";
  root.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none", offset: .08 }, { opacity: 1, transform: "none", offset: .9 }, { opacity: 0, transform: "translateY(8px)" }], { duration: T + 400, fill: "both" });
  front.animate([
    { transform: "perspective(400px) rotateX(0deg)" },
    { transform: "perspective(400px) rotateX(-52deg)", offset: .33 },
    { transform: "perspective(400px) rotateX(-52deg)", offset: .66 },
    { transform: "perspective(400px) rotateX(0deg)" },
  ], { duration: T, easing: ease, fill: "both" });
  return paper.animate([
    { transform: "translateY(-72px) rotate(-12deg)" },
    { transform: "translateY(-40px) rotate(0deg)", offset: .33 },
    { transform: "translateY(0) rotate(0deg)", offset: .66 },
    { transform: "translateY(0) rotate(0deg)" },
  ], { duration: T, easing: ease, fill: "both" }).finished.then(() => new Promise(r => setTimeout(r, 400))).then(done, done);
})()`;
}

async function draw(wc, short) {
  let key = null;
  try {
    key = await wc.insertCSS(CSS);
    await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: script(short) }], true);
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
