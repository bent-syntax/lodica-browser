//! Pure parts of desktop/main/room.js: name cleaning, dm and group room ids, labels, remembered names and the room query suffix.

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use regex::Regex;
use std::sync::OnceLock;

// Same unreserved set as JS encodeURIComponent.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'!').remove(b'~').remove(b'*').remove(b'\'').remove(b'(').remove(b')');

fn bad_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\s|\x00-\x1f\x7f-\x9f\u{a0}\u{2000}-\u{200f}\u{2028}\u{2029}\u{feff}]").unwrap())
}

fn group_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[^A-Za-z0-9_ .-]").unwrap())
}

/// Cuts to `n` UTF-16 units like JS `slice(0, n)`.
fn cut16(s: &str, n: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&u)
}

/// Name safe for room ids: blanks, pipes and control chars become `_`, at most 32 units, never empty.
pub fn clean(n: &str) -> String {
    let c = cut16(&bad_re().replace_all(n, "_"), 32);
    if c.is_empty() { "_".into() } else { c }
}

// shortcut: sorts by Unicode code point, JS sorts by UTF-16 unit; differs only for astral vs high-BMP names, fix if rooms disagree.
/// Direct-message room id for two names, the same from both sides.
pub fn dm(me: &str, peer: &str) -> String {
    let mut p = [clean(me), clean(peer)];
    p.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| a.cmp(b)));
    format!("dm:{}|{}", p[0], p[1])
}

/// Group room id: allowed characters only, trimmed, at most 32 units.
pub fn group(name: &str) -> String {
    format!("grp:{}", cut16(group_re().replace_all(name, "").trim(), 32))
}

/// Display name of a room as seen by `me`.
pub fn label(room: &str, me: &str) -> String {
    if room.is_empty() {
        return "Everyone".into();
    }
    if let Some(g) = room.strip_prefix("grp:") {
        return g.into();
    }
    let rest = room.get(3..).unwrap_or("");
    let me = clean(me);
    rest.split('|').find(|x| *x != me).filter(|x| !x.is_empty()).unwrap_or(rest).into()
}

/// Adds `n` to the remembered own names, keeping the last 20; `None` when nothing changes.
pub fn remember_name(names: &[String], n: &str) -> Option<Vec<String>> {
    if n.is_empty() || names.iter().any(|x| x == n) {
        return None;
    }
    let mut v = names.to_vec();
    v.push(n.into());
    Some(v.split_off(v.len().saturating_sub(20)))
}

/// True when `n` is the current name or one remembered before.
pub fn is_mine(n: &str, current: &str, names: &[String]) -> bool {
    n == current || names.iter().any(|x| x == n)
}

/// `&room=<encoded>` query suffix, empty for the everyone room.
pub fn room_q(room: &str) -> String {
    if room.is_empty() { String::new() } else { format!("&room={}", utf8_percent_encode(room, URI_COMPONENT)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_names() {
        assert_eq!(clean("a b|c\u{200b}d"), "a_b_c_d");
        assert_eq!(clean(""), "_");
        assert_eq!(clean(&"x".repeat(40)).len(), 32);
    }

    #[test]
    fn dm_same_both_sides() {
        assert_eq!(dm("Zed", "amy"), "dm:amy|Zed");
        assert_eq!(dm("amy", "Zed"), dm("Zed", "amy"));
        assert_eq!(dm("a", "A"), "dm:A|a");
    }

    #[test]
    fn groups_and_labels() {
        assert_eq!(group("  Team <1>!  "), "grp:Team 1");
        assert_eq!(label("", "me"), "Everyone");
        assert_eq!(label("grp:Team", "me"), "Team");
        assert_eq!(label(&dm("me", "amy"), "me"), "amy");
        assert_eq!(label("dm:me|me", "me"), "me|me");
    }

    #[test]
    fn names_and_query() {
        let mut names: Vec<String> = (0..20).map(|i| i.to_string()).collect();
        assert_eq!(remember_name(&names, "3"), None);
        names = remember_name(&names, "new").unwrap();
        assert_eq!((names.len(), names[0].as_str(), names[19].as_str()), (20, "1", "new"));
        assert!(is_mine("new", "cur", &names) && is_mine("cur", "cur", &names) && !is_mine("x", "cur", &names));
        assert_eq!(room_q(""), "");
        assert_eq!(room_q("dm:a|b c"), "&room=dm%3Aa%7Cb%20c");
    }
}
