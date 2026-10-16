/* Gear optimizer tab: the best loadout for the chosen stat from every piece the job can wear, recomputed (debounced)
   only while the tab is open. */
import Alpine from 'alpinejs';
import { optimizerView, searchCount } from '../views/optimizer.js';
import { debouncedEffect, expansionToggles, fmtInt, gearGroupToggles } from '../helpers.js';
import { foodChoices, foodLabel } from '../../core/food.js';

const DEBOUNCE_MS = 120;

export function optimizer() {
  return {
    view: null,
    /* "searching 1,939 of 1,999 pieces" in the Gear to search heading: searched of every piece the job can wear */
    countText: '',
    /* how long the last solve took (building the job's gear included, the first time), shown under the result */
    solveMs: 0,
    /* pieces picked from the rows' menus of pieces with the same result: {row index: pool key}. Not saved; cleared when
       any setting changes, since the result and its rows change with them */
    picks: {},
    /* the row whose menu is open, or null */
    menuOpen: null,
    /* the settings the result was last solved for, to tell a new result from a pick */
    lastDeps: '',
    init() {
      debouncedEffect(
        Alpine,
        () => {
          const app = this.$store.app;
          // read every input synchronously so the effect tracks it
          const deps = [
            app.tab,
            app.cap,
            app.sync,
            app.level,
            app.jobCtx,
            app.opt.target,
            app.opt.tb,
            app.opt.tb2,
            app.opt.exclude.join(),
            app.opt.expOff.join(),
            app.opt.min,
            app.opt.max,
            app.opt.lvl,
            app.opt.melds,
            app.opt.food,
            app.opt.foodPair,
            app.opt.gcd,
            app.opt.gcdMode,
          ];
          return () => {
            if (deps[0] !== 'opt') return;
            const key = JSON.stringify(deps);
            if (key !== this.lastDeps) {
              this.picks = {};
              this.menuOpen = null;
              this.lastDeps = key;
            }
            this.solve();
          };
        },
        DEBOUNCE_MS,
      );
    },
    /* Solve and show the result, with the menu picks made so far. */
    solve() {
      const t0 = performance.now();
      // the plain store: read through Alpine's reactive proxies, the pool's thousands of stat reads cost about
      // twice the run itself (this runs outside the effect, so nothing here needs tracking)
      const raw = Alpine.raw(this.$store.app);
      const view = Object.freeze(optimizerView(raw, undefined, Alpine.raw(this.picks)));
      this.solveMs = Math.max(1, Math.round(performance.now() - t0));
      this.view = view;
      performance.measure('optimizer', { start: t0 }); // read by scripts/perf/browser.mjs
      const c = searchCount(raw);
      this.countText = `searching ${fmtInt(c.searched)} of ${fmtInt(c.searched + c.left)} pieces`;
    },
    /* A piece picked from row i's menu: the row shows it, and the other rows are checked again against it. */
    pick(i, key) {
      this.picks = { ...this.picks, [i]: key };
      this.menuOpen = null;
      this.solve();
    },
    /* the filters under Gear to search: the optimizer's own values (opt.expOff, opt.exclude), not the browser's */
    ...expansionToggles('opt'),
    ...gearGroupToggles('opt'),
    get statOptions() {
      return this.job.stats.map(s => [s, this.job.label[s]]);
    },
    get tiebreakOptions() {
      return [['', 'none']].concat(this.statOptions);
    },
    /* the Food select: best for the goal, then the job's meals by stat pair, primary stat first */
    get foodOptions() {
      return [['', 'Best for the goal']].concat(foodChoices(this.job).map(c => [c.key, `${foodLabel(this.job, c)} (${c.ilvl})`]));
    },
  };
}
