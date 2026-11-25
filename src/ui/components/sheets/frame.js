/* The frame of the Sheets tab: start (a dialog left open closing) and the screen to draw.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: dialogOpen and closeDialog (dialog.js). */

/* Returns the part's members. */
export function framePart() {
  return {
    init() {
      // a dialog left open by a change of tab, sheet or gear set would stay in the way (and its page behind inert): it closes
      // (Back and Forward also close it, through the popstate listener on the dialog's wrapper); the router owns the focus then
      for (const key of ['$store.app.tab', '$store.sheets.sheetId', '$store.sheets.setId']) {
        this.$watch(key, () => {
          if (this.dialogOpen) {
            this.closeDialog(false);
          }
        });
      }
    },

    get sheets() {
      return this.$store.sheets;
    },

    /* The screen to draw: 'missing' (not found) while an address names a sheet or set that is not saved; else the open
       sheet or set's, or the manager when it is gone (another browser tab deleted it). */
    get screen() {
      const store = this.sheets;
      if (store.missing) {
        return 'missing';
      }
      if (store.screen === 'set' && store.currentSet) {
        return 'set';
      }
      if (store.screen !== 'sheets' && store.currentSheet) {
        return 'sheet';
      }
      return 'sheets';
    },
    /* The not found screen's button: up to the sheet when only its gear set is missing, else the manager. */
    goMissing() {
      const missing = this.sheets.missing;
      if (missing?.setId && this.sheets.sheet(missing.sheetId)) {
        this.sheets.openSheet(missing.sheetId);
      } else {
        this.sheets.openManager();
      }
    },
  };
}
