/* Alpine.store('app'): the saved state plus the actions that change it.
   Templates read it as $store.app.<field>; `job` is the current (frozen) JobContext. */
import { makeJobContext } from '../core/job-context.js';
import { poolItemFromRow } from '../core/items.js';
import { MAX_REAL } from '../core/tables.js';
import { resetForJob, TABS, MATH_TABS } from './state.js';

export const PERSISTED_KEYS = ['job', 'cap', 'sync', 'level', 'tab', 'mathTab', 'syncIlvl', 'piece', 'gen', 'browse', 'opt', 'poolFilter', 'pool'];

const poolKey = x => [x.name, x.type, x.ilvl].join('|');

export function createAppStore(initial) {
  return {
    ...initial,
    jobCtx: makeJobContext(initial.job),
    maxReal: MAX_REAL,
    /* bumped on every pool change, so views can depend on "the pool changed" without walking it */
    poolVersion: 0,

    /* Changing role or weapon mode resets role-dependent selections and empties the pool. */
    setJob(id) {
      const before = this.jobCtx;
      const job = makeJobContext(id);
      this.jobCtx = job;
      this.job = job.jobId;
      if (job.profileId !== before.profileId || job.weaponMode !== before.weaponMode) {
        resetForJob(this, job);
        this.poolVersion++;
      }
    },

    showTab(t) {
      if (MATH_TABS.includes(t)) { this.mathTab = t; t = 'math'; }
      this.tab = TABS.includes(t) ? t : 'pool';
    },
    showSub(s) { this.mathTab = MATH_TABS.includes(s) ? s : 'piece'; },

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
    isInPool(row) { const k = poolKey(row); return this.pool.some(p => poolKey(p) === k); },
    addItem(item) { this.pool.push(item); this.poolVersion++; },
    removeItem(id) { this.pool = this.pool.filter(i => i.id !== id); this.poolVersion++; },
    setCopies(id, value) {
      const it = this.pool.find(i => i.id === id);
      if (it) { it.copies = Math.min(2, Math.max(1, Math.round(+value || 1))); this.poolVersion++; }
    },
    clearPool() { this.pool = []; this.poolVersion++; },
    replaceGenerated(items) { this.pool = this.pool.filter(i => i.src !== 'generated').concat(items); this.poolVersion++; },
    removeGenerated() { this.pool = this.pool.filter(i => i.src !== 'generated'); this.poolVersion++; },

    persisted() {
      const o = {};
      PERSISTED_KEYS.forEach(k => { o[k] = this[k]; });
      return o;
    },
  };
}
