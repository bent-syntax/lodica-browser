//! Pure parts of desktop/main/commands.js: key action lookup, init payload counts, top sites and desktop toggle.

use serde_json::{json, Value};

/// combo -> action id from a key map built by `keys::map`.
pub fn key_action(map: &Value, combo: &str) -> Value {
    map.get(combo).filter(|v| v.is_string()).cloned().unwrap_or(Value::Null)
}

/// Tab counts shown in the init payload: normal, private, and whether the private tabs are locked.
pub fn tab_counts(open: &[Value], locked: bool) -> Value {
    let private = open.iter().filter(|t| t["private"].as_bool().unwrap_or(false)).count();
    json!({
        "count": open.len() - private,
        "privateCount": private,
        "locked": locked && private > 0,
    })
}

/// Private tabs never feed top sites.
pub fn top_sites(private: bool, sites: &Value) -> Value {
    if private { json!([]) } else { sites.clone() }
}

/// Desktop mode flips on `false` only: unset or true becomes false, false becomes true.
pub fn toggle_desktop(desktop: Option<bool>) -> bool {
    desktop == Some(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_split_private() {
        let open = [json!({"private": true}), json!({}), json!({"private": false})];
        let c = tab_counts(&open, true);
        assert_eq!((c["count"].as_u64(), c["privateCount"].as_u64(), c["locked"].as_bool()), (Some(2), Some(1), Some(true)));
        assert_eq!(tab_counts(&open[1..], true)["locked"], json!(false));
    }

    #[test]
    fn toggle_and_sites() {
        assert!(toggle_desktop(Some(false)));
        assert!(!toggle_desktop(Some(true)));
        assert!(!toggle_desktop(None));
        assert_eq!(top_sites(true, &json!([1])), json!([]));
        assert_eq!(top_sites(false, &json!([1])), json!([1]));
    }

    #[test]
    fn key_lookup() {
        let m = json!({"Ctrl+T": "tab:new"});
        assert_eq!(key_action(&m, "Ctrl+T"), json!("tab:new"));
        assert_eq!(key_action(&m, "Ctrl+Q"), Value::Null);
    }
}
