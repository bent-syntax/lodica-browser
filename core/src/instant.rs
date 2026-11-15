//! Pure logic of the instant-answers card, ported from desktop/search/instant.js: calculator, unit and
//! temperature conversion, durations, roman numerals, holidays, ISO weeks and dice. Rendering and
//! translation text stay in the shell.

use chrono::{Datelike, Duration, NaiveDate};
use regex::Regex;
use std::sync::OnceLock;

const EN_MONTHS: [&str; 12] = [
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november",
    "december",
];
const NL_MONTHS: [&str; 12] = [
    "januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november",
    "december",
];

/// Parse a number with either "," or "." as the decimal mark and "," as a thousands separator.
pub fn num(s: &str) -> f64 {
    static GROUPED: OnceLock<Regex> = OnceLock::new();
    let t: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    let g = GROUPED.get_or_init(|| Regex::new(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$").unwrap());
    let t = if g.is_match(&t) { t.replace(',', "") } else { t };
    t.replace(',', ".").parse().unwrap_or(f64::NAN)
}

/// Total seconds in text like "1h 30m" or "2 uur", 0 when there is none.
pub fn parse_dur(s: &str) -> u64 {
    static R: OnceLock<Regex> = OnceLock::new();
    let r = R.get_or_init(|| Regex::new(r"(\d+(?:[.,]\d+)?)\s*([a-z]+)").unwrap());
    const UNITS: [&str; 20] = [
        "hours", "hour", "hrs", "hr", "h", "uur", "minutes", "minute", "minuut", "minuten", "mins", "min", "m",
        "seconds", "second", "seconde", "seconden", "secs", "sec", "s",
    ];
    let mut t = 0.0;
    let mut any = false;
    for c in r.captures_iter(&s.to_lowercase()) {
        let u = &c[2];
        if !UNITS.contains(&u) {
            continue;
        }
        any = true;
        let mult = match u.as_bytes()[0] {
            b'h' | b'u' => 3600.0,
            b'm' => 60.0,
            _ => 1.0,
        };
        t += c[1].replace(',', ".").parse::<f64>().unwrap_or(0.0) * mult;
    }
    if any {
        t.round() as u64
    } else {
        0
    }
}

pub fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

pub fn days_in(y: i32, m0: u32) -> u32 {
    match m0 {
        1 => if is_leap(y) { 29 } else { 28 },
        3 | 5 | 8 | 10 => 30,
        _ => 31,
    }
}

/// ISO week number; the month is zero-based.
pub fn iso_week(y: i32, m0: u32, d: u32) -> u32 {
    NaiveDate::from_ymd_opt(y, m0 + 1, d).map_or(0, |n| n.iso_week().week())
}

/// Western Easter as (zero-based month, day).
pub fn easter(y: i32) -> (u32, u32) {
    let (a, b, c) = (y % 19, y / 100, y % 100);
    let (d, e, f) = (b / 4, b % 4, (b + 8) / 25);
    let g = (b - f + 1) / 3;
    let h = (19 * a + b - d - g + 15) % 30;
    let (i, k) = (c / 4, c % 4);
    let l = (32 + 2 * e + 2 * i - h - k) % 7;
    let m = (a + 11 * h + 22 * l) / 451;
    let s = h + l - 7 * m + 114;
    ((s / 31 - 1) as u32, (s % 31 + 1) as u32)
}

/// A date plus n days, as (zero-based month, day).
pub fn shift(y: i32, md: (u32, u32), n: i64) -> (u32, u32) {
    let base = NaiveDate::from_ymd_opt(y, md.0 + 1, md.1).unwrap_or_default();
    let t = base + Duration::days(n);
    (t.month0(), t.day())
}

/// The nth given weekday (Sunday = 0) of a month.
pub fn nth_dow(y: i32, m0: u32, dow: u32, n: u32) -> (u32, u32) {
    let first = NaiveDate::from_ymd_opt(y, m0 + 1, 1).unwrap_or_default().weekday().num_days_from_sunday();
    (m0, 1 + (dow + 7 - first) % 7 + (n - 1) * 7)
}

/// Month number (zero-based) from an English or Dutch name or a prefix of at least three letters.
pub fn month_idx(w: &str) -> Option<usize> {
    if w.chars().count() < 3 {
        return None;
    }
    let w = w.to_lowercase();
    [&EN_MONTHS, &NL_MONTHS].iter().find_map(|l| l.iter().position(|m| m.starts_with(&w)))
}

/// A holiday matched by name: English name, Dutch name, zero-based month and day.
pub struct Holiday {
    pub en: &'static str,
    pub nl: &'static str,
    pub month: u32,
    pub day: u32,
}

#[derive(Clone, Copy)]
enum When {
    Fixed(u32, u32),
    Easter(i64),
    Dow(u32, u32, u32),
    Father,
    BlackFriday,
}

// shortcut: English and Dutch names only, like the JS table; add rows here for more locales.
const HOL: [(&str, &str, &str, When); 24] = [
    ("Christmas", "Kerstmis", r"^(?:christmas(?: day)?|xmas|kerst(?:mis|dag)?)$", When::Fixed(11, 25)),
    ("Christmas Eve", "Kerstavond", r"^(?:christmas eve|kerstavond)$", When::Fixed(11, 24)),
    ("New Year", "Nieuwjaar", r"^(?:new years?(?: day)?|nieuwjaar(?:sdag)?)$", When::Fixed(0, 1)),
    ("New Year's Eve", "Oudejaarsavond", r"^(?:new years? eve|nye|oudejaarsavond|oudjaar)$", When::Fixed(11, 31)),
    ("Easter", "Pasen", r"^(?:easter(?: sunday)?|pasen|paaszondag)$", When::Easter(0)),
    ("Good Friday", "Goede Vrijdag", r"^(?:good friday|goede vrijdag)$", When::Easter(-2)),
    ("Easter Monday", "Paasmaandag", r"^(?:easter monday|paasmaandag)$", When::Easter(1)),
    ("Ascension Day", "Hemelvaart", r"^(?:ascension(?: day)?|hemelvaart(?:sdag)?)$", When::Easter(39)),
    ("Pentecost", "Pinksteren", r"^(?:pentecost|whit sunday|pinksteren)$", When::Easter(49)),
    ("Carnival", "Carnaval", r"^(?:carnival|carnaval|mardi gras|shrove tuesday|pancake day)$", When::Easter(-47)),
    ("Halloween", "Halloween", r"^halloween$", When::Fixed(9, 31)),
    ("Valentine's Day", "Valentijnsdag", r"^(?:valentines(?: day)?|valentijn(?:sdag)?)$", When::Fixed(1, 14)),
    ("St Patrick's Day", "St Patrick's Day", r"^(?:st|saint) patricks day$", When::Fixed(2, 17)),
    ("April Fools' Day", "1 april", r"^(?:april fools(?: day)?|1 april)$", When::Fixed(3, 1)),
    ("Labour Day", "Dag van de Arbeid", r"^(?:labou?r day|may day|dag van de arbeid)$", When::Fixed(4, 1)),
    ("Independence Day", "Independence Day", r"^(?:independence day|4th of july|fourth of july|july 4th)$", When::Fixed(6, 4)),
    ("Bastille Day", "Quatorze Juillet", r"^(?:bastille day|quatorze juillet)$", When::Fixed(6, 14)),
    ("Belgian National Day", "Nationale feestdag", r"^(?:belgian national day|nationale feestdag)$", When::Fixed(6, 21)),
    ("King's Day", "Koningsdag", r"^(?:kings day|koningsdag)$", When::Fixed(3, 27)),
    ("Sinterklaas", "Sinterklaas", r"^sinterklaas$", When::Fixed(11, 5)),
    ("Thanksgiving", "Thanksgiving", r"^thanksgiving$", When::Dow(10, 4, 4)),
    ("Black Friday", "Black Friday", r"^black friday$", When::BlackFriday),
    ("Mother's Day", "Moederdag", r"^(?:mothers day|moederdag)$", When::Dow(4, 0, 2)),
    ("Father's Day", "Vaderdag", r"^(?:fathers day|vaderdag)$", When::Father),
];

/// Find a holiday by name for a year. The name is lowercased and trimmed here.
pub fn holiday(name: &str, lang: &str, year: i32) -> Option<Holiday> {
    static RES: OnceLock<Vec<Regex>> = OnceLock::new();
    let res = RES.get_or_init(|| HOL.iter().map(|h| Regex::new(h.2).unwrap()).collect());
    let q = name.trim().to_lowercase();
    let i = res.iter().position(|r| r.is_match(&q))?;
    let (en, nl, _, when) = HOL[i];
    let (month, day) = match when {
        When::Fixed(m, d) => (m, d),
        When::Easter(n) => shift(year, easter(year), n),
        When::Dow(m, dow, n) => nth_dow(year, m, dow, n),
        When::Father => nth_dow(year, 5, 0, if lang == "nl" { 2 } else { 3 }),
        When::BlackFriday => {
            let t = nth_dow(year, 10, 4, 4);
            shift(year, t, 1)
        }
    };
    Some(Holiday { en, nl, month, day })
}

struct Unit {
    cat: &'static str,
    label: &'static str,
    factor: f64,
    aliases: &'static str,
}

const fn u(cat: &'static str, label: &'static str, factor: f64, aliases: &'static str) -> Unit {
    Unit { cat, label, factor, aliases }
}

// shortcut: the same units as the JS card; temperature is special-cased in to_base/from_base.
const UNITS: &[Unit] = &[
    u("len", "km", 1000.0, "kilometer|kilometers|kilometre|kilometres"),
    u("len", "m", 1.0, "meter|meters|metre|metres"),
    u("len", "cm", 0.01, "centimeter|centimeters|centimetre|centimetres"),
    u("len", "mm", 0.001, "millimeter|millimeters|millimetre|millimetres"),
    u("len", "mi", 1609.344, "mile|miles|mijl|mijlen"),
    u("len", "yd", 0.9144, "yard|yards"),
    u("len", "ft", 0.3048, "foot|feet|voet"),
    u("len", "in", 0.0254, "inch|inches|duim"),
    u("len", "nmi", 1852.0, "nautical mile|nautical miles"),
    u("mass", "kg", 1000.0, "kilogram|kilograms|kilo|kilos"),
    u("mass", "g", 1.0, "gram|grams"),
    u("mass", "mg", 0.001, "milligram|milligrams"),
    u("mass", "lb", 453.59237, "lbs|pound|pounds"),
    u("mass", "oz", 28.349523125, "ounce|ounces"),
    u("mass", "t", 1e6, "tonne|tonnes|metric ton|metric tons"),
    u("vol", "l", 1.0, "liter|liters|litre|litres"),
    u("vol", "ml", 0.001, "milliliter|milliliters|millilitre|millilitres"),
    u("vol", "cl", 0.01, "centiliter|centiliters|centilitre|centilitres"),
    u("vol", "gal", 3.785411784, "gallon|gallons"),
    u("vol", "qt", 0.946352946, "quart|quarts"),
    u("vol", "pt", 0.473176473, "pint|pints"),
    u("vol", "cup", 0.2365882365, "cups"),
    u("vol", "fl oz", 0.0295735295625, "floz|fluid ounce|fluid ounces"),
    u("vol", "tbsp", 0.01478676478125, "tablespoon|tablespoons"),
    u("vol", "tsp", 0.00492892159375, "teaspoon|teaspoons"),
    u("area", "m²", 1.0, "m2|sqm|square meter|square meters|square metre|square metres"),
    u("area", "km²", 1e6, "km2|square kilometer|square kilometers|square kilometre|square kilometres"),
    u("area", "ha", 1e4, "hectare|hectares"),
    u("area", "ac", 4046.8564224, "acre|acres"),
    u("area", "ft²", 0.09290304, "ft2|sqft|sq ft|square foot|square feet"),
    u("area", "mi²", 2589988.110336, "mi2|square mile|square miles"),
    u("speed", "km/h", 1.0 / 3.6, "kmh|kph|kilometers per hour|kilometres per hour"),
    u("speed", "m/s", 1.0, "mps|meters per second|metres per second"),
    u("speed", "mph", 0.44704, "miles per hour"),
    u("speed", "kn", 0.514444444, "knot|knots"),
    u("data", "bit", 0.125, "bits"),
    u("data", "B", 1.0, "byte|bytes"),
    u("data", "KB", 1e3, "kilobyte|kilobytes"),
    u("data", "MB", 1e6, "megabyte|megabytes"),
    u("data", "GB", 1e9, "gigabyte|gigabytes"),
    u("data", "TB", 1e12, "terabyte|terabytes"),
    u("data", "KiB", 1024.0, "kibibyte|kibibytes"),
    u("data", "MiB", 1048576.0, "mebibyte|mebibytes"),
    u("data", "GiB", 1073741824.0, "gibibyte|gibibytes"),
    u("data", "TiB", 1099511627776.0, "tebibyte|tebibytes"),
    u("time", "ms", 0.001, "millisecond|milliseconds"),
    u("time", "s", 1.0, "sec|secs|second|seconds"),
    u("time", "min", 60.0, "mins|minute|minutes"),
    u("time", "h", 3600.0, "hr|hrs|hour|hours"),
    u("time", "day", 86400.0, "days"),
    u("time", "week", 604800.0, "weeks"),
    u("time", "year", 31557600.0, "years|yr|yrs"),
    u("temp", "°C", 1.0, "c|celsius|degrees celsius|degree celsius|centigrade"),
    u("temp", "°F", 1.0, "f|fahrenheit|degrees fahrenheit|degree fahrenheit"),
    u("temp", "K", 1.0, "kelvin"),
];

/// The unit label for a name or alias, like "miles" gives "mi".
pub fn unit_of(s: &str) -> Option<&'static str> {
    let t = s.to_lowercase();
    let t = t.strip_suffix('.').unwrap_or(&t);
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    UNITS
        .iter()
        .find(|x| x.label.to_lowercase() == t || x.aliases.split('|').any(|a| a == t))
        .or_else(|| UNITS.iter().find(|x| x.label == s))
        .map(|x| x.label)
}

fn to_base(label: &str, factor: f64, v: f64) -> f64 {
    match label {
        "°F" => (v - 32.0) * 5.0 / 9.0,
        "K" => v - 273.15,
        _ => v * factor,
    }
}

fn from_base(label: &str, factor: f64, v: f64) -> f64 {
    match label {
        "°F" => v * 9.0 / 5.0 + 32.0,
        "K" => v + 273.15,
        _ => v / factor,
    }
}

/// Convert a value between two unit labels, NaN when unknown or of different kinds.
pub fn convert(v: f64, from: &str, to: &str) -> f64 {
    let find = |l: &str| UNITS.iter().find(|x| x.label == l);
    match (find(from), find(to)) {
        (Some(a), Some(b)) if a.cat == b.cat => from_base(b.label, b.factor, to_base(a.label, a.factor, v)),
        _ => f64::NAN,
    }
}

/// Currency code from a code or a name like "dollars", empty when unknown.
pub fn cur_of(s: &str) -> &'static str {
    const CUR: [&str; 31] = [
        "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR",
        "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD",
        "ZAR",
    ];
    const NAMES: [(&str, &str); 18] = [
        ("dollar|dollars|us dollar|us dollars", "USD"),
        ("euro|euros", "EUR"),
        ("pound|pounds|british pound|british pounds|sterling", "GBP"),
        ("yen", "JPY"),
        ("franc|francs|swiss franc|swiss francs", "CHF"),
        ("yuan|renminbi", "CNY"),
        ("rupee|rupees", "INR"),
        ("canadian dollar|canadian dollars", "CAD"),
        ("australian dollar|australian dollars", "AUD"),
        ("zloty", "PLN"),
        ("won", "KRW"),
        ("baht", "THB"),
        ("lira", "TRY"),
        ("rand", "ZAR"),
        ("krona|kronor", "SEK"),
        ("norwegian krone", "NOK"),
        ("danish krone", "DKK"),
        ("peso", "MXN"),
    ];
    let t = s.trim().to_lowercase();
    let up = t.to_uppercase();
    if let Some(c) = CUR.iter().find(|c| **c == up) {
        return c;
    }
    NAMES.iter().find(|(names, _)| names.split('|').any(|n| n == t)).map_or("", |n| n.1)
}

