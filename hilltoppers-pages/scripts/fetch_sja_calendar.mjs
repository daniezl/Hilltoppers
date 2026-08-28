#!/usr/bin/env node
/**
 * Syncs the unambiguous parts of St. Johnsbury Academy's public event calendar
 * into data/special_days.json and data/special_periods.json.
 *
 * Source: https://stjacademy.org/?feed=eo-events (Event Organiser iCal feed).
 * One request returns every event the site currently holds, including the full
 * HTML body in X-ALT-DESC.
 *
 * This script only handles the two day types that can be derived from an event
 * title alone, plus multi-day vacations:
 *
 *   "Late Start Schedule", "NEASC/PD Late Start Schedule",
 *   "... – late start schedules"            -> special_days  { type: "late_start" }
 *   "Labor Day – No Classes", "No Classes"  -> special_days  { type: "no_school" }
 *   "Thanksgiving Break", "Holiday Break"   -> special_periods range
 *
 * Everything else (abbreviated schedules, exams, Capstone Day, Spirit Week...)
 * needs block times the school never publishes on the website, so those days are
 * only listed in the report for a human to fill in by hand.
 *
 * Ownership: entries this script creates carry "source": "sja-calendar". It will
 * never modify or delete an entry that lacks that marker, and it will never
 * modify one where a human has already filled in a non-empty "schedule".
 */

import fs from "node:fs/promises";

const ICS_URL = "https://stjacademy.org/?feed=eo-events";
const SPECIAL_DAYS_PATH = "data/special_days.json";
const SPECIAL_PERIODS_PATH = "data/special_periods.json";
const SOURCE_TAG = "sja-calendar";

// The feed normally carries ~110 events. A much smaller number means the request
// was truncated or the plugin broke, and we must not act on it.
const MIN_EXPECTED_EVENTS = 20;

// How far ahead the report lists days that still need a hand-written schedule.
const REVIEW_HORIZON_DAYS = 45;

// ---------------------------------------------------------------------------
// Date helpers. Everything is a "YYYY-MM-DD" string in school-local terms; the
// arithmetic runs in UTC so it never shifts across a DST boundary.
// ---------------------------------------------------------------------------

const SCHOOL_TIME_ZONE = "America/New_York";

function todayInSchoolZone() {
  return new Date().toLocaleDateString("en-CA", { timeZone: SCHOOL_TIME_ZONE });
}

function toUtcDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd, amount) {
  const date = toUtcDate(ymd);
  date.setUTCDate(date.getUTCDate() + amount);
  return toYmd(date);
}

/**
 * Zero-pads a date for comparison only. Some hand-written entries use "2026-2-20";
 * both clients normalize that when reading, so the stored text is left alone and
 * only ordering/comparison goes through here.
 */
