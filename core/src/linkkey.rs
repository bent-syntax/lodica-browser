//! Pure parts of the link key (desktop/main/linkkey.js): the four-digit codes both devices compare.
//! shortcut: sealing and ECDH wrapping stay in JS, they need aes-gcm and p256 crates, add them when the shell owns the key store.
use sha2::{Digest, Sha256};

fn four_digits(h: &[u8]) -> String {
    format!("{:04}", u32::from_be_bytes([h[0], h[1], h[2], h[3]]) % 10000)
}

/// Four digits both devices can compare, from the two public keys (the base64 text, as sent).
pub fn fingerprint(joiner_pub: &str, origin_pub: &str) -> String {
    let mut h = Sha256::new();
    h.update(joiner_pub.as_bytes());
    h.update(b"|");
    h.update(origin_pub.as_bytes());
    four_digits(&h.finalize())
}

/// Four digits that name the key, so two devices can see they hold the same one. `key` is the raw bytes.
pub fn key_id(key: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b"lodica-keyid|");
    h.update(key);
    four_digits(&h.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_match_js() {
        // sha256("a|b") starts 0eab8a0a, sha256("lodica-keyid|AAAA") starts 10e2adec
        assert_eq!(fingerprint("a", "b"), "3018");
        assert_eq!(key_id(b"AAAA"), "1116");
    }
}
