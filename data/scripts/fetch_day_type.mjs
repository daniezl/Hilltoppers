/**
 * Reads the Daily Bulletin once and publishes which colour each upcoming day
 * is, so neither app has to parse the school website or reason about the
 * green/white alternation itself.
 *
 * Output: public/day_type.json
 *   {
 *     "updatedAt": "...",
 *     "bulletin": { "date": "2026-09-03", "dayType": "Green Day", ... },
 *     "days": { "2026-09-03": "Green Day", "2026-09-04": "White Day",
 *               "2026-09-05": "No School", ... }        // 30 days from bulletin
 *   }
 *
 * Why this exists: the bulletin is usually a day behind (posted in the
 * morning for that morning, sometimes not until the afternoon), so "read the
 * colour off the page" is wrong most of the time and every client had to
 * predict forward. Four separate implementations of that prediction existed
 * across iOS and the extension and they had started to disagree. Now there is
 * one, here, and the clients look up today in `days`.
 *
 * Rules, in order, for each day after the bulletin's date:
 *   1. It is a school day unless it is a weekend, falls inside a period in
 *      special_periods.json, or special_days.json marks it `no_school`. A
 *      special_days entry of any other type makes it a school day even on a
 *      weekend.
 *   2. Each school day flips the colour of the previous school day.
 *   3. A `color` in special_days.json overrides the flip for that day AND the
 *      sequence continues from the override. "May 18 is White" means May 19 is
 *      Green. (The old client code applied the override to the label only and
 *      kept flipping from the un-overridden value, which could show the same
 *      colour twice running. That was never what the school meant.)
 *   4. The bulletin's own date takes the bulletin's colour, override or not —
 *      it is the school's most recent statement.
 *
 * Failure behaviour: any parse problem throws, the process exits non-zero, and
 * the previous public/day_type.json is left untouched. A red Action run is the
 * alarm that the school changed its page. If the bulletin carries no colour
 * (a holiday), the previous file's bulletin is reused as the anchor so the
 * horizon keeps moving.
 */

import fs from "node:fs/promises";
import { load } from "cheerio";

const BULLETIN_URL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/";
const OUT = "public/day_type.json";
const SPECIAL_DAYS = "public/special_days.json";
const SPECIAL_PERIODS = "public/special_periods.json";

const HORIZON_DAYS = 30;
// A bulletin dated further than this from the run date means the page layout
// changed and the wrong text was read as the date.
const MAX_BULLETIN_AGE_DAYS = 60;

// The school's WAF blocks requests that do not look like a browser.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// ---------------------------------------------------------------------------
// Dates as "yyyy-mm-dd" strings. All arithmetic goes through Date.UTC so a
// date is a date, with no timezone or DST anywhere in it.

const pad = (n) => String(n).padStart(2, "0");
const toKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function normalizeKey(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) throw new Error(`Not a yyyy-mm-dd date: ${JSON.stringify(s)}`);
  return toKey(Number(m[1]), Number(m[2]), Number(m[3]));
}

function keyToUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms) {
  const d = new Date(ms);
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const addDays = (key, n) => utcToKey(keyToUtc(key) + n * 86_400_000);
const weekdayOf = (key) => new Date(keyToUtc(key)).getUTCDay();
const daysBetween = (a, b) => Math.round((keyToUtc(b) - keyToUtc(a)) / 86_400_000);

/** "September 3, 2026" → "2026-09-03" */
function parseLongDate(text) {
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!month) return null;
  return toKey(Number(m[3]), month, Number(m[2]));
}

// ---------------------------------------------------------------------------
// Bulletin

function classifyHeading(text) {
  const t = text.trim().toLowerCase();
  if (/^green\s+day$/.test(t)) return "Green Day";
  if (/^white\s+day$/.test(t)) return "White Day";
  if (/no\s+school/.test(t)) return "No School";
  return null;
}

/**
 * Everything is read from inside `.latest-article` and from specific elements
 * within it. The previous client code searched the whole page for the first
 * date-shaped string and the first mention of a colour, which meant a sidebar
 * date or a body-text "Green Day club meets Tuesday" could become today's
 * answer.
 */
export function parseBulletin(html) {
  const $ = load(html);
  const article = $(".latest-article").first();
  if (!article.length) {
    throw new Error("Bulletin: no .latest-article on the page — layout changed?");
  }

  const dateText = article.find(".date").first().text();
  const date = parseLongDate(dateText);
  if (!date) {
    throw new Error(`Bulletin: could not read a date from .date: ${JSON.stringify(dateText.trim())}`);
  }

  // The heading names the weekday; if it disagrees with the date we parsed,
  // one of the two elements is no longer what we think it is.
  const heading = article.find("h2").first().text();
  const named = WEEKDAYS.find((w) => heading.includes(w)) ?? null;
  const actual = WEEKDAYS[weekdayOf(date)];
  if (named && named !== actual) {
    throw new Error(`Bulletin: heading says ${named} but ${date} is a ${actual}`);
  }

  const headings = article
    .find("h4.all-caps-subhead")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  let dayType = null;
  for (const h of headings) {
    dayType = classifyHeading(h);
    if (dayType) break;
  }

  return { date, weekday: actual, dayType, headings };
}

