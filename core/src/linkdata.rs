//! Pure merges for linked devices, ported from desktop/main/linkdata.js.
//! Lists are JSON values so fields this code does not know survive a merge. Ids come from the caller.
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

pub struct Merged {
    pub list: Vec<Value>,
    pub changed: usize,
}

/// JS `String(v == null ? "" : v).slice(0, n)`; slices UTF-16 units like JS, never splitting a char.
// shortcut: objects and arrays print as JSON, JS prints [object Object]; neither is valid input here.
fn str(v: Option<&Value>, n: usize) -> String {
    let s = match v {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(o) => o.to_string(),
    };
    let mut used = 0;
    s.chars()
        .take_while(|c| {
            used += c.len_utf16();
            used <= n
        })
        .collect()
}

fn text(v: Option<&Value>) -> &str {
    v.and_then(Value::as_str).unwrap_or("")
}

/// JS `Number(v) || 0` for the shapes the JSON carries.
fn num(v: Option<&Value>) -> f64 {
    let n = match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.trim().parse().unwrap_or(0.0),
        Some(Value::Bool(true)) => 1.0,
        _ => 0.0,
    };
    if n.is_finite() { n } else { 0.0 }
}

fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null | Value::Bool(false) => false,
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        _ => true,
    }
}

/// Passwords: one per site and user name, the newer one wins.
pub fn merge_passwords(local: &Value, remote: &Value) -> Merged {
    let mut list: Vec<Value> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    let key = |e: &Value| format!("{}\n{}", str(e.get("origin"), usize::MAX), str(e.get("user"), usize::MAX));
    for e in arr(local).iter().filter(|e| truthy(e)) {
        match at.get(&key(e)) {
            Some(&i) => list[i] = e.clone(), // a repeated key keeps its first slot, like a JS Map
            None => {
                at.insert(key(e), list.len());
                list.push(e.clone());
            }
        }
    }
    let mut changed = 0;
    for r in arr(remote) {
        if !r.get("origin").is_some_and(Value::is_string) || text(r.get("pass")).is_empty() {
            continue;
        }
        let saved = num(r.get("saved"));
        let e = json!({"origin": str(r.get("origin"), 500), "user": str(r.get("user"), 300), "pass": str(r.get("pass"), 500), "saved": saved});
        let k = key(&e);
        match at.get(&k) {
            None => {
                at.insert(k, list.len());
                list.push(e);
                changed += 1;
            }
            Some(&i) => {
                let cur_saved = num(list[i].get("saved"));
                if saved > cur_saved && list[i].get("pass") != e.get("pass") {
                    list[i] = e;
                    changed += 1;
                }
            }
        }
    }
    Merged { list, changed }
}

/// Authenticator accounts: one per secret; an account the other device has is added, never replaced.
/// `new_id` makes the id for each added account.
pub fn merge_totp(local: &Value, remote: &Value, mut new_id: impl FnMut() -> String) -> Merged {
    let mut have: HashSet<String> = arr(local).iter().map(|a| text(a.get("secret")).to_string()).collect();
    let mut list = arr(local).to_vec();
    let mut changed = 0;
    for r in arr(remote) {
        let secret = text(r.get("secret"));
        if secret.is_empty() || !have.insert(secret.to_string()) {
            continue;
        }
        let digits = num(r.get("digits"));
        let period = num(r.get("period"));
        let algo = str(r.get("algo"), 10);
        list.push(json!({
            "id": new_id(), "label": str(r.get("label"), 80), "issuer": str(r.get("issuer"), 80), "name": str(r.get("name"), 80),
            "secret": str(r.get("secret"), 200), "digits": if digits != 0.0 { digits } else { 6.0 }, "period": if period != 0.0 { period } else { 30.0 },
            "algo": if algo.is_empty() { "SHA1".to_string() } else { algo }, "host": str(r.get("host"), 200),
        }));
        changed += 1;
    }
    Merged { list, changed }
}

/// Plain lists of text: the union, at most `max` entries.
pub fn union(local: &Value, remote: &Value, max: usize) -> Merged {
    let mut list: Vec<Value> = arr(local).iter().map(|v| Value::String(str(Some(v), usize::MAX))).collect();
    let mut seen: HashSet<String> = list.iter().map(|v| text(Some(v)).to_string()).collect();
    let mut changed = 0;
    for v in arr(remote) {
        let s = str(Some(v), 300);
        if !s.is_empty() && list.len() < max && seen.insert(s.clone()) {
            list.push(Value::String(s));
            changed += 1;
        }
    }
    Merged { list, changed }
}

