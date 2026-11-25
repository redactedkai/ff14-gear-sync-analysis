/* The page root: the footer, the tabs, and what the Job and sync strip (elements/app/job-strip.ts) is given. */
import { dataSourceLabel } from '../../core/tables.js';
import { followInPage } from '../router/plain-click.js';
import { formatRoute } from '../router/routes.js';
import { loadExampleSheets } from '../test-data.js';

/* The loading line of each tab, shown while it opens. */
const LOADING_TEXT = { sheets: 'Loading Sheets…', browse: 'Loading the Gear browser…', math: 'Loading math analysis…' };

/* The page root: the footer, and the tabs. */
export function page() {
  return {
    /* footer note naming the datamining commit; empty when unknown */
    dataSource: dataSourceLabel(),
    /* TEMPORARY (the "test data" button of a DEV build, ui/test-data.js): load the example sheets and show the manager. */
    loadTestData() {
      const sheets = this.$store.sheets;
      if (sheets.askLeave(() => this.loadTestData())) {
        return;
      }
      loadExampleSheets(sheets);
      this.$store.app.showTab('sheets');
      sheets.openManager();
    },
    /* The address of tab `tab` (a tab link's href; for the math tab, `mathTab` or the open sub-tab), so Open in new tab and
       Copy link give the screen. */
    tabHref(tab, mathTab = this.$store.app.mathTab) {
      return formatRoute(tab === 'math' ? { tab, mathTab } : { tab });
    },
    /* TODO: Safari does not Tab to links by default (a browser setting: Tab highlights each item, off), so the tab links and the math
       sub-tabs are reached there only with Option+Tab. Roving focus on the tab strip, as the tabs had as buttons, would fix it. */
    /* TODO: Space on a tab link does not open it (a link takes Enter only; the tabs were buttons, which took Space too). A keydown
       handler for Space on the tab links would bring it back. */
    /* A tab link's click (`event`): a plain click opens tab `tab`; a Ctrl, Cmd, Shift or Alt click is left to the browser
       (plain-click.js). Leaving the Sheets tab while its set page has something to settle (a manual draft,
       a running Auto-fill, an Auto-fill result waiting) asks first, with the set page's own question (ui/store/sheets-actions.ts askLeave);
       the answer opens the tab. The tab shows as selected with a loading line first (store.openTab). */
    goTab(tab, event) {
      followInPage(event, () => {
        const app = this.$store.app;
        if (tab === (app.pendingTab ?? app.tab)) {
          return;
        }
        if (app.tab === 'sheets' && tab !== 'sheets' && this.$store.sheets.askLeave(() => app.openTab(tab))) {
          return;
        }
        app.openTab(tab);
      });
    },
    /* The loading line while a tab opens, or '' when none is (the tab links, store.openTab). */
    get loadingText() {
      return LOADING_TEXT[this.$store.app.pendingTab] ?? '';
    },
    /* What the Job and sync strip element shows (its properties): the Gear browser's panel and the open tab. */
    get stripInput() {
      const app = this.$store.app;
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
    },
  };
}
