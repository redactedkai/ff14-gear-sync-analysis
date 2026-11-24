/* Page root and the job / sync settings panel. Each component reads the job through its own `jobCtx` getter, not
   through a parent's scope. */
import { dataSourceLabel } from '../../core/tables.js';
import { followInPage } from '../router/plain-click.js';
import { formatRoute } from '../router/routes.js';
import { loadExampleSheets } from '../test-data.js';
import { capControls } from './cap-controls.js';
import { compose } from './compose.js';
import { jobMenu } from './job-menu.js';

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
      if (sheets.askLeave(() => this.loadTestData())) return;
      loadExampleSheets(sheets);
      this.$store.app.showTab('sheets');
      sheets.openManager();
    },
    /* The address of tab `tab` (a tab link's href; for the math tab, `mathTab` or the open sub-tab), so Open in new tab and
       Copy link give the screen. */
    tabHref(tab, mathTab = this.$store.app.mathTab) {
      return formatRoute(tab === 'math' ? { tab, mathTab } : { tab });
    },
    /* A tab link's click (`event`): a plain click opens tab `tab`; a Ctrl, Cmd, Shift or Alt click is left to the browser
       (plain-click.js). Leaving the Sheets tab while its set page has something to settle (a manual draft,
       a running Auto-fill, an Auto-fill result waiting) asks first, with the set page's own question (sheets/store.js askLeave);
       the answer opens the tab. The tab shows as selected with a loading line first (store.openTab). */
    goTab(tab, event) {
      followInPage(event, () => {
        const app = this.$store.app;
        if (tab === (app.pendingTab ?? app.tab)) return;
        if (app.tab === 'sheets' && tab !== 'sheets' && this.$store.sheets.askLeave(() => app.openTab(tab))) return;
        app.openTab(tab);
      });
    },
    /* A math sub-tab link's click (`event`): a plain click shows sub-tab `sub`; any other click is the browser's. */
    goSub(sub, event) {
      followInPage(event, () => this.$store.app.showSub(sub));
    },
    /* The loading line while a tab opens, or '' when none is (the tab links, store.openTab). */
    get loadingText() {
      return LOADING_TEXT[this.$store.app.pendingTab] ?? '';
    },
  };
}

/* What the reset button asks before it resets the open tab's settings (the other tabs keep theirs). */
const RESET_QUESTION = "Reset this tab's settings to their defaults?";

/* The job and sync strip of the Gear browser: the job menu, the synced level, the cap and the sync switch. How the math works
   has no strip: its Job menu is in the math bar (sync-explainer.js). */
export function settings() {
  return compose(
    {
      /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
      get jobCtx() {
        return this.$store.app.jobCtx;
      },
      init() {
        this.initCap(); // the cap field's rules (cap-controls.js)
      },
      /* the open tab's settings back to their defaults, after the browser's own confirmation dialog */
      requestReset() {
        if (window.confirm(RESET_QUESTION)) this.$store.app.resetAll();
      },
    },
    jobMenu(),
    capControls('browse'),
  );
}
