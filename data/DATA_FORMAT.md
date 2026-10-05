# special_days.json Format Guide

How to write entries in `public/special_days.json`.

This file is the source of truth for special days, edited by hand and committed to
git. Cloudflare Pages serves it as a static asset, and both the iOS app and the
Chrome extension fetch it directly from there.

## Dates

Always `yyyy-mm-dd` with two-digit month and day: `2026-01-05`, not `2026-1-5`.
Some code compares these as strings, and `"2026-09-04" <= "2026-1-5"` is true.
The same applies to `start` / `end` in `special_periods.json`.

## Day colour

Whether a day is Green or White is worked out **once**, by
`scripts/fetch_day_type.mjs`, and published as `public/day_type.json`. The
rules it applies:

1. A day is a **school day** unless it is a weekend, falls inside a period in
   `special_periods.json`, or has `"type": "no_school"` here. An entry of any
   other type makes it a school day even on a weekend.
2. Each school day **flips** the colour of the previous school day. The
   starting point is the most recent Daily Bulletin.
3. **`"color": "green"` or `"color": "white"` on an entry overrides the flip for
   that day, and the sequence continues from it.** "May 18 is White" means May
   19 is Green. Use this when the school announces a colour that breaks the
   pattern.
4. The bulletin's own date takes the bulletin's colour regardless of `color`.

`color` is only needed when the pattern is broken. Most special days — late
starts, custom schedules — do not need it; they are still ordinary school days
in the alternation.

## Grade-Specific Blocks

Add a `"grades"` field to any block that only applies to certain grades. Blocks without `"grades"` are shown to all students.

`"grades"` is an array of grade numbers: `9` (Freshman), `10` (Sophomore), `11` (Junior), `12` (Senior).

### Example

On 4/16, grades 9–10 have Fashion Show first while grades 11–12 have Advisor Meetings, then they swap. The rest of the day is shared.

```json
{
  "2026-04-16": {
    "type": "custom",
    "details": "Fashion Show",
    "schedule": [
      { "name": "Fashion Show",     "start": "8:00", "end": "8:30", "grades": [9, 10] },
      { "name": "Advisor Meetings", "start": "8:00", "end": "8:30", "grades": [11, 12] },
      { "name": "Advisor Meetings", "start": "8:40", "end": "9:10", "grades": [9, 10] },
      { "name": "Fashion Show",     "start": "8:40", "end": "9:10", "grades": [11, 12] },
      { "name": "A Block",          "start": "9:20", "end": "10:10" },
      { "name": "B Block",          "start": "10:15", "end": "11:05" }
    ]
  }
}
```

### Rules

- **No `"grades"` = everyone.** Only add the field when grades differ.
- **Same time slot, different grades.** Write one block per grade group with the same `start`/`end`. The app filters by the user's grade so they only see their version.
- **Different time slots per grade.** Each block has its own `start`/`end`, so this works naturally — just tag each with `"grades"`.
- **Valid values:** `9`, `10`, `11`, `12`. You can use any combination (e.g. `[9]`, `[10, 11, 12]`, `[9, 10, 11, 12]`).
- **Backward compatible.** Old app versions that don't understand `"grades"` will show all blocks (they just ignore the extra field).

## Naming Conventions

`details` is the schedule's display title, not a description or notes field.
Keep it short (for example, `"Walk for a Healthy Community"`). Do not append
instructions, activity start times, or other explanatory sentences.

When transcribing a schedule from an official PDF/handout into JSON, follow these rules so blocks render consistently across the app:

| In the official schedule | Write in JSON as | Reason |
| --- | --- | --- |
| `Conference Period` | `CP` | "CP" is what students actually call it, and it keeps the row compact. |
| `Interdisciplinary Time` | *(omit entirely)* | Nobody uses this slot — leaving it out keeps the day's schedule clean. |

### Example

The official Senior Breakfast Schedule (5/14/2026) ends with:

```
Conference Period: 2:45 – 3:05
Interdisciplinary Time: 3:05 – 3:30
```

In JSON:

```json
{ "name": "CP", "start": "14:45", "end": "15:05" }
```

(Note: `Interdisciplinary Time` is dropped entirely, and `Conference Period` becomes `CP`.)

## Generated menu history

For the generated `public/menu.json`, the `days` map retains recorded menus
from the previous seven calendar days, plus today and up to seven future days.
Each successful refresh drops history older than that window. Missing historical
days are not invented or fetched again; previously deleted menus will not be
restored by this retention rule. `menuDate` and `menus` still describe today for
older clients. Edit the generator, not the generated JSON.

## Schedule review issues

**Sync SJA calendar** opens one GitHub issue per unresolved calendar event in the
next 45 days, with a checklist for each affected weekday. Multi-day events such
as Spirit Week share one issue; different event occurrences stay separate.
It reports even when no data PR is needed. Repeated runs update the existing
open issue instead of creating duplicates. These issues do not change the
extension's interface, timetable, or countdown.

All these issues receive the `schedule-review` label. The workflow creates the
label if needed and preserves other labels. Existing date-based issues are
consolidated into the oldest open issue for that event; duplicates are closed
with a reference to the retained issue, keeping their discussions accessible.

Tick each date's checkbox after verifying it; manual checks survive later runs.
Close the whole issue when the event's timetable is confirmed; the bot respects
manual closure. Merged custom schedules, no-school entries, and breaks also
resolve the corresponding dates. Automatic closure requires every checklist
date to be resolved. An event vanishing from the feed or a date passing does
not by itself count as a fix.
