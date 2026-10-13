"use strict";
const inv = (...a) => window.lodica.invoke(...a);
const applyPrefs = p => { document.documentElement.dataset.theme = (p && p.theme) || "system"; };
inv("prefs.all").then(applyPrefs);
window.lodica.on("prefs", applyPrefs);

let dragging = false, raf = 0, lastX = 0;
const send = () => { raf = 0; inv("split.drag", lastX); };
document.body.addEventListener("pointerdown", e => {
  if (e.target.id === "x") return;
  dragging = true;
  document.body.classList.add("drag");
  document.body.setPointerCapture(e.pointerId);
  lastX = e.screenX;
});
document.body.addEventListener("pointermove", e => {
  if (!dragging) return;
  lastX = e.screenX;
  if (!raf) raf = requestAnimationFrame(send);
});
const stop = () => { dragging = false; document.body.classList.remove("drag"); };
document.body.addEventListener("pointerup", stop);
document.body.addEventListener("pointercancel", stop);
document.getElementById("x").addEventListener("click", () => inv("split.close"));
document.body.addEventListener("dblclick", e => { if (e.target.id !== "x") inv("split.ratio", 0.5); });
