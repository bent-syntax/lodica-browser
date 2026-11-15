//! Pure logic of relay/src/api.js: mail ids, `since` parsing, alias locals, the emoji merge and pair codes.
use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const PAIR_ALPHA: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
pub const EMOJI_MAX: usize = 200;
pub const EMOJI_IMG_MAX: usize = 96 * 1024;

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap())
}

/// base64url without padding.
pub fn b64u(s: &str) -> String {
    let mut out = String::new();
    for c in s.as_bytes().chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..=c.len() {
            out.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

fn b64u_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let (mut acc, mut bits) = (0u32, 0);
    for ch in s.bytes() {
        acc = acc << 6 | B64.iter().position(|b| *b == ch)? as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits & 255) as u8);
        }
    }
    Some(out)
}

/// Maildir file name behind a mail id, None when the id is not canonical base64url of a safe name.
pub fn mail_id_decode(id: &str) -> Option<String> {
    static ID: OnceLock<Regex> = OnceLock::new();
    static FILE: OnceLock<Regex> = OnceLock::new();
    if !re(&ID, r"^[A-Za-z0-9_-]{4,512}$").is_match(id) {
        return None;
    }
    let file = String::from_utf8_lossy(&b64u_decode(id)?).into_owned();
    if !re(&FILE, r"^[A-Za-z0-9_,:=-][A-Za-z0-9._,:=-]{0,254}$").is_match(&file) || b64u(&file) != id {
        return None;
    }
    Some(file)
}

/// `since` query value in ms: Some(0) when absent, None when unparseable.
// shortcut: dates accept RFC 3339, RFC 2822 and YYYY-MM-DD only, not every form JS Date.parse takes; widen when a client sends another.
pub fn parse_since(v: &str) -> Option<i64> {
    static DIGITS: OnceLock<Regex> = OnceLock::new();
    if v.is_empty() {
        return Some(0);
    }
    if re(&DIGITS, r"^\d{1,16}$").is_match(v) {
        let n: i64 = v.parse().ok()?;
        return Some(if n < 100_000_000_000 { n * 1000 } else { n });
    }
    if let Ok(t) = chrono::DateTime::parse_from_rfc3339(v) {
        return Some(t.timestamp_millis());
    }
    if let Ok(t) = chrono::DateTime::parse_from_rfc2822(v) {
        return Some(t.timestamp_millis());
    }
    let d = chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").ok()?;
    Some(d.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis())
}

/// Alias local part: trimmed, lowercased, without a trailing `@domain`.
pub fn local_of(addr: &str, domain: &str) -> String {
    let a = addr.trim().to_lowercase();
    match a.strip_suffix(&format!("@{}", domain.to_lowercase())) {
        Some(l) => l.to_string(),
        None => a,
    }
}

/// decodeURIComponent, '' for a malformed escape.
pub fn unescape_part(v: &str) -> String {
    let b = v.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = b.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
            match h {
                Some(x) => out.push(x),
                None => return String::new(),
            }
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_default()
}

/// Six-letter pair code from six random bytes.
pub fn pair_code(r: &[u8]) -> String {
    r.iter().take(6).map(|b| PAIR_ALPHA[(b & 31) as usize] as char).collect()
}

/// The `<22>#<43>` secret of a pair link (last path segment), None when malformed.
pub fn pair_link(link: &str) -> Option<String> {
    static LINK: OnceLock<Regex> = OnceLock::new();
    let tail = link.rsplit('/').next().unwrap_or("");
    re(&LINK, r"^[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]{43}$").is_match(tail).then(|| tail.to_string())
}

