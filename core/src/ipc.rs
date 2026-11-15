//! Command dispatcher for the Rust shell: the UI sends `{cmd, args}`, this returns JSON.
//! Pure state, no I/O. The shell passes time and salts in, like the other core modules.
use crate::{linkdata, tabs::Tabs, vault::Vault};
use serde_json::{json, Value};

#[derive(Default)]
pub struct Shell {
    pub vault: Vault,
    pub tabs: Tabs,
}

fn s<'a>(a: &'a Value, k: &str) -> &'a str {
    a.get(k).and_then(Value::as_str).unwrap_or("")
}

impl Shell {
    pub fn call(&mut self, cmd: &str, a: &Value, now: u64) -> Value {
        match cmd {
            "vault:status" => json!({"pinSet": self.vault.pin_set(), "unlocked": self.vault.unlocked(now)}),
            "vault:unlock" => json!(self.vault.unlock(s(a, "pin"), now)),
            "vault:lock" => {
                self.vault.lock();
                json!(true)
            }
            "vault:setPin" => json!(self.vault.set_pin(s(a, "pin"), s(a, "old"), s(a, "salt"), now)),
            "vault:list" => json!(self
                .vault
                .list(now)
                .into_iter()
                .map(|(origin, user, saved)| json!({"origin": origin, "user": user, "saved": saved}))
                .collect::<Vec<_>>()),
            "vault:save" => json!(self.vault.save(s(a, "origin"), s(a, "user"), s(a, "pass"), now)),
            "vault:remove" => json!(self.vault.remove(s(a, "origin"), s(a, "user"), now)),
            "tabs:close" => json!(self.tabs.close(s(a, "id"))),
            "tabs:move" => json!(self.tabs.move_to(s(a, "id"), s(a, "to"))),
            "tabs:archive" => json!(self.tabs.archive(s(a, "id"))),
            "tabs:cycle" => json!(self.tabs.cycle(s(a, "id"), a.get("dir").and_then(Value::as_i64).unwrap_or(1))),
            "tabs:closeAll" => {
                self.tabs.close_all(a.get("private").and_then(Value::as_bool).unwrap_or(false));
                json!(true)
            }
            "totp:migrate" => json!(crate::otpmigration::parse(s(a, "link"))),
            "link:mergePasswords" => linkdata::to_json(linkdata::merge_passwords(&a["local"], &a["remote"])),
            "link:mergeShortcuts" => linkdata::to_json(linkdata::merge_shortcuts(&a["local"], &a["remote"])),
            "link:union" => linkdata::to_json(linkdata::union(&a["local"], &a["remote"], a.get("max").and_then(Value::as_u64).unwrap_or(0) as usize)),
            "link:mergeCharacter" => linkdata::merge_character(&a["local"], &a["remote"]),
            "link:mergeNotes" => linkdata::to_json(linkdata::merge_notes(&a["local"], &a["remote"], now as f64)),
            "link:notesForSync" => {
                json!(linkdata::notes_for_sync(&a["list"], a.get("budget").and_then(Value::as_u64).unwrap_or(200_000) as usize))
            }
            "link:pickSettings" => linkdata::pick_settings(&a["source"], &a["current"]),
            "linkkey:fingerprint" => json!(crate::linkkey::fingerprint(s(a, "joiner"), s(a, "origin"))),
            "serial:originOf" => json!(crate::serial::origin_of(s(a, "url"))),
            "serial:keyOf" => json!(crate::serial::key_of(s(a, "type"), &a["device"])),
            "serial:label" => json!(crate::serial::label(&a["device"])),
            "keys:combo" => {
                let b = |k: &str| a.get(k).and_then(Value::as_bool).unwrap_or(false);
                json!(crate::keys::combo(s(a, "key"), b("ctrl"), b("alt"), b("shift")))
            }
            "keys:valid" => json!(crate::keys::valid(s(a, "combo"))),
            "keys:map" => crate::keys::map(&a["overrides"]),
            "keys:bind" => crate::keys::bind(&a["overrides"], s(a, "id"), &a["combos"]),
            "keys:list" => crate::keys::list(&a["overrides"]),
            "error:url" => json!(crate::errorpage::url(s(a, "code"), s(a, "desc"), s(a, "failed"))),
            "error:html" => json!(crate::errorpage::html(s(a, "url"))),
            "error:isError" => json!(crate::errorpage::is_error_url(s(a, "url"))),
            "error:isAction" => json!(crate::errorpage::is_action_url(s(a, "url"))),
            "error:failedOf" => json!(crate::errorpage::failed_of(s(a, "url"))),
            "error:parseAction" => {
                let (action, url) = crate::errorpage::parse_action(s(a, "url"));
                json!({"action": action, "url": url})
            }
            "aitheme:parse" => crate::aitheme::parse(s(a, "text")).unwrap_or(Value::Null),
            "aitheme:system" => json!(crate::aitheme::SYSTEM),
            "aitheme:textures" => json!(crate::aitheme::TEXTURES),
            "downloads:safeName" => json!(crate::downloads::safe_name(s(a, "name"))),
            "downloads:capIds" => {
                let list = |k: &str| -> Vec<&str> { a[k].as_array().map(|l| l.iter().filter_map(Value::as_str).collect()).unwrap_or_default() };
                json!(crate::downloads::cap_ids(&list("ids"), &list("live")))
            }
            "downloads:uniqueName" => {
                let taken: Vec<&str> = a["taken"].as_array().map(|l| l.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
                json!(crate::downloads::unique_name(s(a, "name"), |n| taken.contains(&n)))
            }
            "suggest:engineKey" => json!(crate::suggest::engine_key(s(a, "search"), s(a, "fallback"))),
            "suggest:url" => json!(crate::suggest::url(s(a, "template"), s(a, "text"), a["private"].as_bool().unwrap_or(false))),
            "suggest:titles" => json!(crate::suggest::titles(&a["body"])),
            "suggest:merge" => crate::suggest::merge_json(&a["hist"], &a["eng"]),
            "keyactions:route" => json!(crate::keyactions::route(s(a, "id"))),
            "keyactions:drawAllowed" => json!(crate::keyactions::draw_allowed(s(a, "url"))),
            "keyactions:hostToggle" => {
                let b = |k: &str| a.get(k).and_then(Value::as_bool).unwrap_or(false);
                crate::keyactions::host_toggle(s(a, "func"), b("trusted"), b("compat"), b("forcedCompat"))
            }
            "tabs:pdfViewerUrl" => json!(crate::tabs::pdf_viewer_url(s(a, "url"))),
            "tabs:splitRects" => crate::tabs::split_rects(
                &a["bounds"],
                a.get("ratio").and_then(Value::as_f64).unwrap_or(0.5),
                a.get("gap").and_then(Value::as_f64).unwrap_or(14.0),
            ),
            "tabs:isHome" => json!(crate::tabs::is_home(s(a, "url"))),
            "tabs:isSettingsUrl" => json!(crate::tabs::is_settings_url(s(a, "url"))),
            "tabs:fallbackIcon" => json!(crate::tabs::fallback_icon(s(a, "url"))),
            "tabs:neighbor" => json!(self.tabs.neighbor(s(a, "id"))),
            "tabs:deleteArchived" => json!(self.tabs.delete_archived(s(a, "id"))),
            "tabs:clearArchived" => {
                self.tabs.clear_archived();
                json!(true)
            }
            "tabs:autoArchive" => {
                let keep: Vec<&str> = a.get("keep").and_then(Value::as_array).map(|v| v.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
                json!(self.tabs.auto_archive(a.get("days").and_then(Value::as_i64).unwrap_or(0), now as i64, &keep))
            }
            _ => json!({"error": "unknown command"}),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_round_trip() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("vault:setPin", &json!({"pin": "1234", "salt": "00ff"}), 0), json!(true));
        assert_eq!(sh.call("vault:lock", &json!({}), 1), json!(true));
        assert_eq!(sh.call("vault:unlock", &json!({"pin": "0000"}), 2), json!(false));
        assert_eq!(sh.call("vault:unlock", &json!({"pin": "1234"}), 3), json!(true));
        sh.call("vault:save", &json!({"origin": "https://a.test", "user": "u", "pass": "p"}), 4);
        let l = sh.call("vault:list", &json!({}), 5);
        assert_eq!(l[0]["origin"], "https://a.test");
    }

    #[test]
    fn migrate_rejects_non_link() {
        assert_eq!(Shell::default().call("totp:migrate", &json!({"link": "https://x"}), 0), json!(null));
    }

    #[test]
    fn link_union_through_dispatcher() {
        let r = Shell::default().call("link:union", &json!({"local": ["a"], "remote": ["a", "b"], "max": 5}), 0);
        assert_eq!((r["list"].clone(), r["changed"].clone()), (json!(["a", "b"]), json!(1)));
    }

    #[test]
    fn notes_and_settings_through_dispatcher() {
        let mut sh = Shell::default();
        let r = sh.call("link:mergeNotes", &json!({"local": [], "remote": [{"id": "a", "text": "hi", "at": 1}]}), 10);
        assert_eq!(r["changed"], 1);
        let r = sh.call("link:pickSettings", &json!({"source": {"theme": "light", "x": 1}, "current": {"theme": "dark"}}), 0);
        assert_eq!(r, json!({"theme": "light"}));
        let r = sh.call("link:mergeCharacter", &json!({"local": null, "remote": {"glyph": "A"}}), 0);
        assert_eq!(r["value"]["glyph"], "A");
        assert!(sh.call("link:notesForSync", &json!({"list": []}), 0).as_array().unwrap().is_empty());
    }

    #[test]
    fn keys_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("keys:combo", &json!({"key": "t", "ctrl": true}), 0), json!("Ctrl+T"));
        assert_eq!(sh.call("keys:valid", &json!({"combo": "Ctrl"}), 0), json!(false));
        assert_eq!(sh.call("keys:map", &json!({}), 0)["F12"], "devtools");
        assert_eq!(sh.call("keys:bind", &json!({"id": "find", "combos": ["F12"]}), 0)["devtools"], json!([]));
        assert_eq!(sh.call("keys:list", &json!({}), 0).as_array().unwrap().len(), 26);
    }

