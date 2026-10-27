// Browser assistant: a Hearth server with the user's own address and key, else an Anthropic API key, else the local `claude` CLI.
// The Anthropic and CLI paths use Haiku 5.5 only; Hearth picks the model itself ("auto").
const { spawn, execFile } = require("child_process");
const store = require("./store");
const memory = require("./memory");
const prefs = require("./prefs");

// Only Haiku is used, on purpose: cheap and fast. The CLI fallback takes the alias.
const MODEL = "claude-haiku-5-5";
const SYSTEM = [
  "You are Lodica's browser assistant. Plain text only, no markdown headings.",
  "Answer the question that was actually asked, directly. Keep it short for simple questions and thorough for hard ones.",
  "A 'Background about the user' list may follow. It is private context, not a topic. Use a fact only when the question is about the user or the fact changes the answer. Never mention, summarize or react to the list otherwise. A question unrelated to the list gets an answer unrelated to the list.",
  "If the user states a lasting fact about themselves, add a final line 'MEMO: <fact>' (one short fact). Add no MEMO line otherwise.",
  "Never invent facts. If unsure, say so.",
].join(" ");
const RESEARCH = " For factual, current or complex questions, research first: run one focused web search (never more), compare sources, then write one answer that states what is established, flags disagreement, and names the sources by site name.";
const FOLLOW_UP = " This is a follow-up in a conversation. Answer briefly, using the earlier messages.";
const MAX_CHATS = 100, MAX_MSGS = 200;
const KEEP_DAYS = 30;

let hearthAddr = null, hearthKey = null, hearthInfo = null;
let key = null, client = null, model = null, cli = false, onChange = () => {};
let usageData = null;

function init(deps = {}) {
  if (deps.onChange) onChange = deps.onChange;
  key = store.loadSecret("aikey", null) || null;
  hearthAddr = store.loadSecret("hearthaddr", null) || null;
  hearthKey = store.loadSecret("hearthkey", null) || null;
  execFile("claude", ["--version"], { timeout: 10000, windowsHide: true, shell: process.platform === "win32" }, err => {
    cli = !err;
    onChange(status());
  });
}

function status() {
  const hearth = !!(hearthAddr && hearthKey);
  const connected = hearth || !!key || cli;
  return { status: hearth ? "hearth" : key ? "api" : cli ? "cli" : "off", connected, hasKey: !!key, hearth: { address: hearthAddr || "", hasKey: !!hearthKey, info: hearthInfo } };
}

const hearthUrl = p => hearthAddr + p;
const hearthHeaders = () => ({ "x-api-key": hearthKey, "content-type": "application/json" });
/** Maps a Hearth status code to a message. 401 is never retried: repeated wrong keys block the address for 15 minutes. */
function hearthError(code) {
  if (code === 401) return "Hearth refused the key. Check it in Settings > AI.";
  if (code === 403) return "Hearth key may not use that model.";
  if (code === 429) return "Hearth is busy or the key hit its limit. Try again soon.";
  if (code === 502 || code === 504) return "Hearth could not answer. Try again.";
  return "Hearth answered " + code;
}

/** Saves the Hearth address and key after checking them with GET /v1/models. Both empty clears them. */
async function setHearth(addr, k) {
  const a = String(addr || "").trim().replace(/\/+$/, ""), kk = String(k || "").trim();
  if (!a && !kk) {
    hearthAddr = hearthKey = hearthInfo = null;
    store.saveSecret("hearthaddr", null); store.saveSecret("hearthkey", null);
    onChange(status());
    return { ok: true, ...status() };
  }
  if (!/^https?:\/\/[^\s/]+$/i.test(a) && !/^https?:\/\/[^\s/]+\/[^\s]*$/i.test(a)) return { ok: false, error: "Enter the Hearth address, like https://hearth.example.com" };
  if (!kk) return { ok: false, error: "Enter the Hearth key" };
  try {
    const r = await fetch(a + "/v1/models", { headers: { "x-api-key": kk }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: hearthError(r.status) };
    hearthInfo = await r.json().catch(() => null);
  } catch { return { ok: false, error: "Could not reach that address" }; }
  hearthAddr = a; hearthKey = kk;
  store.saveSecret("hearthaddr", a); store.saveSecret("hearthkey", kk);
  onChange(status());
  return { ok: true, ...status() };
}

// Hearth runs two requests at once for everyone, so ours go one at a time.
let hearthQueue = Promise.resolve();
function viaHearth(messages, system) {
  const job = hearthQueue.then(async () => {
    const body = JSON.stringify({ model: "auto", system, messages: messages.map(m => ({ role: m.role, content: String(m.content) })) });
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(hearthUrl("/v1/messages"), { method: "POST", headers: hearthHeaders(), body, signal: AbortSignal.timeout(300000) }); }
      catch { throw new Error("Could not reach Hearth"); }
      if (r.status === 429 && attempt === 0) { await new Promise(res => setTimeout(res, 3000)); continue; }
      if (!r.ok) throw new Error(hearthError(r.status));
      const j = await r.json();
      return { text: textOf(j), input: 0, output: 0 };
    }
  });
  hearthQueue = job.catch(() => {});
  return job;
}

