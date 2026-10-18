/* Page root and the job / sync settings panel. Nested components inherit the root's `job` and helpers. */
import { JOBS, JOB_ROWS, SLOT_LABEL } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { dataSourceLabel } from '../../core/tables.js';
import { tierFill } from '../views/tiers.js';
import { limitCapToLevel } from '../state.js';
import { TYPING_DEBOUNCE_MS } from '../helpers.js';

export function page() {
  return {
    slotLabel: SLOT_LABEL,
    /* footer note naming the datamining commit; empty when unknown */
    dataSource: dataSourceLabel(),
    /* the current JobContext */
    get job() {
      return this.$store.app.jobCtx;
    },
    get slotOptions() {
      return this.job.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]);
    },
    get substatOptions() {
      return this.job.substats.map(s => [s, this.job.label[s]]);
    },
    /* the optimizer has a result for the current settings, so Tiers can fill its values from it (the math bar's chip) */
    get tierFillReady() {
      return !!tierFill(this.$store.app);
    },
  };
}

export function settings() {
  return {
    requestJob(id) {
      this.$store.app.setJob(id); // job-specific settings reset (resetForJob); nothing else is lost, so no confirmation
    },
    /* the cap field holds text that is not a whole item level in range (the store keeps its last valid cap) */
    capTypedBad: false,
    // the cap the page last lowered, {from, to, level} (limitCapToLevel), for the note under the field and the field's
    // flash; null once the cap or the level changes again
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
        this.capLowered = null;
        clearTimeout(timer);
        timer = setTimeout(() => this.lowerCap(), TYPING_DEBOUNCE_MS);
      });
    },
    /* limitCapToLevel, keeping what it lowered for the note; cleared first so a second lowering flashes the field again */
    lowerCap() {
      this.capLowered = null;
      const lowered = limitCapToLevel(this.$store.app);
      if (lowered) this.$nextTick(() => (this.capLowered = lowered));
    },
    /* under the cap field after the page lowered it: "Lowered from 500 to 135, the highest for level 50." */
    get capLoweredNote() {
      const c = this.capLowered;
      return c && !this.capError ? `Lowered from ${c.from} to ${c.to}, the highest for level ${c.level}.` : '';
    },
    onCapInput(text) {
      const app = this.$store.app,
        v = Number(text);
      if (text === '') app.cap = null; // an empty field means no cap
      this.capTypedBad = text !== '' && !(Number.isInteger(v) && v >= 1 && v <= app.maxReal);
    },
    /* shown under the cap field while sync is on */
    get capError() {
      const app = this.$store.app;
      if (!app.sync) return '';
      if (this.capTypedBad) return `Enter a whole item level from 1 to ${app.maxReal}`;
      return app.cap == null ? 'Enter a sync cap' : '';
    },
    /* every setting back to its default, after the browser's own confirmation dialog */
    requestReset() {
      if (window.confirm('Reset every setting to its default?')) this.$store.app.resetAll();
    },
    jobRows: JOB_ROWS.map(([label, ids]) => ({
      label,
      jobs: ids.map(id => ({ id, name: JOBS.find(j => j[0] === id)[1], icon: JOB_ICONS[id] })),
    })),
  };
}
