/**
 * Shared pieces for reading St. Johnsbury Academy's public event calendar.
 *
 * Source: https://stjacademy.org/?feed=eo-events — the Event Organiser iCal feed.
 * One request returns every event the site currently holds, including the full
 * HTML body in X-ALT-DESC. Used by both fetch_sja_calendar.mjs (schedule
 * overrides) and fetch_sja_events.mjs (the events feed the extension renders).
 */

export const ICS_URL = "https://stjacademy.org/?feed=eo-events";

// ---------------------------------------------------------------------------
// Date helpers. Everything is a "YYYY-MM-DD" string in school-local terms; the
// arithmetic runs in UTC so it never shifts across a DST boundary.
// ---------------------------------------------------------------------------

export const SCHOOL_TIME_ZONE = "America/New_York";

export function todayInSchoolZone() {
  return new Date().toLocaleDateString("en-CA", { timeZone: SCHOOL_TIME_ZONE });
}

export function toUtcDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd, amount) {
  const date = toUtcDate(ymd);
  date.setUTCDate(date.getUTCDate() + amount);
  return toYmd(date);
}

/**
 * Zero-pads a date for comparison only. Some hand-written entries use "2026-2-20";
 * both clients normalize that when reading, so the stored text is left alone and
 * only ordering/comparison goes through here.
 */
export function normalizeYmd(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function compareYmd(a, b) {
  const left = normalizeYmd(a);
  const right = normalizeYmd(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isWeekend(ymd) {
  const weekday = toUtcDate(ymd).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function eachDay(firstYmd, lastYmd) {
  const days = [];
  for (let cur = firstYmd; cur <= lastYmd; cur = addDays(cur, 1)) days.push(cur);
  return days;
}

// ---------------------------------------------------------------------------
// iCal parsing
// ---------------------------------------------------------------------------

/** Content lines are wrapped at 75 octets; continuations start with space/tab. */
export function unfoldIcs(raw) {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

export function unescapeIcsText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, ch) =>
    ch === "n" || ch === "N" ? "\n" : ch
  );
}

export function parseEvents(raw) {
  const body = unfoldIcs(raw);
  const events = [];
  const blockPattern = /BEGIN:VEVENT\n([\s\S]*?)\nEND:VEVENT/g;
  let match;

  while ((match = blockPattern.exec(body)) !== null) {
    const props = {};
    for (const line of match[1].split("\n")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      props[name.toUpperCase()] = {
        value: line.slice(colon + 1),
        params: params.join(";"),
      };
    }
    events.push(props);
  }
  return events;
}

export function parseIcsDate(prop) {
  if (!prop) return null;
  const match = prop.value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return {
    ymd: `${match[1]}-${match[2]}-${match[3]}`,
    dateOnly: /VALUE=DATE(?![-\w])/i.test(prop.params),
  };
}

/** "HH:MM" from a timed DTSTART/DTEND, or null for all-day values. */
export function parseIcsTime(prop) {
  if (!prop) return null;
  const match = prop.value.trim().match(/^\d{8}T(\d{2})(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * Inclusive first/last day an event covers.
 *
 * All-day events use an exclusive DTEND (Thanksgiving Break 11/25 -> 11/28 means
 * 11/25 through 11/27). Timed events end at a real moment, so DTEND's own date is
 * part of the event — the school enters Winter Break that way, as a timed event
 * running 2/19 12:00 -> 3/2 13:00.
 */
export function eventSpan(props) {
  const start = parseIcsDate(props.DTSTART);
  if (!start) return null;

  const end = parseIcsDate(props.DTEND);
  if (!end) return { first: start.ymd, last: start.ymd };

  const last = start.dateOnly ? addDays(end.ymd, -1) : end.ymd;
  return { first: start.ymd, last: last < start.ymd ? start.ymd : last };
}

/** Plain text from the X-ALT-DESC HTML body (falls back to DESCRIPTION). */
export function eventBodyText(props) {
  const raw = props["X-ALT-DESC"]?.value ?? props.DESCRIPTION?.value ?? "";
  return unescapeIcsText(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Stable id from the feed's UID, which embeds the WordPress post id and the
 * occurrence number: "...-EO-51741-1@127.0.0.1" -> "51741-1".
 */
export function eventIdFromUid(props) {
  const uid = props.UID?.value ?? "";
  const match = uid.match(/-EO-(\d+-\d+)@/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Title classification
// ---------------------------------------------------------------------------

export const RE_LATE_START = /late start/i;
export const RE_BREAK = /\bbreak\b/i;

/**
 * "No Classes" as a suffix means the school is closed:
 *   "Labor Day – No Classes", "Faculty In-Service – No Classes", "No Classes"
 */
export const RE_CLOSED = /(?:^|[\s–—-])no classes\s*$/i;

/**
 * "No Classes" as a prefix means regular classes are cancelled but there is
 * still a program running that needs its own block times:
 *   "No Classes – Exams", "No Classes – Spring Day", "No Classes – Capstone/..."
 * Treating these as no_school would tell students to stay home on a school day.
 */
export const RE_PROGRAM_DAY = /^\s*no classes\s*[–—-]/i;

/** Titles worth surfacing to a human even though we can't classify them. */
export const RE_NEEDS_HUMAN =
  /schedule|no class|abbreviated|half day|early release|exam|capstone|spirit week|winter carnival|spring day|in-service|advisory|conference|testing|orientation|dismissal|delay/i;

/**
 * Does this change a student's school day? Sets `kind` in events.json. The
 * extension currently marks every event day the same way, so this is metadata
 * for now. Tighter than RE_NEEDS_HUMAN: bare "advisory" would also catch the
 * evening "Program Advisory Committees" meeting.
 */
export const RE_AFFECTS_DAY =
  /schedule|no class|abbreviated|half day|early release|early dismissal|exam|capstone|spirit week|winter carnival|spring day|in-service|advisory schedule|conference|testing|orientation|delay/i;

export async function fetchIcs() {
  const response = await fetch(ICS_URL, {
    headers: { "User-Agent": "Hilltoppers-schedule-sync (+https://github.com/daniezl/Hilltoppers)" },
  });
  if (!response.ok) {
    throw new Error(`Calendar feed returned HTTP ${response.status}`);
  }
  return response.text();
}
