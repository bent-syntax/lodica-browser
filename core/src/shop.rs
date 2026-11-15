//! Shop helpers ported from relay/src/shop.js: price parsing, product page parsing, vergelijk.be card parsing, category prefix, price bounds, used-item detection and review links.

use regex::Regex;
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

/// New-item shops per country code.
pub const SHOPS: &[(&str, &[&str])] = &[
    ("BE", &["bol.com", "coolblue.be", "mediamarkt.be", "vandenborre.be", "krefel.be", "alternate.be", "amazon.nl", "dreamland.be", "decathlon.be"]),
    ("NL", &["bol.com", "coolblue.nl", "mediamarkt.nl", "azerty.nl", "alternate.nl", "amazon.nl", "megekko.nl", "wehkamp.nl", "decathlon.nl"]),
    ("DE", &["amazon.de", "otto.de", "mediamarkt.de", "saturn.de", "notebooksbilliger.de", "alternate.de", "cyberport.de", "mindfactory.de", "idealo.de"]),
    ("FR", &["amazon.fr", "fnac.com", "darty.com", "boulanger.com", "ldlc.com", "cdiscount.com", "materiel.net"]),
    ("GB", &["amazon.co.uk", "currys.co.uk", "argos.co.uk", "scan.co.uk", "overclockers.co.uk", "ebuyer.com", "johnlewis.com"]),
    ("US", &["amazon.com", "bestbuy.com", "newegg.com", "walmart.com", "target.com", "bhphotovideo.com", "costco.com", "microcenter.com"]),
    ("CA", &["amazon.ca", "bestbuy.ca", "canadacomputers.com", "walmart.ca", "newegg.ca"]),
    ("AU", &["amazon.com.au", "jbhifi.com.au", "officeworks.com.au", "harveynorman.com.au", "ebay.com.au"]),
    ("ES", &["amazon.es", "pccomponentes.com", "mediamarkt.es", "elcorteingles.es", "fnac.es"]),
    ("IT", &["amazon.it", "mediaworld.it", "unieuro.it", "eprice.it"]),
];

/// Second-hand and refurbished shops per country code.
pub const SECOND: &[(&str, &[&str])] = &[
    ("BE", &["2dehands.be", "vinted.be", "swappie.com", "backmarket.be", "refurbed.be", "refurbished.be", "ebay.be"]),
    ("NL", &["marktplaats.nl", "vinted.nl", "swappie.com", "backmarket.nl", "refurbed.nl", "refurbished.nl", "ebay.nl"]),
    ("DE", &["kleinanzeigen.de", "vinted.de", "swappie.com", "backmarket.de", "refurbed.de", "rebuy.de", "ebay.de"]),
    ("FR", &["leboncoin.fr", "vinted.fr", "swappie.com", "backmarket.fr", "refurbed.fr", "rebuy.fr", "ebay.fr"]),
    ("GB", &["vinted.co.uk", "swappie.com", "backmarket.co.uk", "refurbed.co.uk", "musicmagpie.co.uk", "cex.uk", "ebay.co.uk"]),
    ("US", &["swappa.com", "backmarket.com", "gazelle.com", "ebay.com", "mercari.com", "decluttr.com"]),
    ("CA", &["backmarket.ca", "swappa.com", "ebay.ca", "kijiji.ca"]),
    ("AU", &["backmarket.com.au", "ebay.com.au", "gumtree.com.au", "cashconverters.com.au"]),
    ("ES", &["wallapop.com", "vinted.es", "swappie.com", "backmarket.es", "refurbed.es", "ebay.es"]),
    ("IT", &["subito.it", "vinted.it", "swappie.com", "backmarket.it", "refurbed.it", "ebay.it"]),
];

const LANG: &[(&str, &str)] = &[
    ("BE", "nl-BE"), ("NL", "nl-NL"), ("DE", "de-DE"), ("FR", "fr-FR"), ("GB", "en-GB"),
    ("US", "en-US"), ("CA", "en-CA"), ("AU", "en-AU"), ("ES", "es-ES"), ("IT", "it-IT"),
];

