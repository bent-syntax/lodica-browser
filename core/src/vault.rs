//! PIN vault logic, ported from desktop/main/vault.js. Time and salt come from the caller.
use scrypt::{scrypt, Params};

pub const UNLOCK_MS: u64 = 30_000;
const BLOCK_MS: u64 = 30_000;
const MAX_FAILS: u32 = 5;

#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub origin: String,
    pub user: String,
    pub pass: String,
    pub saved: u64,
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len() / 2).filter_map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok()).collect()
}

/// scrypt(N=16384, r=8, p=1) to 32 bytes, same as Node's scryptSync defaults.
pub fn hash(pin: &str, salt_hex: &str) -> String {
    let mut out = [0u8; 32];
    let p = Params::new(14, 8, 1, 32).expect("scrypt params");
    scrypt(pin.as_bytes(), &unhex(salt_hex), &p, &mut out).expect("scrypt");
    hex(&out)
}

#[derive(Default)]
pub struct Vault {
    pub pin: Option<(String, String)>, // (salt, hash) hex
    pub entries: Vec<Entry>,
    unlocked_until: u64,
    fails: u32,
    blocked_until: u64,
}

impl Vault {
    pub fn pin_set(&self) -> bool {
        self.pin.is_some()
    }

    pub fn unlocked(&self, now: u64) -> bool {
        self.pin.is_none() || now < self.unlocked_until
    }

    /// Checks the PIN without unlocking; 5 misses block for 30 s.
    pub fn check(&mut self, pin: &str, now: u64) -> bool {
        let Some((salt, want)) = &self.pin else { return false };
        if pin.is_empty() || now < self.blocked_until {
            return false;
        }
        let a = hash(pin, salt);
        // constant-time compare
        let ok = a.len() == want.len() && a.bytes().zip(want.bytes()).fold(0, |d, (x, y)| d | (x ^ y)) == 0;
        if ok {
            self.fails = 0;
        } else {
            self.fails += 1;
            if self.fails >= MAX_FAILS {
                self.fails = 0;
                self.blocked_until = now + BLOCK_MS;
            }
        }
        ok
    }

    pub fn set_pin(&mut self, pin: &str, old: &str, salt_hex: &str, now: u64) -> bool {
        if pin.chars().count() < 4 {
            return false;
        }
        if self.pin.is_some() && !self.check(old, now) {
            return false;
        }
        let first = self.pin.is_none();
        self.pin = Some((salt_hex.to_string(), hash(pin, salt_hex)));
        if first {
            self.unlocked_until = now + UNLOCK_MS;
        }
        true
    }

    pub fn unlock(&mut self, pin: &str, now: u64) -> bool {
        let ok = self.check(pin, now);
        if ok {
            self.unlocked_until = now + UNLOCK_MS;
        }
        ok
    }

    /// Opens the vault after a linked phone or link key vouched for this PC.
    pub fn grant(&mut self, now: u64) {
        self.unlocked_until = now + UNLOCK_MS;
    }

    pub fn lock(&mut self) {
        self.unlocked_until = 0;
    }

    /// (origin, user, saved) sorted by origin; empty while locked.
    pub fn list(&self, now: u64) -> Vec<(String, String, u64)> {
        if !self.unlocked(now) {
            return vec![];
        }
        let mut v: Vec<_> = self.entries.iter().map(|e| (e.origin.clone(), e.user.clone(), e.saved)).collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }

    pub fn save(&mut self, origin: &str, user: &str, pass: &str, now: u64) -> bool {
        if origin.is_empty() || pass.is_empty() {
            return false;
        }
        match self.entries.iter_mut().find(|e| e.origin == origin && e.user == user) {
            Some(e) => {
                e.pass = pass.into();
                e.saved = now;
            }
            None => self.entries.push(Entry { origin: origin.into(), user: user.into(), pass: pass.into(), saved: now }),
        }
        true
    }

    pub fn remove(&mut self, origin: &str, user: &str, now: u64) -> bool {
        if !self.unlocked(now) {
            return false;
        }
        let n = self.entries.len();
        self.entries.retain(|e| !(e.origin == origin && e.user == user));
        self.entries.len() != n
    }

    pub fn find(&self, origin: &str) -> Vec<&Entry> {
        self.entries.iter().filter(|e| e.origin == origin).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrypt_matches_node() {
        // node: crypto.scryptSync("1234", Buffer.from("00112233445566778899aabbccddeeff","hex"), 32).toString("hex")
        assert_eq!(hash("1234", "00112233445566778899aabbccddeeff").len(), 64);
        assert_eq!(hash("1234", "aa"), hash("1234", "aa"));
        assert_ne!(hash("1234", "aa"), hash("1235", "aa"));
    }

    #[test]
    fn pin_lock_and_block() {
        let mut v = Vault::default();
        assert!(v.unlocked(0));
        assert!(!v.set_pin("12", "", "aa", 0));
        assert!(v.set_pin("1234", "", "aa", 0));
        assert!(v.unlocked(1));
        assert!(!v.unlocked(UNLOCK_MS));
        assert!(!v.set_pin("5678", "bad", "bb", 10));
        assert!(v.unlock("1234", 100));
        v.lock();
        for _ in 0..5 {
            assert!(!v.unlock("0000", 200));
        }
        assert!(!v.unlock("1234", 300), "blocked");
        assert!(v.unlock("1234", 200 + BLOCK_MS));
    }

    #[test]
    fn entries() {
        let mut v = Vault::default();
        assert!(!v.save("", "u", "p", 1));
        assert!(v.save("https://a", "u", "p", 1));
        assert!(v.save("https://a", "u", "q", 2));
        assert_eq!(v.entries.len(), 1);
        assert_eq!(v.entries[0].pass, "q");
        assert_eq!(v.find("https://a").len(), 1);
        assert!(v.remove("https://a", "u", 3));
        assert!(!v.remove("https://a", "u", 3));
    }
}
