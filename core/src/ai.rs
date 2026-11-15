//! Pure parts of desktop/main/ai.js: Hearth error messages, usage counters and the chat list (append, delete, merge, limits).

use crate::room::cut16;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const MAX_CHATS: usize = 100;
const MAX_MSGS: usize = 200;

/// Maps a Hearth status code to a message.
pub fn hearth_error(code: u32) -> String {
    match code {
        401 => "Hearth refused the key. Check it in Settings > AI.".into(),
        403 => "Hearth key may not use that model.".into(),
        429 => "Hearth is busy or the key hit its limit. Try again soon.".into(),
        502 | 504 => "Hearth could not answer. Try again.".into(),
        _ => format!("Hearth answered {code}"),
    }
}

#[derive(Default, Clone, Copy, Serialize, Deserialize, Debug, PartialEq)]
pub struct Counts {
    #[serde(default)]
    pub r: u64,
    #[serde(default)]
    pub i: u64,
    #[serde(default)]
    pub o: u64,
}

impl Counts {
    fn add(&mut self, input: u64, output: u64) {
        self.r += 1;
        self.i += input;
        self.o += output;
    }
}

#[derive(Default, Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Usage {
    #[serde(default)]
    pub days: BTreeMap<String, Counts>,
    #[serde(default)]
    pub all: Counts,
}

/// Counts one request on `day` (YYYY-MM-DD) and drops days older than `cut`.
pub fn record(u: &mut Usage, day: &str, input: u64, output: u64, cut: &str) {
    u.days.entry(day.into()).or_default().add(input, output);
    u.all.add(input, output);
    u.days.retain(|d, _| d.as_str() >= cut);
}

/// Totals for `today`, the kept days (the month) and all time.
pub fn summary(u: &Usage, today: &str) -> Value {
    let mut month = Counts::default();
    for d in u.days.values() {
        month.r += d.r;
        month.i += d.i;
        month.o += d.o;
    }
    json!({"today": u.days.get(today).copied().unwrap_or_default(), "month": month, "all": u.all})
}

fn num(v: &Value, k: &str) -> f64 {
    v.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

fn text_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}

fn role_of(role: &str) -> &'static str {
    if role == "assistant" { "assistant" } else { "user" }
}

/// Drops the least recently updated chats until at most MAX_CHATS remain.
fn prune(list: &mut Vec<Value>) {
    if list.len() > MAX_CHATS {
        list.sort_by(|a, b| num(a, "updated").total_cmp(&num(b, "updated")));
        list.drain(..list.len() - MAX_CHATS);
    }
}

/// Live chats newest first, without the deleted ones.
pub fn chats_get(list: &[Value]) -> Vec<Value> {
    let mut v: Vec<Value> = list
        .iter()
        .filter(|c| !c.get("deleted").and_then(Value::as_bool).unwrap_or(false))
        .map(|c| json!({"id": c["id"], "title": c["title"], "updated": c["updated"], "messages": c["messages"]}))
        .collect();
    v.sort_by(|a, b| num(b, "updated").total_cmp(&num(a, "updated")));
    v
}

/// Stores one message. Creates the chat when `id` is empty or gone, using `new_id`. Returns the chat id.
pub fn chat_append(list: &mut Vec<Value>, id: &str, role: &str, text: &str, new_id: &str, now: u64) -> String {
    let text = cut16(text.trim(), 4000);
    let at = list.iter().position(|c| c["id"] == id && !c.get("deleted").and_then(Value::as_bool).unwrap_or(false));
    let at = at.unwrap_or_else(|| {
        list.push(json!({"id": new_id, "title": cut16(&text, 48), "updated": now, "messages": []}));
        list.len() - 1
    });
    let cid = text_of(&list[at], "id");
    if text.is_empty() {
        return cid;
    }
    if let Some(m) = list[at]["messages"].as_array_mut() {
        m.push(json!({"role": role_of(role), "text": text, "t": now}));
        if m.len() > MAX_MSGS {
            m.drain(..m.len() - MAX_MSGS);
        }
    }
    list[at]["updated"] = json!(now);
    prune(list);
    cid
}

/// Replaces the chat with a tombstone so the deletion syncs to the phone.
pub fn chat_delete(list: &mut [Value], id: &str, now: u64) {
    if let Some(c) = list.iter_mut().find(|c| c["id"] == id) {
        *c = json!({"id": id, "deleted": true, "updated": now, "title": "", "messages": []});
    }
}

