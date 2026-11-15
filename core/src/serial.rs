//! Pure parts of desktop/main/serial.js: device grant keys, origins and picker labels.
//! shortcut: the grant store and the Chromium picker hooks stay in the shell.
use serde_json::Value;
use url::Url;

/// Origin of a page URL; "file://" for files, empty when it does not parse.
pub fn origin_of(u: &str) -> String {
    match Url::parse(u) {
        Ok(x) if x.scheme() == "file" => "file://".into(),
        Ok(x) => x.origin().ascii_serialization(),
        Err(_) => String::new(),
    }
}

fn part(d: &Value, k: &str) -> String {
    match d.get(k) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// "type:vendor:product:serial:port" like the JS, port falling back to name.
pub fn key_of(kind: &str, d: &Value) -> String {
    // JS `??`: only a missing or null portName falls back to name
    let port = if d.get("portName").map_or(true, Value::is_null) { part(d, "name") } else { part(d, "portName") };
    [kind.to_string(), part(d, "vendorId"), part(d, "productId"), part(d, "serialNumber"), port].join(":")
}

/// Picker text for a device.
pub fn label(d: &Value) -> String {
    let n = ["displayName", "productName", "name", "portName"]
        .iter()
        .map(|k| part(d, k))
        .find(|v| !v.is_empty())
        .unwrap_or_else(|| "Unknown device".into());
    let port = part(d, "portName");
    if !port.is_empty() && !n.contains(&port) { format!("{n} ({port})") } else { n }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn origins() {
        assert_eq!(origin_of("https://a.com:8080/x"), "https://a.com:8080");
        assert_eq!(origin_of("file:///tmp/a"), "file://");
        assert_eq!(origin_of("nope"), "");
    }

    #[test]
    fn keys_and_labels() {
        let d = json!({"vendorId": 1, "productId": 2, "name": "Pad"});
        assert_eq!(key_of("usb", &d), "usb:1:2::Pad");
        assert_eq!(label(&json!({"productName": "Uno", "portName": "COM3"})), "Uno (COM3)");
        assert_eq!(label(&json!({"name": "COM3 board", "portName": "COM3"})), "COM3 board");
        assert_eq!(label(&json!({})), "Unknown device");
    }
}
