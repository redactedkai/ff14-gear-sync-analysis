/* Short texts the sheet views share: a sheet's settings in a few words, and dates. Pure: no store. */

/* A time in milliseconds since 1970 (UTC, as saved) as a date in a time zone, "2026-11-09" (the manager's Created and
   Changed columns). `timeZone` is an IANA name; without one, the browser's own time zone. */
export function localDate(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms);
}

/* A sheet's level and item level sync in a few words, "Lv 100 / IL 123" ("Lv 100 / IL sync off"); the manager's row.
   `sheet`: a saved Sheet (docs/engineering/sheets.md). */
export function syncShort(sheet) {
  return `Lv ${sheet.level} / ${sheet.sync.on ? `IL ${sheet.sync.cap}` : 'IL sync off'}`;
}

/* The read-only line of a set page, "Sage · Level 100 · IL Sync 123" (job given as its name). */
export function settingsLine(sheet, jobName) {
  return `${jobName} · Level ${sheet.level} · IL Sync ${sheet.sync.on ? sheet.sync.cap : 'off'}`;
}

/* The "not found" screen of an address that names a sheet or gear set that is not saved in this browser (the router,
   router/router.ts): the page's title line, its text and the button that goes up. `sheet`: the saved sheet the address
   names, or null when that sheet is not saved (then the sheet is what is missing; else its gear set is). Returns {title,
   text, buttonText, target ('sheets': the manager, 'sheet': the sheet's page)}. */
export function notFoundView(sheet) {
  if (!sheet) {
    return {
      title: 'Sheet not found',
      text: "This sheet is not saved in this browser. A sheet's address only works in the browser that saved it, and not after the sheet is deleted.",
      buttonText: 'Go to Sheets',
      target: 'sheets',
    };
  }
  return {
    title: 'Gear set not found',
    text: `The sheet “${sheet.name}” has no gear set with this address. The gear set may have been deleted.`,
    buttonText: `Go to “${sheet.name}”`,
    target: 'sheet',
  };
}
