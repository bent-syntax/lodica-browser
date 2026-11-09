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

  // Spec groups per product type. Tokens are what the shop pages usually print, so they double as match text.
  const G = (name, ...o) => ({ name, o });
  const CATS = [
    [/laptop|notebook|macbook|chromebook/, [G("RAM", "8gb", "16gb", "32gb", "64gb"), G("CPU", "core i5", "core i7", "core i9", "ryzen 5", "ryzen 7", "apple m3", "apple m4"), G("GPU", "integrated", "rtx 4050", "rtx 4060", "rtx 4070", "rtx 5070"), G("Storage", "256gb", "512gb", "1tb", "2tb"), G("Screen", "13 inch", "14 inch", "15.6 inch", "17 inch", "oled"), G("Type", "gaming", "ultrabook", "2-in-1", "touchscreen")]],
    [/\btv\b|television|televisie|oled|qled/, [G("Size", "32 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch", "85 inch"), G("Panel", "oled", "qled", "mini led", "led", "lcd"), G("Resolution", "4k", "8k", "full hd"), G("Refresh", "60hz", "100hz", "120hz", "144hz"), G("Smart", "google tv", "android tv", "tizen", "webos"), G("HDR", "hdr10", "dolby vision", "hdmi 2.1")]],
    [/monitor|display|beeldscherm/, [G("Size", "24 inch", "27 inch", "32 inch", "34 inch", "49 inch"), G("Panel", "ips", "va", "oled", "tn"), G("Resolution", "full hd", "1440p", "4k", "ultrawide"), G("Refresh", "60hz", "144hz", "165hz", "240hz"), G("Ports", "usb-c", "hdmi 2.1", "displayport"), G("Extras", "curved", "hdr", "g-sync", "freesync")]],
    [/phone|smartphone|iphone|galaxy|pixel|gsm/, [G("Storage", "64gb", "128gb", "256gb", "512gb", "1tb"), G("RAM", "6gb", "8gb", "12gb", "16gb"), G("Screen", "oled", "amoled", "120hz"), G("Network", "5g", "4g", "dual sim", "esim"), G("Battery", "4000mah", "5000mah"), G("Camera", "50mp", "108mp", "200mp")]],
    [/tablet|ipad/, [G("Storage", "64gb", "128gb", "256gb", "512gb"), G("Screen", "8 inch", "10 inch", "11 inch", "13 inch", "oled"), G("Network", "wifi", "5g", "4g"), G("Extras", "stylus", "keyboard")]],
    [/graphics card|videokaart|\bgpu\b|geforce|radeon|\brtx\b/, [G("Chip", "rtx 4060", "rtx 4070", "rtx 4080", "rtx 5070", "rtx 5080", "rx 7800", "rx 9070"), G("VRAM", "8gb", "12gb", "16gb", "24gb"), G("Brand", "asus", "msi", "gigabyte", "sapphire", "zotac")]],
    [/processor|\bcpu\b/, [G("Brand", "intel", "amd"), G("Series", "core i5", "core i7", "core i9", "ryzen 5", "ryzen 7", "ryzen 9"), G("Socket", "am5", "lga1700", "lga1851"), G("Cores", "6 core", "8 core", "12 core", "16 core")]],
    [/ssd|harddisk|hard drive|nvme|\bhdd\b/, [G("Size", "500gb", "1tb", "2tb", "4tb"), G("Type", "nvme", "sata", "external", "portable"), G("Speed", "pcie 4.0", "pcie 5.0")]],
    [/headphone|koptelefoon|earbud|earphone|airpods|\bheadset\b/, [G("Type", "over-ear", "in-ear", "true wireless", "wired"), G("Noise", "noise cancelling"), G("Battery", "30 hours", "40 hours"), G("Extras", "bluetooth 5", "microphone", "waterproof")]],
    [/speaker|soundbar|luidspreker/, [G("Type", "soundbar", "bluetooth", "smart speaker", "subwoofer"), G("Audio", "dolby atmos", "5.1", "wifi"), G("Extras", "waterproof", "battery")]],
    [/camera|fototoestel|camcorder|gopro/, [G("Type", "mirrorless", "dslr", "compact", "action cam"), G("Sensor", "full frame", "aps-c", "micro four thirds"), G("Video", "4k", "8k"), G("Extras", "wifi", "stabilization", "weather sealed")]],
    [/watch|smartwatch|horloge|fitbit|garmin/, [G("Size", "40mm", "42mm", "44mm", "46mm"), G("Network", "gps", "lte"), G("Extras", "amoled", "heart rate", "waterproof", "nfc")]],
    [/console|playstation|\bps5\b|xbox|nintendo|switch/, [G("Console", "ps5", "xbox series x", "xbox series s", "nintendo switch", "steam deck"), G("Storage", "512gb", "1tb", "2tb"), G("Edition", "digital", "disc")]],
    [/router|wifi|mesh|modem/, [G("Standard", "wifi 6", "wifi 6e", "wifi 7"), G("Speed", "ax3000", "ax6000", "be9300"), G("Type", "mesh", "single", "modem router"), G("Ports", "2.5gbe", "10gbe")]],
    [/printer|printen/, [G("Type", "inkjet", "laser", "all-in-one"), G("Colour", "color", "monochrome"), G("Extras", "wifi", "duplex", "scanner")]],
    [/vacuum|stofzuiger|robot/, [G("Type", "robot", "cordless", "bagless", "wet and dry"), G("Extras", "lidar", "self emptying", "hepa", "mop")]],
    [/washing machine|wasmachine|dryer|droger|dishwasher|vaatwasser|fridge|koelkast/, [G("Appliance", "washing machine", "dryer", "dishwasher", "fridge"), G("Energy", "a", "b", "c"), G("Capacity", "7kg", "8kg", "9kg", "10kg"), G("Extras", "heat pump", "wifi", "steam")]],
    [/keyboard|toetsenbord|mouse|muis/, [G("Type", "mechanical", "wireless", "gaming", "ergonomic"), G("Layout", "azerty", "qwerty"), G("Extras", "rgb", "bluetooth", "hot swap")]],
    [/power bank|powerbank|charger|oplader/, [G("Capacity", "10000mah", "20000mah", "30000mah"), G("Power", "30w", "65w", "100w"), G("Port", "usb-c", "magsafe")]],
    [/drone/, [G("Video", "4k", "5.4k"), G("Weight", "under 250g"), G("Extras", "obstacle avoidance", "gps", "gimbal")]],
    [/projector|beamer/, [G("Resolution", "full hd", "4k"), G("Light", "3000 lumens", "5000 lumens"), G("Type", "laser", "short throw", "portable")]],
  ];
  const specsFor = (q) => { const t = (q || "").toLowerCase(); const c = CATS.find((x) => x[0].test(t)); return c ? c[1] : []; };
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
    const add = el("input", { type: "text", placeholder: "Or type your own and press Enter", maxlength: "40", "aria-label": "Feature" });
    const out = el("div", { class: "sh-out" });
    const sortBtn = (k, t) => { const b = el("button", { type: "button", class: s.sort === k ? "on" : "" }, t); b.addEventListener("click", () => { s.sort = k; save(s); for (const x of sortRow.children) x.classList.toggle("on", x === b); draw(last); }); return b; };
    const sortRow = el("div", { class: "sh-sort" });
    sortRow.append(sortBtn("price", "Lowest price"), sortBtn("match", "Best match"));

    function drawChips() {
      const own = new Set(specsFor(q).flatMap((g) => g.o));
      chips.replaceChildren(...s.f.filter((f) => !own.has(f)).map((f) => {
        const b = el("button", { type: "button", class: "sh-chip", "aria-label": "Remove " + f }, f + " ×");
        b.addEventListener("click", () => { s.f = s.f.filter((x) => x !== f); drawChips(); drawGroups(); go(); });
        return b;
      }));
    }
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = add.value.replace(/,/g, " ").trim().toLowerCase();
      if (v && !s.f.includes(v) && s.f.length < 8) { s.f.push(v); add.value = ""; drawChips(); drawGroups(); go(); }
    });
    const change = () => { s.cc = sel.value; s.min = Math.max(0, Number(min.value) || 0); s.max = Math.max(0, Number(max.value) || 0); go(); };
    sel.addEventListener("change", change);
    min.addEventListener("change", change);
    max.addEventListener("change", change);

    const groups = el("div", { class: "sh-groups" });
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(go, 500); };
    function drawGroups() {
      groups.replaceChildren(...specsFor(q).map((g) => el("div", { class: "sh-g" },
        el("span", {}, g.name),
        el("div", { class: "sh-opts" }, ...g.o.map((o) => {
          const on = s.f.includes(o);
          const b = el("button", { type: "button", class: "sh-opt" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false" }, o);
          b.addEventListener("click", () => {
            const was = s.f.includes(o);
            s.f = s.f.filter((x) => !g.o.includes(x));
            if (!was) { if (s.f.length >= 8) s.f.shift(); s.f.push(o); }
            drawGroups(); drawChips(); later();
          });
          return b;
        })))));
    }
    const field = (label, ...kids) => el("label", { class: "sh-f" }, el("span", {}, label), ...kids);
    root.replaceChildren(
      el("section", { class: "sh-panel" },
        el("div", { class: "sh-row" }, field("Country", sel), field("From", min), field("To", max)),
        groups, field("More features", add), chips),
      sortRow, out);
    drawChips(); drawGroups();

    let last = null;
    const tweakers = (d) => (d.tweakers && d.tweakers.length ? el("div", { class: "sh-tw" },
      el("div", { class: "sh-note" }, "From Tweakers"),
      ...d.tweakers.map((x) => { const href = safe(x.u); return href ? el("a", { class: "sh-twl", href, target: "_top" }, x.t) : null; })) : null);
    function draw(d) {
      last = d;
      if (!d) return;
      const items = d.items.slice();
      const score = (x) => (x.m || []).length;
      items.sort(s.sort === "match" ? (a, b) => score(b) - score(a) || a.p - b.p : (a, b) => a.p - b.p);
      if (!items.length) {
        out.replaceChildren(el("div", { class: "ans" }, "No prices found at trusted " + COUNTRIES[d.cc] + " shops for “" + d.q + "”. Try a broader name or a wider price range."), tweakers(d));
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
        }),
        tweakers(d));
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
