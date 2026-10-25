"use strict";
// Notebook: one text shared with every device linked to the same server. Saves a moment after typing, checks for changes every 10 seconds.
const NB = { L: null };

function openNotebook() {
  if (NB.L) return NB.L;
  NB.L = openLayer({ key: "notebook", cls: "spage-layer", dim: false, onClose: () => { const L = NB.L; NB.L = null; clearInterval(L.poll); clearTimeout(L.timer); if (L.dirty) inv("notebook.put", L.ta.value, L.rev); } }, (L) => {
    L.rev = 0; L.sent = ""; L.dirty = false; L.busy = false;
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Loading..." });
    L.ta = h("textarea", { class: "field", placeholder: "Write here. Every linked device shows the same notes.", maxlength: "100000", style: "flex:1;min-height:240px;margin:0 12px 12px;border-radius:12px;resize:none;font-size:15px" });
    const adopt = (n) => { L.rev = n.rev; L.sent = n.text; };
    // Sends the text when it changed. On a conflict the newer text from another device is kept and this device's own text goes under it, so nothing is lost.
    const save = async () => {
      if (L.busy) { L.dirty = true; return; }
      L.busy = true; L.dirty = false;
      const mine = L.ta.value;
      let r = await inv("notebook.put", mine, L.rev);
      if (r && r.conflict) {
        const merged = r.text === mine || !mine.trim() ? r.text : r.text ? r.text.replace(/\s+$/, "") + "\n\n" + mine : mine;
        if (L.ta.value === mine) L.ta.value = merged; else L.dirty = true;
        adopt(r);
        if (merged !== r.text) r = await inv("notebook.put", L.ta.value === merged ? merged : L.ta.value, L.rev);
      }
      L.busy = false;
      if (!r) { L.dirty = true; L.status.textContent = "Can't reach the server. Will try again."; return; }
      if (r.conflict) L.dirty = true; else adopt(r);
      L.status.textContent = L.dirty ? "Saving..." : "Saved";
      if (L.dirty) L.timer = setTimeout(save, 600);
    };
    L.ta.addEventListener("input", () => { L.dirty = true; L.status.textContent = "Saving..."; clearTimeout(L.timer); L.timer = setTimeout(save, 800); });
    const pull = async () => {
      if (L.busy || L.dirty) return;
      const n = await inv("notebook.get");
      if (!n) { L.status.textContent = "Can't reach the server"; return; }
      if (n.rev !== L.rev && !L.dirty && L.ta.value === L.sent) { L.ta.value = n.text; adopt(n); }
      L.status.textContent = "Synced with your linked devices";
    };
    L.pull = pull;
    L.poll = setInterval(pull, 10000);
    return h("div", { class: "spage" },
      h("div", { class: "sp-main", style: "display:flex;flex-direction:column;height:100%" },
        h("div", { class: "sp-head" }, h("h2", { text: "Notebook" }), ib("close", "Close notebook", () => L.close())),
        L.status, L.ta));
  });
  const L = NB.L;
  inv("notebook.get").then((n) => {
    if (!n) { L.status.textContent = "Can't reach the server"; return; }
    if (!L.dirty) { L.ta.value = n.text; L.rev = n.rev; L.sent = n.text; }
    L.status.textContent = "Synced with your linked devices";
  });
  L.ta.focus();
  return L;
}
