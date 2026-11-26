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

/* The sheets store's part that a New sheet dialog uses: nothing saved; a create with a job and a name is recorded and accepted, one
   without a job is refused at the Job field and a blank name at the Name field, as the store does. */
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
      if (!String(fields.name).trim()) {
        return { ok: false, error: 'Give the sheet a name.', field: FORM_FIELD.name };
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

/* A White Mage sheet with one gear set holding the Ironworks Magitek Cane (game id 8645, no other healer wears it) in its weapon row:
   copying it to Astrologian clears the weapon, which the Copy dialog warns about. */
const CANE_SHEET = {
  v: 1,
  id: 's_cane',
  name: 'Canes',
  description: '',
  job: 'WHM',
  level: 100,
  sync: { on: false, cap: 795 },
  sets: [
    {
      id: 'g_cane',
      name: 'Mine',
      description: '',
      pieces: ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'].map(slot =>
        slot === 'weapon' ? { slot, gameId: 8645, stones: [] } : { slot },
      ),
      meal: null,
      pinned: { pieces: [], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};

/* The sheets store's part that a Copy dialog uses: the one sheet; a copy that is not acknowledged is refused at the box of the warning,
   as the store does. */
const copyStandIn = {
  busy: false,
  sheet: () => CANE_SHEET,
  set: () => null,
  list: () => ({ sheets: [CANE_SHEET], unreadable: [] }),
  copySheet: (_id, _fields, ack) => (ack ? { ok: true } : { ok: false, error: 'Tick the box to copy.', field: FORM_FIELD.ack }),
};

/* The Copy sheet dialog, open for the canes sheet over its opener button (pick Astrologian to see the warning). */
export const Copy = () => {
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.textContent = OPENER_LABEL;
  const dialog = document.createElement('gsa-sheet-dialog');
  const model = new SheetDialogs({
    sheets: copyStandIn,
    onChange: () => {
      dialog.view = model.view();
    },
  });
  dialog.addEventListener('dialog-action', event => model.act(event.detail));
  dialog.addEventListener('dialog-closed', () => model.afterClosed());
  model.openCopy(CANE_SHEET.id, opener);
  return html`${opener}${dialog}`;
};
