//! Time based one-time codes, ported from desktop/main/totp.js.
use hmac::{Hmac, Mac};

const B32: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

#[derive(Debug, Clone, PartialEq)]
pub struct Account {
    pub label: String,
    pub issuer: String,
    pub name: String,
    pub secret: String,
    pub digits: u32,
    pub period: u64,
    pub algo: String,
}

fn clean(s: &str) -> String {
    s.to_uppercase().chars().filter(|c| !c.is_whitespace() && *c != '=' && *c != '-').collect()
}

/// Base32 to bytes; None on a bad character or empty input.
pub fn unbase32(s: &str) -> Option<Vec<u8>> {
    let (mut bits, mut val, mut out) = (0u32, 0u32, Vec::new());
    for c in clean(s).chars() {
        val = (val << 5) | B32.find(c)? as u32;
        bits += 5;
        if bits >= 8 {
            out.push(((val >> (bits - 8)) & 255) as u8);
            bits -= 8;
        }
    }
    (!out.is_empty()).then_some(out)
}

fn mac<M: Mac + hmac::digest::KeyInit>(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut m = <M as Mac>::new_from_slice(key).expect("hmac takes any key length");
    m.update(msg);
    m.finalize().into_bytes().to_vec()
}

/// The code at `now_ms`; "------" when the secret is invalid.
pub fn code(secret: &str, digits: u32, period: u64, algo: &str, now_ms: u64) -> String {
    let Some(key) = unbase32(secret) else { return "------".into() };
    let counter = (now_ms / 1000 / period).to_be_bytes();
    let h = match algo {
        "SHA256" => mac::<Hmac<sha2::Sha256>>(&key, &counter),
        "SHA512" => mac::<Hmac<sha2::Sha512>>(&key, &counter),
        _ => mac::<Hmac<sha1::Sha1>>(&key, &counter),
    };
    let o = (h[h.len() - 1] & 15) as usize;
    let n = u32::from_be_bytes([h[o] & 0x7f, h[o + 1], h[o + 2], h[o + 3]]) as u64;
    format!("{:0w$}", n % 10u64.pow(digits), w = digits as usize)
}

/// An otpauth://totp link, or a bare base32 secret, as an account; None when invalid.
pub fn from_text(text: &str) -> Option<Account> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    if t.len() >= 10 && t[..10].eq_ignore_ascii_case("otpauth://") {
        let u = url::Url::parse(t).ok()?;
        if !u.host_str()?.eq_ignore_ascii_case("totp") {
            return None;
        }
        let name = percent_encoding::percent_decode_str(u.path().trim_start_matches('/')).decode_utf8_lossy().to_string();
        let q = |k: &str| u.query_pairs().find(|(a, _)| a == k).map(|(_, v)| v.to_string());
        let secret = clean(&q("secret").unwrap_or_default());
        unbase32(&secret)?;
        let issuer = q("issuer").filter(|s| !s.is_empty()).unwrap_or_else(|| name.split_once(':').map(|(a, _)| a.trim().to_string()).unwrap_or_default());
        let acct = name.split_once(':').map(|(_, b)| b.trim().to_string()).unwrap_or_else(|| name.clone());
        let digits: u32 = q("digits").map_or(Some(6), |v| v.parse().ok())?;
        let period: u64 = q("period").map_or(Some(30), |v| v.parse().ok())?;
        let algo = q("algorithm").unwrap_or_else(|| "SHA1".into()).to_uppercase();
        // a setting we cannot honour would give wrong codes: refuse the link instead
        if ![6, 8].contains(&digits) || !(5..=300).contains(&period) || !["SHA1", "SHA256", "SHA512"].contains(&algo.as_str()) {
            return None;
        }
        let mut parts: Vec<&str> = Vec::new();
        for p in [issuer.as_str(), acct.as_str()] {
            if !p.is_empty() && !parts.contains(&p) {
                parts.push(p);
            }
        }
        let label = if parts.is_empty() { "Account".to_string() } else { parts.join(" · ") };
        return Some(Account { label, issuer, name, secret, digits, period, algo });
    }
    let secret = clean(t);
    (unbase32(&secret).is_some() && secret.len() >= 16)
        .then(|| Account { label: "Account".into(), issuer: String::new(), name: String::new(), secret, digits: 6, period: 30, algo: "SHA1".into() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc6238_vectors() {
        // RFC 6238 appendix B, 8 digits, T = 59s
        assert_eq!(code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 8, 30, "SHA1", 59_000), "94287082");
        assert_eq!(code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA", 8, 30, "SHA512", 59_000), "90693936");
        assert_eq!(code("!!", 6, 30, "SHA1", 0), "------");
    }

    #[test]
    fn parses_links_and_secrets() {
        let a = from_text("otpauth://totp/Acme:bob%40x.com?secret=jbsw y3dp-ehpk3pxp&issuer=Acme&digits=8").unwrap();
        assert_eq!((a.label.as_str(), a.digits, a.period), ("Acme · bob@x.com", 8, 30));
        assert_eq!(a.secret, "JBSWY3DPEHPK3PXP");
        assert!(from_text("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP").is_none());
        assert!(from_text("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=7").is_none());
        assert!(from_text("JBSWY3DPEHPK3PXP").is_some());
        assert!(from_text("JBSWY3DP").is_none());
    }
}
