/* The Sheets tab's dialogs as seen by the tab's template: the bridge between the Alpine-run component and the dialogs model
   (elements/sheets/sheet-dialogs-model.ts), which holds the open dialog and its logic and runs without a page. The set page and the two
   sheet elements ask for a dialog through the openers; the wrapper of <gsa-sheet-dialog> gets `dialogProps`, answers the element's
   `dialog-action` event with `onDialogAction` and its `dialog-closed` event with `afterDialogClosed`.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets (frame.js). */
import { SheetDialogs } from '../../elements/sheets/sheet-dialogs-model.ts';

/* Returns the part's members. */
export function dialogPart() {
  // the model lives in the closure, not in the component's state: Alpine would wrap it in reactive proxies
  let model = null;
  /* The model of component `page`, made on first use; a change of its state counts in `dialogRev`, which the getters below read, so
     what shows the dialog is run again. */
  const dialogs = page => {
    model ??= new SheetDialogs({
      sheets: page.sheets,
      onChange: () => {
        page.dialogRev++;
      },
    });
    return model;
  };

  return {
    // how many times the open dialog's state has changed
    dialogRev: 0,

    /* Whether a dialog is open (the island elements lock their page while one is). */
    get dialogOpen() {
      void this.dialogRev;
      return dialogs(this).isOpen;
    },
    /* The properties of <gsa-sheet-dialog> (the wrapper's x-effect gives them): what the open dialog shows, null while none is open. */
    get dialogProps() {
      void this.dialogRev;
      return { view: dialogs(this).view() };
    },

    /* The openers: `opener` is the button that asked, which gets the focus back when the dialog closes. */
    openNewSheet(opener) {
      dialogs(this).openNewSheet(opener);
    },
    openCopy(id, opener) {
      dialogs(this).openCopy(id, opener);
    },
    openEditSheet(id, opener) {
      dialogs(this).openEditSheet(id, opener);
    },
    openEditSet(id, opener) {
      dialogs(this).openEditSet(id, opener);
    },
    /* Delete asks first: `what` 'sheet', 'set' or 'unreadable', `id` the thing's id. */
    askDelete(what, id, opener) {
      dialogs(this).askDelete(what, id, opener);
    },
    /* Closes the dialog; with `refocus` false (a change of page: the router owns the focus then) the focus stays where it is. */
    closeDialog(refocus = true) {
      dialogs(this).close(refocus);
    },
    /* What the dialog element tells (`detail`: its `dialog-action` event's DialogAction). */
    onDialogAction(detail) {
      dialogs(this).act(detail);
    },
    /* The element has removed the closed dialog's box: the opener gets the focus back. */
    afterDialogClosed() {
      dialogs(this).afterClosed();
    },
  };
}
