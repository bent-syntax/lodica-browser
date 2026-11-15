//! Command dispatcher for the Rust shell: the UI sends `{cmd, args}`, this returns JSON.
//! Pure state, no I/O. The shell passes time and salts in, like the other core modules.
use crate::{tabs::Tabs, vault::Vault};
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
    fn unknown_command() {
        assert_eq!(Shell::default().call("nope", &json!({}), 0)["error"], "unknown command");
    }
}
