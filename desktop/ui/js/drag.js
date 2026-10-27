"use strict";
// Shared by the tab strip (top.html) and the tab switcher (index.html); needs a global inv().
// Drag-to-reorder: drop dragged tab element onto another to take its place.
function dragTab(node, id) {
  node.draggable = true;
  const clear = () => document.querySelectorAll(".drop-before,.drop-after").forEach(n => n.classList.remove("drop-before", "drop-after"));
  node.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-lodica-tab", String(id)); e.dataTransfer.effectAllowed = "move"; node.classList.add("dragging"); document.body.classList.add("tabdrag"); });
  node.addEventListener("dragend", () => { node.classList.remove("dragging"); document.body.classList.remove("tabdrag"); clear(); });
  node.addEventListener("dragover", e => {
    if (!e.dataTransfer.types.includes("text/x-lodica-tab")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    if (node.classList.contains("dragging")) return;
    // The dragged tab takes this tab's place: the bar sits on the side it will land.
    const sibs = [...node.parentNode.children], from = sibs.findIndex(n => n.classList.contains("dragging")), to = sibs.indexOf(node);
    clear(); node.classList.add(from >= 0 && from < to ? "drop-after" : "drop-before");
  });
  node.addEventListener("dragleave", () => node.classList.remove("drop-before", "drop-after"));
  node.addEventListener("drop", e => {
    clear();
    const from = e.dataTransfer.getData("text/x-lodica-tab");
    if (!from || from === String(id)) return;
    e.preventDefault(); inv("tab.move", from, id);
  });
}
