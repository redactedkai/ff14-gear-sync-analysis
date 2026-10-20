/* The optimizer's component (src/ui/components/optimizer.js), bound to a plain store with stand-ins for Alpine's effect
   and raw: Gear to search following the settings, Optimize, a result out of date after a change, the menus' picks by
   gameId and the meal pick, the goal menus, and one solver session for every solve. What the result shows is checked
   in ui-views-optimizer.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { allMeals } from '../../src/core/food.js';
import { makeSession } from '../../src/core/session.js';
import { FOLLOW_MS, optimizer } from '../../src/ui/components/optimizer.js';
import { inProcessSolver } from '../../src/ui/solver.js';
import { optimizerInputs } from '../../src/ui/settings.js';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { gearToSearchView, optimizerView } from '../../src/ui/views/optimizer.js';

/* Alpine's effect and raw, as the component uses them: an effect runs at once and again on settle() (a change to the
   store, as Alpine would rerun it); raw is the object itself (the store here is plain). inEffect() says whether an
   effect is running: work done then would be tracked by the real effect (the solver stand-in in bound() checks it). */
function standIn() {
  const effects = [];
  let running = 0;
  const run = fn => {
    running++;
    try {
      fn();
    } finally {
      running--;
    }
  };
  return {
    alpine: {
      effect: fn => {
        effects.push(fn);
        run(fn);
      },
      raw: x => x,
    },
    rerun: () => {
      for (const fn of effects) run(fn);
    },
    inEffect: () => running > 0,
  };
}

/* The component bound to the store of `saved` with `session` (or with `solver`, the page thread's by default), its
   init run; settle() reruns its effect after a change and waits out its throttle (FOLLOW_MS, and a little more). */
function bound(saved, session = makeSession(), solver = inProcessSolver(session)) {
  const app = createAppStore(restoreState(saved));
  const { alpine, rerun, inEffect } = standIn();
  // the solver as given, but a request asked from inside an effect fails the test (the Gear to search line must ask
  // from its timer, not from the effect: audit 2, 01 #1)
  const checked = Object.create(solver, {
    request: {
      value: request => {
        assert.equal(inEffect(), false, `a ${request.kind} request was asked inside an effect`);
        return solver.request(request);
      },
    },
  });
  const c = Object.assign(optimizer(alpine, checked), { $store: { app }, $nextTick: () => {} });
  c.init();
  const settle = async () => {
    rerun();
    await new Promise(resolve => setTimeout(resolve, FOLLOW_MS + 30));
  };
  return { app, c, settle };
}

const SGE = { job: 'SGE', sync: true, cap: 123, level: 100, opt: { food: true, byTier: false } };

