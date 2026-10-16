/* Alpine.store('app'): the saved state plus the actions that change it.
   Templates read it as $store.app.<field>. `job` is the chosen job's id ('SGE', or null for none; saved), `jobCtx` its
   frozen JobContext (makeJobContext; derived, not saved). */
import { makeJobContext } from '../core/job-context.js';
import { MAX_REAL } from '../core/tables.js';
import { restoreState, resetForJob, TABS, MATH_TABS } from './state.js';

export const PERSISTED_KEYS = ['job', 'cap', 'sync', 'level', 'tab', 'mathTab', 'piece', 'browse', 'opt'];

export function createAppStore(initial) {
  return {
    ...initial,
    jobCtx: makeJobContext(initial.job),
    maxReal: MAX_REAL,

    /* Switching to a different job resets the job-specific selections (resetForJob). */
    setJob(id) {
      const job = makeJobContext(id);
      if (job.jobId === this.job) return;
      this.jobCtx = job;
      this.job = job.jobId;
      resetForJob(this, job);
    },

    /* Every saved setting back to its default (no job); the open tab stays. */
    resetAll() {
      const { tab, mathTab, ...d } = restoreState(null);
      Object.assign(this, d);
      this.jobCtx = makeJobContext(d.job);
    },

    showTab(t) {
      if (MATH_TABS.includes(t)) {
        this.mathTab = t;
        t = 'math';
      }
      this.tab = TABS.includes(t) ? t : 'opt';
    },
    showSub(s) {
      this.mathTab = MATH_TABS.includes(s) ? s : 'piece';
    },

    persisted() {
      const o = {};
      PERSISTED_KEYS.forEach(k => {
        o[k] = this[k];
      });
      return o;
    },
  };
}
