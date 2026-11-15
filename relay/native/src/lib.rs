use napi_derive::napi;

#[napi]
pub fn wants_fresh(q: String) -> bool {
    lodica_core::wants_fresh(&q)
}

#[napi]
pub fn host(u: String) -> String {
    lodica_core::host(&u)
}

/// Input order of the items, recent ones first; `dates` holds each item's `d` field ('' when absent).
#[napi]
pub fn fresh_order(dates: Vec<String>, now_ms: f64) -> Vec<u32> {
    let idx: Vec<u32> = (0..dates.len() as u32).collect();
    lodica_core::fresh_first(
        idx,
        |i| Some(dates[*i as usize].clone()).filter(|d| !d.is_empty()),
        now_ms as i64,
    )
}

/// Indices of `urls` not in `have` and not repeated earlier in `urls`.
#[napi]
pub fn unseen(have: Vec<String>, urls: Vec<String>) -> Vec<u32> {
    lodica_core::unseen(&have, &urls)
}

#[napi]
pub fn b64u(s: String) -> String {
    lodica_core::relayapi::b64u(&s)
}

/// Maildir file name behind a mail id, null when the id is not valid.
#[napi]
pub fn mail_id_decode(id: String) -> Option<String> {
    lodica_core::relayapi::mail_id_decode(&id)
}

/// `since` in ms, 0 when absent, -1 when unparseable.
#[napi]
pub fn parse_since(v: String) -> f64 {
    lodica_core::relayapi::parse_since(&v).map_or(-1.0, |n| n as f64)
}

#[napi]
pub fn local_of(addr: String, domain: String) -> String {
    lodica_core::relayapi::local_of(&addr, &domain)
}

#[napi]
pub fn unescape_part(v: String) -> String {
    lodica_core::relayapi::unescape_part(&v)
}

#[napi]
pub fn pair_code(r: Vec<u8>) -> String {
    lodica_core::relayapi::pair_code(&r)
}

#[napi]
pub fn pair_link(link: String) -> Option<String> {
    lodica_core::relayapi::pair_link(&link)
}

static SHELL: std::sync::Mutex<Option<lodica_core::ipc::Shell>> = std::sync::Mutex::new(None);

/// Runs one dispatcher command: `args` and the result are JSON text.
#[napi]
pub fn call(cmd: String, args: String, now_ms: f64) -> String {
    let a: serde_json::Value = serde_json::from_str(&args).unwrap_or_default();
    let mut g = SHELL.lock().unwrap_or_else(|e| e.into_inner());
    g.get_or_insert_with(Default::default).call(&cmd, &a, now_ms as u64).to_string()
}