const CATEGORIES: &[(&str, &str)] = &[
    ("laptops", "laptop"), ("phones", "smartphone"), ("tablets", "tablet"), ("tvs", "televisie"),
    ("audio", "koptelefoon"), ("cameras", "camera"), ("gaming", "game console"), ("monitors", "monitor"),
    ("components", "pc component"), ("printers", "printer"), ("appliances", "huishoudapparaat"),
    ("smarthome", "smart home"), ("wearables", "smartwatch"),
];

const REVIEW_SITES: &[&str] = &["gsmarena.com", "notebookcheck.net", "rtings.com", "techradar.com", "pocket-lint.com", "cnet.com"];

fn re(cell: &'static OnceLock<Regex>, src: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(src).unwrap())
}

fn used_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r"(?i)refurb|renewed|second[\s-]?hand|tweedehands|2dehands|gebruikt|pre-?owned|\bused\b|reconditionn|occasion|gebraucht|generalüberholt|reacondicionad|ricondizionat|marktplaats|vinted")
}

fn used_host_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r"(^|\.)(vinted|swappie|backmarket|refurbed|refurbished|rebuy|2dehands|marktplaats|kleinanzeigen|leboncoin|swappa|gazelle|mercari|decluttr|wallapop|subito|kijiji|gumtree|musicmagpie|cex|cashconverters)\.")
}

fn ld_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r#"(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>"#)
}

fn card_link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r#"<a href="(/[^"]+)"[^>]*heading-md[^>]*>([^<]+)</a>"#)
}

fn card_price_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r"display-md[^>]*>\s*([\d.,]+)\s*<")
}

fn card_shop_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r#"<span class="truncate">(?:Laagste prijs bij|Ga naar)\s*([^<]+)</span>"#)
}

/// Whole numbers come out as integers so they compare equal to the JS values.
fn nj(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9e15 {
        json!(n as i64)
    } else {
        json!(n)
    }
}

/// Parses a price like "1.299,00", "$1,299.50" or "12,5": the last separator is the decimal point.
pub fn num_str(v: &str) -> Option<f64> {
    let mut t: String = v.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',').collect();
    t = match (t.rfind(','), t.rfind('.')) {
        (Some(c), d) if d.map_or(true, |d| c > d) => t.replace('.', "").replace(',', "."),
        _ => t.replace(',', ""),
    };
    // Same as JS parseFloat: read the longest leading number, ignore the rest.
    let int = t.chars().take_while(char::is_ascii_digit).count();
    let mut end = int;
    if t[int..].starts_with('.') {
        let frac = t[int + 1..].chars().take_while(char::is_ascii_digit).count();
        if int > 0 || frac > 0 {
            end = int + 1 + frac;
        }
    }
    if end == 0 {
        return None;
    }
    t[..end].parse().ok()
}

/// A JSON number or numeric string as a price, `None` when it is neither.
pub fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => num_str(s),
        _ => None,
    }
}

fn positive(v: Option<&Value>) -> Option<f64> {
    v.and_then(num).filter(|n| *n > 0.0)
}

/// Collects `n` and every nested object or array up to depth 6.
fn walk<'a>(n: &'a Value, depth: usize, out: &mut Vec<&'a Value>) {
    if depth > 6 || !(n.is_object() || n.is_array()) {
        return;
    }
    out.push(n);
    match n {
        Value::Array(a) => a.iter().for_each(|x| walk(x, depth + 1, out)),
        Value::Object(o) => o.values().for_each(|x| walk(x, depth + 1, out)),
        _ => {}
    }
}

/// `[].concat(v || [])` as a list.
fn listed(v: Option<&Value>) -> Vec<&Value> {
    match v {
        Some(Value::Array(a)) => a.iter().collect(),
        Some(Value::Null) | None => vec![],
        Some(x) => vec![x],
    }
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().map_or(false, |f| f != 0.0),
        _ => true,
    }
}

