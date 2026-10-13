"use strict";
// Clipboard + mail bubbles, crash screen and private-tab lock screen.

// Copied link: offer to open it.
function onClipboard(d) {
  if (!d || !d.url) return;
  const host = hostOf(d.url) || d.url;
  toast({ text: "Copied link: " + host, icon: "link", cls: "bubble", ms: 8000, actions: [
    { label: "Dismiss", cls: "muted" },
    { label: "Open", fn: () => (S.tab.home ? inv("go", d.url) : inv("tab.new", { private: sameTabPrivacy(), url: d.url })) },
  ] });
}

// Mail arrived at a hidden address: open its link (verify/login) or the Inbox.
function onMail(d) {
  if (!d) return;
  const who = d.site || d.alias || "Hidden email";
  const acts = [];
  if (S.relayAvail) acts.push({ label: "Inbox", cls: d.link ? "muted" : "", fn: () => openInbox() });
  if (d.link) acts.push({ label: "Open link", fn: () => inv("tab.new", { private: sameTabPrivacy(), url: d.link }) });
  toast({ text: "Mail for " + who, icon: "email", cls: "bubble", ms: 10000, actions: acts });
}

// Full-window screens (bar stays visible underneath at the bottom).
const SCR = { crash: null, lock: null };
function screenLayer(key, build) {
  return openLayer({ key, cls: "screenL", dim: false, modal: true, onEsc: () => {} }, (L) => { L.screen = true; return build(L); });
}

function checkCrash() {
  const t = S.tab || {};
  const want = !!t.crashed && S.crashedDismissed !== t.id;
  if (want && !SCR.crash) {
    const id = t.id;
    SCR.crash = screenLayer("crash", (L) => h("div", { class: "screen" },
      ico("warning", "big"), h("h2", { text: "This tab crashed" }),
      h("p", { text: "The page stopped working. Reload it to try again." }),
      h("div", { class: "btns" },
        btn("Close tab", () => { S.crashedDismissed = id; L.close(); closeTab(id); }, "muted"),
        btn("Reload", () => { S.crashedDismissed = id; L.close(); inv("reload"); }, "fill"))));
    SCR.crash.onClose = () => { SCR.crash = null; };
  } else if (!want && SCR.crash) {
    SCR.crash.close();
  }
}

// Locked private tabs: cover the current private tab until the PIN is entered.
function checkLock() {
  const want = !!S.locked && !!(S.tab && S.tab.private);
  if (want && !SCR.lock) {
    SCR.lock = screenLayer("lock", () => h("div", { class: "screen" },
      ico("lock", "big"), h("h2", { text: "Private tabs locked" }),
      h("p", { text: S.pinSet ? "Enter your PIN to continue." : "Unlock to continue." }),
      h("div", { class: "btns" },
        btn("Normal tabs", () => openSwitcher(false), "muted"),
        btn("Unlock", () => unlockLock(), "fill"))));
    SCR.lock.onClose = () => { SCR.lock = null; };
  } else if (!want && SCR.lock) {
    SCR.lock.close();
  }
}
async function unlockLock() {
  await unlockPrivate();
  checkLock();
}
function onLocked(d) {
  S.locked = !!(d && d.on);
  checkLock();
  refreshSwitcher();
}