    #[test]
    fn error_page_through_dispatcher() {
        let mut sh = Shell::default();
        let u = sh.call("error:url", &json!({"code": "-102", "desc": "REFUSED", "failed": "https://a.test"}), 0);
        let u = u.as_str().unwrap();
        assert_eq!(sh.call("error:isError", &json!({"url": u}), 0), json!(true));
        assert_eq!(sh.call("error:failedOf", &json!({"url": u}), 0), json!("https://a.test"));
        assert!(sh.call("error:html", &json!({"url": u}), 0).as_str().unwrap().contains("refused"));
        assert_eq!(sh.call("error:parseAction", &json!({"url": "lodica://error/act?a=retry&u=x"}), 0)["action"], "retry");
    }

    #[test]
    fn ai_theme_through_dispatcher() {
        let mut sh = Shell::default();
        let t = sh.call("aitheme:parse", &json!({"text": r##"ok {"bg":"#000000","text":"#ffffff","accent":"#ff0000","accent2":"#00ff00"}"##}), 0);
        assert_eq!(t["accent"], "#FF0000");
        assert_eq!(sh.call("aitheme:parse", &json!({"text": "nothing"}), 0), json!(null));
        assert!(sh.call("aitheme:system", &json!({}), 0).as_str().unwrap().starts_with("You design colour themes"));
        assert_eq!(sh.call("aitheme:textures", &json!({}), 0).as_array().unwrap().len(), 6);
    }

    #[test]
    fn downloads_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("downloads:safeName", &json!({"name": "a:b.txt"}), 0), json!("a_b.txt"));
        let r = sh.call("downloads:uniqueName", &json!({"name": "a.zip", "taken": ["a.zip"]}), 0);
        assert_eq!(r, json!("a (1).zip"));
        let ids: Vec<String> = (0..201).map(|i| format!("d{i}")).collect();
        let r = sh.call("downloads:capIds", &json!({"ids": ids, "live": []}), 0);
        assert_eq!(r.as_array().unwrap().len(), 200);
    }

    #[test]
    fn tabs_helpers_through_dispatcher() {
        let mut sh = Shell::default();
        let v = sh.call("tabs:pdfViewerUrl", &json!({"url": "https://a.com/x.pdf"}), 0);
        assert!(v.as_str().unwrap().starts_with("lodica://pdf/web/viewer.html?file="));
        assert_eq!(sh.call("tabs:pdfViewerUrl", &json!({"url": "https://a.com/"}), 0), Value::Null);
        let r = sh.call("tabs:splitRects", &json!({"bounds": {"x": 0, "y": 0, "width": 114, "height": 50}, "ratio": 0.5}), 0);
        assert_eq!(r["a"]["width"], 50.0);
        assert_eq!(r["b"]["x"], 64.0);
        assert_eq!(sh.call("tabs:isHome", &json!({"url": "about:blank"}), 0), json!(true));
        assert_eq!(sh.call("tabs:isSettingsUrl", &json!({"url": "lodica://settings"}), 0), json!(true));
        assert_eq!(sh.call("tabs:fallbackIcon", &json!({"url": "https://a.com/p"}), 0), json!("https://a.com/favicon.ico"));
        assert_eq!(sh.call("tabs:autoArchive", &json!({"days": 0, "keep": []}), 0), json!([]));
        assert_eq!(sh.call("tabs:neighbor", &json!({"id": "zz"}), 0), Value::Null);
        assert_eq!(sh.call("tabs:deleteArchived", &json!({"id": "zz"}), 0), json!(false));
        assert_eq!(sh.call("tabs:clearArchived", &json!({}), 0), json!(true));
    }

    #[test]
    fn unknown_command() {
        assert_eq!(Shell::default().call("nope", &json!({}), 0)["error"], "unknown command");
    }
}