fn type_text(n: &Value) -> String {
    listed(n.get("@type")).iter().map(|t| t.as_str().map(String::from).unwrap_or_else(|| t.to_string())).collect::<Vec<_>>().join(",")
}

fn meta(html: &str, attr: &str, key: &str) -> String {
    let src = format!(r#"(?i)<meta[^>]+{}=["']{}["'][^>]+content=["']([^"']*)["']"#, attr, regex::escape(key));
    Regex::new(&src).ok().and_then(|r| r.captures(html).map(|c| c[1].to_string())).unwrap_or_default()
}

fn cur_of(s: &str) -> String {
    s.to_uppercase().chars().take(3).collect()
}

/// Reads name, description, image, rating, reviews, price, currency and stock from a product page: JSON-LD first, then product and Open Graph meta tags.
/// Only keys that were found are set.
// shortcut: serde_json sorts object keys, so the walk order differs from JS when one block has several offers; upgrade if that shows up in real pages.
pub fn parse_product(html: &str) -> Value {
    let mut name: Option<String> = None;
    let mut desc: Option<String> = None;
    let mut img: Option<String> = None;
    let mut rating: Option<f64> = None;
    let mut reviews: Option<f64> = None;
    let mut price: Option<f64> = None;
    let mut cur = String::new();
    let mut stock: Option<i64> = None;
    for block in ld_re().captures_iter(html) {
        let Ok(data) = serde_json::from_str::<Value>(&block[1]) else { continue };
        let mut nodes = vec![];
        walk(&data, 0, &mut nodes);
        for n in nodes.into_iter().filter(|n| n.is_object()) {
            if !type_text(n).to_lowercase().contains("product") {
                continue;
            }
            if name.is_none() {
                name = n.get("name").and_then(Value::as_str).map(String::from);
            }
            if desc.is_none() {
                desc = n.get("description").and_then(Value::as_str).map(String::from);
            }
            if img.is_none() {
                img = listed(n.get("image")).first().and_then(|i| i.as_str().or_else(|| i.get("url").and_then(Value::as_str))).map(String::from);
            }
            if let Some(r) = n.get("aggregateRating") {
                if rating.is_none() {
                    rating = positive(r.get("ratingValue"));
                }
                if reviews.is_none() {
                    let rc = if truthy(r.get("reviewCount")) { r.get("reviewCount") } else { r.get("ratingCount") };
                    reviews = positive(rc);
                }
            }
            for offer in listed(n.get("offers")) {
                let mut xs = vec![];
                walk(offer, 0, &mut xs);
                for x in xs {
                    let raw = match x.get("price") {
                        Some(Value::Null) | None => x.get("lowPrice"),
                        p => p,
                    };
                    if let (Some(p), None) = (positive(raw), price) {
                        price = Some(p);
                        cur = cur_of(x.get("priceCurrency").and_then(Value::as_str).unwrap_or(""));
                        let avail = x.get("availability").and_then(Value::as_str).unwrap_or("").to_lowercase();
                        stock = Some(if ["outofstock", "soldout", "discontinued"].iter().any(|w| avail.contains(w)) { 0 } else { 1 });
                    }
                }
            }
        }
        if price.is_some() {
            break;
        }
    }
    if price.is_none() {
        let amount = Some(meta(html, "(?:property|name)", "product:price:amount")).filter(|s| !s.is_empty()).unwrap_or_else(|| meta(html, "(?:property|name)", "og:price:amount"));
        if let Some(p) = num_str(&amount).filter(|p| *p > 0.0) {
            price = Some(p);
            let c = meta(html, "(?:property|name)", "product:price:currency");
            cur = cur_of(&if c.is_empty() { meta(html, "(?:property|name)", "og:price:currency") } else { c });
        }
    }
    if name.is_none() {
        name = Some(meta(html, "property", "og:title")).filter(|s| !s.is_empty());
    }
    if img.is_none() {
        img = Some(meta(html, "property", "og:image")).filter(|s| !s.is_empty());
    }
    let mut out = Map::new();
    if let Some(v) = name { out.insert("name".into(), json!(v)); }
    if let Some(v) = desc { out.insert("desc".into(), json!(v)); }
    if let Some(v) = img { out.insert("img".into(), json!(v)); }
    if let Some(v) = rating { out.insert("rating".into(), nj(v)); }
    if let Some(v) = reviews { out.insert("reviews".into(), nj(v)); }
    if let Some(v) = price {
        out.insert("price".into(), nj(v));
        out.insert("cur".into(), json!(cur));
    }
    if let Some(v) = stock { out.insert("stock".into(), json!(v)); }
    Value::Object(out)
}

/// Decodes the five entities vergelijk.be uses.
pub fn unent(t: &str) -> String {
    t.replace("&amp;", "&").replace("&#39;", "'").replace("&apos;", "'").replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">")
}

