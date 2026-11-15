//! Port of `desktop/main/otpmigration.js`: read an `otpauth-migration://` link (Google Authenticator export).
use serde::Serialize;

const B32: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Otp {
    pub label: String,
    pub issuer: String,
    pub name: String,
    pub secret: String,
    pub digits: u32,
    pub period: u32,
    pub algo: String,
}

/// RFC 4648 base32, no padding.
pub fn base32(b: &[u8]) -> String {
    let (mut out, mut bits, mut val) = (String::new(), 0u32, 0u32);
    for &x in b {
        val = (val << 8) | x as u32;
        bits += 8;
        while bits >= 5 {
            out.push(B32[((val >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(B32[((val << (5 - bits)) & 31) as usize] as char);
    }
    out
}

fn unhex(c: u8) -> Option<u8> {
    (c as char).to_digit(16).map(|d| d as u8)
}

/// Like JS `decodeURIComponent`; None on a bad escape or invalid UTF-8.
fn url_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let (mut out, mut i) = (Vec::new(), 0);
    while i < b.len() {
        if b[i] == b'%' {
            out.push(unhex(*b.get(i + 1)?)? << 4 | unhex(*b.get(i + 2)?)?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Lenient base64 (std or url-safe alphabet, padding and whitespace ignored), like Node's Buffer.
fn unbase64(s: &str) -> Vec<u8> {
    let (mut out, mut bits, mut val) = (Vec::new(), 0u32, 0u32);
    for c in s.bytes() {
        let d = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => continue,
        };
        val = (val << 6) | d as u32;
        bits += 6;
        if bits >= 8 {
            out.push((val >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    out
}

struct Reader<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Reader<'a> {
    fn more(&self) -> bool {
        self.i < self.b.len()
    }

    fn varint(&mut self) -> Option<u64> {
        let (mut n, mut shift) = (0u64, 0u32);
        loop {
            let c = *self.b.get(self.i)?;
            self.i += 1;
            n |= ((c & 127) as u64) << shift;
            if c < 128 {
                return Some(n);
            }
            shift += 7;
            if shift > 56 {
                return None;
            }
        }
    }

    fn bytes(&mut self) -> Option<&'a [u8]> {
        let n = self.varint()? as usize;
        let end = self.i.checked_add(n).filter(|&e| e <= self.b.len())?;
        let s = &self.b[self.i..end];
        self.i = end;
        Some(s)
    }

    fn skip(&mut self, wire: u64) -> Option<()> {
        match wire {
            0 => {
                self.varint()?;
            }
            1 => self.i = self.i.checked_add(8).filter(|&e| e <= self.b.len())?,
            2 => {
                self.bytes()?;
            }
            5 => self.i = self.i.checked_add(4).filter(|&e| e <= self.b.len())?,
            _ => return None,
        }
        Some(())
    }
}

fn otp(b: &[u8]) -> Option<Option<Otp>> {
    let mut r = Reader { b, i: 0 };
    let (mut secret, mut name, mut issuer) = (&b[..0], String::new(), String::new());
    let (mut algo, mut digits, mut kind) = (0u64, 0u64, 0u64);
    while r.more() {
        let tag = r.varint()?;
        match tag {
            0x0a => secret = r.bytes()?,
            0x12 => name = String::from_utf8_lossy(r.bytes()?).into_owned(),
            0x1a => issuer = String::from_utf8_lossy(r.bytes()?).into_owned(),
            0x20 => algo = r.varint()?,
            0x28 => digits = r.varint()?,
            0x30 => kind = r.varint()?,
            _ => r.skip(tag & 7)?,
        }
    }
    if kind != 2 || secret.is_empty() {
        return Some(None);
    }
    let acct = match name.split_once(':') {
        Some((_, a)) => a.trim().to_string(),
        None => name.clone(),
    };
    let mut parts: Vec<&str> = Vec::new();
    for p in [issuer.as_str(), acct.as_str()] {
        if !p.is_empty() && !parts.contains(&p) {
            parts.push(p);
        }
    }
    let label = if !parts.is_empty() {
        parts.join(" · ")
    } else if !name.is_empty() {
        name.clone()
    } else {
        "Account".to_string()
    };
    Some(Some(Otp {
        label,
        issuer,
        name,
        secret: base32(secret),
        digits: if digits == 2 { 8 } else { 6 },
        period: 30,
        algo: match algo {
            2 => "SHA256",
            3 => "SHA512",
            _ => "SHA1",
        }
        .to_string(),
    }))
}

/// Accounts in a migration link; None when it is not one, is damaged, or holds no TOTP entries.
pub fn parse(link: &str) -> Option<Vec<Otp>> {
    let link = link.trim();
    if !link.get(..18).is_some_and(|p| p.eq_ignore_ascii_case("otpauth-migration:")) || !link[18..].starts_with("//") {
        return None;
    }
    let q = link.split_once('?')?.1;
    let data = q.split('#').next()?.split('&').find_map(|kv| kv.strip_prefix("data="))?;
    let raw = url_decode(&data.replace('+', "%2B"))?;
    let buf = unbase64(&raw);
    let mut r = Reader { b: &buf, i: 0 };
    let mut out = Vec::new();
    while r.more() {
        let tag = r.varint()?;
        if tag == 0x0a {
            if let Some(o) = otp(r.bytes()?)? {
                out.push(o);
            }
        } else {
            r.skip(tag & 7)?;
        }
    }
    (!out.is_empty()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(mut n: u64) -> Vec<u8> {
        let mut o = vec![];
        while n > 127 {
            o.push((n & 127) as u8 | 128);
            n >>= 7;
        }
        o.push(n as u8);
        o
    }
    fn ld(f: u64, b: &[u8]) -> Vec<u8> {
        [v(f << 3 | 2), v(b.len() as u64), b.to_vec()].concat()
    }
    fn vi(f: u64, n: u64) -> Vec<u8> {
        [v(f << 3), v(n)].concat()
    }
    fn entry(secret: &[u8], name: &str, issuer: &str, algo: u64, digits: u64, kind: u64) -> Vec<u8> {
        [ld(1, secret), ld(2, name.as_bytes()), ld(3, issuer.as_bytes()), vi(4, algo), vi(5, digits), vi(6, kind)].concat()
    }
    fn b64(b: &[u8]) -> String {
        const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut s = String::new();
        for c in b.chunks(3) {
            let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
            for k in 0..4 {
                if k <= c.len() {
                    s.push(T[(n >> (18 - 6 * k) & 63) as usize] as char);
                } else {
                    s.push('=');
                }
            }
        }
        s
    }
    fn link(p: &[u8]) -> String {
        format!("otpauth-migration://offline?data={}", b64(p).replace('+', "%2B").replace('/', "%2F").replace('=', "%3D"))
    }

    #[test]
    fn parses_totp_entries_and_skips_hotp() {
        let secret = b"Hello!\xde\xad\xbe\xef";
        let payload = [
            ld(1, &entry(secret, "alice@example.com", "Example", 1, 1, 2)),
            ld(1, &entry(b"12345678901234567890", "Bob", "", 2, 2, 2)),
            ld(1, &entry(b"hotp", "skip", "X", 1, 1, 1)),
            vi(2, 1),
            vi(3, 1),
            vi(4, 1),
        ]
        .concat();
        assert_eq!(base32(b"foobar"), "MZXW6YTBOI");
        let r = parse(&link(&payload)).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(
            r[0],
            Otp { label: "Example · alice@example.com".into(), issuer: "Example".into(), name: "alice@example.com".into(), secret: base32(secret), digits: 6, period: 30, algo: "SHA1".into() }
        );
        assert_eq!((r[1].label.as_str(), r[1].digits, r[1].algo.as_str()), ("Bob", 8, "SHA256"));
    }

    #[test]
    fn rejects_bad_input() {
        let p = [ld(1, &entry(b"x", "a", "", 1, 1, 2))].concat();
        assert!(parse("otpauth-migration://offline?data=%%%").is_none());
        assert!(parse("https://x").is_none());
        assert!(parse(&link(&p[..4])).is_none());
    }
}