/// Start page shortcuts: the union by address, at most 24 tiles.
pub fn merge_shortcuts(local: &Value, remote: &Value) -> Merged {
    let mut list = arr(local).to_vec();
    let mut seen: HashSet<String> = list.iter().map(|t| text(t.get("url")).to_string()).collect();
    let mut changed = 0;
    for t in arr(remote) {
        let url = text(t.get("url"));
        let lo = url.to_lowercase();
        if !(lo.starts_with("http://") || lo.starts_with("https://")) || list.len() >= 24 || !seen.insert(url.to_string()) {
            continue;
        }
        list.push(json!({"url": str(t.get("url"), 500), "title": str(t.get("title"), 40)}));
        changed += 1;
    }
    Merged { list, changed }
}

/// Merge result as the JSON the UI gets.
pub fn to_json(m: Merged) -> Value {
    let mut o = Map::new();
    o.insert("list".into(), Value::Array(m.list));
    o.insert("changed".into(), json!(m.changed));
    Value::Object(o)
}

/// JS number to JSON: whole numbers stay integers so they round-trip like JS prints them.
fn n(f: f64) -> Value {
    if f.fract() == 0.0 && f.abs() < 9e15 { json!(f as i64) } else { json!(f) }
}

/// A costume character cleaned to its known fields, or None when it has no glyph and no art.
pub fn clean_character(c: &Value) -> Option<Value> {
    let o = c.as_object().filter(|_| truthy(c))?;
    let art = |k: &str| crate::faceart::clean_art(text(o.get(k)));
    let out = json!({
        "glyph": str(o.get("glyph"), 40),
        "desc": str(o.get("desc"), 200),
        "custom": o.get("custom").is_some_and(truthy),
        "art": art("art"),
        "hands": art("hands"),
        "bubble": art("bubble"),
        "at": n(num(o.get("at")).max(0.0)),
    });
    (!text(out.get("glyph")).is_empty() || !text(out.get("art")).is_empty()).then_some(out)
}

// shortcut: Rust compares strings by code point, JS by UTF-16 unit; they differ only for astral vs high-BMP text, upgrade if two devices ever disagree on a tie.
fn better_character(a: &Value, b: &Value) -> bool {
    let (ac, bc) = (a["custom"] == true, b["custom"] == true);
    if ac != bc {
        return ac;
    }
    let (aa, ba) = (num(a.get("at")), num(b.get("at")));
    if aa != ba {
        return aa > ba;
    }
    for k in ["art", "glyph", "desc", "hands", "bubble"] {
        let (x, y) = (text(a.get(k)), text(b.get(k)));
        if x != y {
            return x > y;
        }
    }
    false
}

/// The costume to keep after a link sync: `{value, changed}`; value is null when neither side has one.
pub fn merge_character(local: &Value, remote: &Value) -> Value {
    let (r, l) = (clean_character(remote), clean_character(local));
    let (value, changed) = match (r, l) {
        (None, l) => (l, false),
        (Some(r), None) => (Some(r), true),
        (Some(r), Some(l)) if better_character(&r, &l) => {
            let changed = r != l;
            (Some(r), changed)
        }
        (Some(_), l) => (l, false),
    };
    json!({"value": value.unwrap_or(Value::Null), "changed": changed})
}

const NOTES_MAX: usize = 500;
const NOTE_TEXT: usize = 200_000;
const TOMB_TTL: f64 = 30.0 * 24.0 * 3600e3;

