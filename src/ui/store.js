/* Alpine.store('app'): the saved state plus the actions that change it.
   Templates read it as $store.app.<field>. `job` is the chosen job's id ('SGE', or null for none), `jobCtx` its frozen
   JobContext (makeJobContext; derived, not saved). `job`, `cap`, `sync` and `level` are the open tab's Job and sync panel
   (each tab has its own, saved in a group: PANEL_GROUP); the panel's fields edit them, and `panel(tab)` reads any tab's. */
import { makeJobContext } from '../core/job-context.js';
import { MAX_REAL } from '../core/tables.js';
import { restoreState, resetForJob, TABS, MATH_TABS } from './state.js';
import { PANEL_GROUP, panelOf } from './settings.js';

/* The store's fields that are saved (defaultState's); the rest (jobCtx, maxReal, gcd, tiers and the actions) are not.
   The top-level job, cap, sync and level are not saved: they are the open tab's copy of its group's panel (PANEL_GROUP),
   which persisted() puts into that group. */
export const PERSISTED_KEYS = ['tab', 'mathTab', 'piece', 'browse'];
const PANEL_KEYS = ['job', 'cap', 'sync', 'level'];

/* The store object for Alpine.store('app') from a restored state (restoreState): the state, the fields derived from it
   (jobCtx, maxReal), the sub-tabs' unsaved settings and the actions. */
export function createAppStore(initial) {
  return {
    ...initial,
    jobCtx: makeJobContext(initial.job),
    maxReal: MAX_REAL,
    // How the math works, GCD: its own settings, not saved (views/gcd.js). level: a level typed into its box, or null
    // to follow the synced level; haste: a HASTE job id, or '' for none; speed: the total speed asked for, or null for
    // the level's base (the view holds it to the level's range)
    gcd: { level: null, haste: '', speed: null },
    // How the math works, Substat tiers: its own level, not saved, shared by the math bar and the table: a level typed
    // into its box, or null to follow the synced level
    tiers: { level: null },

    /* The Job and sync panel of `tab` ('browse' or 'math'), open or not (settings.js panelOf). */
    panel(tab) {
      return panelOf(this, tab);
    },

    /* Switching the open tab's panel to a different job resets that tab's job-specific selections the new job cannot use
       (resetForJob); the other tabs keep their own job. */
    setJob(id) {
      const job = makeJobContext(id);
      if (job.jobId === this.job) return;
      const from = this.job ? this.jobCtx : null;
      this.jobCtx = job;
      this.job = job.jobId;
      resetForJob(this, job, from, [this.tab]);
    },

    /* The open tab's settings back to their defaults (no job): its Job and sync panel and its own fields (the piece, or
       the browser's filters). The other tabs stay. */
    resetAll() {
      if (!PANEL_GROUP[this.tab]) return; // the Sheets tab has no panel and no settings of its own here
      const d = restoreState(null);
      const own = { browse: { browse: d.browse }, math: { piece: d.piece } }[this.tab];
      Object.assign(this, own, { job: d.job, cap: d.cap, sync: d.sync, level: d.level });
      this.jobCtx = makeJobContext(d.job);
    },

    /* Open tab `t` (a math sub-view opens the math tab on it): the leaving tab's panel is kept in its group, and the
       panel shows the new tab's. The Sheets tab has no panel: going to it keeps the top-level copy as it was, unused. */
    showTab(t) {
      if (MATH_TABS.includes(t)) {
        this.mathTab = t;
        t = 'math';
      }
      const next = TABS.includes(t) ? t : TABS[0];
      if (next === this.tab) return;
      this.keepPanel();
      this.tab = next;
      const own = this[PANEL_GROUP[next]];
      if (!own) return;
      Object.assign(this, Object.fromEntries(PANEL_KEYS.map(key => [key, own[key]])));
      this.jobCtx = makeJobContext(own.job);
    },
    /* The open tab's panel copied into its group (none for the Sheets tab). */
    keepPanel() {
      const own = this[PANEL_GROUP[this.tab]];
      if (own) for (const key of PANEL_KEYS) own[key] = this[key];
    },
    showSub(s) {
      this.mathTab = MATH_TABS.includes(s) ? s : 'piece';
    },

    /* The saved fields: the open tab's group with its panel as edited (a copy; nothing is written to the store). */
    persisted() {
      const o = {};
      PERSISTED_KEYS.forEach(k => {
        o[k] = this[k];
      });
      const group = PANEL_GROUP[this.tab];
      if (group) o[group] = { ...o[group], ...Object.fromEntries(PANEL_KEYS.map(key => [key, this[key]])) };
      return o;
    },
  };
}
