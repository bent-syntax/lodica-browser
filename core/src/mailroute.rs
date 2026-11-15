//! Pure logic of desktop/main/relay.js: base domains, verification code and confirm link picking, and VPS tunnel routing rules.
use regex::Regex;
use std::sync::OnceLock;

const PAIRS: [&str; 9] = ["co", "com", "org", "net", "ac", "gov", "edu", "ne", "or"];
pub const DIRECT_HOSTS: [&str; 17] = [
    "accounts.google.com", "accounts.youtube.com", "myaccount.google.com", "login.microsoftonline.com", "login.live.com",
    "login.microsoft.com", "appleid.apple.com", "idmsa.apple.com", "id.apple.com", "auth0.com", "okta.com", "onelogin.com",
    "paypal.com", "stripe.com", "pay.google.com", "itsme.be", "itsme-id.com",
];

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(p).unwrap())
}

pub fn base_domain(host: &str) -> String {
    let h = host.to_lowercase();
    let parts: Vec<&str> = h.split('.').collect();
    if parts.len() <= 2 || h.contains(':') || h.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return h;
    }
    let tld = parts[parts.len() - 1];
    let n = if tld.len() == 2 && PAIRS.contains(&parts[parts.len() - 2]) { 3 } else { 2 };
    parts[parts.len() - n..].join(".")
}

fn blocked(c: Option<char>) -> bool {
    c.is_some_and(|c| c.is_ascii_digit() || ".,:/-".contains(c))
}

/// Numbers the way the JS `NUM` regex finds them; the regex crate has no lookaround, so this walks the chars.
fn nums(s: &str) -> Vec<String> {
    let c: Vec<char> = s.chars().collect();
    let dig = |i: usize| c.get(i).is_some_and(|x| x.is_ascii_digit());
    let run = |i: usize| (i..c.len()).take_while(|&j| c[j].is_ascii_digit()).count();
    let (mut out, mut i) = (vec![], 0);
    while i < c.len() {
        let after_ok = |e: usize| !(blocked(c.get(e).copied()) || c.get(e) == Some(&'%'));
        if !dig(i) || (i > 0 && blocked(Some(c[i - 1]))) {
            i += 1;
            continue;
        }
        let mut end = None;
        if run(i) >= 3 {
            let j = i + 3;
            let sep = c.get(j).is_some_and(|&x| x == ' ' || x == '-');
            if sep && run(j + 1) >= 3 && after_ok(j + 4) {
                end = Some(j + 4);
            } else if run(j) >= 3 && after_ok(j + 3) {
                end = Some(j + 3);
            }
        }
        if end.is_none() {
            end = (4..=run(i).min(8)).rev().map(|l| i + l).find(|&e| after_ok(e));
        }
        match end {
            Some(e) => {
                out.push(c[i..e].iter().filter(|&&x| x != ' ' && x != '-').collect());
                i = e;
            }
            None => i += 1,
        }
    }
    out
}

fn keyword() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r"(?i)code|otp|verif|pin|one.time")
}

/// Finds a verification code in a mail: subject first, then near a keyword in the body.
pub fn code_of(subject: &str, text: &str, html: &str) -> Option<String> {
    let subj = nums(subject);
    if let Some(n) = subj.iter().find(|n| n.len() == 6) {
        return Some(n.clone());
    }
    if keyword().is_match(subject) {
        if let Some(n) = subj.iter().find(|n| (4..=8).contains(&n.len())) {
            return Some(n.clone());
        }
    }
    static TAG: OnceLock<Regex> = OnceLock::new();
    static WS: OnceLock<Regex> = OnceLock::new();
    let raw = if text.trim().is_empty() { re(&TAG, r"<[^>]*>").replace_all(html, " ").into_owned() } else { text.to_string() };
    let body = re(&WS, r"\s+").replace_all(&raw, " ").into_owned();
    for k in keyword().find_iter(&body) {
        let after: String = body[k.end()..].chars().take(160).collect();
        if let Some(n) = nums(&after).into_iter().find(|n| (4..=8).contains(&n.len())) {
            return Some(n);
        }
    }
    nums(&body).into_iter().find(|n| n.len() == 6)
}

