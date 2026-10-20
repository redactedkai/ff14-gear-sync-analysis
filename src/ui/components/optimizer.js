/* Gear optimizer tab: the best loadout for the chosen stat from every piece the job can wear, searched when the user
   presses Optimize (owner, 2026-10-18: no search on every setting change). A setting changed since the last search
   leaves its result shown but dimmed, its menus off, and so does a failed search (with its reason); a job switch
   clears it. The piece count and the greyed-out "Gear
   from" boxes and the Target GCD range still follow the settings as they change. */
import { sameEmptyText, samePassing } from '../views/optimizer.js';
import { inProcessSolver, isCancelled, solverRequest } from '../solver.js';
import { TARGET_GCD_RANGE, optimizerInputs, optimizerKey } from '../settings.js';
import { deepFreeze, expansionToggles, gearFromToggles, throttledEffect } from '../helpers.js';
import { rankChoices, withRank } from '../ranks.js';

/* The piece count, the empty boxes and the Target GCD label follow the settings at most once per FOLLOW_MS, while they
   change as well as after (throttledEffect). Exported for the tests. */
export const FOLLOW_MS = 120;

/* The optimizer tab's component: the result (`view`), whether it is out of date, the solve, the rows' menus of pieces
   with the same result, and the filters under Gear to search. `alpine`: what it needs of Alpine, {effect, raw} (main.js
   passes Alpine itself; a test passes stand-ins, so the component runs without a page). `solver`: what runs its
   searches and the Gear to search line (ui/solver.js): the page's worker solver (main.js), or by default one on the
   page's thread, as the tests use. Its solver session (the job's gear, the caches) is one per solver, kept outside
   reactive state. */
