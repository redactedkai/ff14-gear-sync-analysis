/* What the Sheets screen (`<gsa-sheets-screen>`, sheets-screen.ts) shows and does, as plain code that runs in Node: the screen to
   draw, the views and properties of the three screen elements (<gsa-sheet-manager>, <gsa-sheet-page>, <gsa-set-page>), the set
   page's top line, the answers to the elements' events (sheet-answers.ts) and the open dialog (sheet-dialogs-model.ts). The element
   keeps no state of its own: it asks the model for each property and draws again when the store parts in `sheetsSelection`, or the
   dialog, change. Rules: docs/engineering/sheets.md. */
import type { AppFacade } from '../../store/app-facade.ts';
import type { AppState, AppStore } from '../../store/app-state.ts';
import type { SheetsFacade } from '../../store/sheets-facade.ts';
import { deepFreeze, viewCache } from '../../view-cache.ts';
import { sheetManagerView } from '../../views/sheet-manager.js';
import { notFoundView } from '../../views/sheet-text.js';
import { setHeaderView, sheetPageView, sheetSwitcherView } from '../../views/sheet-sets.js';
import type { SetPagePorts } from '../set-page/session-types.ts';
import type { SetPageHeader } from '../set-page/set-page.ts';
import type { SheetAction } from './sheet-action.ts';
import { type AnswerPort, answerSheetAction, pickSheet } from './sheet-answers.ts';
import { SheetDialogs } from './sheet-dialogs-model.ts';
import type { SwitchPick } from './switch-menu.ts';

/* What the screen needs of the rest of the page: the store (to follow), the two facades (to read, and their actions) and what a set
   page's element needs (main.js makes it once, frozen). */
export interface SheetsScreenPorts {
  store: AppStore;
  app: AppFacade;
  sheets: SheetsFacade;
  setPagePorts: SetPagePorts;
}

/* The parts of the store the screen draws from, as one flat object of values (compare with `shallowEq`): the Sheets tab's screen,
   open sheet and gear set, the "not found" address, the saved sheets (replaced by every edit, never changed in place), whether an
   Auto-fill locks the edits, the open tab (a change of tab closes a dialog) and the Effects / Stat points choice. The note and the
   save message are the page's notes element's, so a note after an action draws nothing here. `SheetsScreenModel` reads exactly
   this (through the facades): a field it starts to read needs a field here. */
export function sheetsSelection(state: AppState) {
  const { sheets, screen, settings } = state;
  return {
    screen: sheets.screen,
    sheetId: sheets.sheetId,
    setId: sheets.setId,
    missing: sheets.missing,
    data: sheets.data,
    busy: sheets.busy,
    tab: screen.tab,
    sheetFigures: settings.sheetFigures,
  };
}

/* The screen the Sheets tab draws. */
export type SheetsScreenName = 'missing' | 'set' | 'sheet' | 'sheets';

/* The properties of <gsa-set-page> besides its set's id: its ports, its top line (null while the set is gone) and a function that
   says whether a dialog of this screen is open (Escape on the page then leaves a waiting Auto-fill result alone). */
export interface SetPageProps {
  ports: SetPagePorts;
  header: SetPageHeader | null;
  dialogIsOpen: () => boolean;
}

/* The screen's state and logic; see the file header. `onDialogChange` is called after each change of the open dialog (the element
   draws again). */
export class SheetsScreenModel implements AnswerPort {
  readonly sheets: SheetsFacade;
  readonly app: AppFacade;
  readonly dialogs: SheetDialogs;
  // whether a dialog is open, as one function for good (a new one on each draw would make the set page draw again each time)
  readonly dialogIsOpen = () => this.dialogs.isOpen;
  private readonly setPagePorts: SetPagePorts;
  private readonly managerCache = viewCache<ReturnType<typeof sheetManagerView>>();
  private readonly pageCache = viewCache<ReturnType<typeof sheetPageView>>();
  private readonly headerCache = viewCache<SetPageHeader>();
  // the tab, sheet and gear set at the last `follow`, to tell a change of page from any other change
  private lastPlace: string | null = null;

  constructor({ app, sheets, setPagePorts }: Omit<SheetsScreenPorts, 'store'>, onDialogChange: () => void) {
    this.app = app;
    this.sheets = sheets;
    this.setPagePorts = setPagePorts;
    this.dialogs = new SheetDialogs({ sheets, onChange: onDialogChange });
  }

