// Download start animation drawn inside the active page: a file jumps from the cursor to a folder at the bottom, which opens and eats it.
const { screen } = require("electron");

function script(sx, sy) {
  return `(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const NS = "http://www.w3.org/2000/svg";
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden";
  const st = document.createElement("style");
  st.textContent = ".lx-s{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.lx-lid{transform-origin:3px 7px;transition:transform .2s ease}.lx-open .lx-lid{transform:rotate(-24deg)}";
  const svg = (inner) => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "lx-s"); s.innerHTML = inner; return s; };
  const dock = document.createElement("div");
  dock.style.cssText = "position:fixed;left:50%;bottom:20px;width:48px;height:48px;margin-left:-24px;color:#F59E0B;transform:translateY(80px);transition:transform .25s ease";
  dock.append(svg('<path d="M3 8v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1z"/><path class="lx-lid" d="M3 8V6a1 1 0 0 1 1-1h5l2 2h9"/>'));
  const fly = document.createElement("div");
  const sx = ${Math.round(sx)}, sy = ${Math.round(sy)};
  fly.style.cssText = "position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;color:#F59E0B;left:" + sx + "px;top:" + sy + "px";
  fly.append(svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'));
  root.append(st, dock, fly);
  document.documentElement.append(root);
  const tx = innerWidth / 2, ty = innerHeight - 44;
  requestAnimationFrame(() => dock.style.transform = "none");
  setTimeout(() => dock.classList.add("lx-open"), 250);
  const mid = { x: (sx + tx) / 2, y: Math.min(sy, ty) - 120 };
  const a = fly.animate([
    { transform: "translate(0,0) scale(1)", offset: 0 },
    { transform: "translate(" + (mid.x - sx) + "px," + (mid.y - sy) + "px) scale(1.3)", offset: 0.45 },
    { transform: "translate(" + (tx - sx) + "px," + (ty - sy) + "px) scale(.5)", offset: 1 },
  ], { duration: 750, delay: 100, easing: "cubic-bezier(.3,.1,.3,1)", fill: "both" });
  a.onfinish = () => {
    fly.style.opacity = "0"; fly.style.transition = "opacity .15s";
    dock.classList.remove("lx-open");
    setTimeout(() => { dock.style.transform = "translateY(80px)"; setTimeout(() => root.remove(), 300); }, 300);
  };
})()`;
}

function play({ wc, win, pageBounds }) {
  try {
    if (!wc || wc.isDestroyed() || !win) return;
    const p = screen.getCursorScreenPoint();
    const c = win.getContentBounds();
    const pb = pageBounds();
    let x = p.x - c.x - pb.x, y = p.y - c.y - pb.y;
    if (x < 0 || y < 0 || x > pb.width || y > pb.height) { x = pb.width / 2; y = 0; }
    wc.executeJavaScript(script(x, y), true).catch(() => {});
  } catch {}
}

module.exports = { play };
