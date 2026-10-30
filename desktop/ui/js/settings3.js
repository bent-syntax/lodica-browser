"use strict";
// Settings tabs: Appearance, Keybinds & controls, Identity & mail, plus the tab bar itself.

// [id, label, group]: the sidebar shows one heading per group, then its pages. Same pages and order as Android.
const SET_TABS = [
  ["general", "General", ""], ["privacy", "Privacy", ""], ["passwords", "Passwords", ""], ["server", "Your VPS", ""], ["ai", "Ask AI", ""],
  ["search", "Search", ""], ["theme", "Appearance", ""], ["downloads", "Downloads", ""], ["data", "Data use", ""], ["about", "Updates & About", ""]];
// Section ids that other code passes to openSettings() -> the page that holds them.
const SET_SECTION_TAB = { search: "search", suggest: "search", browsing: "general", dns: "general", ai: "ai", theme: "theme", appearance: "theme", pages: "theme",
  background: "general", shortcuts: "general", planner: "general", start: "general", tabs: "general", pctabs: "general", layout: "general", privacy: "privacy", https: "privacy", blocking: "privacy",
  security: "privacy", vps: "server", server: "server", mail: "server", data: "data", apps: "general", extensions: "general", keys: "general", keybinds: "general",
  identity: "passwords", auth: "passwords", authenticator: "passwords", passwords: "passwords", downloads: "downloads", about: "about", updates: "about" };

const SET_ICONS = { general: "settings", privacy: "shield", passwords: "key", server: "vpn", ai: "ai", search: "search", theme: "palette",
  downloads: "download", data: "data", about: "reader" };
