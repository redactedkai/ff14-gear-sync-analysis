/* What the Sheets tab's screens are given: the sheet manager, a sheet's page, the sheet switcher after its name and the set page's
   header line, each built once per change of the sheets (views/sheet-manager.js, sheet-sets.js), and the properties of the three
   elements that draw them.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets (frame.js). */
import { deepFreeze, viewCache } from '../../view-cache.ts';
import { sheetManagerView } from '../../views/sheet-manager.js';
import { notFoundView } from '../../views/sheet-text.js';
import { setHeaderView, sheetPageView, sheetSwitcherView } from '../../views/sheet-sets.js';

/* `setPagePorts`: what a set page's element needs (null where no page is drawn: a unit test). Returns the part's members. */
export function viewPart(setPagePorts = null) {
  const managerCache = viewCache();
  const pageCache = viewCache();
  const headerCache = viewCache();

  return {
    /* The manager (sheetManagerView), built once per change of the sheets. */
    get manager() {
      const store = this.sheets;
      const list = store.list();
      return managerCache.get(String(store.rev), () => deepFreeze(sheetManagerView(list)));
    },
    /* The "not found" screen (notFoundView) while an address names a sheet or gear set that is not saved, or null. */
    get notFound() {
      const missing = this.sheets.missing;
      return missing ? notFoundView(this.sheets.sheet(missing.sheetId)) : null;
    },
    /* The open sheet's page (sheetPageView), or null. */
    get page() {
      const sheet = this.sheets.currentSheet;
      if (!sheet) {
        return null;
      }
      return pageCache.get(`${this.sheets.rev}:${sheet.id}`, () => deepFreeze(sheetPageView(sheet)));
    },
    /* The properties of <gsa-sheet-manager> (the wrapper's x-effect gives them): the manager's view while its screen is open and
       the "not found" view while that is, else null for both, and whether an edit is refused (an Auto-fill runs) or a dialog is open. */
    get managerProps() {
      const screen = this.screen;
      return {
        view: screen === 'sheets' ? this.manager : null,
        notFound: screen === 'missing' ? this.notFound : null,
        busy: this.sheets.busy,
        dialogOpen: this.dialogOpen,
      };
    },
    /* The properties of <gsa-sheet-page>: the page's view while its screen is open, else null; the Effects / Stat points choice,
       the open sheet's id, clan and party roles (the Clan and Party bonus boxes show them), what the caret menu after the sheet's
       name shows (sheetSwitcherView) and whether an edit is refused or a dialog is open. */
    get pageProps() {
      const store = this.sheets;
      const open = this.screen === 'sheet';
      const sheet = store.currentSheet;
      return {
        view: open ? this.page : null,
        figures: this.$store.app.sheetFigures,
        sheetId: store.sheetId,
        clan: sheet?.clan ?? null,
        partyRoles: sheet?.partyRoles ?? 0,
        switcher: open ? sheetSwitcherView(this.manager.rows, store.sheetId, store.busy) : null,
        busy: store.busy,
        dialogOpen: this.dialogOpen,
      };
    },
    /* The properties of <gsa-set-page> (the wrapper's x-effect gives them; the wrapper adds the set's id): its ports, its top line
       (setHeader) and whether a dialog of this tab is open (Escape then leaves a waiting Auto-fill result alone). */
    get setPageProps() {
      return { ports: setPagePorts, header: this.setHeader, dialogOpen: this.dialogOpen };
    },
    /* The set page's line: breadcrumb and the sheet's settings, read-only (setHeaderView), built once per change of the sheets, or null. */
    get setHeader() {
      const sheet = this.sheets.currentSheet;
      const gearSet = this.sheets.currentSet;
      if (!sheet || !gearSet) {
        return null;
      }
      return headerCache.get(`${this.sheets.rev}:${sheet.id}:${gearSet.id}`, () => deepFreeze(setHeaderView(sheet, gearSet)));
    },
  };
}
