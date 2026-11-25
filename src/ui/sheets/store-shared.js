/* The words and small helpers the Sheets tab's store shares with the page's other store (ui/store/sheets-actions.ts): the
   reasons an action is refused, the notes after a copy or a delete, and the one way the saved sheets are read. Pure: no DOM. */
import { loadSheets } from './storage.js';
import { repairSheet } from './ops.js';

/* Why an edit is refused while an Auto-fill runs. */
export const LOCKED_TEXT = 'Nothing can be edited while Auto-fill is running.';
/* Why a name is refused (a New sheet, Copy sheet, Edit sheet or Edit gear set form; the box stays as it is). */
export const EMPTY_NAME_TEXT = 'Name cannot be empty.';
/* Why a New sheet form is refused with no job picked. */
export const JOB_REQUIRED_TEXT = 'Choose a job.';
/* Why a Copy sheet form is refused while the pieces the new job cannot wear are not accepted as cleared. */
export const ACK_REQUIRED_TEXT = 'Tick the box to clear the pieces the job cannot wear.';
/* Why an action on a sheet is refused when the sheet no longer exists (deleted in another tab). */
export const SHEET_GONE_TEXT = 'The sheet is gone.';

/* A refusal: {ok: false, error (the reason, for the user)} and, when the reason is about one field of a form, `field` (a
   FORM_FIELD value: the dialog marks that field and shows the reason in its label row). */
export function refuse(error, field) {
  return field ? { ok: false, error, field } : { ok: false, error };
}

/* The note after a sheet or a gear set is copied: `name` is the copy's name. */
export function copiedNote(name) {
  return `Copied as “${name}”.`;
}

/* loadSheets(storage) with each sheet's level and cap repaired (sheets/ops.js repairSheet): a saved cap above what its level
   allows is lowered as the page lowers a typed one. The repair is written with the sheet's next edit. */
export function readSheets(storage) {
  const loaded = loadSheets(storage);
  return { ...loaded, sheets: loaded.sheets.map(repairSheet) };
}

/* Why an action on the open sheet is refused when no sheet is open. */
export const NO_SHEET_OPEN_TEXT = 'No sheet is open.';
/* Why an action on a gear set is refused when the set no longer exists. */
export const SET_GONE_TEXT = 'The gear set is gone.';

/* The note after the sheet called `name` is deleted. */
export function deletedSheetNote(name) {
  return `Deleted “${name}” sheet.`;
}

/* The note after the gear set called `name` is deleted. */
export function deletedSetNote(name) {
  return `Deleted “${name}” gear set.`;
}
