"use strict";
// Holiday themes. One can be claimed from 7 days before to 7 days after its holiday. A claim stays for ever.
const WINDOW = 7;
const HOLIDAYS = [
  { id: "new-year", label: "New Year", month: 1, day: 1 },
  { id: "valentine", label: "Valentine's Day", month: 2, day: 14 },
  { id: "st-patrick", label: "St Patrick's Day", month: 3, day: 17 },
  { id: "national-day", label: "Belgian National Day", month: 7, day: 21 },
  { id: "halloween", label: "Halloween", month: 10, day: 31 },
  { id: "christmas", label: "Christmas", month: 12, day: 25 },
];
const dayNo = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/** Whole days from [now] to the nearest occurrence of the holiday (negative once it has passed). */
function daysTo(h, now = new Date()) {
  const today = dayNo(now.getFullYear(), now.getMonth() + 1, now.getDate());
  let best = Infinity;
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const d = dayNo(y, h.month, h.day) - today;
    if (Math.abs(d) < Math.abs(best)) best = d;
  }
  return best;
}

const find = (id) => HOLIDAYS.find((h) => h.id === id) || null;
const canClaim = (id, now = new Date()) => { const h = find(id); return !!h && Math.abs(daysTo(h, now)) <= WINDOW; };

/** Rows for the Settings picker. */
function list(claimed, now = new Date()) {
  const have = new Set(claimed || []);
  return HOLIDAYS.map((h) => ({ id: h.id, label: h.label, days: daysTo(h, now), claimed: have.has(h.id), claimable: canClaim(h.id, now) }));
}

module.exports = { HOLIDAYS, WINDOW, daysTo, canClaim, list, find };
