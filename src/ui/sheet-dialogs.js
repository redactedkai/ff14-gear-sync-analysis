/* What the Sheets tab's main dialog button does, as plain code: the open dialog's fields go to the store call of its
   kind, a refused form gets its error text, and a blank name is put back so the box is never left empty. The component
   (components/sheets.js) keeps the dialog on screen and calls these; the fields and the kinds are views/sheet-forms.js's
   and docs/engineering/sheets.md's. Pure: no Alpine, no document. */
import { EMPTY_NAME_TEXT } from './sheet-store.js';
import { copyName, defaultSheetName } from './sheet-ops.js';

/* The name the box of dialog `dialog` shows: the New sheet form's default name until one is typed, else what is in it.
   `dialog`: {kind: 'new' | 'copy' | 'edit-sheet' | 'edit-set' | 'delete', name, nameTyped, job, level, sync}. */
export function shownName(dialog) {
  return dialog.kind === 'new' && !dialog.nameTyped ? defaultSheetName(dialog) : dialog.name;
}

/* Puts a blank name of a refused form back, on `dialog` itself: the New sheet form follows the default name again, the
   Copy sheet form takes the next free copy name, a Name and description form takes the name saved. */
function restoreBlankName(store, dialog) {
  if (dialog.kind === 'new') {
    if (dialog.job && !shownName(dialog).trim()) dialog.nameTyped = false;
  } else if (dialog.kind === 'copy') {
    if (!dialog.name.trim())
      dialog.name = copyName(
        store.sheet(dialog.id)?.name ?? '',
        store.list().sheets.map(sheet => sheet.name),
      );
  } else if (dialog.kind === 'edit-sheet' || dialog.kind === 'edit-set') {
    if (!dialog.name.trim()) dialog.name = (dialog.kind === 'edit-sheet' ? store.sheet(dialog.id) : store.set(dialog.id))?.name ?? '';
  }
}

/* The store's answer to the main button of `dialog` (its fields as the component holds them; Delete: `what` 'sheet',
   'set' or 'unreadable', and `id`). Returns the store's {ok, error}. */
function runStoreCall(store, dialog) {
  switch (dialog.kind) {
    case 'new':
      return store.createSheet({ ...dialog, name: shownName(dialog) });
    case 'copy':
      return store.copySheet(dialog.id, dialog, dialog.ack);
    case 'edit-sheet':
      return store.editSheet(dialog.id, dialog);
    case 'edit-set':
      return store.editSet(dialog.id, dialog);
    default:
      if (dialog.what === 'sheet') return store.deleteSheet(dialog.id);
      if (dialog.what === 'set') return store.deleteSet(dialog.id);
      return store.deleteUnreadable(dialog.id);
  }
}

/* What the dialog says after a blank name was put back, by kind: the name that is back in the box is the default one
   (a new sheet, a copy) or the old one (an edit). */
const BLANK_NAME_BACK = { new: 'the default name', copy: 'the default name', 'edit-sheet': 'the old name', 'edit-set': 'the old name' };

/* Presses the main button of `dialog` against `store` (the sheet store). A refused form stays open: its blank name is put
   back on `dialog` (restoreBlankName) and the error says so. Returns {ok, error}: error is the reason shown in the
   dialog, '' when ok. */
export function submitDialog(store, dialog) {
  const result = runStoreCall(store, dialog);
  if (result.ok) return { ok: true, error: '' };
  restoreBlankName(store, dialog);
  const error = result.error ?? result.message ?? '';
  if (error === EMPTY_NAME_TEXT && BLANK_NAME_BACK[dialog.kind]) {
    return { ok: false, error: `A name cannot be empty: ${BLANK_NAME_BACK[dialog.kind]} is back in the box.` };
  }
  return { ok: false, error };
}
