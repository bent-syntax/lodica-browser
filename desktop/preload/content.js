"use strict";

// Electron bridge: the helper "port" talks to the main process over IPC.
const { ipcRenderer, webFrame } = require("electron");
// Back/forward input (mouse buttons, two-finger swipe) works on every page, with or without the helper.
(() => {
  if (window === window.top) {
    // Mouse buttons 4 and 5 (Linux has no app-command): navigate history.
    window.addEventListener("mouseup", e => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        ipcRenderer.send("helper", { type: "nav", dir: e.button === 3 ? "back" : "forward" });
      }
    }, true);
    // Two fingers sideways on a touchpad: an arrow grows at the edge, and past the limit history goes back/forward.
    let sum = 0, sy = 0, last = 0, lock = 0, arrow = null, hide = 0;
    const LIMIT = 100;
    const canScroll = (el, dx) => {
      for (; el && el !== document.documentElement; el = el.parentElement) {
        const o = getComputedStyle(el).overflowX;
        if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 1) {
          if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
        }
      }
      return false;
    };
    const draw = (p, back) => {
      if (!document.documentElement) return;
      if (!arrow) {
        arrow = document.createElement("div");
        arrow.setAttribute("style", "position:fixed;top:50%;z-index:2147483647;width:44px;height:44px;margin-top:-22px;border-radius:50%;background:#1F2937;color:#F59E0B;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4);transition:opacity .15s");
        arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
      }
      if (!arrow.isConnected) document.documentElement.appendChild(arrow);
      const e = Math.min(1, p / LIMIT), off = Math.round(-44 + 72 * e);
      arrow.style.left = back ? off + "px" : "auto";
      arrow.style.right = back ? "auto" : off + "px";
      arrow.firstChild.style.transform = back ? "" : "scaleX(-1)";
      arrow.style.opacity = String(Math.max(.25, e));
      // Like Firefox: navigate when the fingers let go (wheel events stop), if the arrow was pulled past the limit.
      clearTimeout(hide); hide = setTimeout(() => {
        const go = Math.abs(sum) >= LIMIT, dir = sum < 0 ? "back" : "forward";
        sum = 0; sy = 0; arrow && arrow.remove();
        if (go) { lock = Date.now() + 700; ipcRenderer.send("helper", { type: "nav", dir, swipe: true }); }
      }, 160);
    };
    window.addEventListener("wheel", e => {
      const now = Date.now();
      if (now < lock || e.ctrlKey) return;
      if (now - last > 200) { sum = 0; sy = 0; }
      last = now;
      if (e.deltaX) ipcRenderer.send("helper", { type: "wheelx", dx: Math.round(e.deltaX), sum: Math.round(sum) });
      if (e.deltaX && canScroll(e.target, e.deltaX)) { sum = 0; sy = 0; return; }
      sum += e.deltaX; sy += e.deltaY;
      if (Math.abs(sum) <= Math.abs(sy) * 1.5) return;
      draw(Math.abs(sum), sum < 0);
    }, { capture: true, passive: true });
  }
})();

const browser = { runtime: { connectNative() {
  const port = {
    postMessage(m) { ipcRenderer.send("helper", m); },
    onMessage: { addListener(fn) { ipcRenderer.on("helper", (e, m) => fn(m)); } },
    onDisconnect: { addListener() {} },
  };
  ipcRenderer.send("helper", { type: "hello", top: window === window.top, host: location.hostname });
  return port;
} } };