  /* A dialog left open by a change of tab, sheet or gear set would stay in the way (and its page behind locked): it closes. The
     router owns the focus then. Back and Forward close it too (the element's popstate listener calls `dialogs.close(false)`).
     Called before each draw. */
  follow(): void {
    const place = `${this.app.tab}|${this.sheets.sheetId}|${this.sheets.setId}`;
    const moved = this.lastPlace !== null && place !== this.lastPlace;
    this.lastPlace = place;
    if (moved) {
      this.dialogs.close(false);
    }
  }

  /* The screen to draw: 'missing' (not found) while an address names a sheet or set that is not saved; else the open sheet or set's,
     or the manager when it is gone (another browser tab deleted it). */
  get screen(): SheetsScreenName {
    const { sheets } = this;
    if (sheets.missing) {
      return 'missing';
    }
    if (sheets.screen === 'set' && sheets.currentSet) {
      return 'set';
    }
    if (sheets.screen !== 'sheets' && sheets.currentSheet) {
      return 'sheet';
    }
    return 'sheets';
  }

  /* The not found screen's button: up to the sheet when only its gear set is missing, else the manager. */
  goMissing(): void {
    const { missing } = this.sheets;
    if (missing?.setId && this.sheets.sheet(missing.sheetId)) {
      this.sheets.openSheet(missing.sheetId);
    } else {
      this.sheets.openManager();
    }
  }

  /* An action of one of the elements (`detail`, the `sheet-action` event's detail). */
  onSheetAction(detail: SheetAction): void {
    answerSheetAction(this, detail);
  }

  /* A pick in the caret menu after a sheet's name. */
  onSwitchPick(pick: SwitchPick): void {
    pickSheet(this, pick);
  }

  /* ---- the views ---- */

  /* The manager (sheetManagerView), built once per change of the sheets. */
  get manager() {
    const list = this.sheets.list();
    return this.managerCache.get(String(this.sheets.rev), () => deepFreeze(sheetManagerView(list)));
  }

  /* The "not found" screen (notFoundView) while an address names a sheet or gear set that is not saved, or null. */
  get notFound() {
    const { missing } = this.sheets;
    return missing ? notFoundView(this.sheets.sheet(missing.sheetId)) : null;
  }

  /* The open sheet's page (sheetPageView), or null. */
  get page() {
    const sheet = this.sheets.currentSheet;
    if (!sheet) {
      return null;
    }
    return this.pageCache.get(`${this.sheets.rev}:${sheet.id}`, () => deepFreeze(sheetPageView(sheet)));
  }

  /* The set page's line: breadcrumb and the sheet's settings, read-only (setHeaderView), built once per change of the sheets, or
     null. */
  get setHeader(): SetPageHeader | null {
    const sheet = this.sheets.currentSheet;
    const gearSet = this.sheets.currentSet;
    if (!sheet || !gearSet) {
      return null;
    }
    return this.headerCache.get(`${this.sheets.rev}:${sheet.id}:${gearSet.id}`, () => deepFreeze(setHeaderView(sheet, gearSet)));
  }

  /* ---- the properties of the elements ---- */

  /* The properties of <gsa-sheet-manager>: the manager's view while its screen is open and the "not found" view while that is, else
     null for both, and whether an edit is refused (an Auto-fill runs) or a dialog is open. */
  managerProps() {
    const { screen } = this;
    return {
      view: screen === 'sheets' ? this.manager : null,
      notFound: screen === 'missing' ? this.notFound : null,
      busy: this.sheets.busy,
      dialogOpen: this.dialogs.isOpen,
    };
  }

  /* The properties of <gsa-sheet-page>: the page's view while its screen is open, else null; the Effects / Stat points choice, the
     open sheet's id, clan and party roles (the Clan and Party bonus boxes show them), what the caret menu after the sheet's name
     shows (sheetSwitcherView) and whether an edit is refused or a dialog is open. */
  pageProps() {
    const { sheets } = this;
    const open = this.screen === 'sheet';
    const sheet = sheets.currentSheet;
    return {
      view: open ? this.page : null,
      figures: this.app.sheetFigures,
      sheetId: sheets.sheetId,
      clan: sheet?.clan ?? null,
      partyRoles: sheet?.partyRoles ?? 0,
      switcher: open ? sheetSwitcherView(this.manager.rows, sheets.sheetId, sheets.busy) : null,
      busy: sheets.busy,
      dialogOpen: this.dialogs.isOpen,
    };
  }

  /* The properties of <gsa-set-page> (the element is keyed by the set's id, which it also gets). */
  setPageProps(): SetPageProps {
    return { ports: this.setPagePorts, header: this.setHeader, dialogIsOpen: this.dialogIsOpen };
  }
}
