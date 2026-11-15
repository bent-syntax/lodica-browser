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

fn strings(a: &Value, k: &str) -> Vec<String> {
    a.get(k).and_then(Value::as_array).map_or(vec![], |v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
}

fn rand_of(a: &Value) -> Vec<u32> {
    a["rand"].as_array().map(|v| v.iter().filter_map(|n| n.as_u64().map(|n| n as u32)).collect()).unwrap_or_default()
}

/// serde_json cannot hold NaN or infinity, so those become null.
fn num_json(n: f64) -> Value {
    if n.is_finite() { json!(n) } else { Value::Null }
}

fn list_of(a: &Value) -> Vec<Value> {
    a.get("list").and_then(Value::as_array).cloned().unwrap_or_default()
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
            "pctabs:sides" => crate::pctabs::sides(s(a, "secret"), a.get("owner").and_then(Value::as_bool).unwrap_or(false)).unwrap_or(Value::Null),
            "pctabs:parseLink" => crate::pctabs::parse_link(s(a, "text")).map_or(Value::Null, |h| json!(h)),
            "pctabs:control" => {
                let old = a.get("old").and_then(Value::as_array).cloned().unwrap_or_default();
                crate::pctabs::control(&a["cmd"], now, &old).map_or(Value::Null, Value::from)
            }
            "pctabs:payload" => json!(crate::pctabs::trim_payload(
                now,
                &a["tabs"],
                &a["chats"],
                a.get("history").filter(|h| !h.is_null()),
                &a["data"],
                a.get("max").and_then(Value::as_u64).map_or(crate::pctabs::MAX, |m| m as usize),
            )),
            "mail:baseDomain" => json!(crate::mailroute::base_domain(s(a, "host"))),
            "mail:code" => crate::mailroute::code_of(s(a, "subject"), s(a, "text"), s(a, "html")).map_or(Value::Null, |c| json!(c)),
            "mail:confirmLink" => crate::mailroute::confirm_link(&strings(a, "links")).map_or(Value::Null, |l| json!(l)),
            "mail:routed" => json!(crate::mailroute::routed(s(a, "url"), s(a, "domain"), &strings(a, "direct"))),
            "mail:aliasSite" => {
                let (base, slug) = crate::mailroute::alias_site(s(a, "host"));
                json!({"base": base, "slug": slug})
            }
            "mail:ownValid" => json!(crate::mailroute::own_valid(s(a, "email"))),
            "mail:cleanDomain" => json!(crate::mailroute::clean_domain(s(a, "domain"))),
            "mail:directHost" => json!(crate::mailroute::direct_host(s(a, "host"), s(a, "domain"), &strings(a, "direct"))),
            "cmd:keyAction" => crate::commands::key_action(&a["map"], s(a, "combo")),
            "cmd:tabCounts" => crate::commands::tab_counts(a["open"].as_array().map_or(&[][..], |v| &v[..]), a["locked"].as_bool().unwrap_or(false)),
            "cmd:topSites" => crate::commands::top_sites(a["private"].as_bool().unwrap_or(false), &a["sites"]),
            "cmd:toggleDesktop" => json!(crate::commands::toggle_desktop(a["desktop"].as_bool())),
            "room:clean" => json!(crate::room::clean(s(a, "name"))),
            "room:dm" => json!(crate::room::dm(s(a, "me"), s(a, "peer"))),
            "room:group" => json!(crate::room::group(s(a, "name"))),
            "room:label" => json!(crate::room::label(s(a, "room"), s(a, "me"))),
            "room:rememberName" => crate::room::remember_name(&strings(a, "names"), s(a, "name")).map_or(Value::Null, |v| json!(v)),
            "room:isMine" => json!(crate::room::is_mine(s(a, "name"), s(a, "current"), &strings(a, "names"))),
            "room:query" => json!(crate::room::room_q(s(a, "room"))),
            "ai:hearthError" => json!(crate::ai::hearth_error(a["code"].as_u64().unwrap_or(0) as u32)),
            "ai:record" => {
                let mut u: crate::ai::Usage = serde_json::from_value(a["usage"].clone()).unwrap_or_default();
                crate::ai::record(&mut u, s(a, "day"), a["input"].as_u64().unwrap_or(0), a["output"].as_u64().unwrap_or(0), s(a, "cut"));
                json!(u)
            }
            "ai:summary" => {
                let u: crate::ai::Usage = serde_json::from_value(a["usage"].clone()).unwrap_or_default();
                crate::ai::summary(&u, s(a, "today"))
            }
            "ai:chatsGet" => json!(crate::ai::chats_get(&list_of(a))),
            "ai:chatAppend" => {
                let mut l = list_of(a);
                let id = crate::ai::chat_append(&mut l, s(a, "id"), s(a, "role"), s(a, "text"), s(a, "newId"), now);
                json!({"list": l, "id": id})
            }
            "ai:chatDelete" => {
                let mut l = list_of(a);
                crate::ai::chat_delete(&mut l, s(a, "id"), now);
                json!(l)
            }
            "ai:chatMerge" => {
                let mut l = list_of(a);
                let changed = crate::ai::chat_merge(&mut l, &a["remote"]);
                json!({"list": l, "changed": changed})
            }
            "helper:sameSite" => json!(crate::helper::same_site(s(a, "a"), s(a, "b"))),
            "helper:password" => json!(crate::helper::password(&rand_of(a))),
            "helper:username" => json!(crate::helper::username(&rand_of(a))),
            "helper:signup" => crate::helper::signup(&rand_of(a)),
            "helper:dictLang" => json!(crate::helper::dict_lang(s(a, "lang"))),
            "helper:dictClean" => json!(crate::helper::dict_clean(s(a, "text"))),
            "instant:calc" => num_json(crate::instant::calc(s(a, "expr"))),
        "instant:convert" => {
            let v = a.get("value").and_then(Value::as_f64).unwrap_or(0.0);
            let from = crate::instant::unit_of(s(a, "from")).unwrap_or("");
            let to = crate::instant::unit_of(s(a, "to")).unwrap_or("");
            num_json(crate::instant::convert(v, from, to))
        }
        "instant:unit" => json!(crate::instant::unit_of(s(a, "text"))),
        "instant:currency" => json!(crate::instant::cur_of(s(a, "text"))),
        "instant:dur" => json!(crate::instant::parse_dur(s(a, "text"))),
        "instant:num" => num_json(crate::instant::num(s(a, "text"))),
        "instant:roman" => match a.get("n").and_then(Value::as_u64) {
            Some(n) => json!(crate::instant::to_roman(n as u32)),
            None => json!(crate::instant::from_roman(s(a, "text"))),
        },
        "instant:holiday" => {
            let year = a.get("year").and_then(Value::as_i64).unwrap_or(2026) as i32;
            match crate::instant::holiday(s(a, "name"), s(a, "lang"), year) {
                Some(h) => json!({"en": h.en, "nl": h.nl, "month": h.month, "day": h.day}),
                None => Value::Null,
            }
        }
        "instant:isoWeek" => {
            let n = |k: &str| a.get(k).and_then(Value::as_i64).unwrap_or(0);
            json!(crate::instant::iso_week(n("y") as i32, n("m") as u32, n("d") as u32))
        }
        "instant:easter" => {
            let (m, d) = crate::instant::easter(a.get("y").and_then(Value::as_i64).unwrap_or(2026) as i32);
            json!([m, d])
        }
        "instant:monthIdx" => json!(crate::instant::month_idx(s(a, "text"))),
        "instant:rint" => {
            let n = |k: &str| a.get(k).and_then(Value::as_i64).unwrap_or(0);
            json!(crate::instant::rint(n("lo"), n("hi"), rand_of(a).first().copied().unwrap_or(0)))
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
    fn commands_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("cmd:toggleDesktop", &json!({"desktop": false}), 0), json!(true));
        assert_eq!(sh.call("cmd:tabCounts", &json!({"open": [{"private": true}, {}], "locked": true}), 0)["privateCount"], json!(1));
        assert_eq!(sh.call("cmd:topSites", &json!({"private": true, "sites": [1]}), 0), json!([]));
        assert_eq!(sh.call("cmd:keyAction", &json!({"map": {"a": "b"}, "combo": "a"}), 0), json!("b"));
    }

    #[test]
    fn room_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("room:dm", &json!({"me": "Zed", "peer": "amy"}), 0), json!("dm:amy|Zed"));
        assert_eq!(sh.call("room:label", &json!({"room": "dm:amy|Zed", "me": "Zed"}), 0), json!("amy"));
        assert_eq!(sh.call("room:rememberName", &json!({"names": ["a"], "name": "a"}), 0), Value::Null);
        assert_eq!(sh.call("room:query", &json!({"room": "grp:x"}), 0), json!("&room=grp%3Ax"));
    }

    #[test]
    fn helper_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("helper:sameSite", &json!({"a": "m.a.com", "b": "a.com"}), 0), json!(true));
        assert_eq!(sh.call("helper:username", &json!({"rand": [0, 1, 5]}), 0), json!("amberBrisk105"));
        assert_eq!(sh.call("helper:password", &json!({"rand": [3, 9]}), 0).as_str().map(str::len), Some(18));
        assert_eq!(sh.call("helper:signup", &json!({"rand": [1, 2, 3]}), 0)["user"], "sammaes13");
        assert_eq!(sh.call("helper:dictLang", &json!({"lang": "xx"}), 0), json!(false));
        assert_eq!(sh.call("helper:dictClean", &json!({"text": "a\r\nb"}), 0), json!("a\nb"));
        assert_eq!(sh.call("instant:calc", &json!({"expr": "2+3*4"}), 0), json!(14.0));
        assert_eq!(sh.call("instant:calc", &json!({"expr": "("}), 0), Value::Null);
        assert_eq!(sh.call("instant:roman", &json!({"n": 14}), 0), json!("XIV"));
    }

    #[test]
    fn ai_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("ai:hearthError", &json!({"code": 500}), 0), json!("Hearth answered 500"));
        let u = sh.call("ai:record", &json!({"day": "2026-01-02", "input": 3, "output": 4, "cut": "2026-01-01"}), 0);
        assert_eq!(sh.call("ai:summary", &json!({"usage": u, "today": "2026-01-02"}), 0)["all"], json!({"r": 1, "i": 3, "o": 4}));
        let r = sh.call("ai:chatAppend", &json!({"list": [], "id": "", "role": "user", "text": "hi", "newId": "c1"}), 7);
        assert_eq!(r["id"], "c1");
        assert_eq!(sh.call("ai:chatsGet", &json!({"list": r["list"]}), 0)[0]["title"], "hi");
        let d = sh.call("ai:chatDelete", &json!({"list": r["list"], "id": "c1"}), 9);
        assert_eq!(sh.call("ai:chatsGet", &json!({"list": d}), 0), json!([]));
        let m = sh.call("ai:chatMerge", &json!({"list": [], "remote": [{"id": "x", "updated": 1, "messages": []}]}), 0);
        assert_eq!(m["changed"], true);
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
    fn pctabs_through_dispatcher() {
        let mut sh = Shell::default();
        let secret: String = (0u8..48).map(|b| format!("{b:02x}")).collect();
        let s = sh.call("pctabs:sides", &json!({"secret": secret, "owner": true}), 0);
        assert_eq!(s["write"], s["base"]);
        assert!(sh.call("pctabs:sides", &json!({"secret": "00", "owner": true}), 0).is_null());
        let link = format!("https://x/{}#{}", s["base"].as_str().unwrap(), s["key"].as_str().unwrap());
        assert_eq!(sh.call("pctabs:parseLink", &json!({"text": link}), 0), json!(secret));
        assert!(sh.call("pctabs:parseLink", &json!({"text": "nope"}), 0).is_null());
        assert!(sh.call("pctabs:control", &json!({"cmd": {"type": "open", "url": "ftp://x"}, "old": []}), 5).is_null());
        let l = sh.call("pctabs:control", &json!({"cmd": {"type": "open", "url": "https://x"}, "old": []}), 5);
        assert_eq!(l[0]["url"], "https://x");
        let p = sh.call("pctabs:payload", &json!({"tabs": [], "chats": [], "data": {}}), 7);
        let v: Value = serde_json::from_str(p.as_str().unwrap()).unwrap();
        assert_eq!(v["updated"], 7);
    }

    #[test]
    fn mailroute_through_dispatcher() {
        let mut sh = Shell::default();
        assert_eq!(sh.call("mail:code", &json!({"subject": "Your code 482913"}), 0), json!("482913"));
        assert_eq!(sh.call("mail:code", &json!({"subject": "Hi"}), 0), Value::Null);
        assert_eq!(sh.call("mail:baseDomain", &json!({"host": "a.example.co.uk"}), 0), json!("example.co.uk"));
        let l = json!({"links": ["https://x/unsubscribe", "https://x/verify?t=1"]});
        assert_eq!(sh.call("mail:confirmLink", &l, 0), json!("https://x/verify?t=1"));
        let r = json!({"url": "https://a.mine.org/", "domain": "lodica.test", "direct": ["mine.org"]});
        assert_eq!(sh.call("mail:routed", &r, 0), json!(false));
        assert_eq!(sh.call("mail:directHost", &json!({"host": "localhost"}), 0), json!(true));
    }

    #[test]
    fn unknown_command() {
        assert_eq!(Shell::default().call("nope", &json!({}), 0)["error"], "unknown command");
    }
}
