# special_days.json Format Guide

How to write entries in `data/special_days.json`.

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
