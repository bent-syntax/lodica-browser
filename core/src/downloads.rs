//! File naming for downloads, ported from desktop/main/downloads.js (`uniquePath`).
//! The shell checks the disk; this only decides which names to try.

/// A file name that is safe on every OS: reserved characters become `_`, at most 180 chars.
// shortcut: counts chars, JS counts UTF-16 units; differs only for astral characters, fine for a name cap.
pub fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c })
        .take(180)
        .collect();
    if s.is_empty() { "download".into() } else { s }
}

/// Splits at the last dot like `path.extname`: a leading dot or no dot gives no extension.
fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => name.split_at(i),
        _ => (name, ""),
    }
}

/// First of `name`, `name (1).ext`, `name (2).ext`, ... that `taken` does not claim.
pub fn unique_name(name: &str, taken: impl Fn(&str) -> bool) -> String {
    let safe = safe_name(name);
    let (base, ext) = split_ext(&safe);
    let mut p = safe.clone();
    let mut n = 1;
    while taken(&p) {
        p = format!("{base} ({n}){ext}");
        n += 1;
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_names() {
        assert_eq!(safe_name("a/b:c?.txt"), "a_b_c_.txt");
        assert_eq!(safe_name(""), "download");
        assert_eq!(safe_name(&"x".repeat(300)).len(), 180);
    }

    #[test]
    fn numbers_duplicates() {
        let have = ["a.tar.gz", "a.tar (1).gz", ".env"];
        let t = |n: &str| have.contains(&n);
        assert_eq!(unique_name("a.tar.gz", t), "a.tar (2).gz");
        assert_eq!(unique_name(".env", t), ".env (1)");
        assert_eq!(unique_name("new.zip", t), "new.zip");
    }
}
