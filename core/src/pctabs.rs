//! Pure logic of desktop/main/pctabs.js: link secret ids, pairing link parsing, channel ids, phone commands and payload trimming.
use hmac::{Hmac, Mac};
use regex::Regex;
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
pub const MAX: usize = 512 * 1024;
const CMD_TTL_MS: u64 = 10 * 60_000;

fn b64u_bytes(b: &[u8]) -> String {
    let mut out = String::new();
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..=c.len() {
            out.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

fn b64u_decode(s: &str) -> Option<Vec<u8>> {
    let (mut out, mut acc, mut bits) = (Vec::new(), 0u32, 0);
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

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 || !s.is_ascii() {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

/// First 16 bytes of HMAC-SHA256(key, label), base64url.
fn hmac_id(key: &[u8], label: &str) -> String {
    let mut m = Hmac::<sha2::Sha256>::new_from_slice(key).expect("hmac takes any key length");
    m.update(label.as_bytes());
    b64u_bytes(&m.finalize().into_bytes()[..16])
}

/// Relay slot of the command blob only this side writes.
pub fn cmd_id(key: &[u8]) -> String {
    hmac_id(key, "cmd")
}

/// Relay slot of a named encrypted message ("kq", "ka").
pub fn chan_id(key: &[u8], name: &str) -> String {
    hmac_id(key, &format!("ch:{name}"))
}

/// The two slot ids and the key behind a hex secret (16 bytes id + 32 bytes key). `write`/`read` swap with `owner`.
pub fn sides(secret_hex: &str, owner: bool) -> Option<Value> {
    let secret = unhex(secret_hex)?;
    if secret.len() != 48 {
        return None;
    }
    let key = &secret[16..];
    let base = b64u_bytes(&secret[..16]);
    let derived = hmac_id(key, "pc");
    let (write, read) = if owner { (&base, &derived) } else { (&derived, &base) };
    Some(json!({"base": base, "derived": derived, "write": write, "read": read, "key": b64u_bytes(key)}))
}

/// Secret (hex) from a pairing link or code: `<22 chars>#<43 chars>` anywhere in the text.
pub fn parse_link(text: &str) -> Option<String> {
    static LINK: OnceLock<Regex> = OnceLock::new();
    let m = LINK.get_or_init(|| Regex::new(r"([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})").unwrap()).captures(text.trim())?;
    let (id, key) = (b64u_decode(&m[1])?, b64u_decode(&m[2])?);
    (id.len() == 16 && key.len() == 32).then(|| hex(&[id, key].concat()))
}

/// Add a command for the phone: drops old ones, keeps the last 20. None when the command is not allowed.
pub fn control(cmd: &Value, now: u64, old: &[Value]) -> Option<Vec<Value>> {
    let c = cmd.as_object()?;
    let ty = c.get("type").and_then(Value::as_str)?;
    if !["open", "close", "focus", "reload"].contains(&ty) {
        return None;
    }
    let url = c.get("url").and_then(Value::as_str).unwrap_or("");
    let lower = url.to_ascii_lowercase();
    if ty != "reload" && !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return None;
    }
    let mut list: Vec<Value> = old.iter().filter(|x| now.saturating_sub(x["at"].as_u64().unwrap_or(0)) < CMD_TTL_MS).cloned().collect();
    list.push(json!({"at": now, "type": ty, "url": url.chars().take(2000).collect::<String>()}));
    let skip = list.len().saturating_sub(20);
    Some(list.split_off(skip))
}

/// Shrink the payload until it fits: bluetooth first, then half the history, then the oldest half of the chats.
pub fn trim_payload(updated: u64, tabs: &Value, chats: &Value, history: Option<&Value>, data: &Value, max: usize) -> String {
    let mut chats: Vec<Value> = chats.as_array().cloned().unwrap_or_default();
    let mut hist: Option<Vec<Value>> = history.and_then(Value::as_array).cloned();
    let mut data: Map<String, Value> = data.as_object().cloned().unwrap_or_default();
    let build = |chats: &[Value], hist: &Option<Vec<Value>>, data: &Map<String, Value>| {
        let mut o = json!({"updated": updated, "tabs": tabs, "chats": chats, "data": data});
        if let Some(h) = hist {
            o["history"] = json!(h);
        }
        o.to_string()
    };
    let mut out = build(&chats, &hist, &data);
    while out.len() > max.saturating_sub(1024) && (!chats.is_empty() || hist.as_ref().is_some_and(|h| !h.is_empty()) || data.get("bluetooth").is_some_and(|b| !b.is_null())) {
        if data.get("bluetooth").is_some_and(|b| !b.is_null()) {
            data.remove("bluetooth");
        } else if let Some(h) = hist.as_mut().filter(|h| !h.is_empty()) {
            h.truncate(h.len() / 2);
        } else {
            chats.sort_by_key(|c| std::cmp::Reverse(c["updated"].as_u64().unwrap_or(0)));
            chats.truncate(chats.len() / 2);
        }
        out = build(&chats, &hist, &data);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret() -> String {
        hex(&(0u8..48).collect::<Vec<_>>())
    }

    #[test]
    fn sides_swap_with_owner() {
        let o = sides(&secret(), true).unwrap();
        let p = sides(&secret(), false).unwrap();
        assert_eq!(o["write"], o["base"]);
        assert_eq!(o["read"], o["derived"]);
        assert_eq!(p["write"], o["derived"]);
        assert_eq!(p["read"], o["base"]);
        assert_eq!(o["base"].as_str().unwrap().len(), 22);
        assert_eq!(o["key"].as_str().unwrap().len(), 43);
        assert!(sides("00", true).is_none());
    }

    #[test]
    fn link_round_trip() {
        let s = sides(&secret(), true).unwrap();
        let text = format!(" https://x/t/{}#{} ", s["base"].as_str().unwrap(), s["key"].as_str().unwrap());
        assert_eq!(parse_link(&text).unwrap(), secret());
        assert!(parse_link("nothing here").is_none());
    }

    #[test]
    fn slots_are_distinct_and_stable() {
        let key: Vec<u8> = (16u8..48).collect();
        assert_eq!(cmd_id(&key).len(), 22);
        assert_ne!(cmd_id(&key), chan_id(&key, "kq"));
        assert_ne!(chan_id(&key, "kq"), chan_id(&key, "ka"));
        assert_eq!(chan_id(&key, "kq"), chan_id(&key, "kq"));
    }

    #[test]
    fn control_validates_and_trims() {
        let now = 1_000_000;
        assert!(control(&json!({"type": "open", "url": "ftp://x"}), now, &[]).is_none());
        assert!(control(&json!({"type": "nope"}), now, &[]).is_none());
        assert!(control(&json!("open"), now, &[]).is_none());
        assert_eq!(control(&json!({"type": "reload"}), now, &[]).unwrap()[0]["url"], "");
        let old = vec![json!({"at": now - CMD_TTL_MS - 1, "type": "close", "url": "https://old"}), json!({"at": now - 5, "type": "focus", "url": "https://keep"})];
        let l = control(&json!({"type": "open", "url": "HTTPS://new"}), now, &old).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0]["url"], "https://keep");
        let many: Vec<Value> = (0..30).map(|i| json!({"at": now - 1, "type": "focus", "url": format!("https://{i}")})).collect();
        let l = control(&json!({"type": "open", "url": "https://z"}), now, &many).unwrap();
        assert_eq!(l.len(), 20);
        assert_eq!(l[19]["url"], "https://z");
    }

    #[test]
    fn trim_drops_in_order() {
        let chats = json!([{"updated": 1, "t": "x".repeat(400)}, {"updated": 3, "t": "x".repeat(400)}, {"updated": 2, "t": "x".repeat(400)}, {"updated": 4, "t": "x".repeat(400)}]);
        let hist = json!([{"u": "a"}, {"u": "b"}, {"u": "c"}, {"u": "d"}]);
        let data = json!({"wifi": [], "bluetooth": ["y".repeat(500)]});
        let full = trim_payload(1, &json!([]), &chats, Some(&hist), &data, MAX);
        assert!(full.contains("bluetooth") && full.contains("\"history\""));
        let no_bt = trim_payload(1, &json!([]), &chats, Some(&hist), &data, 1024 + full.len() - 100);
        assert!(!no_bt.contains("bluetooth") && no_bt.contains("\"d\""));
        let small = trim_payload(1, &json!([]), &chats, Some(&hist), &data, 1024 + 150);
        assert!(!small.contains("\"u\":\"d\"") || small.len() <= 1024 + 150 || !small.contains("bluetooth"));
        let none = trim_payload(1, &json!([]), &chats, None, &data, MAX);
        assert!(!none.contains("history"));
        let tiny = trim_payload(1, &json!([]), &chats, Some(&hist), &data, 0);
        assert!(tiny.contains("\"chats\":[]") && !tiny.contains("bluetooth"));
    }
}
