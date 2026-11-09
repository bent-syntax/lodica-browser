"use strict";
// Lodica Shop tab: pick country, price range and features, then list the same product at trusted shops by price.
// Shared by the desktop search page and the Android helper extension (keep both copies identical).
(function () {
  const COUNTRIES = { BE: "Belgium", NL: "Netherlands", DE: "Germany", FR: "France", GB: "United Kingdom", US: "United States", CA: "Canada", AU: "Australia", ES: "Spain", IT: "Italy" };
  const KEY = "lodica.shop";

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
    if (!COUNTRIES[s.cc]) {
      const r = ((navigator.language || "").split("-")[1] || "").toUpperCase();
      s.cc = COUNTRIES[r] ? r : "BE";
    }
    s.min = s.min > 0 ? s.min : 0;
    s.max = s.max > 0 ? s.max : 0;
    s.f = Array.isArray(s.f) ? s.f.filter((x) => typeof x === "string").slice(0, 8) : [];
    s.sort = s.sort === "match" ? "match" : "price";
    return s;
  }
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };

  function money(p, cur) {
    try { return new Intl.NumberFormat(navigator.language || "en", { style: "currency", currency: cur || "EUR" }).format(p); }
    catch (e) { return (cur ? cur + " " : "") + p.toFixed(2); }
  }

  function stars(r) {
    const n = Math.round(r * 2) / 2;
    return "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
  }

  /** ctx: { el, img, send(type, params), safe, root } */
  function run(q, ctx) {
    const { el, img, send, safe, root } = ctx;
    const s = load();
    let token = 0;

    const sel = el("select", { "aria-label": "Country" }, ...Object.keys(COUNTRIES).map((k) => el("option", { value: k }, COUNTRIES[k])));
    sel.value = s.cc;
    const num = (ph, v) => { const i = el("input", { type: "number", min: "0", step: "1", inputmode: "numeric", placeholder: ph, "aria-label": ph }); if (v) i.value = String(v); return i; };
    const min = num("Min price", s.min), max = num("Max price", s.max);
    const chips = el("div", { class: "sh-chips" });
    const add = el("input", { type: "text", placeholder: "Add a feature, press Enter", maxlength: "40", "aria-label": "Feature" });
    const out = el("div", { class: "sh-out" });
    const sortBtn = (k, t) => { const b = el("button", { type: "button", class: s.sort === k ? "on" : "" }, t); b.addEventListener("click", () => { s.sort = k; save(s); for (const x of sortRow.children) x.classList.toggle("on", x === b); draw(last); }); return b; };
    const sortRow = el("div", { class: "sh-sort" });
    sortRow.append(sortBtn("price", "Lowest price"), sortBtn("match", "Best match"));

    function drawChips() {
      chips.replaceChildren(...s.f.map((f) => {
        const b = el("button", { type: "button", class: "sh-chip", "aria-label": "Remove " + f }, f + " ×");
        b.addEventListener("click", () => { s.f = s.f.filter((x) => x !== f); drawChips(); go(); });
        return b;
      }));
    }
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = add.value.trim().toLowerCase();
      if (v && !s.f.includes(v) && s.f.length < 8) { s.f.push(v); add.value = ""; drawChips(); go(); }
    });
    const change = () => { s.cc = sel.value; s.min = Math.max(0, Number(min.value) || 0); s.max = Math.max(0, Number(max.value) || 0); go(); };
    sel.addEventListener("change", change);
    min.addEventListener("change", change);
    max.addEventListener("change", change);

    const field = (label, ...kids) => el("label", { class: "sh-f" }, el("span", {}, label), ...kids);
    root.replaceChildren(
      el("section", { class: "sh-panel" },
        el("div", { class: "sh-row" }, field("Country", sel), field("From", min), field("To", max)),
        field("Features", add), chips),
      sortRow, out);
    drawChips();

    let last = null;
    function draw(d) {
      last = d;
      if (!d) return;
      const items = d.items.slice();
      const score = (x) => (x.m || []).length;
      items.sort(s.sort === "match" ? (a, b) => score(b) - score(a) || a.p - b.p : (a, b) => a.p - b.p);
      if (!items.length) {
        out.replaceChildren(el("div", { class: "ans" }, "No prices found at trusted " + COUNTRIES[d.cc] + " shops for “" + d.q + "”. Try a broader name or a wider price range."));
        return;
      }
      const low = Math.min(...items.map((x) => x.p));
      out.replaceChildren(
        el("div", { class: "sh-note" }, items.length + " offers from trusted shops in " + COUNTRIES[d.cc] + ", prices as published by each shop."),
        ...items.map((x) => {
          const href = safe(x.u);
          const best = x.p === low;
          const feats = d.feats.map((f) => el("span", { class: "sh-feat" + ((x.m || []).includes(f) ? " ok" : "") }, ((x.m || []).includes(f) ? "✓ " : "") + f));
          const card = el(href ? "a" : "div", { class: "sh-card" + (best ? " best" : ""), href: href || null, target: "_top" },
            el("div", { class: "sh-img" }, img(x.i, "", "") || el("span", {}, "🛒")),
            el("div", { class: "sh-body" },
              el("h3", {}, x.t),
              el("div", { class: "sh-meta" }, el("b", {}, x.h), el("em", {}, "Trusted shop"),
                x.r ? el("span", { class: "sh-rate", title: x.r.toFixed(1) + " out of 5" }, stars(x.r) + (x.n ? " (" + x.n + ")" : "")) : null),
              feats.length ? el("div", { class: "sh-feats" }, ...feats) : null),
            el("div", { class: "sh-price" },
              best ? el("small", {}, "Lowest price") : null,
              el("strong", {}, money(x.p, x.cur)),
              best ? null : el("small", { class: "diff" }, "+" + money(x.p - low, x.cur))));
          return card;
        }));
    }

    async function go() {
      save(s);
      const my = ++token;
      out.replaceChildren(...[0, 1, 2, 3].map(() => el("div", { class: "skel" })));
      const params = { q, cc: s.cc };
      if (s.min) params.min = s.min;
      if (s.max) params.max = s.max;
      if (s.f.length) params.f = s.f.join(",");
      let d;
      try { d = await send("shop", params); } catch (e) { d = { error: "Shop unavailable" }; }
      if (my !== token) return;
      if (!d || d.error || !Array.isArray(d.items)) {
        out.replaceChildren(el("div", { class: "ans" }, (d && d.error) || "Shop unavailable"));
        return;
      }
      draw(d);
    }
    go();
  }

  window.LodicaShop = { run };
})();