fn note_id_ok(s: &str) -> bool {
    (1..=40).contains(&s.chars().count()) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn by_newest(list: &mut [Value]) {
    list.sort_by(|a, b| num(b.get("at")).partial_cmp(&num(a.get("at"))).unwrap_or(std::cmp::Ordering::Equal));
}

/// Notes: newest edit per id wins, deletes stay as tombstones for 30 days, at most 500 kept.
pub fn merge_notes(local: &Value, remote: &Value, now: f64) -> Merged {
    let mut list: Vec<Value> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for e in arr(local) {
        if let Some(id) = e.get("id").and_then(Value::as_str) {
            match at.get(id) {
                Some(&i) => list[i] = e.clone(),
                None => {
                    at.insert(id.to_string(), list.len());
                    list.push(e.clone());
                }
            }
        }
    }
    let mut changed = 0;
    for r in arr(remote) {
        let id = match r.get("id").and_then(Value::as_str) {
            Some(id) if note_id_ok(id) => id,
            _ => continue,
        };
        let deleted = r.get("deleted").is_some_and(truthy);
        let body = if deleted { String::new() } else { str(r.get("text"), NOTE_TEXT) };
        let eat = num(r.get("at")).max(0.0);
        let cur = at.get(id).map(|&i| &list[i]);
        let wins = match cur {
            None => true,
            Some(c) => {
                let cat = num(c.get("at"));
                let cdel = c.get("deleted").is_some_and(truthy);
                eat > cat || (eat == cat && ((deleted && !cdel) || (!deleted && !cdel && body.as_str() > text(c.get("text")))))
            }
        };
        if !wins {
            continue;
        }
        if let Some(c) = cur {
            if c.get("deleted").is_some_and(truthy) == deleted && text(c.get("text")) == body && num(c.get("at")) == eat {
                continue;
            }
        }
        let rev = cur.map_or(0.0, |c| num(c.get("rev"))) + 1.0;
        let mut e = json!({"id": id, "text": body, "at": n(eat), "rev": n(rev)});
        if deleted {
            e["deleted"] = json!(true);
        }
        match at.get(id) {
            Some(&i) => list[i] = e,
            None => {
                at.insert(id.to_string(), list.len());
                list.push(e);
            }
        }
        changed += 1;
    }
    list.retain(|e| !e.get("deleted").is_some_and(truthy) || now - num(e.get("at")) < TOMB_TTL);
    by_newest(&mut list);
    list.truncate(NOTES_MAX);
    Merged { list, changed }
}

/// Notes to send to a linked device, newest first, within `budget` JSON characters.
pub fn notes_for_sync(list: &Value, budget: usize) -> Vec<Value> {
    let mut sorted = arr(list).to_vec();
    by_newest(&mut sorted);
    let (mut used, mut out) = (0, Vec::new());
    for e in sorted {
        let id = e.get("id").cloned().unwrap_or(Value::Null);
        let at = n(num(e.get("at")));
        let item = if e.get("deleted").is_some_and(truthy) {
            json!({"id": id, "deleted": true, "at": at})
        } else {
            json!({"id": id, "text": text(e.get("text")), "at": at})
        };
        let size = item.to_string().encode_utf16().count();
        if used + size > budget {
            continue;
        }
        used += size;
        out.push(item);
    }
    out
}

const SETTINGS: [&str; 29] = [
    "theme", "customTheme", "savedThemes", "language", "darkPages", "httpsOnly", "search", "searchFallback", "adBlockLevel",
    "cookieReject", "spell", "spellAuto", "spellLangs", "selTranslate", "translateAi", "chatScale", "chatEmojiScale", "uiBlur",
    "uiAlpha", "vertTabs", "barBottom", "bg", "searchWords", "shortcutNames", "autoTop", "startNotes", "startPlanner",
    "plannerPos", "notesPos",
];
const THEME_COLORS: [&str; 14] =
    ["bg", "text", "accent", "accent2", "raised", "high", "muted", "danger", "tab", "tabText", "tabEdge", "startBg", "barBg", "tileBg"];
const TEX_KEYS: [&str; 4] = ["tabTex", "startTex", "barTex", "tileTex"];
const TEXTURES: [&str; 6] = ["stripes", "dots", "grid", "checker", "planks", "gradient"];

/// JS `typeof`, where null and arrays count as "object".
fn js_type(v: Option<&Value>) -> &'static str {
    match v {
        None => "undefined",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(_) => "object",
    }
}

fn is_hex(v: Option<&Value>) -> bool {
    v.and_then(Value::as_str).is_some_and(|s| s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit()))
}

fn blank(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}

