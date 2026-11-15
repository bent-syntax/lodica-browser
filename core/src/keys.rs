//! Keyboard shortcut table, ported from desktop/main/keys.js. Combos look like "Ctrl+Shift+T".
use regex::Regex;
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

// (id, label, default combos), in table order: that order decides clashes.
const ACTIONS: &[(&str, &str, &[&str])] = &[
    ("newTab", "New tab", &["Ctrl+T"]),
    ("newPrivate", "New private tab", &["Ctrl+Shift+N"]),
    ("undoClose", "Reopen closed tab", &["Ctrl+Shift+T"]),
    ("closeTab", "Close tab", &["Ctrl+W"]),
    ("nextTab", "Next tab", &["Ctrl+PageDown"]),
    ("prevTab", "Previous tab", &["Ctrl+PageUp"]),
    ("switcher", "Tab switcher", &["Ctrl+Tab", "Ctrl+Shift+A"]),
    ("address", "Address bar", &["Ctrl+L", "F6", "Alt+D"]),
    ("find", "Find in page", &["Ctrl+F"]),
    ("reload", "Reload", &["Ctrl+R", "F5"]),
    ("hardReload", "Reload, skip cache", &["Ctrl+Shift+R", "Shift+F5"]),
    ("back", "Back", &["Alt+ArrowLeft"]),
    ("forward", "Forward", &["Alt+ArrowRight"]),
    ("menu", "Menu", &["Ctrl+M", "Alt+F", "Alt+E"]),
    ("settings", "Settings", &["Ctrl+,"]),
    ("history", "History", &["Ctrl+H"]),
    ("downloads", "Downloads", &["Ctrl+J"]),
    ("notebook", "Notebook", &["Ctrl+Shift+O"]),
    ("devtools", "Developer tools", &["F12"]),
    ("chat", "Server chat", &["Ctrl+Shift+K"]),
    ("assistant", "Ask AI about this page", &["Ctrl+Shift+L"]),
    ("osk", "On-screen keyboard", &["Ctrl+Alt+K"]),
    ("toggleVertical", "Vertical tabs on/off", &["Ctrl+Shift+V"]),
    ("toggleSplit", "Split view on/off", &["Ctrl+Shift+S"]),
    ("draw", "Draw on tab", &["Ctrl+Shift+D"]),
    ("move", "Move page part", &["Ctrl+Shift+M"]),
];

/// Combo string for a key press; empty for a bare modifier.
pub fn combo(key: &str, ctrl: bool, alt: bool, shift: bool) -> String {
    if key.is_empty() || ["Control", "Alt", "Shift", "Meta", "AltGraph"].contains(&key) {
        return String::new();
    }
    let k = if key == " " {
        "Space".to_string()
    } else if key.chars().count() == 1 {
        key.to_uppercase()
    } else {
        key.to_string()
    };
    format!("{}{}{}{k}", if ctrl { "Ctrl+" } else { "" }, if alt { "Alt+" } else { "" }, if shift { "Shift+" } else { "" })
}

pub fn valid(c: &str) -> bool {
    static SHAPE: OnceLock<Regex> = OnceLock::new();
    static BARE_MOD: OnceLock<Regex> = OnceLock::new();
    let shape = SHAPE.get_or_init(|| Regex::new(r"^(Ctrl\+)?(Alt\+)?(Shift\+)?[^+\s]+$|^(Ctrl\+)?(Alt\+)?(Shift\+)?\+$").unwrap());
    let bare = BARE_MOD.get_or_init(|| Regex::new(r"(^|\+)(Ctrl|Alt|Shift|Meta|Dead|Unidentified)$").unwrap());
    shape.is_match(c) && c.chars().count() < 40 && !bare.is_match(c)
}

fn strings(v: &Value) -> Option<Vec<String>> {
    v.as_array().map(|a| a.iter().filter_map(Value::as_str).filter(|c| valid(c)).map(String::from).collect())
}

/// Combos per action: a user override (even an empty list) wins over the default.
fn effective(over: &Value) -> Vec<(&'static str, Vec<String>)> {
    ACTIONS
        .iter()
        .map(|(id, _, def)| (*id, over.get(*id).and_then(strings).unwrap_or_else(|| def.iter().map(|s| s.to_string()).collect())))
        .collect()
}

/// combo -> action id; the first action in table order wins a clash.
pub fn map(over: &Value) -> Value {
    let mut m = Map::new();
    for (id, combos) in effective(over) {
        for c in combos {
            m.entry(c).or_insert(json!(id));
        }
    }
    Value::Object(m)
}

/// New override object after binding `combos` to `id`: they come off every other action.
pub fn bind(over: &Value, id: &str, combos: &Value) -> Value {
    if !ACTIONS.iter().any(|a| a.0 == id) {
        return over.clone();
    }
    let mut mine: Vec<String> = Vec::new();
    for c in combos.as_array().into_iter().flatten().filter_map(Value::as_str).filter(|c| valid(c)) {
        if !mine.iter().any(|m| m == c) {
            mine.push(c.to_string());
        }
    }
    let mut next = Map::new();
    for (aid, eff) in effective(over) {
        if aid == id {
            next.insert(aid.into(), json!(mine));
        } else {
            let rest: Vec<&String> = eff.iter().filter(|c| !mine.contains(c)).collect();
            if rest.len() != eff.len() || over.get(aid).is_some_and(Value::is_array) {
                next.insert(aid.into(), json!(rest));
            }
        }
    }
    Value::Object(next)
}

pub fn list(over: &Value) -> Value {
    let eff = effective(over);
    json!(ACTIONS
        .iter()
        .zip(eff)
        .map(|((id, label, def), (_, keys))| json!({"id": id, "label": label, "keys": keys, "def": def}))
        .collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combos() {
        assert_eq!(combo("t", true, false, true), "Ctrl+Shift+T");
        assert_eq!(combo(" ", false, false, false), "Space");
        assert_eq!(combo("PageDown", true, false, false), "Ctrl+PageDown");
        assert_eq!(combo("Shift", false, false, true), "");
    }

    #[test]
    fn validity() {
        assert!(valid("Ctrl+,") && valid("Ctrl++") && valid("F12"));
        assert!(!valid("Ctrl") && !valid("Ctrl+Shift") && !valid("a b") && !valid("") && !valid("Dead"));
    }

    #[test]
    fn defaults_overrides_and_clashes() {
        let m = map(&json!({}));
        assert_eq!(m["Ctrl+T"], "newTab");
        // override, even empty, wins over the default
        let m = map(&json!({"newTab": [], "find": ["Ctrl+T", "bad+Ctrl"]}));
        assert_eq!(m["Ctrl+T"], "find");
        assert!(m.get("bad+Ctrl").is_none());
    }

    #[test]
    fn bind_takes_combo_off_others() {
        let o = bind(&json!({}), "find", &json!(["Ctrl+T", "Ctrl+T", "nope+"]));
        assert_eq!(o["find"], json!(["Ctrl+T"]));
        assert_eq!(o["newTab"], json!([]));
        assert!(o.get("reload").is_none());
        assert_eq!(bind(&json!({"x": 1}), "zzz", &json!([])), json!({"x": 1}));
    }

    #[test]
    fn list_has_all_actions() {
        let l = list(&json!({"find": []}));
        assert_eq!(l.as_array().unwrap().len(), ACTIONS.len());
        assert_eq!(l[8]["keys"], json!([]));
        assert_eq!(l[8]["def"], json!(["Ctrl+F"]));
    }
}
