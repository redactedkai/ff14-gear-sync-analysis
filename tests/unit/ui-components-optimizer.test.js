/* The optimizer's component (src/ui/components/optimizer.js), bound to a plain store with stand-ins for Alpine's effect
   and raw: Gear to search following the settings, Optimize, a result out of date after a change, the menus' picks by
   gameId and the meal pick, the goal menus, and one solver session for every solve. What the result shows is checked
   in ui-views-optimizer.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { allMeals } from '../../src/core/food.js';
import { makeSession } from '../../src/core/session.js';
import { optimizer } from '../../src/ui/components/optimizer.js';
import { optimizerInputs } from '../../src/ui/settings.js';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { gearToSearchView, optimizerView } from '../../src/ui/views/optimizer.js';

/* Alpine's effect and raw, as the component uses them: an effect runs at once and again on settle() (a change to the
   store, as Alpine would rerun it); raw is the object itself (the store here is plain). */
function standIn() {
  const effects = [];
  return {
    alpine: {
      effect: fn => {
        effects.push(fn);
        fn();
      },
      raw: x => x,
    },
    rerun: () => {
      for (const fn of effects) fn();
    },
  };
}

/* The component bound to the store of `saved` with `session`, its init run; settle() reruns its effect after a change
   and waits out its debounce. */
function bound(saved, session = makeSession()) {
  const app = createAppStore(restoreState(saved));
  const { alpine, rerun } = standIn();
  const c = Object.assign(optimizer(alpine, session), { $store: { app }, $nextTick: () => {} });
  c.init();
  const settle = async () => {
    rerun();
    await new Promise(resolve => setTimeout(resolve, 150));
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
  c.solveNow();
  const { job, sync, level, recipe } = optimizerInputs(app);
  assert.deepEqual(c.view, optimizerView(job, sync, level, recipe, session));
  assert.ok(Object.isFrozen(c.view));
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

test('optimizer: a piece picked from a row by gameId and a picked meal are shown; Optimize drops both', () => {
  const { app, c } = bound(SGE);
  c.run();
  c.solveNow();
  const row = c.view.rows.findIndex(r => r.same);
  const other = c.view.rows[row].same.groups.flatMap(g => g.items).find(x => !x.on);
  assert.equal(typeof other.key, 'number', 'a menu item is keyed by its gameId');
  c.pick(row, other.key);
  assert.deepEqual(c.picks, { [row]: other.key });
  c.solveNow();
  assert.equal(c.view.rows[row].item.gameId, other.key);
  const meal = allMeals(app.jobCtx)[3];
  c.pickMeal(meal.key);
  c.solveNow();
  assert.deepEqual([c.view.food.name, c.view.food.picked], [meal.name, true]);
  assert.equal(c.view.rows[row].item.gameId, other.key, 'the piece stays picked');
  c.run();
  c.solveNow();
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
  c.solveNow();
  c.pick(0, -1);
  c.solveNow();
  assert.equal(gearBuilt, 1);
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
