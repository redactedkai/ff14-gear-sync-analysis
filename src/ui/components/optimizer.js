/* Gear optimizer tab: the best loadout for the chosen stat from every piece the job can wear, recomputed (debounced)
   only while the tab is open. */
import Alpine from 'alpinejs';
import { optimizerView, searchCount } from '../views/optimizer.js';
import { debouncedEffect, fmtInt, gearGroupToggles } from '../helpers.js';

const DEBOUNCE_MS = 120;

export function optimizer() {
  return {
    view: null,
    /* "Searching 1,939 of 1,999 pieces." under the gear groups: searched of every piece the job can wear */
    countText: '',
    /* how long the last solve took (building the job's gear included, the first time), shown under the result */
    solveMs: 0,
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
            app.opt.melds,
          ];
          return () => {
            if (deps[0] !== 'opt') return;
            const t0 = performance.now();
            // the plain store: read through Alpine's reactive proxies, the pool's thousands of stat reads cost about
            // twice the run itself (this runs later, outside the effect, so nothing here needs tracking)
            const raw = Alpine.raw(app);
            const view = Object.freeze(optimizerView(raw));
            this.solveMs = Math.max(1, Math.round(performance.now() - t0));
            this.view = view;
            performance.measure('optimizer', { start: t0 }); // read by scripts/perf/browser.py
            const c = searchCount(raw);
            this.countText = `Searching ${fmtInt(c.searched)} of ${fmtInt(c.searched + c.left)} pieces.`;
          };
        },
        DEBOUNCE_MS,
      );
    },
    /* gear groups searched (ticked) or left out: the optimizer's own list, opt.exclude */
    ...gearGroupToggles('opt'),
    get statOptions() {
      return this.job.stats.map(s => [s, this.job.label[s]]);
    },
    get tiebreakOptions() {
      return [['', 'none']].concat(this.statOptions);
    },
  };
}
