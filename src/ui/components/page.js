/* Page root and the job / sync settings panel. Nested components inherit the root's `job` and helpers. */
import { JOBS, JOB_ROWS, SLOT_LABEL } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { dataSourceLabel } from '../../core/tables.js';

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
  };
}

export function settings() {
  return {
    /* job id waiting for confirmation, because switching would clear a non-empty pool */
    pendingJob: null,
    get pendingJobName() {
      return JOBS.find(j => j[0] === this.pendingJob)?.[1] ?? '';
    },
    get poolSize() {
      return this.$store.app.pool.length;
    },
    requestJob(id) {
      const app = this.$store.app;
      if (id === app.job) return;
      if (!app.pool.length) {
        app.setJob(id);
        return;
      }
      this.pendingJob = id; // the current job stays selected until the switch is confirmed
    },
    confirmJob() {
      this.$store.app.setJob(this.pendingJob);
      this.pendingJob = null;
    },
    cancelJob() {
      this.pendingJob = null;
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
      return app.cap == null ? 'Enter a sync cap' : '';
    },
    /* true while the reset waits for confirmation (only asked when the pool is not empty) */
    pendingReset: false,
    requestReset() {
      this.pendingJob = null;
      if (this.$store.app.pool.length) this.pendingReset = true;
      else this.$store.app.resetAll();
    },
    confirmReset() {
      this.$store.app.resetAll();
      this.pendingReset = false;
    },
    jobRows: JOB_ROWS.map(([label, ids]) => ({
      label,
      jobs: ids.map(id => ({ id, name: JOBS.find(j => j[0] === id)[1], icon: JOB_ICONS[id] })),
    })),
  };
}
