// Download start: a file flies from the Downloads button to a folder at the bottom, which opens and eats it.
function dlAnimate(name) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const btn = document.querySelector('button[title="Downloads"]');
  const r = btn ? btn.getBoundingClientRect() : { left: innerWidth - 80, top: 20, width: 24, height: 24 };
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  const NS = "http://www.w3.org/2000/svg";
  const svg = (inner) => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = inner; return s; };
  const dock = h("div", { class: "dl-dock" });
  dock.append(svg('<path d="M3 8v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1z"/><path class="lid" d="M3 8V6a1 1 0 0 1 1-1h5l2 2h9"/>'));
  const fly = h("div", { class: "dl-fly" });
  fly.append(svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'));
  fly.style.left = sx + "px"; fly.style.top = sy + "px";
  document.body.append(dock, fly);
  const tx = innerWidth / 2, ty = innerHeight - 44;
  requestAnimationFrame(() => dock.classList.add("in"));
  setTimeout(() => dock.classList.add("open"), 250);
  const mid = { x: (sx + tx) / 2, y: Math.min(sy, ty) - 120 };
  const a = fly.animate([
    { transform: "translate(0,0) scale(1)", offset: 0 },
    { transform: `translate(${mid.x - sx}px,${mid.y - sy}px) scale(1.3)`, offset: 0.45 },
    { transform: `translate(${tx - sx}px,${ty - sy}px) scale(.5)`, offset: 1 },
  ], { duration: 750, delay: 200, easing: "cubic-bezier(.3,.1,.3,1)", fill: "both" });
  a.onfinish = () => {
    fly.classList.add("eaten");
    dock.classList.remove("open");
    setTimeout(() => { dock.classList.remove("in"); setTimeout(() => { fly.remove(); dock.remove(); }, 300); }, 300);
  };
}
