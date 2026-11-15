//! Planner helpers ported from desktop/search/search.js: ICS parsing, slot rules and clock text.
use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

fn date_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$").unwrap())
}

fn rule_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)^\s*(?:(sun|mon|tue|wed|thu|fri|sat)\w*\s+)?(\d{1,2}):(\d\d)\s*-\s*(\d{1,2}):(\d\d)\s+(.+?)\s*$")
            .unwrap()
    })
}

/// True when `params` holds `VALUE=DATE` not followed by a dash (so `VALUE=DATE-TIME` does not count).
fn is_date_value(params: &str) -> bool {
    params.match_indices("VALUE=DATE").any(|(i, m)| !params[i + m.len()..].starts_with('-'))
}

/// One ICS date or date-time as `{y, mo, d, h, mi, z, allDay}`, or null when it does not parse.
pub fn ics_date(v: &str, params: &str) -> Value {
    let Some(m) = date_re().captures(v) else { return Value::Null };
    let n = |i: usize| m.get(i).map_or(0, |x| x.as_str().parse::<i64>().unwrap_or(0));
    let all_day = m.get(4).is_none() || is_date_value(params);
    json!({"y": n(1), "mo": n(2), "d": n(3), "h": n(4), "mi": n(5), "z": m.get(7).is_some() && !all_day, "allDay": all_day})
}

/// Unescapes `\,` `\;` `\\` and turns `\n` into `nl`.
fn unescape(raw: &str, nl: &str) -> String {
    let mut out = String::new();
    let mut it = raw.chars().peekable();
    while let Some(c) = it.next() {
        match (c, it.peek().copied()) {
            ('\\', Some('n' | 'N')) => {
                it.next();
                out.push_str(nl);
            }
            ('\\', Some(x @ (',' | ';' | '\\'))) => {
                it.next();
                out.push(x);
            }
            _ => out.push(c),
        }
    }
    out
}

/// Events of an ICS export that have a start, as `{start, end?, allDay, title?, where?, desc?}`.
pub fn parse_ics(text: &str) -> Vec<Value> {
    // Folded lines (a newline then a space or tab) are joined first.
    let text = text.replace("\r\n", "\n");
    let mut joined = String::with_capacity(text.len());
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\n' && matches!(it.peek(), Some(' ' | '\t')) {
            it.next();
        } else {
            joined.push(c);
        }
    }
    let mut out = Vec::new();
    let mut cur: Option<serde_json::Map<String, Value>> = None;
    for line in joined.split('\n') {
        if line == "BEGIN:VEVENT" {
            cur = Some(Default::default());
            continue;
        }
        if line == "END:VEVENT" {
            if let Some(c) = cur.take() {
                if c.contains_key("start") {
                    out.push(Value::Object(c));
                }
            }
            continue;
        }
        let Some(c) = cur.as_mut() else { continue };
        let Some(i) = line.find(':') else { continue };
        let mut head = line[..i].split(';');
        let name = head.next().unwrap_or("");
        let params = head.collect::<Vec<_>>().join(";");
        let raw = &line[i + 1..];
        let val = unescape(raw, " ");
        match name {
            "DTSTART" => {
                let r = ics_date(&val, &params);
                if !r.is_null() {
                    c.insert("allDay".into(), r["allDay"].clone());
                    c.insert("start".into(), r);
                }
            }
            "DTEND" => {
                let r = ics_date(&val, &params);
                if !r.is_null() {
                    c.insert("end".into(), r);
                }
            }
            "SUMMARY" => {
                c.insert("title".into(), json!(val));
            }
            "LOCATION" => {
                c.insert("where".into(), json!(val));
            }
            "DESCRIPTION" => {
                c.insert("desc".into(), json!(unescape(raw, "\n")));
            }
            _ => {}
        }
    }
    out
}

/// Subject per time slot: one rule per line, "Mon 08:30-09:20 Maths". `wd` is -1 when no day is given.
pub fn slot_rules(text: &str) -> Vec<Value> {
    const DAYS: [&str; 7] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    text.lines()
        .filter_map(|line| {
            let m = rule_re().captures(line)?;
            let n = |i: usize| m[i].parse::<i64>().unwrap_or(0);
            let wd = m
                .get(1)
                .and_then(|d| DAYS.iter().position(|x| *x == d.as_str().to_lowercase()))
                .map_or(-1, |i| i as i64);
            let subject: String = m[6].chars().take(60).collect();
            Some(json!({"wd": wd, "from": n(2) * 60 + n(3), "to": n(4) * 60 + n(5), "subject": subject}))
        })
        .collect()
}

/// Minute of the day as `HH:MM`.
pub fn hhmm(m: i64) -> String {
    format!("{:02}:{:02}", m.div_euclid(60), m.rem_euclid(60))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(ics_date("20260115T083000Z", "")["z"], true);
        assert_eq!(ics_date("20260115T083000", "")["h"], 8);
        assert_eq!(ics_date("20260115", "")["allDay"], true);
        assert_eq!(ics_date("20260115T083000", "VALUE=DATE")["allDay"], true);
        assert_eq!(ics_date("20260115T083000", "VALUE=DATE-TIME")["allDay"], false);
        assert!(ics_date("nope", "").is_null());
    }

    #[test]
    fn events() {
        let ics = "BEGIN:VEVENT\r\nDTSTART:20260115T083000\r\nDTEND:20260115T092000\r\nSUMMARY:Maths\\, room 2\r\nDESCRIPTION:a\\nb\r\n c\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:No start\r\nEND:VEVENT\r\n";
        let ev = parse_ics(ics);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0]["title"], "Maths, room 2");
        assert_eq!(ev[0]["desc"], "a\nbc");
        assert_eq!(ev[0]["end"]["mi"], 20);
    }

    #[test]
    fn rules_and_clock() {
        let r = slot_rules("Mon 08:30-09:20 Maths\n9:00 - 9:50 Gym\nbad line");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0]["wd"], 1);
        assert_eq!(r[0]["from"], 510);
        assert_eq!(r[1]["wd"], -1);
        assert_eq!(hhmm(510), "08:30");
    }
}
