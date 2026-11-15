//! Internal error page (lodica://error/), ported from desktop/main/errorpage.js.
//! shortcut: the crash log file write stays in the shell, it is plain I/O.
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use url::Url;

const PREFIX: &str = "lodica://error/";
const ACT: &str = "lodica://error/act";

// Same unreserved set as JS encodeURIComponent.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'!').remove(b'~').remove(b'*').remove(b'\'').remove(b'(').remove(b')');

pub(crate) fn enc(s: &str) -> String {
    utf8_percent_encode(s, COMPONENT).to_string()
}

fn esc(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '&' => "&amp;".to_string(),
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '"' => "&quot;".to_string(),
            '\'' => "&#39;".to_string(),
            c => c.to_string(),
        })
        .collect()
}

fn hint(code: &str) -> &'static str {
    match code {
        "-105" => "The server name could not be resolved. Check the address and your connection.",
        "-106" => "You appear to be offline.",
        "-102" => "The server refused the connection.",
        "-118" => "The connection timed out.",
        "-200" | "-202" | "-501" => "The site's certificate is not trusted.",
        "-201" => "Your system clock may be wrong, or the certificate is not valid yet.",
        "-310" => "The site redirected too many times.",
        "-324" => "The server closed the connection without sending data.",
        _ => "The page could not be loaded.",
    }
}

fn param(u: &str, k: &str) -> String {
    Url::parse(u)
        .ok()
        .and_then(|p| p.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned()))
        .unwrap_or_default()
}

fn link(a: &str, u: &str, label: &str, cls: &str) -> String {
    format!("<a class=\"{cls}\" href=\"{ACT}?a={a}&u={}\">{label}</a>", enc(u))
}

/// Error page URL for a failed load.
pub fn url(code: &str, desc: &str, failed: &str) -> String {
    format!("{PREFIX}?c={}&d={}&u={}", enc(code), enc(desc), enc(failed))
}

pub fn is_error_url(u: &str) -> bool {
    u.starts_with(PREFIX) && !u.starts_with(ACT)
}

pub fn is_action_url(u: &str) -> bool {
    u.starts_with(ACT)
}

pub fn failed_of(u: &str) -> String {
    param(u, "u")
}

/// (action, url) from an action link.
pub fn parse_action(u: &str) -> (String, String) {
    (param(u, "a"), param(u, "u"))
}

pub fn html(u: &str) -> String {
    let (code, desc, failed) = (param(u, "c"), param(u, "d"), param(u, "u"));
    let desc = if desc.is_empty() { "ERR" } else { &desc };
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Page not loaded</title>
<style>
body{{font:15px system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f6f6f7;color:#222}}
main{{max-width:560px;padding:32px}}
h1{{font-size:22px;margin:0 0 8px}}
p{{margin:6px 0;line-height:1.45}}
code{{background:#e8e8ea;padding:1px 6px;border-radius:4px;word-break:break-all}}
.btns{{margin-top:20px;display:flex;gap:8px;flex-wrap:wrap}}
a{{padding:8px 14px;border-radius:8px;text-decoration:none;border:1px solid #bbb;color:#222;background:#fff}}
a.pri{{background:#2563eb;border-color:#2563eb;color:#fff}}
@media(prefers-color-scheme:dark){{body{{background:#1c1c1e;color:#eee}}code{{background:#333}}a{{background:#2a2a2c;color:#eee;border-color:#555}}}}
</style></head><body><main>
<h1>This page did not load</h1>
<p>{}</p>
<p><code>{}</code> (code {})</p>
<p><code>{}</code></p>
<div class="btns">
{}
{}
{}
</div></main></body></html>"#,
        esc(hint(&code)),
        esc(desc),
        esc(&code),
        esc(&failed),
        link("retry", &failed, "Retry", "pri"),
        link("noblock", &failed, "Try without blockers", ""),
        link("external", &failed, "Open in system browser", ""),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_round_trip() {
        let u = url("-105", "NAME_NOT_RESOLVED", "https://a.test/x?y=1&z=é");
        assert!(is_error_url(&u) && !is_action_url(&u));
        assert_eq!(failed_of(&u), "https://a.test/x?y=1&z=é");
        assert_eq!(param(&u, "c"), "-105");
    }

    #[test]
    fn action_links() {
        let a = format!("{ACT}?a=retry&u={}", enc("https://a.test/?q=1"));
        assert!(is_action_url(&a) && !is_error_url(&a));
        assert_eq!(parse_action(&a), ("retry".into(), "https://a.test/?q=1".into()));
        assert_eq!(parse_action("nope"), (String::new(), String::new()));
    }

    #[test]
    fn page_escapes_and_hints() {
        let h = html(&url("-106", "<b>", "https://a.test/\"x\""));
        assert!(h.contains("You appear to be offline."));
        assert!(h.contains("&lt;b&gt;") && h.contains("&quot;x&quot;"));
        assert!(h.contains("a=retry&u=https%3A%2F%2Fa.test%2F%22x%22"));
        let h = html("garbage");
        assert!(h.contains("The page could not be loaded.") && h.contains("<code>ERR</code>"));
    }
}
