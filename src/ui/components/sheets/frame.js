/* The frame of the Sheets tab: start (a dialog left open closing), the screen to draw, the breadcrumb links of the set page, and
   running a step after Alpine has drawn.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: dialog and closeDialog (dialog.js). */

import { followInPage } from '../../router/plain-click.js';
import { afterDraw } from '../compose.js';

/* Returns the part's members. */
export function framePart() {
  // the component's own element, kept at init: `this.$el` is the element a handler ran on, and a click can remove that
  // element (a dialog's button), so after one `this.$el` is no longer in the page
  let tabEl = null;

  return {
    init() {
      tabEl = this.$el;
      // a dialog left open by a change of tab, sheet or gear set would stay in the way (and its page behind inert): it closes
      // (Back and Forward also close it, through the dialog's own popstate listener); the router owns the focus then
      for (const key of ['$store.app.tab', '$store.sheets.sheetId', '$store.sheets.setId']) {
        this.$watch(key, () => {
          if (this.dialog) {
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
    /* TODO: after a click on a sheet name, a set name or a breadcrumb the focus ends on the page body, because the link is gone with
       its screen (as before the refactor). Moving the focus to the new screen's heading, as Back and Forward do, would remove this. */
    /* A breadcrumb link (`event` its click): 'sheets' the manager, 'sheet' the open sheet's page. Only a plain click moves
       inside the page; any other click is left to the browser (plain-click.js). */
    goCrumb(to, event) {
      followInPage(event, () => {
        if (to === 'sheets') {
          this.sheets.openManager();
        } else {
          this.sheets.closeSet();
        }
      });
    },
    /* Runs `callback` once Alpine has drawn the change just made, unless the component's element is gone by then (as the
       set page's afterDraw). */
    afterDraw(callback) {
      afterDraw(this, () => tabEl, callback);
    },
  };
}
