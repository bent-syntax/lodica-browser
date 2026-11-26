//! Typed-text-to-URL resolution and per-host lists, ported from desktop/main/prefs.js.
use url::Url;

/// (id, search URL with %s, language-free). `LODICA` is only used when a server is linked.
pub const ENGINES: &[(&str, &str)] = &[
    ("DUCKDUCKGO", "https://duckduckgo.com/?q=%s"),
    ("STARTPAGE", "https://www.startpage.com/do/search?q=%s"),
    ("BRAVE", "https://search.brave.com/search?q=%s"),
    ("GOOGLE", "https://www.google.com/search?q=%s"),
    ("LODICA", "lodica://search/search.html?q=%s"),
];

/// (id, hl code).
pub const LANGUAGES: &[(&str, &str)] = &[("EN", "en"), ("NL", "nl-BE")];

const SCHEMES: &[&str] = &["http://", "https://", "about:", "file://", "data:", "view-source:", "lodica://", "chrome://"];

/// The prefs `resolve` reads.
pub struct Query<'a> {
    pub search: &'a str,
    pub fallback: &'a str,
    pub language: &'a str,
    /// (word, url) pairs from Settings > Search > Search words.
    pub words: &'a [(String, String)],
    pub lodica_available: bool,
}

fn engine(id: &str) -> &'static str {
    ENGINES.iter().find(|e| e.0 == id).map_or(ENGINES[0].1, |e| e.1)
}

/// Drops a leading `www.`.
pub fn bare(host: &str) -> &str {
    host.strip_prefix("www.").unwrap_or(host)
}

/// True when `host` equals a listed domain or is a subdomain of one.
pub fn matches(host: &str, list: &[String]) -> bool {
    list.iter().any(|d| host == d || host.ends_with(&format!(".{d}")))
}

fn is_google(url: &str) -> bool {
    let l = url.to_ascii_lowercase();
    let Some(rest) = l.strip_prefix("https://").or_else(|| l.strip_prefix("http://")) else { return false };
    let rest = rest.strip_prefix("www.").unwrap_or(rest);
    let Some(rest) = rest.strip_prefix("google.") else { return false };
    let tld_len = rest.find(|c: char| !(c.is_ascii_lowercase() || c == '.')).unwrap_or(rest.len());
    tld_len > 0 && (rest.len() == tld_len || matches!(rest.as_bytes()[tld_len], b'/'))
}

/// Google picks its UI language from the IP; pin it to the chosen language instead.
pub fn with_language(url: &str, language: &str) -> String {
    if !is_google(url) {
        return url.to_string();
    }
    let code = LANGUAGES.iter().find(|l| l.0 == language).map_or("en", |l| l.1);
    let Ok(mut u) = Url::parse(url) else { return url.to_string() };
    let pairs: Vec<(String, String)> = u.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    if pairs.iter().any(|(k, v)| k == "hl" && v == code) {
        return url.to_string();
    }
    {
        let mut q = u.query_pairs_mut();
        q.clear();
        for (k, v) in pairs.iter().filter(|(k, _)| k != "hl") {
            q.append_pair(k, v);
        }
        q.append_pair("hl", code);
    }
    u.to_string()
}

fn word_target(text: &str, words: &[(String, String)]) -> Option<String> {
    let w = text.to_lowercase();
    let (_, u) = words.iter().find(|(k, u)| k.trim().to_lowercase() == w && !u.trim().is_empty())?;
    let u = u.trim();
    let l = u.to_lowercase();
    Some(if SCHEMES.iter().any(|s| l.starts_with(s)) { u.to_string() } else { format!("https://{u}") })
}

fn is_label(l: &str) -> bool {
    let c: Vec<char> = l.chars().collect();
    match (c.first(), c.last()) {
        (Some(a), Some(b)) => a.is_alphanumeric() && b.is_alphanumeric() && c.iter().all(|x| x.is_alphanumeric() || *x == '-'),
        _ => false,
    }
}