/// n! as a float, NaN unless n is a whole number from 0 to 170.
pub fn fact(n: f64) -> f64 {
    if n.fract() != 0.0 || !(0.0..=170.0).contains(&n) {
        return f64::NAN;
    }
    (1..=n as u64).fold(1.0, |a, i| a * i as f64)
}

const ROMAN: [(u32, &str); 13] = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"),
    (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
];

pub fn to_roman(mut n: u32) -> String {
    let mut out = String::new();
    for (v, s) in ROMAN {
        while n >= v {
            out.push_str(s);
            n -= v;
        }
    }
    out
}

/// Value of a canonical roman numeral, 0 when the text is not one.
pub fn from_roman(s: &str) -> u32 {
    let s = s.to_uppercase();
    let val = |c: char| match c {
        'I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100, 'D' => 500, 'M' => 1000, _ => 0,
    };
    let cs: Vec<i32> = s.chars().map(val).collect();
    if cs.is_empty() || cs.contains(&0) {
        return 0;
    }
    let mut n = 0i32;
    for (i, v) in cs.iter().enumerate() {
        n += if cs.get(i + 1).is_some_and(|x| x > v) { -v } else { *v };
    }
    if n > 0 && to_roman(n as u32) == s {
        n as u32
    } else {
        0
    }
}

