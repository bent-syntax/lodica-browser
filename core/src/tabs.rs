//! Port of the pure tab-list state in `desktop/main/tabs.js`: ordering, close stack, archive, cycling.
//! Views, splits and Electron calls stay in the shell; it passes ids and the current tab in.
use serde::{Deserialize, Serialize};

pub const HOME: &str = "lodica://search/search.html";
pub const MAX_CLOSED: usize = 10;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Tab {
    pub id: String,
    pub url: String,
    pub title: String,
    #[serde(rename = "lastUsed")]
    pub last_used: i64,
    pub archived: bool,
    pub entries: Vec<serde_json::Value>,
    pub index: Option<i64>,
    pub private: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Closed {
    pub title: String,
    pub url: String,
    pub entries: Vec<serde_json::Value>,
    pub index: Option<i64>,
    pub private: bool,
}

#[derive(Debug, Default)]
pub struct Tabs {
    pub list: Vec<Tab>,
    pub closed: Vec<Closed>, // newest first
}

/// Exact host of a URL, as `new URL(u).hostname` gives it (no www stripping).
fn hostname(u: &str) -> String {
    url::Url::parse(u).ok().and_then(|p| p.host_str().map(str::to_string)).unwrap_or_default()
}

pub fn is_home(u: &str) -> bool {
    u.is_empty() || u == "about:blank" || (u.starts_with(HOME) && !u.contains("?q=") && !u.contains("&q="))
}

pub fn is_settings_url(u: &str) -> bool {
    let t = u.trim().to_lowercase();
    t == "lodica://settings" || t == "lodica://settings/"
}

/// No icon reported yet: guess the site's /favicon.ico for http(s) tabs.
pub fn fallback_icon(u: &str) -> Option<String> {
    let p = url::Url::parse(u).ok()?;
    matches!(p.scheme(), "http" | "https").then(|| format!("{}/favicon.ico", p.origin().ascii_serialization()))
}

/// The own domain name (custom DNS rule `{from,to}`) that points at `host`, so the bar shows what the user typed.
pub fn own_name_for(host: &str, rules: &[(String, String)]) -> String {
    if host.is_empty() {
        return String::new();
    }
    let h = host.to_lowercase();
    for (from, to) in rules {
        let f = from.trim().to_lowercase();
        let to = to.trim();
        if f.is_empty() || f.starts_with('*') || f.starts_with('.') {
            continue;
        }
        let lo = to.to_lowercase();
        let full = if lo.starts_with("http://") || lo.starts_with("https://") {
            to.to_string()
        } else {
            format!("http://{to}")
        };
        if hostname(&full).to_lowercase() == h {
            return from.trim().to_string();
        }
    }
    String::new()
}

impl Tabs {
    pub fn open(&self) -> Vec<&Tab> {
        self.list.iter().filter(|t| !t.archived).collect()
    }

    fn pos(&self, id: &str) -> Option<usize> {
        self.list.iter().position(|t| t.id == id)
    }

    /// Tab to show when `t` goes away: most recent of the same privacy, else most recent of any.
    pub fn neighbor(&self, id: &str) -> Option<String> {
        let me = self.list.iter().find(|t| t.id == id)?;
        let o: Vec<&Tab> = self.list.iter().filter(|t| !t.archived && t.id != id).collect();
        let same: Vec<&Tab> = o.iter().copied().filter(|t| t.private == me.private).collect();
        let pool = if same.is_empty() { o } else { same };
        pool.into_iter().max_by_key(|t| t.last_used).map(|t| t.id.clone())
    }

    /// Remove tab, remember it for undo unless blank. Returns false when unknown.
    pub fn close(&mut self, id: &str) -> bool {
        let Some(i) = self.pos(id) else { return false };
        let t = self.list.remove(i);
        if !is_home(&t.url) {
            self.closed.insert(0, Closed { title: t.title, url: t.url, entries: t.entries, index: t.index, private: t.private });
            self.closed.truncate(MAX_CLOSED);
        }
        true
    }

    /// Take closed entry `index` back; the caller makes a tab from it.
    pub fn reopen(&mut self, index: usize) -> Option<Closed> {
        (index < self.closed.len()).then(|| self.closed.remove(index))
    }

    /// Put tab `id` where tab `to` is now.
    pub fn move_to(&mut self, id: &str, to: &str) -> bool {
        let (Some(a), Some(b)) = (self.pos(id), self.pos(to)) else { return false };
        if a == b {
            return false;
        }
        let t = self.list.remove(a);
        self.list.insert(b, t);
        true
    }

    /// Drop every open tab of one privacy; private close also forgets private closed tabs.
    pub fn close_all(&mut self, private: bool) {
        self.list.retain(|t| !(t.private == private && !t.archived));
        if private {
            self.closed.retain(|c| !c.private);
        }
    }

    pub fn archive(&mut self, id: &str) -> bool {
        match self.list.iter_mut().find(|t| t.id == id) {
            Some(t) if !t.private => {
                t.archived = true;
                true
            }
            _ => false,
        }
    }

    pub fn delete_archived(&mut self, id: &str) -> bool {
        let n = self.list.len();
        self.list.retain(|t| !(t.id == id && t.archived));
        self.list.len() != n
    }

    pub fn clear_archived(&mut self) {
        self.list.retain(|t| !t.archived);
    }

    /// Archive public tabs idle for `days`, sparing `keep` ids (current tab, split partner). Returns their ids.
    pub fn auto_archive(&mut self, days: i64, now: i64, keep: &[&str]) -> Vec<String> {
        if days <= 0 {
            return vec![];
        }
        let cut = now - days * 86_400_000;
        let mut out = vec![];
        for t in self.list.iter_mut() {
            if !t.archived && !t.private && t.last_used < cut && !keep.contains(&t.id.as_str()) {
                t.archived = true;
                out.push(t.id.clone());
            }
        }
        out
    }

    /// Next open tab id in direction `dir` (+1 / -1), wrapping.
    pub fn cycle(&self, cur: &str, dir: i64) -> Option<String> {
        let o = self.open();
        if o.len() < 2 {
            return None;
        }
        let i = o.iter().position(|t| t.id == cur)? as i64;
        let n = o.len() as i64;
        Some(o[((i + dir).rem_euclid(n)) as usize].id.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(id: &str, url: &str, used: i64, private: bool) -> Tab {
        Tab { id: id.into(), url: url.into(), last_used: used, private, ..Default::default() }
    }

    fn sample() -> Tabs {
        Tabs {
            list: vec![t("a", "https://a.com", 1, false), t("b", "https://b.com", 5, false), t("p", "https://p.com", 9, true), t("c", HOME, 3, false)],
            closed: vec![],
        }
    }

    #[test]
    fn home_detection() {
        assert!(is_home("") && is_home("about:blank") && is_home(HOME));
        assert!(!is_home(&format!("{HOME}?q=x")) && !is_home("https://a.com"));
    }

    #[test]
    fn neighbor_prefers_same_privacy() {
        let s = sample();
        assert_eq!(s.neighbor("a").as_deref(), Some("b"));
        assert_eq!(s.neighbor("p").as_deref(), Some("b")); // no other private: any
    }

    #[test]
    fn close_stack_skips_blank_and_caps() {
        let mut s = sample();
        assert!(s.close("c") && s.closed.is_empty());
        assert!(s.close("a") && s.closed[0].url == "https://a.com");
        assert!(!s.close("zzz"));
        for i in 0..15 {
            s.list.push(t(&format!("x{i}"), &format!("https://x{i}.com"), 0, false));
            s.close(&format!("x{i}"));
        }
        assert_eq!(s.closed.len(), MAX_CLOSED);
        assert_eq!(s.reopen(0).unwrap().url, "https://x14.com");
    }

    #[test]
    fn move_and_close_all() {
        let mut s = sample();
        assert!(s.move_to("c", "a") && s.list[0].id == "c");
        assert!(!s.move_to("a", "a"));
        s.closed.push(Closed { private: true, ..Default::default() });
        s.close_all(true);
        assert!(s.list.iter().all(|t| !t.private) && s.closed.is_empty());
    }

    #[test]
    fn archive_rules() {
        let mut s = sample();
        assert!(!s.archive("p") && s.archive("a"));
        assert_eq!(s.open().len(), 3);
        assert!(s.delete_archived("a") && !s.delete_archived("b"));
        let day = 86_400_000;
        let ids = s.auto_archive(1, 3 * day, &["c"]);
        assert_eq!(ids, vec!["b".to_string()]); // c kept, p private
        s.clear_archived();
        assert!(s.list.iter().all(|t| !t.archived));
        assert!(s.auto_archive(0, 0, &[]).is_empty());
    }

    #[test]
    fn cycle_wraps() {
        let s = sample();
        assert_eq!(s.cycle("c", 1).as_deref(), Some("a"));
        assert_eq!(s.cycle("a", -1).as_deref(), Some("c"));
        assert!(Tabs { list: vec![t("a", "x", 0, false)], closed: vec![] }.cycle("a", 1).is_none());
    }

    #[test]
    fn icons_and_names() {
        assert_eq!(fallback_icon("https://a.com/x?y").as_deref(), Some("https://a.com/favicon.ico"));
        assert!(fallback_icon("lodica://settings").is_none());
        let rules = vec![("my.home".to_string(), "192.168.1.5:8080".to_string()), ("*.x".to_string(), "1.1.1.1".to_string())];
        assert_eq!(own_name_for("192.168.1.5", &rules), "my.home");
        assert_eq!(own_name_for("1.1.1.1", &rules), "");
        assert!(is_settings_url(" lodica://Settings/ "));
    }
}
