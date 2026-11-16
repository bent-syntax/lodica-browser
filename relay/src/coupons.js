'use strict';
// Coupon codes for a shop, for the checkout coupon finder in the apps. Searches the web for "<shop> coupon code" (and the Dutch,
// French and German words), pulls code-looking words out of the result titles and snippets, and ranks them by how many results
// mention them. The apps then try each code on the checkout page and keep the one that lowers the total most.
const { search } = require('./search');

const TTL = 6 * 3600e3;
const cache = new Map();
// Words that look like codes in snippets but never are.
const STOP = new Set(('CODE CODES COUPON COUPONS PROMO PROMOCODE VOUCHER VOUCHERS DISCOUNT DISCOUNTS FREE SHIPPING DELIVERY SALE DEAL DEALS ' +
  'OFFER OFFERS SAVE SAVING SAVINGS OFF EXTRA TODAY ORDER ORDERS VALID EXPIRED EXPIRES VERIFIED NEW BEST TOP USA EUR USD GBP HTTP HTTPS WWW ' +
  'KORTINGSCODE KORTINGSCODES KORTING ACTIECODE GRATIS VERZENDING CODEPROMO REDUC REDUCTION GUTSCHEIN GUTSCHEINCODE RABATT RABATTCODE ' +
  'NOVEMBER DECEMBER JANUARY FEBRUARY MARCH APRIL JUNE JULY AUGUST SEPTEMBER OCTOBER BLACK FRIDAY CYBER MONDAY STUDENT STUDENTS ' +
  'LOGIN SIGNUP NEWSLETTER EMAIL APP ONLINE STORE SHOP CLICK HERE COPY REVEAL SHOW GET USE ENTER APPLY CHECKOUT').split(' '));
const NEAR = /(code|coupon|promo|voucher|kortings|actie|gutschein|rabatt|réduc|reduc)/i;
const TOKEN = /\b([A-Z0-9][A-Z0-9_-]{3,19})\b/g;

/** Shop name from a host: www.zalando.be -> zalando. */
function brand(host) {
  const parts = String(host || '').toLowerCase().replace(/^www\d?\./, '').split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  // co.uk, com.au, ...: the name is before the two-part suffix.
  const two = parts.length > 2 && /^(co|com|org|net|ac)$/.test(parts[parts.length - 2]);
  return parts[parts.length - (two ? 3 : 2)];
}

/** Candidate codes in one text, only where a coupon word is close by. */
function codesIn(text) {
  const out = new Set();
  const s = String(text || '');
  for (let m; (m = TOKEN.exec(s));) {
    const w = m[1];
    if (STOP.has(w) || !/[A-Z]/.test(w) || /^\d+$/.test(w) || /^(19|20)\d\d$/.test(w)) continue;
    // Mixed-case words are prose ("Zalando"); codes are upper case in snippets, often with digits.
    if (w.length < 5 && !/\d/.test(w)) continue;
    const around = s.slice(Math.max(0, m.index - 60), m.index + w.length + 40);
    if (NEAR.test(around)) out.add(w);
  }
  return out;
}

async function find(site) {
  const b = brand(site);
  if (!b || b.length < 2) return { site, codes: [] };
  const hit = cache.get(b);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
  const queries = [`${b} coupon code ${month}`, `${b} promo code`, `${b} kortingscode`, `${b} code promo`, `${b} gutscheincode`];
  const got = await Promise.all(queries.map((q) => search(new URL('http://r/search?q=' + encodeURIComponent(q))).catch(() => null)));
  const score = new Map();
  for (const r of got) {
    for (const x of (r && r.results) || []) {
      for (const c of codesIn((x.t || '') + ' — ' + (x.c || ''))) score.set(c, (score.get(c) || 0) + 1);
    }
  }
  // The shop's own name in capitals is a word, not a code ("ZALANDO"), unless it carries digits ("ZALANDO10").
  const name = b.toUpperCase();
  const codes = [...score].filter(([c]) => c !== name).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([code, n]) => ({ code, n }));
  const v = { site: b, codes };
  cache.set(b, { at: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return v;
}

module.exports = { find, brand, codesIn };
