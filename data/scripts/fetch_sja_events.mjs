#!/usr/bin/env node
/**
 * Turns St. Johnsbury Academy's public event calendar into public/events.json,
 * the feed the Chrome extension renders as the week strip.
 *
 * Unlike fetch_sja_calendar.mjs this is pure derived data with no hand-written
 * parts, so it is safe to regenerate and commit directly.
 *
 * Every event the feed holds is included (the school only keeps about two school
 * years), so the file changes only when the school edits something.
 */

import fs from "node:fs/promises";
import {
  ICS_URL,
  RE_AFFECTS_DAY,
  RE_BREAK,
  eventBodyText,
  eventIdFromUid,
  eventSpan,
  fetchIcs,
  parseEvents,
  parseIcsDate,
  parseIcsTime,
  unescapeIcsText,
} from "./lib/ics.mjs";

const OUT_PATH = "public/events.json";

// The feed normally carries ~110 events. A much smaller number means the request
// was truncated or the plugin broke, and we must not overwrite good data with it.
const MIN_EXPECTED_EVENTS = 20;

const DESCRIPTION_LIMIT = 300;

/**
 * Only the strongest phrases count when they appear in the body rather than the
 * title. "Walk for a Healthier Community" says "Abbreviated Schedule" only in its
 * body, but a body that merely mentions a "schedule" or a "conference" is not
 * evidence of anything.
 */
const RE_BODY_AFFECTS_DAY = /abbreviated|late start|half day|early release|early dismissal|no classes/i;

function kindOf(title, body, spanDays) {
  if (RE_BREAK.test(title)) return spanDays > 1 ? "break" : "schedule";
  if (RE_AFFECTS_DAY.test(title)) return "schedule";
  if (RE_BODY_AFFECTS_DAY.test(body)) return "schedule";
  return "event";
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
}

/** "20260817T150711Z" -> "2026-08-17T15:07:11Z" */
function icsStampToIso(value) {
  const match = (value ?? "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

function toRecord(props) {
  const title = unescapeIcsText(props.SUMMARY?.value ?? "").trim();
  if (!title) return null;

  const span = eventSpan(props);
  if (!span) return null;

  const start = parseIcsDate(props.DTSTART);
  const allDay = Boolean(start?.dateOnly);
  const spanDays = Math.round(
    (Date.parse(`${span.last}T00:00:00Z`) - Date.parse(`${span.first}T00:00:00Z`)) / 86400000
  ) + 1;
  const body = eventBodyText(props);

  return {
    id: eventIdFromUid(props) ?? `${span.first}:${title}`,
    title,
    start: span.first,
    end: span.last,
    allDay,
    startTime: allDay ? null : parseIcsTime(props.DTSTART),
    endTime: allDay ? null : parseIcsTime(props.DTEND),
    kind: kindOf(title, body, spanDays),
    description: truncate(body.replace(/\s*\n\s*/g, " "), DESCRIPTION_LIMIT),
    url: unescapeIcsText(props.URL?.value ?? "").trim() || null,
  };
}

function compareRecords(a, b) {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  // All-day first, then by clock time.
  if ((a.startTime === null) !== (b.startTime === null)) return a.startTime === null ? -1 : 1;
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.title.localeCompare(b.title);
}

async function main() {
  const raw = await fetchIcs();
  const parsed = parseEvents(raw);
  if (parsed.length < MIN_EXPECTED_EVENTS) {
    throw new Error(
      `Only ${parsed.length} events parsed (expected at least ${MIN_EXPECTED_EVENTS}). Keeping the existing ${OUT_PATH}.`
    );
  }

  const seen = new Set();
  const events = [];
  let newestModified = null;

  for (const props of parsed) {
    const record = toRecord(props);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    events.push(record);

    const modified = icsStampToIso(props["LAST-MODIFIED"]?.value);
    if (modified && (!newestModified || modified > newestModified)) newestModified = modified;
  }

  events.sort(compareRecords);

  const payload = {
    source: ICS_URL,
    sourceUpdatedAt: newestModified,
    events,
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;

  const existing = await fs.readFile(OUT_PATH, "utf8").catch(() => null);
  if (existing === text) {
    console.log(`${OUT_PATH} unchanged (${events.length} events).`);
    return;
  }

  await fs.writeFile(OUT_PATH, text, "utf8");
  const byKind = events.reduce((acc, e) => ((acc[e.kind] = (acc[e.kind] ?? 0) + 1), acc), {});
  console.log(`Wrote ${OUT_PATH}: ${events.length} events`, byKind);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
