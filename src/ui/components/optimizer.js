/* Gear optimizer tab: the best loadout for the chosen stat from every piece the job can wear, searched when the user
   presses Optimize (owner, 2026-10-18: no search on every setting change). A setting changed since the last search
   leaves its result shown but dimmed, its menus off; a job switch clears it. The piece count and the greyed-out "Gear
   from" boxes still follow the settings as they change. */
import Alpine from 'alpinejs';
import {
  emptyGearFrom,
  mealEmptyReason,
  mealPillOff,
  mealsPassing,
  optimizerKey,
  optimizerView,
  resultPanel,
  searchCount,
} from '../views/optimizer.js';
import { debouncedEffect, expansionToggles, fmtInt, gearFromToggles } from '../helpers.js';

const DEBOUNCE_MS = 120;

export function optimizer() {
  return {
    view: null,
    /* "searching 1,939 of 1,999 pieces" in the Gear to search heading: searched of every piece the job can wear */
    countText: '',
    /* "Gear from" boxes with nothing for the job and the other filters (greyed out in the menu) */
    emptyBoxes: [],
    /* how long the last solve took (building the job's gear included, the first time), shown under the result */
    solveMs: 0,
    /* pieces picked from the rows' menus of pieces with the same result: {row index: pool key}. Not saved; cleared when
       any setting changes, since the result and its rows change with them */
    picks: {},
    /* the row whose menu is open, or null */
    menuOpen: null,
    /* the meal picked from the Food row's menu (an allMeals key), or null for the best for the goal. Not saved; cleared
       with the picks */
    mealPick: null,
    /* the Food menu: open or not, its search text (meal names), the stats picked on its pills (a meal must have each;
       two at most, since a meal has at most two) and its "Best for goal" switch (on: only meals with the best's result) */
    mealOpen: false,
    mealQuery: '',
    mealStats: [],
    /* the search (lastDeps) the pills were last preset for: the menu presets them once per Optimize, then keeps the
       player's changes */
    mealPresetFor: null,
    mealBestOnly: true,
    /* the ? note of the "Spare points to tiebreaks" switch (tier ranking): open or not */
    rankHelp: false,
    /* the settings the result was last solved for (optimizerKey), and the settings now: they differ once a setting
       changes after a search, and the result is then out of date */
    lastDeps: '',
    nowDeps: '',
    get stale() {
      return !!this.view && this.nowDeps !== this.lastDeps;
    },
    /* a solve is pending or running: shows the progress bar */
    busy: false,
    /* the latest solve asked for; an older one still waiting is dropped */
    solveId: 0,
    init() {
      // the settings as they change: whether the result is out of date (a job switch drops it), and the piece count and
      // empty boxes under Gear to search
      debouncedEffect(
        Alpine,
        () => {
          const app = this.$store.app;
          // read every input synchronously so the effect tracks it (optimizerKey reads them all)
          const key = optimizerKey(app),
            job = app.job;
          return () => {
            this.nowDeps = key;
            if (this.view && job !== this.viewJob) this.view = null;
            if (!job) return;
            const raw = Alpine.raw(this.$store.app);
            const c = searchCount(raw);
            this.countText = `searching ${fmtInt(c.searched)} of ${fmtInt(c.searched + c.left)} pieces`;
            this.emptyBoxes = emptyGearFrom(raw);
          };
        },
        DEBOUNCE_MS,
      );
    },
    /* the job the shown result is for */
    viewJob: null,
    /* Optimize: search with the settings as they are now; the menu picks of the last result are dropped. */
    run() {
      this.picks = {};
      this.menuOpen = null;
      this.mealPick = null;
      this.mealOpen = false;
      this.lastDeps = optimizerKey(Alpine.raw(this.$store.app));
      this.solve();
    },
    /* Solve and show the result, with the menu picks made so far. The solve holds the page's thread (tier ranking up to
       a few seconds under a Target GCD), so the progress bar is shown first: after the next frame is painted. */
    solve() {
      const id = ++this.solveId;
      this.busy = true;
      // two frames: the first lays the bar out, the second paints it and starts its animation, which then runs on the
      // compositor while the solve holds the thread
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            if (id !== this.solveId) return;
            this.solveNow();
            this.busy = false;
          }),
        ),
      );
    },
    solveNow() {
      const t0 = performance.now();
      // the plain store: read through Alpine's reactive proxies, the pool's thousands of stat reads cost about
      // twice the run itself (this runs outside the effect, so nothing here needs tracking)
      const raw = Alpine.raw(this.$store.app);
      const view = Object.freeze(optimizerView(raw, undefined, Alpine.raw(this.picks), this.mealPick));
      this.solveMs = Math.max(1, Math.round(performance.now() - t0));
      this.view = view;
      this.viewJob = raw.job;
      this.nowDeps = optimizerKey(raw);
      // the result's panel values with the settings they were solved for, for How the math works (Substat tiers)
      const values = resultPanel(raw.jobCtx, view);
      this.$store.app.optPanel = values && Object.freeze({ key: optimizerKey(raw), values: Object.freeze(values) });
      performance.measure('optimizer', { start: t0 }); // read by scripts/perf/browser.mjs
    },
    /* A piece picked from row i's menu: the row shows it, and the other rows are checked again against it. */
    pick(i, key) {
      this.picks = { ...this.picks, [i]: key };
      this.menuOpen = null;
      this.solve();
    },
    /* A meal picked from the Food row's menu: the search runs again with it in place of the best (with tier ranking or
       a Target GCD the meal can change which gear wins). */
    pickMeal(key) {
      this.mealPick = key;
      this.mealOpen = false;
      this.solve();
    },
    /* Open or close the Food menu; opened, the search box takes the keys and the list starts at the shown meal. */
    toggleMealMenu() {
      this.mealOpen = !this.mealOpen;
      if (!this.mealOpen) return;
      // the first opening after an Optimize starts from the goal's stats (view.food.menu.preset)
      if (this.mealPresetFor !== this.lastDeps) {
        this.mealStats = [...(this.view?.food?.menu?.preset ?? [])];
        this.mealPresetFor = this.lastDeps;
      }
      // after x-show has shown the menu (a hidden box takes no focus and has no layout)
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          this.$refs.mealQuery?.focus();
          const list = this.$refs.mealList,
            on = list?.querySelector('.on');
          if (on) list.scrollTop += on.getBoundingClientRect().top - list.getBoundingClientRect().top - 40;
        }),
      );
    },
    /* A stat pill: on or off; a greyed-out one stays off (mealPillOff: a third, or one that would leave no meal). */
    toggleMealStat(stat) {
      if (this.mealStats.includes(stat)) this.mealStats = this.mealStats.filter(s => s !== stat);
      else if (!this.mealPillOff(stat)) this.mealStats = [...this.mealStats, stat];
    },
    /* the Food menu's filters now: its pills, search text and "Best for goal" switch (views mealsPassing) */
    get mealFilters() {
      return { stats: this.mealStats, query: this.mealQuery, bestOnly: this.mealBestOnly };
    },
    /* every meal of the Food menu, in its order */
    get mealItems() {
      return (this.view?.food?.menu?.groups ?? []).flatMap(g => g.items);
    },
    mealPillOff(stat) {
      return mealPillOff(this.mealItems, stat, this.mealFilters);
    },
    /* The Food menu's groups after its switch, pills and search: [{label, items}] (view.food.menu.groups, empty groups
       dropped). */
    get mealGroups() {
      // by key: Alpine's proxies make the same meal two different objects on two reads
      const passing = new Set(mealsPassing(this.mealItems, this.mealFilters).map(x => x.key));
      return (this.view?.food?.menu?.groups ?? [])
        .map(g => ({ label: g.label, items: g.items.filter(x => passing.has(x.key)) }))
        .filter(g => g.items.length);
    },
    /* why the list is empty and the way out ({text, action}), or null (views mealEmptyReason) */
    get mealEmpty() {
      const short = Object.fromEntries((this.view?.food?.menu?.pills ?? []).map(p => [p.stat, p.short]));
      return mealEmptyReason(this.mealItems, this.mealFilters, short);
    },
    /* the empty list's button: undo the filter that empties it */
    clearMealFilter(action) {
      if (action === 'query') this.mealQuery = '';
      else if (action === 'best') this.mealBestOnly = false;
      else this.mealStats = [];
    },
    /* the filters under Gear to search: the optimizer's own values (opt.expOff, opt.exclude, opt.market), not the
       browser's */
    ...expansionToggles('opt'),
    ...gearFromToggles('opt'),
    get statOptions() {
      return this.job.stats.map(s => [s, this.job.label[s]]);
    },
    get tiebreakOptions() {
      return [['', 'none']].concat(this.statOptions);
    },
  };
}