async function fetchBulletin() {
  const res = await fetch(BULLETIN_URL, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`Bulletin: HTTP ${res.status}`);
  const html = await res.text();
  if (!html.trim()) throw new Error("Bulletin: empty response");
  return html;
}

// ---------------------------------------------------------------------------
// Calendar

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return fallback;
    throw err;
  }
}

export async function loadCalendar() {
  const rawDays = await readJson(SPECIAL_DAYS);
  const rawPeriods = await readJson(SPECIAL_PERIODS);

  const specialDays = {};
  for (const [k, v] of Object.entries(rawDays)) {
    if (!v || typeof v !== "object") continue;
    specialDays[normalizeKey(k)] = {
      type: typeof v.type === "string" ? v.type : null,
      color: classifyHeading(String(v.color ?? "")) ?? null
    };
  }

  // Hand-edited periods have been written as "2026-1-5" before; anything that
  // compares these as strings without padding gets the wrong answer.
  const periods = rawPeriods.map((p) => ({
    start: normalizeKey(p.start),
    end: normalizeKey(p.end)
  }));

  return { specialDays, periods };
}

export function isSchoolDay(key, cal) {
  const sd = cal.specialDays[key];
  if (sd?.type) return sd.type !== "no_school";
  for (const p of cal.periods) {
    if (key >= p.start && key <= p.end) return false;
  }
  const wd = weekdayOf(key);
  return wd !== 0 && wd !== 6;
}

// ---------------------------------------------------------------------------
// The one implementation of the alternation.

export function computeDays(anchor, cal, horizon = HORIZON_DAYS) {
  const days = {};
  let isGreen = anchor.dayType === "Green Day";
  days[anchor.date] = anchor.dayType;

  for (let i = 1; i <= horizon; i++) {
    const key = addDays(anchor.date, i);
    if (!isSchoolDay(key, cal)) {
      days[key] = "No School";
      continue;
    }
    isGreen = !isGreen;
    const override = cal.specialDays[key]?.color;
    if (override === "Green Day" || override === "White Day") {
      isGreen = override === "Green Day";
    }
    days[key] = isGreen ? "Green Day" : "White Day";
  }
  return days;
}

// ---------------------------------------------------------------------------

async function main() {
  const html = await fetchBulletin();
  const bulletin = parseBulletin(html);

  const today = utcToKey(Date.now());
  if (Math.abs(daysBetween(bulletin.date, today)) > MAX_BULLETIN_AGE_DAYS) {
    throw new Error(`Bulletin: dated ${bulletin.date}, which is not near today (${today}) — wrong element read as the date?`);
  }

  const existing = await readJson(OUT, null);

  let anchor;
  if (bulletin.dayType === "Green Day" || bulletin.dayType === "White Day") {
    anchor = { date: bulletin.date, dayType: bulletin.dayType };
  } else if (existing?.bulletin?.dayType) {
    console.log(`Bulletin for ${bulletin.date} carries no colour (${JSON.stringify(bulletin.headings)}); anchoring on previous ${existing.bulletin.date} ${existing.bulletin.dayType}`);
    anchor = { date: existing.bulletin.date, dayType: existing.bulletin.dayType };
  } else {
    throw new Error(`Bulletin: no colour in headings ${JSON.stringify(bulletin.headings)} and no previous file to fall back on`);
  }

  const cal = await loadCalendar();
  const days = computeDays(anchor, cal);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: BULLETIN_URL,
    bulletin: {
      date: bulletin.date,
      weekday: bulletin.weekday,
      dayType: bulletin.dayType,
      headings: bulletin.headings
    },
    anchor,
    days
  };

  // Only the timestamp would change on a quiet run; do not write it, so the
  // Action does not commit 48 times a day for nothing.
  const strip = (o) => o && JSON.stringify({ ...o, updatedAt: undefined });
  if (existing && strip(existing) === strip(payload)) {
    console.log(`day_type.json unchanged (bulletin ${bulletin.date} ${bulletin.dayType ?? "no colour"})`);
    return;
  }

  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const preview = Object.entries(days).slice(0, 8).map(([k, v]) => `  ${k} ${WEEKDAYS[weekdayOf(k)].slice(0, 3)}  ${v}`).join("\n");
  console.log(`day_type.json updated — bulletin ${bulletin.date} (${bulletin.weekday}) ${bulletin.dayType ?? "no colour"}\n${preview}\n  …`);
}

// Only run when executed directly; the exports above are for tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
