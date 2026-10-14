/* Alpine.store('app'): the saved state plus the actions that change it.
   Templates read it as $store.app.<field>; `job` is the current (frozen) JobContext. */
import { makeJobContext } from '../core/job-context.js';
import { poolItemFromRow, poolKey } from '../core/items.js';
import { MAX_REAL } from '../core/tables.js';
import { restoreState, resetForJob, TABS, MATH_TABS } from './state.js';

export const PERSISTED_KEYS = ['job', 'cap', 'sync', 'level', 'tab', 'mathTab', 'syncIlvl', 'piece', 'browse', 'opt', 'pool'];

export function createAppStore(initial) {
  return {
    ...initial,
    jobCtx: makeJobContext(initial.job),
    maxReal: MAX_REAL,
    /* bumped on every pool change, so views can depend on "the pool changed" without walking it */
    poolVersion: 0,

    /* Switching to a different job clears the pool and the job-specific selections, so the pool never holds gear
       the job can't wear. The page asks for confirmation first when the pool is not empty. */
    setJob(id) {
      const job = makeJobContext(id);
      if (job.jobId === this.job) return;
      this.jobCtx = job;
      this.job = job.jobId;
      resetForJob(this, job);
      this.poolVersion++;
    },

    /* Every saved setting back to its default (no job) and an empty pool; the open tab stays. */
    resetAll() {
      const { tab, mathTab, ...d } = restoreState(null);
      Object.assign(this, d);
      this.jobCtx = makeJobContext(d.job);
      this.poolVersion++;
    },

    showTab(t) {
      if (MATH_TABS.includes(t)) {
        this.mathTab = t;
        t = 'math';
      }
      this.tab = TABS.includes(t) ? t : 'pool';
    },
    showSub(s) {
      this.mathTab = MATH_TABS.includes(s) ? s : 'piece';
    },

    /* Add database rows (parsed) to the pool, skipping ones already there. Returns how many were added. */
    addRows(rows) {
      let added = 0;
      const have = new Set(this.pool.map(poolKey));
      rows.forEach(r => {
        const it = poolItemFromRow(this.jobCtx, r);
        if (have.has(poolKey(it))) return;
        have.add(poolKey(it));
        this.pool.push(it);
        added++;
      });
      if (added) this.poolVersion++;
      return added;
    },
    isInPool(row) {
      const k = poolKey(row);
      return this.pool.some(p => poolKey(p) === k);
    },
    removeItem(id) {
      this.pool = this.pool.filter(i => i.id !== id);
      this.poolVersion++;
    },
    clearPool() {
      this.pool = [];
      this.poolVersion++;
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
