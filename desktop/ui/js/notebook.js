"use strict";
// Notebook: several notes shared with every device linked to the same server. Saves a moment after typing, checks for changes every 10 seconds.
const NB = { L: null };

function openNotebook() {
  if (NB.L) return NB.L;
  NB.L = openLayer({ key: "notebook", cls: "spage-layer", dim: false, onClose: () => { const L = NB.L; NB.L = null; clearInterval(L.poll); clearTimeout(L.timer); if (L.dirty && L.id) inv("notebook.put", L.id, L.ta.value, L.rev); } }, (L) => {
    L.id = null; L.notes = []; L.rev = 0; L.sent = ""; L.dirty = false; L.busy = false;
    L.status = h("div", { class: "empty", style: "padding:6px 12px", text: "Loading..." });
    L.ta = h("textarea", { class: "field", placeholder: "Write here. Every linked device shows the same notes.", maxlength: "100000", disabled: true, style: "flex:1;min-height:240px;margin:0 12px 12px;border-radius:12px;resize:none;font-size:15px" });
    L.chips = h("div", { class: "chips", style: "padding:0 12px 8px;overflow-x:auto;flex-wrap:nowrap;flex-shrink:0" });
    // Selecting math shows its answer above the note, with a button that writes it after the selection.
    L.ans = h("div", { class: "empty", style: "display:none;align-items:center;gap:8px;padding:0 12px 8px;color:var(--accent,#F59E0B);font-size:15px" });
    // A function of x ("y = x^2", "sin(x)") shows its graph instead.
    L.graph = h("canvas", { width: "320", height: "160", style: "display:none;margin:0 12px 8px;border-radius:12px;background:var(--raised);width:calc(100% - 24px);max-width:320px;flex-shrink:0" });
    const showAnswer = () => {
      const sel = L.ta.selectionStart === L.ta.selectionEnd ? "" : L.ta.value.slice(L.ta.selectionStart, L.ta.selectionEnd);
      const f = sel ? mathGraph(sel) : null;
      L.graph.style.display = f ? "block" : "none";
      if (f) drawGraph(L.graph, f);
      const a = !sel || f ? null : mathAnswer(sel);
      if (a == null) { L.ans.style.display = "none"; return; }
      const end = L.ta.selectionEnd, add = (a.includes("=") ? "\n" : " = ") + a;
      L.ans.replaceChildren(h("span", { style: "flex:1", text: (a.includes("=") ? "" : "= ") + a }),
        h("button", { class: "chip", text: "Insert", act: () => {
          if (L.ta.value.length + add.length > 100000) return;
          L.ta.focus(); L.ta.setSelectionRange(end, end);
          if (!document.execCommand("insertText", false, add)) { L.ta.setRangeText(add, end, end, "end"); L.ta.dispatchEvent(new Event("input")); }
          L.ans.style.display = "none";
        } }));
      L.ans.style.display = "flex";
    };
    const adopt = (n) => { L.rev = n.rev; L.sent = n.text; };
    const label = (n) => {
      const t = n.id === L.id ? firstLine(L.ta.value) : n.title;
      return t || "New note";
    };
    const firstLine = (s) => (s.split("\n").find((l) => l.trim()) || "").trim().slice(0, 60);
    const drawChips = () => {
      L.chips.replaceChildren(...L.notes.map((n) => h("button", { class: "chip" + (n.id === L.id ? " sel" : ""), style: "flex-shrink:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", act: () => switchTo(n.id), text: label(n) })),
        h("button", { class: "chip", style: "flex-shrink:0", "aria-label": "New note", act: addNote }, ico("add")));
    };
    const show = (n) => { L.id = n.id; L.ta.disabled = false; L.ta.value = n.text; adopt(n); L.dirty = false; drawChips(); };
    const settle = async () => { while (L.busy) await new Promise((r) => setTimeout(r, 50)); };
    // Sends the text when it changed. On a conflict the newer text from another device is kept and this device's own text goes under it, so nothing is lost.
    const save = async () => {
      if (L.busy) { L.dirty = true; return; }
      L.busy = true; L.dirty = false;
      const id = L.id, mine = L.ta.value;
      let r = await inv("notebook.put", id, mine, L.rev);
      if (L.id !== id) { L.busy = false; return; }
      if (r && r.conflict) {
        const merged = r.text === mine || !mine.trim() ? r.text : r.text ? r.text.replace(/\s+$/, "") + "\n\n" + mine : mine;
        if (L.ta.value === mine) L.ta.value = merged; else L.dirty = true;
        adopt(r);
        if (merged !== r.text) r = await inv("notebook.put", id, L.ta.value === merged ? merged : L.ta.value, L.rev);
      }
      L.busy = false;
      if (r && r.gone) { L.dirty = false; await reload(); return; }
      if (!r) { L.dirty = true; L.status.textContent = "Can't reach the server. Will try again."; return; }
      if (r.conflict) L.dirty = true; else adopt(r);
      L.status.textContent = L.dirty ? "Saving..." : "Saved";
      if (L.dirty) L.timer = setTimeout(save, 600);
    };
    // Loads the note list and shows [want], or the current note, or the first one.
    const reload = async (want) => {
      const notes = await inv("notebook.list");
      if (!notes) { L.status.textContent = "Can't reach the server"; return; }
      L.notes = notes;
      const id = [want, L.id, notes[0] && notes[0].id].find((x) => x && notes.some((n) => n.id === x));
      if (id === L.id && !want) { drawChips(); return; }
      const n = await inv("notebook.get", id);
      if (!n) { L.status.textContent = "Can't reach the server"; return; }
      show(n);
      L.status.textContent = "Synced with your linked devices";
    };
    const switchTo = async (id) => {
      if (id === L.id) return;
      clearTimeout(L.timer);
      await settle();
      if (L.dirty || L.ta.value !== L.sent) await save();
      await settle();
      if (L.dirty) { L.status.textContent = "Can't reach the server. Will try again."; return; }
      const n = await inv("notebook.get", id);
      if (!n) { L.status.textContent = "Can't reach the server"; return; }
      show(n);
      L.status.textContent = "Synced with your linked devices";
      L.ta.focus();
    };
    const addNote = async () => {
      clearTimeout(L.timer);
      await settle();
      if (L.dirty || L.ta.value !== L.sent) await save();
      await settle();
      const n = await inv("notebook.create");
      if (!n) { L.status.textContent = "Can't add a note. Check the server."; return; }
      L.notes.push({ id: n.id, title: "", at: n.at });
      show(n);
      L.status.textContent = "Synced with your linked devices";
      L.ta.focus();
    };
    const del = async () => {
      if (!L.id) return;
      if (!(await confirmDialog({ title: "Delete this note?", message: label({ id: L.id }) || "It is removed on every linked device.", ok: "Delete", danger: true }))) return;
      clearTimeout(L.timer);
      await settle();
      const left = await inv("notebook.remove", L.id);
      if (!left) { L.status.textContent = "Can't delete. Check the server."; return; }
      L.dirty = false; L.id = null;
      L.notes = left;
      const n = await inv("notebook.get", left[0].id);
      if (n) show(n);
    };
    L.ta.addEventListener("input", () => { L.dirty = true; L.status.textContent = "Saving..."; drawChips(); clearTimeout(L.timer); L.timer = setTimeout(save, 800); });
    L.ta.addEventListener("select", showAnswer);
    L.ta.addEventListener("keyup", showAnswer);
    L.ta.addEventListener("mouseup", () => setTimeout(showAnswer));
    const pull = async () => {
      if (L.busy || L.dirty || !L.id) { if (!L.id) reload(); return; }
      const [notes, n] = await Promise.all([inv("notebook.list"), inv("notebook.get", L.id)]);
      if (!notes) { L.status.textContent = "Can't reach the server"; return; }
      if (!n) { if (!L.busy && !L.dirty) reload(); return; }
      if (L.busy || L.dirty) return;
      L.notes = notes;
      if (n.rev !== L.rev && L.ta.value === L.sent) { L.ta.value = n.text; adopt(n); }
      drawChips();
      L.status.textContent = "Synced with your linked devices";
    };
    L.pull = pull;
    L.reload = reload;
    L.poll = setInterval(pull, 10000);
    return h("div", { class: "spage" },
      h("div", { class: "sp-main", style: "display:flex;flex-direction:column;height:100%" },
        h("div", { class: "sp-head" }, h("h2", { text: "Notebook" }), ib("delete", "Delete note", del), ib("close", "Close notebook", () => L.close())),
        L.status, L.chips, L.ans, L.graph, L.ta));
  });
  const L = NB.L;
  L.reload();
  L.ta.focus();
  return L;
}