function setKey(k) {
  key = String(k || "").trim() || null;
  store.saveSecret("aikey", key);
  client = null; model = null;
  onChange(status());
  return status();
}

function sdk() {
  if (!client) {
    const Anthropic = require("@anthropic-ai/sdk");
    client = new (Anthropic.default || Anthropic)({ apiKey: key, timeout: 60000, maxRetries: 1 });
  }
  return client;
}

const textOf = msg => (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();

/** One Haiku 5.5 call. Web search is tried first (deep research); when the org has it off the call retries without. */
async function viaApi(messages, system, search) {
  const c = sdk();
  const base = { model: MODEL, max_tokens: search ? 2048 : 1000, system: search ? system : system + FOLLOW_UP, messages };
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }];
  let input = 0, output = 0, msg, conv = messages.slice();
  const add = m => { const u = m.usage || {}; input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); output += u.output_tokens || 0; };
  try {
    if (!search) throw Object.assign(new Error("no search"), { status: 400 });
    for (let i = 0; i < 4; i++) {
      msg = await c.messages.create({ ...base, system: system + RESEARCH, tools, messages: conv });
      add(msg);
      if (msg.stop_reason !== "pause_turn") break;
      conv = conv.concat([{ role: "assistant", content: msg.content }]);
    }
  } catch (e) {
    if (e?.status !== 400 && e?.status !== 403) throw e;
    msg = await c.messages.create(base);
    add(msg);
  }
  if (msg.stop_reason === "refusal") throw new Error("The assistant declined to answer that.");
  return { text: textOf(msg), input, output };
}

function viaCli(prompt, system) {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", "--model", "claude-haiku-5-5", "--output-format", "json", "--append-system-prompt", system], {
      windowsHide: true, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error("AI took too long")); }, 75000);
    p.stdout.on("data", d => { out += d; });
    p.stderr.on("data", d => { err += d; });
    p.on("error", e => { clearTimeout(timer); reject(e); });
    p.on("close", () => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(String(j.result || "AI failed").slice(0, 200)));
        const u = j.usage || {};
        resolve({
          text: String(j.result || "").trim(),
          input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
          output: u.output_tokens || 0,
        });
      } catch { reject(new Error((err.trim() || out.trim() || "AI failed").slice(0, 200))); }
    });
    p.stdin.end(prompt);
  });
}

function usageStore() {
  if (!usageData) {
    usageData = store.load("ai-usage", { days: {}, all: { r: 0, i: 0, o: 0 } });
    if (!usageData.days) usageData.days = {};
    if (!usageData.all) usageData.all = { r: 0, i: 0, o: 0 };
  }
  return usageData;
}
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function record(input, output) {
  const u = usageStore(), k = dayKey();
  const d = u.days[k] || (u.days[k] = { r: 0, i: 0, o: 0 });
  d.r++; d.i += input; d.o += output;
  u.all.r++; u.all.i += input; u.all.o += output;
  const cut = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
  for (const day of Object.keys(u.days)) if (day < cut) delete u.days[day];
  store.save("ai-usage", () => usageData, 1000);
}

function usage() {
  const u = usageStore(), z = { r: 0, i: 0, o: 0 };
  const today = { ...z, ...(u.days[dayKey()] || {}) };
  const month = { ...z };
  for (const d of Object.values(u.days)) { month.r += d.r; month.i += d.i; month.o += d.o; }
  return { today, month, all: { ...u.all } };
}

function resetUsage() {
  usageData = { days: {}, all: { r: 0, i: 0, o: 0 } };
  store.save("ai-usage", () => usageData, 0);
  return usage();
}

const sysWithMemory = () => {
  const m = memory.block();
  return SYSTEM + (m ? "\n\n" + m : "");
};

/** Runs one turn over `history` ([{role,text}], last item is the user turn). Saves MEMO lines, returns {text} or {error}. */
async function run(history, ctx) {
  if (!status().connected) return { error: "AI is not connected" };
  // A first message may search (one search). Follow-ups never search and send a short tail with old answers clipped.
  const search = history.length === 1;
  const tail = history.slice(-6);
  const turns = tail.map((m, i) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.text).slice(0, i === tail.length - 1 ? 4000 : m.role === "assistant" ? 700 : 400),
  }));
  if (ctx) turns[turns.length - 1].content = "Page context (only if the question is about it):\n" + String(ctx).slice(0, 1200) + "\n\nQuestion: " + turns[turns.length - 1].content;
  const system = sysWithMemory();
  const r = hearthAddr && hearthKey ? await viaHearth(turns, system + (history.length === 1 ? "" : FOLLOW_UP)) : key ? await viaApi(turns, system, search) : await viaCli(turns.map(t => (t.role === "user" ? "User: " : "Assistant: ") + t.content).join("\n\n") + "\n\nAssistant:", system);
  record(r.input, r.output);
  const keep = [];
  for (const line of r.text.split("\n")) {
    const m = line.match(/^\s*MEMO:\s*(.+)$/i);
    if (m) memory.add(m[1]); else keep.push(line);
  }
  const text = keep.join("\n").trim();
  return text ? { text } : { error: "Empty answer" };
}

