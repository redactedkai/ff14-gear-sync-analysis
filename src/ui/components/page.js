/* Page root and the job / sync settings panel. Nested components inherit the root's `job` and helpers. */
import { JOBS, JOB_ROWS, SLOT_LABEL } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { dataSourceLabel } from '../../core/tables.js';
import { tierFill } from '../views/tiers.js';
import { capOutOfRange, capRangeMessage } from '../state.js';

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
    init() {
      this.$watch('$store.app.cap', () => {
        this.capTypedBad = false; // changed from elsewhere (reset, or a valid entry)
      });
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
      if (capOutOfRange(app)) return capRangeMessage(app);
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
