/* Story of <gsa-sheet-dialog>: the New sheet dialog, open, as the Sheets tab plays it: the dialogs model (elements/sheets/sheet-dialogs-model.ts)
   over a sheets store stand-in that records the sheet it is asked to create (`create:<name>:<job>` in the `events` output), the element
   given the model's view and answering with its actions, and the button that opened the dialog behind it. */
import { html } from 'lit';
import '../../../src/ui/elements/sheets/sheet-dialog.ts';
import { SheetDialogs } from '../../../src/ui/elements/sheets/sheet-dialogs-model.ts';
import { FORM_FIELD } from '../../../src/ui/sheets/ops.ts';

/* The words the specs look for. */
export const TITLE = 'New sheet';
export const OPENER_LABEL = 'New sheet opener';

/* The sheets store's part that a New sheet dialog uses: nothing saved; a create with a job is recorded and accepted, one without is
   refused at the Job field as the store does. */
function sheetsStandIn(record) {
  return {
    busy: false,
    sheet: () => null,
    set: () => null,
    list: () => ({ sheets: [], unreadable: [] }),
    createSheet: fields => {
      if (!fields.job) {
        return { ok: false, error: 'Choose a job.', field: FORM_FIELD.job };
      }
      record([`create:${fields.name}:${fields.job}`]);
      return { ok: true };
    },
  };
}

/* The dialog, open over its opener button. */
export const Default = () => {
  const seen = [];
  const record = parts => {
    seen.push(...parts);
    const output = document.querySelector('[data-testid="events"]');
    if (output) {
      output.textContent = JSON.stringify(seen);
    }
  };
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.textContent = OPENER_LABEL;
  const dialog = document.createElement('gsa-sheet-dialog');
  const model = new SheetDialogs({
    sheets: sheetsStandIn(record),
    onChange: () => {
      dialog.view = model.view();
    },
  });
  dialog.addEventListener('dialog-action', event => model.act(event.detail));
  dialog.addEventListener('dialog-closed', () => model.afterClosed());
  model.openNewSheet(opener);
  return html`${opener}${dialog}<output data-testid="events" hidden></output>`;
};
