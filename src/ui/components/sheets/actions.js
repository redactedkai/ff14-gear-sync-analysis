/* What the Sheets tab does for its two island elements (<gsa-sheet-manager>, <gsa-sheet-page>, elements/sheets/): their
   `sheet-action` events (elements/sheets/sheet-action.ts) are answered with a call to the store or to a dialog, and the pick of the
   caret menu after a sheet's name.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets and goMissing (frame.js), the dialog
   openers (dialog.js). */

/* The answer to each action, by its `action` name: `page` is the component, `detail` the event's detail
   (elements/sheets/sheet-action.ts). An action with a `result` field has it filled in here. */
const ANSWERS = {
  new: (page, detail) => (detail.kind === 'sheet' ? page.openNewSheet(detail.opener) : page.sheets.newSet()),
  open: (page, detail) => (detail.kind === 'sheet' ? page.sheets.openSheet(detail.id) : page.sheets.openSet(detail.id)),
  edit: (page, detail) =>
    detail.kind === 'sheet' ? page.openEditSheet(detail.id, detail.opener) : page.openEditSet(detail.id, detail.opener),
  copy: (page, detail) => (detail.kind === 'sheet' ? page.openCopy(detail.id, detail.opener) : page.sheets.copySet(detail.id)),
  delete: (page, detail) => page.askDelete(detail.kind, detail.id, detail.opener),
  move: (page, detail) =>
    detail.kind === 'sheet' ? page.sheets.moveSheet(detail.from, detail.to) : page.sheets.moveSet(detail.from, detail.to),
  step: (page, detail) => {
    detail.result =
      detail.kind === 'sheet' ? page.sheets.stepSheet(detail.index, detail.step) : page.sheets.stepSet(detail.index, detail.step);
  },
  'to-manager': page => page.sheets.openManager(),
  'leave-missing': page => page.goMissing(),
  figures: (page, detail) => page.$store.app.setSheetFigures(detail.mode),
  level: (page, detail) => {
    detail.result = page.sheets.setLevel(detail.value);
  },
  cap: (page, detail) => {
    detail.result = page.sheets.setCap(detail.value);
  },
  sync: (page, detail) => {
    detail.result = page.sheets.setSyncOn(detail.on);
  },
  clan: (page, detail) => page.sheets.setClan(detail.name || null),
  party: (page, detail) => page.sheets.setPartyRoles(detail.value),
};

/* Returns the part's members. */
export function actionsPart() {
  return {
    /* An action of one of the two elements (`detail`, the `sheet-action` event's detail). */
    onSheetAction(detail) {
      ANSWERS[detail.action](this, detail);
    },

    /* A pick in the caret menu after a sheet's name (`pick`: {kind, id, opener}, the <gsa-switch-menu> element's switch-pick event):
       the manager, another sheet, or a new sheet's dialog. */
    pickSheet(pick) {
      if (pick.kind === 'all') {
        this.sheets.openManager();
      } else if (pick.kind === 'item') {
        if (pick.id !== this.sheets.sheetId) {
          this.sheets.openSheet(pick.id);
        }
      } else {
        this.sheets.openManager();
        this.openNewSheet(pick.opener);
      }
    },
  };
}
