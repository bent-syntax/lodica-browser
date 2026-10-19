"use strict";
// Settings tabs: Appearance, Keybinds & controls, Identity & mail, plus the tab bar itself.

// [id, label, group]: the sidebar shows one heading per group, then its pages. Same pages and order as Android.
const SET_TABS = [
  ["search", "Search", "Browsing"], ["sites", "Sites & domains", "Browsing"], ["ai", "AI answers", "Browsing"],
  ["theme", "Theme", "Look & tabs"], ["start", "Start page", "Look & tabs"], ["tabs", "Tabs", "Look & tabs"],
  ["privacy", "Privacy & history", "Privacy & security"], ["security", "Security & blocking", "Privacy & security"],
  ["data", "Data, apps & extensions", "Data & controls"], ["keys", "Keybinds & controls", "Data & controls"],
  ["server", "Server & mail", "Account"], ["identity", "Identity & passwords", "Account"],
  ["about", "Updates & About", "About"]];
// Section ids that other code passes to openSettings() -> the page that holds them.
const SET_SECTION_TAB = { search: "search", suggest: "search", browsing: "sites", dns: "sites", ai: "ai", theme: "theme", appearance: "theme", pages: "theme",
  background: "start", shortcuts: "start", start: "start", tabs: "tabs", pctabs: "tabs", layout: "tabs", privacy: "privacy", https: "security", blocking: "security",
  security: "security", vps: "server", server: "server", mail: "server", data: "data", apps: "data", extensions: "data", keys: "keys", keybinds: "keys",
  identity: "identity", auth: "identity", authenticator: "identity", about: "about", updates: "about" };

const SET_ICONS = { search: "search", sites: "globe", ai: "settings", theme: "palette", start: "home", tabs: "tabs", privacy: "shield", security: "shield",
  data: "settings", keys: "key", server: "settings", identity: "key", about: "reader" };
function setTabBar() {
  const out = []; let last = "";
  for (const [id, label, group] of SET_TABS) {
    if (group !== last) { out.push(h("div", { class: "sp-group", text: group })); last = group; }
    out.push(h("button", { class: "sp-tab" + (SET.tab === id ? " sel" : ""), role: "tab", "aria-selected": SET.tab === id ? "true" : "false",
      act: () => { SET.tab = id; SET.cancelCapture && SET.cancelCapture(); renderSettings(); if (SET.L) SET.L.body.scrollTop = 0; } },
      ico(SET_ICONS[id] || "settings"), h("span", { text: label })));
  }
  return h("div", { class: "sp-tabs", role: "tablist" }, out);
}
/** Settings find: results replace the nav. Each hit names its page; clicking opens the page, scrolls to the row and flashes it. */
function setFindHits(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
  for (const [id, label] of SET_TABS) {
    [setTabBody(id)].flat(Infinity).forEach((e) => {
      if (!e || !e.classList || e.classList.contains("set-sec") || e.classList.contains("set-note")) return;
      const t = e.querySelector && e.querySelector(".t1");
      if (!t || !t.textContent) return;
      if (words.every((w) => (e.textContent + " " + label).toLowerCase().includes(w))) out.push({ id, label, title: t.textContent, sub: (e.querySelector(".t2") || {}).textContent || "" });
    });
  }
  return out;
}
function setFindList(q) {
  const hits = setFindHits(q);
  if (!hits.length) return h("div", { class: "sp-none", text: "No setting matches" });
  return h("div", { class: "sp-hits" }, hits.map((x) => h("button", { class: "sp-hit", act: () => {
    SET.find = ""; SET.tab = x.id; renderSettings();
    setTimeout(() => {
      const row = Array.from(SET.L.body.querySelectorAll(".set-row")).find((r) => { const t = r.querySelector(".t1"); return t && t.textContent === x.title; });
      if (row) { row.scrollIntoView({ block: "center" }); row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 1500); }
    }, 30);
  } }, h("span", { class: "hit-t", text: x.title }), h("span", { class: "hit-p", text: x.label }), x.sub ? h("span", { class: "hit-s", text: x.sub }) : null)));
}
function setTabBody(tab) {
  switch (tab) {
    case "sites": return [secBrowsing(), secDns()];
    case "ai": return secAi();
    case "theme": return [secTheme(), secDarkPages()];
    case "start": return secStart();
    case "tabs": return [secLayout(), secTabs(), secPcTabs()];
    case "privacy": return secPrivacy();
    case "security": return [secHttps(), secBlocking(), secSpell()];
    case "data": return [secData(), secApps(), secExtensions()];
    case "keys": return secKeys();
    case "server": return secServer();
    case "identity": return [secIdentity(), typeof secAuth === "function" ? secAuth() : []];
    case "about": return secAbout();
    default: return [secSearch(), secSuggest()];
  }
}

