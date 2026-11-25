/* The sheet manager (the Sheets tab's first level): every saved sheet as a row, the unreadable records, and the empty
   state. Takes what sheets/storage.js loadSheets returns and builds a plain view object; the template only displays it.
   Pure: no Alpine, no store. Rules: docs/engineering/sheets.md ("Saved data", "Reading and writing"). */
import { jobById } from '../../core/constants.js';
import { patchOnDay } from '../../core/patches.js';
import { UNAVAILABLE_MESSAGE } from '../sheets/storage.js';
import { localDate, syncShort } from './sheet-text.js';

/* The manager's column names, in the order of a row's cells. */
const MANAGER_COLUMNS = Object.freeze(['Sheet', 'Job', 'Level / IL', 'Sets', 'Created', 'Changed', 'Patch']);

/* The hover text of a sheet's Patch cell for its `gameData` ({commit, date}, either may be missing or empty): "Game data
   d9582a6, 2026-09-30", "Game data 2026-09-30" with no commit, '' with no date. */
function dataTitle(gameData) {
  if (!gameData?.date) {
    return '';
  }
  return `Game data ${gameData.commit ? `${gameData.commit}, ` : ''}${gameData.date}`;
}

/* The text of the manager for `loaded` (loadSheets' result: {available, sheets, unreadable, indexProblem}). Returns:
   - unavailableText: UNAVAILABLE_MESSAGE when storage cannot be used, else '';
   - empty: no readable sheet; emptyCard {title, text, buttonText} is the "No sheets yet" card (the header's New sheet
     button shows only with sheets: showNewButton);
   - columns: MANAGER_COLUMNS; rows: one per sheet in the user's order, {id, name (the full name, also the hover text),
     descriptionLine (its first line, or "No description"), hasDescription, jobId, jobName, settingsText ("Lv 100 / IL
     123"), setCount, created, changed ("2026-11-09"), patch (the game patch of the data it was made with, "7.56": the
     newest patch released on or before the data's date, patchOnDay; '' when the sheet names no data date), patchTitle
     (the hover text of that cell: the data's short commit and date, "Game data d9582a6, 2026-09-30"; '' with no date)};
   - unreadable: the records that could not be read, {id, key, cause, text ("Could not be read: not valid JSON")}, each
     with a Delete button; unreadableTitle is their heading. */
export function sheetManagerView(loaded) {
  const rows = loaded.sheets.map(sheet => {
    const descriptionLine = (sheet.description ?? '').split('\n')[0];
    return {
      id: sheet.id,
      name: sheet.name,
      descriptionLine: descriptionLine || 'No description',
      hasDescription: !!descriptionLine,
      jobId: sheet.job,
      jobName: jobById(sheet.job).name,
      settingsText: syncShort(sheet),
      setCount: sheet.sets.length,
      created: localDate(sheet.createdAt),
      changed: localDate(sheet.updatedAt),
      patch: patchOnDay(sheet.gameData?.date),
      patchTitle: dataTitle(sheet.gameData),
    };
  });
  return {
    title: 'Sheets',
    unavailableText: loaded.available ? '' : UNAVAILABLE_MESSAGE,
    empty: rows.length === 0,
    showNewButton: rows.length > 0,
    emptyCard: {
      title: 'No sheets yet',
      text: 'A sheet is for one piece of content: a job, a level and an IL Sync. It holds the gear sets you compare for it.',
      buttonText: 'New sheet',
    },
    columns: MANAGER_COLUMNS,
    rows,
    unreadableTitle: 'Could not be read',
    unreadable: loaded.unreadable.map(record => ({ ...record, text: `Could not be read: ${record.cause}` })),
  };
}
