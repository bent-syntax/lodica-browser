'use strict';
// Minimal but complete-enough RFC 5322/2045-2047/2231 parser using built-ins only.
// Works in "binary string" space (latin1: 1 char = 1 byte) and decodes charsets at the leaves.

const MAX_DEPTH = 20, MAX_PARTS = 500, MAX_TEXT = 1024 * 1024;

function bin(buf) { return Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf); }
function bytes(s) { return Buffer.from(s, 'latin1'); }

function normCharset(cs) {
  cs = String(cs || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!cs || cs === 'us-ascii' || cs === 'ascii' || cs === 'unknown-8bit' || cs === 'x-unknown') return 'utf-8';
  if (cs === 'utf8') return 'utf-8';
  if (cs === 'latin1' || cs === 'latin-1') return 'iso-8859-1';
  return cs;
}

function decodeBytes(buf, charset) {
  const cs = normCharset(charset);
  if (cs === 'utf-8') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return new TextDecoder('windows-1252').decode(buf); } // mislabelled latin1
  }
  try { return new TextDecoder(cs).decode(buf); }
  catch {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return buf.toString('latin1'); }
  }
}

function decodeQP(s, isHeader) {
  if (isHeader) s = s.replace(/_/g, ' ');
  else s = s.replace(/[ \t]+(\r?\n)/g, '$1').replace(/=\r?\n/g, '');
  return s.replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeB64(s) { return Buffer.from(s.replace(/[^A-Za-z0-9+/]/g, ''), 'base64').toString('latin1'); }

// RFC 2047 encoded-words; adjacent words are joined (whitespace between them dropped) and
// bytes of same-charset neighbours concatenated so split multibyte sequences decode correctly.
function decodeWords(str) {
  if (!str) return '';
  // Raw 8-bit header bytes (SMTPUTF8 or sloppy senders): decode as UTF-8, fall back to latin1.
  const raw = /[\x80-\xff]/.test(str) ? decodeBytes(bytes(str), 'utf-8') : str;
  const re = /=\?([^?\s]+?)(?:\*[^?\s]*)?\?([BbQq])\?([^?\s]*)\?=/g;
  const out = [];
  let last = 0, m, pending = null; // pending = {cs, data}
  const flush = () => { if (pending) { out.push(decodeBytes(bytes(pending.data), pending.cs)); pending = null; } };
  while ((m = re.exec(raw))) {
    const between = raw.slice(last, m.index);
    if (!(pending && /^\s*$/.test(between))) { flush(); out.push(between); }
    const data = m[2].toUpperCase() === 'B' ? decodeB64(m[3]) : decodeQP(m[3], true);
    const cs = normCharset(m[1]);
    if (pending && pending.cs === cs) pending.data += data;
    else { flush(); pending = { cs, data }; }
    last = re.lastIndex;
  }
  flush();
  out.push(raw.slice(last));
  return out.join('');
}

function splitHeadBody(s) {
  if (s.startsWith('\r\n')) return ['', s.slice(2)];
  if (s.startsWith('\n')) return ['', s.slice(1)];
  const m = /\r?\n\r?\n/.exec(s);
  if (!m) return [s, ''];
  return [s.slice(0, m.index), s.slice(m.index + m[0].length)];
}

function parseHeaders(h) {
  const map = new Map();
  const unfolded = h.replace(/\r?\n(?=[ \t])/g, '');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  }
  return map;
}
const first = (hm, k) => (hm.get(k) || [])[0] || '';