// Spots email/login fields (also inside iframes and shadow DOM) and lets the app fill a hidden
// @your-domain alias, then the one-time code mailed to it. Reports sign-in pages so the app can
// keep those sites off the VPS. The top frame always connects so the menu action works on any
// page; subframes connect once they hold a field.
const lodicaMain = () => {
  const TOP = window === window.top;
  const KEY = /e-?mail|user-?name|login|identifier|account/i;
  const SKIP = /search|query|otp|code|phone|tel|zip|postal|captcha|coupon|promo/i;
  const TEXT = new Set(["", "text", "email"]);
  const CODE_TYPES = new Set(["", "text", "tel", "number"]);
  const CODE = /otp|one-?time|verif|code|pin|token|2fa|mfa|passcode/i;
  const NOT_CODE = /promo|coupon|discount|gift|zip|postal|country|area|phone|search/i;
  const LOGIN = /log-?in|sign-?(in|up|on)|regist|join|auth|account|identifier|verif/i;
  let port = null;
  let last = null;     // last focused email field
  let lastText = null; // last focused text input, used when nothing matches
  let seen = false;    // this frame has reported a field
  let login = false;   // this frame has reported a sign-in page
  let code = null;     // { value, until }: a code that arrived before its field showed up
  let user = "";       // last username typed or filled in this frame
  let sent = "";       // last login reported, so one submit isn't offered twice
  let signup = null;   // { d: identity from the app, until, pass: password used, done }: fills sign-up forms
  const SUBMIT = /log-?\s?in|sign-?\s?(in|on|up)|continue|next|submit|enter|verify|weiter|anmelden|connexion|inloggen|aanmelden|volgende|doorgaan/i;
  const TOGGLE = /show|hide|reveal|toon|verberg|zeig|eye/i;

  const attr = (el, n) => el.getAttribute(n) || "";

  function labelText(el) {
    let t = attr(el, "aria-label") + " " + attr(el, "placeholder");
    const root = el.getRootNode();
    for (const id of attr(el, "aria-labelledby").split(/\s+/)) {
      const l = id && root.getElementById ? root.getElementById(id) : null;
      if (l) t += " " + l.textContent;
    }
    if (el.labels) for (const l of el.labels) t += " " + l.textContent;
    return t;
  }

  function isText(el) {
    if (!el || el.tagName !== "INPUT" || el.disabled || el.readOnly) return false;
    return TEXT.has(attr(el, "type").toLowerCase());
  }

  function isEmailField(el) {
    if (!isText(el)) return false;
    if (attr(el, "type").toLowerCase() === "email" || attr(el, "inputmode").toLowerCase() === "email") return true;
    const ac = attr(el, "autocomplete").toLowerCase();
    if (/email|username/.test(ac)) return true;
    const ids = attr(el, "name") + " " + attr(el, "id");
    return KEY.test(ids + " " + labelText(el)) && !SKIP.test(ids + " " + ac);
  }

  function visible(el) {
    return el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  // All inputs (or other tags), piercing open and closed shadow roots.
  function inputs(root, out, tags = ["INPUT"]) {
    for (const el of root.querySelectorAll("*")) {
      if (tags.includes(el.tagName)) out.push(el);
      const sr = el.shadowRoot;
      if (sr) inputs(sr, out, tags);
    }
    return out;
  }

  function fields() {
    return inputs(document, []).filter((el) => isEmailField(el) && visible(el));
  }

  function active() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  // Sets a value the way typing would: the native setter (so framework value trackers notice the
  // change), then input, change and blur, which React, Vue and form validators listen for.
  function typeIn(el, v) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (v) { cleared.delete(el); clearedList.delete(el); typed.delete(el); } // an explicit fill from the app lifts the locks
    if (setter) setter.call(el, v); else el.value = v;
    el.dispatchEvent(el instanceof HTMLSelectElement
      ? new Event("input", { bubbles: true, composed: true })
      : new InputEvent("input", { bubbles: true, composed: true, data: v, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent("blur"));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));
  }

  function fill(value) {
    const a = active();
    const el = isEmailField(a) ? a
      : last && visible(last) ? last
      : fields()[0] || (isText(a) ? a : lastText && visible(lastText) ? lastText : null);
    if (!el) return false;
    el.focus();
    typeIn(el, value);
    user = value;
    return true;
  }

  function isCodeField(el) {
    if (!el || el.tagName !== "INPUT" || el.disabled || el.readOnly) return false;
    if (!CODE_TYPES.has(attr(el, "type").toLowerCase())) return false;
    const ac = attr(el, "autocomplete").toLowerCase();
    if (ac.includes("one-time-code")) return true;
    const t = attr(el, "name") + " " + attr(el, "id") + " " + labelText(el);
    if (NOT_CODE.test(t + " " + ac)) return false;
    if (CODE.test(t)) return true;
    const max = el.maxLength;
    return attr(el, "inputmode").toLowerCase() === "numeric" && (max === 1 || (max >= 4 && max <= 8));
  }

  const set = (el, v) => { el.focus(); typeIn(el, v); };

  // One input for the whole code, or one box per digit.
  function fillCode(value) {
    const all = inputs(document, []).filter((el) => visible(el) && isCodeField(el));
    const boxes = all.filter((el) => el.maxLength === 1);
    if (boxes.length >= value.length) {
      boxes.slice(0, value.length).forEach((el, i) => set(el, value[i]));
      boxes[value.length - 1].blur();
      return true;
    }
    const one = all.find((el) => el.maxLength !== 1);
    if (!one) return false;
    set(one, value);
    return true;
  }

  function tryCode() {
    if (!code) return;
    if (Date.now() > code.until) { code = null; return; }
    if (!fillCode(code.value)) return;
    code = null;
    if (port) port.postMessage({ type: "coded", ok: true });
  }

  // Password and code fields mean sign-in; email fields only when the page or label says so.
  function isLogin(el) {
    if (!el || el.tagName !== "INPUT" || !visible(el)) return false;
    if (attr(el, "type").toLowerCase() === "password") return true;
    if (attr(el, "autocomplete").toLowerCase().includes("one-time-code")) return true;
    return isEmailField(el) && LOGIN.test(location.href + " " + attr(el, "name") + " " + attr(el, "id") + " " + labelText(el));
  }

  function reportLogin() {
    if (login) return;
    login = true;
    connect();
    if (port) port.postMessage({ type: "login", host: location.hostname });
  }

  const SIGNUP = /sign-?\s?up|regist|create[-_ ]?(an[-_ ])?account|join|new[-_ ]?account|maak[-_ ]?(een[-_ ])?account/i;
  // Sign-up page: new-password field, two password fields, or sign-up wording. A lone current-password field is sign-in.
  function isSignup() {
    const all = inputs(document, []).filter(visible);
    const pw = all.filter((el) => attr(el, "type").toLowerCase() === "password");
    if (pw.some((el) => attr(el, "autocomplete").toLowerCase() === "new-password")) return true;
    if (pw.length >= 2) return true;
    if (pw.length === 1 && attr(pw[0], "autocomplete").toLowerCase() === "current-password") return false;
    if (SIGNUP.test(location.pathname + " " + location.search + " " + document.title)) return true;
    if (all.some((el) => isEmailField(el) && SIGNUP.test(attr(el, "name") + " " + attr(el, "id") + " " + labelText(el)))) return true;
    const BTN = /^\s*(sign\s?up|create (an )?account|register|registreer|join|get started|maak (een )?account)\b/i;
    return [...document.querySelectorAll("h1, h2, button, input[type=submit]")].slice(0, 40)
      .some((el) => el.getClientRects().length > 0 && BTN.test(el.value || el.textContent || ""));
  }

  function report() {
    if (port) port.postMessage({ type: "email", focused: isEmailField(active()), signup: isSignup() });
  }

  function connect() {
    if (port) return;
    try {
      port = browser.runtime.connectNative("lodica");
    } catch (e) {
      return;
    }
    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg.value !== "string") return;
      if (msg.type === "fill") {
        const ok = fill(msg.value);
        port.postMessage({ type: "filled", ok });
        if (ok) startSignup(msg);
      }
      if (msg.type === "signup") startSignup(msg);
      if (msg.type === "reader" && TOP) port.postMessage(article());
      if (msg.type === "code") {
        code = { value: msg.value, until: Date.now() + 120000 };
        tryCode();
        if (code) watch();
      }
    });
    port.onDisconnect.addListener(() => { port = null; });
    if (seen) report();
  }

  function found() {
    if (seen) return;
    seen = true;
    if (port) report(); else connect();
  }

  // Closed shadow roots retarget the event to the host; fall back to the deep active element.
  const target = (e) => {
    const p = e.composedPath()[0];
    return p && p.tagName === "INPUT" ? p : active();
  };

  document.addEventListener("focusin", (e) => {
    const el = target(e);
    if (isText(el)) lastText = el;
    if (isLogin(el)) reportLogin();
    // A verification-code box: ask the app for a saved authenticator code for this site.
    if (el && el.tagName === "INPUT" && isCodeField(el)) { connect(); if (port) port.postMessage({ type: "codefield", host: location.hostname }); }
    if (!isEmailField(el)) return;
    last = el;
    found();
    if (port) port.postMessage({ type: "focus", on: true, signup: isSignup() });
  }, true);
  document.addEventListener("focusout", () => {
    if (port) setTimeout(() => { if (port) port.postMessage({ type: "focus", on: isEmailField(active()), signup: isSignup() }); }, 0);
  }, true);

  const isPassword = (el) => el && el.tagName === "INPUT" && attr(el, "type").toLowerCase() === "password";

  function noteUser(el) {
    if (!isEmailField(el)) return;
    const v = el.value.trim();
    if (!v || v === user) return;
    user = v;
    connect();
    if (port) port.postMessage({ type: "user", host: location.hostname, value: v });
  }

  // A login field the user emptied by hand stays empty: Gecko's saved-login fill (untrusted input
  // events) must not refill it. Typing in it again lifts the lock.
  const cleared = new WeakSet();
  // What the user typed in a login field: a later untrusted fill (Gecko saved login) must not overwrite it.
  const typed = new WeakMap();
  // Gecko's fill may set .value without any event, so emptied fields are also re-checked on a timer.
  const clearedList = new Set();
  let clearTick = 0;
  function watchCleared() {
    if (clearTick) return;
    clearTick = setInterval(() => {
      for (const el of clearedList) {
        if (!el.isConnected) clearedList.delete(el);
        else if (el.value && cleared.has(el)) el.value = "";
      }
      if (!clearedList.size) { clearInterval(clearTick); clearTick = 0; }
    }, 300);
  }
  function credField(el) {
    return el instanceof HTMLInputElement && (isPassword(el) || isEmailField(el) || /username|current-password/i.test(attr(el, "autocomplete")));
  }
  for (const type of ["input", "change"]) {
    document.addEventListener(type, (e) => {
      const el = e.target;
      if (!credField(el)) return;
      if (e.isTrusted) { if (el.value) { cleared.delete(el); clearedList.delete(el); typed.set(el, el.value); } else { typed.delete(el); cleared.add(el); clearedList.add(el); watchCleared(); } }
      else if (cleared.has(el) && el.value) el.value = "";
      else if (typed.has(el) && el.value !== typed.get(el)) el.value = typed.get(el);
    }, true);
  }

  // Gecko only offers to save on a classic form submit; script logins, alias fills and two-step
  // pages slip past it, so report what was typed when the user sends the form. Stays on the phone.
  function capture() {
    const all = inputs(document, []);
    const u = all.find((el) => isEmailField(el) && el.value.trim() && visible(el));
    if (u) noteUser(u);
    const pws = all.filter((el) => isPassword(el) && el.value);
    if (!pws.length) return;
    const pass = (pws.length >= 3 ? pws[1] : pws[0]).value; // change-password forms: current, new, confirm
    if (signup && pass === signup.pass) return; // the app already stored the generated login
    const name = u ? u.value.trim() : user;
    const key = name + "\n" + pass;
    if (key === sent) return;
    sent = key;
    connect();
    if (port) port.postMessage({ type: "creds", origin: location.origin, user: name, pass });
  }

  function isSubmit(e) {
    for (const el of e.composedPath()) {
      if (!el.tagName) continue;
      const tag = el.tagName;
      const type = attr(el, "type").toLowerCase();
      const button = tag === "BUTTON" || (tag === "INPUT" && /^(submit|button|image)$/.test(type)) || attr(el, "role") === "button";
      if (!button) continue;
      const text = (el.textContent || el.value || "") + " " + attr(el, "aria-label");
      if (TOGGLE.test(text + " " + attr(el, "class"))) return false;
      if (tag === "BUTTON" && (type === "" || type === "submit") && el.form) return true;
      if (tag === "INPUT" && (type === "submit" || type === "image")) return true;
      return SUBMIT.test(text);
    }
    return false;
  }

  document.addEventListener("submit", capture, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && target(e)?.tagName === "INPUT") capture(); }, true);
  document.addEventListener("click", (e) => { if (isSubmit(e)) capture(); }, true);
  document.addEventListener("change", (e) => noteUser(target(e)), true);
  window.addEventListener("pagehide", capture);

  // Returns true when there is nothing left to watch for.
  function scan() {
    const all = inputs(document, []).filter(visible);
    if (!seen && all.some(isEmailField)) found();
    if (!login && all.some(isLogin)) reportLogin();
    tryCode();
    if (signup && Date.now() > signup.until) signup = null;
    if (signup) signupFill();
    return seen && login && !code && !signup;
  }

  // Single-page login flows render or reveal the form late; keep watching, throttled.
  let obs = null;
  function watch() {
    if (obs) return;
    let timer = 0;
    obs = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = 0;
        if (scan()) { obs.disconnect(); obs = null; }
      }, 800);
    });
    obs.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"],
    });
  }

  // --- Sign-up: the alias goes in every mail field (confirm ones too), the generated password in
  // every new-password field, plus username, name, birthday and the required terms box, so a
  // sign-up needs no typing. Only empty fields are touched; phone numbers and captchas are left.
  const MAIL = /e-?mail|courriel|correo|mail.?addr/i;
  const USERNAME = /user-?name|nick|handle|screen.?name|gebruikersnaam|benutzername|pseudo|login.?name/i;
  const FIRST = /first.?name|fname|given|voornaam|vorname|pr[eé]nom|nombre/i;
  const LAST = /last.?name|lname|surname|family|achternaam|nachname|apellido/i;
  const FULL = /full.?name|your.?name|volledige.?naam|display.?name/i;
  const BDAY = /birth|bday|dob|geboort|geburt|naissance|nacimiento/i;
  const TERMS = /terms|agree|accept|privacy|condition|policy|voorwaarden|akkoord|datenschutz|agb|cgu|nutzungsbedingungen/i;
  const OPTIONAL = /newsletter|nieuwsbrief|marketing|offer|promo|news|updates|aanbieding|werbung|partner|sms|third|subscribe|mailing|deals|inspiration|advert|reclame|publicit|commercial/i;
  const ticked = new WeakSet(); // terms boxes clicked once, so a page that unticks one wins

  const ids = (el) => attr(el, "name") + " " + attr(el, "id") + " " + labelText(el);
  const ac = (el) => attr(el, "autocomplete").toLowerCase();
  const empty = (el) => !el.value.trim();

  function isMail(el) {
    if (!isText(el)) return false;
    return attr(el, "type").toLowerCase() === "email" || attr(el, "inputmode").toLowerCase() === "email" ||
      ac(el).includes("email") || MAIL.test(ids(el));
  }

  function isUsername(el) {
    return isText(el) && !isMail(el) && (ac(el).includes("username") || USERNAME.test(ids(el)));
  }

  function nameKind(el) {
    if (!isText(el) || isMail(el) || isUsername(el)) return "";
    const a = ac(el);
    if (a.includes("given-name")) return "first";
    if (a.includes("family-name")) return "last";
    if (/(^|\s)name$/.test(a)) return "full";
    if (SKIP.test(attr(el, "name") + " " + attr(el, "id")) || BDAY.test(ids(el))) return "";
    const t = ids(el);
    if (FIRST.test(t)) return "first";
    if (LAST.test(t)) return "last";
    if (FULL.test(t) || /^(name|naam|nom|fullname)$/i.test(attr(el, "name"))) return "full";
    return "";
  }

  // "full", "day", "month", "year" or "" for fields asking for a date of birth.
  function bdayPart(el) {
    const a = ac(el);
    if (a === "bday") return "full";
    const m = a.match(/bday-(day|month|year)/);
    if (m) return m[1];
    const raw = ids(el);
    if (!BDAY.test(raw) && !/^(day|month|year|dd|mm|yyyy)$/i.test(attr(el, "name"))) return "";
    const t = raw.replace(/birth.?day|bday|geburtstag|verjaardag|geboortedag/gi, " ");
    const isY = /year|jaar|jahr|ann[eé]e|a[nñ]o|yyyy/i.test(t), isM = /month|maand|monat|mois|mes\b|\bmm\b/i.test(t),
      isD = /day|dag|tag|jour|d[ií]a|\bdd\b/i.test(t);
    // A format hint such as "mm/dd/yyyy" names several parts: that is one full-date field.
    if (isY + isM + isD > 1) return "full";
    return isY ? "year" : isM ? "month" : isD ? "day" : "full";
  }

  // Fixed dummy details, the same on every site. The identity may override them (d.addr, d.bday);
  // the app does not send them yet, so these defaults apply. They match the desktop app.
  const ADDR0 = { street: "Rue de la Loi", number: "16", postcode: "1000", city: "Brussels", state: "Brussels-Capital Region", country: "Belgium" };
  const BDAY0 = { year: 1994, month: 5, day: 17 };
  const MONTH_RE = [/^jan|^ene/, /^f[eé]b|^fév/, /^m[aä]r|^maa|^mrt/, /^apr|^avr|^abr/, /^may|^mei|^mai|^mag/, /^juin|^jun/,
    /^juil|^jul/, /^aug|^aou|^ago/, /^sep|^set/, /^o[ck]t|^okt|^out/, /^nov/, /^d[ei]c|^dez/];
  const pad2 = (n) => String(n).padStart(2, "0");

  // A required field is one the page marks: required, aria-required, or a "*" in its label.
  function isRequired(el) {
    if (el.required || attr(el, "aria-required") === "true") return true;
    let t = labelText(el) + " " + (el.closest("label")?.textContent || "");
    const prev = el.previousElementSibling;
    if (prev && prev.textContent.length < 80) t += " " + prev.textContent;
    const par = el.parentElement;
    if (par && par.querySelectorAll("input,select,textarea").length === 1) {
      const l = par.querySelector("label");
      if (l && l.textContent.length < 80) t += " " + l.textContent;
    }
    return /[*\u2217\uFF0A]/.test(t);
  }

  // Month number of an option text or value: "5", "05", "05 - May", "mei", "Mai".
  function monthOf(t) {
    t = t.trim().toLowerCase();
    const n = t.match(/^0*(\d{1,2})(\D|$)/);
    if (n) return Number(n[1]);
    const i = MONTH_RE.findIndex((r) => r.test(t));
    return i < 0 ? 0 : i + 1;
  }

  function pickOption(sel, part, B) {
    const n = { day: B.day, month: B.month, year: B.year }[part];
    if (!n) return null;
    const opts = [...sel.options].filter((o) => !o.disabled);
    const ok = (t) => t.trim() && (part === "month" ? monthOf(t) === n : new RegExp("^\\s*0*" + n + "(\\D|$)").test(t));
    return opts.find((o) => ok(o.value) || ok(o.text)) ||
      (part === "month" && opts.filter((o) => o.value).length === 12 ? opts.filter((o) => o.value)[n - 1] : null);
  }

  function pickText(sel, re) {
    return [...sel.options].filter((o) => !o.disabled).find((o) => re.test(o.value.trim()) || re.test(o.text.trim())) || null;
  }

  // Date text in the field's own format: ISO for type=date, else read from the placeholder, label or
  // pattern (dd-mm-yyyy, mm/dd/yyyy, yyyy-mm-dd, dd.mm.yyyy, jj/mm/aaaa, TT.MM.JJJJ ...).
  const TOK = "(?:d{1,2}|t{1,2}|m{1,2}|y{2,4}|j{1,4}|a{2,4})";
  const FMT = new RegExp("(?:^|[^a-z])(" + TOK + ")\\s*([/.\\-])\\s*(" + TOK + ")\\s*\\2\\s*(" + TOK + ")(?![a-z])", "i");
  const tokKind = (t) => { const c = t[0].toLowerCase(); return c === "d" || c === "t" ? "day" : c === "m" ? "month" : c === "j" ? (t.length >= 3 ? "year" : "day") : "year"; };

  function dateText(el, B) {
    const part = (k, len) => k === "day" ? (len === 1 ? String(B.day) : pad2(B.day))
      : k === "month" ? (len === 1 ? String(B.month) : pad2(B.month)) : (len === 2 ? String(B.year).slice(2) : String(B.year));
    if (attr(el, "type").toLowerCase() === "date") return B.year + "-" + pad2(B.month) + "-" + pad2(B.day);
    const hint = [labelText(el), attr(el, "title"), attr(el, "pattern"), attr(el, "data-format"), attr(el, "data-date-format")].join(" ");
    const m = hint.match(FMT);
    if (m) return [m[1], m[3], m[4]].map((t) => part(tokKind(t), t.length)).join(m[2]);
    const pat = attr(el, "pattern");
    const sep = (pat.match(/[/.\-]/) || ["/"])[0];
    if (/^\^?\\d\{4\}/.test(pat)) return B.year + sep + pad2(B.month) + sep + pad2(B.day);
    if (el.maxLength === 8) return pad2(B.day) + pad2(B.month) + B.year;
    return pad2(B.day) + sep + pad2(B.month) + sep + B.year;
  }

  // Single day, month or year inputs: month as 1-12 or 01-12 following the placeholder.
  function partText(el, kind, B) {
    if (kind === "day") return /^\s*d\s*$/i.test(attr(el, "placeholder")) ? String(B.day) : pad2(B.day);
    if (kind === "month") return /^\s*m\s*$/i.test(attr(el, "placeholder")) ? String(B.month) : pad2(B.month);
    return el.maxLength === 2 ? String(B.year).slice(2) : String(B.year);
  }

  // Address fields: "street", "number", "postcode", "city", "state", "country" or "".
  const NOT_ADDR = /e-?mail|phone|\btel\b|fax|ip.?addr|card|company|bedrijf|firma|line.?[23]|apt\b|suite|unit\b|flat\b|apartment|appartement|\bbus\b/i;
  function addrKind(el) {
    const a = ac(el);
    if (/postal-code/.test(a)) return "postcode";
    if (/address-level2/.test(a)) return "city";
    if (/address-level1/.test(a)) return "state";
    if (/country/.test(a)) return "country";
    if (/street-address|address-line1/.test(a)) return "street";
    if (/address-line[23]/.test(a)) return "";
    const raw = attr(el, "name") + " " + attr(el, "id") + " " + labelText(el);
    if (BDAY.test(raw) || NOT_ADDR.test(raw) || MAIL.test(raw)) return "";
    if (/zip|postal|postcode|\bplz\b|postleitzahl/i.test(raw)) return "postcode";
    if (/country|\bpays\b|\bland\b|nation|pa[ií]s/i.test(raw)) return "country";
    if (/\bstate\b|province|provincie|\bregion|gewest|bundesland|canton/i.test(raw)) return "state";
    if (/\bcity\b|\btown\b|\bstad\b|gemeente|\bville\b|\bort\b|plaats|locality|commune/i.test(raw)) return "city";
    if (/house.?(no|num|nr)|huisnummer|hausnummer|street.?(no|num|nr)|\bn°/i.test(raw)) return "number";
    if (/street|straat|stra[sß]e|adres|address|\brue\b|\baddr/i.test(raw)) return "street";
    return "";
  }

  function setSelect(sel, opt) {
    typeIn(sel, opt.value);
  }

  function startSignup(msg) {
    if (typeof msg.pass !== "string" || !msg.pass) return;
    signup = { d: msg, until: Date.now() + 300000, pass: "", done: false };
    signupFill();
    watch();
  }

  function signupFill() {
    const d = signup.d;
    const all = inputs(document, [], ["INPUT", "SELECT"]).filter(visible);
    let lastSet = null;
    const put = (el, v) => { set(el, el.maxLength > 0 ? v.slice(0, el.maxLength) : v); lastSet = el; };
    const mails = all.filter(isMail);

    const A = { ...ADDR0, ...(d.addr || {}) }, B = { ...BDAY0, ...(d.bday || {}) };
    const hasNumber = all.some((el) => el.tagName === "INPUT" && addrKind(el) === "number");
    const addrText = { street: hasNumber ? A.street : A.street + " " + A.number, number: A.number, postcode: A.postcode, city: A.city, state: A.state, country: A.country };
    const addrPick = { country: /^\s*(be|bel|bgm)\s*$|b[eé]lg/i, state: /brus|bruxel/i, city: /brus|bruxel/i };

    for (const el of all) {
      if (el.tagName === "SELECT") {
        // Only required selects: a date part, country, state or city.
        if (el.disabled || el.selectedIndex > 0 || !isRequired(el)) continue;
        const bp = bdayPart(el);
        const k = bp ? "" : addrKind(el);
        const opt = bp ? pickOption(el, bp, B) : addrPick[k] ? pickText(el, addrPick[k]) : null;
        if (opt) setSelect(el, opt);
        continue;
      }
      if (isMail(el)) { if (empty(el)) put(el, d.value); continue; }
      if (isUsername(el)) {
        // An alias that landed in a username box moves to the mail box when the form has one.
        if (empty(el) || (el.value === d.value && mails.length)) put(el, d.user);
        continue;
      }
      const type = attr(el, "type").toLowerCase();
      const numeric = (type === "tel" || type === "number") && !el.disabled && !el.readOnly;
      if (!isText(el) && type !== "date" && !numeric) continue;
      if (!empty(el)) continue;
      if (numeric) {
        const k = addrKind(el);
        if ((k === "postcode" || k === "number") && isRequired(el)) put(el, addrText[k]);
        continue;
      }
      if (!isRequired(el)) continue;
      const part = bdayPart(el);
      if (part) { put(el, part === "full" ? dateText(el, B) : partText(el, part, B)); continue; }
      const kind = nameKind(el);
      if (kind) { put(el, kind === "first" ? d.first : kind === "last" ? d.last : d.first + " " + d.last); continue; }
      const ak = addrKind(el);
      if (ak) put(el, addrText[ak]);
    }

    // Passwords: on sign-up pages only the new ones; one shared value cut to the tightest maxLength.
    const pws = all.filter((el) => isPassword(el) && !el.disabled && !el.readOnly);
    const fresh = pws.filter((el) => ac(el).includes("new-password"));
    const targets = fresh.length ? fresh : pws.filter((el) => ac(el).includes("current-password")).length ? [] : pws;
    if (!signup.pass) {
      let p = d.pass;
      for (const el of targets) if (el.maxLength > 0 && el.maxLength < p.length) p = p.slice(0, el.maxLength);
      if (targets.length) signup.pass = p;
    }
    for (const el of targets) if (!el.value) { set(el, signup.pass); lastSet = el; }

    for (const el of inputs(document, [])) {
      if (attr(el, "type").toLowerCase() !== "checkbox" || el.checked || el.disabled || ticked.has(el)) continue;
      // Judge by the box's own label; the surrounding text only when it has none (it may hold other boxes).
      const own = labelText(el) + " " + (el.closest("label")?.textContent || "");
      const t = own.trim() ? own : (el.parentElement?.textContent || "").slice(0, 300);
      if (!TERMS.test(t) || OPTIONAL.test(t)) continue;
      if (!visible(el) && !(el.parentElement && visible(el.parentElement))) continue;
      ticked.add(el);
      el.click();
    }

    if (lastSet) lastSet.blur();
    if (!signup.done && signup.pass && targets.some((el) => el.value === signup.pass)) {
      signup.done = true;
      sent = d.value + "\n" + signup.pass;
      connect();
      if (port) port.postMessage({ type: "signed", origin: location.origin, pass: signup.pass });
    }
  }


  // --- Page options: cookie-banner rejection, forced dark, playback speed (all set by the app) ---

  const REJECT = /^\s*(reject|decline|deny|refuse|disagree|weigeren|afwijzen|alles weigeren|alles afwijzen|alle ablehnen|ablehnen|tout refuser|refuser|rechazar|rifiuta|rejeitar|continuer sans accepter|continue without accepting|only (strictly )?(necessary|essential|required)|(use |accept )?(only )?(necessary|essential|required) (cookies )?only|alleen (noodzakelijk|functioneel|essenti)|nur (notwendige|essenzielle|erforderliche)|uniquement (les )?(n[ée]cessaires|essentiels)|necessary only|essential only)/i;
  const CONSENT = /cookie|consent|gdpr|privacy|tracking|cmp|didomi|onetrust|cybot|usercentrics|sp_message|qc-cmp|truste|osano|klaro|tarteaucitron|toestemming|einwilligung/i;
  const CONSENT_TEXT = /cookie|consent|privacy|gdpr|toestemming|einwilligung/i;
  // Buttons that only ever mean "reject all".
  const CMP_BUTTONS = [
    "#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler", "#CybotCookiebotDialogBodyButtonDecline",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll", "[data-testid='uc-deny-all-button']",
    "#didomi-notice-disagree-button", ".didomi-continue-without-agreeing", ".sp_choice_type_REJECT_ALL",
    ".cmpboxbtnno", "#truste-consent-required", ".fc-cta-do-not-consent", ".osano-cm-denyAll",
    ".cky-btn-reject", "#cookie_action_close_header_reject", ".cc-deny", "#tarteaucitronAllDenied2",
    ".klaro .cn-decline", "[data-cookiefirst-action='reject']", ".iubenda-cs-reject-btn",
  ];
  // Selectors that also match other buttons (Quantcast's secondary button can be "More options", Google's form holds Accept too): the label must read as a rejection.
  const CMP_LABELLED = [
    ".qc-cmp2-summary-buttons button[mode='secondary']", ".qc-cmp2-footer button",
    "form[action*='consent.google'] button", "form[action*='consent.youtube'] button",
    "#sp_message_container button", "[class*='sp_choice_type'] button",
  ];
  const BANNER_SEL = "[id*='cookie' i],[class*='cookie' i],[id*='consent' i],[class*='consent' i],[id*='gdpr' i],[class*='gdpr' i],[id*='cmp' i],[class*='cmp-' i]";
  let page = {};
  let cookieUntil = 0;
  let cookieDone = false;
  let cookieClicks = 0;
  let cookieObs = null;
  let cookieSeen = 0;
  const clicked = new WeakSet();

  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && +st.opacity !== 0;
  }

  function inBanner(el) {
    for (let n = el, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
      if (CONSENT.test((n.id || "") + " " + (typeof n.className === "string" ? n.className : "") + " " + (n.getAttribute("aria-label") || ""))) return true;
    }
    // Consent iframes (Sourcepoint, Google) hold nothing but the dialog: judge by the frame's own text.
    if (!TOP) return document.body.textContent.length < 6000 && CONSENT_TEXT.test(document.body.textContent);
    // Banners without telling ids: a small container whose text talks about cookies.
    const box = el.closest("div,section,aside,dialog,form,footer");
    return !!box && box.textContent.length < 3000 && CONSENT_TEXT.test(box.textContent);
  }

  const labelOf = (el) => (el.value || el.textContent || el.getAttribute("aria-label") || "").trim();

  function findReject() {
    for (const sel of CMP_BUTTONS) {
      let el = null;
      try { el = document.querySelector(sel); } catch { /* bad selector */ }
      if (visible(el) && !clicked.has(el)) return el;
    }
    for (const sel of CMP_LABELLED) {
      for (const el of document.querySelectorAll(sel)) {
        if (REJECT.test(labelOf(el)) && visible(el) && !clicked.has(el)) return el;
      }
    }
    for (const el of document.querySelectorAll("button, a[role=button], [role=button], input[type=button], input[type=submit], a")) {
      const label = labelOf(el);
      if (label.length > 60 || !REJECT.test(label)) continue;
      if (visible(el) && !clicked.has(el) && inBanner(el)) return el;
    }
    return null;
  }

  // Last resort when no reject button exists: hide the fixed-position consent dialog and give the page its scroll back.
  function hideBanners() {
    let hidden = false;
    for (const el of document.querySelectorAll(BANNER_SEL)) {
      if (el === document.body || el === document.documentElement || el.dataset.lodicaHidden) continue;
      if (!visible(el)) continue;
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const text = el.textContent;
      if (text.length > 4000 || !CONSENT_TEXT.test(text) || !el.querySelector("button, a, input")) continue;
      el.dataset.lodicaHidden = "1";
      el.style.setProperty("display", "none", "important");
      hidden = true;
    }
    if (hidden) {
      for (const e of [document.documentElement, document.body]) {
        if (e && /hidden|clip/.test(getComputedStyle(e).overflow)) e.style.setProperty("overflow", "auto", "important");
      }
    }
    return hidden;
  }

  function rejectCookies() {
    if (cookieDone || !page.cookies) return;
    const hit = findReject();
    if (hit) {
      cookieDone = true;
      clicked.add(hit);
      hit.click();
      // A second dialog (preferences step, late banner) may follow: allow a few more clicks.
      if (++cookieClicks < 3) setTimeout(() => { cookieDone = false; }, 1500);
      return;
    }
    if (!TOP) return;
    // No reject button after a few seconds: the banner probably has none we know, so hide it.
    if (!cookieSeen) { if (document.querySelector(BANNER_SEL)) cookieSeen = Date.now(); return; }
    if (Date.now() - cookieSeen > 3000) hideBanners();
  }

  function watchCookies() {
    if (!page.cookies || cookieObs) return;
    cookieUntil = Date.now() + 60000;
    rejectCookies();
    let queued = false;
    cookieObs = new MutationObserver(() => {
      if (Date.now() > cookieUntil) { cookieObs.disconnect(); return; }
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; rejectCookies(); }, 250);
    });
    cookieObs.observe(document.documentElement, { childList: true, subtree: true });
    // The hide fallback waits on a timer too: a banner that never mutates again must still go.
    const tick = setInterval(() => { if (Date.now() > cookieUntil) clearInterval(tick); else rejectCookies(); }, 2000);
  }

  function luminance(c) {
    const p = parseRgb(c);
    if (!p || p[3] < 0.1) return -1;
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
  }

  // Force dark: a hue-preserving lightness remap. Each element's computed text, background and border
  // colours are converted to HSL and only the lightness is changed (backgrounds go dark, text goes light),
  // so a blue stays blue. Images, video, canvas, iframes and svg internals are never touched. Pages that
  // already ship a dark mode are skipped. Remapped values are written as inline !important styles, with
  // the previous inline values remembered so that switching the option off restores the page exactly.
  const DARK_PROPS = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
  const DARK_SKIP = new Set(["IMG", "VIDEO", "CANVAS", "PICTURE", "IFRAME", "EMBED", "OBJECT", "SOURCE", "SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "NOSCRIPT", "BR", "WBR"]);
  const DARK_MAX = 40000;
  let darkRecs = new WeakMap();
  let darkTouched = [];
  let darkObs = null;
  let darkAttrObs = null;
  let darkQueue = [];
  let darkTimer = 0;
  let darkCount = 0;

  // Modern colour syntaxes (oklch, lab, color-mix, color()) are read back through a 1px canvas.
  let colCtx = null;
  const colCache = new Map();
  function parseRgb(c) {
    const m = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s/]+([\d.]+%?))?/.exec(c || "");
    if (m) {
      let a = 1;
      if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
    }
    if (!c || c === "transparent" || !/^(oklch|oklab|lab|lch|color|hwb|hsl|hsla|#)/i.test(c)) return null;
    if (colCache.has(c)) return colCache.get(c);
    let out = null;
    try {
      if (!colCtx) { const cv = document.createElement("canvas"); cv.width = cv.height = 1; colCtx = cv.getContext("2d", { willReadFrequently: true }); }
      colCtx.clearRect(0, 0, 1, 1);
      colCtx.fillStyle = "#000";
      colCtx.fillStyle = c;
      colCtx.fillRect(0, 0, 1, 1);
      const d = colCtx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    } catch (e) { out = null; }
    if (colCache.size > 500) colCache.clear();
    colCache.set(c, out);
    return out;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function remapColor(c, kind) {
    const p = parseRgb(c);
    if (!p) return null;
    const hsl = rgbToHsl(p[0], p[1], p[2]);
    let l = hsl[2], s = hsl[1];
    if (kind === "bg" && s > 0.3 && l > 0.15 && l < 0.75) { l = Math.min(0.6, l * 1.15 + 0.05); } // accent fills (buttons, badges) keep their tint instead of sinking into the dark page
    else if (kind === "bg") { l = l >= 0.5 ? 0.1 + (1 - l) * 0.3 : Math.max(0.08, l * 0.6); s *= 0.85; }
    else if (kind === "text") { if (l < 0.6) l = 0.64 + (1 - l) * 0.3; } // light text (white on a button) stays as it is
    else { l = 0.2 + (1 - l) * 0.28; s *= 0.85; }
    const rgb = hslToRgb(hsl[0], s, l);
    return { css: "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + p[3] + ")", rgb };
  }

  function hslToRgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
    return [f(0), f(8), f(4)];
  }

  // True when the page already styles itself for a dark scheme.
  function pageIsDark() {
    const bg = [document.body, document.documentElement].map((e) => e && luminance(getComputedStyle(e).backgroundColor)).find((l) => l >= 0);
    if (bg !== undefined && bg < 0.4) return true;
    const meta = document.querySelector("meta[name='color-scheme']");
    if (meta && /^\s*dark\s*$/i.test(meta.content || "")) return true;
    // A dark media rule in a sheet is no proof: most light sites ship one that is not active here.
    return false;
  }

  function rl(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    const x = rl(a), y = rl(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

  function darkSet(el, prop, value) {
    let rec = darkRecs.get(el);
    if (!rec.saved) { rec.saved = {}; darkTouched.push(new WeakRef(el)); }
    if (!(prop in rec.saved)) rec.saved[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
    el.style.setProperty(prop, value, "important");
  }

  function darkElement(el, parentRec) {
    const rec = { oc: null, nc: null, bg: null, keep: false, saved: null };
    // oc is the original text colour as [r,g,b], nc the remapped one (null when left alone).
    darkRecs.set(el, rec);
    if (DARK_SKIP.has(el.tagName)) { rec.keep = true; return; }
    const root = el === document.documentElement || el === document.body;
    const cs = getComputedStyle(el);
    const col = (parseRgb(cs.color) || [0, 0, 0, 1]).slice(0, 3);
    const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    rec.oc = col;
    if (parentRec && parentRec.keep && !root) { rec.keep = true; return; }
    const bgImg = cs.backgroundImage !== "none";
    if (bgImg && !root) {
      const g = !/url\(/.test(cs.backgroundImage) && parseRgb((cs.backgroundImage.match(/rgba?\([^)]*\)/) || [""])[0]);
      if (!g) { rec.keep = true; return; }
      // A plain gradient is not a picture: keep this element as is, but let its children adapt to the gradient colour.
      rec.nc = col;
      rec.bg = g.slice(0, 3);
      return;
    }
    if (parentRec && (parentRec.nc ? same(parentRec.nc, col) : same(parentRec.oc, col))) {
      // Inherited from the parent, which already carries the new colour (or keeps the old one).
      rec.oc = parentRec.oc;
      rec.nc = parentRec.nc;
    } else {
      const nc = remapColor(cs.color, "text");
      if (nc) { darkSet(el, "color", nc.css); rec.nc = nc.rgb; }
    }
    const bg = parseRgb(cs.backgroundColor);
    if (bg && bg[3] > 0.5) {
      const nb = remapColor(cs.backgroundColor, "bg");
      darkSet(el, "background-color", nb.css);
      rec.bg = nb.rgb;
    } else {
      if (bg && bg[3] > 0) darkSet(el, "background-color", remapColor(cs.backgroundColor, "bg").css);
      else if (el === document.documentElement) darkSet(el, "background-color", "hsl(0,0%,10%)");
      rec.bg = (parentRec && parentRec.bg) || [26, 26, 26];
    }
    // Keep text readable on its background: when the contrast is low, flip it to light or dark,
    // keeping the hue (black becomes white on a dark background, white becomes black on a light one).
    const tc = rec.nc || rec.oc;
    if (tc && rec.bg && contrast(tc, rec.bg) < 3.5) {
      const h = rgbToHsl(tc[0], tc[1], tc[2]);
      const dark = lum(rec.bg) < 0.45;
      const rgb = hslToRgb(h[0], h[1], dark ? Math.max(0.78, 1 - h[2]) : Math.min(0.15, 1 - h[2]));
      darkSet(el, "color", "rgb(" + rgb.join(",") + ")");
      rec.nc = rgb;
    }
    for (const side of ["top", "right", "bottom", "left"]) {
      if (cs.getPropertyValue("border-" + side + "-style") === "none" || parseFloat(cs.getPropertyValue("border-" + side + "-width")) === 0) continue;
      const bc = remapColor(cs.getPropertyValue("border-" + side + "-color"), "border");
      if (bc) darkSet(el, "border-" + side + "-color", bc.css);
    }
  }

  function darkWalk(root) {
    const parents = (n) => (n.parentElement && darkRecs.get(n.parentElement)) || null;
    const visit = (el) => {
      if (darkCount >= DARK_MAX || darkRecs.has(el)) return;
      darkCount++;
      darkElement(el, parents(el));
    };
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.namespaceURI === "http://www.w3.org/2000/svg" && n.localName !== "svg" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const list = [];
    if (root.nodeType === 1) list.push(root);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) list.push(n);
    return list.map((el) => () => visit(el));
  }

  function darkPump() {
    darkTimer = 0;
    if (!page.dark) return;
    const t0 = performance.now();
    while (darkQueue.length && performance.now() - t0 < 12) darkQueue.shift()();
    if (darkQueue.length) darkTimer = setTimeout(darkPump, 16);
  }

  function darkEnqueue(root) {
    for (const job of darkWalk(root)) darkQueue.push(job);
    if (!darkTimer) darkTimer = setTimeout(darkPump, 0);
  }

  function darkStop() {
    if (darkObs) { darkObs.disconnect(); darkObs = null; }
    if (darkAttrObs) { darkAttrObs.disconnect(); darkAttrObs = null; }
    clearTimeout(darkTimer); darkTimer = 0;
    darkQueue = [];
    for (const ref of darkTouched) {
      const el = ref.deref();
      const rec = el && darkRecs.get(el);
      if (!rec || !rec.saved) continue;
      for (const prop in rec.saved) {
        const [v, pri] = rec.saved[prop];
        if (v) el.style.setProperty(prop, v, pri); else el.style.removeProperty(prop);
      }
    }
    darkTouched = [];
    darkRecs = new WeakMap();
    darkCount = 0;
  }

  function applyDark() {
    if (!TOP) return;
    let st = document.getElementById("lodica-dark");
    const want = !!page.dark;
    if (want && !st) {
      if (pageIsDark()) return; // the site brings its own dark mode
      st = document.createElement("style");
      st.id = "lodica-dark";
      st.textContent = "html{color-scheme:dark!important}";
      (document.head || document.documentElement).appendChild(st);
      darkEnqueue(document.documentElement);
      let pending = new Set();
      let queued = false;
      darkObs = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) pending.add(n);
        if (queued || !pending.size) return;
        queued = true;
        setTimeout(() => {
          queued = false;
          const nodes = [...pending];
          pending = new Set();
          for (const n of nodes) if (n.isConnected) darkEnqueue(n);
        }, 200);
      });
      darkObs.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!want && st) {
      st.remove();
      darkStop();
    }
  }

  function applySpeed(el) {
    const r = +page.speed || 1;
    for (const m of el ? [el] : document.querySelectorAll("video, audio")) {
      if (m.playbackRate !== r) m.playbackRate = r;
    }
  }
  document.addEventListener("play", (e) => { if (page.speed && page.speed !== 1) applySpeed(e.target); }, true);
  document.addEventListener("ratechange", (e) => {
    const r = +page.speed || 1;
    if (r !== 1 && Math.abs(e.target.playbackRate - r) > 0.01 && e.target.playbackRate === 1) e.target.playbackRate = r;
  }, true);

  // Video quality (#35): YouTube only, through its player API. A per-site value beats the global default.
  const YT = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(location.hostname);
  const QUALITY = [[144, "tiny"], [240, "small"], [360, "medium"], [480, "large"], [720, "hd720"],
    [1080, "hd1080"], [1440, "hd1440"], [2160, "hd2160"]];
  function qualityTarget() {
    const qs = page.qualities || {};
    let h = location.hostname.replace(/^(www|m)\./, "");
    while (h) {
      if (qs[h]) return +qs[h];
      const i = h.indexOf(".");
      h = i < 0 ? "" : h.slice(i + 1);
    }
    return +page.quality || 720;
  }
  let qualityTimer = 0;
  function applyQuality(tries) {
    if (!YT) return;
    const want = qualityTarget();
    try {
      localStorage.setItem("yt-player-quality", JSON.stringify({
        data: JSON.stringify({ quality: want, previousQuality: want }),
        expiration: Date.now() + 31536000000, creation: Date.now(),
      }));
    } catch (e) { /* storage blocked */ }
    webFrame.executeJavaScript('(()=>{const p=document.getElementById("movie_player");try{return p&&p.getAvailableQualityLevels?Array.from(p.getAvailableQualityLevels()):[]}catch(e){return []}})()')
      .then((levels) => pickQuality(levels || [], want, tries), () => pickQuality([], want, tries));
  }
  function pickQuality(levels, want, tries) {
    if (!levels.length) {
      if ((tries || 0) < 10) { clearTimeout(qualityTimer); qualityTimer = setTimeout(() => applyQuality((tries || 0) + 1), 800); }
      return;
    }
    const known = QUALITY.filter(([, n]) => levels.includes(n));
    if (!known.length) return;
    const pick = (known.filter(([px]) => px <= want).pop() || known[0])[1];
    const q = JSON.stringify(pick);
    webFrame.executeJavaScript('(()=>{const p=document.getElementById("movie_player");try{if(!p||p.getPlaybackQuality&&p.getPlaybackQuality()===' + q +
      ')return;if(p.setPlaybackQualityRange)p.setPlaybackQualityRange(' + q + ',' + q + ');if(p.setPlaybackQuality)p.setPlaybackQuality(' + q + ')}catch(e){}})()').catch(() => {});
  }
  if (YT) {
    document.addEventListener("loadeddata", () => applyQuality(), true);
    document.addEventListener("play", () => applyQuality(), true);
    document.addEventListener("yt-navigate-finish", () => applyQuality(), true);
  }

  // --- Math answer: select an equation and the result shows above it ---

  // lodica:math:start
  // A number as text: a fraction ("1/2", "-7/3") when it is one with a denominator up to 1000, else rounded to [prec] digits.
  function mathFrac(n, prec) {
    const dec = String(Number(n.toPrecision(prec || 12)));
    if (!isFinite(n) || Number.isInteger(Number(dec)) || Math.abs(n) >= 1e9) return dec;
    const x = Math.abs(n);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
    for (let i = 0; i < 24; i++) {
      const a = Math.floor(y);
      [h0, h1] = [h1, a * h1 + h0];
      [k0, k1] = [k1, a * k1 + k0];
      if (k1 > 1000) return dec;
      if (Math.abs(x - h1 / k1) < 1e-9 * Math.max(1, x)) return k1 === 1 ? dec : (n < 0 ? "-" : "") + h1 + "/" + k1;
      const f = y - a;
      if (f < 1e-12) break;
      y = 1 / f;
    }
    return dec;
  }

  function calc(src, raw) {
    let s = String(src).trim().replace(/\s*=\s*\??\s*$/, "");
    if (!s || s.length > 200 || !/\d/.test(s)) return null;
    s = s.replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-").replace(/ /g, " ");
    s = s.replace(/(?<=[\d)])\s*x\s*(?=[\d(])/gi, "*").replace(/\*\*/g, "^");
    if (!/^[\d\s.,+\-*/^%()a-z]+$/i.test(s)) return null;
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(s) || /^\+?[\d\s()-]{7,}$/.test(s) && !/[+*/^%]/.test(s)) return null;
    if (!/[+\-*/^%]|sqrt|pi/i.test(s)) return null;
    if (/^-?[\d.,]+(?:\s*-\s*[\d.,]+)$/.test(s) && !/\s/.test(s)) return null;
    // 1,234.5 and 1.234,5 both read as one number; a lone comma is a decimal comma
    s = s.replace(/\d[\d.,]*/g, (n) => {
      const c = n.lastIndexOf(","), d = n.lastIndexOf(".");
      if (c < 0) return n;
      if (d >= 0) return c > d ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
      return /^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, "") : n.replace(",", ".");
    });
    const t = s.match(/\d+\.?\d*|\.\d+|sqrt|pi|[+\-*/^%()]|\s+/gi);
    if (!t || t.join("") !== s) return null;
    const tk = t.filter((x) => !/^\s+$/.test(x));
    let i = 0, ops = 0;
    const peek = () => tk[i];
    function expr() {
      let v = term();
      while (peek() === "+" || peek() === "-") { const o = tk[i++]; const r = term(); v = o === "+" ? v + r : v - r; ops++; }
      return v;
    }
    function term() {
      let v = unary();
      while (peek() === "*" || peek() === "/") { const o = tk[i++]; const r = unary(); v = o === "*" ? v * r : v / r; ops++; }
      return v;
    }
    function unary() {
      if (peek() === "-") { i++; return -unary(); }
      if (peek() === "+") { i++; return unary(); }
      return power();
    }
    function power() {
      const b = post();
      if (peek() === "^") { i++; const e = unary(); ops++; return Math.pow(b, e); }
      return b;
    }
    function post() {
      let v = atom();
      while (peek() === "%") { i++; v = v / 100; ops++; }
      return v;
    }
    function atom() {
      const x = tk[i++];
      if (x === undefined) throw 0;
      if (x === "(") { const v = expr(); if (tk[i++] !== ")") throw 0; return v; }
      if (/^sqrt$/i.test(x)) { ops++; const v = atom(); return Math.sqrt(v); }
      if (/^pi$/i.test(x)) return Math.PI;
      if (/^[\d.]/.test(x)) return parseFloat(x);
      throw 0;
    }
    let v;
    try { v = expr(); if (i !== tk.length) return null; } catch (e) { return null; }
    if (!ops || typeof v !== "number" || !isFinite(v)) return null;
    if (raw) return v;
    if (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, "e");
    return mathFrac(v, 12);
  }

  // "3x - 24 = -6" -> "x = 6"; one letter unknown, degree 1 or 2
  function solve(src) {
    let s = String(src).trim().replace(/[−–—]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^");
    if (s.length > 120 || (s.match(/=/g) || []).length !== 1) return null;
    const [l, r] = s.split("=");
    if (!l.trim() || !r.trim()) return null;
    const vars = new Set((s.replace(/sqrt|pi/gi, "").match(/[a-z]/gi) || []).map((c) => c.toLowerCase()));
    if (vars.size !== 1) return null;
    const v = [...vars][0];
    if (!/^[\d\s.,+\-*/^%()a-z=]+$/i.test(s) || !/\d/.test(s)) return null;
    const side = (t, x) => t.replace(/sqrt|pi/gi, (m) => "\0" + m.toLowerCase() + "\0")
      .replace(new RegExp(v, "gi"), "\u0001")
      .replace(/(?<=[\d)])\s*(?=\u0001)/g, "*").replace(/(?<=\u0001)\s*(?=[\d(])/g, "*").replace(/\u0001\s*(?=\u0001)/g, "\u0001*")
      .replace(/\u0001/g, "(" + x + ")").replace(/\0/g, "").replace(/(?<=[\d)])\s*(?=\()/g, "*");
    const f = (x) => {
      const a = calc("(" + side(l, x) + ")-(" + side(r, x) + ")", true);
      return a == null ? NaN : a;
    };
    const f0 = f(0), f1 = f(1), f2 = f(2), f3 = f(3);
    if (![f0, f1, f2, f3].every(isFinite)) return null;
    const A = (f2 - 2 * f1 + f0) / 2, B = f1 - f0 - A, C = f0;
    const tol = 1e-7 * (1 + Math.abs(f0) + Math.abs(f1) + Math.abs(f2));
    if (Math.abs(A * 9 + B * 3 + C - f3) > tol) return null;
    const fmt = (n) => mathFrac(n, 10);
    const eps = 1e-9;
    if (Math.abs(A) < eps) {
      if (Math.abs(B) < eps) return null;
      return v + " = " + fmt(-C / B);
    }
    const D = B * B - 4 * A * C;
    if (D < -eps) return null;
    if (Math.abs(D) <= eps) return v + " = " + fmt(-B / (2 * A));
    const q = Math.sqrt(D), x1 = (-B - q) / (2 * A), x2 = (-B + q) / (2 * A);
    const [p, o] = x1 < x2 ? [x1, x2] : [x2, x1];
    return v + " = " + fmt(p) + " or " + fmt(o);
  }
  // lodica:math:end

  // lodica:spell:start
  const SPELL_LANGS = ["da", "de", "en", "es", "fr", "it", "nl", "pl", "pt", "sv"];
  const dicts = new Map(); // lang -> Map(word -> frequency rank)
  let letters = "";
  let spell = { on: false, auto: false, langs: [] };
  const ignored = new Set();

  function loadDictText(l) { return ipcRenderer.invoke("dict", l); }

  function loadDict(l) {
    let p = dicts.get(l);
    if (!p) {
      p = loadDictText(l).then((t) => {
        const m = new Map();
        let n = 0;
        for (const w of t.split("\n")) if (w) m.set(w, n++);
        return m;
      }).catch(() => new Map());
      dicts.set(l, p);
    }
    return p;
  }

  let ready = [];
  async function ensureDicts() {
    const want = (spell.langs || []).filter((l) => SPELL_LANGS.includes(l));
    const got = await Promise.all(want.map(loadDict));
    ready = got;
    const set = new Set();
    for (const m of got) for (const w of m.keys()) for (const ch of w) set.add(ch);
    letters = [...set].join("");
  }

  function known(w) {
    const k = w.toLowerCase().replace(/’/g, "'");
    if (k.length < 2 || ignored.has(k)) return true;
    for (const m of ready) if (m.has(k)) return true;
    // possessives and clitics: "dog's" is fine when "dog" is
    const q = k.indexOf("'");
    if (q > 0) { const b = k.slice(0, q); for (const m of ready) if (m.has(b)) return true; }
    return false;
  }

  function suggest(word, max) {
    const k = word.toLowerCase().replace(/’/g, "'");
    const seen = new Set();
    const out = [];
    const add = (c) => {
      if (seen.has(c)) return;
      seen.add(c);
      let r = Infinity;
      for (const m of ready) { const x = m.get(c); if (x !== undefined && x < r) r = x; }
      if (r !== Infinity) out.push([c, r + (c[0] === k[0] ? 0 : 20000)]);
    };
    for (let i = 0; i <= k.length; i++) {
      const a = k.slice(0, i), b = k.slice(i);
      if (b) add(a + b.slice(1));
      if (b.length > 1) add(a + b[1] + b[0] + b.slice(2));
      for (const ch of letters) {
        if (b) add(a + ch + b.slice(1));
        add(a + ch + b);
      }
    }
    out.sort((x, y) => x[1] - y[1]);
    return out.slice(0, max || 5).map((x) => matchCase(word, x[0]));
  }

  function matchCase(orig, w) {
    if (orig.length > 1 && orig === orig.toUpperCase()) return w.toUpperCase();
    return orig[0] !== orig[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w;
  }
  // lodica:spell:end

  const TEXTY = new Set(["text", "search", ""]);
  function editable(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.tagName === "TEXTAREA") return el;
    if (el.tagName === "INPUT") return TEXTY.has((el.getAttribute("type") || "").toLowerCase()) ? el : null;
    return el.isContentEditable ? el : null;
  }

  // Word under or before offset c in a string; null when it is not worth checking
  function wordAt(text, c, strict) {
    let a = c, b = c;
    const L = /[\p{L}'’]/u;
    while (a > 0 && L.test(text[a - 1])) a--;
    while (b < text.length && L.test(text[b])) b++;
    while (a < b && /['’]/.test(text[a])) a++;
    while (b > a && /['’]/.test(text[b - 1])) b--;
    const w = text.slice(a, b);
    if (w.length < (strict ? 3 : 2)) return null;
    const tok = (text.slice(0, b).match(/\S*$/) || [""])[0] + (text.slice(b).match(/^\S*/) || [""])[0];
    if (/[@\/\\_\d#]|\.\w|:\/\//.test(tok)) return null;
    if (strict && (w[0] !== w[0].toLowerCase() || w !== w.toLowerCase())) return null;
    if (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()) return null;
    return { w, a, b };
  }

  let bubble = null;
  function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }
  function showBubble(x, y, build, sticky) {
    hideBubble();
    const d = document.createElement("div");
    d.setAttribute("data-lodica", "bubble");
    d.style.cssText = "all:initial;position:fixed;z-index:2147483647;font:14px/1.3 system-ui,sans-serif;color:#fff;background:#222;" +
      "border-radius:8px;padding:6px 10px;box-shadow:0 2px 10px rgba(0,0,0,.4);max-width:80vw;left:0;top:0;visibility:hidden;" + (sticky ? "" : "pointer-events:none;");
    build(d);
    (document.documentElement || document.body).appendChild(d);
    const r = d.getBoundingClientRect();
    d.style.left = Math.max(4, Math.min(x - r.width / 2, innerWidth - r.width - 4)) + "px";
    d.style.top = Math.max(4, Math.min(y - r.height - 8, innerHeight - r.height - 4)) + "px";
    d.style.visibility = "visible";
    bubble = d;
  }

  // Selected text and where it sits, for plain pages and for text fields
  function selected() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
      try {
        const s = el.selectionStart, e = el.selectionEnd;
        if (s != null && s !== e) {
          const r = el.getBoundingClientRect();
          return { text: el.value.slice(s, e), x: r.left + r.width / 2, y: r.top };
        }
      } catch (e) { return null; }
    }
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const t = sel.toString();
    if (t.length > 200) return null;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { text: t, x: r.left + r.width / 2, y: r.top };
  }

  const trFetch = (u) => ipcRenderer.invoke("fetchJson", u);

  // Translate / dictionary for a selected word or short phrase (Dutch, French, English)
  const TR_LANGS = ["en", "nl", "fr"];
  const TR_TARGET = { en: "nl", nl: "en", fr: "en" };
  async function detectLang(text) {
    const words = text.toLowerCase().match(/[\p{L}']+/gu) || [];
    const ds = await Promise.all(TR_LANGS.map(loadDict));
    const score = TR_LANGS.map((l, i) => words.filter((w) => ds[i].has(w)).length);
    const best = Math.max(...score);
    if (!best) return /[éèêàçùâîôû]/i.test(text) ? "fr" : null;
    const tied = TR_LANGS.filter((l, i) => score[i] === best);
    if (tied.length > 1 && /[éèêàçùâîôû]/i.test(text) && tied.includes("fr")) return "fr";
    return tied[0];
  }

  async function lookupText(text) {
    const from = await detectLang(text);
    if (!from) return { error: "Language not recognised" };
    const to = TR_TARGET[from];
    const out = { from, to, text: "", def: "" };
    try {
      const j = await trFetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + from + "|" + to);
      out.text = (j && j.responseData && j.responseData.translatedText) || "";
    } catch (e) { /* offline */ }
    if (from === "en" && !/\s/.test(text.trim())) {
      try {
        const j = await trFetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(text.trim().toLowerCase()));
        const m = j && j[0] && j[0].meanings && j[0].meanings[0];
        if (m) out.def = m.partOfSpeech + ": " + m.definitions[0].definition;
      } catch (e) { /* no entry */ }
    }
    if (!out.text && !out.def) return { error: "No translation found" };
    return out;
  }

  function translateBubble(s) {
    showBubble(s.x, s.y, (d) => {
      d.setAttribute("data-kind", "translate");
      const b = document.createElement("button");
      b.textContent = "Translate";
      b.style.cssText = "all:initial;cursor:pointer;font:600 13px system-ui,sans-serif;color:#fff;padding:2px 4px";
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", async () => {
        b.textContent = "…";
        const r = await lookupText(s.text);
        showBubble(s.x, s.y, (d2) => {
          d2.setAttribute("data-kind", "translate");
          if (r.error) { d2.textContent = r.error; return; }
          const h = document.createElement("div");
          h.textContent = r.from.toUpperCase() + " → " + r.to.toUpperCase() + (r.text ? ": " + r.text : "");
          h.style.cssText = "font-weight:600";
          d2.appendChild(h);
          if (r.def) { const p = document.createElement("div"); p.textContent = r.def; p.style.cssText = "margin-top:4px;opacity:.85;max-width:260px"; d2.appendChild(p); }
        }, true);
      });
      d.appendChild(b);
    }, true);
  }

  let selTimer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const s = selected();
      const ans = s && (solve(s.text) || calc(s.text));
      if (ans == null) {
        if (bubble && bubble.getAttribute("data-kind") === "math") hideBubble();
        if (s && s.text.trim().length > 1 && s.text.length <= 80 && /\p{L}/u.test(s.text) && !(bubble && bubble.getAttribute("data-kind") === "translate" && bubble.dataset.t === s.text)) { translateBubble(s); bubble.dataset.t = s.text; }
        else if (!s && bubble && bubble.getAttribute("data-kind") === "translate") hideBubble();
        return;
      }
      showBubble(s.x, s.y, (d) => { d.textContent = (ans.includes("=") ? "" : "= ") + ans; d.setAttribute("data-kind", "math"); });
    }, 200);
  });

  // Replace [a, b) of the field with text, keeping undo and page listeners working
  function replaceRange(el, a, b, text, node) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.focus();
      el.setSelectionRange(a, b);
      if (!document.execCommand("insertText", false, text)) {
        el.setRangeText(text, a, b, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else {
      const sel = getSelection();
      const r = document.createRange();
      r.setStart(node, a); r.setEnd(node, b);
      sel.removeAllRanges(); sel.addRange(r);
      document.execCommand("insertText", false, text);
    }
  }

  function caretInfo(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      if (el.selectionStart !== el.selectionEnd) return null;
      return { text: el.value, c: el.selectionStart, node: null };
    }
    const sel = getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return null;
    return { text: sel.anchorNode.data, c: sel.anchorOffset, node: sel.anchorNode };
  }

  let lastFix = null; // the latest automatic correction, so Backspace can take it back
  document.addEventListener("input", (e) => {
    if (!spell.on || !spell.auto || !ready.length || e.isComposing || e.inputType !== "insertText" || !e.data || e.data.length !== 1) return;
    if (!/[\s.,;:!?)\]]/.test(e.data)) return;
    const el = editable(e.target);
    if (!el) return;
    const ci = caretInfo(el);
    if (!ci || ci.c < 2) return;
    const hit = wordAt(ci.text, ci.c - 1, true);
    if (!hit || hit.b !== ci.c - 1 || known(hit.w)) return;
    const sg = suggest(hit.w, 1);
    if (!sg.length) return;
    replaceRange(el, hit.a, ci.c, sg[0] + e.data, ci.node);
    lastFix = { el, from: hit.w, to: sg[0], at: hit.a + sg[0].length + 1, t: Date.now() };
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Backspace" || !lastFix || lastFix.el !== e.target || Date.now() - lastFix.t > 8000) { if (e.key.length === 1) lastFix = null; return; }
    const ci = caretInfo(lastFix.el);
    if (!ci || ci.c !== lastFix.at) { lastFix = null; return; }
    e.preventDefault();
    ignored.add(lastFix.from.toLowerCase());
    replaceRange(lastFix.el, lastFix.at - lastFix.to.length - 1, lastFix.at, lastFix.from + ci.text[lastFix.at - 1], ci.node);
    lastFix = null;
  }, true);

  document.addEventListener("focusin", (e) => {
    if (spell.on && editable(e.target)) ensureDicts().catch(() => {});
  }, true);

  document.addEventListener("contextmenu", (e) => {
    hideBubble();
    if (!spell.on || spell.auto) return;
    const el = editable(e.target);
    if (!el) return;
    const x = e.clientX, y = e.clientY;
    ensureDicts().then(() => setTimeout(() => {
      const ci = caretInfo(el);
      if (!ci) return;
      const hit = wordAt(ci.text, ci.c, false);
      if (!hit || known(hit.w)) return;
      const sg = suggest(hit.w, 5);
      showBubble(x, y, (d) => {
        d.style.pointerEvents = "auto";
        d.setAttribute("data-kind", "spell");
        if (!sg.length) { d.textContent = "No suggestions for “" + hit.w + "”"; return; }
        for (const s of sg) {
          const b = document.createElement("button");
          b.textContent = s;
          b.style.cssText = "all:initial;cursor:pointer;color:#fff;font:inherit;padding:4px 8px;margin:0 2px;border-radius:6px;background:#3a6df0;display:inline-block";
          b.addEventListener("mousedown", (ev) => ev.preventDefault());
          b.addEventListener("click", (ev) => {
            ev.preventDefault();
            const cur = caretInfo(el);
            if (cur) replaceRange(el, hit.a, hit.b, s, cur.node);
            hideBubble();
          });
          d.appendChild(b);
        }
      }, true);
    }, 30)).catch(() => {});
  }, true);
  addEventListener("scroll", hideBubble, { passive: true, capture: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideBubble(); }, true);
  document.addEventListener("mousedown", (e) => { if (bubble && !bubble.contains(e.target)) hideBubble(); }, true);

  function spellUse(s) {
    spell = Object.assign({ on: false, auto: false, langs: [] }, s || {});
    if (spell.on && editable(document.activeElement)) ensureDicts().catch(() => {});
    if (!spell.on) hideBubble();
  }

  function usePage(p) {
    const prev = page;
    page = p || {};
    spellUse(page.spell);
    applyDark();
    if ((+prev.speed || 1) !== (+page.speed || 1)) applySpeed();
    if (YT && JSON.stringify([prev.quality, prev.qualities]) !== JSON.stringify([page.quality, page.qualities])) applyQuality();
    watchCookies();
    msLogin();
  }

  // Smartschool login page: click its Microsoft button once, only when a Microsoft session exists.
  let msTried = false;
  function msLogin() {
    if (msTried || !page.msLogin || window !== window.top) return;
    const link = () => document.querySelector('a[href*="/login/sso/init/office365"]');
    const shown = (el) => !!el && el.offsetParent !== null;
    let n = 0, more = false;
    const tick = () => {
      if (msTried) return;
      const el = link();
      if (shown(el)) {
        msTried = true;
        el.click();
        return;
      }
      const m = document.getElementById("showmore");
      if (!more && shown(m)) { more = true; m.click(); }
      if (++n < 24) setTimeout(tick, 250);
    };
    tick();
  }

  ipcRenderer.invoke("page").then(usePage, () => {});
  ipcRenderer.on("page", (e, p) => usePage(p));

  // --- Reader view: the app asks the top frame for the main text ---

  function article() {
    let best = null, bestLen = 0;
    const scores = new Map();
    for (const p of document.querySelectorAll("p")) {
      const len = p.textContent.trim().length;
      if (len < 40) continue;
      const box = p.parentElement;
      if (!box) continue;
      const v = (scores.get(box) || 0) + len;
      scores.set(box, v);
      if (v > bestLen) { best = box; bestLen = v; }
    }
    const root = best && best.closest("article, main, [role=main]") || best || document.body;
    const parts = [];
    for (const el of root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, pre")) {
      if (el.closest("nav, footer, aside, form, table, figure figcaption, [aria-hidden=true], .infobox, .navbox, .reflist")) continue;
      if (el.parentElement && el.parentElement.closest("p, li, blockquote")) continue;
      // Citation markers like [12] or [citation needed] are noise in reading text.
      const t = el.textContent.replace(/\[(\d+|[a-z]|citation needed|edit)\]/gi, "").replace(/\s+/g, " ").trim();
      if (el.tagName === "H1" && t === (document.querySelector("h1")?.textContent || "").trim()) continue;
      if (t.length < (/^H/.test(el.tagName) ? 2 : 25)) continue;
      parts.push(/^H/.test(el.tagName) ? "## " + t : el.tagName === "LI" ? "• " + t : t);
    }
    const title = (document.querySelector("h1") || {}).textContent || document.title;
    return { type: "article", title: (title || "").trim(), text: parts.join("\n\n").slice(0, 200000) };
  }

  // --- Data meter: bytes this page pulled over the network, reported in deltas ---

  let reportedBytes = 0;
  function reportData() {
    if (!TOP || !port || !performance.getEntriesByType) return;
    let total = 0;
    for (const e of performance.getEntriesByType("navigation").concat(performance.getEntriesByType("resource"))) {
      total += e.transferSize || 0;
    }
    if (total > reportedBytes) {
      port.postMessage({ type: "data", host: location.hostname.replace(/^www\./, ""), used: total - reportedBytes });
      reportedBytes = total;
    }
  }
  if (TOP) {
    setTimeout(reportData, 5000);
    setInterval(() => { if (!document.hidden) reportData(); }, 30000);
    addEventListener("pagehide", reportData);
  }

  // --- Bot challenges: a Cloudflare, Akamai or GoDaddy check page asks the app for compatibility mode ---

  function challenged() {
    const title = document.title || "";
    const html = document.documentElement ? document.documentElement.innerHTML.slice(0, 60000) : "";
    const text = (document.body && document.body.innerText || "").slice(0, 4000);
    if (/challenges\.cloudflare\.com|cf-challenge|cf_chl_opt|cf-turnstile/i.test(html) &&
        /just a moment|attention required|een ogenblik|verify you are human|checking your browser/i.test(title + " " + text)) return true;
    if (/^access denied/i.test(title) && /edgesuite\.net|reference\s*#/i.test(html)) return true;
    if (/godaddy|sucuri/i.test(html) &&
        /is this a vpn|captcha|verify you are human|access denied|are you a robot/i.test(title + " " + text)) return true;
    return false;
  }
  let challengeSent = false;
  function checkChallenge() {
    if (challengeSent || !port || !challenged()) return;
    challengeSent = true;
    port.postMessage({ type: "challenge", host: location.hostname });
  }
  if (TOP) {
    addEventListener("load", () => setTimeout(checkChallenge, 300));
    setTimeout(checkChallenge, 2500);
  }

  // Icons the page links, biggest first, so a web app can use the site's own logo (#33).
  function icons() {
    const size = (l) => {
      const s = (l.getAttribute("sizes") || "").toLowerCase();
      if (s.includes("any") || /\.svg(\?|$)/i.test(l.href) || (l.type || "").includes("svg")) return 10000;
      return Math.max(0, ...s.split(/\s+/).map((x) => parseInt(x, 10) || 0)) || (/apple-touch/i.test(l.rel) ? 180 : 16);
    };
    const list = [...document.querySelectorAll("link[rel~='icon' i], link[rel~='apple-touch-icon' i], link[rel~='apple-touch-icon-precomposed' i]")]
      .filter((l) => l.href).sort((a, b) => size(b) - size(a)).map((l) => l.href);
    if (port && list.length) port.postMessage({ type: "icons", list: [...new Set(list)].slice(0, 12) });
  }
  if (TOP) {
    addEventListener("load", () => setTimeout(icons, 500));
    if (document.readyState === "complete") setTimeout(icons, 500);
  }

  if (TOP) connect();
  if (!scan()) watch();
};

