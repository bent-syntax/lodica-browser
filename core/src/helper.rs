//! Pure parts of desktop/main/helper.js: same-site check, generated passwords, usernames and signup identities, spell-check language list.
//! The shell passes random numbers in, since this crate has no rand dependency.

use serde_json::{json, Value};

const WORDS: [&str; 24] = [
    "amber", "brisk", "cedar", "delta", "ember", "fable", "glint", "harbor", "ivory", "juniper", "kestrel", "lumen",
    "maple", "nova", "orbit", "pebble", "quartz", "raven", "sable", "tidal", "umber", "vale", "willow", "zephyr",
];
const FIRST: [&str; 12] = ["Alex", "Sam", "Robin", "Jamie", "Noah", "Emma", "Lucas", "Mila", "Leo", "Nora", "Finn", "Lena"];
const LAST: [&str; 10] = ["Peeters", "Jansen", "Maes", "Claes", "Wouters", "Martin", "Dubois", "Smith", "Meyer", "Vos"];
const SETS: [&str; 4] = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!#%*-_.@"];
const DICT_LANGS: [&str; 10] = ["da", "de", "en", "es", "fr", "it", "nl", "pl", "pt", "sv"];

/// Reads the numbers the shell supplied, cycling when they run out.
// shortcut: `n % len` has a tiny modulo bias and an empty list gives 0, fine for throwaway passwords when the shell supplies 64 numbers, upgrade if used for keys.
struct Rnd<'a> {
    src: &'a [u32],
    at: usize,
}

impl Rnd<'_> {
    fn below(&mut self, n: usize) -> usize {
        let v = self.src.get(self.at % self.src.len().max(1)).copied().unwrap_or(0) as usize;
        self.at += 1;
        v % n
    }
    fn pick<'b, T>(&mut self, list: &'b [T]) -> &'b T {
        &list[self.below(list.len())]
    }
}

/// True when the two hosts are equal or one is a subdomain of the other.
pub fn same_site(a: &str, b: &str) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    a == b || a.ends_with(&format!(".{b}")) || b.ends_with(&format!(".{a}"))
}

fn password_with(r: &mut Rnd) -> String {
    let all: Vec<u8> = SETS.concat().into_bytes();
    let mut out: Vec<u8> = SETS.iter().map(|s| *r.pick(s.as_bytes())).collect();
    while out.len() < 18 {
        out.push(*r.pick(&all));
    }
    for i in (1..out.len()).rev() {
        let j = r.below(i + 1);
        out.swap(i, j);
    }
    if let Some(l) = out.iter().position(|c| c.is_ascii_alphabetic()) {
        out.swap(0, l);
    }
    String::from_utf8(out).unwrap_or_default()
}

/// 18 characters with at least one of each class, starting with a letter.
pub fn password(rand: &[u32]) -> String {
    password_with(&mut Rnd { src: rand, at: 0 })
}

fn cap(s: &str) -> String {
    let mut c = s.chars();
    c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
}

/// Two words and a number, like "amberLumen4821".
pub fn username(rand: &[u32]) -> String {
    let mut r = Rnd { src: rand, at: 0 };
    let a = *r.pick(&WORDS);
    let b = *r.pick(&WORDS);
    format!("{a}{}{}", cap(b), 100 + r.below(9900))
}

/// One identity per use: the username comes from the same name that goes in the name fields.
pub fn signup(rand: &[u32]) -> Value {
    let mut r = Rnd { src: rand, at: 0 };
    let first = *r.pick(&FIRST);
    let last = *r.pick(&LAST);
    let user = format!("{}{}", format!("{first}{last}").to_lowercase(), 10 + r.below(90));
    json!({"first": first, "last": last, "user": user, "pass": password_with(&mut r)})
}

/// True for a spell-check language the app ships a word list for.
pub fn dict_lang(lang: &str) -> bool {
    DICT_LANGS.contains(&lang)
}

/// A CRLF checkout must not glue a carriage return to every word.
pub fn dict_clean(text: &str) -> String {
    text.replace('\r', "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sites() {
        assert!(same_site("a.com", "a.com"));
        assert!(same_site("mail.a.com", "a.com"));
        assert!(same_site("a.com", "mail.a.com"));
        assert!(!same_site("xa.com", "a.com"));
        assert!(!same_site("", "a.com"));
    }

    #[test]
    fn password_has_every_class() {
        for seed in 0..50u32 {
            let rand: Vec<u32> = (0..64).map(|i| seed.wrapping_mul(2654435761).wrapping_add(i * 40503)).collect();
            let p = password(&rand);
            assert_eq!(p.len(), 18);
            assert!(p.as_bytes()[0].is_ascii_alphabetic());
            for set in SETS {
                assert!(p.chars().any(|c| set.contains(c)), "{p} lacks {set}");
            }
        }
        assert_eq!(password(&[]).len(), 18);
    }

    #[test]
    fn names() {
        let u = username(&[0, 1, 5]);
        assert_eq!(u, "amberBrisk105");
        let s = signup(&[1, 2, 3]);
        assert_eq!(s["first"], "Sam");
        assert_eq!(s["last"], "Maes");
        assert_eq!(s["user"], "sammaes13");
        assert!(dict_lang("nl") && !dict_lang("xx"));
        assert_eq!(dict_clean("a\r\nb"), "a\nb");
    }
}
