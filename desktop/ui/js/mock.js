"use strict";
let mockChats = [{ id: "c1", title: "Best pizza dough", updated: 1, messages: [{ role: "user", text: "Best pizza dough?" }, { role: "assistant", text: "Use 65% hydration." }] }];
// Dev-only fake of the preload bridge. Loaded by boot.js only when window.lodica is missing.
// Use window.mockEmit(event, data) from the console to simulate pushes from main.
(function () {
  const subs = {};
  const emit = (ev, d) => (subs[ev] || []).forEach((fn) => setTimeout(() => fn(d), 0));
  const now = Date.now(), H = 3600e3;
  const prefs = { search: "DUCKDUCKGO", userAgent: "DEFAULT", language: "AUTO", autoArchiveDays: 7, pcTabs: false,
    speed: 1, quality: 720, ai: true };
  let tabs = [
    { id: 1, title: "Lodica — Home", url: "https://lodica.app/", private: false },
    { id: 2, title: "Wikipedia, the free encyclopedia", url: "https://en.wikipedia.org/wiki/Kite", private: false },
    { id: 3, title: "Hacker News", url: "https://news.ycombinator.com/", private: false },
    { id: 4, title: "Private search", url: "https://duckduckgo.com/?q=gifts", private: true },
  ];
  let cur = 2, locked = false;
  const tabInfo = (t) => ({ id: t.id, url: t.url, title: t.title, display: t.url.replace(/^https?:\/\/(www\.)?/, ""),
    host: new URL(t.url).host, home: false, private: t.private, secure: true, trusted: false, blocked: 14, loading: false,
    canBack: true, canForward: false, crashed: false, locked: false, speed: 1 });
  const curTab = () => tabInfo(tabs.find((t) => t.id === cur) || tabs[0]);
  const counts = () => ({ count: tabs.filter((t) => !t.private).length, privateCount: tabs.filter((t) => t.private).length });
  const pushTab = () => { emit("tab", curTab()); emit("tabs", counts()); };
  const history = [
    { id: 1, title: "Kite - Wikipedia", url: "https://en.wikipedia.org/wiki/Kite", time: now - 0.2 * H },
    { id: 2, title: "Hacker News", url: "https://news.ycombinator.com/", time: now - 2 * H },
    { id: 3, title: "Weather Brussels", url: "https://www.meteo.be/", time: now - 26 * H },
  ];
  const downloads = [
    { id: "a", name: "report-2026.pdf", url: "https://example.com/report.pdf", state: "completed", received: 2.4e6, total: 2.4e6 },
    { id: "b", name: "ubuntu.iso", url: "https://releases.ubuntu.com/u.iso", state: "progressing", received: 1.1e9, total: 5.7e9, paused: false },
  ];
  const vault = [{ origin: "https://github.com", user: "bent" }, { origin: "https://mail.example.com", user: "me@example.com" }];
  let memory = ["Prefers terse answers", "Lives in Belgium"];
  const relay = { available: true, connected: true, aliases: [{ alias: "kite42@relay.lodica.app", site: "shop.example" }],
    mail: [{ id: "m1", from: "shop.example", subject: "Verify your email", time: now - H, link: "https://shop.example/verify" }] };

  const handlers = {
    init: () => ({ prefs, version: "1.0.0-dev", chromium: "128.0", ghostery: "10.4",
      engines: { DUCKDUCKGO: "DuckDuckGo", GOOGLE: "Google", BING: "Bing", BRAVE: "Brave", STARTPAGE: "Startpage" },
      agents: { DEFAULT: "Default", CHROME: "Chrome desktop", FIREFOX: "Firefox desktop", MOBILE: "Mobile" },
      languages: { AUTO: "Automatic", en: "English", nl: "Nederlands", fr: "Français" },
      qualities: [144, 240, 360, 480, 720, 1080, 1440, 2160],
      tab: curTab(), tabs: counts(), ai: { connected: true, model: "claude", used: 1200, limit: 50000 },
      relay, locked, pinSet: true }),
    layout: () => true,
    "tab.list": () => ({ tabs: tabs.map((t) => ({ ...t, current: t.id === cur })),
      archived: [{ id: 9, title: "Old recipe", url: "https://cooking.example/soup", time: now - 9 * 24 * H }],
      closed: [{ id: 11, title: "Closed page", url: "https://example.org/", time: now - 300e3 }] }),
    "tab.select": (id) => { cur = id; pushTab(); },
    "tab.new": (o = {}) => { const id = Math.max(...tabs.map((t) => t.id)) + 1;
      tabs.push({ id, title: o.url || "New tab", url: o.url && /^https?:/.test(o.url) ? o.url : "https://lodica.app/", private: !!o.private });
      if (!o.background) cur = id; pushTab(); },
    "tab.close": (id) => { tabs = tabs.filter((t) => t.id !== id); if (cur === id && tabs.length) cur = tabs[0].id; pushTab(); },
    "tab.closeAll": (priv) => { tabs = tabs.filter((t) => !!t.private !== !!priv);
      if (!tabs.length) tabs.push({ id: 99, title: "Home", url: "https://lodica.app/", private: false });
      cur = tabs[0].id; pushTab(); },
    "tab.thumb": () => "",
    "private.unlock": (pin) => { const ok = pin === "1234"; if (ok) { locked = false; emit("locked", { on: false }); } return ok; },
    "private.lock": () => { locked = true; emit("locked", { on: true }); },
    go: (text) => { const t = tabs.find((x) => x.id === cur); t.url = /^https?:/.test(text) ? text : "https://duckduckgo.com/?q=" + encodeURIComponent(text);
      t.title = text; pushTab(); },
    suggest: (q) => [q + " meaning", q + " weather", { title: "Wikipedia: " + q, url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(q) }],
    topSites: () => tabs.filter((t) => !t.private).map((t) => ({ title: t.title, url: t.url })),
    "history.list": (q) => history.filter((r) => !q || (r.title + r.url).toLowerCase().includes(q.toLowerCase())),
    "downloads.list": () => downloads,
    "update.status": () => ({ state: "idle" }),
    "support.open": () => ({ messages: [], open: false }),
    "support.linkStart": () => ({ ok: true }),
    "support.linkVerify": (e) => ({ messages: [], open: false, email: e }),
    "support.unlink": () => ({ messages: [], open: false, email: "" }),
    "support.send": (t) => ({ messages: [{ fromUser: true, text: t }], status: "new", open: true }),
    "update.versions": () => [{ tag: "v1.0.0", name: "v1.0.0", date: "2026-01-01", current: true }],
    "update.pick": () => ({ state: "idle" }),
    "update.check": () => ({ state: "latest", version: "1.0.0" }),
    "vault.state": () => ({ pinSet: true, unlocked: false }),
    "vault.unlock": (pin) => pin === "1234",
    "vault.list": () => vault,
    "meter.list": () => ({ total: { blocked: 1832, saved: 48e6 }, hosts: [
      { host: "news.example.com", blocked: 640, saved: 21e6 }, { host: "en.wikipedia.org", blocked: 12, saved: 0.4e6 }] }),
    "relay.state": () => relay,
    "ai.chats": () => mockChats,
    "ai.chat.send": (id, text) => { let c = mockChats.find((x) => x.id === id); if (!c) mockChats.unshift(c = { id: "c" + Date.now(), title: text.slice(0, 40), updated: Date.now(), messages: [] });
      c.messages.push({ role: "user", text }, { role: "assistant", text: "Mock reply: " + text }); return Promise.resolve({ id: c.id, text: "ok" }); },
    "ai.chat.delete": (id) => { mockChats = mockChats.filter((x) => x.id !== id); return mockChats; },
    "ai.chat.dir": () => "",
    "ai.chat.pickDir": (reset) => (reset ? "" : "/home/user/lodica-chats"),
    "ai.memory.get": () => memory,
    "ai.memory.set": (text) => { memory = String(text || "").split("\n").filter(Boolean); return true; },
    "ai.usage": () => ({ used: 1200, limit: 50000, days: [{ day: "Today", tokens: 1200 }] }),
    "ai.ask": (q) => new Promise((r) => setTimeout(() => r({ text: "Mock answer for: " + q }), 600)),
    reader: () => ({ title: "Kite", text: "A kite is a tethered heavier-than-air craft.\n\nKites have a long history." }),
    "webapps.list": () => [{ id: "w1", name: "Mail", url: "https://mail.example.com" }],
    "webapps.install": () => ({ name: "Example" }),
    "prefs.set": (k, v) => { prefs[k] = v; emit("prefs", prefs); return true; },
  };

  window.lodica = {
    invoke: async (cmd, ...args) => {
      const fn = handlers[cmd];
      const r = fn ? await fn(...args) : null;
      if (!fn) console.debug("[mock] invoke", cmd, args);
      return r === undefined ? true : r;
    },
    on: (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); return () => { subs[ev] = subs[ev].filter((f) => f !== fn); }; },
  };
  window.mockEmit = emit;
  document.documentElement.classList.add("mock");
})();
