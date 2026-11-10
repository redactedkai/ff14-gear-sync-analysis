/* Page root and the job / sync settings panel. Each component reads the job through its own `jobCtx` getter, not
   through a parent's scope. */
import { JOB_ROWS, jobById } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { dataSourceLabel } from '../../core/tables.js';
import { CAP_TYPED_BAD_TEXT, capLoweredText, jobLineText, capTextBad, limitCapToLevel } from '../state.js';
import { TYPING_DEBOUNCE_MS, flashLowered } from '../helpers.js';
import { loadExampleSheets } from '../test-data.js';

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
    /* A tab button: open tab `tab`. Leaving the Sheets tab while its set page has something to settle (a manual draft,
       a running Fill, a Fill result waiting) asks first, with the set page's own question (sheet-store.js askLeave);
       the answer opens the tab. */
    goTab(tab) {
      const app = this.$store.app;
      if (app.tab === 'sheets' && tab !== 'sheets' && this.$store.sheets.askLeave(() => app.showTab(tab))) return;
      app.showTab(tab);
    },
  };
}

/* What the reset button asks before it resets the open tab's settings (the other tabs keep theirs). */
const RESET_QUESTION = "Reset this tab's settings to their defaults?";

/* The job and sync settings panel: the job picker, the synced level, the cap and the sync switch. One panel is on the
   page and shows the open tab's own settings (store.showTab swaps them in), so each tab keeps its own values. */
export function settings() {
  return {
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    requestJob(id) {
      this.$store.app.setJob(id); // job-specific settings reset (resetForJob); nothing else is lost, so no confirmation
    },
    /* The full panel (true) or the one-line strip with a Change button (false), as in prototype B17. It always starts as the
       strip, with or without a job ("none chosen"); Change opens the panel. */
    open: false,
    /* the strip's text after "Job: <name>": the synced level and the item level sync */
    get lineText() {
      const app = this.$store.app;
      return jobLineText(app.level, app.sync, app.cap);
    },
    /* Change and Close: swap the strip and the panel, and keep the keyboard focus on the button that took the other's place */
    toggleOpen() {
      this.open = !this.open;
      this.$nextTick(() => this.$refs[this.open ? 'closeButton' : 'changeButton']?.focus());
    },
    /* Escape in the open panel closes it, as it closes the page's menus, and the focus goes back to Change. */
    closeOnEscape() {
      if (!this.open) return;
      this.open = false;
      this.$nextTick(() => this.$refs.changeButton?.focus());
    },
    /* the cap field holds text that is not a whole item level in range (the store keeps its last valid cap) */
    capTypedBad: false,
    // the cap the page last lowered, {from, to, level} (limitCapToLevel), for the note under the field; null once the
    // cap is changed to one the level allows, or the level settles without lowering it
    capLowered: null,
    init() {
      this.$watch('$store.app.cap', cap => {
        this.capTypedBad = false; // changed from elsewhere (reset, or a valid entry)
        if (cap === this.capLowered?.to) return; // the page's own lowering
        this.lowerCap(); // a cap entered above what the level allows (the field commits once typing settles)
      });
      this.$watch('$store.app.sync', () => this.lowerCap());
      // the cap follows the level once the level settles: the level field commits on every keystroke, and typing 80
      // passes through 8, which would lower the cap to level 8's
      let timer = null;
      this.$watch('$store.app.level', () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.lowerCap(), TYPING_DEBOUNCE_MS);
      });
    },
    /* limitCapToLevel, keeping what it lowered for the note. A second lowering (the up arrow at the limit) updates the
       note in place and flashes the field again: hiding and showing the note made the panel jump (owner's report,
       2026-10-18). */
    lowerCap() {
      const lowered = limitCapToLevel(this.$store.app);
      this.capLowered = lowered;
      if (lowered) flashLowered(this.$refs.cap);
    },
    /* under the cap field after the page lowered it (capLoweredText): "Lowered to 135, the highest for level 50." */
    get capLoweredNote() {
      return this.capError ? '' : capLoweredText(this.capLowered);
    },
    onCapInput(text) {
      if (text === '') this.$store.app.cap = null; // an empty field means no cap
      this.capTypedBad = capTextBad(text);
    },
    /* shown under the cap field while sync is on */
    get capError() {
      const app = this.$store.app;
      if (!app.sync) return '';
      if (this.capTypedBad) return CAP_TYPED_BAD_TEXT;
      return app.cap == null ? 'Enter a sync cap' : '';
    },
    /* the open tab's settings back to their defaults, after the browser's own confirmation dialog */
    requestReset() {
      if (window.confirm(RESET_QUESTION)) this.$store.app.resetAll();
    },
    jobRows: JOB_ROWS.map(([label, ids]) => ({
      label,
      jobs: ids.map(id => ({ id, name: jobById(id).name, icon: JOB_ICONS[id] })),
    })),
  };
}
