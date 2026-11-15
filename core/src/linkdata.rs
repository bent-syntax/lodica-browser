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
}