/// Product cards of a vergelijk.be result page as `{t, u, p, i?, h}`.
pub fn parse_vergelijk(html: &str) -> Vec<Value> {
    static COMMENT: OnceLock<Regex> = OnceLock::new();
    static IMG: OnceLock<Regex> = OnceLock::new();
    static SRC: OnceLock<Regex> = OnceLock::new();
    static SET: OnceLock<Regex> = OnceLock::new();
    let html = re(&COMMENT, r"(?s)<!--.*?-->").replace_all(html, "");
    let mut out = vec![];
    for c in html.split("data-test-id=\"card\"").skip(1) {
        let (Some(a), Some(pr)) = (card_link_re().captures(c), card_price_re().captures(c)) else { continue };
        let Some(price) = num_str(&pr[1]).filter(|p| *p > 0.0) else { continue };
        let img = re(&IMG, r"<img\b[^>]*>").find_iter(c).find_map(|t| {
            let t = t.as_str();
            let m = re(&SRC, r#"\s(?:data-src|data-lazy-src|src)="((?:https?:)?//[^"]+)""#).captures(t).or_else(|| re(&SET, r#"\ssrcset="((?:https?:)?//[^\s",]+)"#).captures(t))?;
            let u = unent(&m[1]);
            Some(match u.strip_prefix("//") { Some(r) => format!("https://{r}"), None => u })
        });
        let shop = card_shop_re().captures(c).map(|s| {
            let n = unent(&s[1]).trim().to_string();
            n.strip_suffix(".be").map(String::from).unwrap_or(n)
        });
        let mut card = json!({"t": unent(&a[2]).trim(), "u": format!("https://www.vergelijk.be{}", &a[1]), "p": nj(price), "h": shop.unwrap_or_else(|| "vergelijk.be".into())});
        if let Some(i) = img {
            card["i"] = json!(i);
        }
        out.push(card);
    }
    out
}

/// Prefixes the query with the category term unless it already holds it.
pub fn with_cat(q: &str, cat: &str) -> String {
    match CATEGORIES.iter().find(|(k, _)| *k == cat) {
        Some((_, term)) if !q.to_lowercase().contains(term) => format!("{term} {q}"),
        _ => q.to_string(),
    }
}

/// The listed domain that `host` is or sits under.
pub fn shop_of(host: &str, list: &[&str]) -> Option<String> {
    list.iter().find(|d| host == **d || host.ends_with(&format!(".{d}"))).map(|d| d.to_string())
}

/// Shop domains for a country: `(new, second_hand)`, empty when the country is unknown.
pub fn shops_for(country: &str) -> (Vec<&'static str>, Vec<&'static str>) {
    let find = |t: &'static [(&str, &'static [&str])]| t.iter().find(|(k, _)| *k == country).map(|(_, v)| v.to_vec()).unwrap_or_default();
    (find(SHOPS), find(SECOND))
}

/// Search language for a country code, `en-US` when unknown.
pub fn lang_for(country: &str) -> &'static str {
    LANG.iter().find(|(k, _)| *k == country).map(|(_, v)| *v).unwrap_or("en-US")
}