function normalizeYmd(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function compareYmd(a, b) {
  const left = normalizeYmd(a);
  const right = normalizeYmd(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function isWeekend(ymd) {
  const weekday = toUtcDate(ymd).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function eachDay(firstYmd, lastYmd) {
  const days = [];
  for (let cur = firstYmd; cur <= lastYmd; cur = addDays(cur, 1)) days.push(cur);
  return days;
}

// ---------------------------------------------------------------------------
// iCal parsing
// ---------------------------------------------------------------------------

/** Content lines are wrapped at 75 octets; continuations start with space/tab. */
function unfoldIcs(raw) {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeIcsText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, ch) =>
    ch === "n" || ch === "N" ? "\n" : ch
  );
}

function parseEvents(raw) {
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

function parseIcsDate(prop) {
  if (!prop) return null;
  const match = prop.value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return {
    ymd: `${match[1]}-${match[2]}-${match[3]}`,
    dateOnly: /VALUE=DATE(?![-\w])/i.test(prop.params),
  };
}

/**
 * Inclusive first/last day an event covers.
 *
 * All-day events use an exclusive DTEND (Thanksgiving Break 11/25 -> 11/28 means
 * 11/25 through 11/27). Timed events end at a real moment, so DTEND's own date is
 * part of the event — the school enters Winter Break that way, as a timed event
 * running 2/19 12:00 -> 3/2 13:00.
 */
function eventSpan(props) {
  const start = parseIcsDate(props.DTSTART);
  if (!start) return null;

  const end = parseIcsDate(props.DTEND);
  if (!end) return { first: start.ymd, last: start.ymd };

  const last = start.dateOnly ? addDays(end.ymd, -1) : end.ymd;
  return { first: start.ymd, last: last < start.ymd ? start.ymd : last };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const RE_LATE_START = /late start/i;
const RE_BREAK = /\bbreak\b/i;

/**
 * "No Classes" as a suffix means the school is closed:
 *   "Labor Day – No Classes", "Faculty In-Service – No Classes", "No Classes"
 */
const RE_CLOSED = /(?:^|[\s–—-])no classes\s*$/i;

/**
 * "No Classes" as a prefix means regular classes are cancelled but there is
 * still a program running that needs its own block times:
 *   "No Classes – Exams", "No Classes – Spring Day", "No Classes – Capstone/..."
 * Treating these as no_school would tell students to stay home on a school day.
 */
const RE_PROGRAM_DAY = /^\s*no classes\s*[–—-]/i;

/** Titles worth surfacing to a human even though we can't classify them. */
const RE_NEEDS_HUMAN =
  /schedule|no class|abbreviated|half day|early release|exam|capstone|spirit week|winter carnival|spring day|in-service|advisory|conference|testing|orientation|dismissal|delay/i;

function classify(events, today) {
  const dayProposals = new Map(); // ymd -> { type, details }
  const contradicted = new Set(); // days the feed describes two different ways
  const periodProposals = [];
  const needsHuman = [];
  const feedConflicts = [];

  const addDay = (ymd, type, details) => {
    if (ymd < today) return; // the day already happened; overriding it is pointless
    if (isWeekend(ymd)) return; // clients already treat weekends as no school
    if (contradicted.has(ymd)) return;

    const existing = dayProposals.get(ymd);
    if (existing && existing.type !== type) {
      feedConflicts.push(
        `${ymd}: feed claims both "${existing.details}" (${existing.type}) and "${details}" (${type}) — skipped`
      );
      dayProposals.delete(ymd);
      contradicted.add(ymd);
      return;
    }
    dayProposals.set(ymd, { type, details });
  };

  for (const props of events) {
    const title = unescapeIcsText(props.SUMMARY?.value ?? "").trim();
    if (!title) continue;

    const span = eventSpan(props);
    if (!span) continue;
    if (span.last < today) continue;

    const dates = eachDay(span.first, span.last);

    // X-ALT-DESC carries the full event body. Some days only reveal that they are
    // abnormal there — "Walk for a Healthier Community" reads "Abbreviated
    // Schedule" in the body and gives no hint in the title.
    const body = unescapeIcsText(
      props["X-ALT-DESC"]?.value ?? props.DESCRIPTION?.value ?? ""
    ).replace(/<[^>]+>/g, " ");

    if (RE_BREAK.test(title)) {
      if (dates.length > 1) {
        periodProposals.push({
          start: span.first,
          end: span.last,
          details: title,
          source: SOURCE_TAG,
        });
      } else {
        addDay(span.first, "no_school", title);
      }
      continue;
    }

    if (RE_LATE_START.test(title)) {
      for (const ymd of dates) addDay(ymd, "late_start", title);
      continue;
    }

    if (RE_PROGRAM_DAY.test(title)) {
      needsHuman.push({ date: span.first, title, reason: "program day, block times not published" });
      continue;
    }

    if (RE_CLOSED.test(title)) {
      for (const ymd of dates) addDay(ymd, "no_school", title);
      continue;
    }

    if (RE_NEEDS_HUMAN.test(title)) {
      needsHuman.push({ date: span.first, title, reason: "unclassified" });
    } else if (RE_NEEDS_HUMAN.test(body)) {
      needsHuman.push({ date: span.first, title, reason: "flagged by event body" });
    }
  }

  return { dayProposals, periodProposals, needsHuman, feedConflicts };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonical(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function isBotOwned(entry) {
  return Boolean(entry) && typeof entry === "object" && entry.source === SOURCE_TAG;
}

function hasHandWrittenSchedule(entry) {
  return Boolean(entry) && Array.isArray(entry.schedule) && entry.schedule.length > 0;
}

function mergeSpecialDays(current, dayProposals, today) {
  const merged = { ...current };
  const added = [];
  const updated = [];
  const removed = [];
  const conflicts = [];

  const sortedProposals = [...dayProposals.entries()].sort((a, b) => compareYmd(a[0], b[0]));

  for (const [ymd, proposal] of sortedProposals) {
    const entry = { type: proposal.type, details: proposal.details, source: SOURCE_TAG };
    const existing = merged[ymd];

    if (!existing) {
      merged[ymd] = entry;
      added.push(`${ymd} → ${proposal.type} (${proposal.details})`);
      continue;
    }

    if (!isBotOwned(existing)) {
      if (existing.type !== proposal.type) {
        conflicts.push(
          `${ymd}: kept hand-written "${existing.type ?? "(no type)"}" — feed says ${proposal.type} (${proposal.details})`
        );
      }
      continue;
    }

    if (hasHandWrittenSchedule(existing)) continue;

    if (!deepEqual(existing, entry)) {
      merged[ymd] = entry;
      updated.push(`${ymd} → ${proposal.type} (${proposal.details})`);
    }
  }

  // Reconcile our own future entries: if the school moved or deleted an event,
  // the stale override has to go. Past entries stay frozen because the feed drops
  // previous school years entirely (event posts get recycled with new dates).
  for (const ymd of Object.keys(merged)) {
    if (compareYmd(ymd, today) < 0) continue;
    const entry = merged[ymd];
    if (!isBotOwned(entry) || hasHandWrittenSchedule(entry)) continue;
    if (dayProposals.has(ymd)) continue;
    delete merged[ymd];
    removed.push(`${ymd} (was ${entry.type}, no longer on the calendar)`);
  }

  return { merged, added, updated, removed, conflicts };
}

function mergeSpecialPeriods(current, periodProposals, today) {
  const kept = current.filter(
    (period) => !isBotOwned(period) || compareYmd(period.end, today) < 0
  );
  const added = [];
  const removed = [];

  for (const period of current) {
    if (isBotOwned(period) && compareYmd(period.end, today) >= 0) {
      const stillProposed = periodProposals.some(
        (proposal) => proposal.start === period.start && proposal.end === period.end
      );
      if (!stillProposed) removed.push(`${period.start}..${period.end} (${period.details})`);
    }
  }

  for (const proposal of periodProposals) {
    if (compareYmd(proposal.end, today) < 0) continue;

    const alreadyKept = kept.some(
      (period) =>
        compareYmd(period.start, proposal.start) <= 0 &&
        compareYmd(proposal.end, period.end) <= 0
    );
    if (alreadyKept) continue;

    kept.push(proposal);
    const wasThere = current.some(
      (period) =>
        isBotOwned(period) && period.start === proposal.start && period.end === proposal.end
    );
    if (!wasThere) added.push(`${proposal.start}..${proposal.end} (${proposal.details})`);
  }

  kept.sort((a, b) => compareYmd(a.start, b.start));
  return { merged: kept, added, removed };
}

// ---------------------------------------------------------------------------
// Serialization
//
// Hand-rolled so that block objects stay on one line, matching how the file has
// always been written by hand. Unknown keys are preserved.
// ---------------------------------------------------------------------------

const DAY_KEY_ORDER = ["type", "details", "color", "banner", "source"];
const BLOCK_KEY_ORDER = ["name", "start", "end", "grades"];
const PERIOD_KEY_ORDER = ["start", "end", "details", "source"];

function orderedKeys(obj, preferred, trailing = []) {
  const known = new Set([...preferred, ...trailing]);
  const rest = Object.keys(obj).filter((key) => !known.has(key));
  return [...preferred, ...rest, ...trailing].filter((key) => key in obj);
}

function serializeBlock(block, indent) {
  const inner = `${indent}  `;
  const scalars = orderedKeys(block, BLOCK_KEY_ORDER, ["subBlocks"])
    .filter((key) => key !== "subBlocks")
    .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(block[key])}`);

  if (!Array.isArray(block.subBlocks)) {
    return `{ ${scalars.join(", ")} }`;
  }

  const subLines = block.subBlocks.map(
    (sub, index) =>
      `${inner}  ${serializeBlock(sub, `${inner}  `)}${index < block.subBlocks.length - 1 ? "," : ""}`
  );

  return [
    "{",
    `${inner}${scalars.join(", ")},`,
    `${inner}"subBlocks": [`,
    ...subLines,
    `${inner}]`,
    `${indent}}`,
  ].join("\n");
}

function serializeDayEntry(entry, indent) {
  const inner = `${indent}  `;
  const parts = [];

  for (const key of orderedKeys(entry, DAY_KEY_ORDER, ["schedule"])) {
    if (key === "schedule") continue;
    parts.push(`${inner}${JSON.stringify(key)}: ${JSON.stringify(entry[key])}`);
  }

  if (Array.isArray(entry.schedule)) {
    if (entry.schedule.length === 0) {
      parts.push(`${inner}"schedule": []`);
    } else {
      const blockLines = entry.schedule.map(
        (block, index) =>
          `${inner}  ${serializeBlock(block, `${inner}  `)}${index < entry.schedule.length - 1 ? "," : ""}`
      );
      parts.push([`${inner}"schedule": [`, ...blockLines, `${inner}]`].join("\n"));
    }
  }

  if (parts.length === 0) return "{}";
  return ["{", parts.join(",\n"), `${indent}}`].join("\n");
}

function serializeSpecialDays(days) {
  const dates = Object.keys(days).sort(compareYmd);
  if (dates.length === 0) return "{}\n";
  const body = dates.map(
    (date, index) =>
      `  ${JSON.stringify(date)}: ${serializeDayEntry(days[date], "  ")}${index < dates.length - 1 ? "," : ""}`
  );
  return ["{", ...body, "}", ""].join("\n");
}

function serializeSpecialPeriods(periods) {
  if (periods.length === 0) return "[]\n";
  const body = periods.map((period, index) => {
    const fields = orderedKeys(period, PERIOD_KEY_ORDER)
      .map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(period[key])}`)
      .join(",\n");
    return `  {\n${fields}\n  }${index < periods.length - 1 ? "," : ""}`;
  });
  return ["[", ...body, "]", ""].join("\n");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport({ today, eventCount, days, periods, needsHuman, feedConflicts }) {
  const lines = [
    "Synced from the [SJA event calendar](https://stjacademy.org/?feed=eo-events).",
    "",
    `Feed returned **${eventCount}** events. Reference date: **${today}** (${SCHOOL_TIME_ZONE}).`,
    "",
  ];

  const section = (title, items, empty) => {
    lines.push(`### ${title}`, "");
    if (items.length === 0) {
      lines.push(`_${empty}_`, "");
      return;
    }
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
  };

  section("Days added", days.added, "none");
  section("Days updated", days.updated, "none");
  section("Days removed (event no longer on the calendar)", days.removed, "none");
  section("Break ranges added", periods.added, "none");
  section("Break ranges removed", periods.removed, "none");

  section(
    "Kept hand-written entries that disagree with the feed",
    days.conflicts,
    "no disagreements"
  );
  section("Ambiguous events in the feed", feedConflicts, "none");

  const horizon = addDays(today, REVIEW_HORIZON_DAYS);
  const upcoming = needsHuman
    .filter((item) => item.date >= today && item.date <= horizon)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((item) => `**${item.date}** — ${item.title} _(${item.reason})_`);

  lines.push(`### Still need a hand-written schedule (next ${REVIEW_HORIZON_DAYS} days)`, "");
  if (upcoming.length === 0) {
    lines.push("_none_", "");
  } else {
    lines.push(
      "The school does not publish block times for these on the website. Fill in",
      "`schedule` by hand from the handout, and this bot will leave the day alone",
      "afterwards.",
      ""
    );
    for (const item of upcoming) lines.push(`- ${item}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

async function fetchIcs() {
  const response = await fetch(ICS_URL, {
    headers: { "User-Agent": "Hilltoppers-schedule-sync (+https://github.com/daniezl/Hilltoppers)" },
  });
  if (!response.ok) {
    throw new Error(`Calendar feed returned HTTP ${response.status}`);
  }
  return response.text();
}

async function emitGithubOutput(changed) {
  if (!process.env.GITHUB_OUTPUT) return;
  await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const today = todayInSchoolZone();

  const raw = await fetchIcs();
  const events = parseEvents(raw);
  if (events.length < MIN_EXPECTED_EVENTS) {
    throw new Error(
      `Only ${events.length} events parsed (expected at least ${MIN_EXPECTED_EVENTS}). Refusing to touch the schedule files.`
    );
  }

  const { dayProposals, periodProposals, needsHuman, feedConflicts } = classify(events, today);

  const currentDays = await readJson(SPECIAL_DAYS_PATH, {});
  const currentPeriods = await readJson(SPECIAL_PERIODS_PATH, []);

  const days = mergeSpecialDays(currentDays, dayProposals, today);
  const periods = mergeSpecialPeriods(currentPeriods, periodProposals, today);

  // Nothing this script writes may alter a hand-written entry.
  for (const [ymd, entry] of Object.entries(currentDays)) {
    if (isBotOwned(entry)) continue;
    if (!deepEqual(days.merged[ymd], entry)) {
      throw new Error(`Refusing to write: hand-written entry for ${ymd} would change`);
    }
  }
  for (const period of currentPeriods) {
    if (isBotOwned(period)) continue;
    if (!periods.merged.some((candidate) => deepEqual(candidate, period))) {
      throw new Error(
        `Refusing to write: hand-written period ${period.start}..${period.end} would be dropped`
      );
    }
  }

  const daysText = serializeSpecialDays(days.merged);
  const periodsText = serializeSpecialPeriods(periods.merged);

  // The custom serializer must be lossless.
  if (!deepEqual(JSON.parse(daysText), days.merged)) {
    throw new Error("Refusing to write: special_days serialization is not lossless");
  }
  if (!deepEqual(JSON.parse(periodsText), periods.merged)) {
    throw new Error("Refusing to write: special_periods serialization is not lossless");
  }

  const report = buildReport({
    today,
    eventCount: events.length,
    days,
    periods,
    needsHuman,
    feedConflicts,
  });

  const changeCount =
    days.added.length +
    days.updated.length +
    days.removed.length +
    periods.added.length +
    periods.removed.length;

  if (process.env.SJA_REPORT_FILE) {
    await fs.writeFile(process.env.SJA_REPORT_FILE, `${report}\n`, "utf8");
  }

  console.log(report);

  if (dryRun) {
    console.log(`\n[dry-run] ${changeCount} change(s) computed, nothing written.`);
    return;
  }

  if (changeCount === 0) {
    // Still rewrite if the on-disk text drifted from canonical form, so the next
    // real change produces a small diff instead of a whole-file reformat.
    const daysUnchanged = daysText === (await fs.readFile(SPECIAL_DAYS_PATH, "utf8").catch(() => null));
    const periodsUnchanged =
      periodsText === (await fs.readFile(SPECIAL_PERIODS_PATH, "utf8").catch(() => null));
    if (daysUnchanged && periodsUnchanged) {
      console.log("\nNo changes.");
      await emitGithubOutput(false);
      return;
    }
  }

  await fs.writeFile(SPECIAL_DAYS_PATH, daysText, "utf8");
  await fs.writeFile(SPECIAL_PERIODS_PATH, periodsText, "utf8");
  console.log(`\nWrote ${SPECIAL_DAYS_PATH} and ${SPECIAL_PERIODS_PATH}.`);
  await emitGithubOutput(true);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
