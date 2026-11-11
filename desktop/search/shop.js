"use strict";
// Lodica Shop tab: pick country, price range and features, then list the same product at trusted shops by price.
// Shared by the desktop search page and the Android helper extension (keep both copies identical).
(function () {
  const COUNTRIES = { BE: "Belgium", NL: "Netherlands", DE: "Germany", FR: "France", GB: "United Kingdom", US: "United States", CA: "Canada", AU: "Australia", ES: "Spain", IT: "Italy" };
  const KEY = "lodica.shop";

  // Search-in categories: [key, label, word]. Keys must match CATEGORIES in relay/src/shop.js.
  const CATLIST = [["", "All categories", ""], ["laptops", "Laptops", "laptop"], ["phones", "Phones", "smartphone"], ["tablets", "Tablets", "tablet"], ["tvs", "TVs", "televisie"],
    ["audio", "Audio", "koptelefoon"], ["cameras", "Cameras", "camera"], ["gaming", "Gaming", "game console"], ["monitors", "Monitors", "monitor"],
    ["components", "PC components", "pc component"], ["printers", "Printers", "printer"], ["appliances", "Appliances", "huishoud"], ["smarthome", "Smart home", "smart home"], ["wearables", "Wearables", "smartwatch"]];

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
    s.cond = s.cond === "used" || s.cond === "all" ? s.cond : "new";
    s.view = s.view === "grid" ? "grid" : "list";
    s.cat = CATLIST.some((c) => c[0] === s.cat) ? s.cat : "";
    s.rate = s.rate > 0 ? s.rate : 0;
    s.inc = Array.isArray(s.inc) ? s.inc.filter((x) => typeof x === "string").slice(0, 30) : [];
    s.ex = Array.isArray(s.ex) ? s.ex.filter((x) => typeof x === "string").slice(0, 30) : [];
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
  let curCat = "";
  const specsFor = (q) => { const t = ((CATLIST.find((c) => c[0] === curCat) || [])[2] + " " + (q || "")).toLowerCase(); const c = CATS.find((x) => x[0].test(t)); return c ? c[1] : []; };
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
    let last = null;

    const sel = el("select", { "aria-label": "Country" }, ...Object.keys(COUNTRIES).map((k) => el("option", { value: k }, COUNTRIES[k])));
    sel.value = s.cc;
    const num = (ph, v) => { const i = el("input", { type: "number", min: "0", step: "1", inputmode: "numeric", placeholder: ph, "aria-label": ph }); if (v) i.value = String(v); return i; };
    const min = num("Min price", s.min), max = num("Max price", s.max);
    const chips = el("div", { class: "sh-chips" });
    const add = el("input", { type: "text", placeholder: "Or type your own and press Enter", maxlength: "40", "aria-label": "Feature" });
    const out = el("div", { class: "sh-out" });
    const sortBtn = (k, t) => { const b = el("button", { type: "button", class: s.sort === k ? "on" : "" }, t); b.addEventListener("click", () => { s.sort = k; save(s); for (const x of sortRow.children) x.classList.toggle("on", x === b); draw(last); }); return b; };
    const sortRow = el("div", { class: "sh-sort" });
    const condRow = el("div", { class: "sh-sort", role: "group", "aria-label": "Condition" });
    for (const [k, t] of [["new", "New"], ["all", "New and second hand"], ["used", "Second hand only"]]) {
      const b = el("button", { type: "button", class: s.cond === k ? "on" : "" }, t);
      b.addEventListener("click", () => { s.cond = k; for (const x of condRow.children) x.classList.toggle("on", x === b); go(); });
      condRow.append(b);
    }
    const side = el("div", { class: "sh-side" });
    const hits = (x, o) => { const h = x.t.toLowerCase(); return h.includes(o) || h.replace(/[\s-]+/g, "").includes(o.replace(/[\s-]+/g, "")); };
    const shown = (x) => (!s.inc.length || s.inc.includes(x.h)) && !s.ex.includes(x.h) && (!s.rate || (x.r || 0) >= s.rate);
    /** Filter groups with counts, like a price comparison sidebar: shops (show only or hide) and rating. Spec options show their counts too. */
    function drawSide(d) {
      if (!d || !d.items.length) { side.replaceChildren(); return; }
      const count = {};
      for (const x of d.items) count[x.h] = (count[x.h] || 0) + 1;
      const shops = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
      const shopBtn = (h) => {
        const st = s.inc.includes(h) ? "inc" : s.ex.includes(h) ? "ex" : "";
        const b = el("button", { type: "button", class: "sh-opt" + (st ? " on " + st : ""), title: "Click to show only, click again to hide" }, h + " (" + count[h] + ")");
        b.addEventListener("click", () => {
          s.inc = s.inc.filter((x) => x !== h); s.ex = s.ex.filter((x) => x !== h);
          if (!st) s.inc.push(h); else if (st === "inc") s.ex.push(h);
          save(s); drawSide(d); draw(d);
        });
        return b;
      };
      const rateBtn = (v, t) => {
        const n = d.items.filter((x) => (x.r || 0) >= v).length;
        const b = el("button", { type: "button", class: "sh-opt" + (s.rate === v ? " on" : "") }, t + (v ? " (" + n + ")" : ""));
        b.addEventListener("click", () => { s.rate = v; save(s); drawSide(d); draw(d); });
        return b;
      };
      side.replaceChildren(
        el("div", { class: "sh-g" }, el("span", {}, "Shops"), el("div", { class: "sh-opts" }, ...shops.map(shopBtn))),
        el("div", { class: "sh-g" }, el("span", {}, "Shop rating"), el("div", { class: "sh-opts" }, rateBtn(0, "Any"), rateBtn(3, "3★ and up"), rateBtn(4, "4★ and up"))));
    }
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

    const catSel = el("select", { "aria-label": "Search in category" }, ...CATLIST.map((c) => el("option", { value: c[0] }, c[1])));
    catSel.value = s.cat; curCat = s.cat;
    catSel.addEventListener("change", () => { s.cat = curCat = catSel.value; s.f = []; save(s); drawChips(); drawGroups(); go(); });
    const groups = el("div", { class: "sh-groups" });
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(go, 500); };
    function drawGroups() {
      groups.replaceChildren(...specsFor(q).map((g) => el("div", { class: "sh-g" },
        el("span", {}, g.name),
        el("div", { class: "sh-opts" }, ...g.o.map((o) => {
          const on = s.f.includes(o);
          const b = el("button", { type: "button", class: "sh-opt" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false" }, o + (last && last.items.length ? " (" + last.items.filter((x) => hits(x, o)).length + ")" : ""));
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
    // Filters sit on the right on a wide screen. On a phone they fold away behind a three-line button that turns into an X.
    const wrap = el("div", { class: "sh-wrap" });
    const fbtn = el("button", { type: "button", class: "sh-fbtn", "aria-expanded": "false", "aria-label": "Filters" },
      el("span", { class: "sh-bars", "aria-hidden": "true" }, el("i", {}), el("i", {}), el("i", {})), el("span", {}, "Filters"));
    const setOpen = (open) => {
      wrap.classList.toggle("open", open);
      fbtn.setAttribute("aria-expanded", open ? "true" : "false");
      fbtn.setAttribute("aria-label", open ? "Close filters" : "Filters");
    };
    fbtn.addEventListener("click", () => setOpen(!wrap.classList.contains("open")));
    const closeBtn = el("button", { type: "button", class: "sh-close", "aria-label": "Close filters" }, el("span", { class: "sh-bars", "aria-hidden": "true" }, el("i", {}), el("i", {}), el("i", {})));
    closeBtn.addEventListener("click", () => setOpen(false));
    const scrim = el("div", { class: "sh-scrim" });
    scrim.addEventListener("click", () => setOpen(false));
    const viewRow = el("div", { class: "sh-view", role: "group", "aria-label": "Layout" });
    for (const [k, t] of [["list", "List"], ["grid", "Grid"]]) {
      const b = el("button", { type: "button", class: s.view === k ? "on" : "", "aria-pressed": s.view === k ? "true" : "false" }, t);
      b.addEventListener("click", () => { s.view = k; save(s); for (const x of viewRow.children) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false"); } draw(last); });
      viewRow.append(b);
    }
    wrap.append(
      el("div", { class: "sh-main" }, el("div", { class: "sh-bar" }, fbtn, sortRow, viewRow), out),
      scrim,
      el("aside", { class: "sh-filters" },
        el("div", { class: "sh-fhead" }, el("b", {}, "Features"), closeBtn),
        el("section", { class: "sh-panel" },
          el("div", { class: "sh-row" }, field("Search in", catSel)),
          el("div", { class: "sh-row" }, field("Country", sel), field("From", min), field("To", max)),
          groups, field("More features", add), chips),
        el("div", { class: "sh-g" }, el("span", {}, "Condition"), condRow), side));
    root.replaceChildren(wrap);
    drawChips(); drawGroups();

    const guides = (d) => (d.guides && d.guides.length ? el("div", { class: "sh-tw" },
      el("div", { class: "sh-note" }, "Reviews and specs"),
      ...d.guides.map((x) => { const href = safe(x.u); return href ? el("a", { class: "sh-twl", href, target: "_top" }, el("b", {}, x.h), " ", x.t) : null; })) : null);
    function draw(d) {
      last = d;
      out.classList.toggle("grid", s.view === "grid");
      if (!d) return;
      const all = d.items;
      const items = all.filter(shown);
      const score = (x) => (x.m || []).length;
      items.sort(s.sort === "match" ? (a, b) => score(b) - score(a) || a.p - b.p : (a, b) => a.p - b.p);
      if (!items.length) {
        out.replaceChildren(el("div", { class: "ans" }, all.length ? "No offers match these filters." : "No prices found at " + COUNTRIES[d.cc] + " shops for “" + d.q + "”. Try a broader name or a wider price range."), guides(d));
        return;
      }
      const low = Math.min(...items.map((x) => x.p));
      out.replaceChildren(
        el("div", { class: "sh-note" }, items.length + " offers in " + COUNTRIES[d.cc] + ", prices from vergelijk.be and each shop."),
        ...items.map((x) => {
          const href = safe(x.u);
          const best = x.p === low;
          const feats = d.feats.map((f) => el("span", { class: "sh-feat" + ((x.m || []).includes(f) ? " ok" : "") }, ((x.m || []).includes(f) ? "✓ " : "") + f));
          const card = el(href ? "a" : "div", { class: "sh-card" + (best ? " best" : ""), href: href || null, target: "_top" },
            el("div", { class: "sh-img" }, img(x.i, "", "") || el("span", {}, "🛒")),
            el("div", { class: "sh-body" },
              el("h3", {}, x.t),
              el("div", { class: "sh-meta" }, el("b", {}, x.h), x.s ? el("em", { class: "sh-used" }, "Second hand") : el("em", {}, "Trusted shop"),
                x.r ? el("span", { class: "sh-rate", title: x.r.toFixed(1) + " out of 5" }, stars(x.r) + (x.n ? " (" + x.n + ")" : "")) : null),
              feats.length ? el("div", { class: "sh-feats" }, ...feats) : null),
            el("div", { class: "sh-price" },
              best ? el("small", {}, "Lowest price") : null,
              el("strong", {}, money(x.p, x.cur)),
              best ? null : el("small", { class: "diff" }, "+" + money(x.p - low, x.cur))));
          return card;
        }),
        guides(d));
    }

    async function go() {
      save(s);
      const my = ++token;
      out.replaceChildren(...[0, 1, 2, 3].map(() => el("div", { class: "skel" })));
      const params = { q, cc: s.cc };
      if (s.cat) params.cat = s.cat;
      if (s.min) params.min = s.min;
      if (s.max) params.max = s.max;
      if (s.f.length) params.f = s.f.join(",");
      if (s.cond !== "new") params.cond = s.cond;
      let d;
      try { d = await send("shop", params); } catch (e) { d = { error: "Shop unavailable" }; }
      if (my !== token) return;
      if (!d || d.error || !Array.isArray(d.items)) {
        out.replaceChildren(el("div", { class: "ans" }, (d && d.error) || "Shop unavailable"));
        return;
      }
      drawSide(d);
      drawGroups();
      draw(d);
    }
    go();
  }

  window.LodicaShop = { run };
})();
