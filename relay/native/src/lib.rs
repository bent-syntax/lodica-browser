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
