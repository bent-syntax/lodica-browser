"use strict";
// Modal dialogs. Each returns a Promise of its result; Esc / outside click gives the cancel value.
function dialog(opts, build) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const L = openLayer({ key: opts.key, modal: !!opts.modal, onClose: (r) => finish(r === undefined ? opts.cancelValue ?? null : r) }, (L) => {
      const d = h("div", { class: "dialog" + (opts.cls ? " " + opts.cls : "") },
        opts.title ? h("h3", { text: opts.title }) : null,
        opts.message ? h("p", { text: opts.message }) : null);
      build(d, L);
      d.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA" && L.submit) { e.preventDefault(); L.submit(); }
      });
      return d;
    });
    if (opts.onLayer) opts.onLayer(L);
  });
}
function btnRow(...b) { return h("div", { class: "btns" }, b); }

function confirmDialog(o) {
  return dialog(Object.assign({ cancelValue: false }, o), (d, L) => {
    L.submit = () => L.close(true);
    d.append(btnRow(
      o.extra ? btn(o.extra, () => L.close("extra"), "muted") : null,
      btn(o.cancel || "Cancel", () => L.close(false), "muted"),
      h("button", { class: "btn" + (o.danger ? " danger" : ""), act: () => L.close(true), autofocus: true }, o.ok || "OK")));
  });
}
function textDialog(o) {
  return dialog(o, (d, L) => {
    const i = h("input", { class: "field", type: o.secret ? "password" : "text", placeholder: o.placeholder || "", value: o.value || "", autofocus: true });
    L.submit = () => L.close(i.value);
    d.append(i, btnRow(btn("Cancel", () => L.close(null), "muted"), btn(o.ok || "OK", () => L.submit())));
  });
}
// PIN entry (4-8 digits). confirm:true asks twice.
function pinDialog(o) {
  return dialog(o, (d, L) => {
    const i = h("input", { class: "field pinbox", type: "password", inputmode: "numeric", maxlength: "8", autocomplete: "off", autofocus: true });
    const note = h("p", { text: "", style: "color:var(--coral);margin:0 0 6px;min-height:18px" });
    let first = null;
    i.addEventListener("input", () => { i.value = i.value.replace(/\D/g, ""); note.textContent = ""; });
    L.submit = () => {
      const v = i.value;
      if (v.length < 4) { note.textContent = "Use at least 4 digits"; return; }
      if (o.confirm && first == null) { first = v; i.value = ""; note.textContent = ""; d.querySelector("p").textContent = "Enter the PIN again"; return; }
      if (o.confirm && first !== v) { first = null; i.value = ""; note.textContent = "PINs don't match"; return; }
      L.close(v);
    };
    d.append(i, note, btnRow(btn("Cancel", () => L.close(null), "muted"), btn(o.ok || "OK", () => L.submit())));
  });
}
function authDialog(o) {
  return dialog(Object.assign({ title: "Sign in" }, o), (d, L) => {
    const u = h("input", { class: "field", type: "text", placeholder: "Username", autocomplete: "off", value: o.user || "", autofocus: true });
    const p = h("input", { class: "field", type: "password", placeholder: "Password" });
    const r = h("input", { type: "checkbox" });
    L.submit = () => L.close({ user: u.value, pass: p.value, remember: r.checked });
    d.append(u, p, h("label", { class: "chk" }, r, "Remember for this site"),
      btnRow(btn("Clear", () => { u.value = ""; p.value = ""; u.focus(); }, "muted"), btn(o.cancel || "Cancel", () => L.close(null), "muted"), btn("OK", () => L.submit())));
  });
}
function selectDialog(o) {
  return dialog(o, (d, L) => {
    const opts = o.options || [];
    d.append(h("div", { class: "opts" }, opts.map((x, i) => {
      const lab = typeof x === "object" ? (x.label ?? x.text ?? x.value) : x;
      const val = typeof x === "object" && "value" in x ? x.value : i;
      return h("button", { class: "opt" + ((typeof x === "object" && x.selected) || o.selected === val ? " sel" : ""), act: () => L.close(val) },
        h("span", { class: "dot" }), h("span", { text: String(lab) }));
    })), btnRow(btn(o.cancel || "Cancel", () => L.close(null), "muted")));
  });
}
const SWATCH = ["#111827", "#6B7280", "#E5E7EB", "#FFFFFF", "#F43F5E", "#F97316", "#F59E0B", "#EAB308",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#78350F"];
function colorDialog(o) {
  return dialog(Object.assign({ title: "Pick a color" }, o), (d, L) => {
    let cur = /^#[0-9a-f]{6}$/i.test(o.value || "") ? o.value : "#F59E0B";
    const pick = h("input", { type: "color", value: cur, style: "width:100%;height:36px;border:0;background:none" });
    const sw = h("div", { class: "swatches" }, SWATCH.map((c) => h("button", { style: "background:" + c, title: c,
      class: c.toLowerCase() === cur.toLowerCase() ? "sel" : "", act: (e, el) => { cur = c; pick.value = c; $$(".sel", sw).forEach((x) => x.classList.remove("sel")); el.classList.add("sel"); } })));
    pick.addEventListener("input", () => { cur = pick.value; });
    L.submit = () => L.close(cur.toLowerCase());
    d.append(sw, pick, btnRow(btn("Cancel", () => L.close(null), "muted"), btn("OK", () => L.submit())));
  });
}

// Prompts from main: answer via prompt.answer(id, result).
const PROMPTS = new Map();
async function onPrompt(p) {
  if (!p) return;
  if (p.kind === "dismiss" || p.dismiss) { const L = PROMPTS.get(p.id); if (L) L.close(); return; }
  const o = { title: p.title, message: p.message, ok: p.ok, cancel: p.cancel, extra: p.extra, options: p.options,
    value: p.value, user: p.user, modal: true, key: "prompt-" + p.id, onLayer: (L) => PROMPTS.set(p.id, L) };
  let r;
  if (p.kind === "auth") r = await authDialog(o);
  else if (p.kind === "pin") r = await pinDialog(o);
  else if (p.kind === "select") r = await selectDialog(o);
  else if (p.kind === "color") r = await colorDialog(o);
  else if (p.kind === "text") r = await textDialog(o);
  else r = await confirmDialog(o);
  PROMPTS.delete(p.id);
  inv("prompt.answer", p.id, r);
}