// Appearance
function setBg(patch) { setPref("bg", Object.assign({}, S.prefs.bg || {}, patch)); }
// Mini browser that shows what a theme looks like. Hovering a theme swatch previews it; the editor updates it live.
const PREVIEW_DEFAULT = { bg: "#1e1e2e", text: "#cdd6f4", accent: "#cba6f7", accent2: "#f38ba8" };
let previewEl = null;
function paintPreview(c) {
  if (!previewEl) return;
  const v = customVars(c);
  for (const k in v) previewEl.style.setProperty(k, v[k]);
}
function presetColours(id) {
  const t = THEMES.find((x) => x[0] === id) || THEMES[1];
  const light = parseInt(t[2].slice(1), 16) > 0x808080;
  return { bg: t[2], text: light ? "#111827" : "#e5e7eb", accent: t[4], accent2: t[4] };
}
function currentColours() {
  const id = S.prefs.theme || "system";
  return id === "custom" && S.prefs.customTheme ? S.prefs.customTheme : id === "system"
    ? presetColours(matchMedia("(prefers-color-scheme:light)").matches ? "light" : "dark") : presetColours(id);
}
function themePreviewBox() {
  previewEl = h("div", { class: "theme-prev" },
    h("div", { class: "tp-tabs" }, h("span", { class: "tp-tab sel", text: "Lodica" }), h("span", { class: "tp-tab", text: "Mail" }), h("span", { class: "tp-tab", text: "Docs" })),
    h("div", { class: "tp-bar" }, h("span", { class: "tp-url", text: "lodica://search" }), h("span", { class: "tp-dot" })),
    h("div", { class: "tp-page" },
      h("div", { class: "tp-search", text: "Search the web" }),
      h("div", { class: "tp-tiles" }, h("i"), h("i"), h("i"), h("i")),
      h("div", { class: "tp-line" }), h("div", { class: "tp-line short" })));
  paintPreview(currentColours());
  return previewEl;
}
function themeEditor() {
  const c = Object.assign({}, PREVIEW_DEFAULT, S.prefs.customTheme);
  const cur = { bg: c.bg, text: c.text, accent: c.accent, accent2: c.accent2 };
  const field = (key, label) => h("label", { class: "ct-field" }, h("span", { text: label }),
    h("input", { type: "color", value: cur[key], on: {
      input: (e) => { cur[key] = e.target.value; paintPreview(cur); },
      change: (e) => { cur[key] = e.target.value; inv("theme.custom", cur); } } }));
  const on = (S.prefs.theme || "system") === "custom";
  return h("div", { class: "ct" },
    h("div", { class: "ct-row" }, field("bg", "Background"), field("text", "Text"), field("accent", "Accent"), field("accent2", "Second accent")),
    h("div", { class: "ct-row" },
      h("button", { class: "ct-btn" + (on ? " sel" : ""), text: on ? "Using your theme" : "Use my theme", act: () => inv("theme.custom", cur) }),
      S.prefs.customTheme ? h("button", { class: "ct-btn", text: "Remove", act: () => { inv("theme.custom", null); if (on) setPref("theme", "system"); } }) : null),
    h("div", { class: "set-note", text: S.relayAvail ? "Your theme syncs to every device connected to your server." : "Your theme syncs to other devices once a server is connected." }));
}
function secTheme() {
  return [secHead("Theme", "theme"),
    h("div", { class: "swatches" }, THEMES.map(([id, label, back, raised, accent]) =>
      h("button", { class: "theme-sw" + ((S.prefs.theme || "system") === id ? " sel" : ""), title: label, act: () => setPref("theme", id),
        on: { pointerenter: () => paintPreview(presetColours(id)), pointerleave: () => paintPreview(currentColours()) } },
        h("span", { class: "theme-chip", style: "background:" + back + ";border-color:" + raised },
          h("i", { style: "background:" + raised }), h("i", { style: "background:" + accent })),
        h("span", { class: "theme-name", text: label })))),
    h("div", { class: "set-note", text: "Themes colour the browser, start page and settings. Websites keep their own colours." }),
    secHead("Preview", "preview"), themePreviewBox(), secHead("Custom theme", "custom"), themeEditor()];
}
function secStart() {
  const bg = Object.assign({ type: "none", value: "", dim: 0, blur: 0 }, S.prefs.bg);
  const out = [secHead("Background", "background"),
    chips([{ key: "none", label: "None" }, { key: "gradient", label: "Gradient" }, { key: "image", label: "Image" },
      { key: "custom", label: "Custom" }, { key: "color", label: "Colour" }], bg.type, (k) => setBg({ type: k, value: k === bg.type ? bg.value : "" }))];
  if (bg.type === "gradient") {
    out.push(h("div", { class: "swatches" }, BGS.gradients.map(([id, label, css]) =>
      h("button", { class: "bg-sw" + (bg.value === id ? " sel" : ""), title: label, style: "background:" + css, act: () => setBg({ value: id }) }))));
  } else if (bg.type === "image") {
    out.push(h("div", { class: "swatches" }, BGS.images.map(([id, label]) =>
      h("button", { class: "bg-sw" + (bg.value === id ? " sel" : ""), title: label, style: "background:#222 url(lodica://search/bg/" + id + ".svg) center/cover", act: () => setBg({ value: id }) }))));
  } else if (bg.type === "custom") {
    out.push(setRow("Your image", bg.value ? "Image set" : "No image chosen", null, async () => {
      const r = await inv("bg.pick");
      if (r) { S.prefs.bgHistory = [r, ...(S.prefs.bgHistory || []).filter((n) => n !== r)].slice(0, 8); setBg({ type: "custom", value: r }); }
    }));
    const hist = S.prefs.bgHistory || [];
    if (hist.length) out.push(h("div", { class: "swatches" }, hist.map((n) =>
      h("span", { class: "bg-wrap" },
        h("button", { class: "bg-sw" + (bg.value === n ? " sel" : ""), title: "Use this image", style: "background:#222 url(lodica://search/_bg/" + n + ") center/cover", act: () => setBg({ type: "custom", value: n }) }),
        h("button", { class: "bg-x", title: "Forget this image", text: "×", act: async () => {
          await inv("bg.forget", n);
          S.prefs.bgHistory = hist.filter((x) => x !== n);
          if (bg.value === n) S.prefs.bg = Object.assign({}, S.prefs.bg, { type: "none", value: "" });
          refreshSettings();
        } })))));
  } else if (bg.type === "color") {
    out.push(setRow("Colour", null, h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : "#1f2937",
      on: { change: (e) => setBg({ value: e.target.value }) } })));
  }
  if (bg.type !== "none") {
    out.push(bgPreview(bg));
    out.push(setSlider("Dim", bg.dim, 0, 100, (v) => setBg({ dim: v })), setSlider("Blur", bg.blur, 0, 40, (v) => setBg({ blur: v })));
  }
  out.push(secHead("Shortcuts", "shortcuts"),
    setToggle("autoTop", "Show most visited sites", "Fill the start page with the sites you open most, next to your own shortcuts."));
  return out;
}
function secLayout() {
  return [secHead("Layout", "layout"),
    setToggle("vertTabs", "Vertical tabs", "Move the tab strip to a side panel. Shortcut: " + (comboLabel("toggleVertical") || "none"))];
}
function bgPreview(bg) {
  const v = String(bg.value || "");
  let img = "";
  if (bg.type === "gradient") { const g = BGS.gradients.find((x) => x[0] === v); img = g ? g[2] : ""; }
  else if (bg.type === "image" && BGS.images.some((x) => x[0] === v)) img = 'url("lodica://search/bg/' + v + '.svg") center/cover';
  else if (bg.type === "custom" && /^[\w.-]+$/.test(v)) img = 'url("lodica://search/_bg/' + v + '") center/cover';
  else if (bg.type === "color" && /^#[0-9a-f]{6}$/i.test(v)) img = v;
  if (!img) return h("div", { class: "set-note", text: "Pick a background above to see a preview." });
  return h("div", { class: "bg-prev" },
    h("div", { class: "bg-prev-img", style: "background:" + img + ";filter:blur(" + Math.round((bg.blur || 0) / 4) + "px)" }),
    h("div", { class: "bg-prev-dim", style: "opacity:" + (bg.dim || 0) / 100 }),
    h("div", { class: "bg-prev-bar" }, "Search the web"));
}
function setSlider(title, val, min, max, set) {
  const out = h("span", { class: "val", text: String(val) });
  const inp = h("input", { type: "range", min, max, value: val, class: "set-range", on: {
    input: (e) => { out.textContent = e.target.value; },
    change: (e) => set(Number(e.target.value)),
  } });
  return setRow(title, null, h("span", { class: "range-side" }, inp, out));
}

// Privacy & blocking extras
const SPELL_LANGS = [["en", "English"], ["nl", "Nederlands"], ["de", "Deutsch"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"],
  ["pt", "Português"], ["sv", "Svenska"], ["da", "Dansk"], ["pl", "Polski"]];
function secSpell() {
  const langs = S.prefs.spellLangs || ["en"];
  const pick = (k) => {
    const next = langs.includes(k) ? langs.filter((x) => x !== k) : langs.concat(k);
    setPref("spellLangs", next.length ? next : [k]);
  };
  return [secHead("Spelling", "spelling"),
    setToggle("spell", "Check spelling", "Words are checked against every language you pick below. A word that is right in any one of them is left alone"),
    setToggle("spellAuto", "Correct automatically", "Off: right-click a misspelled word to see the suggestions. On: fix it when you type a space or punctuation, Backspace undoes it"),
    h("div", { class: "chips" }, SPELL_LANGS.map(([k, n]) => h("button", { class: "chip" + (langs.includes(k) ? " sel" : ""), act: () => pick(k), text: n })))];
}
function secBlocking() {
  return [secHead("Blocking", "blocking"), setToggle("cookieReject", "Reject cookie banners", "Click “Reject all” or hide consent pop-ups")];
}
function secSuggest() {
  return [secHead("Address bar suggestions", "suggest"),
    setToggle("historySuggest", "Suggest from history", "Offer visited pages and past searches while typing. Stays on this device"),
    setRow("Clear suggestions", "Forget past searches used for suggestions", null, async () => {
      await inv("history.clearSuggest"); toast("Suggestions cleared");
    })];
}

// Server & mail: hidden email. Identity & passwords: browser identity.
function secServer() {
  const noDummy = S.prefs.noDummy || [];
  const out = [].concat(secVps());
  if (S.relayAvail) out.push(secHead("Hidden email", "mail"),
    setToggle("dummyLogin", "Hidden email", "Offer a private @example.com address and a full fake identity on sign-up forms"),
    setRow("Sites without the hidden-email button", noDummy.length ? noDummy.join(", ") : "None. The button shows on sign-up pages",
      noDummy.length ? "Clear" : null, noDummy.length ? () => setPref("noDummy", []) : null),
    h("div", { class: "set-note", text: "On a sign-up form, right-click a field and choose Use hidden email. One use fills name, address, phone, birth date, username and email with one consistent identity." }));
  return out;
}
function secIdentity() {
  return [secHead("Browser identity", "identity"), setSelect("Identify as", null, S.agents, "userAgent")];
}

// Keybinds & controls
const MOUSE_ACTIONS = [{ key: "none", label: "Nothing" }, { key: "back", label: "Back" }, { key: "forward", label: "Forward" },
  { key: "prevTab", label: "Previous tab" }, { key: "nextTab", label: "Next tab" }, { key: "closeTab", label: "Close tab" },
  { key: "newTab", label: "New tab" }, { key: "reload", label: "Reload" }];
function comboLabel(id) {
  const a = (SET.keys || []).find((x) => x.id === id);
  return a && a.keys && a.keys.length ? a.keys.join(" / ") : "";
}
function loadKeyList() {
  return inv("keys.list").then((r) => { SET.keys = (r && r.actions) || []; refreshSettings(); }).catch(() => {});
}
function applyKeyList(list) { if (Array.isArray(list)) { SET.keys = list; refreshSettings(); } }
function startCapture(id) {
  SET.cap = id;
  SET.capture = (e) => {
    if (e.key === "Escape") { SET.cancelCapture(); e.preventDefault(); e.stopPropagation(); return true; }
    const c = comboOf(e);
    e.preventDefault(); e.stopPropagation();
    if (!c) return true; // modifier alone: wait for the real key
    const a = SET.keys.find((x) => x.id === id);
    const keys = a ? a.keys.filter((k) => k !== c).concat(c) : [c];
    SET.cap = null; SET.capture = null;
    inv("keys.bind", id, keys).then(applyKeyList);
    return true;
  };
  refreshSettings();
}
SET.cancelCapture = () => { if (!SET.cap) return; SET.cap = null; SET.capture = null; refreshSettings(); };

function keyRow(a) {
  const cap = SET.cap === a.id;
  const side = h("span", { class: "key-side" },
    a.keys.map((k) => h("span", { class: "key-chip" }, h("span", { text: k }),
      h("button", { class: "key-x", title: "Remove", text: "×", act: () => inv("keys.bind", a.id, a.keys.filter((x) => x !== k)).then(applyKeyList) }))),
    cap ? h("span", { class: "key-chip cap", text: "Press keys…" })
      : h("button", { class: "key-add", title: "Add shortcut", text: a.keys.length ? "+" : "Set", act: () => startCapture(a.id) }),
    h("button", { class: "key-reset", title: "Reset to default", text: "↺", act: () => inv("keys.reset", a.id).then(applyKeyList) }));
  return setRow(a.label, null, side);
}
function secKeys() {
  if (!SET.keys) loadKeyList();
  const out = [secHead("Shortcuts", "keys")];
  if (!SET.keys) return out.concat(setRow("Loading…", null));
  SET.keys.forEach((a) => out.push(keyRow(a)));
  out.push(setRow("Reset all shortcuts", null, null, async () => {
    if (await confirmDialog({ title: "Reset shortcuts?", message: "Every shortcut returns to its default.", ok: "Reset" })) inv("keys.reset").then(applyKeyList);
  }, "danger-row"));
  const m = Object.assign({ middle: "closeTab", back: "back", forward: "forward" }, S.prefs.mouse);
  const pick = (title, key) => setRow(title, null, h("select", { on: { change: (e) => setPref("mouse", Object.assign({}, m, { [key]: e.target.value })) } },
    MOUSE_ACTIONS.map((o) => h("option", { value: o.key, text: o.label, selected: o.key === m[key] }))));
  out.push(secHead("Mouse buttons", "mouse"), pick("Middle click on a tab", "middle"), pick("Back button (4)", "back"), pick("Forward button (5)", "forward"),
    secHead("On-screen keyboard", "osk"),
    setRow("Open on-screen keyboard", "Shortcut: " + (comboLabel("osk") || "none"), ico("chevron", "chev"), () => inv("osk")));
  out.push(secHead("Keyboard-and-mouse sites", "desktopinput"),
    h("div", { class: "set-note", text: "These sites always get the desktop identity, even in a tab set to the mobile site, so games that refuse touch browsers keep working." }));
  const ov = S.prefs.siteOverrides || {};
  Object.keys(ov).forEach((host) => {
    const on = !!(ov[host] && ov[host].desktopInput);
    out.push(setRow(host, null, toggleEl(on), () => setPref("siteOverrides", Object.assign({}, ov, { [host]: Object.assign({}, ov[host], { desktopInput: !on }) }))));
  });
  out.push(setRow("Add a site", "Type a hostname, e.g. example.com", h("input", { class: "set-input", type: "text", placeholder: "example.com", on: { keydown: (e) => {
    if (e.key !== "Enter") return;
    const host = e.target.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) setPref("siteOverrides", Object.assign({}, ov, { [host]: { desktopInput: true } }));
  } } })));
  return out;
}