fn is_ipv4(h: &str) -> bool {
    let p: Vec<&str> = h.split('.').collect();
    p.len() == 4 && p.iter().all(|n| !n.is_empty() && n.len() <= 3 && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Turns typed text into a URL: keeps URLs, adds https:// to hosts, otherwise searches.
pub fn resolve(input: &str, q: &Query) -> String {
    let t = input.trim();
    if t.is_empty() {
        return "about:blank".into();
    }
    let lower = t.to_lowercase();
    let web = lower.starts_with("http://") || lower.starts_with("https://");
    if SCHEMES.iter().any(|s| lower.starts_with(s)) {
        let bad_web = web && (t.contains(char::is_whitespace) || {
            let after = &t[t.find("//").unwrap() + 2..];
            after.is_empty() || after.starts_with(['/', '?', '#']) || after.starts_with(char::is_whitespace)
        });
        if !bad_web {
            let i = t.find(':').unwrap();
            return format!("{}{}", t[..i].to_lowercase(), &t[i..]);
        }
    }
    if let Some(w) = word_target(t, q.words) {
        return w;
    }
    let hp = t.split(['/', '?', '#']).next().unwrap_or("");
    let port = hp.rfind(':').filter(|&i| !hp.starts_with('[') || hp[i..].find(']').is_none());
    let (hn, port_ok) = match port {
        Some(i) if hp[i + 1..].bytes().all(|b| b.is_ascii_digit()) && i + 1 < hp.len() => (&hp[..i], hp[i + 1..].parse::<u32>().map_or(false, |p| p <= 65535)),
        _ => (hp, true),
    };
    let hl = hn.strip_suffix('.').unwrap_or(hn);
    let tld_alpha = hl.rsplit('.').next().map_or(false, |s| s.chars().any(char::is_alphabetic));
    let named = hl.contains('.') && hl.split('.').all(is_label) && tld_alpha;
    let ip = is_ipv4(hn) && hn.split('.').all(|n| n.parse::<u32>().map_or(false, |v| v <= 255));
    let v6 = hp.starts_with('[') && hp.contains(']') && hp[1..hp.find(']').unwrap()].bytes().all(|b| b.is_ascii_hexdigit() || b == b':');
    let bare_ip = is_ipv4(hn) && port_ok || hp.starts_with('[');
    if !t.contains(' ') && port_ok && (hn == "localhost" || named || ip || v6) {
        let scheme = if hn == "localhost" || bare_ip { "http://" } else { "https://" };
        return with_language(&format!("{scheme}{t}"), q.language);
    }
    let want = if !q.search.is_empty() { q.search } else if q.lodica_available { "LODICA" } else { "DUCKDUCKGO" };
    let pick = if want == "LODICA" && !q.lodica_available { q.fallback } else { want };
    let enc = percent_encoding::utf8_percent_encode(t, percent_encoding::NON_ALPHANUMERIC).to_string();
    with_language(&engine(pick).replace("%s", &enc), q.language)
}

/// The query of a Lodica Search page, shown in the address bar instead of its URL.
pub fn search_query(url: &str) -> Option<String> {
    if !url.starts_with("lodica://search/search.html") {
        return None;
    }
    let u = Url::parse(url).ok()?;
    u.query_pairs().find(|(k, _)| k == "q").map(|(_, v)| v.into_owned()).filter(|v| !v.is_empty())
}

/// Sites that always need the compatibility user agent (Google sign-in, GoDaddy).
pub fn is_forced_compat(host: &str) -> bool {
    let h = bare(host);
    matches!(h, "accounts.google.com" | "accounts.youtube.com" | "myaccount.google.com" | "gds.google.com" | "gemini.google.com")
        || (h.starts_with("accounts.google.") && h["accounts.google.".len()..].bytes().all(|b| b.is_ascii_lowercase() || b == b'.') && h.len() > "accounts.google.".len())
        || ["godaddy.com", "secureserver.net"].iter().any(|d| h == *d || h.ends_with(&format!(".{d}")))
}

/// (id, user-agent string). `DEFAULT` has no string: it means the Chrome-on-Windows default.
pub const AGENTS: &[(&str, Option<&str>)] = &[
    ("DEFAULT", None),
    ("CHROME_ANDROID", Some("Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")),
    ("SAFARI_IPHONE", Some("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1")),
    ("CHROME_DESKTOP", Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")),
    ("FIREFOX_DESKTOP", Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0")),
];

/// (id, Accept-Language list).
const ACCEPT: &[(&str, &[&str])] = &[("EN", &["en-US", "en"]), ("NL", &["nl-BE", "nl", "en"])];

pub const QUALITIES: &[u32] = &[144, 240, 360, 480, 720, 1080, 1440, 2160];

/// Plain Chrome on Windows, no "Electron" token, reduced version like real Chrome.
pub fn default_ua(chrome_major: &str) -> String {
    format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome_major}.0.0.0 Safari/537.36")
}

/// UA for an agent id; unknown ids and `DEFAULT` give the default identity.
pub fn user_agent_value(agent: &str, chrome_major: &str) -> String {
    AGENTS.iter().find(|a| a.0 == agent).and_then(|a| a.1).map_or_else(|| default_ua(chrome_major), str::to_string)
}

/// UA for a tab. Mobile-site tabs get Chrome on Android unless the site needs desktop input.
pub fn agent_for(agent: &str, chrome_major: &str, tab_desktop: bool, desktop_input: bool) -> String {
    if !tab_desktop && !desktop_input {
        return AGENTS[1].1.unwrap().to_string();
    }
    user_agent_value(agent, chrome_major)
}

/// Client hints matching a UA string. `None` means the UA is not Chromium (Firefox and Safari send none).
pub fn client_hints(ua: &str) -> Option<Vec<(&'static str, String)>> {
    if ua.contains("Firefox/") {
        return None;
    }
    let at = ua.find("Chrome/")? + 7;
    let v: String = ua[at..].chars().take_while(char::is_ascii_digit).collect();
    if v.is_empty() {
        return None;
    }
    let mobile = ua.contains("Mobile");
    let android = ua.contains("Android");
    let brands = [("Chromium", &v[..]), ("Not?A_Brand", "8"), ("Google Chrome", &v[..])];
    let short = brands.iter().map(|(n, x)| format!("\"{n}\";v=\"{x}\"")).collect::<Vec<_>>().join(", ");
    let full = brands.iter().map(|(n, x)| format!("\"{n}\";v=\"{x}.0.0.0\"")).collect::<Vec<_>>().join(", ");
    Some(vec![
        ("sec-ch-ua", short),
        ("sec-ch-ua-mobile", if mobile { "?1" } else { "?0" }.into()),
        ("sec-ch-ua-platform", if android { "\"Android\"" } else { "\"Windows\"" }.into()),
        ("sec-ch-ua-full-version-list", full),
        ("sec-ch-ua-platform-version", if android { "\"14.0.0\"" } else { "\"10.0.0\"" }.into()),
        ("sec-ch-ua-model", if android { "\"K\"" } else { "\"\"" }.into()),
    ])
}

/// Accept-Language header for a language id, for example `nl-BE,nl;q=0.9,en;q=0.8`.
pub fn accept_language(language: &str) -> String {
    let list = ACCEPT.iter().find(|a| a.0 == language).map_or(ACCEPT[0].1, |a| a.1);
    list.iter().enumerate().map(|(i, l)| if i == 0 { l.to_string() } else { format!("{l};q={:.1}", 1.0 - i as f64 * 0.1) }).collect::<Vec<_>>().join(",")
}

/// Per-site flags. Built-in entries; user entries in `siteOverrides` win.
const BUILTIN_DESKTOP_INPUT: &[&str] = &["classic.minecraft.net", "minecraft.net"];

/// True when the host (or a parent domain) is marked `desktopInput`, by the user map or the built-ins.
pub fn desktop_input(host: &str, user: &serde_json::Value) -> bool {
    let h = host.to_lowercase();
    let hit = |k: &str| h == k || h.ends_with(&format!(".{k}"));
    if let Some(map) = user.as_object() {
        for (k, v) in map {
            if hit(&k.to_lowercase()) && v.is_object() {
                return v.get("desktopInput").and_then(|x| x.as_bool()).unwrap_or(false);
            }
        }
    }
    BUILTIN_DESKTOP_INPUT.iter().any(|k| hit(k))
}

pub fn defaults() -> serde_json::Value {
    serde_json::json!({
        "search": "", "searchFallback": "DUCKDUCKGO", "darkPages": true, "forceDark": false, "chatScale": 100, "remoteTest": false, "remoteTestAlways": false, "testUnlocked": false, "chatEmojiScale": 150, "httpsOnly": true, "dummyLogin": true, "autoArchiveDays": 14,
        "desktopDefault": true, "routeVps": false, "direct": [], "cookieReject": true, "smartschoolMs": false, "spell": true, "spellAuto": false, "selTranslate": false, "adBlockMode": "browser", "adBlockLevel": "standard", "translateAi": false, "spellLangs": ["en"], "speed": 1,
        "quality": 720, "qualities": {}, "userAgent": "DEFAULT", "lite": [], "compat": [], "language": "EN",
        "pcTabs": false, "pcUnlock": "pinphone", "themeFrom": "newest", "shareHistory": false, "linkShare": { "tabs": true }, "ai": false, "aiAlways": false, "aiAgentMode": "edit", "aiAgentMaxSteps": 20, "aiChatDir": "", "trusted": [], "showRedirectOrigin": false,
        "siteOverrides": {}, "quickSites": [], "quickHidden": [], "dnsRules": [], "searchWords": [], "menuPins": null, "menuGrid": false, "customTheme": null, "savedThemes": [], "themePlugin": "", "autoTop": true, "shortcutNames": true, "startNotes": true, "startPlanner": false, "notesBook": "", "plannerIcs": "", "plannerColors": true, "plannerTz": "", "plannerSlots": "", "plannerPos": "below", "notesPos": "left", "bgHistory": [], "noDummy": [], "totpSkip": [],
        "emojiPicker": true, "claimedThemes": [], "holidayFx": true,
        "betaUnlocked": false, "betaEnabled": false,
        "uiAlpha": 100, "uiBlur": false,
        "theme": "system", "vertTabs": false, "barBottom": false, "vertWidth": 256, "vertCollapsed": true, "historySuggest": true, "ramSaving": true,
        "bg": { "type": "none", "value": "", "dim": 0, "blur": 0 }, "keybinds": {}, "mouse": { "middle": "closeTab", "back": "back", "forward": "forward" },
    })
}

/// The saved prefs: defaults merged with the stored JSON, with the same sanitising as prefs.js.
pub struct Prefs {
    map: serde_json::Map<String, serde_json::Value>,
}

impl Prefs {
    /// `stored` is the JSON text of the saved file, or empty/invalid for a fresh install.
    pub fn load(stored: &str) -> Prefs {
        let mut map = defaults().as_object().cloned().unwrap_or_default();
        if let Ok(serde_json::Value::Object(saved)) = serde_json::from_str(stored) {
            map.extend(saved);
        }
        map.remove("gatedHosts");
        let mut p = Prefs { map };
        let known = |t: &[(&str, &str)], v: &str| t.iter().any(|e| e.0 == v);
        let search = p.str("search").to_string();
        if !search.is_empty() && !known(ENGINES, &search) {
            p.map.insert("search".into(), "".into());
        }
        let fb = p.str("searchFallback").to_string();
        if !known(ENGINES, &fb) || fb == "LODICA" {
            p.map.insert("searchFallback".into(), "DUCKDUCKGO".into());
        }
        if !AGENTS.iter().any(|a| a.0 == p.str("userAgent")) {
            p.map.insert("userAgent".into(), "DEFAULT".into());
        }
        if !known(LANGUAGES, p.str("language")) {
            p.map.insert("language".into(), "EN".into());
        }
        p
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.map).unwrap_or_default()
    }

    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.map.get(key)
    }

    pub fn str(&self, key: &str) -> &str {
        self.map.get(key).and_then(|v| v.as_str()).unwrap_or("")
    }

    fn list(&self, key: &str) -> Vec<String> {
        self.map.get(key).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default()
    }

    /// Sets one pref. False when the key is unknown or the value is rejected; the caller saves and notifies.
    pub fn set(&mut self, key: &str, value: serde_json::Value, holiday_ids: &[&str]) -> bool {
        if !defaults().as_object().is_some_and(|d| d.contains_key(key)) {
            return false;
        }
        if let Some(v) = value.as_str() {
            let ok = match key {
                "search" => v.is_empty() || ENGINES.iter().any(|e| e.0 == v),
                "userAgent" => AGENTS.iter().any(|a| a.0 == v),
                "language" => LANGUAGES.iter().any(|l| l.0 == v),
                // A holiday theme only applies once it has been claimed.
                "theme" => !holiday_ids.contains(&v) || self.list("claimedThemes").iter().any(|c| c == v),
                _ => true,
            };
            if !ok {
                return false;
            }
        } else if matches!(key, "search" | "userAgent" | "language") {
            return false;
        }
        self.map.insert(key.into(), value);
        true
    }

    pub fn quality_for(&self, host: &str) -> Option<u64> {
        let h = bare(host);
        self.map.get("qualities")?.as_object()?.iter().find(|(k, _)| h == k.as_str() || h.ends_with(&format!(".{k}"))).and_then(|(_, v)| v.as_u64())
    }

    pub fn set_quality(&mut self, host: &str, v: Option<u64>) {
        let h = bare(host);
        let h = h.strip_prefix("m.").unwrap_or(h);
        if h.is_empty() {
            return;
        }
        let mut next = self.map.get("qualities").and_then(|q| q.as_object()).cloned().unwrap_or_default();
        match v {
            Some(n) => next.insert(h.into(), n.into()),
            None => next.remove(h),
        };
        self.set("qualities", next.into(), &[]);
    }

    pub fn is_lite(&self, host: &str) -> bool {
        let h = bare(host);
        !h.is_empty() && self.list("lite").iter().any(|x| x == h)
    }

    pub fn toggle_lite(&mut self, host: &str) {
        let h = bare(host).to_string();
        if h.is_empty() {
            return;
        }
        let mut l = self.list("lite");
        if l.contains(&h) { l.retain(|x| *x != h) } else { l.push(h) }
        self.set("lite", l.into(), &[]);
    }

    pub fn is_compat(&self, host: &str) -> bool {
        let h = bare(host);
        !h.is_empty() && (is_forced_compat(h) || matches(h, &self.list("compat")))
    }

    pub fn set_compat(&mut self, host: &str, on: bool) {
        let h = bare(host).to_string();
        let mut l = self.list("compat");
        if h.is_empty() || l.contains(&h) == on {
            return;
        }
        if on { l.push(h) } else { l.retain(|x| *x != h) }
        self.set("compat", l.into(), &[]);
    }

    pub fn is_trusted(&self, host: &str) -> bool {
        let h = bare(host);
        !h.is_empty() && matches(h, &self.list("trusted"))
    }

    pub fn set_trusted(&mut self, host: &str, on: bool) {
        let h = bare(host).to_string();
        if h.is_empty() {
            return;
        }
        let mut l = self.list("trusted");
        if on { if !l.contains(&h) { l.push(h) } } else { l.retain(|x| *x != h) }
        self.set("trusted", l.into(), &[]);
    }

    /// Adds domains that bypass the VPS route. Names without a dot are ignored.
    pub fn add_direct(&mut self, domains: &[&str]) {
        let mut l = self.list("direct");
        let before = l.len();
        for d in domains {
            if d.contains('.') && !l.iter().any(|x| x == d) {
                l.push(d.to_string());
            }
        }
        if l.len() != before {
            self.set("direct", l.into(), &[]);
        }
    }

    pub fn user_agent(&self, chrome_major: &str) -> String {
        user_agent_value(self.str("userAgent"), chrome_major)
    }

    pub fn accept_language(&self) -> String {
        accept_language(self.str("language"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q<'a>(words: &'a [(String, String)]) -> Query<'a> {
        Query { search: "", fallback: "DUCKDUCKGO", language: "EN", words, lodica_available: false }
    }

    #[test]
    fn resolves() {
        let q = q(&[]);
        assert_eq!(resolve("", &q), "about:blank");
        assert_eq!(resolve("HTTPS://a.b/x", &q), "https://a.b/x");
        assert_eq!(resolve("example.com", &q), "https://example.com");
        assert_eq!(resolve("localhost:3000", &q), "http://localhost:3000");
        assert_eq!(resolve("192.168.1.1", &q), "http://192.168.1.1");
        assert_eq!(resolve("cats and dogs", &q), "https://duckduckgo.com/?q=cats%20and%20dogs");
        assert_eq!(resolve("a.b:99999", &q), "https://duckduckgo.com/?q=a%2Eb%3A99999");
    }

    #[test]
    fn engines_and_words() {
        let words = vec![("yt".to_string(), "youtube.com".to_string())];
        let mut qq = q(&words);
        assert_eq!(resolve("YT", &qq), "https://youtube.com");
        qq.lodica_available = true;
        assert_eq!(resolve("hi", &qq), "lodica://search/search.html?q=hi");
        qq.search = "GOOGLE";
        assert_eq!(resolve("hi", &qq), "https://www.google.com/search?q=hi&hl=en");
    }

    #[test]
    fn hosts_and_compat() {
        assert!(is_forced_compat("www.accounts.google.be"));
        assert!(is_forced_compat("x.godaddy.com"));
        assert!(!is_forced_compat("example.com"));
        assert!(matches("a.b.com", &["b.com".to_string()]));
        assert_eq!(search_query("lodica://search/search.html?q=cat"), Some("cat".into()));
    }

    #[test]
    fn hints_and_headers() {
        assert!(client_hints("Mozilla/5.0 Gecko/20100101 Firefox/143.0").is_none());
        let h = client_hints(&default_ua("141")).unwrap();
        assert_eq!(h[0].1, "\"Chromium\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Google Chrome\";v=\"141\"");
        assert_eq!(h[1].1, "?0");
        assert_eq!(h[3].1, "\"Chromium\";v=\"141.0.0.0\", \"Not?A_Brand\";v=\"8.0.0.0\", \"Google Chrome\";v=\"141.0.0.0\"");
        let a = client_hints(AGENTS[1].1.unwrap()).unwrap();
        assert_eq!((a[1].1.as_str(), a[5].1.as_str()), ("?1", "\"K\""));
        assert_eq!(accept_language("NL"), "nl-BE,nl;q=0.9,en;q=0.8");
        assert_eq!(accept_language("EN"), "en-US,en;q=0.9");
        assert_eq!(agent_for("DEFAULT", "141", false, false), AGENTS[1].1.unwrap());
        assert_eq!(agent_for("DEFAULT", "141", false, true), default_ua("141"));
    }

    #[test]
    fn overrides() {
        let none = serde_json::json!({});
        assert!(desktop_input("www.minecraft.net", &none));
        assert!(!desktop_input("example.com", &none));
        let user = serde_json::json!({ "minecraft.net": { "desktopInput": false } });
        assert!(!desktop_input("classic.minecraft.net", &user));
    }

    #[test]
    fn load_sanitises_and_sets() {
        let mut p = Prefs::load(r#"{"search":"NOPE","searchFallback":"LODICA","userAgent":"X","language":"FR","gatedHosts":[1],"speed":2}"#);
        assert_eq!(p.str("search"), "");
        assert_eq!(p.str("searchFallback"), "DUCKDUCKGO");
        assert_eq!(p.str("userAgent"), "DEFAULT");
        assert_eq!(p.str("language"), "EN");
        assert!(p.get("gatedHosts").is_none());
        assert_eq!(p.get("speed").and_then(|v| v.as_u64()), Some(2));
        assert_eq!(Prefs::load("garbage").str("theme"), "system");
        assert!(!p.set("nope", 1.into(), &[]));
        assert!(!p.set("search", "BAD".into(), &[]));
        assert!(!p.set("language", 5.into(), &[]));
        assert!(p.set("search", "GOOGLE".into(), &[]));
        assert!(!p.set("theme", "snow".into(), &["snow"]));
        p.set("claimedThemes", serde_json::json!(["snow"]), &[]);
        assert!(p.set("theme", "snow".into(), &["snow"]));
    }

    #[test]
    fn site_lists() {
        let mut p = Prefs::load("");
        p.set_quality("m.youtube.com", Some(480));
        assert_eq!(p.quality_for("www.youtube.com"), Some(480));
        p.set_quality("youtube.com", None);
        assert_eq!(p.quality_for("youtube.com"), None);
        p.toggle_lite("www.a.com");
        assert!(p.is_lite("a.com"));
        p.toggle_lite("a.com");
        assert!(!p.is_lite("a.com"));
        p.set_compat("b.com", true);
        assert!(p.is_compat("x.b.com") && p.is_compat("accounts.google.com"));
        p.set_trusted("c.com", true);
        p.set_trusted("c.com", true);
        assert_eq!(p.list("trusted").len(), 1);
        p.set_trusted("c.com", false);
        assert!(!p.is_trusted("c.com"));
        p.add_direct(&["d.com", "nodot", "d.com"]);
        assert_eq!(p.list("direct"), vec!["d.com".to_string()]);
    }
}
