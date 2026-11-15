//! Address bar suggestions, ported from desktop/main/commands.js (engineSuggest, suggest).
//! shortcut: the network fetch, history lookup and url resolve stay in the shell, they are I/O and prefs.
use serde_json::{json, Value};

const ENGINE_MAX: usize = 5;
const TOTAL_MAX: usize = 10;

/// Engine key to use: Lodica Search has no suggestions, so an empty or LODICA key uses the fallback.
pub fn engine_key<'a>(search: &'a str, fallback: &'a str) -> &'a str {
    if search.is_empty() || search == "LODICA" {
        fallback
    } else {
        search
    }
}

/// Suggest url for a template with `%s`, or None when the query is too short or the tab is private.
pub fn url(template: &str, text: &str, private: bool) -> Option<String> {
    if template.is_empty() || private || text.chars().count() < 2 {
        return None;
    }
    Some(template.replacen("%s", &crate::errorpage::enc(text), 1))
}

/// First five non-empty strings of the `[query, [suggestions]]` body, as JS did.
pub fn titles(body: &Value) -> Vec<String> {
    body.get(1)
        .and_then(Value::as_array)
        .map(|l| l.iter().filter_map(Value::as_str).filter(|s| !s.is_empty()).take(ENGINE_MAX).map(String::from).collect())
        .unwrap_or_default()
}

fn url_of(v: &Value) -> &str {
    v.get("url").and_then(Value::as_str).unwrap_or("")
}

/// History first, then engine entries whose url is not already listed, capped at ten.
/// `top` is the first non-search history url over https, which the shell preconnects to.
pub fn merge(hist: &[Value], eng: &[Value]) -> (Vec<Value>, Option<String>) {
    let top = hist
        .iter()
        .find(|h| h.get("search").and_then(Value::as_bool) != Some(true) && url_of(h).starts_with("https://"))
        .map(|h| url_of(h).to_string());
    let list = hist.iter().chain(eng.iter().filter(|e| !hist.iter().any(|h| url_of(h) == url_of(e)))).take(TOTAL_MAX).cloned().collect();
    (list, top)
}

pub fn merge_json(hist: &Value, eng: &Value) -> Value {
    let arr = |v: &Value| v.as_array().cloned().unwrap_or_default();
    let (list, top) = merge(&arr(hist), &arr(eng));
    json!({"list": list, "preconnect": top})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::Shell;

    #[test]
    fn engine_choice() {
        assert_eq!(engine_key("", "DUCKDUCKGO"), "DUCKDUCKGO");
        assert_eq!(engine_key("LODICA", "BING"), "BING");
        assert_eq!(engine_key("GOOGLE", "BING"), "GOOGLE");
    }

    #[test]
    fn url_rules() {
        assert_eq!(url("https://x/?q=%s", "a b&c", false).unwrap(), "https://x/?q=a%20b%26c");
        assert!(url("https://x/?q=%s", "a", false).is_none());
        assert!(url("https://x/?q=%s", "ab", true).is_none());
        assert!(url("", "ab", false).is_none());
    }

    #[test]
    fn through_dispatcher() {
        let mut sh = Shell::default();
        let t = sh.call("suggest:titles", &json!({"body": ["q", ["a", "", 3, "b", "c", "d", "e", "f"]]}), 0);
        assert_eq!(t, json!(["a", "b", "c", "d", "e"]));
        assert_eq!(sh.call("suggest:titles", &json!({"body": {"x": 1}}), 0), json!([]));
        let u = sh.call("suggest:url", &json!({"template": "https://x/?q=%s", "text": "hi there", "private": false}), 0);
        assert_eq!(u, json!("https://x/?q=hi%20there"));
        assert_eq!(sh.call("suggest:engineKey", &json!({"search": "LODICA", "fallback": "BING"}), 0), json!("BING"));
        let hist = json!([{"title": "s", "url": "https://s/?q=s", "search": true}, {"title": "a", "url": "https://a.test/"}, {"title": "b", "url": "http://b.test/"}]);
        let eng = json!([{"title": "a2", "url": "https://a.test/"}, {"title": "n", "url": "https://n/"}]);
        let m = sh.call("suggest:merge", &json!({"hist": hist, "eng": eng}), 0);
        assert_eq!(m["list"].as_array().unwrap().len(), 4);
        assert_eq!(m["list"][3]["title"], "n");
        assert_eq!(m["preconnect"], "https://a.test/");
        let many: Vec<Value> = (0..12).map(|i| json!({"title": "t", "url": format!("http://{i}/")})).collect();
        let m = sh.call("suggest:merge", &json!({"hist": many, "eng": []}), 0);
        assert_eq!(m["list"].as_array().unwrap().len(), 10);
        assert!(m["preconnect"].is_null());
    }
}
