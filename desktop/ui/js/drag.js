"use strict";
// Shared by the tab strip (top.html) and the tab switcher (index.html); needs a global inv().
// Drag-to-reorder: drop dragged tab element onto another to take its place.
function dragTab(node, id) {
  node.draggable = true;
  node.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-lodica-tab", String(id)); e.dataTransfer.effectAllowed = "move"; node.classList.add("dragging"); });
  node.addEventListener("dragend", () => node.classList.remove("dragging"));
  node.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-lodica-tab")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } });
  node.addEventListener("drop", e => {
    const from = e.dataTransfer.getData("text/x-lodica-tab");
    if (!from || from === String(id)) return;
    e.preventDefault(); inv("tab.move", from, id);
  });
}
