"use strict";
// Instant answers on the search page: date, time, countdowns, units, sums, small tools and a speed test.
// answer() picks a card from the query alone, render() draws it. The same file runs on desktop and Android.
(function () {
  const DAY = 864e5;
  const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const NL_MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  const TXT = {
    en: {
      translate: "Translate", translateGo: "Translate", translateHint: "Text to translate", translateFail: "Translation failed.",
      speed: "Internet speed test", run: "Run speed test", stopTest: "Stop", again: "Test again", testing: "Testing…",
      speedNote: "Measured against Cloudflare. Uses up to about 100 MB.", speedFail: "The test failed. Check your connection.",
      down: "Download", up: "Upload", ping: "Ping", jitter: "Jitter",
      stopwatch: "Stopwatch", start: "Start", stop: "Stop", lap: "Lap", reset: "Reset",
      timer: "Timer", pause: "Pause", timeUp: "Time's up",
      color: "Colour picker",
      dice: "Dice", total: "Total", rollAgain: "Roll again",
      coin: "Coin flip", heads: "Heads", tails: "Tails", flipAgain: "Flip again",
      random: "Random number", between: "between", genAgain: "Generate again",
      date: "Date", week: "Week", dayN: "Day", time: "Time",
      countdown: "Countdown", day: "day", days: "days", today: "Today", until: "until", ago: "ago",
      moon: "Moon phase", lit: "lit", nextFull: "Next full moon in", nextNew: "Next new moon in",
      phases: ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"],
      leapYes: "is a leap year", leapNo: "is not a leap year", feb29: "February has 29 days", feb28: "February has 28 days", leapNext: "The next leap year is",
      calendar: "Calendar", convert: "Unit converter", currency: "Currency converter",
      ecb: "European Central Bank rate", loading: "Loading…", fail: "Could not load the rate.",
      weather: "Weather", feels: "Feels like", humidity: "Humidity", wind: "Wind", high: "High", low: "Low",
      wmo: ["Clear", "Mainly clear", "Partly cloudy", "Overcast", "Fog", "Drizzle", "Rain", "Snow", "Rain showers", "Snow showers", "Thunderstorm"],
      calculator: "Calculator", error: "Error", roman: "Roman numerals", daysIn: "days"
    },
    nl: {
      translate: "Vertalen", translateGo: "Vertaal", translateHint: "Tekst om te vertalen", translateFail: "Vertalen mislukt.",
      speed: "Internetsnelheid testen", run: "Start snelheidstest", stopTest: "Stop", again: "Opnieuw testen", testing: "Bezig met testen…",
      speedNote: "Gemeten via Cloudflare. Gebruikt tot ongeveer 100 MB.", speedFail: "De test is mislukt. Controleer je verbinding.",
      down: "Downloaden", up: "Uploaden", ping: "Ping", jitter: "Jitter",
      stopwatch: "Stopwatch", start: "Start", stop: "Stop", lap: "Ronde", reset: "Reset",
      timer: "Timer", pause: "Pauze", timeUp: "Tijd is om",
      color: "Kleurkiezer",
      dice: "Dobbelstenen", total: "Totaal", rollAgain: "Opnieuw gooien",
      coin: "Munt opgooien", heads: "Kop", tails: "Munt", flipAgain: "Opnieuw opgooien",
      random: "Willekeurig getal", between: "tussen", genAgain: "Nieuw getal",
      date: "Datum", week: "Week", dayN: "Dag", time: "Tijd",
      countdown: "Aftellen", day: "dag", days: "dagen", today: "Vandaag", until: "tot", ago: "geleden",
      moon: "Maanstand", lit: "verlicht", nextFull: "Volgende volle maan over", nextNew: "Volgende nieuwe maan over",
      phases: ["Nieuwe maan", "Wassende sikkel", "Eerste kwartier", "Wassende maan", "Volle maan", "Afnemende maan", "Laatste kwartier", "Afnemende sikkel"],
      leapYes: "is een schrikkeljaar", leapNo: "is geen schrikkeljaar", feb29: "Februari heeft 29 dagen", feb28: "Februari heeft 28 dagen", leapNext: "Het volgende schrikkeljaar is",
      calendar: "Kalender", convert: "Eenheden omrekenen", currency: "Valuta omrekenen",
      ecb: "Koers van de Europese Centrale Bank", loading: "Laden…", fail: "Koers laden mislukt.",
      weather: "Weer", feels: "Voelt als", humidity: "Vochtigheid", wind: "Wind", high: "Max", low: "Min",
      wmo: ["Helder", "Overwegend helder", "Half bewolkt", "Bewolkt", "Mist", "Motregen", "Regen", "Sneeuw", "Regenbuien", "Sneeuwbuien", "Onweer"],
      calculator: "Rekenmachine", error: "Fout", roman: "Romeinse cijfers", daysIn: "dagen"
    }
  };
  const textFor = {};
  const T = l => textFor[l] || (textFor[l] = Object.assign({}, TXT.en, TXT[l]));
  const loc = l => { try { return l && Intl.DateTimeFormat.supportedLocalesOf([l]).length ? l : "en"; } catch (e) { return "en"; } };
  const pad = n => String(n).padStart(2, "0");
  const plain = (v, sig) => String(Number(v.toPrecision(sig || 7)));
  const rint = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  function fmt(n, lang, sig) {
    if (!isFinite(n)) return String(n);
    return Number(n.toPrecision(sig || 6)).toLocaleString(loc(lang), { maximumFractionDigits: 12 });
  }
  function num(s) {
    s = String(s).replace(/\s/g, "");
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    return parseFloat(s.replace(",", "."));
  }
  function parseDur(s) {
    let t = 0, hit = false;
    s.replace(/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|uur|minutes?|minuut|minuten|mins?|m|seconds?|seconden?|secs?|s)(?![a-z])/g, (_, n, u) => {
      hit = true;
      t += parseFloat(n.replace(",", ".")) * (u[0] === "h" || u[0] === "u" ? 3600 : u[0] === "m" ? 60 : 1);
      return "";
    });
    return hit ? Math.round(t) : 0;
  }

  // Dates
  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m, d));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  }
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const s = h + l - 7 * m + 114;
    return [Math.floor(s / 31) - 1, (s % 31) + 1];
  }
  const shift = (y, [m, d], n) => { const t = new Date(y, m, d + n); return [t.getMonth(), t.getDate()]; };
  const nthDow = (y, m, dow, n) => [m, 1 + ((dow - new Date(y, m, 1).getDay() + 7) % 7) + (n - 1) * 7];
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const dateText = (lang, y, m, d, o) => new Date(y, m, d).toLocaleDateString(lang, o || { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const monthIdx = w => {
    if (!w || w.length < 3) return -1;
    const i = EN_MONTHS.findIndex(n => n.startsWith(w));
    return i >= 0 ? i : NL_MONTHS.findIndex(n => n.startsWith(w));
  };

  const HOL = [
    { en: "Christmas", nl: "Kerstmis", re: /^(?:christmas(?: day)?|xmas|kerst(?:mis|dag)?)$/, f: () => [11, 25] },
    { en: "Christmas Eve", nl: "Kerstavond", re: /^(?:christmas eve|kerstavond)$/, f: () => [11, 24] },
    { en: "New Year", nl: "Nieuwjaar", re: /^(?:new years?(?: day)?|nieuwjaar(?:sdag)?)$/, f: () => [0, 1] },
    { en: "New Year's Eve", nl: "Oudejaarsavond", re: /^(?:new years? eve|nye|oudejaarsavond|oudjaar)$/, f: () => [11, 31] },
    { en: "Easter", nl: "Pasen", re: /^(?:easter(?: sunday)?|pasen|paaszondag)$/, f: y => easter(y) },
    { en: "Good Friday", nl: "Goede Vrijdag", re: /^(?:good friday|goede vrijdag)$/, f: y => shift(y, easter(y), -2) },
    { en: "Easter Monday", nl: "Paasmaandag", re: /^(?:easter monday|paasmaandag)$/, f: y => shift(y, easter(y), 1) },
    { en: "Ascension Day", nl: "Hemelvaart", re: /^(?:ascension(?: day)?|hemelvaart(?:sdag)?)$/, f: y => shift(y, easter(y), 39) },
    { en: "Pentecost", nl: "Pinksteren", re: /^(?:pentecost|whit sunday|pinksteren)$/, f: y => shift(y, easter(y), 49) },
    { en: "Carnival", nl: "Carnaval", re: /^(?:carnival|carnaval|mardi gras|shrove tuesday|pancake day)$/, f: y => shift(y, easter(y), -47) },
    { en: "Halloween", nl: "Halloween", re: /^halloween$/, f: () => [9, 31] },
    { en: "Valentine's Day", nl: "Valentijnsdag", re: /^(?:valentines(?: day)?|valentijn(?:sdag)?)$/, f: () => [1, 14] },
    { en: "St Patrick's Day", nl: "St Patrick's Day", re: /^(?:st|saint) patricks day$/, f: () => [2, 17] },
    { en: "April Fools' Day", nl: "1 april", re: /^(?:april fools(?: day)?|1 april)$/, f: () => [3, 1] },
    { en: "Labour Day", nl: "Dag van de Arbeid", re: /^(?:labou?r day|may day|dag van de arbeid)$/, f: () => [4, 1] },
    { en: "Independence Day", nl: "Independence Day", re: /^(?:independence day|4th of july|fourth of july|july 4th)$/, f: () => [6, 4] },
    { en: "Bastille Day", nl: "Quatorze Juillet", re: /^(?:bastille day|quatorze juillet)$/, f: () => [6, 14] },
    { en: "Belgian National Day", nl: "Nationale feestdag", re: /^(?:belgian national day|nationale feestdag)$/, f: () => [6, 21] },
    { en: "King's Day", nl: "Koningsdag", re: /^(?:kings day|koningsdag)$/, f: () => [3, 27] },
    { en: "Sinterklaas", nl: "Sinterklaas", re: /^sinterklaas$/, f: () => [11, 5] },
    { en: "Thanksgiving", nl: "Thanksgiving", re: /^thanksgiving$/, f: y => nthDow(y, 10, 4, 4) },
    { en: "Black Friday", nl: "Black Friday", re: /^black friday$/, f: y => shift(y, nthDow(y, 10, 4, 4), 1) },
    { en: "Mother's Day", nl: "Moederdag", re: /^(?:mothers day|moederdag)$/, f: y => nthDow(y, 4, 0, 2) },
    { en: "Father's Day", nl: "Vaderdag", re: /^(?:fathers day|vaderdag)$/, f: (y, lang) => nthDow(y, 5, 0, lang === "nl" ? 2 : 3) }
  ];
  const holiday = s => HOL.find(h => h.re.test(s));

  function parseDate(s, now) {
    let y, m, d, m1;
    if ((m1 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m1[1]; m = m1[2] - 1; d = +m1[3]; }
    else if ((m1 = /^(\d{1,2})(?:st|nd|rd|th|e)? (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(s))) { d = +m1[1]; m = monthIdx(m1[2]); y = m1[3] ? +m1[3] : 0; }
    else if ((m1 = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s))) { d = +m1[2]; m = monthIdx(m1[1]); y = m1[3] ? +m1[3] : 0; }
    else return null;
    if (m < 0 || m > 11 || d < 1) return null;
    const ny = now.getFullYear(), today = new Date(ny, now.getMonth(), now.getDate());
    const yr = y || ny;
    let t = new Date(yr, m, d);
    if (t.getMonth() !== m) return null;
    if (!y && t < today) t = new Date(yr + 1, m, d);
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  }

  function target(text, now, lang) {
    text = text.replace(/['’]/g, "").replace(/^(?:the |next |this )+/, "").trim();
    let yr = 0;
    const ym = /^(.*\S)\s+(\d{4})$/.exec(text);
    if (ym && holiday(ym[1])) { text = ym[1]; yr = +ym[2]; }
    const hol = holiday(text);
    if (hol) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let y = yr || now.getFullYear(), md = hol.f(y, lang);
      if (!yr && new Date(y, md[0], md[1]) < today) { y++; md = hol.f(y, lang); }
      return { name: lang === "nl" ? hol.nl : hol.en, y, m: md[0], d: md[1] };
    }
    const dt = parseDate(text, now);
    return dt ? { name: "", y: dt.y, m: dt.m, d: dt.d } : null;
  }

  // Units
  const U = {}, UL = {}, CAT = {};
  function unit(cat, label, f, names, to, from) {
    const o = { cat, label, to: to || (v => v * f), from: from || (v => v / f) };
    UL[label] = o;
    (CAT[cat] = CAT[cat] || []).push(o);
    for (const n of names.concat(label.toLowerCase())) U[n] = o;
  }
  unit("len", "km", 1000, ["kilometer", "kilometers", "kilometre", "kilometres"]);
  unit("len", "m", 1, ["meter", "meters", "metre", "metres"]);
  unit("len", "cm", .01, ["centimeter", "centimeters", "centimetre", "centimetres"]);
  unit("len", "mm", .001, ["millimeter", "millimeters", "millimetre", "millimetres"]);
  unit("len", "mi", 1609.344, ["mile", "miles", "mijl", "mijlen"]);
  unit("len", "yd", .9144, ["yard", "yards"]);
  unit("len", "ft", .3048, ["foot", "feet", "voet"]);
  unit("len", "in", .0254, ["inch", "inches", "duim"]);
  unit("len", "nmi", 1852, ["nautical mile", "nautical miles"]);
  unit("mass", "kg", 1000, ["kilogram", "kilograms", "kilo", "kilos"]);
  unit("mass", "g", 1, ["gram", "grams"]);
  unit("mass", "mg", .001, ["milligram", "milligrams"]);
  unit("mass", "lb", 453.59237, ["lbs", "pound", "pounds"]);
  unit("mass", "oz", 28.349523125, ["ounce", "ounces"]);
  unit("mass", "t", 1e6, ["tonne", "tonnes", "metric ton", "metric tons"]);
  unit("vol", "l", 1, ["liter", "liters", "litre", "litres"]);
  unit("vol", "ml", .001, ["milliliter", "milliliters", "millilitre", "millilitres"]);
  unit("vol", "cl", .01, ["centiliter", "centiliters", "centilitre", "centilitres"]);
  unit("vol", "gal", 3.785411784, ["gallon", "gallons"]);
  unit("vol", "qt", .946352946, ["quart", "quarts"]);
  unit("vol", "pt", .473176473, ["pint", "pints"]);
  unit("vol", "cup", .2365882365, ["cups"]);
  unit("vol", "fl oz", .0295735295625, ["floz", "fluid ounce", "fluid ounces"]);
  unit("vol", "tbsp", .01478676478125, ["tablespoon", "tablespoons"]);
  unit("vol", "tsp", .00492892159375, ["teaspoon", "teaspoons"]);
  unit("area", "m²", 1, ["m2", "sqm", "square meter", "square meters", "square metre", "square metres"]);
  unit("area", "km²", 1e6, ["km2", "square kilometer", "square kilometers", "square kilometre", "square kilometres"]);
  unit("area", "ha", 1e4, ["hectare", "hectares"]);
  unit("area", "ac", 4046.8564224, ["acre", "acres"]);
  unit("area", "ft²", .09290304, ["ft2", "sqft", "sq ft", "square foot", "square feet"]);
  unit("area", "mi²", 2589988.110336, ["mi2", "square mile", "square miles"]);
  unit("speed", "km/h", 1 / 3.6, ["kmh", "kph", "kilometers per hour", "kilometres per hour"]);
  unit("speed", "m/s", 1, ["mps", "meters per second", "metres per second"]);
  unit("speed", "mph", .44704, ["miles per hour"]);
  unit("speed", "kn", .514444444, ["knot", "knots"]);
  unit("data", "bit", .125, ["bits"]);
  unit("data", "B", 1, ["byte", "bytes"]);
  unit("data", "KB", 1e3, ["kilobyte", "kilobytes"]);
  unit("data", "MB", 1e6, ["megabyte", "megabytes"]);
  unit("data", "GB", 1e9, ["gigabyte", "gigabytes"]);
  unit("data", "TB", 1e12, ["terabyte", "terabytes"]);
  unit("data", "KiB", 1024, ["kibibyte", "kibibytes"]);
  unit("data", "MiB", 1048576, ["mebibyte", "mebibytes"]);
  unit("data", "GiB", 1073741824, ["gibibyte", "gibibytes"]);
  unit("data", "TiB", 1099511627776, ["tebibyte", "tebibytes"]);
  unit("time", "ms", .001, ["millisecond", "milliseconds"]);
  unit("time", "s", 1, ["sec", "secs", "second", "seconds"]);
  unit("time", "min", 60, ["mins", "minute", "minutes"]);
  unit("time", "h", 3600, ["hr", "hrs", "hour", "hours"]);
  unit("time", "day", 86400, ["days"]);
  unit("time", "week", 604800, ["weeks"]);
  unit("time", "year", 31557600, ["years", "yr", "yrs"]);
  unit("temp", "°C", 1, ["c", "celsius", "degrees celsius", "degree celsius", "centigrade"], v => v, v => v);
  unit("temp", "°F", 1, ["f", "fahrenheit", "degrees fahrenheit", "degree fahrenheit"], v => (v - 32) * 5 / 9, v => v * 9 / 5 + 32);
  unit("temp", "K", 1, ["kelvin"], v => v - 273.15, v => v + 273.15);
  const unitOf = s => U[s.toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim()] || UL[s];
  function convert(v, from, to) {
    const a = typeof from === "string" ? unitOf(from) : from, b = typeof to === "string" ? unitOf(to) : to;
    return a && b && a.cat === b.cat ? b.from(a.to(v)) : NaN;
  }

  const CUR = ["AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR"];
  const TR_LANGS = ["ar", "de", "en", "es", "fr", "it", "ja", "nl", "pl", "pt", "ru", "tr", "zh"];
  const TR_NAME = {};
  for (const [k, v] of Object.entries({ ar: "arabic arabisch", de: "german duits deutsch", en: "english engels", es: "spanish spaans", fr: "french frans français", it: "italian italiaans", ja: "japanese japans", nl: "dutch nederlands", pl: "polish pools", pt: "portuguese portugees", ru: "russian russisch", tr: "turkish turks", zh: "chinese chinees" })) for (const n of v.split(" ")) TR_NAME[n] = k;
  const CUR_NAME = {
    dollar: "USD", dollars: "USD", "us dollar": "USD", "us dollars": "USD", euro: "EUR", euros: "EUR", pound: "GBP", pounds: "GBP",
    "british pound": "GBP", "british pounds": "GBP", sterling: "GBP", yen: "JPY", franc: "CHF", francs: "CHF", "swiss franc": "CHF",
    "swiss francs": "CHF", yuan: "CNY", renminbi: "CNY", rupee: "INR", rupees: "INR", "canadian dollar": "CAD", "canadian dollars": "CAD",
    "australian dollar": "AUD", "australian dollars": "AUD", zloty: "PLN", won: "KRW", baht: "THB", lira: "TRY", rand: "ZAR",
    krona: "SEK", kronor: "SEK", "norwegian krone": "NOK", "danish krone": "DKK", peso: "MXN"
  };
  const curOf = s => { s = s.toLowerCase().trim(); const u = s.toUpperCase(); return CUR.includes(u) ? u : CUR_NAME[s] || ""; };

  const ZONES = {
    "new york": "America/New_York", nyc: "America/New_York", "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles",
    chicago: "America/Chicago", denver: "America/Denver", toronto: "America/Toronto", vancouver: "America/Vancouver",
    "mexico city": "America/Mexico_City", "sao paulo": "America/Sao_Paulo", "buenos aires": "America/Argentina/Buenos_Aires",
    london: "Europe/London", londen: "Europe/London", dublin: "Europe/Dublin", lisbon: "Europe/Lisbon", madrid: "Europe/Madrid",
    paris: "Europe/Paris", parijs: "Europe/Paris", brussels: "Europe/Brussels", brussel: "Europe/Brussels", amsterdam: "Europe/Amsterdam",
    berlin: "Europe/Berlin", rome: "Europe/Rome", vienna: "Europe/Vienna", wenen: "Europe/Vienna", zurich: "Europe/Zurich",
    stockholm: "Europe/Stockholm", oslo: "Europe/Oslo", copenhagen: "Europe/Copenhagen", helsinki: "Europe/Helsinki",
    warsaw: "Europe/Warsaw", prague: "Europe/Prague", athens: "Europe/Athens", istanbul: "Europe/Istanbul", moscow: "Europe/Moscow",
    kyiv: "Europe/Kyiv", cairo: "Africa/Cairo", lagos: "Africa/Lagos", nairobi: "Africa/Nairobi", johannesburg: "Africa/Johannesburg",
    dubai: "Asia/Dubai", karachi: "Asia/Karachi", mumbai: "Asia/Kolkata", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata",
    kolkata: "Asia/Kolkata", dhaka: "Asia/Dhaka", bangkok: "Asia/Bangkok", jakarta: "Asia/Jakarta", singapore: "Asia/Singapore",
    "hong kong": "Asia/Hong_Kong", beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai", taipei: "Asia/Taipei", seoul: "Asia/Seoul",
    tokyo: "Asia/Tokyo", tokio: "Asia/Tokyo", manila: "Asia/Manila", sydney: "Australia/Sydney", melbourne: "Australia/Melbourne",
    brisbane: "Australia/Brisbane", perth: "Australia/Perth", auckland: "Pacific/Auckland", honolulu: "Pacific/Honolulu",
    anchorage: "America/Anchorage", utc: "UTC", gmt: "UTC"
  };
  function clockAt(date, lang, zone, secs) {
    const z = zone ? { timeZone: zone } : {};
    return {
      time: date.toLocaleTimeString(lang, Object.assign({ hour: "2-digit", minute: "2-digit" }, secs ? { second: "2-digit" } : {}, z)),
      date: date.toLocaleDateString(lang, Object.assign({ weekday: "long", day: "numeric", month: "long" }, z))
    };
  }

  // Maths
  const FN = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
    atan: Math.atan, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil
  };
  function fact(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  // Recursive descent, no eval. Returns NaN for anything it does not understand.
  function calc(src) {
    const toks = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|([a-z]+)|([-+*\/^%()!]))/y;
    let pos = 0, i = 0, m;
    while (pos < src.length) {
      re.lastIndex = pos;
      m = re.exec(src);
      if (!m) { if (/^\s*$/.test(src.slice(pos))) break; return NaN; }
      pos = re.lastIndex;
      toks.push(m[1] != null ? { n: parseFloat(m[1]) } : m[2] ? { w: m[2] } : { o: m[3] });
      if (toks.length > 200) return NaN;
    }
    const op = o => toks[i] && toks[i].o === o;
    const word = w => toks[i] && toks[i].w === w;
    function expr() {
      let v = term();
      while (op("+") || op("-")) { const o = toks[i++].o, r = term(); v = o === "+" ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        if (op("*") || op("/")) { const o = toks[i++].o, r = unary(); v = o === "*" ? v * r : v / r; }
        else if (word("mod")) { i++; v %= unary(); }
        else return v;
      }
    }
    function unary() {
      if (op("-")) { i++; return -unary(); }
      if (op("+")) { i++; return unary(); }
      const b = post();
      if (op("^")) { i++; return Math.pow(b, unary()); }
      return b;
    }
    function post() {
      let v = primary();
      for (;;) {
        if (op("!")) { i++; v = fact(v); }
        else if (op("%")) { i++; v /= 100; }
        else return v;
      }
    }
    function primary() {
      const t = toks[i++];
      if (!t) return NaN;
      if (t.n != null) return t.n;
      if (t.o === "(") { const v = expr(); if (!op(")")) return NaN; i++; return v; }
      if (t.w === "pi") return Math.PI;
      if (t.w === "e") return Math.E;
      if (t.w && FN[t.w] && op("(")) { i++; const v = expr(); if (!op(")")) return NaN; i++; return FN[t.w](v); }
      return NaN;
    }
    const v = expr();
    return i === toks.length ? v : NaN;
  }

  function toRoman(n) {
    const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let s = "";
    for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
    return s;
  }
  function fromRoman(s) {
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let n = 0;
    for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] || 0) ? -v[s[i]] : v[s[i]];
    return toRoman(n) === s ? n : 0;
  }

  // Data builders for the cards that can be rerolled.
  const rollDice = (n, sides, rand) => {
    const rolls = Array.from({ length: n }, () => rint(rand, 1, sides));
    return { type: "dice", n, sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
  };
  const flipCoin = rand => ({ type: "coin", side: rand() < .5 ? "heads" : "tails" });
  const pickNumber = (lo, hi, rand) => ({ type: "random", lo, hi, value: rint(rand, lo, hi) });
  function reroll(d, rand) {
    rand = rand || Math.random;
    if (d.type === "dice") return rollDice(d.n, d.sides, rand);
    if (d.type === "coin") return flipCoin(rand);
    if (d.type === "random") return pickNumber(d.lo, d.hi, rand);
    return d;
  }

  const SYN = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const fact_ = (type, label, big, sub, extra) => Object.assign({ type, label, big, sub: sub || "" }, extra);
  const plural = (L, n) => n + " " + (Math.abs(n) === 1 ? L.day : L.days);

  const DATE_Q = {
    date: ["date", "the date", "today's date", "todays date", "current date", "date today", "what day is it", "what day is it today", "what day is today",
      "what's today", "whats today", "what is today", "what is the date", "what's the date", "what is the date today", "what's the date today",
      "what is today's date", "what's today's date", "what date is it", "what date is it today", "what is the current date", "which day is it",
      "which day is it today", "what day of the week is it", "what is the day today", "what's the day today", "welke dag is het", "welke dag is het vandaag",
      "wat is de datum", "wat is de datum vandaag", "datum vandaag", "welke datum is het", "welke datum is het vandaag", "welke datum is het nu", "vandaag", "de datum", "huidige datum"],
    week: ["what week is it", "what week number is it", "week number", "current week", "what is the week number", "what's the week number", "which week is it", "welke week is het", "weeknummer", "welk weeknummer is het", "weeknummer vandaag"],
    year: ["what year is it", "what's the year", "what is the year", "current year", "which year is it", "welk jaar is het", "welk jaar zijn we", "in welk jaar zitten we"],
    month: ["what month is it", "current month", "which month is it", "what's the month", "welke maand is het", "welke maand zijn we", "in welke maand zitten we"]
  };
  const DUR = "(?:\\d+(?:[.,]\\d+)?\\s?(?:hours?|hrs?|h|uur|minutes?|minuut|minuten|mins?|m|seconds?|seconden?|secs?|s)(?![a-z])(?:,? and | en | )?)+";
  const TIMER = new RegExp("^(?:(?:set|zet) (?:a |an |the |een |de )?)?(?:online )?(?:" + DUR + ")?(?:timer|kookwekker|countdown(?: timer)?)(?: (?:for |of |voor |van )?(?:" + DUR + "|\\d{1,3}))?$");
  const MATH_WORDS = new Set(Object.keys(FN).concat(["pi", "e", "mod", "x"]));

  // Each matcher takes the normalised query and returns card data or null. Order matters.
  const MATCH = [
    function speed(s) {
      return /^(?:(?:internet |wifi |wi-fi |broadband |network |my )?(?:speed ?test)|test (?:my )?(?:internet |wifi )?speed|how fast is my (?:internet|wifi|connection)|(?:internet|wifi|wi-fi) speed(?: test)?|check (?:my )?internet speed|snelheidstest|internetsnelheid(?: test)?|internet snelheid test)$/.test(s) ? { type: "speed" } : null;
    },
    function stopwatch(s) { return /^(?:online )?(?:stop ?watch|chronometer|stopwatch)$/.test(s) ? { type: "stopwatch" } : null; },
    function timer(s) {
      if (!TIMER.test(s)) return null;
      let sec = parseDur(s);
      if (!sec) { const b = /(\d{1,3})$/.exec(s); sec = b ? +b[1] * 60 : 300; }
      return sec > 0 && sec <= 86400 ? { type: "timer", seconds: sec } : null;
    },
    function color(s) {
      let m;
      if (/^(?:colou?r ?picker|kleurkiezer|kleur kiezer)$/.test(s)) return { type: "color", r: 245, g: 158, b: 11 };
      if ((m = /^(?:#|(?:hex|colou?r) #?)([0-9a-f]{6}|[0-9a-f]{3})$/.exec(s))) {
        let x = m[1];
        if (x.length === 3) x = x.replace(/./g, "$&$&");
        return { type: "color", r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4), 16) };
      }
      if ((m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s)) && m.slice(1).every(n => +n < 256)) return { type: "color", r: +m[1], g: +m[2], b: +m[3] };
      return null;
    },
    function dice(s, c) {
      if (s === "die") return null;
      const m = /^(?:(?:roll|throw|gooi) (?:a |an |the |some |een |de )?)?(?:(\d{1,2})?d(\d{1,3})|dice|die|dobbelsteen|dobbelstenen)$|^dice roll$/.exec(s);
      if (!m) return null;
      const n = m[1] ? +m[1] : 1, sides = m[2] ? +m[2] : 6;
      return n >= 1 && n <= 20 && sides >= 2 && sides <= 1000 ? rollDice(n, sides, c.rand) : null;
    },
    function coin(s, c) { return /^(?:(?:flip|toss) (?:a |the )?coin|coin (?:flip|toss)|heads or tails|kop of munt|munt werpen)$/.test(s) ? flipCoin(c.rand) : null; },
    function random(s, c) {
      const m = /^(?:random number(?: generator)?|rng|pick a (?:random )?number|willekeurig(?:e)? ?(?:getal|nummer)|toevalsgetal|random getal)\b\s*(.*)$/.exec(s);
      if (!m) return null;
      let lo = 1, hi = 10;
      const r = /(-?\d+)\s*(?:and|to|-|–|en|tot)\s*(-?\d+)/.exec(m[1]);
      if (r) { lo = +r[1]; hi = +r[2]; if (lo > hi) [lo, hi] = [hi, lo]; }
      else if (m[1]) return null;
      return Math.abs(lo) <= 1e9 && Math.abs(hi) <= 1e9 ? pickNumber(lo, hi, c.rand) : null;
    },
    function date(s, c) {
      const focus = Object.keys(DATE_Q).find(k => DATE_Q[k].includes(s));
      if (!focus) return null;
      const L = T(c.lang), n = c.now, y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
      const wk = isoWeek(y, m, d), doy = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / DAY);
      const full = dateText(c.lang, y, m, d), tail = L.week + " " + wk + " · " + L.dayN + " " + doy + " / " + (isLeap(y) ? 366 : 365);
      let big = full, sub = tail;
      if (focus === "week") { big = L.week + " " + wk; sub = full; }
      else if (focus === "year") { big = String(y); sub = tail; }
      else if (focus === "month") { big = dateText(c.lang, y, m, 1, { month: "long", year: "numeric" }); sub = full; }
      return fact_("date", L.date, big, sub, { y, m, d, week: wk, doy });
    },
    function time(s, c) {
      let zone = null, place = "", m;
      if (/^(?:what(?:'s| is) the )?(?:current |local )?time(?: now| right now| today)?$|^what time is it(?: now| right now)?$|^hoe laat is het$/.test(s)) zone = "";
      else if ((m = /^(?:what(?:'s| is) the )?(?:current |local )?time (?:in|at) (.+)$|^what time is it (?:in|at) (.+)$|^(.+) time$|^hoe laat is het in (.+)$/.exec(s))) {
        const name = (m[1] || m[2] || m[3] || m[4]).replace(/^the /, "").trim();
        if (!ZONES[name]) return null;
        zone = ZONES[name];
        place = name.replace(/\b\w/g, x => x.toUpperCase());
        if (name === "utc" || name === "gmt") place = name.toUpperCase();
      } else return null;
      try { const t = clockAt(c.now, c.lang, zone || undefined, true); return fact_("time", T(c.lang).time, t.time, (place ? place + " · " : "") + t.date, { zone: zone || "", place }); }
      catch (e) { return null; }
    },
    function moon(s, c) {
      if (!/^(?:(?:current |todays? |today's )?moon phase|moon phases|phase of the moon|what(?:'s| is) the (?:current )?moon phase|what phase is the moon(?: in)?|what moon is it|moon tonight|moon phase (?:today|tonight)|maanstand|maanfase)(?: today| tonight| now)?$/.test(s)) return null;
      const L = T(c.lang), age = (((c.now.getTime() - NEW_MOON) / DAY) % SYN + SYN) % SYN, phase = age / SYN;
      const lit = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100), idx = Math.floor((phase * 8 + .5) % 8);
      const full = Math.round(((.5 - phase + 1) % 1) * SYN), fresh = Math.round((1 - phase) * SYN);
      const sub = lit + "% " + L.lit + " · " + (full <= fresh ? L.nextFull + " " + plural(L, full) : L.nextNew + " " + plural(L, fresh));
      return fact_("moon", L.moon, L.phases[idx], sub, { phase, lit, idx });
    },
    function leap(s, c) {
      const L = T(c.lang), y0 = c.now.getFullYear();
      let m, y;
      if ((m = /^is (\d{3,4}) a leap year$|^leap year (\d{3,4})$|^is (\d{3,4}) een schrikkeljaar$|^schrikkeljaar (\d{3,4})$/.exec(s))) y = +(m[1] || m[2] || m[3] || m[4]);
      else if ((m = /^is (this|next|last) year a leap year$|^is (dit|volgend|vorig) jaar een schrikkeljaar$/.exec(s))) { const w = m[1] || m[2]; y = y0 + (w === "next" || w === "volgend" ? 1 : w === "last" || w === "vorig" ? -1 : 0); }
      else if (/^(?:leap year|schrikkeljaar|is it a leap year|is het een schrikkeljaar|is het dit jaar een schrikkeljaar)$/.test(s)) y = y0;
      else if (/^(?:when is |wanneer is )?(?:the |het )?(?:next leap year|volgende schrikkeljaar)$/.test(s)) {
        y = y0 + 1;
        while (!isLeap(y)) y++;
        return fact_("leap", L.calendar, String(y), L.leapNext + " " + y + ".", { year: y, leap: true });
      } else return null;
      const lp = isLeap(y);
      return fact_("leap", L.calendar, y + " " + (lp ? L.leapYes : L.leapNo), lp ? L.feb29 : L.feb28, { year: y, leap: lp });
    },
    function calendar(s, c) {
      const m = /^(?:calendar|kalender)(?: (?:for )?([a-z]+))?(?: (\d{4}))?$/.exec(s);
      if (!m) return null;
      const n = c.now;
      let y = n.getFullYear(), mo = n.getMonth();
      if (m[1]) { mo = monthIdx(m[1]); if (mo < 0) return null; }
      else if (m[2] && +m[2] !== y) mo = 0;
      if (m[2]) y = +m[2];
      return { type: "calendar", y, m: mo, today: [n.getFullYear(), n.getMonth(), n.getDate()] };
    },
    function monthDays(s, c) {
      const m = /^(?:how many days (?:are )?in (?:the month of )?|hoeveel dagen (?:heeft|zijn er in|telt) )([a-z]+)(?: (\d{4}))?$/.exec(s);
      if (!m) return null;
      const mo = monthIdx(m[1]);
      if (mo < 0) return null;
      const y = m[2] ? +m[2] : c.now.getFullYear(), L = T(c.lang);
      return fact_("days", dateText(c.lang, y, mo, 1, { month: "long", year: "numeric" }), daysIn(y, mo) + " " + L.daysIn, "");
    },
    function countdown(s, c) {
      let m = /^(?:how (?:many )?(?:days?|weeks?|sleeps?|long|much time)(?: (?:is it|are there|is there|are|is))?(?: left)? (?:until|till|to|before)|(?:days?|time)(?: left)? (?:until|till|to|before)|countdown (?:to|until|till)|hoeveel dagen (?:tot|nog tot|nog voor)|dagen tot|aftellen naar) (.+)$|^(?:when is|wanneer is|wanneer valt) (.+)$|^(.+) countdown$/.exec(s);
      if (!m) return null;
      const t = target(m[1] || m[2] || m[3], c.now, c.lang);
      if (!t) return null;
      const L = T(c.lang), n = c.now;
      const days = Math.round((Date.UTC(t.y, t.m, t.d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / DAY);
      const when = dateText(c.lang, t.y, t.m, t.d);
      const sub = (days < 0 ? "" : L.until + " ") + (t.name ? t.name + " · " : "") + when;
      const big = days === 0 ? L.today : plural(L, Math.abs(days)) + (days < 0 ? " " + L.ago : "");
      return fact_("countdown", L.countdown, big, sub, { days, name: t.name, y: t.y, m: t.m, d: t.d });
    },
    function conv(s, c) {
      const m = /^(?:convert\s+)?(-?[\d.,]+)\s*([^\d]+?)\s+(?:to|in|into|as|naar)\s+([^\d]+)$/.exec(s) || /^(?:convert\s+)?()([^\d]+?)\s+(?:to|in|into|naar)\s+([^\d]+)$/.exec(s);
      if (!m) return null;
      const amount = m[1] === "" ? 1 : num(m[1]);
      if (!isFinite(amount)) return null;
      const a = unitOf(m[2]), b = unitOf(m[3]);
      if (a && b && a.cat === b.cat) {
        const value = b.from(a.to(amount));
        return { type: "convert", cat: a.cat, amount, a: a.label, b: b.label, value, out: fmt(value, c.lang) };
      }
      const from = curOf(m[2]), to = curOf(m[3]);
      if (from && to && !c.priv) return { type: "currency", amount, from, to };
      return null;
    },
    function translate(s, c) {
      if (c.priv) return null;
      const m = /^(?:(?:google |online )?translat(?:e|or|ion)|vertaal|vertaler|vertalen)(?: (.+))?$/.exec(s);
      if (!m) return null;
      let text = m[1] || "", to = c.lang === "en" ? "es" : "en";
      const t = /^(.*?)\s*\b(?:to|into|in|naar)\s+([a-zé]+)$/.exec(text);
      if (t && TR_NAME[t[2]]) { text = t[1]; to = TR_NAME[t[2]]; }
      else if (TR_NAME[text]) { to = TR_NAME[text]; text = ""; }
      return { type: "translate", text, to };
    },
    function weather(s, c) {
      if (c.priv) return null;
      const m = /^(?:what(?:'s| is) the )?(?:weather|forecast|temperature|weer)(?: like)?(?: (?:in|for|at|voor|te|van))? ([\p{L} .'-]{2,40})$/u.exec(s) || /^([\p{L} .'-]{2,40}) (?:weather|forecast|weer)$/u.exec(s);
      if (!m) return null;
      const place = m[1].replace(/ (?:today|tomorrow|now|tonight)$/, "").trim();
      if (place.length < 2 || /^(?:today|tomorrow|now|tonight|report|channel|app|radar|map|maps|satellite|underground|forecast|vandaag|morgen|nu)$/.test(place)) return null;
      return { type: "weather", place };
    },
    function roman(s, c) {
      let m;
      if ((m = /^(\d{1,4}) (?:in|to) roman(?: numerals?)?$|^roman (?:numerals? )?(?:for )?(\d{1,4})$/.exec(s))) {
        const n = +(m[1] || m[2]);
        return n >= 1 && n <= 3999 ? fact_("roman", T(c.lang).roman, toRoman(n), String(n)) : null;
      }
      if ((m = /^([mdclxvi]{2,}) (?:in|to) (?:numbers?|arabic|decimal|digits)$/.exec(s))) {
        const n = fromRoman(m[1].toUpperCase());
        return n ? fact_("roman", T(c.lang).roman, String(n), m[1].toUpperCase()) : null;
      }
      return null;
    },
    function calculator(s) { return /^(?:calculator|calc|rekenmachine|online calculator)$/.test(s) ? { type: "calculator" } : null; },
    function sum(s, c) {
      let m = /^(?:what(?:'s| is)|whats|hoeveel is|wat is)\s+(.*)$/.exec(s);
      s = (m ? m[1] : s).replace(/^(?:calculate|calc|compute|solve|bereken)\s+/, "").replace(/^=\s*/, "").replace(/\s*=\s*\??$/, "");
      if ((m = /^(-?[\d.,]+)\s*(?:%|percent|procent) (?:of|van) (-?[\d.,]+)$/.exec(s))) {
        const v = num(m[1]) / 100 * num(m[2]);
        return isFinite(v) ? { type: "calc", expr: s, value: v, text: fmt(v, c.lang, 12) } : null;
      }
      if (!/^[\d\s.,+\-*\/x×÷^%()!a-z]+$/.test(s) || !/\d/.test(s)) return null;
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s) || /^\d{4}-\d{4}$/.test(s) || /^\d+(?:-\d+){2,}$/.test(s)) return null;
      const words = s.match(/[a-z]+/g) || [];
      if (!words.every(w => MATH_WORDS.has(w))) return null;
      let e = s.replace(/÷/g, "/");
      for (let prev; prev !== e;) { prev = e; e = e.replace(/([\d)])\s*[x×]\s*(?=[\d(.])/g, "$1*"); }
      if (/[a-z]/.test(e.replace(/\b(?:mod|pi|e|sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|ln|log2|log|exp|round|floor|ceil)\b/g, ""))) return null;
      e = e.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/,/g, ".");
      const binary = /[\d)!%.]\s*(?:[-+*\/^]|mod\b)\s*[\d(.a-z-]/.test(e), fn = /\b(?:sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|ln|log2|log|exp|round|floor|ceil)\s*\(/.test(e), bang = /\d!/.test(e);
      if (!binary && !fn && !bang) return null;
      const v = calc(e);
      return isFinite(v) ? { type: "calc", expr: s.replace(/\s+/g, " "), value: v, text: fmt(v, c.lang, 12) } : null;
    }
  ];

  function answer(q, o) {
    o = o || {};
    const s = String(q || "").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim().replace(/\?+$/, "").replace(/(?<![\d)])!+$/, "").trim();
    if (!s || s.length > 80) return null;
    const c = { now: o.now || new Date(), lang: loc(o.lang), rand: o.rand || Math.random, priv: !!o.priv };
    for (const f of MATCH) {
      const r = f(s, c);
      if (r) return r;
    }
    return null;
  }

  // Drawing
  const SVG = "http://www.w3.org/2000/svg";
  function h(tag, cls, ...kids) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k of kids) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  function svg(tag, attrs) {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const card = (label, ...kids) => h("div", "inst-card", h("div", "inst-label", label), ...kids);
  const row = (...kids) => h("div", "inst-row", ...kids);
  const btn = (text, fn, cls) => { const b = h("button", "inst-btn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); return b; };
  const field = () => { const i = h("input", "inst-in"); i.type = "text"; i.inputMode = "decimal"; return i; };
  const select = (opts, value) => { const s = h("select", "inst-in inst-sel"); for (const o of opts) { const e = h("option", "", o); e.value = o; s.append(e); } s.value = value; return s; };

  let live = [];
  const stop = () => { for (const f of live) try { f(); } catch (e) { /* already gone */ } live = []; };
  const every = (ms, fn) => { const id = setInterval(fn, ms); live.push(() => clearInterval(id)); };

  const clock = ms => {
    const t = Math.floor(ms / 10), hh = Math.floor(t / 360000), mm = Math.floor(t / 6000) % 60;
    return (hh ? hh + ":" + pad(mm) : mm) + ":" + pad(Math.floor(t / 100) % 60) + "." + pad(t % 100);
  };
  const hms = ms => {
    const t = Math.ceil(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60;
    return (hh ? hh + ":" + pad(mm) : mm) + ":" + pad(t % 60);
  };
  function beep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, .35, .7].forEach(t => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; g.gain.value = .2;
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .2);
      });
    } catch (e) { /* no audio here */ }
  }

  const SPEED = "https://speed.cloudflare.com/";
  async function speedTest(on, signal) {
    const opt = { cache: "no-store", signal };
    const pings = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      await fetch(SPEED + "__down?bytes=0&r=" + Math.random(), opt).then(r => r.arrayBuffer());
      if (i) { pings.push(performance.now() - t0); on("ping", median(pings)); }
    }
    on("jitter", pings.slice(1).reduce((s, v, i) => s + Math.abs(v - pings[i]), 0) / Math.max(1, pings.length - 1));
    let got = 0;
    const t1 = performance.now();
    while (performance.now() - t1 < 8000 && got < 1e8) {
      const rd = (await fetch(SPEED + "__down?bytes=25000000&r=" + Math.random(), opt)).body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        got += value.length;
        const dt = (performance.now() - t1) / 1000;
        if (dt > .3) on("down", got * 8 / 1e6 / dt);
        if (dt > 8 || got >= 1e8) { rd.cancel(); break; }
      }
    }
    const blob = new Blob([new Uint8Array(2e6)]);
    let sent = 0;
    const t2 = performance.now();
    while (performance.now() - t2 < 6000 && sent < 25e6) {
      await fetch(SPEED + "__up", { method: "POST", body: blob, signal });
      sent += 2e6;
      on("up", sent * 8 / 1e6 / ((performance.now() - t2) / 1000));
    }
  }

  const R = {};
  R.fact = d => card(d.label, h("div", "inst-big", d.big), d.sub && h("div", "inst-sub", d.sub));
  R.calc = (d, c) => card(d.expr + " =", h("div", "inst-big", d.text));

  R.speed = (d, c) => {
    const L = T(c.lang), val = {};
    const stat = (k, u) => { val[k] = h("div", "inst-num", "–"); return h("div", "inst-stat", val[k], h("div", "inst-sub", L[k] + " · " + u)); };
    const stats = h("div", "inst-stats", stat("down", "Mbps"), stat("up", "Mbps"), stat("ping", "ms"), stat("jitter", "ms"));
    const note = h("div", "inst-sub", L.speedNote);
    let ctl = null;
    const go = btn(L.run, async () => {
      if (ctl) { ctl.abort(); return; }
      const mine = ctl = new AbortController();
      go.textContent = L.stopTest; note.textContent = L.testing;
      for (const k in val) val[k].textContent = "–";
      try {
        await speedTest((k, v) => { val[k].textContent = fmt(v, c.lang, 3); }, mine.signal);
        note.textContent = L.speedNote;
      } catch (e) { note.textContent = mine.signal.aborted ? L.speedNote : L.speedFail; }
      ctl = null; go.textContent = L.again;
    });
    live.push(() => ctl && ctl.abort());
    return card(L.speed, stats, row(go), note);
  };

  R.stopwatch = (d, c) => {
    const L = T(c.lang);
    let acc = 0, t0 = 0, run = false, n = 0;
    const out = h("div", "inst-big inst-mono", clock(0)), laps = h("div", "inst-laps");
    const cur = () => acc + (run ? performance.now() - t0 : 0);
    every(50, () => { if (run) out.textContent = clock(cur()); });
    const go = btn(L.start, () => {
      if (run) { acc = cur(); run = false; go.textContent = L.start; }
      else { t0 = performance.now(); run = true; go.textContent = L.stop; }
      out.textContent = clock(cur());
    });
    const lap = btn(L.lap, () => { if (run || acc) laps.prepend(h("div", "inst-sub inst-mono", "#" + (++n) + "  " + clock(cur()))); }, "inst-ghost");
    const reset = btn(L.reset, () => { run = false; acc = 0; n = 0; go.textContent = L.start; out.textContent = clock(0); laps.textContent = ""; }, "inst-ghost");
    return card(L.stopwatch, out, row(go, lap, reset), laps);
  };

  R.timer = (d, c) => {
    const L = T(c.lang), total = d.seconds * 1000;
    let left = total, end = 0, run = false;
    const out = h("div", "inst-big inst-mono", hms(left));
    const go = btn(L.start, () => {
      if (run) { left = Math.max(0, end - Date.now()); run = false; go.textContent = L.start; out.textContent = hms(left); return; }
      if (left <= 0) left = total;
      end = Date.now() + left; run = true; go.textContent = L.pause;
      out.classList.remove("inst-done"); out.textContent = hms(left);
    });
    every(200, () => {
      if (!run) return;
      left = end - Date.now();
      if (left > 0) { out.textContent = hms(left); return; }
      left = 0; run = false; go.textContent = L.start;
      out.classList.add("inst-done"); out.textContent = L.timeUp; beep();
    });
    const reset = btn(L.reset, () => { run = false; left = total; go.textContent = L.start; out.classList.remove("inst-done"); out.textContent = hms(left); }, "inst-ghost");
    return card(L.timer, out, row(go, reset));
  };

  R.color = (d, c) => {
    const v = [d.r, d.g, d.b], sw = h("div", "inst-swatch"), hex = h("div", "inst-mono"), rgb = h("div", "inst-mono"), hsl = h("div", "inst-mono");
    function paint() {
      const [r, g, b] = v, mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, dl = mx - mn;
      let hue = 0;
      if (dl) {
        hue = mx === r / 255 ? ((g - b) / 255 / dl + 6) % 6 : mx === g / 255 ? (b - r) / 255 / dl + 2 : (r - g) / 255 / dl + 4;
        hue *= 60;
      }
      const sat = dl ? dl / (1 - Math.abs(2 * l - 1)) : 0;
      sw.style.background = "rgb(" + v.join(",") + ")";
      hex.textContent = "#" + v.map(n => pad(n.toString(16))).join("").toUpperCase();
      rgb.textContent = "rgb(" + v.join(", ") + ")";
      hsl.textContent = "hsl(" + Math.round(hue) + ", " + Math.round(sat * 100) + "%, " + Math.round(l * 100) + "%)";
    }
    const sliders = ["r", "g", "b"].map((k, i) => {
      const s = h("input", "inst-range inst-range-" + k);
      s.type = "range"; s.min = 0; s.max = 255; s.value = v[i];
      s.addEventListener("input", () => { v[i] = +s.value; paint(); });
      return s;
    });
    paint();
    return card(T(c.lang).color, sw, ...sliders, hex, rgb, hsl);
  };

  R.dice = (d, c) => {
    const L = T(c.lang);
    return card(L.dice + " · " + d.n + "d" + d.sides, h("div", "inst-dice", ...d.rolls.map(x => h("div", "inst-die", x))),
      d.n > 1 && h("div", "inst-sub", L.total + " " + d.total), row(btn(L.rollAgain, () => c.redo(reroll(d)))));
  };
  R.coin = (d, c) => { const L = T(c.lang); return card(L.coin, h("div", "inst-big", L[d.side]), row(btn(L.flipAgain, () => c.redo(reroll(d))))); };
  R.random = (d, c) => {
    const L = T(c.lang);
    return card(L.random, h("div", "inst-big", d.value), h("div", "inst-sub", L.between + " " + d.lo + " – " + d.hi), row(btn(L.genAgain, () => c.redo(reroll(d)))));
  };

  R.convert = (d, c) => {
    const labels = CAT[d.cat].map(u => u.label);
    const a = field(), b = field(), sa = select(labels, d.a), sb = select(labels, d.b);
    a.value = plain(d.amount, 10);
    const fwd = () => { const x = num(a.value); b.value = isFinite(x) ? plain(convert(x, sa.value, sb.value)) : ""; };
    const back = () => { const x = num(b.value); a.value = isFinite(x) ? plain(convert(x, sb.value, sa.value)) : ""; };
    a.addEventListener("input", fwd); b.addEventListener("input", back);
    sa.addEventListener("change", fwd); sb.addEventListener("change", fwd);
    fwd();
    return card(T(c.lang).convert, row(a, sa), row(b, sb));
  };

  R.currency = (d, c) => {
    const L = T(c.lang);
    let rate = 0;
    const a = field(), b = field(), sa = select(CUR, d.from), sb = select(CUR, d.to), note = h("div", "inst-sub", L.loading);
    a.value = plain(d.amount, 10);
    const fwd = () => { const x = num(a.value); b.value = rate && isFinite(x) ? plain(x * rate, 8) : ""; };
    const back = () => { const x = num(b.value); a.value = rate && isFinite(x) ? plain(x / rate, 8) : ""; };
    const load = () => {
      if (sa.value === sb.value) { rate = 1; note.textContent = ""; fwd(); return; }
      note.textContent = L.loading;
      fetch("https://api.frankfurter.dev/v1/latest?base=" + sa.value + "&symbols=" + sb.value)
        .then(r => r.json()).then(j => { rate = j.rates[sb.value]; note.textContent = L.ecb + " · " + j.date; fwd(); })
        .catch(() => { rate = 0; note.textContent = L.fail; });
    };
    a.addEventListener("input", fwd); b.addEventListener("input", back);
    sa.addEventListener("change", load); sb.addEventListener("change", load);
    load();
    return card(L.currency, row(a, sa), row(b, sb), note);
  };

  R.translate = (d, c) => {
    const L = T(c.lang), from = select(["auto", ...TR_LANGS], "auto"), to = select(TR_LANGS, d.to);
    const src = h("textarea", "inst-in inst-ta"), out = h("div", "inst-ta inst-out");
    src.placeholder = L.translateHint; src.value = d.text; src.rows = 5;
    const swap = btn("⇄", () => {
      const f = from.value === "auto" ? (to.value === "en" ? "es" : "en") : from.value;
      from.value = to.value; to.value = f; go();
    }, "inst-ghost inst-swap");
    swap.setAttribute("aria-label", "Swap languages");
    let seq = 0, timer = 0;
    const run = () => {
      const q = src.value.trim(), n = ++seq;
      if (!q) { out.textContent = ""; return; }
      out.textContent = L.loading;
      fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(q) + "&langpair=" + (from.value === "auto" ? "Autodetect" : from.value) + "|" + to.value)
        .then(r => r.json()).then(j => { if (n === seq) out.textContent = j.responseData.translatedText; })
        .catch(() => { if (n === seq) out.textContent = L.translateFail; });
    };
    const go = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
    src.addEventListener("input", go); from.addEventListener("change", go); to.addEventListener("change", go);
    if (d.text) run();
    return card(L.translate, row(from, swap, to), h("div", "inst-two", src, out));
  };

  R.weather = (d, c) => {
    const L = T(c.lang), body = h("div", "inst-sub", L.loading), out = card(L.weather, body);
    const lc = /^[a-z]{2}$/.test(c.lang) ? c.lang : "en";
    let f = /^en-us$/i.test(navigator.language || ""), data = null;
    const code = w => w === 0 ? 0 : w === 1 ? 1 : w === 2 ? 2 : w === 3 ? 3 : w < 50 ? 4 : w < 60 ? 5 : w < 70 ? 6 : w < 80 ? 7 : w < 83 ? 8 : w < 90 ? 9 : 10;
    function draw() {
      const { p, w } = data, k = v => Math.round(f ? v * 9 / 5 + 32 : v) + "°" + (f ? "F" : "C"), cur = w.current, day = w.daily;
      body.replaceWith(body = h("div", "inst-weather",
        h("div", "inst-sub", [p.name, p.admin1, p.country_code].filter(Boolean).join(", ")),
        h("div", "inst-big", k(cur.temperature_2m), " ", h("span", "inst-sub", L.wmo[code(cur.weather_code)])),
        h("div", "inst-sub", L.feels + " " + k(cur.apparent_temperature) + " · " + L.high + " " + k(day.temperature_2m_max[0]) + " · " + L.low + " " + k(day.temperature_2m_min[0])),
        h("div", "inst-sub", L.humidity + " " + cur.relative_humidity_2m + "% · " + L.wind + " " + Math.round(cur.wind_speed_10m) + " km/h"),
        row(btn(f ? "°C" : "°F", () => { f = !f; draw(); }, "inst-ghost"))));
    }
    fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(d.place) + "&count=1&language=" + lc + "&format=json")
      .then(r => r.json()).then(g => {
        const p = g.results && g.results[0];
        if (!p) throw new Error("no place");
        return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + p.latitude + "&longitude=" + p.longitude +
          "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1")
          .then(r => r.json()).then(w => { data = { p, w }; draw(); });
      }).catch(() => c.hide());
    return out;
  };

  R.calendar = (d, c) => {
    const L = T(c.lang);
    let y = d.y, m = d.m;
    const title = h("div", "inst-big inst-grow"), grid = h("div", "inst-cal");
    function draw() {
      title.textContent = dateText(c.lang, y, m, 1, { month: "long", year: "numeric" });
      grid.textContent = "";
      for (let i = 0; i < 7; i++) grid.append(h("div", "inst-cd inst-cw", new Date(2024, 0, 1 + i).toLocaleDateString(c.lang, { weekday: "narrow" })));
      for (let i = (new Date(y, m, 1).getDay() + 6) % 7; i > 0; i--) grid.append(h("div", "inst-cd"));
      for (let k = 1; k <= daysIn(y, m); k++) grid.append(h("div", "inst-cd" + (y === d.today[0] && m === d.today[1] && k === d.today[2] ? " inst-today" : ""), k));
    }
    const step = n => () => { m += n; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } draw(); };
    draw();
    return card(L.calendar, row(btn("‹", step(-1), "inst-ghost"), title, btn("›", step(1), "inst-ghost")), grid);
  };

  R.time = (d, c) => {
    const big = h("div", "inst-big inst-mono"), sub = h("div", "inst-sub");
    const tick = () => { const t = clockAt(new Date(), c.lang, d.zone || undefined, true); big.textContent = t.time; sub.textContent = (d.place ? d.place + " · " : "") + t.date; };
    tick(); every(1000, tick);
    return card(T(c.lang).time, big, sub);
  };

  R.moon = (d, c) => {
    const r = 40, rx = r * Math.abs(Math.cos(2 * Math.PI * d.phase)), wax = d.phase < .5;
    const inner = wax ? (d.phase < .25 ? 0 : 1) : (d.phase < .75 ? 0 : 1);
    const s = svg("svg", { viewBox: "0 0 100 100", width: 96, height: 96, class: "inst-moon" });
    s.append(svg("circle", { cx: 50, cy: 50, r, class: "inst-moon-dark" }),
      svg("path", { d: "M50," + (50 - r) + " A" + r + "," + r + " 0 0 " + (wax ? 1 : 0) + " 50," + (50 + r) + " A" + rx + "," + r + " 0 0 " + inner + " 50," + (50 - r) + " Z", class: "inst-moon-lit" }));
    return card(d.label, row(s, h("div", "inst-grow", h("div", "inst-big", d.big), h("div", "inst-sub", d.sub))));
  };

  R.calculator = (d, c) => {
    const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
    let ex = "";
    const out = h("div", "inst-big inst-mono inst-right", "0"), grid = h("div", "inst-keys");
    for (const k of keys) grid.append(btn(k, () => {
      if (k === "C") ex = "";
      else if (k === "⌫") ex = ex.slice(0, -1);
      else if (k === "=") { const v = calc(ex.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")); ex = isFinite(v) ? plain(v, 12) : ""; out.textContent = ex || T(c.lang).error; return; }
      else ex += k;
      out.textContent = ex || "0";
    }, /[\d.]/.test(k) ? "inst-key" : "inst-key inst-op"));
    return card(T(c.lang).calculator, out, grid);
  };

  function render(box, d, ctx) {
    stop();
    box.textContent = "";
    box.hidden = !d;
    if (!d) return;
    const c = Object.assign({ lang: "en" }, ctx, { redo: nd => render(box, nd, ctx), hide: () => { stop(); box.hidden = true; } });
    c.lang = loc(c.lang);
    box.append((R[d.type] || R.fact)(d, c));
  }
  function show(box, q, ctx) {
    ctx = ctx || {};
    render(box, answer(q, { lang: ctx.lang, priv: ctx.priv }), ctx);
  }

  const api = { answer, render, show, convert, reroll, easter, isoWeek, fmt, parseDur, calc };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.LodicaInstant = api;
})();
