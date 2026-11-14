//! Site permission rules, ported from desktop/main/perms.js (pure parts only).
use std::collections::HashMap;

const ALLOW: &[&str] = &[
    "fullscreen", "clipboard-sanitized-write", "pointerLock", "mediaKeySystem",
    "persistent-storage", "screen-wake-lock", "serial", "usb", "hid", "fileSystem",
];

pub fn always_allowed(permission: &str) -> bool {
    ALLOW.contains(&permission)
}

pub fn host_of(u: &str) -> String {
    url::Url::parse(u)
        .ok()
        .and_then(|p| p.host_str().map(|h| h.strip_prefix("www.").unwrap_or(h).to_string()))
        .unwrap_or_default()
}

/// Returns (key, prompt title), or None when the permission is not prompted.
pub fn describe(permission: &str, h: &str, video: bool, audio: bool) -> Option<(String, String)> {
    let (k, t) = match permission {
        "geolocation" => ("geo".to_string(), format!("Share your location with {h}?")),
        "notifications" => ("notify".into(), format!("Allow {h} to send notifications?")),
        "clipboard-read" => ("clipboard".into(), format!("Let {h} read your clipboard?")),
        "display-capture" => ("screen".into(), format!("Allow {h} to see your screen?")),
        "storage-access" | "top-level-storage-access" => {
            ("storage".into(), format!("Let an embedded site use cookies on {h}?"))
        }
        "local-network-access" | "local-network" | "loopback-network" => {
            ("local".into(), format!("Allow {h} to reach devices on your network?"))
        }
        "media" => {
            if !video && !audio {
                return None;
            }
            let what = match (video, audio) {
                (true, true) => "camera and microphone",
                (true, false) => "camera",
                _ => "microphone",
            };
            (format!("media:{video}:{audio}"), format!("Allow {h} to use your {what}?"))
        }
        _ => return None,
    };
    Some((k, t))
}

pub fn id(h: &str, key: &str) -> String {
    format!("{h}|{key}")
}

/// Silent check against saved (and, for private tabs, temporary) answers.
pub fn check(
    saved: &HashMap<String, bool>,
    temp: Option<&HashMap<String, bool>>,
    permission: &str,
    origin: &str,
    media_video: Option<bool>,
) -> bool {
    if always_allowed(permission) {
        return true;
    }
    let h = host_of(origin);
    if h.is_empty() {
        return false;
    }
    let cam = media_video == Some(true);
    let mv = media_video.map(|v| (v, !v)).unwrap_or((false, false));
    let Some((key, _)) = describe(permission, &h, mv.0, mv.1) else { return false };
    let get = |k: &str| temp.and_then(|t| t.get(k)).or_else(|| saved.get(k)).copied();
    if permission == "media" {
        let pre = format!("{h}|media:");
        let mut keys: Vec<&String> = saved.keys().collect();
        if let Some(t) = temp {
            keys.extend(t.keys());
        }
        return keys.into_iter().any(|k| {
            k.strip_prefix(&pre).is_some_and(|rest| {
                get(k) == Some(true) && rest.split(':').nth(if cam { 0 } else { 1 }) == Some("true")
            })
        });
    }
    let i = id(&h, &key);
    if temp.is_some() { get(&i) == Some(true) } else { saved.get(&i) == Some(&true) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts() {
        assert_eq!(host_of("https://www.example.com/a"), "example.com");
        assert_eq!(host_of("nope"), "");
    }

    #[test]
    fn describes() {
        assert_eq!(describe("geolocation", "a.com", false, false).unwrap().0, "geo");
        assert!(describe("media", "a.com", false, false).is_none());
        assert_eq!(describe("media", "a.com", true, true).unwrap().0, "media:true:true");
        assert!(describe("bogus", "a.com", false, false).is_none());
    }

    #[test]
    fn checks() {
        let mut s = HashMap::new();
        s.insert("a.com|geo".to_string(), true);
        s.insert("a.com|media:true:false".to_string(), true);
        assert!(check(&s, None, "fullscreen", "", None));
        assert!(check(&s, None, "geolocation", "https://a.com/", None));
        assert!(!check(&s, None, "notifications", "https://a.com/", None));
        assert!(check(&s, None, "media", "https://a.com/", Some(true)));
        assert!(!check(&s, None, "media", "https://a.com/", Some(false)));
        let mut t = HashMap::new();
        t.insert("b.com|geo".to_string(), true);
        assert!(check(&s, Some(&t), "geolocation", "https://b.com/", None));
        assert!(!check(&s, None, "geolocation", "https://b.com/", None));
    }
}
