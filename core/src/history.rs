//! Browsing history logic, ported from desktop/main/history.js.
use regex::Regex;
use std::sync::OnceLock;

pub const CAP: usize = 5000;
const DAY: f64 = 864e5;

#[derive(Clone, Debug, PartialEq)]
pub struct Page {
    pub url: String,
    pub title: String,
    pub time: u64,
    pub visits: u32,
}

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap())
}

pub fn is_web(u: &str) -> bool {
    let s = u.trim_start();
    s.len() >= 7 && (s[..7].eq_ignore_ascii_case("http://") || s.get(..8).is_some_and(|p| p.eq_ignore_ascii_case("https://")))
}

fn strip(u: &str) -> String {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r"(?i)^https?://(www\.)?").replace(u, "").into_owned()
}

/// Same page with another fragment, trailing slash or www merges into one entry.
pub fn key(u: &str) -> String {
    let no_frag = u.split('#').next().unwrap_or("");
    strip(no_frag).trim_end_matches('/').to_lowercase()
}

/// Visit a page: moves it to the front, bumps visits, caps the list.
pub fn add(entries: &mut Vec<Page>, url: &str, title: &str, now: u64) {
    if !is_web(url) {
        return;
    }
    let k = key(url);
    let old = entries.iter().position(|e| key(&e.url) == k).map(|i| entries.remove(i));
    let t = if !title.is_empty() { title.to_string() } else { old.as_ref().map(|o| o.title.clone()).unwrap_or_else(|| url.to_string()) };
    entries.insert(0, Page { url: url.into(), title: t, time: now, visits: old.map_or(0, |o| o.visits) + 1 });
    entries.truncate(CAP);
}

/// Recency x frequency: each visit counts more the more recent the entry is.
pub fn score(visits: u32, time: u64, now: u64) -> f64 {
    (1.0 + visits as f64).log2() * 2.0 / (1.0 + now.saturating_sub(time) as f64 / (7.0 * DAY))
}

/// True when the omnibox text is a search, not an address.
pub fn is_search(t: &str) -> bool {
    static A: OnceLock<Regex> = OnceLock::new();
    static B: OnceLock<Regex> = OnceLock::new();
    let t = t.trim();
    if t.is_empty() || (re(&A, r"(?i)^[a-z][a-z0-9+.-]*:").is_match(t) && !t.contains(' ')) {
        return false;
    }
    t.contains(' ') || (!re(&B, r"^[\w-]+(\.[\w-]+)+(:\d+)?(/.*)?$").is_match(t) && !t.starts_with("localhost"))
}

/// Merge a linked device's pages: newest time wins, larger visit count wins.
pub fn merge(entries: &mut Vec<Page>, list: &[Page], now: u64) -> bool {
    let mut changed = false;
    for r in list.iter().take(1000) {
        if !is_web(&r.url) || r.url.len() > 2000 || r.time == 0 || r.time > now + 300_000 {
            continue;
        }
        let visits = r.visits.clamp(1, 100_000);
        let title: String = r.title.chars().take(300).collect();
        let k = key(&r.url);
        match entries.iter_mut().find(|x| key(&x.url) == k) {
            Some(e) => {
                if r.time > e.time {
                    e.time = r.time;
                    if !title.is_empty() {
                        e.title = title;
                    }
                    changed = true;
                }
                if visits > e.visits {
                    e.visits = visits;
                    changed = true;
                }
            }
            None => {
                let t = if title.is_empty() { r.url.chars().take(300).collect() } else { title };
                entries.push(Page { url: r.url.clone(), title: t, time: r.time, visits });
                changed = true;
            }
        }
    }
    if changed {
        entries.sort_by(|a, b| b.time.cmp(&a.time));
        entries.truncate(CAP);
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_and_add() {
        assert_eq!(key("https://www.A.com/x/#top"), "a.com/x");
        let mut v = vec![];
        add(&mut v, "ftp://x", "t", 1);
        assert!(v.is_empty());
        add(&mut v, "https://a.com/", "A", 1);
        add(&mut v, "https://b.com/", "B", 2);
        add(&mut v, "https://www.a.com#z", "", 3);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].visits, v[0].title.as_str()), (2, "A"));
    }

    #[test]
    fn search_detection() {
        assert!(is_search("rust lang"));
        assert!(is_search("rust"));
        assert!(!is_search("example.com/a"));
        assert!(!is_search("localhost:3000"));
        assert!(!is_search("https://x.y"));
        assert!(!is_search(""));
    }

    #[test]
    fn merge_rules() {
        let mut v = vec![Page { url: "https://a.com".into(), title: "A".into(), time: 10, visits: 1 }];
        let n = vec![
            Page { url: "https://a.com/".into(), title: "A2".into(), time: 20, visits: 5 },
            Page { url: "https://bad".into(), title: "".into(), time: 0, visits: 1 },
            Page { url: "https://c.com".into(), title: "".into(), time: 5, visits: 0 },
        ];
        assert!(merge(&mut v, &n, 100));
        assert_eq!(v[0].title, "A2");
        assert_eq!(v[0].visits, 5);
        assert_eq!(v.len(), 2);
        assert_eq!(v[1].visits, 1);
        assert!(score(3, 100, 100) > score(3, 0, 10 * 864_000_000));
    }
}
