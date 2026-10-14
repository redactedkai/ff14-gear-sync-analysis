/* Gear optimizer tab: the best loadout for the chosen stat, recomputed (debounced) only while the tab is open. */
import Alpine from 'alpinejs';
import { optimizerView } from '../views/optimizer.js';
import { debouncedEffect } from '../helpers.js';

const DEBOUNCE_MS = 120;

export function optimizer() {
  return {
    view: null,
    init() {
      debouncedEffect(
        Alpine,
        () => {
          const app = this.$store.app;
          // read every input synchronously so the effect tracks it
          const deps = [
            app.tab,
            app.poolVersion,
            app.cap,
            app.sync,
            app.level,
            app.jobCtx,
            app.opt.target,
            app.opt.tb,
            app.opt.tb2,
            app.browse.exclude.join(),
            app.opt.melds,
          ];
          return () => {
            if (deps[0] !== 'opt') return;
            const t0 = performance.now();
            // the plain store: read through Alpine's reactive proxies, the pool's thousands of stat reads cost about
            // twice the run itself (this runs later, outside the effect, so nothing here needs tracking)
            this.view = Object.freeze(optimizerView(Alpine.raw(app)));
            performance.measure('optimizer', { start: t0 }); // read by scripts/perf/browser.py
          };
        },
        DEBOUNCE_MS,
      );
    },
    get statOptions() {
      return this.job.stats.map(s => [s, this.job.label[s]]);
    },
    get tiebreakOptions() {
      return [['', 'none']].concat(this.statOptions);
    },
  };
}