// Double tap selects the word under the finger, triple tap selects the whole block of text.
// Form fields keep the native behaviour.
(() => {
  const BLOCK = "p,li,td,th,dd,dt,blockquote,pre,h1,h2,h3,h4,h5,h6,figcaption,article,section,div";
  let taps = 0, last = 0, lx = 0, ly = 0, sx = 0, sy = 0, moved = false;

  const select = (x, y, count) => {
    const pos = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y);
    if (!pos || !pos.offsetNode) return;
    const sel = getSelection();
    if (count === 2) {
      sel.collapse(pos.offsetNode, pos.offset);
      sel.modify("move", "backward", "word");
      sel.modify("extend", "forward", "word");
    } else {
      const el = (pos.offsetNode.nodeType === 1 ? pos.offsetNode : pos.offsetNode.parentElement)?.closest(BLOCK);
      if (!el) return;
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  addEventListener("touchstart", e => {
    if (e.touches.length !== 1) { taps = 0; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; moved = false;
  }, { passive: true, capture: true });

  addEventListener("touchmove", e => {
    const t = e.touches[0];
    if (t && Math.hypot(t.clientX - sx, t.clientY - sy) > 12) moved = true;
  }, { passive: true, capture: true });

  addEventListener("touchend", e => {
    const t = e.changedTouches[0];
    if (moved || !t) { taps = 0; return; }
    const now = Date.now();
    const near = Math.hypot(t.clientX - lx, t.clientY - ly) < 30;
    taps = now - last < 350 && near ? taps + 1 : 1;
    last = now; lx = t.clientX; ly = t.clientY;
    if (taps < 2) return;
    const el = e.target;
    if (el && el.closest && el.closest("input,textarea,select,[contenteditable='true'],a,button")) return;
    select(t.clientX, t.clientY, Math.min(taps, 3));
    if (taps >= 3) taps = 0;
  }, { passive: true, capture: true });
})();
if (/^https?:$/.test(location.protocol)) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lodicaMain, { once: true });
  else lodicaMain();
}