/** `prior` is earlier {role,text} turns of the same conversation, for follow-up questions. */
async function ask(q, ctx, prior) {
  const before = Array.isArray(prior) ? prior.slice(-10).map(m => ({ role: m && m.role === "assistant" ? "assistant" : "user", text: String(m && m.text || "") })) : [];
  try { return await run([...before, { role: "user", text: String(q || "").slice(0, 4000) }], ctx); }
  catch (e) { return { error: e?.message || "AI failed" }; }
}

// ---- chats: kept encrypted on this PC and mirrored to the linked phone through pctabs ----
let chats = null, onChats = () => {};
const chatDir = () => (typeof prefs.p.aiChatDir === "string" && prefs.p.aiChatDir) || undefined;
const chatList = () => {
  if (!chats) { chats = store.loadSecret("aichats", [], chatDir()); if (!Array.isArray(chats)) chats = []; }
  return chats;
};
const saveChats = () => { store.saveSecret("aichats", chats, chatDir()); onChats(); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function chatsGet() {
  return chatList().filter(c => !c.deleted).map(c => ({ id: c.id, title: c.title, updated: c.updated, messages: c.messages })).sort((a, b) => b.updated - a.updated);
}

async function chatSend(id, text) {
  text = String(text || "").trim().slice(0, 4000);
  if (!text) return { error: "Empty message" };
  const list = chatList();
  let c = list.find(x => x.id === id);
  if (!c) { c = { id: newId(), title: text.slice(0, 48), updated: Date.now(), messages: [] }; list.push(c); }
  c.messages.push({ role: "user", text, t: Date.now() });
  let r;
  try { r = await run(c.messages); } catch (e) { r = { error: e?.message || "AI failed" }; }
  if (r.text) c.messages.push({ role: "assistant", text: r.text, t: Date.now() });
  else c.messages.pop();
  c.updated = Date.now();
  while (list.length > MAX_CHATS) list.sort((a, b) => a.updated - b.updated).shift();
  if (c.messages.length > MAX_MSGS) c.messages.splice(0, c.messages.length - MAX_MSGS);
  saveChats();
  return { id: c.id, ...(r.text ? { text: r.text } : { error: r.error }) };
}

function chatDelete(id) {
  const list = chatList(), i = list.findIndex(c => c.id === id);
  if (i >= 0) { list[i] = { id, deleted: true, updated: Date.now(), title: "", messages: [] }; saveChats(); }
  return chatsGet();
}

/** Merge a copy from the phone: newest `updated` wins per chat id, tombstones included. */
function chatMerge(remote) {
  if (!Array.isArray(remote)) return;
  const list = chatList();
  let changed = false;
  for (const r of remote.slice(0, MAX_CHATS)) {
    if (!r || typeof r.id !== "string" || !Array.isArray(r.messages)) continue;
    const mine = list.find(c => c.id === r.id);
    if (mine && mine.updated >= (Number(r.updated) || 0)) continue;
    const next = {
      id: r.id, title: String(r.title || "").slice(0, 80), updated: Number(r.updated) || 0, deleted: !!r.deleted,
      messages: r.messages.slice(-MAX_MSGS).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", text: String(m.text || "").slice(0, 8000), t: Number(m.t) || 0 })),
    };
    if (mine) Object.assign(mine, next); else list.push(next);
    changed = true;
  }
  if (changed) saveChats();
}

const chatsRaw = () => chatList().slice();
/** Use [dir] for the chat file ("" = default). Chats already in the new folder are merged with the current ones. */
function chatsSetDir(dir) {
  const cur = chatList().map(c => Object.assign({}, c));
  prefs.set("aiChatDir", dir);
  chats = null;
  chatMerge(cur);
  saveChats();
  return chatsGet();
}
function onChatsChange(fn) { onChats = fn; }

module.exports = {
  init, ask, status, setKey, setHearth, viaHearth, usage, resetUsage,
  memory: { get: memory.get, set: memory.set },
  chats: { get: chatsGet, send: chatSend, delete: chatDelete, merge: chatMerge, setDir: chatsSetDir, dir: () => chatDir() || "", raw: chatsRaw, onChange: onChatsChange },
  MODEL,
  SYSTEM,
};