function setTabBar() {
  const out = []; let last = "";
  for (const [id, label, group] of SET_TABS) {
    if (group && group !== last) { out.push(h("div", { class: "sp-group", text: group })); last = group; }
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
    case "general": return [secBrowsing(), secDns(), secStart(), secLayout(), secTabs(), secPcTabs(), secEmojis(), secKeys(), secApps(), secExtensions()];
    case "passwords": return [secIdentity(), typeof secAuth === "function" ? secAuth() : []];
    case "downloads": return [secHead("Downloads", "downloads"), setRow("Open downloads", "Files saved from the web", ico("chevron", "chev"), () => openDownloads())];
    case "ai": return secAi();
    case "theme": return [secTheme(), secDarkPages()];
    case "privacy": return [secPrivacy(), secHttps(), secBlocking(), secSpell(), secTranslate()];
    case "data": return secData();
    case "server": return secServer();
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
// Reads the colours the applied theme really paints (built-in, plugin or system) as #rrggbb, so it can be forked into a custom theme.
function appliedColours() {
  const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const hexOf = (name, fb) => {
    const probe = h("i", { style: "color:var(" + name + ");display:none" });
    document.body.append(probe);
    cx.fillStyle = "#000"; cx.fillStyle = getComputedStyle(probe).color;
    probe.remove();
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return d[3] ? "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("") : fb;
  };
  return { bg: hexOf("--bg", "#111827"), text: hexOf("--text", "#e5e7eb"), accent: hexOf("--amber", "#f59e0b"), accent2: hexOf("--coral", "#f43f5e"),
    raised: hexOf("--raised", "#1f2937"), high: hexOf("--high", "#374151"), muted: hexOf("--muted", "#9ca3af") };
}
function themeEditor() {
  const c = Object.assign({}, PREVIEW_DEFAULT, S.prefs.customTheme);
  const cur = { bg: c.bg, text: c.text, accent: c.accent, accent2: c.accent2 };
  for (const k of ["raised", "high", "muted"]) if (c[k]) cur[k] = c[k];
  const on = (S.prefs.theme || "system") === "custom";
  const opt = (key, label, mixPct) => {
    const fallback = () => cur[key] || "#" + [0, 1, 2].map((i) => {
      const f = (hex) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
      return Math.round(f(cur.text) * mixPct / 100 + f(cur.bg) * (100 - mixPct) / 100).toString(16).padStart(2, "0");
    }).join("");
    return h("label", { class: "ct-field" }, h("span", { text: label }),
      h("input", { type: "color", value: fallback(), on: {
        input: (e) => { cur[key] = e.target.value; paintPreview(cur); },
        change: (e) => { cur[key] = e.target.value; inv("theme.custom", cur, (S.prefs.theme || "system") === "custom"); } } }));
  };
  const field = (key, label) => h("label", { class: "ct-field" }, h("span", { text: label }),
    h("input", { type: "color", value: cur[key], on: {
      input: (e) => { cur[key] = e.target.value; paintPreview(cur); },
      change: (e) => { cur[key] = e.target.value; inv("theme.custom", cur, (S.prefs.theme || "system") === "custom"); } } }));
  return h("div", { class: "ct" },
    h("div", { class: "ct-row" }, field("bg", "Background"), field("text", "Text"), field("accent", "Accent"), field("accent2", "Second accent")),
    h("div", { class: "ct-row" }, opt("raised", "Panels", 8), opt("high", "Hover", 16), opt("muted", "Muted text", 60)),
    h("div", { class: "ct-row" },
      h("button", { class: "ct-btn" + (on ? " sel" : ""), text: on ? "Using your theme" : "Use my theme", act: () => inv("theme.custom", cur, true) }),
      h("button", { class: "ct-btn", text: "Edit the applied theme", title: "Copy the colours of the theme in use into your custom theme", act: () => inv("theme.custom", appliedColours(), true) }),
      S.prefs.customTheme ? h("button", { class: "ct-btn", text: "Remove", act: () => { inv("theme.custom", null); if (on) setPref("theme", "system"); } }) : null),
    h("div", { class: "set-note", text: S.relayAvail ? "Your theme syncs to every device connected to your server." : "Your theme syncs to other devices once a server is connected." }));
}
function secTheme() {
  return [secHead("Theme", "theme"),
    h("div", { class: "swatches" }, THEMES.filter(([id]) => !HOLIDAY_IDS.includes(id)).map(([id, label, back, raised, accent]) =>
      h("button", { class: "theme-sw" + ((S.prefs.theme || "system") === id ? " sel" : ""), title: label, act: () => setPref("theme", id),
        on: { pointerenter: () => paintPreview(presetColours(id)), pointerleave: () => paintPreview(currentColours()) } },
        h("span", { class: "theme-chip", style: "background:" + back + ";border-color:" + raised },
          h("i", { style: "background:" + raised }), h("i", { style: "background:" + accent })),
        h("span", { class: "theme-name", text: label })))),
    h("div", { class: "set-note", text: "Themes colour the browser, start page and settings. Websites keep their own colours." }),
    secHead("Holidays", "holidays"), holidayList(),
    secHead("Preview", "preview"), themePreviewBox(), secHead("Custom theme", "custom"), themeEditor(),
    secHead("Theme plugins", "plugins"), pluginList()];
}
/** Holiday themes: claim one in the week either side of its holiday, then use it whenever you like. */
function holidayList() {
  const box = h("div", { class: "ct" });
  const when = (r) => r.days > 0 ? "Claimable in " + (r.days - 7) + (r.days - 7 === 1 ? " day" : " days") : "Missed this year";
  const draw = (list) => {
    const th = Object.fromEntries(THEMES.map((t) => [t[0], t]));
    box.replaceChildren(
      ...list.map((r) => {
        const t = th[r.id], using = (S.prefs.theme || "system") === r.id;
        const btn = r.claimed ? h("button", { class: "ct-btn" + (using ? " sel" : ""), text: using ? "Using" : "Use", act: () => setPref("theme", using ? "system" : r.id) })
          : r.claimable ? h("button", { class: "ct-btn", text: "Claim", act: async () => { if (await inv("holiday.claim", r.id)) { await setPref("theme", r.id); load(); } } })
          : h("button", { class: "ct-btn", text: "Locked", disabled: true, title: when(r) });
        return h("div", { class: "ct-row" },
          h("span", { class: "theme-chip", style: "width:32px;flex:none;background:" + t[2] + ";border-color:" + t[3] },
            h("i", { style: "background:" + t[3] }), h("i", { style: "background:" + t[4] })),
          h("span", { style: "flex:1", text: r.label + (r.claimed ? "" : r.claimable ? " (claim it now)" : " (" + when(r) + ")") }), btn);
      }),
      h("div", { class: "set-note", text: "Each holiday theme can be claimed from a week before to a week after its holiday. Once claimed it is yours for good, with its own effects." }),
      setToggle("holidayFx", "Holiday effects", "Falling snow, hearts and more over the start page and every tab. Move the mouse to push them."));
  };
  const load = () => inv("holiday.list").then((l) => draw(l || []));
  load();
  return box;
}
let pluginRows = null;
function pluginList() {
  const box = h("div", { class: "ct" });
  const draw = (list) => {
    const cur = S.prefs.themePlugin || "";
    box.replaceChildren(
      ...list.map((p) => h("div", { class: "ct-row" },
        h("span", { text: p.name + (p.author ? " by " + p.author : "") + (p.version ? " v" + p.version : ""), title: p.description }),
        h("button", { class: "ct-btn" + (cur === p.id ? " sel" : ""), text: cur === p.id ? "Using" : "Use", act: () => inv("plugins.use", cur === p.id ? "" : p.id) }))),
      h("div", { class: "ct-row" }, h("button", { class: "ct-btn", text: "Open plugins folder", act: () => inv("plugins.open") })),
      h("div", { class: "set-note", text: list.length ? "Plugins are folders with a plugin.json. They only change colours and styles, they never run code." : "No plugins yet. Put a plugin folder in the plugins folder and reopen this page." }));
  };
  if (pluginRows) draw(pluginRows);
  inv("plugins.list").then((l) => { pluginRows = l || []; draw(pluginRows); });
  return box;
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
    setToggle("autoTop", "Show most visited sites", "Fill the start page with the sites you open most, next to your own shortcuts."),
    setToggle("startNotes", "Show notes", "Show your newest notes from the shared Notebook on the start page."),
    setRow("Add a server emoji", "Pick a PNG or JPEG. It is shrunk and shared with everyone on your server. Names use a to z, 0 to 9 and _.", emojiAdder()),
    setRow("Notes notebook", "Which note the start page shows and adds to. Empty shows your newest notes.", notesPicker()),
    secHead("Smartschool planner", "planner"),
    setRow("Planner link", "Paste the ICS export link of your Smartschool planner. It shows on the start page. Leave empty to remove it.",
      h("input", { class: "set-input", type: "text", value: S.prefs.plannerIcs || "", placeholder: "https://…/planner.ics",
        on: { change: (e) => { S.prefs.plannerIcs = e.target.value.trim(); inv("prefs.set", "plannerIcs", S.prefs.plannerIcs); } } })),
    setToggle("plannerColors", "Colour tasks and tests", "Show Huistaak and Meebrengen events in yellow and Toets events in red."),
    setRow("Planner time zone", "Used for the clock marker and the lesson times. Empty is Brussels, \"local\" is this device.",
      h("input", { class: "set-input", type: "text", value: S.prefs.plannerTz || "", placeholder: "Europe/Brussels",
        on: { change: (e) => { S.prefs.plannerTz = e.target.value.trim().slice(0, 64); inv("prefs.set", "plannerTz", S.prefs.plannerTz); } } })),
    setRow("Subject per time slot", "One per line, like \"Mon 08:30-09:20 Maths\". Without a day it counts every day. It replaces the lessons in that slot. Tasks and tests stay.",
      h("textarea", { class: "field set-input", rows: String(slotRows(S.prefs.plannerSlots)), value: S.prefs.plannerSlots || "", placeholder: "Mon 08:30-09:20 Maths",
        on: { input: (e) => { e.target.rows = slotRows(e.target.value); }, change: (e) => { S.prefs.plannerSlots = e.target.value.slice(0, 4000); inv("prefs.set", "plannerSlots", S.prefs.plannerSlots); } } })),
    setPlace("plannerPos", "Planner position", "Where the planner sits on the start page.", "below"),
    setPlace("notesPos", "Notes position", "Where the notes sit on the start page. The planner and the notes can't share a place.", "left"));
  return out;
}
// Start page place of the planner or the notes. Picking the place the other one has moves the other to a free place.
function setPlace(key, title, sub, def) {
  const places = [{ key: "left", label: "Left" }, { key: "right", label: "Right" }, { key: "below", label: "Under the search bar" }];
  const other = key === "plannerPos" ? "notesPos" : "plannerPos", odef = key === "plannerPos" ? "left" : "below";
  const cur = S.prefs[key] || def;
  const sel = h("select", { on: { change: (e) => {
    const v = e.target.value;
    S.prefs[key] = v; inv("prefs.set", key, v);
    if ((S.prefs[other] || odef) === v) {
      const free = places.map((p) => p.key).find((p) => p !== v && p !== (S.prefs[other] || odef) && p !== cur) || places.map((p) => p.key).find((p) => p !== v);
      S.prefs[other] = free; inv("prefs.set", other, free);
    }
    refreshSettings();
  } } }, places.map((o) => h("option", { value: o.key, text: o.label, selected: o.key === cur })));
  return setRow(title, sub, sel);
}
function secLayout() {
  return [secHead("Layout", "layout"),
    setToggle("vertTabs", "Vertical tabs", "Move the tab strip to a side panel. Shortcut: " + (comboLabel("toggleVertical") || "none")),
    setToggle("barBottom", "Toolbar at bottom", "Put the address bar under the page instead of under the tabs."),
    secHead("Transparency", "transparency"),
    setSlider("Browser opacity", S.prefs.uiAlpha || 100, 30, 100, (v) => setPref("uiAlpha", v)),
    setToggle("uiBlur", "Blur behind window", "Frosted-glass look. Works on Windows, macOS and compositors that blur behind windows. Restart Lodica to apply the blur.")];
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
  const fill = (el) => el.style.setProperty("--fill", Math.round(100 * (el.value - min) / (max - min)) + "%");
  const inp = h("input", { type: "range", min, max, value: val, class: "set-range", on: {
    input: (e) => { out.textContent = e.target.value; fill(e.target); },
    change: (e) => set(Number(e.target.value)),
  } });
  fill(inp);
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
// The slot box grows with its lines (2 at least), so it needs no drag handle.
const slotRows = (v) => Math.max(2, String(v || "").split(/\r?\n/).length);
function secTranslate() {
  return [secHead("Translation", "translate"), setToggle("selTranslate", "Translate selected text", "Select Dutch text and the French translation appears next to it, select French and you get Dutch, with a Copy button. Off: a Translate button appears instead"),
    setToggle("translateAi", "Translate with Claude", "Uses your Claude key or Hearth connection from the AI settings for a more accurate translation. Falls back to the free service when AI is not connected")];
}
function secBlocking() {
  const ads = [setSelect("Ad blocking strength", "Light blocks ads. Standard also blocks trackers. Strict adds pop-ups, cookie notices and other annoyances. YouTube ads are blocked at every strength", [
    { key: "light", label: "Light" }, { key: "standard", label: "Standard" }, { key: "strict", label: "Strict" }], "adBlockLevel")];
  // Without a linked server the browser always does it.
  if (S.relayAvail) ads.push(setSelect("Block ads on", "This browser: the app blocks ads and trackers. My server: your Lodica server refuses ad and tracker domains for all your traffic, which then goes through the server. YouTube ads are still removed by the browser", [
    { key: "browser", label: "This browser" }, { key: "server", label: "My server" }], "adBlockMode"));
  return [secHead("Blocking", "blocking"), ...ads, setToggle("cookieReject", "Reject cookie banners", "Click “Reject all” or hide consent pop-ups"), setToggle("smartschoolMs", "Smartschool: sign in with Microsoft", "Click “Microsoft” on the Smartschool login page when you are already signed in to Microsoft. No password is stored")];
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
  out.push(setSelect("Chat size", "Size of server chat text and emojis", [
    { key: 100, label: "100%" }, { key: 125, label: "125%" }, { key: 150, label: "150%" }, { key: 200, label: "200%" }], "chatScale", Number));
  out.push(setSelect("Emoji size", "Size of server emojis in the chat, apart from the text size", [
    { key: 100, label: "Small" }, { key: 150, label: "Medium" }, { key: 200, label: "Large" }, { key: 300, label: "Extra large" }], "chatEmojiScale", Number));
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

// Select for the start page note; the list loads from the notebook after the section draws.
function emojiAdder() {
  const name = h("input", { placeholder: "name", maxlength: 32, style: "width:140px;min-width:0" });
  const msg = h("span", { class: "muted", style: "font-size:12px" });
  const pick = async () => {
    msg.textContent = "";
    const r = await inv("emojis.add", name.value.trim());
    msg.textContent = r?.error || (r?.ok ? "Added :" + r.name + ":" : "");
  };
  const go = h("button", { text: "Choose image", style: "white-space:nowrap;flex:none;padding:8px 16px", on: { click: pick } });
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); pick(); } });
  return h("div", { style: "display:flex;flex-direction:column;align-items:flex-end;gap:8px" }, [
    h("div", { style: "display:flex;gap:8px;align-items:center" }, [name, go]), msg]);
}

function notesPicker() {
  const sel = h("select", { on: { change: (e) => setPref("notesBook", e.target.value) } }, [h("option", { value: "", text: "Newest notes" })]);
  inv("notebook.list").then((list) => {
    for (const n of list || []) sel.append(h("option", { value: n.id, text: n.title || "Untitled note", selected: n.id === S.prefs.notesBook }));
  }).catch(() => {});
  return sel;
}
