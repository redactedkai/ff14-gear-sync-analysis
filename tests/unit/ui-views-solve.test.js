/* What the page's solver answers for a set page's Fill (src/ui/views/solve.js): the solve's answer by kind, an error
   as an answer instead of a throw, and the Gear to search line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkItem } from '../../src/core/items.js';
import { makeSession } from '../../src/core/session.js';
import { gearToSearchView, searchCount, solveView } from '../../src/ui/views/solve.js';
import { gearOf, inputsOf, makeApp, solveOf, testSession, windowPool } from './helpers/views.js';

const solveOfApp = (app, session = testSession, pins = null) => {
  const { job, sync, level, recipe } = inputsOf(app);
  return solveView(job, sync, level, recipe, session, pins);
};

test('solveView: ok carries the plain set, the recipe and truncated; other kinds carry truncated only', () => {
  const app = makeApp('SGE');
  const ok = solveOfApp(app);
  assert.deepEqual(Object.keys(ok).sort(), ['bestMeals', 'kind', 'recipe', 'set', 'truncated']);
  assert.equal(ok.kind, 'ok');
  assert.equal(ok.bestMeals, null, 'Food is off in the default goal: no meal is tagged');
  assert.equal(ok.truncated, false);
  assert.deepEqual(structuredClone(ok), ok, 'clone-safe: the worker posts it');
  app.recipe.min = 9999; // nothing passes the filters
  const none = solveOfApp(app);
  assert.deepEqual(none, { kind: 'excluded', truncated: false });
});

test('solveView: with Food on, bestMeals are the meals tied for the best result (allMeals order); the set holds the last', () => {
  // Sage, goal Critical Hit, at level 100 and at level 50, both with item level sync 123: several meals tie
  for (const level of [100, 50]) {
    const app = makeApp('SGE', {});
    Object.assign(app, { level });
    Object.assign(app.recipe, { target: 'crit', food: true });
    const { job, sync, recipe } = inputsOf(app);
    const ok = solveView(job, sync, level, recipe, testSession, null);
    const found = solveOf(app).run.found.food;
    assert.equal(ok.kind, 'ok');
    assert.deepEqual(
      ok.bestMeals,
      found.tagged.map(meal => meal.key),
      `level ${level}`,
    );
    assert.ok(ok.bestMeals.length > 1, `level ${level}: a tie of several meals`);
    assert.equal(ok.set.meal, ok.bestMeals.at(-1), 'the set holds the highest item level of them');
    assert.deepEqual(structuredClone(ok), ok);
  }
});

test('solveView: an error of the search becomes an error answer instead of a throw', () => {
  const app = makeApp('SGE');
  const pool = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'].map(t =>
    mkItem(t, t, 130, { sps: 9e5, mind: 9e5, vit: 9e5 }),
  );
  Object.assign(app.recipe, { target: 'sps', tb: 'mind', tb2: 'vit' }); // tiebreaks make the scores large
  app.sync = false; // with sync on these stats would be clamped to normal values
  const v = solveOfApp(app, makeSession({ gear: () => pool }));
  assert.equal(v.kind, 'error');
  assert.match(v.message, /too large/);
});

test('gearToSearchView: the count line, the empty boxes and the Target GCD label', () => {
  const app = makeApp('SGE');
  const { job, sync, level, recipe } = inputsOf(app);
  const v = gearToSearchView(job, sync, level, recipe, testSession);
  const count = searchCount(job, recipe, gearOf(job));
  assert.equal(v.searched, count.searched);
  assert.match(v.countText, /^searching [\d,]+ of [\d,]+ pieces$/);
  assert.equal(count.searched + count.left, gearOf(job).length);
  assert.ok(Array.isArray(v.emptyBoxes));
  assert.match(v.gcdLabel, /^Target GCD \(\d\.\d\d to \d\.\d\d\)$/);
  const spd = gearToSearchView(job, sync, level, { ...recipe, target: 'sps' }, testSession);
  assert.equal(spd.gcdLabel, 'Target GCD (off: the target is speed)');
  // a job with haste names it
  const sam = inputsOf(makeApp('SAM', { sync: false, cap: null, level: 100 }));
  assert.match(gearToSearchView(sam.job, sam.sync, 100, sam.recipe, testSession).gcdLabel, /with Fuka 13%\)$/);
  // a small pool: the count is of that pool
  const pool = windowPool(job);
  const own = gearToSearchView(job, sync, level, recipe, makeSession({ gear: () => pool }));
  assert.ok(pool.length < 1000);
  assert.ok(own.countText.endsWith(` of ${pool.length} pieces`), own.countText);
});
