// "Remind me" for a page: persisted timers that post a notification reopening the URL.
const { Notification } = require("electron");
const store = require("./store");

const MAX_DELAY = 2 ** 31 - 1;
let deps = null;
let items = store.load("reminders", []).filter(r => r && r.url && r.at);
const timers = new Map();
const persist = () => store.save("reminders", () => items, 300);

function fire(r) {
  items = items.filter(x => x !== r);
  timers.delete(r);
  persist();
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: "Reminder", body: r.title || r.url, silent: false });
  n.on("click", () => {
    const win = deps.win();
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    deps.tabs.create({ url: r.url });
  });
  n.show();
}

function arm(r) {
  const wait = r.at - Date.now();
  if (wait <= 0) return fire(r);
  const t = setTimeout(() => (r.at - Date.now() > 1000 ? arm(r) : fire(r)), Math.min(wait, MAX_DELAY));
  timers.set(r, t);
}

const fmt = ts => new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function set(ts) {
  const t = deps?.tabs.current();
  const at = Number(ts);
  if (!t || !/^https?:/.test(t.url)) return { ok: false, text: "Nothing to remind about here" };
  if (!Number.isFinite(at) || at <= Date.now()) return { ok: false, text: "Pick a time in the future" };
  const r = { url: t.url, title: t.title || t.url, at };
  if (!t.private) { items.push(r); persist(); }
  arm(r);
  return { ok: true, text: "Reminder set for " + fmt(at) };
}

function init(d) {
  deps = d;
  for (const r of items.slice()) arm(r);
}

module.exports = { init, set };