/// Settings a linked device may change: only known keys of the same type, lists and positions re-checked.
pub fn pick_settings(source: &Value, current: &Value) -> Value {
    let mut out = Map::new();
    for k in SETTINGS {
        let Some(v) = source.get(k) else { continue };
        if js_type(Some(v)) != js_type(current.get(k)) || (k == "customTheme" && !v.is_null() && !v.is_object()) {
            continue;
        }
        out.insert(k.to_string(), v.clone());
    }
    if let Some(v) = out.get("searchWords").cloned() {
        match v.as_array() {
            None => {
                out.remove("searchWords");
            }
            Some(a) => {
                let words: Vec<Value> = a
                    .iter()
                    .filter(|w| blank(w.get("word")).is_some() && blank(w.get("url")).is_some())
                    .take(200)
                    .map(|w| json!({"word": str(w.get("word"), 40).trim(), "url": str(w.get("url"), 2000).trim()}))
                    .collect();
                out.insert("searchWords".into(), Value::Array(words));
            }
        }
    }
    if let Some(v) = out.get("savedThemes").cloned() {
        match v.as_array() {
            None => {
                out.remove("savedThemes");
            }
            Some(a) => {
                let themes: Vec<Value> = a
                    .iter()
                    .filter(|t| blank(t.get("name")).is_some() && ["bg", "text", "accent", "accent2"].iter().all(|k| is_hex(t.get(*k))))
                    .take(50)
                    .map(|t| {
                        let mut o = Map::new();
                        o.insert("name".into(), json!(str(t.get("name"), 40).trim()));
                        for k in THEME_COLORS.into_iter().filter(|k| is_hex(t.get(*k))) {
                            o.insert(k.into(), t[k].clone());
                        }
                        for k in TEX_KEYS {
                            if t.get(k).and_then(Value::as_str).is_some_and(|s| TEXTURES.contains(&s)) {
                                o.insert(k.into(), t[k].clone());
                            }
                        }
                        Value::Object(o)
                    })
                    .collect();
                out.insert("savedThemes".into(), Value::Array(themes));
            }
        }
    }
    for k in ["plannerPos", "notesPos"] {
        if out.get(k).is_some_and(|v| !matches!(v.as_str(), Some("left" | "right" | "below"))) {
            out.remove(k);
        }
    }
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passwords_newer_wins_and_keeps_slot() {
        let local = json!([{"origin": "a", "user": "u", "pass": "old", "saved": 1}, {"origin": "b", "user": "u", "pass": "x", "saved": 1}]);
        let remote = json!([
            {"origin": "a", "user": "u", "pass": "new", "saved": 5},
            {"origin": "b", "user": "u", "pass": "y", "saved": 0},
            {"origin": "c", "user": "u", "pass": "z"},
            {"origin": "d", "pass": ""},
            {"origin": 7, "pass": "p"},
        ]);
        let m = merge_passwords(&local, &remote);
        assert_eq!(m.changed, 2);
        assert_eq!(m.list[0]["pass"], "new");
        assert_eq!(m.list[1]["pass"], "x");
        assert_eq!(m.list[2]["origin"], "c");
        assert_eq!(m.list.len(), 3);
    }

    #[test]
    fn slices_by_utf16_units() {
        assert_eq!(str(Some(&json!("ab😀cd")), 3), "ab"); // the emoji is two units, so it does not fit
        assert_eq!(str(Some(&json!("ab😀cd")), 4), "ab😀");
        assert_eq!(str(None, 5), "");
    }

    #[test]
    fn totp_adds_by_secret_with_defaults() {
        let local = json!([{"id": "1", "secret": "AAA"}]);
        let remote = json!([{"secret": "AAA"}, {"secret": "BBB", "label": "L"}, {"secret": "BBB"}, {"label": "no secret"}]);
        let mut n = 1;
        let m = merge_totp(&local, &remote, || {
            n += 1;
            n.to_string()
        });
        assert_eq!(m.changed, 1);
        assert_eq!(m.list[1]["id"], "2");
        assert_eq!((m.list[1]["digits"].as_f64(), m.list[1]["period"].as_f64(), m.list[1]["algo"].as_str()), (Some(6.0), Some(30.0), Some("SHA1")));
    }

    #[test]
    fn union_dedupes_and_caps() {
        let m = union(&json!(["a"]), &json!(["a", "b", "", "c"]), 2);
        assert_eq!((m.list, m.changed), (vec![json!("a"), json!("b")], 1));
    }

    #[test]
    fn shortcuts_need_http_and_cap() {
        let local = json!([{"url": "https://a.com", "title": "A"}]);
        let remote = json!([{"url": "https://a.com"}, {"url": "ftp://x"}, {"url": "HTTP://b.com", "title": "B"}]);
        let m = merge_shortcuts(&local, &remote);
        assert_eq!(m.changed, 1);
        assert_eq!(m.list[1]["url"], "HTTP://b.com");
        let full: Vec<Value> = (0..24).map(|i| json!({"url": format!("https://{i}.com")})).collect();
        assert_eq!(merge_shortcuts(&Value::Array(full), &remote).changed, 0);
    }

    #[test]
    fn character_needs_glyph_or_art_and_prefers_custom_then_newer() {
        assert_eq!(clean_character(&json!({"desc": "x"})), None);
        assert_eq!(clean_character(&json!("x")), None);
        let a = json!({"glyph": "A", "at": 5});
        let b = json!({"glyph": "B", "at": 9});
        assert_eq!(merge_character(&a, &b)["value"]["glyph"], "B");
        assert_eq!(merge_character(&a, &b)["changed"], true);
        assert_eq!(merge_character(&b, &a)["value"]["glyph"], "B");
        assert_eq!(merge_character(&b, &a)["changed"], false);
        let c = json!({"glyph": "C", "at": 1, "custom": true});
        assert_eq!(merge_character(&b, &c)["value"]["glyph"], "C");
        assert_eq!(merge_character(&a, &json!(null))["value"]["glyph"], "A");
        assert_eq!(merge_character(&json!(null), &json!(null))["value"], Value::Null);
    }

    #[test]
    fn notes_newest_wins_tombstones_expire() {
        let local = json!([{"id": "a", "text": "old", "at": 10, "rev": 2}]);
        let remote = json!([
            {"id": "a", "text": "new", "at": 20},
            {"id": "b", "text": "x", "at": 5},
            {"id": "bad id!", "text": "x", "at": 5},
            {"id": "gone", "deleted": true, "at": 1}
        ]);
        let m = merge_notes(&local, &remote, 100.0);
        assert_eq!(m.changed, 3);
        assert_eq!(m.list[0]["text"], "new");
        assert_eq!(m.list[0]["rev"], 3);
        assert_eq!(m.list.len(), 3);
        let m = merge_notes(&local, &remote, 100.0 + TOMB_TTL);
        assert_eq!(m.list.len(), 2); // tombstone older than 30 days dropped
        let same = merge_notes(&m.list.clone().into(), &remote, 100.0);
        assert_eq!(same.changed, 0);
    }

    #[test]
    fn notes_sync_respects_budget() {
        let list = json!([{"id": "a", "text": "x".repeat(50), "at": 1}, {"id": "b", "text": "y", "at": 2}, {"id": "c", "deleted": true, "at": 3}]);
        let out = notes_for_sync(&list, 60);
        let ids: Vec<_> = out.iter().map(|e| e["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["c", "b"]);
        assert!(out[0].get("text").is_none());
    }

    #[test]
    fn settings_keep_known_same_type_keys_only() {
        let current = json!({"theme": "dark", "httpsOnly": true, "customTheme": null, "searchWords": [], "savedThemes": [], "plannerPos": "left", "uiBlur": 1});
        let source = json!({
            "theme": "light", "httpsOnly": "yes", "evil": 1, "uiBlur": 3, "customTheme": 5, "plannerPos": "up",
            "searchWords": [{"word": " hi ", "url": " https://x "}, {"word": "", "url": "u"}],
            "savedThemes": [
                {"name": " T ", "bg": "#112233", "text": "#FFFFFF", "accent": "#000000", "accent2": "#abcdef", "tabTex": "dots", "raised": "red"},
                {"name": "bad", "bg": "#12"}
            ]
        });
        let out = pick_settings(&source, &current);
        assert_eq!(out["theme"], "light");
        assert_eq!(out["uiBlur"], 3);
        for k in ["httpsOnly", "evil", "customTheme", "plannerPos"] {
            assert!(out.get(k).is_none(), "{k}");
        }
        assert_eq!(out["searchWords"], json!([{"word": "hi", "url": "https://x"}]));
        assert_eq!(out["savedThemes"], json!([{"name": "T", "bg": "#112233", "text": "#FFFFFF", "accent": "#000000", "accent2": "#abcdef", "tabTex": "dots"}]));
    }
}