pub fn confirm_link(links: &[String]) -> Option<String> {
    static GOOD: OnceLock<Regex> = OnceLock::new();
    static BAD: OnceLock<Regex> = OnceLock::new();
    let http: Vec<&String> = links.iter().filter(|l| {
        let l = l.to_lowercase();
        l.starts_with("http://") || l.starts_with("https://")
    }).collect();
    let good = re(&GOOD, r"(?i)confirm|verif|activat|token");
    let bad = re(&BAD, r"(?i)unsubscribe|privacy|terms|help");
    http.iter().find(|l| good.is_match(l)).or_else(|| http.iter().find(|l| !bad.is_match(l))).map(|l| (*l).clone())
}

fn sensitive() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r"(?i)(log-?in|sign-?in|sign-?on|oauth|sso|checkout|bank)|(^|[^a-z])(auth|account|pay)")
}

fn under(h: &str, d: &str) -> bool {
    h == d || h.strip_suffix(d).is_some_and(|p| p.ends_with('.'))
}

/// True when the host must skip the tunnel: local, private, login and payment hosts, plus the user's own list.
pub fn direct_host(h: &str, domain: &str, extra: &[String]) -> bool {
    static PRIV: OnceLock<Regex> = OnceLock::new();
    if h.is_empty() || h == "localhost" || h.ends_with(".local") || under(h, domain) {
        return true;
    }
    if re(&PRIV, r"^(10|127|0)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.").is_match(h) || h.starts_with('[') || h.contains(':') {
        return true;
    }
    DIRECT_HOSTS.iter().any(|d| under(h, d)) || extra.iter().any(|d| under(h, d)) || sensitive().is_match(h)
}

/// True when this URL goes through the VPS tunnel. The caller checks that the link is up and the pref is on.
pub fn routed(url: &str, domain: &str, extra: &[String]) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    if u.scheme() != "http" && u.scheme() != "https" {
        return false;
    }
    let h = u.host_str().unwrap_or("").to_lowercase();
    !direct_host(&h, domain, extra) && !sensitive().is_match(u.path())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base() {
        assert_eq!(base_domain("a.b.example.co.uk"), "example.co.uk");
        assert_eq!(base_domain("www.example.com"), "example.com");
        assert_eq!(base_domain("10.0.0.1"), "10.0.0.1");
    }

    #[test]
    fn numbers() {
        assert_eq!(nums("code 123 456 now"), vec!["123456"]);
        assert_eq!(nums("v1.2345 and 98765"), vec!["98765"]);
        assert_eq!(nums("12345678901"), Vec::<String>::new());
        assert_eq!(nums("50% 4821"), vec!["4821"]);
    }

    #[test]
    fn codes() {
        assert_eq!(code_of("Your code 482913", "", "").as_deref(), Some("482913"));
        assert_eq!(code_of("Hi", "Your verification code is 7391 ok", "").as_deref(), Some("7391"));
        assert_eq!(code_of("Hi", "", "<p>otp: <b>123-456</b></p>").as_deref(), Some("123456"));
        assert_eq!(code_of("Hi", "nothing here", ""), None);
    }

    #[test]
    fn links() {
        let l = vec!["https://x/unsubscribe".to_string(), "https://x/start".to_string(), "mailto:a".to_string()];
        assert_eq!(confirm_link(&l).as_deref(), Some("https://x/start"));
        let l = vec!["https://x/start".to_string(), "https://x/verify?t=1".to_string()];
        assert_eq!(confirm_link(&l).as_deref(), Some("https://x/verify?t=1"));
    }

    #[test]
    fn routing() {
        let none: Vec<String> = vec![];
        assert!(routed("https://news.example.com/a", "lodica.test", &none));
        assert!(!routed("https://accounts.google.com/", "lodica.test", &none));
        assert!(!routed("https://example.com/login", "lodica.test", &none));
        assert!(!routed("http://192.168.1.4/", "lodica.test", &none));
        assert!(!routed("https://a.mine.org/", "lodica.test", &["mine.org".to_string()]));
        assert!(!routed("ftp://example.com/", "lodica.test", &none));
    }
}
