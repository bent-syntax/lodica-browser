//! Keybound action routing and per-host toggles, ported from desktop/main/commands.js (UI_ACTIONS, runKey, hostToggle).
//! shortcut: only the decision is here, the shell still performs the effect on tabs, prefs and webContents.
use serde_json::{json, Value};

const UI: [&str; 11] = ["address", "find", "switcher", "menu", "settings", "history", "downloads", "passwords", "notebook", "chat", "assistant"];
const SHELL: [&str; 16] = [
    "newTab", "newPrivate", "undoClose", "closeTab", "nextTab", "prevTab", "reload", "hardReload", "back", "forward", "devtools", "osk", "toggleVertical", "draw", "move", "toggleSplit",
];

/// Where an action id runs: the renderer ("ui"), the shell ("shell") or nowhere ("none").
pub fn route(id: &str) -> &'static str {
    if UI.contains(&id) {
        "ui"
    } else if SHELL.contains(&id) {
        "shell"
    } else {
        "none"
    }
}

/// Draw and move only work on http(s) pages.
pub fn draw_allowed(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// Pref change for a per-host toggle (`shield`, `lite`, `compat`), or null when nothing should change.
pub fn host_toggle(func: &str, trusted: bool, compat: bool, forced_compat: bool) -> Value {
    match func {
        "shield" => json!({"op": "setTrusted", "value": !trusted}),
        "lite" => json!({"op": "toggleLite"}),
        "compat" if !forced_compat => json!({"op": "setCompat", "value": !compat}),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::Shell;

    #[test]
    fn routes_and_toggles_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("keyactions:route", &json!({"id": "find"}), 0), json!("ui"));
        assert_eq!(sh.call("keyactions:route", &json!({"id": "newTab"}), 0), json!("shell"));
        assert_eq!(sh.call("keyactions:route", &json!({"id": "bogus"}), 0), json!("none"));
        assert_eq!(sh.call("keyactions:drawAllowed", &json!({"url": "https://a.test"}), 0), json!(true));
        assert_eq!(sh.call("keyactions:drawAllowed", &json!({"url": "lodica://x"}), 0), json!(false));
        let r = sh.call("keyactions:hostToggle", &json!({"func": "shield", "trusted": true}), 0);
        assert_eq!(r, json!({"op": "setTrusted", "value": false}));
        let r = sh.call("keyactions:hostToggle", &json!({"func": "compat", "compat": false}), 0);
        assert_eq!(r, json!({"op": "setCompat", "value": true}));
        assert!(sh.call("keyactions:hostToggle", &json!({"func": "compat", "forcedCompat": true}), 0).is_null());
        assert!(sh.call("keyactions:hostToggle", &json!({"func": "x"}), 0).is_null());
        assert_eq!(sh.call("keyactions:hostToggle", &json!({"func": "lite"}), 0)["op"], "toggleLite");
    }

    #[test]
    fn every_listed_key_action_routes() {
        assert!(UI.iter().chain(SHELL.iter()).all(|id| route(id) != "none"));
    }
}
