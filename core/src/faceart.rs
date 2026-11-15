//! Costume characters: a tiny SVG subset, ported from desktop/main/faceart.js.
//! Anything outside the allowlist is dropped, so the result is safe to show as an image on any client.
use regex::Regex;
use std::sync::OnceLock;

const MAX_IN: usize = 6000;
const MAX_OUT: usize = 2400;
const MAX_SHAPES: usize = 40;
const HEAD: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">"#;

struct Re {
    tag: Regex,
    attr: Regex,
    num: Regex,
    color: Regex,
    unit: Regex,
    path: Regex,
    points: Regex,
}

fn re() -> &'static Re {
    static RE: OnceLock<Re> = OnceLock::new();
    RE.get_or_init(|| Re {
        tag: Regex::new(r#"<\s*([a-zA-Z]+)((?:\s+[a-zA-Z0-9:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*/?\s*>"#).unwrap(),
        attr: Regex::new(r#"([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap(),
        num: Regex::new(r"^-?[0-9]{1,3}(?:\.[0-9]{1,2})?$").unwrap(),
        color: Regex::new(r"^(?:none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$").unwrap(),
        unit: Regex::new(r"^(?:0|1|0?\.[0-9]{1,2})$").unwrap(),
        path: Regex::new(r"^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,700}$").unwrap(),
        points: Regex::new(r"^[0-9.,\s-]{1,400}$").unwrap(),
    })
}

fn is_num(v: &str) -> bool {
    re().num.is_match(v)
}

fn coord(v: &str) -> bool {
    is_num(v) && v.parse::<f64>().is_ok_and(|n| n.abs() <= 128.0)
}

/// Is `v` valid for attribute `k` of shape `name`? Shape attributes first, then the shared style ones.
fn allowed(name: &str, k: &str, v: &str) -> Option<bool> {
    let r = re();
    let shape: Option<fn(&str) -> bool> = match (name, k) {
        ("circle", "cx" | "cy" | "r") => Some(coord),
        ("ellipse", "cx" | "cy" | "rx" | "ry") => Some(coord),
        ("rect", "x" | "y" | "width" | "height" | "rx" | "ry") => Some(coord),
        ("line", "x1" | "y1" | "x2" | "y2") => Some(coord),
        _ => None,
    };
    if let Some(f) = shape {
        return Some(f(v));
    }
    match (name, k) {
        ("polygon" | "polyline", "points") => return Some(r.points.is_match(v)),
        ("path", "d") => return Some(r.path.is_match(v)),
        _ => {}
    }
    Some(match k {
        "fill" | "stroke" => r.color.is_match(v),
        "stroke-width" => is_num(v) && v.parse::<f64>().is_ok_and(|n| (0.0..=12.0).contains(&n)),
        "stroke-linecap" => matches!(v, "round" | "butt" | "square"),
        "stroke-linejoin" => matches!(v, "round" | "miter" | "bevel"),
        "opacity" | "fill-opacity" => r.unit.is_match(v),
        _ => return None,
    })
}

fn needs(name: &str) -> Option<&'static [&'static str]> {
    Some(match name {
        "circle" => &["r"],
        "ellipse" => &["rx", "ry"],
        "rect" => &["width", "height"],
        "line" => &["x1", "y1", "x2", "y2"],
        "polygon" | "polyline" => &["points"],
        "path" => &["d"],
        _ => return None,
    })
}

fn units(s: &str) -> usize {
    s.encode_utf16().count()
}

/// A clean 64x64 SVG string built only from allowlisted shapes, or "" when `svg` has nothing drawable.
pub fn clean_art(svg: &str) -> String {
    if units(svg) > MAX_IN {
        return String::new();
    }
    let r = re();
    let mut out: Vec<String> = Vec::new();
    let mut size = units(HEAD) + "</svg>".len();
    for m in r.tag.captures_iter(svg) {
        if out.len() >= MAX_SHAPES {
            break;
        }
        let name = m[1].to_lowercase();
        let Some(need) = needs(&name) else { continue };
        let mut kept: Vec<(String, String)> = Vec::new();
        for a in r.attr.captures_iter(m.get(2).map_or("", |g| g.as_str())) {
            let k = &a[1];
            let v = a.get(2).or_else(|| a.get(3)).map_or("", |g| g.as_str()).trim();
            if allowed(&name, k, v) == Some(true) {
                match kept.iter_mut().find(|(kk, _)| kk == k) {
                    Some(slot) => slot.1 = v.to_string(), // a repeated attribute keeps its first slot, like a JS object
                    None => kept.push((k.to_string(), v.to_string())),
                }
            }
        }
        if !need.iter().all(|n| kept.iter().any(|(k, _)| k == n)) {
            continue;
        }
        let el = format!("<{}{}/>", name, kept.iter().map(|(k, v)| format!(" {k}=\"{v}\"")).collect::<String>());
        if size + units(&el) > MAX_OUT {
            break; // keep the shapes that fit
        }
        size += units(&el);
        out.push(el);
    }
    if out.is_empty() {
        return String::new();
    }
    format!("{HEAD}{}</svg>", out.concat())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_allowed_shapes_and_drops_the_rest() {
        let svg = r##"<svg><script>x</script><circle cx="10" cy="20" r="5" fill="#fff" onclick="x()"/><rect width="4"/><circle r="999"/></svg>"##;
        assert_eq!(clean_art(svg), format!(r##"{HEAD}<circle cx="10" cy="20" r="5" fill="#fff"/></svg>"##));
    }

    #[test]
    fn empty_when_nothing_drawable() {
        assert_eq!(clean_art("<script/>"), "");
        assert_eq!(clean_art(&"a".repeat(6001)), "");
    }

    #[test]
    fn stroke_and_opacity_rules() {
        let out = clean_art(r#"<line x1="0" y1="0" x2="9" y2="9" stroke-width="13" opacity=".5" stroke-linecap="round"/>"#);
        assert_eq!(out, format!(r#"{HEAD}<line x1="0" y1="0" x2="9" y2="9" opacity=".5" stroke-linecap="round"/></svg>"#));
    }
}