/// True when the title reads second-hand or the host is a known second-hand shop.
pub fn is_used(title: &str, host: &str) -> bool {
    used_re().is_match(title) || used_host_re().is_match(host)
}

/// The review site domain a URL belongs to.
pub fn review_site(url: &str) -> Option<String> {
    let h = crate::host(url);
    shop_of(&h, REVIEW_SITES)
}

/// A price bound clamped to 0..=1e7, non-finite values become 0.
pub fn price_bound(v: f64) -> f64 {
    if v.is_finite() { v.clamp(0.0, 1e7) } else { 0.0 }
}

/// Clamped `(min, max)` with reversed bounds swapped.
pub fn bounds(min: f64, max: f64) -> (f64, f64) {
    let (a, b) = (price_bound(min), price_bound(max));
    if a > b { (b, a) } else { (a, b) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prices() {
        assert_eq!(num_str("1.299,00"), Some(1299.0));
        assert_eq!(num_str("$1,299.50"), Some(1299.5));
        assert_eq!(num_str("12,5"), Some(12.5));
        assert_eq!(num_str("abc"), None);
        assert_eq!(num(&json!(4.5)), Some(4.5));
        assert_eq!(num(&json!(null)), None);
    }

    #[test]
    fn product_json_ld() {
        let html = r#"<script type="application/ld+json">{"@type":"Product","name":"Phone","image":["a.jpg"],
            "aggregateRating":{"ratingValue":"4.5","reviewCount":12},
            "offers":{"@type":"Offer","price":"299,99","priceCurrency":"eur","availability":"https://schema.org/OutOfStock"}}</script>"#;
        let p = parse_product(html);
        assert_eq!(p, json!({"name":"Phone","img":"a.jpg","rating":4.5,"reviews":12,"price":299.99,"cur":"EUR","stock":0}));
    }

    #[test]
    fn product_meta_fallback() {
        let html = r#"<meta property="og:title" content="Lamp"><meta property="product:price:amount" content="9.50"><meta property="product:price:currency" content="usd"><meta property="og:image" content="x.png">"#;
        assert_eq!(parse_product(html), json!({"name":"Lamp","img":"x.png","price":9.5,"cur":"USD"}));
        assert_eq!(parse_product("<p>none</p>"), json!({}));
    }

    #[test]
    fn vergelijk_cards() {
        let html = r#"<!-- x --><div data-test-id="card"><a href="/p/1" class="heading-md">Tom &amp; Jerry</a>
            <img src="data:x"><img data-src="//cdn.x/a.jpg"><span class="display-md">1.099,50 </span>
            <span class="truncate">Ga naar Coolblue.be</span></div>"#;
        let v = parse_vergelijk(html);
        assert_eq!(v, vec![json!({"t":"Tom & Jerry","u":"https://www.vergelijk.be/p/1","p":1099.5,"i":"https://cdn.x/a.jpg","h":"Coolblue"})]);
        assert!(parse_vergelijk("<div data-test-id=\"card\">nothing</div>").is_empty());
    }

    #[test]
    fn helpers() {
        assert_eq!(with_cat("xps", "laptops"), "laptop xps");
        assert_eq!(with_cat("laptop xps", "laptops"), "laptop xps");
        assert_eq!(with_cat("x", "nope"), "x");
        assert_eq!(shop_of("www.bol.com", &["bol.com"]), Some("bol.com".into()));
        assert_eq!(shop_of("notbol.com", &["bol.com"]), None);
        assert!(is_used("Refurbished iPhone", "bol.com"));
        assert!(is_used("iPhone", "www.vinted.be"));
        assert!(!is_used("iPhone", "bol.com"));
        assert_eq!(review_site("https://www.gsmarena.com/x.php"), Some("gsmarena.com".into()));
        assert_eq!(bounds(500.0, 100.0), (100.0, 500.0));
        assert_eq!(bounds(-5.0, f64::INFINITY), (0.0, 0.0));
        assert_eq!(lang_for("BE"), "nl-BE");
        assert_eq!(shops_for("XX").0.len(), 0);
    }
}