export function optimizer(alpine, solver = inProcessSolver()) {
  return {
    view: null,
    /* the job the shown result is for */
    viewJob: null,
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    /* "searching 1,939 of 1,999 pieces" in the Gear to search heading: searched of every piece the job can wear */
    countText: '',
    /* "Gear from" boxes with nothing for the job and the other filters (greyed out in the menu) */
    emptyBoxes: [],
    /* the Target GCD label for the settings now ("Target GCD (2.50 to 2.10)"), shown while the result is missing or out
       of date */
    gcdLabel: 'Target GCD',
    /* how long the last solve took (building the job's gear included, the first time), shown under the result */
    solveMs: 0,
    get solvedText() {
      return `Solved in ${this.solveMs} ms.`;
    },
    /* pieces picked from the rows' menus of pieces with the same result: {row index: gameId}. Not saved; cleared when
       any setting changes, since the result and its rows change with them */
    picks: {},
    /* the row whose menu is open, or null, and the search text of that menu (cleared when a menu opens) */
    menuOpen: null,
    sameQuery: '',
    /* the meal picked from the Food row's menu (an allMeals key), or null for the best for the goal. Not saved; cleared
       with the picks */
    mealPick: null,
    /* one per search, a meal pick included: the Food menu (mealMenu) closes when a new one comes */
    viewId: 0,
    /* the ? note of the "Spare points to tiebreaks" switch (tier ranking): open or not */
    rankHelp: false,
    /* the settings the result was last solved for (optimizerKey), and the settings now: they differ once a setting
       changes after a search, and the result is then out of date */
    lastDeps: '',
    nowDeps: '',
    /* the line shown after a search failed (not cancelled): "The search failed: <reason>. Press Optimize to try
       again.", or ''. The result from before it stays, out of date; the next Optimize clears the line */
    failure: '',
    /* the result shown is out of date: the settings changed since it was solved, or the search after it failed */
    get stale() {
      return !!this.view && (!!this.failure || this.nowDeps !== this.lastDeps);
    },
    /* the Target GCD box's range in seconds, [lowest, highest] (settings.js) */
    targetGcdRange: TARGET_GCD_RANGE,
    /* the Target GCD box's label: the result's own while it is up to date, else the one for the settings now */
    get gcdFieldLabel() {
      return (!this.stale && this.view?.gcdUi?.label) || this.gcdLabel;
    },
    /* a solve is pending or running: shows the progress bar */
    busy: false,
    /* the latest solve asked for; an older one still waiting is dropped, and so is its reply */
    solveId: 0,
    /* what Cancel puts back: the menu picks and the settings key of the result shown, {picks, mealPick, lastDeps},
       saved when a search is asked for while none is pending (remember) */
    shown: null,
    /* the same for the Gear to search line: the latest asked for */
    gearToSearchId: 0,
    init() {
      // the settings as they change: whether the result is out of date (a job switch drops it), and the piece count and
      // empty boxes under Gear to search
      throttledEffect(
        alpine,
        () => {
          const app = this.$store.app;
          // read every input synchronously so the effect tracks it (optimizerKey reads them all)
          const key = optimizerKey(app),
            job = app.job;
          return () => {
            this.nowDeps = key;
            if (this.view && job !== this.viewJob) {
              this.view = null;
              this.failure = '';
            }
            if (!job) return;
            // the line comes back from the solver; one asked for since replaces it. A failed request keeps the old line
            const id = ++this.gearToSearchId;
            const request = solverRequest('gearToSearch', optimizerInputs(alpine.raw(this.$store.app)));
            solver.request(request).then(
              ({ result }) => {
                if (id !== this.gearToSearchId) return;
                this.countText = result.countText;
                this.emptyBoxes = result.emptyBoxes;
                this.gcdLabel = result.gcdLabel;
              },
              error => console.warn('Gear to search line not updated:', error),
            );
          };
        },
        FOLLOW_MS,
      );
    },
    /* Optimize: search with the settings as they are now; the menu picks of the last result are dropped. */
    run() {
      this.remember();
      this.failure = '';
      this.picks = {};
      this.menuOpen = null;
      this.mealPick = null;
      this.lastDeps = optimizerKey(alpine.raw(this.$store.app));
      this.solve();
    },
    /* Save what Cancel puts back (`shown`), before a search changes the picks or the settings key. While a search is
       pending, the result shown is still the one from before it, so the first save stands. */
    remember() {
      if (!this.busy) this.shown = { picks: this.picks, mealPick: this.mealPick, lastDeps: this.lastDeps };
    },
    /* Cancel: drop the pending search and go back to idle at once. The result shown stays, with its menu picks and its
       settings key, so a result older than the settings shows as out of date again. A search running in the worker is
       stopped (the worker is replaced: ui/solver.js workerSolver cancel), so a search asked for next does not wait for
       it; its reply is a cancelled error, ignored in solve(). On the page's thread there is nothing to stop: a solve
       still waiting for its frames is dropped (solveId). */
    cancel() {
      if (!this.busy) return;
      this.solveId++;
      this.busy = false;
      if (this.shown) Object.assign(this, this.shown);
      solver.cancel('solve');
    },
    /* Solve and show the result, with the menu picks made so far; the progress bar shows until it comes. In the worker
       the page stays free meanwhile. A solver on the page's thread holds it (tier ranking up to a few seconds under a
       Target GCD), so the bar is painted first: two frames, the first lays the bar out, the second paints it and
       starts its animation, which then runs on the compositor while the solve holds the thread. The solve starts in a
       task after the second frame (setTimeout), not in its callback, which runs before that frame is painted. */
    async solve() {
      const id = ++this.solveId;
      this.busy = true;
      if (solver.blocksPage) await new Promise(painted => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(painted))));
      if (id !== this.solveId) return;
      // finally: a failed solve must not leave the Optimize button disabled; a cancelled one (cancel()) is no error
      try {
        await this.solveNow(id);
      } catch (error) {
        if (!isCancelled(error) && id === this.solveId) this.fail(error);
      } finally {
        if (id === this.solveId) this.busy = false;
      }
    },
    /* A search that failed (not cancelled): as Cancel, the result shown stays with its picks and settings key, and it
       is marked out of date with the reason (owner, 2026-10-19). */
    fail(error) {
      if (this.shown) Object.assign(this, this.shown);
      const reason = String(error?.message || error || 'unknown error').replace(/\.$/, '');
      this.failure = `The search failed: ${reason}. Press Optimize to try again.`;
    },
    /* Ask the solver for the result and show it, unless solve `id` has been replaced by a newer one meanwhile, or the
       job switched (a job switch drops the result). */
    async solveNow(id = this.solveId) {
      const t0 = performance.now();
      // the plain store: read through Alpine's reactive proxies, the pool's thousands of stat reads cost about
      // twice the run itself, and a worker cannot be sent a proxy (this runs outside the effect, so nothing here needs
      // tracking)
      const raw = alpine.raw(this.$store.app);
      const choices = { pieces: alpine.raw(this.picks), meal: this.mealPick };
      const job = raw.job;
      const { result, ms } = await solver.request(solverRequest('solve', optimizerInputs(raw), choices));
      if (id !== this.solveId || raw.job !== job) return;
      // the search's own time (building the job's gear included, the first time), not the wait for the worker's reply
      this.solveMs = Math.max(1, Math.round(ms));
      this.view = deepFreeze(result); // frozen all through: x-for wraps no row in a proxy
      this.viewId++;
      this.viewJob = job;
      // the settings now: changed while the worker searched, the result shows as out of date
      this.nowDeps = optimizerKey(raw);
      performance.measure('optimizer', { start: t0, duration: ms }); // read by scripts/perf/browser.mjs
    },
    /* A piece picked from row i's menu (its gameId): the row shows it, and the other rows are checked again against
       it. */
    pick(i, gameId) {
      this.remember();
      this.picks = { ...this.picks, [i]: gameId };
      this.menuOpen = null;
      this.solve();
    },
    /* Open or close row i's menu; opened, its search box (in `box`, the row's menu wrapper) starts empty and takes the
       keys. */
    toggleSameMenu(i, box) {
      this.menuOpen = this.menuOpen === i ? null : i;
      if (this.menuOpen === null) return;
      this.sameQuery = '';
      // after x-if has drawn the menu (it is built only while open)
      this.$nextTick(() => requestAnimationFrame(() => box.querySelector('input')?.focus()));
    },
    /* Close row i's menu if it is the one open (a click outside it). */
    closeSameMenu(i) {
      if (this.menuOpen === i) this.menuOpen = null;
    },
    /* the open menu's line when its search leaves no piece (views sameEmptyText) */
    sameEmptyText() {
      return sameEmptyText(this.sameQuery);
    },
    /* row i's menu groups after its search (views samePassing) */
    sameGroups(groups) {
      return samePassing(groups, this.sameQuery);
    },
    /* A meal picked from the Food row's menu (mealMenu): the search runs again with it in place of the best (with tier
       ranking or a Target GCD the meal can change which gear wins). */
    pickMeal(key) {
      this.remember();
      this.mealPick = key;
      this.solve();
    },
    /* the filters under Gear to search: the optimizer's own values (opt.expOff, opt.exclude, opt.market), not the
       browser's */
    ...expansionToggles('opt'),
    ...gearFromToggles('opt'),
    get statOptions() {
      return this.jobCtx.stats.map(s => [s, this.jobCtx.label[s]]);
    },
    /* Tiebreak i's options (1 or 2): none, then every stat not picked above it (ui/ranks.js) */
    tiebreakOptions(i) {
      const o = this.$store.app.opt;
      return [['', 'none']].concat(rankChoices([o.target, o.tb, o.tb2], i, this.jobCtx.stats).map(s => [s, this.jobCtx.label[s]]));
    },
    /* Maximize (0), Tiebreak 1 or Tiebreak 2 set to `value`: a stat another of them holds swaps with this one's old
       one (ui/ranks.js withRank) */
    setGoal(i, value) {
      const o = this.$store.app.opt;
      [o.target, o.tb, o.tb2] = withRank([o.target, o.tb, o.tb2], i, value, this.jobCtx.stats).map(r => r ?? '');
    },
  };
}
