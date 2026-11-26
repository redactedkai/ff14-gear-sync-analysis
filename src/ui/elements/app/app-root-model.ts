/* What the page's root element (`<gsa-app>`, app-root.ts) shows and does, as a plain class of the two facades and no DOM, so Node tests
   run it: the tab links (their address, a click on one), the loading line, what the Job and sync strip and the Gear browser are
   given, the notes, and the footer's data line. `appRootSelection` says which parts of the store the root draws from: it draws again
   when one changes. */
import { dataSourceLabel } from '../../../core/tables.ts';
import { followInPage } from '../../router/plain-click.js';
import { formatRoute } from '../../router/routes.js';
import type { AppFacade } from '../../store/app-facade.ts';
import type { AppState, AppStore } from '../../store/app-state.ts';
import { partKey } from '../../store/store.ts';
import { shallowEq } from '../../store/select.ts';
import type { SheetsFacade } from '../../store/sheets-facade.ts';
import { loadExampleSheets } from '../../test-data.js';
import type { GearPanel } from '../gear-browser/gear-browser-model.ts';
import type { MathScreenPorts } from '../math-page/math-screen.ts';
import type { SheetsScreenPorts } from '../sheets/sheets-screen-model.ts';

/* What the root needs of the rest of the page: the store (to follow), the two facades (to read, and their actions) and what a set page's
   element needs (main.js makes it once, frozen). */
export type AppRootPorts = SheetsScreenPorts;

/* The tabs, in the order of the tab bar. */
export type TabName = 'sheets' | 'browse' | 'math';

/* The loading line of each tab, shown while it opens. */
const LOADING_TEXT: Record<TabName, string> = {
  sheets: 'Loading Sheets…',
  browse: 'Loading the Gear browser…',
  math: 'Loading math analysis…',
};

/* What `<gsa-job-strip>` shows (its properties): the Gear browser's panel and the open tab. */
export interface StripInput {
  job: string;
  level: number | null;
  cap: number | null;
  sync: boolean;
  maxLevel: number;
  maxReal: number;
  tab: string;
}

/* The parts of the store the root is made from, as one flat object of values (compare with `shallowEq`): the open tab, the tab a click
   is opening and the math sub-tab (the math tab link's address), the open tab's job, the Gear browser's panel and a count of its
   filters' changes (the filters change in place, so a count says when), and the note, its count and the save message. `AppRootModel`
   reads exactly this (through the facades): a field it starts to read needs a field here (app-root-model.test.ts checks it against
   real edits). `store` is the store the state belongs to. */
export function appRootSelection(store: AppStore) {
  return (state: AppState) => {
    const { screen, settings, sheets } = state;
    const { panels } = settings;
    return {
      tab: screen.tab,
      pendingTab: screen.pendingTab,
      mathTab: screen.mathTab,
      openJob: (screen.tab === 'math' ? panels.math : panels.browse).job,
      browseJob: panels.browse.job,
      browseCap: panels.browse.cap,
      browseSync: panels.browse.sync,
      browseLevel: panels.browse.level,
      browseEdits: store.revs[partKey('settings', 'browse')],
      note: sheets.noteText,
      noteSeq: sheets.noteSeq,
      saveMessage: sheets.saveMessage,
    };
  };
}

/* The root's logic; see the file header. */
export class AppRootModel {
  readonly app: AppFacade;
  readonly sheets: SheetsFacade;
  /* What each screen element is given as its `ports`: made once, so a draw of the root does not draw the screens again. */
  readonly mathPorts: MathScreenPorts;
  readonly sheetsPorts: SheetsScreenPorts;
  /* The footer's line naming the game data's source, '' when unknown. */
  readonly dataSource = dataSourceLabel();
  // the Gear browser's panel as last handed out: the same object while its values stay, so the browser does not draw again
  private lastPanel: GearPanel | null = null;

  constructor(ports: AppRootPorts) {
    this.app = ports.app;
    this.sheets = ports.sheets;
    this.mathPorts = { store: ports.store, app: ports.app };
    this.sheetsPorts = ports;
  }

  /* TEMPORARY (the "test data" button of a DEV build, ui/test-data.js): load the example sheets and show the manager. */
  loadTestData(): void {
    if (this.sheets.askLeave(() => this.loadTestData())) {
      return;
    }
    loadExampleSheets(this.sheets);
    this.app.showTab('sheets');
    this.sheets.openManager();
  }

  /* The address of tab `tab` (a tab link's href; for the math tab, the open sub-tab), so Open in new tab and Copy link give the
     screen. */
  tabHref(tab: TabName): string {
    return formatRoute(tab === 'math' ? { tab, mathTab: this.app.mathTab } : { tab });
  }

  /* Whether tab `tab` shows as the selected one: the tab being opened, else the open one. */
  isCurrent(tab: TabName): boolean {
    return (this.app.pendingTab ?? this.app.tab) === tab;
  }

  /* TODO: Safari does not Tab to links by default (a browser setting: Tab highlights each item, off), so the tab links and the math
     sub-tabs are reached there only with Option+Tab. Roving focus on the tab strip, as the tabs had as buttons, would fix it. */
  /* TODO: Space on a tab link does not open it (a link takes Enter only; the tabs were buttons, which took Space too). A keydown
     handler for Space on the tab links would bring it back. */
  /* A tab link's click (`event`): a plain click opens tab `tab`; a Ctrl, Cmd, Shift or Alt click is left to the browser
     (plain-click.js). Leaving the Sheets tab while its set page has something to settle (a manual draft, a running Auto-fill, an
     Auto-fill result waiting) asks first, with the set page's own question (ui/store/sheets-actions.ts askLeave); the answer opens the
     tab. The tab shows as selected with a loading line first (store.openTab). */
  goTab(tab: TabName, event: MouseEvent): void {
    followInPage(event, () => {
      const { app } = this;
      if (tab === (app.pendingTab ?? app.tab)) {
        return;
      }
      if (app.tab === 'sheets' && tab !== 'sheets' && this.sheets.askLeave(() => app.openTab(tab))) {
        return;
      }
      app.openTab(tab);
    });
  }

  /* The loading line while a tab opens, or '' when none is. */
  loadingText(): string {
    const { pendingTab } = this.app;
    return pendingTab ? LOADING_TEXT[pendingTab as TabName] : '';
  }

  /* The Gear browser's Job and sync panel, the same object while its values stay (what `<gsa-gear-browser>` is given). */
  browsePanel(): GearPanel {
    const next = this.app.panel('browse') as GearPanel;
    if (this.lastPanel && shallowEq(this.lastPanel, next)) {
      return this.lastPanel;
    }
    this.lastPanel = next;
    return next;
  }

  /* What the Job and sync strip element shows: the Gear browser's panel and the open tab. */
  stripInput(): StripInput {
    const { app } = this;
    const panel = app.panel('browse');
    return {
      job: panel.job ?? '',
      level: panel.level,
      cap: panel.cap,
      sync: Boolean(panel.sync),
      maxLevel: panel.jobCtx.maxLevel,
      maxReal: app.maxReal,
      tab: app.tab,
    };
  }

  /* The notes element's note ends: clear it (the element says its time is up). */
  expireNote(): void {
    this.sheets.setNote('');
  }
}