/// A value in lo..=hi from a raw random number.
pub fn rint(lo: i64, hi: i64, r: u32) -> i64 {
    if hi < lo {
        return lo;
    }
    lo + (r as i64) % (hi - lo + 1)
}

enum Tok {
    Num(f64),
    Word(String),
    Sym(char),
}

fn tokens(src: &str) -> Option<Vec<Tok>> {
    let cs: Vec<char> = src.to_lowercase().chars().collect();
    let (mut i, mut out) = (0, Vec::new());
    while i < cs.len() {
        let c = cs[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || (c == '.' && cs.get(i + 1).is_some_and(|d| d.is_ascii_digit())) {
            let st = i;
            while i < cs.len() && cs[i].is_ascii_digit() {
                i += 1;
            }
            if i < cs.len() && cs[i] == '.' {
                i += 1;
                while i < cs.len() && cs[i].is_ascii_digit() {
                    i += 1;
                }
            }
            out.push(Tok::Num(cs[st..i].iter().collect::<String>().parse().ok()?));
        } else if c.is_ascii_lowercase() {
            let st = i;
            while i < cs.len() && cs[i].is_ascii_lowercase() {
                i += 1;
            }
            out.push(Tok::Word(cs[st..i].iter().collect()));
        } else if "-+*/^%()!".contains(c) {
            out.push(Tok::Sym(c));
            i += 1;
        } else {
            return None;
        }
        if out.len() > 200 {
            return None;
        }
    }
    Some(out)
}

struct Parser {
    t: Vec<Tok>,
    p: usize,
}

impl Parser {
    fn sym(&self) -> Option<char> {
        match self.t.get(self.p) {
            Some(Tok::Sym(c)) => Some(*c),
            _ => None,
        }
    }
    fn word(&self) -> Option<&str> {
        match self.t.get(self.p) {
            Some(Tok::Word(w)) => Some(w),
            _ => None,
        }
    }
    fn expr(&mut self) -> Option<f64> {
        let mut v = self.term()?;
        while let Some(c @ ('+' | '-')) = self.sym() {
            self.p += 1;
            let r = self.term()?;
            v = if c == '+' { v + r } else { v - r };
        }
        Some(v)
    }
    fn term(&mut self) -> Option<f64> {
        let mut v = self.unary()?;
        loop {
            match (self.sym(), self.word()) {
                (Some('*'), _) => {
                    self.p += 1;
                    v *= self.unary()?;
                }
                (Some('/'), _) => {
                    self.p += 1;
                    v /= self.unary()?;
                }
                (_, Some("mod")) => {
                    self.p += 1;
                    v %= self.unary()?;
                }
                _ => return Some(v),
            }
        }
    }
    fn unary(&mut self) -> Option<f64> {
        match self.sym() {
            Some('-') => {
                self.p += 1;
                Some(-self.unary()?)
            }
            Some('+') => {
                self.p += 1;
                self.unary()
            }
            _ => {
                let b = self.post()?;
                if self.sym() == Some('^') {
                    self.p += 1;
                    return Some(b.powf(self.unary()?));
                }
                Some(b)
            }
        }
    }
    fn post(&mut self) -> Option<f64> {
        let mut v = self.primary()?;
        loop {
            match self.sym() {
                Some('!') => v = fact(v),
                Some('%') => v /= 100.0,
                _ => return Some(v),
            }
            self.p += 1;
        }
    }
    fn primary(&mut self) -> Option<f64> {
        match self.t.get(self.p)? {
            Tok::Num(n) => {
                let n = *n;
                self.p += 1;
                Some(n)
            }
            Tok::Sym('(') => {
                self.p += 1;
                let v = self.expr()?;
                if self.sym() != Some(')') {
                    return None;
                }
                self.p += 1;
                Some(v)
            }
            Tok::Word(w) => {
                let w = w.clone();
                self.p += 1;
                match w.as_str() {
                    "pi" => return Some(std::f64::consts::PI),
                    "e" => return Some(std::f64::consts::E),
                    _ => {}
                }
                if self.sym() != Some('(') {
                    return None;
                }
                self.p += 1;
                let x = self.expr()?;
                if self.sym() != Some(')') {
                    return None;
                }
                self.p += 1;
                Some(match w.as_str() {
                    "sqrt" => x.sqrt(),
                    "cbrt" => x.cbrt(),
                    "abs" => x.abs(),
                    "sin" => x.sin(),
                    "cos" => x.cos(),
                    "tan" => x.tan(),
                    "asin" => x.asin(),
                    "acos" => x.acos(),
                    "atan" => x.atan(),
                    "ln" | "log" => x.ln(),
                    "log2" => x.log2(),
                    "exp" => x.exp(),
                    "round" => (x + 0.5).floor(),
                    "floor" => x.floor(),
                    "ceil" => x.ceil(),
                    _ => return None,
                })
            }
            _ => None,
        }
    }
}

/// Evaluate a calculator expression without eval, NaN when it does not parse.
pub fn calc(src: &str) -> f64 {
    let Some(t) = tokens(src) else { return f64::NAN };
    let mut p = Parser { t, p: 0 };
    match p.expr() {
        Some(v) if p.p == p.t.len() => v,
        _ => f64::NAN,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calc_works() {
        assert_eq!(calc("2+3*4"), 14.0);
        assert_eq!(calc("2^3^2"), 512.0);
        assert_eq!(calc("-2^2"), -4.0);
        assert_eq!(calc("(1+2)*3"), 9.0);
        assert_eq!(calc("50%"), 0.5);
        assert_eq!(calc("5!"), 120.0);
        assert_eq!(calc("10 mod 3"), 1.0);
        assert_eq!(calc("sqrt(16)+round(2.5)"), 7.0);
        assert!((calc("pi") - 3.14159).abs() < 1e-4);
        assert!(calc("2+").is_nan());
        assert!(calc("foo(2)").is_nan());
        assert!(calc("(1+2").is_nan());
        assert!(calc("1 $ 2").is_nan());
        assert!(calc("171!").is_nan());
    }

    #[test]
    fn numbers_and_durations() {
        assert_eq!(num("1,234.5"), 1234.5);
        assert_eq!(num("3,5"), 3.5);
        assert!(num("abc").is_nan());
        assert_eq!(parse_dur("1h 30m"), 5400);
        assert_eq!(parse_dur("2 uur"), 7200);
        assert_eq!(parse_dur("1,5 minuten"), 90);
        assert_eq!(parse_dur("5 ms"), 0);
        assert_eq!(parse_dur("nothing"), 0);
    }

    #[test]
    fn dates() {
        assert_eq!(easter(2025), (3, 20));
        assert_eq!(easter(2024), (2, 31));
        assert_eq!(shift(2025, easter(2025), -2), (3, 18));
        assert_eq!(nth_dow(2025, 10, 4, 4), (10, 27));
        assert_eq!(iso_week(2025, 0, 1), 1);
        assert_eq!(iso_week(2021, 0, 1), 53);
        assert!(is_leap(2000) && !is_leap(1900));
        assert_eq!(days_in(2024, 1), 29);
        assert_eq!(month_idx("sept"), Some(8));
        assert_eq!(month_idx("mei"), Some(4));
        assert_eq!(month_idx("ma"), None);
        let h = holiday("Black Friday", "en", 2025).unwrap();
        assert_eq!((h.month, h.day), (10, 28));
        assert_eq!(holiday("fathers day", "nl", 2025).map(|h| (h.month, h.day)), Some((5, 8)));
        assert_eq!(holiday("kerst", "nl", 2025).map(|h| h.nl), Some("Kerstmis"));
        assert!(holiday("", "en", 2025).is_none());
        assert!(holiday("nope", "en", 2025).is_none());
    }

    #[test]
    fn units_and_currency() {
        assert_eq!(unit_of("Miles."), Some("mi"));
        assert_eq!(unit_of("nautical  miles"), Some("nmi"));
        assert_eq!(unit_of("B"), Some("B"));
        assert_eq!(unit_of("zzz"), None);
        assert!((convert(1.0, "km", "mi") - 0.621371).abs() < 1e-5);
        assert!((convert(100.0, "°C", "°F") - 212.0).abs() < 1e-9);
        assert!((convert(0.0, "°C", "K") - 273.15).abs() < 1e-9);
        assert!(convert(1.0, "km", "kg").is_nan());
        assert_eq!(cur_of("usd"), "USD");
        assert_eq!(cur_of("Dollars"), "USD");
        assert_eq!(cur_of("sterling"), "GBP");
        assert_eq!(cur_of("xyz"), "");
    }

    #[test]
    fn roman_and_random() {
        assert_eq!(to_roman(1994), "MCMXCIV");
        assert_eq!(from_roman("mcmxciv"), 1994);
        assert_eq!(from_roman("IIII"), 0);
        assert_eq!(from_roman("abc"), 0);
        assert_eq!(rint(1, 6, 13), 2);
        assert_eq!(rint(5, 5, 99), 5);
    }
}
