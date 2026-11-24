/* Alpine.store('app'): the saved state plus the actions that change it.
   Templates read it as $store.app.<field>. `job` is the chosen job's id ('SGE', or null for none), `jobCtx` its frozen
   JobContext (makeJobContext; derived, not saved). `job`, `cap`, `sync` and `level` are the open tab's Job and sync panel
   (each tab has its own, saved in a group: PANEL_GROUP); the panel's fields edit them, and `panel(tab)` reads any tab's.
   Substat tiers has its own job, `tiers.job` (saved), apart from the panel: `panel('tiers')`. */
import { makeJobContext } from '../core/job-context.js';
import { MAX_REAL } from '../core/tables.js';
import { restoreState, resetForJob, TABS, MATH_TABS } from './state.js';
import { PANEL_GROUP, holdLevelSyncCap, panelOf } from './job-sync-panel.js';

/* The store's fields that are saved (defaultState's); the rest (jobCtx, maxReal, gcd, tiers and the actions) are not.
   The top-level job, cap, sync and level are not saved: they are the open tab's copy of its group's panel (PANEL_GROUP),
   which persisted() puts into that group. */
const PERSISTED_KEYS = ['sheetFigures', 'piece', 'browse'];
/* Substat tiers' saved fields (its job); the level typed into its box is not saved. */
const TIERS_SAVED_KEYS = ['job'];
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
    // How the math works, Substat tiers: its own job (saved; `job`, an id: Substat tiers has no panel of the other tabs)
    // and its own level, not saved, shared by the math bar and the table: a level typed into its box, or null to follow
    // the job's level cap
    tiers: { ...initial.tiers, level: null },
    // The tab a click is opening, or null: set for one painted frame before showTab runs, so the page shows the tab as
    // selected and a loading line at once while the tab's content is built (openTab). Not saved.
    pendingTab: null,
    // How many openTab calls were made: the one that is waiting for its frame is the latest. Not saved.
    openingTabRequest: 0,

    /* The Job and sync panel of `tab` ('browse', 'math' or 'tiers'), open or not (job-sync-panel.js panelOf). */
    panel(tab) {
      return panelOf(this, tab);
    },

    /* Switching the job of `owner` ('browse', 'math' or 'tiers'; the open tab's panel when omitted) to a different job
       resets that owner's job-specific selections the new job cannot use (resetForJob); every other tab and sub-tab keeps
       its own job. A user action only (the job menu's tile), never a watcher. */
    setJob(id, owner = this.tab) {
      if (owner === 'tiers') return this.setTiersJob(id);
      const job = makeJobContext(id);
      if (job.jobId === this.job) return;
      const from = this.job ? this.jobCtx : null;
      this.jobCtx = job;
      this.job = job.jobId;
      resetForJob(this, job, from, [this.tab]);
      this.followLevelSync(); // the level-sync number depends on the job's level cap
    },

    /* Substat tiers' own job: the level typed into its box stays only if the new job's level cap allows it. */
    setTiersJob(id) {
      const job = makeJobContext(id);
      if (job.jobId === this.tiers.job) return;
      this.tiers.job = job.jobId;
      if (this.tiers.level != null && this.tiers.level >= job.maxLevel) this.tiers.level = null;
    },

    /* While the math tab is open and its IL Sync is off, its panel holds level sync's item level as its cap
       (job-sync-panel.js holdLevelSyncCap). Called from the user actions that change its inputs (job change, Reset, the
       level box), never from a watcher: a tab change swaps the panel and must leave both tabs' fields as they were. */
    followLevelSync() {
      if (this.tab === 'math') holdLevelSyncCap(this);
    },

    /* Set tab `tab`'s ('browse' or 'math') Job and sync panel to `panel` ({job, cap, sync, level}, already checked: state.js
       restorePanel), whether or not that tab is open: the open tab's panel is the top-level copy, another tab's its group.
       A different job resets what that tab holds for its old job that the new one cannot use (resetForJob), as setJob does.
       The one place an address writes the panel, so the rules for cap and sync live here. */
    setPanel(tab, panel) {
      const fields = Object.fromEntries(PANEL_KEYS.map(key => [key, panel[key]]));
      const target = tab === this.tab ? this : this[PANEL_GROUP[tab]];
      const from = target.job ? panelOf(this, tab).jobCtx : null;
      const changed = target.job !== panel.job;
      Object.assign(target, fields);
      if (tab === 'math') holdLevelSyncCap(target); // with IL Sync off, the cap is level sync's
      if (target === this) this.jobCtx = makeJobContext(panel.job);
      // resetForJob reads the level and the tab's own settings from the object it is given: this tab's
      if (changed)
        resetForJob({ level: panel.level, piece: this.piece, browse: this.browse }, makeJobContext(panel.job), from, [
          tab === 'browse' ? 'browse' : 'math',
        ]);
    },

    /* The open tab's settings back to their defaults (Paladin, level 100, sync off): its Job and sync strip and its own fields (the piece, or
       the browser's filters). The other tabs stay. */
    resetAll() {
      if (!PANEL_GROUP[this.tab]) return; // the Sheets tab has no panel and no settings of its own here
      const d = restoreState(null);
      const own = { browse: { browse: d.browse }, math: { piece: d.piece } }[this.tab];
      Object.assign(this, own, { job: d.job, cap: d.cap, sync: d.sync, level: d.level });
      this.jobCtx = makeJobContext(d.job);
      this.followLevelSync();
    },

    /* A tab link's action: marks tab `t` pending, waits for the frame that shows it, then opens the tab (showTab) and clears
       the mark in the same step. Opening a tab can take a second on a slow machine (the first Gear browser open builds its
       whole table), and the page would otherwise look unchanged until it was done. A newer openTab replaces one still waiting
       (Back during the opening): the older tab is never shown, so no screen shows between the two. */
    openTab(t) {
      this.pendingTab = t;
      this.openingTabRequest += 1;
      const request = this.openingTabRequest;
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (request !== this.openingTabRequest) return;
          this.showTab(t);
          this.pendingTab = null;
        }, 0),
      );
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
      o.tiers = Object.fromEntries(TIERS_SAVED_KEYS.map(key => [key, this.tiers[key]]));
      return o;
    },
  };
}