// "type/sub; a=b; c=\"d\"; e*=utf-8''x; f*0=..; f*1=.." -> {value, params}
function parseParams(v) {
  const parts = [];
  let cur = '', q = false;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '"' && v[i - 1] !== '\\') q = !q;
    if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  const value = parts.shift().trim().toLowerCase();
  const params = {};
  const cont = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    let k = p.slice(0, i).trim().toLowerCase();
    let val = p.slice(i + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    const m = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
    if (m) {
      const name = m[1];
      (cont[name] = cont[name] || []).push({ n: Number(m[2] || 0), enc: !!m[3] || (m[2] === undefined), val });
    } else params[k] = val;
  }
  for (const [name, segs] of Object.entries(cont)) {
    segs.sort((a, b) => a.n - b.n);
    let cs = null, data = '';
    for (const s of segs) {
      let val = s.val;
      if (s.enc) {
        if (s.n === 0) {
          const mm = /^([^']*)'[^']*'(.*)$/.exec(val);
          if (mm) { cs = mm[1]; val = mm[2]; }
        }
        val = val.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      }
      data += val;
    }
    params[name] = decodeBytes(bytes(data), cs || 'utf-8');
  }
  return { value, params };
}

function decodeBody(s, cte) {
  cte = String(cte || '').trim().toLowerCase();
  if (cte === 'base64') return decodeB64(s);
  if (cte === 'quoted-printable') return decodeQP(s, false);
  return s;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function splitMultipart(body, boundary) {
  const re = new RegExp('(?:^|\\r?\\n)--' + escapeRe(boundary) + '(--)?[ \\t]*(?:\\r?\\n|$)', 'g');
  const parts = [];
  let start = -1, m;
  while ((m = re.exec(body))) {
    if (start >= 0) parts.push(body.slice(start, m.index));
    if (m[1]) { start = -1; break; }
    start = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
    if (parts.length > MAX_PARTS) break;
  }
  if (start >= 0) parts.push(body.slice(start)); // missing close delimiter
  return parts;
}

function walk(s, ctx, depth, defaultType) {
  if (depth > MAX_DEPTH || ctx.count++ > MAX_PARTS) return;
  const [h, body] = splitHeadBody(s);
  const hm = parseHeaders(h);
  const ct = parseParams(first(hm, 'content-type') || defaultType);
  const disp = parseParams(first(hm, 'content-disposition') || '');
  const type = ct.value || 'text/plain';
  if (type.startsWith('multipart/')) {
    const b = ct.params.boundary;
    if (!b) return;
    const sub = type === 'multipart/digest' ? 'message/rfc822' : 'text/plain';
    for (const p of splitMultipart(body, b)) walk(p, ctx, depth + 1, sub);
    return;
  }
  if (type === 'message/rfc822' || type === 'message/global') {
    walk(decodeBody(body, first(hm, 'content-transfer-encoding')), ctx.nested(), depth + 1, 'text/plain');
    return;
  }
  const isAttach = disp.value === 'attachment' || (disp.params.filename && disp.value !== 'inline');
  if (isAttach) return;
  if (type === 'text/plain' || type === 'text/html') {
    const txt = decodeBytes(bytes(decodeBody(body, first(hm, 'content-transfer-encoding'))), ct.params.charset);
    (type === 'text/plain' ? ctx.texts : ctx.htmls).push(txt);
  }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', euro: '€',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', zwnj: '‌', shy: '' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? all : v;
  });
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLinks(text, html) {
  const seen = new Set(), out = [];
  const add = (u) => {
    u = u.trim();
    // Trim trailing punctuation; a ")" only when unbalanced (e.g. "(see https://x.y/a)").
    for (;;) {
      const c = u[u.length - 1];
      if ('.,;:!?\'"]}>'.includes(c)) { u = u.slice(0, -1); continue; }
      if (c === ')' && (u.split('(').length < u.split(')').length)) { u = u.slice(0, -1); continue; }
      break;
    }
    if (!/^https?:\/\/[^\s/?#]+/i.test(u) || u.length > 4096) return;
    if (!seen.has(u)) { seen.add(u); out.push(u); }
  };
  if (html) {
    const re = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let m;
    while ((m = re.exec(html)) && out.length < 500) {
      const v = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').replace(/[\r\n\t]/g, '').trim();
      if (/^https?:\/\//i.test(v)) add(v);
    }
  }
  if (text) {
    const re = /https?:\/\/[^\s<>"'` ​]+/gi;
    let m;
    while ((m = re.exec(text)) && out.length < 500) add(m[0]);
  }
  return out;
}

function makeCtx() {
  const ctx = { count: 0, texts: [], htmls: [], nestedCtx: [] };
  ctx.nested = () => { const n = makeCtx(); n.count = ctx.count; ctx.nestedCtx.push(n); return n; };
  return ctx;
}

function cap(s) { return s && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s; }

// Parse a full RFC 822 message (Buffer) -> {from, to, subject, date, messageId, text, html, links}
function parseMessage(buf) {
  const s = bin(buf);
  const [h] = splitHeadBody(s);
  const hm = parseHeaders(h);
  const ctx = makeCtx();
  walk(s, ctx, 0, 'text/plain');
  let texts = ctx.texts, htmls = ctx.htmls;
  if (!texts.length && !htmls.length) {
    for (const n of ctx.nestedCtx) { texts = texts.concat(n.texts); htmls = htmls.concat(n.htmls); }
  }
  const html = htmls.length ? htmls[0] : null;
  let text = texts.length ? texts.join('\n\n') : (html ? htmlToText(html) : '');
  const d = Date.parse(first(hm, 'date'));
  return {
    from: decodeWords(first(hm, 'from')),
    to: decodeWords(first(hm, 'to')),
    subject: decodeWords(first(hm, 'subject')),
    date: Number.isFinite(d) ? d : null,
    messageId: first(hm, 'message-id'),
    text: cap(text),
    html: cap(html),
    links: extractLinks(text, html),
  };
}

module.exports = { parseMessage, decodeWords, parseParams, htmlToText, extractLinks };