/// Merge one emoji POST body into `list`. Ok((entry to return, list changed)) or Err((status, message)).
pub fn emoji_merge(list: &mut Vec<Value>, b: &Value, now: i64) -> Result<(Value, bool), (u16, &'static str)> {
    static NAME: OnceLock<Regex> = OnceLock::new();
    static PNG: OnceLock<Regex> = OnceLock::new();
    let name = b["name"].as_str().unwrap_or("");
    if !re(&NAME, r"^[a-z0-9_]{1,32}$").is_match(name) {
        return Err((400, "bad name"));
    }
    let del = b["del"] == json!(true);
    let png = b["png"].as_str().unwrap_or("");
    if !del && (png.is_empty() || png.len() > EMOJI_IMG_MAX || !re(&PNG, r"^[A-Za-z0-9+/=]+$").is_match(png)) {
        return Err((400, "bad image"));
    }
    let at = b["at"].as_f64().map(|a| a.min((now + 86_400_000) as f64) as i64).unwrap_or(now);
    let entry = json!({"name": name, "png": if del { "" } else { png }, "del": del, "at": at});
    let at_of = |v: &Value| v["at"].as_i64().unwrap_or(0);
    match list.iter().position(|x| x["name"] == name) {
        Some(i) => {
            if at_of(&list[i]) > at {
                return Ok((list[i].clone(), false));
            }
            list[i] = entry.clone();
        }
        None => {
            if del {
                return Ok((entry, false));
            }
            if list.iter().filter(|x| x["del"] != json!(true)).count() >= EMOJI_MAX {
                return Err((409, "emoji limit reached"));
            }
            list.push(entry.clone());
        }
    }
    let mut dead: Vec<usize> = (0..list.len()).filter(|i| list[*i]["del"] == json!(true)).collect();
    dead.sort_by_key(|i| at_of(&list[*i]));
    let extra = dead.len().saturating_sub(EMOJI_MAX);
    let mut drop: Vec<usize> = dead[..extra].to_vec();
    drop.sort_unstable_by(|a, b| b.cmp(a));
    for i in drop {
        list.remove(i);
    }
    Ok((entry, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mail_ids_round_trip_and_reject_noncanonical() {
        let id = b64u("1700000000.M1P2.host:2,S");
        assert_eq!(mail_id_decode(&id).as_deref(), Some("1700000000.M1P2.host:2,S"));
        assert_eq!(b64u("a"), "YQ");
        assert_eq!(b64u("ab"), "YWI");
        assert!(mail_id_decode("YQ=").is_none());
        assert!(mail_id_decode(&b64u("../etc")).is_none());
        assert!(mail_id_decode("abc").is_none());
        assert!(mail_id_decode("YR").is_none());
    }

    #[test]
    fn since_accepts_seconds_millis_and_dates() {
        assert_eq!(parse_since(""), Some(0));
        assert_eq!(parse_since("1700000000"), Some(1_700_000_000_000));
        assert_eq!(parse_since("1700000000000"), Some(1_700_000_000_000));
        assert_eq!(parse_since("2023-11-14T22:13:20Z"), Some(1_700_000_000_000));
        assert_eq!(parse_since("2023-11-14"), Some(1_699_920_000_000));
        assert_eq!(parse_since("nope"), None);
    }

    #[test]
    fn locals_and_escapes() {
        assert_eq!(local_of("  Foo@Mail.Example.com ", "mail.example.com"), "foo");
        assert_eq!(local_of("foo", "mail.example.com"), "foo");
        assert_eq!(unescape_part("a%20b"), "a b");
        assert_eq!(unescape_part("%zz"), "");
        assert_eq!(unescape_part("%E0%A4%A"), "");
    }

    #[test]
    fn pair_codes_and_links() {
        assert_eq!(pair_code(&[0, 1, 2, 31, 32, 255]), "ABC9A9");
        let l = format!("https://x/{}#{}", "a".repeat(22), "b".repeat(43));
        assert_eq!(pair_link(&l), Some(format!("{}#{}", "a".repeat(22), "b".repeat(43))));
        assert!(pair_link("https://x/short#x").is_none());
    }

    #[test]
    fn emoji_merge_rules() {
        let mut l = vec![];
        assert_eq!(emoji_merge(&mut l, &json!({"name": "Bad"}), 1).unwrap_err().0, 400);
        assert_eq!(emoji_merge(&mut l, &json!({"name": "ok"}), 1).unwrap_err().1, "bad image");
        let (e, ch) = emoji_merge(&mut l, &json!({"name": "ok", "png": "AAAA", "at": 5}), 10).unwrap();
        assert!(ch && e["at"] == 5 && l.len() == 1);
        // older write loses
        let (e, ch) = emoji_merge(&mut l, &json!({"name": "ok", "png": "BBBB", "at": 3}), 10).unwrap();
        assert!(!ch && e["png"] == "AAAA");
        // future `at` is clamped to now + 1 day
        let (e, _) = emoji_merge(&mut l, &json!({"name": "ok", "png": "CCCC", "at": 1e15}), 10).unwrap();
        assert_eq!(e["at"], 86_400_010);
        // tombstone for unknown name stores nothing
        let (_, ch) = emoji_merge(&mut l, &json!({"name": "gone", "del": true}), 10).unwrap();
        assert!(!ch && l.len() == 1);
        let (e, _) = emoji_merge(&mut l, &json!({"name": "ok", "del": true, "at": 99_999_999}), 10).unwrap();
        assert_eq!(e["png"], "");
    }

    #[test]
    fn emoji_limit_and_tombstone_cap() {
        let mut l: Vec<Value> = (0..EMOJI_MAX).map(|i| json!({"name": format!("e{i}"), "png": "A", "del": false, "at": 1})).collect();
        assert_eq!(emoji_merge(&mut l, &json!({"name": "extra", "png": "AAAA"}), 5).unwrap_err().0, 409);
        let mut t: Vec<Value> = (0..EMOJI_MAX).map(|i| json!({"name": format!("d{i}"), "png": "", "del": true, "at": i + 10})).collect();
        t.push(json!({"name": "live", "png": "A", "del": false, "at": 1}));
        emoji_merge(&mut t, &json!({"name": "live", "del": true, "at": 1000}), 5).unwrap();
        assert_eq!(t.len(), EMOJI_MAX);
        assert!(!t.iter().any(|x| x["name"] == "d0"));
    }
}
