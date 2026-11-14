//! Search result ranking, ported from relay/src/search.js.
use chrono::{DateTime, Utc};
use regex::Regex;
use std::sync::OnceLock;

const DAY_MS: i64 = 86_400_000;

fn fresh_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(latest|newest|news|today|tonight|yesterday|this (week|month|year)|current|currently|now|breaking|update[sd]?|release[sd]?|price|prices|score|scores|weather|forecast|results?|live|20\d\d)\b").unwrap()
    })
}

/// True when the query asks for something current.
pub fn wants_fresh(q: &str) -> bool {
    fresh_re().is_match(q)
}

/// Shortens to `n` chars with a trailing ellipsis, like `clip` in search.js.
pub fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let cut: String = s.chars().take(n - 1).collect();
    format!("{}…", cut.trim_end())
}

/// Hostname without a leading `www.`; empty when the URL is invalid.
pub fn host(u: &str) -> String {
    url::Url::parse(u)
        .ok()
        .and_then(|p| p.host_str().map(|h| h.strip_prefix("www.").unwrap_or(h).to_string()))
        .unwrap_or_default()
}

/// Stable-partitions `list` so items published in the last 30 days come first.
/// `date` returns the item's RFC 3339 date, if any.
// shortcut: RFC 3339 dates only, JS Date.parse accepts more formats; widen if searx sends others.
pub fn fresh_first<T>(list: Vec<T>, date: impl Fn(&T) -> Option<String>, now_ms: i64) -> Vec<T> {
    let recent = |x: &T| {
        date(x)
            .and_then(|d| DateTime::parse_from_rfc3339(&d).ok())
            .map(|t| t.with_timezone(&Utc).timestamp_millis())
            .is_some_and(|t| t > 0 && now_ms - t < 30 * DAY_MS)
    };
    let (mut recent_items, rest): (Vec<T>, Vec<T>) = list.into_iter().partition(|x| recent(x));
    recent_items.extend(rest);
    recent_items
}

/// Indices of `urls` to keep: first occurrences only, skipping any already in `have`.
pub fn unseen(have: &[String], urls: &[String]) -> Vec<u32> {
    let mut seen: std::collections::HashSet<&str> = have.iter().map(String::as_str).collect();
    (0..urls.len() as u32).filter(|&i| seen.insert(urls[i as usize].as_str())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_intent() {
        assert!(wants_fresh("rust latest release"));
        assert!(wants_fresh("weather Ghent"));
        assert!(wants_fresh("world cup 2026"));
        assert!(!wants_fresh("how to bake bread"));
    }

    #[test]
    fn clips() {
        assert_eq!(clip("abc", 5), "abc");
        assert_eq!(clip("abcdefghij", 5), "abcd…");
        assert_eq!(clip("ab  cdefg", 5), "ab…");
    }

    #[test]
    fn hosts() {
        assert_eq!(host("https://www.example.com/a"), "example.com");
        assert_eq!(host("not a url"), "");
    }

    #[test]
    fn orders_recent_first_and_stable() {
        let now = DateTime::parse_from_rfc3339("2026-11-11T00:00:00Z").unwrap().timestamp_millis();
        let items = vec![
            ("old", Some("2020-01-01T00:00:00Z".to_string())),
            ("none", None),
            ("new1", Some("2026-11-01T00:00:00Z".to_string())),
            ("new2", Some("2026-11-10T00:00:00Z".to_string())),
        ];
        let out = fresh_first(items, |x| x.1.clone(), now);
        let names: Vec<_> = out.iter().map(|x| x.0).collect();
        assert_eq!(names, ["new1", "new2", "old", "none"]);
    }

    #[test]
    fn unseen_drops_known_and_repeats() {
        let v = |a: &[&str]| a.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        assert_eq!(unseen(&v(&["a"]), &v(&["a", "b", "b", "c"])), [1, 3]);
    }
}
