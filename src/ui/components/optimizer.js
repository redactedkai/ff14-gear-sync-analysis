/* Gear optimizer tab: the best loadout for the chosen stat, and the per-stat ceiling of the pool. Both recompute
   (debounced) only while the tab is open. */
import Alpine from 'alpinejs';
import { optimizerView, ceilingView } from '../views/optimizer.js';
import { debouncedEffect } from '../helpers.js';
import { SOURCES } from '../../core/constants.js';

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
            app.opt.exclude.join(),
            app.opt.melds,
          ];
          return () => {
            if (deps[0] === 'opt') this.view = Object.freeze(optimizerView(app));
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
    sources: SOURCES,
    excluded(key) {
      return this.$store.app.opt.exclude.includes(key);
    },
    setExcluded(key, on) {
      const ex = this.$store.app.opt.exclude.filter(k => k !== key);
      this.$store.app.opt.exclude = on ? SOURCES.map(s => s.key).filter(k => k === key || ex.includes(k)) : ex;
    },
  };
}

export function ceiling() {
  return {
    view: null,
    init() {
      debouncedEffect(
        Alpine,
        () => {
          const app = this.$store.app;
          const deps = [app.tab, app.poolVersion, app.cap, app.sync, app.level, app.jobCtx, app.opt.exclude.join(), app.opt.melds];
          return () => {
            if (deps[0] === 'opt') this.view = ceilingView(app);
          };
        },
        DEBOUNCE_MS,
      );
    },
  };
}
