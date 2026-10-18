"use strict";
// Authenticator: one-time codes, behind the same PIN as saved passwords.

function secAuth() {
  return [secHead("Authenticator", "authenticator"),
    setRow("Open authenticator", "Your one-time codes", null, openAuthenticator),
    setRow("Add from a QR screenshot", "Pick an image with the QR code (also Google Authenticator exports)", null, authImportImage),
    setRow("Add with a key or link", "Paste an otpauth:// link, an export link or a setup key", null, authAddText)];
}

async function authUnlock() {
  const st = (await inv("vault.state")) || {};
  if (!st.pinSet) {
    const pin = await pinDialog({ title: "Set a PIN", message: "Protects saved passwords and authenticator codes on this PC.", confirm: true });
    if (pin == null) return false;
    await inv("vault.setPin", pin);
  } else if (!st.unlocked) {
    const pin = await pinDialog({ title: "Authenticator is locked", message: "Enter your PIN" });
    if (pin == null) return false;
    if (!(await inv("vault.unlock", pin))) { toast("Wrong PIN"); return false; }
  }
  return true;
}

async function authImportImage() {
  if (!(await authUnlock())) return;
  const r = (await inv("auth.addImage")) || {};
  if (r.canceled) return;
  toast(r.added ? r.added + " account" + (r.added > 1 ? "s" : "") + " added" : r.error || "Nothing added");
}

async function authAddText() {
  if (!(await authUnlock())) return;
  const text = await textDialog({ title: "Add account", placeholder: "otpauth://… or setup key", ok: "Add" });
  if (text == null || !String(text).trim()) return;
  const n = await inv("auth.add", text);
  toast(n ? n + " account" + (n > 1 ? "s" : "") + " added" : "That is not a valid code or key");
}

async function openAuthenticator() {
  if (!(await authUnlock())) return;
  return sheet({ title: "Authenticator", key: "authenticator", tall: true }, (b) => {
    let timer = 0;
    const load = async () => {
      if (!b.isConnected) { clearInterval(timer); return; }
      const rows = await inv("auth.list");
      if (!Array.isArray(rows)) return;
      clear(b);
      b.append(h("div", { class: "row" }, h("div", { class: "main" }, h("div", { class: "t2", text: "Tap a code to copy it" })),
        ib("add", "Add with a key or link", async () => { await authAddText(); load(); }),
        ib("image", "Add from a QR screenshot", async () => { await authImportImage(); load(); })));
      if (!rows.length) { b.append(h("div", { class: "empty", text: "No accounts yet" })); return; }
      for (const r of rows) {
        const shown = r.code.slice(0, r.code.length / 2) + " " + r.code.slice(r.code.length / 2);
        b.append(h("div", { class: "row" }, ico("key"),
          h("button", { class: "main click", act: async () => { await inv("auth.copy", r.id); toast("Code copied"); } },
            h("div", { class: "t1", text: r.label }),
            h("div", { class: "t2", text: shown + " · " + r.left + "s · " + (r.host ? "auto-fills on " + r.host : "copy only") })),
          ib("globe", "Auto-fill site", async () => {
            const site = await textDialog({ title: "Auto-fill site", message: "Site, e.g. github.com. Leave empty for copy only.", value: r.host, ok: "Save" });
            if (site != null) { await inv("auth.setHost", r.id, String(site).trim()); load(); }
          }),
          ib("edit", "Rename", async () => {
            const name = await textDialog({ title: "Rename", value: r.label, ok: "Save" });
            if (name != null && String(name).trim()) { await inv("auth.rename", r.id, String(name).trim()); load(); }
          }),
          ib("delete", "Delete", async () => {
            if (!(await confirmDialog({ title: "Delete account?", message: r.label + ". You will not be able to get codes for it from here.", ok: "Delete", danger: true }))) return;
            await inv("auth.remove", r.id); load();
          })));
      }
    };
    load();
    timer = setInterval(load, 1000);
  });
}