/* The page's frames: kept here, so a test runs them (frames()) or calls solveNow itself. */
let pending = [];
globalThis.requestAnimationFrame = callback => pending.push(callback);
const frames = async () => {
  while (pending.length) {
    const now = pending;
    pending = [];
    for (const callback of now) callback();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
};

test('optimizer: Optimize shows the progress bar, then solves two frames later; a newer solve drops an older one', async () => {
  const { c } = bound(SGE);
  c.run();
  c.run();
  assert.equal(c.busy, true);
  assert.equal(c.view, null, 'not before the bar is painted');
  await frames();
  assert.equal(c.busy, false);
  assert.equal(c.view.kind, 'ok');
  assert.equal(c.viewId, 1, 'the older solve was dropped');
  assert.ok(c.solveMs >= 1);
  pending = [];
});

test('optimizer: Gear to search follows the settings once they rest', async () => {
  const { app, c, settle } = bound(SGE);
  await settle();
  const { job, sync, level, recipe } = optimizerInputs(app);
  const side = gearToSearchView(job, sync, level, recipe, makeSession());
  assert.deepEqual([c.countText, c.emptyBoxes, c.gcdLabel], [side.countText, side.emptyBoxes, side.gcdLabel]);
  assert.equal(c.gcdFieldLabel, c.gcdLabel, 'no result: the label for the settings now');
  app.opt.min = 600;
  await settle();
  assert.notEqual(c.countText, side.countText);
});

test('optimizer: Optimize shows the result for the settings; a change marks it out of date; a job switch drops it', async () => {
  // the expected view from the same session: its pool items are the ones the rows hold
  const session = makeSession();
  const { app, c, settle } = bound(SGE, session);
  assert.equal(c.view, null);
  c.run();
  // the solve waits for the progress bar to be painted (two frames); here it runs at once
  await c.solveNow();
  const { job, sync, level, recipe } = optimizerInputs(app);
  assert.deepEqual(c.view, optimizerView(job, sync, level, recipe, session));
  assert.ok(Object.isFrozen(c.view));
  // frozen all through, so the template's x-for wraps no row or cell in a reactive proxy
  assert.ok(Object.isFrozen(c.view.rows[0]) && Object.isFrozen(c.view.rows[0].cells[0]));
  assert.equal(c.stale, false);
  assert.equal(c.gcdFieldLabel, c.view.gcdUi.label);
  app.opt.tb = 'det';
  await settle();
  assert.equal(c.stale, true);
  assert.equal(c.gcdFieldLabel, c.gcdLabel);
  app.opt.tb = '';
  await settle();
  assert.equal(c.stale, false, 'back to the settings it was solved for');
  app.setJob('WAR');
  await settle();
  assert.equal(c.view, null);
});

test('optimizer: a piece picked from a row by gameId and a picked meal are shown; Optimize drops both', async () => {
  const { app, c } = bound(SGE);
  c.run();
  await c.solveNow();
  const row = c.view.rows.findIndex(r => r.same);
  const other = c.view.rows[row].same.groups.flatMap(g => g.items).find(x => !x.on);
  assert.equal(typeof other.key, 'number', 'a menu item is keyed by its gameId');
  c.pick(row, other.key);
  assert.deepEqual(c.picks, { [row]: other.key });
  await c.solveNow();
  assert.equal(c.view.rows[row].item.gameId, other.key);
  const meal = allMeals(app.jobCtx)[3];
  c.pickMeal(meal.key);
  await c.solveNow();
  assert.deepEqual([c.view.food.name, c.view.food.picked], [meal.name, true]);
  assert.equal(c.view.rows[row].item.gameId, other.key, 'the piece stays picked');
  c.run();
  await c.solveNow();
  assert.deepEqual([c.picks, c.mealPick, c.view.food.picked], [{}, null, false]);
});

test('optimizer: every solve and the Gear to search line share one session', async () => {
  const inner = makeSession();
  let gearBuilt = 0;
  const session = makeSession({
    gear: job => {
      gearBuilt++;
      return inner.gear(job);
    },
  });
  const { c, settle } = bound(SGE, session);
  await settle();
  c.run();
  await c.solveNow();
  c.pick(0, -1);
  await c.solveNow();
  assert.equal(gearBuilt, 1);
});

/* A solver like the page's worker: it does not block the page, and answers each request only when the test says
   (answer(i): request i, with the page thread's own reply), in any order. cancel(kind) rejects the requests of that
   kind not yet answered with a cancelled error, as the worker solver does, and logs the kind in `cancelled`. */
function heldSolver() {
  const local = inProcessSolver();
  const asked = [];
  const cancelled = [];
  return {
    asked,
    cancelled,
    blocksPage: false,
    cancel(kind) {
      cancelled.push(kind);
      const open = asked.filter(a => a.request.kind === kind && !a.done);
      for (const a of open) a.cancel();
      return open.length > 0;
    },
    request: request =>
      new Promise((resolve, reject) => {
        const entry = {
          request,
          done: false,
          answer: () => {
            entry.done = true;
            return local.request(request).then(resolve);
          },
          cancel: () => {
            entry.done = true;
            reject(Object.assign(new Error('search cancelled'), { cancelled: true }));
          },
          fail: message => {
            entry.done = true;
            reject(new Error(message));
          },
        };
        asked.push(entry);
      }),
    answer: i => asked[i].answer(),
    /* request i fails with an error that is not a cancel (a reply the worker could not send, say) */
    fail: (i, message) => asked[i].fail(message),
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('optimizer: with a worker, the search starts at once; a reply for a replaced solve is dropped', async () => {
  const solver = heldSolver();
  const { c } = bound(SGE, undefined, solver);
  c.run();
  await tick();
  assert.equal(solver.asked.length, 1, 'no frames waited for: the page is not blocked');
  assert.equal(c.busy, true);
  // a meal picked while the first search runs: a second solve, answered first
  c.pickMeal(allMeals(c.jobCtx)[3].key);
  await tick();
  assert.equal(solver.asked.length, 2);
  await solver.answer(1);
  await tick();
  assert.equal(c.view.food.picked, true);
  assert.equal(c.busy, false);
  const shown = c.view;
  await solver.answer(0);
  await tick();
  assert.equal(c.view, shown, 'the older reply is not shown');
  assert.equal(c.viewId, 1);
});

test('optimizer: Cancel goes back to idle at once and keeps the result shown, its picks and its out-of-date mark', async () => {
  const solver = heldSolver();
  const { app, c, settle } = bound(SGE, undefined, solver);
  // the newest solve asked for (the Gear to search line asks too, once the settings rest)
  const answerSolve = () => solver.answer(solver.asked.findLastIndex(a => a.request.kind === 'solve'));
  c.run();
  await tick();
  await answerSolve();
  await tick();
  const shown = c.view;
  const meal = allMeals(c.jobCtx)[3].key;
  c.pickMeal(meal);
  await tick();
  await answerSolve();
  await tick();
  const withMeal = c.view;
  assert.equal(withMeal.food.picked, true);

  // a setting changes, Optimize runs, and Cancel is pressed while the worker searches
  app.opt.tb = 'det';
  await settle();
  assert.equal(c.stale, true);
  c.run();
  await tick();
  assert.deepEqual([c.busy, c.mealPick, c.stale], [true, null, false]);
  c.cancel();
  assert.equal(c.busy, false, 'idle at once');
  assert.equal(c.view, withMeal);
  assert.equal(c.mealPick, meal, 'the meal pick of the result shown is back');
  assert.equal(c.stale, true, 'the result is still older than the settings');

  // the solver is told to stop the search; its reply, a cancelled error, is ignored (no unhandled rejection)
  assert.deepEqual(solver.cancelled, ['solve']);
  await tick();
  assert.equal(c.view, withMeal);
  assert.equal(c.busy, false);
  assert.notEqual(shown, withMeal);

  // Cancel with nothing pending does nothing; Optimize after a cancel shows its own result
  const id = c.solveId;
  c.cancel();
  assert.deepEqual([c.solveId, solver.cancelled.length], [id, 1]);
  c.run();
  await tick();
  await answerSolve();
  await tick();
  assert.deepEqual([c.busy, c.stale, c.mealPick], [false, false, null]);
  assert.notEqual(c.view, withMeal);
});

/* Audit 2, finding 01-2: a failed search (not a cancel) was an unhandled rejection, and the old result stayed undimmed
   as if it matched the settings. */
test('optimizer: a failed search keeps the result shown, out of date, with the reason; the next Optimize clears it', async t => {
  const solver = heldSolver();
  const { app, c, settle } = bound(SGE, undefined, solver);
  const lastSolve = () => solver.asked.findLastIndex(a => a.request.kind === 'solve');
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  c.run();
  await tick();
  await solver.answer(lastSolve());
  await tick();
  const shown = c.view;
  const meal = allMeals(c.jobCtx)[3].key;
  c.pickMeal(meal);
  await tick();
  await solver.answer(lastSolve());
  await tick();
  const withMeal = c.view;

  // a setting changes, and the search Optimize asks for fails
  app.opt.tb = 'det';
  await settle();
  c.run();
  await tick();
  solver.fail(lastSolve(), 'out of memory.');
  await tick();
  assert.equal(c.busy, false);
  assert.equal(c.view, withMeal, 'the result from before stays');
  assert.equal(c.mealPick, meal, 'with its meal pick');
  assert.equal(c.stale, true, 'marked out of date');
  assert.equal(c.failure, 'The search failed: out of memory. Press Optimize to try again.');

  // a failed search with the settings unchanged (a meal pick): still out of date, the meal pick of the result shown back
  app.opt.tb = '';
  await settle();
  c.run();
  await tick();
  assert.equal(c.failure, '', 'Optimize clears the line');
  await solver.answer(lastSolve());
  await tick();
  assert.deepEqual([c.stale, c.failure], [false, '']);
  const current = c.view;
  c.pickMeal(meal);
  await tick();
  solver.fail(lastSolve(), 'worker gone');
  await tick();
  assert.equal(c.view, current);
  assert.deepEqual([c.mealPick, c.stale, c.busy], [null, true, false]);
  assert.equal(c.failure, 'The search failed: worker gone. Press Optimize to try again.');
  assert.notEqual(shown, current);

  // the Gear to search request fails: the line keeps its text, and nothing is left unhandled
  const before = [c.countText, c.gcdLabel];
  app.opt.min = 600;
  await settle();
  const warn = t.mock.method(console, 'warn', () => {});
  solver.fail(
    solver.asked.findLastIndex(a => a.request.kind === 'gearToSearch'),
    'cannot clone',
  );
  await tick();
  assert.deepEqual([c.countText, c.gcdLabel], before);
  assert.equal(warn.mock.callCount(), 1);
  await tick();
  assert.deepEqual(unhandled, []);
});

test('optimizer: Cancel before a page-thread solve starts drops it', async () => {
  const { c } = bound(SGE);
  c.run();
  c.cancel();
  await frames();
  assert.deepEqual([c.busy, c.view], [false, null]);
  pending = [];
});

test('optimizer: a reply that comes after a job switch is dropped; Gear to search shows the newest line', async () => {
  const solver = heldSolver();
  const { app, c, settle } = bound(SGE, undefined, solver);
  await settle();
  c.run();
  await tick();
  app.setJob('WAR');
  await solver.answer(solver.asked.findIndex(a => a.request.kind === 'solve'));
  await tick();
  assert.equal(c.view, null);
  assert.equal(c.busy, false);
  // two Gear to search lines asked for (SGE's, then WAR's after the switch), answered newest first
  await settle();
  const sides = solver.asked.filter(a => a.request.kind === 'gearToSearch');
  assert.deepEqual(
    sides.map(a => a.request.jobId),
    ['SGE', 'WAR'],
  );
  await sides[1].answer();
  await tick();
  const war = c.countText;
  await sides[0].answer();
  await tick();
  assert.equal(c.countText, war, "the older (SGE's) line is not shown");
});

test('optimizer: the goal menus hold a stat once; picking one another rank holds swaps them', () => {
  const { app, c } = bound(SGE);
  assert.deepEqual(
    c.statOptions.map(o => o[0]),
    app.jobCtx.stats,
  );
  c.setGoal(1, 'crit');
  c.setGoal(2, 'det');
  assert.ok(!c.tiebreakOptions(2).some(o => o[0] === 'crit'));
  c.setGoal(0, 'crit');
  assert.deepEqual([app.opt.target, app.opt.tb, app.opt.tb2], ['crit', 'main', 'det']);
});

/* Audit 07, finding 5: three components imported Alpine when their module loaded, so Node could not load them. Only
   the entry point does now, and hands the optimizer what it needs. */
test('no component imports Alpine: main.js passes it in', () => {
  const dir = new URL('../../src/ui/components/', import.meta.url);
  for (const file of readdirSync(dir)) assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /from 'alpinejs'/, file);
});
