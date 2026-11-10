/* Short texts the sheet views share: a sheet's settings in a few words, and dates. Pure: no Alpine, no store. */

/* A time in milliseconds since 1970 (UTC, as saved) as a date in a time zone, "2026-11-09" (the manager's Created and
   Changed columns). `timeZone` is an IANA name; without one, the browser's own time zone. */
export function localDate(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms);
}

/* A sheet's level and item level sync in a few words, "Lv 100, ilvl 123" ("Lv 100, ilvl sync off"); the manager's row.
   `sheet`: a saved Sheet (docs/engineering/sheets.md). */
export function syncShort(sheet) {
  return `Lv ${sheet.level}, ${sheet.sync.on ? `ilvl ${sheet.sync.cap}` : 'ilvl sync off'}`;
}

/* The read-only line of a set page, "Sage · Level 100 · Item level sync 123" (job given as its name). */
export function settingsLine(sheet, jobName) {
  return `${jobName} · Level ${sheet.level} · Item level sync ${sheet.sync.on ? sheet.sync.cap : 'off'}`;
}
