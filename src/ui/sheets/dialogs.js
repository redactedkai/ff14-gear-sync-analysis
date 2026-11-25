/* What the Sheets tab's main dialog button does, as plain code: the open dialog's fields go to the store call of its
   kind, and a refused form gets its error text and the field the text is about. A refused form is left as it is (a blank
   name stays blank; the dialog marks the box). The dialogs model (elements/sheets/sheet-dialogs-model.ts) keeps the dialog on screen and calls
   these; the fields and the kinds are views/sheet-forms.js's and docs/engineering/sheets.md's. Pure: no document. */
import { defaultSheetName } from './ops.js';

/* The name the box of dialog `dialog` shows: the New sheet form's default name until one is typed, else what is in it.
   `dialog`: {kind: 'new' | 'copy' | 'edit-sheet' | 'edit-set' | 'delete', name, nameTyped, job, level, sync}. */
export function shownName(dialog) {
  return dialog.kind === 'new' && !dialog.nameTyped ? defaultSheetName(dialog) : dialog.name;
}

/* The store's answer to the main button of `dialog` (its fields as the component holds them; Delete: `what` 'sheet',
   'set' or 'unreadable', and `id`). Returns the store's {ok, error, field?}. */
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
      if (dialog.what === 'sheet') {
        return store.deleteSheet(dialog.id);
      }
      if (dialog.what === 'set') {
        return store.deleteSet(dialog.id);
      }
      return store.deleteUnreadable(dialog.id);
  }
}

/* Presses the main button of `dialog` against `store` (the sheet store). A refused form stays open, as it is. Returns
   {ok, error, field}: error is the reason shown in the dialog ('' when ok), field the form field it is about (a
   ops.js FORM_FIELD value; '' for a reason about the sheet or the page, which shows in the title row). */
export function submitDialog(store, dialog) {
  const result = runStoreCall(store, dialog);
  if (result.ok) {
    return { ok: true, error: '', field: '' };
  }
  return { ok: false, error: result.error ?? result.message ?? '', field: result.field ?? '' };
}