// shortcut: `deleted` counts only when it is a JSON bool, JS also accepts any truthy value; fine for data written by this app.
/// Merges a copy from the phone: the newest `updated` wins per chat id, tombstones included. True when something changed.
pub fn chat_merge(list: &mut Vec<Value>, remote: &Value) -> bool {
    let Some(remote) = remote.as_array() else { return false };
    let mut changed = false;
    for r in remote.iter().take(MAX_CHATS) {
        let Some(id) = r.get("id").and_then(Value::as_str) else { continue };
        let Some(msgs) = r.get("messages").and_then(Value::as_array) else { continue };
        let msgs: Vec<&Value> = msgs.iter().filter(|m| m.is_object()).collect();
        let updated = num(r, "updated");
        let mine = list.iter().position(|c| c["id"] == id);
        if mine.is_some_and(|i| num(&list[i], "updated") >= updated) {
            continue;
        }
        let keep = msgs.len().saturating_sub(MAX_MSGS);
        let next = json!({
            "id": id,
            "title": cut16(&text_of(r, "title"), 80),
            "updated": updated,
            "deleted": r.get("deleted").and_then(Value::as_bool).unwrap_or(false),
            "messages": msgs[keep..].iter().map(|m| json!({
                "role": role_of(m.get("role").and_then(Value::as_str).unwrap_or("")),
                "text": cut16(&text_of(m, "text"), 8000),
                "t": num(m, "t"),
            })).collect::<Vec<_>>(),
        });
        match mine {
            Some(i) => list[i] = next,
            None => list.push(next),
        }
        changed = true;
    }
    prune(list);
    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hearth_messages() {
        assert!(hearth_error(401).starts_with("Hearth refused"));
        assert_eq!(hearth_error(504), hearth_error(502));
        assert_eq!(hearth_error(500), "Hearth answered 500");
    }

    #[test]
    fn usage_counts_and_prunes() {
        let mut u = Usage::default();
        record(&mut u, "2026-01-01", 5, 7, "2025-12-01");
        record(&mut u, "2026-01-02", 1, 2, "2025-12-01");
        record(&mut u, "2026-01-02", 1, 2, "2026-01-02");
        assert_eq!(u.days.len(), 1);
        let s = summary(&u, "2026-01-02");
        assert_eq!(s["today"], json!({"r": 2, "i": 2, "o": 4}));
        assert_eq!(s["month"], s["today"]);
        assert_eq!(s["all"], json!({"r": 3, "i": 7, "o": 11}));
        assert_eq!(summary(&u, "2030-01-01")["today"], json!({"r": 0, "i": 0, "o": 0}));
    }

    #[test]
    fn append_creates_and_limits() {
        let mut l = vec![];
        let id = chat_append(&mut l, "", "assistant", "  hello  ", "n1", 10);
        assert_eq!(id, "n1");
        assert_eq!(l[0]["title"], "hello");
        assert_eq!(chat_append(&mut l, "n1", "x", "again", "n2", 20), "n1");
        assert_eq!(l[0]["messages"][1]["role"], "user");
        assert_eq!(chat_append(&mut l, "n1", "user", "  ", "n3", 30), "n1");
        assert_eq!(l[0]["updated"], 20);
        for i in 0..110 {
            chat_append(&mut l, "", "user", "q", &format!("c{i}"), 100 + i);
        }
        assert_eq!(l.len(), 100);
        assert!(l.iter().all(|c| c["id"] != "n1"));
    }

    #[test]
    fn delete_and_get() {
        let mut l = vec![];
        chat_append(&mut l, "", "user", "a", "a", 1);
        chat_append(&mut l, "", "user", "b", "b", 2);
        assert_eq!(chats_get(&l)[0]["id"], "b");
        chat_delete(&mut l, "b", 5);
        let g = chats_get(&l);
        assert_eq!((g.len(), g[0]["id"].clone()), (1, json!("a")));
        assert_eq!(l[1]["deleted"], true);
    }

    #[test]
    fn merge_newest_wins() {
        let mut l = vec![];
        chat_append(&mut l, "", "user", "mine", "a", 10);
        let remote = json!([
            {"id": "a", "title": "old", "updated": 5, "messages": []},
            {"id": "b", "title": "new", "updated": 7, "messages": [{"role": "assistant", "text": "hi", "t": 3}, 4]},
            {"id": 3, "messages": []},
            {"id": "c"}
        ]);
        assert!(chat_merge(&mut l, &remote));
        assert_eq!(l.len(), 2);
        assert_eq!(l[0]["title"], "mine");
        assert_eq!(l[1]["messages"], json!([{"role": "assistant", "text": "hi", "t": 3.0}]));
        let newer = json!([{"id": "a", "title": "t", "updated": 11, "deleted": true, "messages": []}]);
        assert!(chat_merge(&mut l, &newer));
        assert_eq!(chats_get(&l).len(), 1);
        assert!(!chat_merge(&mut l, &json!("nope")));
    }
}
