/* What the page's solver answers for a set page's Auto-fill (src/ui/solve.ts): the solve's answer by kind, an error
   as an answer instead of a throw, and the Gear to search line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES } from '../../../src/core/constants.ts';
import { mkItem } from '../../../src/core/items.ts';
import { makeSession } from '../../../src/core/session.ts';
import { gearToSearchView, searchCount, solveView } from '../../../src/ui/solve.ts';
import type { SolveAnswer } from '../../../src/ui/solve.ts';
import type { SlotType } from '../../../src/core/types.ts';
import type { Pins } from '../../../src/core/recipe.ts';
import type { TestAppState } from '../helpers/common.ts';
import { hasParts, mustFind } from '../helpers/common.ts';
import { gearOf, inputsOf, makeApp, okOf, solveOf, testSession, windowPool } from '../helpers/views.ts';

const solveOfApp = (app: TestAppState, session = testSession, pins: Pins | null = null): SolveAnswer => {
  const { job, sync, level, recipe } = inputsOf(app);
  return solveView(job, sync, level, recipe, session, pins);
};

/* Fails the test unless `answer` is of kind `kind`; TypeScript then reads it as that kind. */
function assertKind<Kind extends SolveAnswer['kind']>(
  answer: SolveAnswer,
  kind: Kind,
): asserts answer is Extract<SolveAnswer, { kind: Kind }> {
  assert.equal(answer.kind, kind);
}

test('solveView: ok carries the plain set, the recipe and truncated; other kinds carry truncated only', () => {
  const app = makeApp('SGE');
  app.recipe.food = false;
  const ok = solveOfApp(app);
  assert.deepEqual(Object.keys(ok).sort(), ['bestMeals', 'kind', 'recipe', 'set', 'truncated']);
  assertKind(ok, 'ok');
  assert.equal(ok.bestMeals, null, 'Food is off in this goal: no meal is tagged');
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
    const found = mustFind(okOf(solveOf(app)).run.found.food, 'the meals of the solve');
    assertKind(ok, 'ok');
    const bestMeals = mustFind(ok.bestMeals, 'the tagged meals');
    assert.deepEqual(
      bestMeals,
      found.tagged.map(meal => meal.key),
      `level ${level}`,
    );
    assert.ok(bestMeals.length > 1, `level ${level}: a tie of several meals`);
    assert.equal(ok.set.meal, bestMeals.at(-1), 'the set holds the highest item level of them');
    assert.deepEqual(structuredClone(ok), ok);
  }
});

test('solveView: an error of the search becomes an error answer instead of a throw', () => {
  const app = makeApp('SGE');
  const slots: SlotType[] = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];
  const pool = slots.map(t => mkItem(t, t, 130, { sps: 9e5, mind: 9e5, vit: 9e5 }));
  Object.assign(app.recipe, { target: 'sps', tb: 'mind', tb2: 'vit' }); // tiebreaks make the scores large
  app.sync = false; // with sync on these stats would be clamped to normal values
  const v = solveOfApp(app, makeSession({ gear: () => pool }));
  assertKind(v, 'error');
  assert.match(v.message, /too large/);
});

test('gearToSearchView: the count line, the pieces per Gear categories box and the Target GCD label', () => {
  const app = makeApp('SGE');
  const { job, sync, level, recipe } = inputsOf(app);
  const v = gearToSearchView(job, sync, level, recipe, testSession);
  const count = searchCount(job, recipe, gearOf(job));
  assert.match(v.countText, /^searching [\d,]+ of [\d,]+ pieces$/);
  assert.equal(count.searched + count.left, gearOf(job).length);
  assert.equal(v.searched, count.searched);
  // a filter nothing passes (item level from above the highest piece) leaves no piece: the page turns Auto-fill off on 0
  assert.equal(gearToSearchView(job, sync, level, { ...recipe, min: '9999' }, testSession).searched, 0);
  // the pieces per "Gear categories" box: a plain object, a number for every box, not tied to the ticked boxes
  assert.deepEqual(
    Object.keys(v.fromCounts),
    ACTIVITIES.map(a => a.key),
  );
  assert.ok(Object.values(v.fromCounts).every(n => Number.isInteger(n) && n >= 0));
  assert.equal('emptyBoxes' in v, false);
  assert.deepEqual(structuredClone(v.fromCounts), v.fromCounts, 'clone-safe: the worker posts it');
  assert.ok(Object.values(gearToSearchView(job, sync, level, { ...recipe, min: '9999' }, testSession).fromCounts).every(n => n === 0));
  assert.deepEqual(gearToSearchView(job, sync, level, { ...recipe, exclude: [], market: false }, testSession).fromCounts, v.fromCounts);
  assert.match(v.gcdLabel.range, /^\d\.\d\d–\d\.\d\d$/);
  assert.equal(v.gcdLabel.haste, null);
  assert.equal(v.gcdLabel.off, null);
  const [fastest, slowest] = v.gcdLabel.range.split('–');
  assert.ok(v.gcdLabel.full.includes(fastest) && v.gcdLabel.full.includes(slowest), v.gcdLabel.full); // the range, as the label shows it
  const spd = gearToSearchView(job, sync, level, { ...recipe, target: 'sps' }, testSession);
  assert.deepEqual([spd.gcdLabel.range, spd.gcdLabel.haste], ['', null]);
  assert.ok(spd.gcdLabel.off && spd.gcdLabel.full && spd.gcdLabel.full !== v.gcdLabel.full, 'the label says the target is off');
  // a job with haste names it
  const sam = inputsOf(makeApp('SAM', { sync: false, cap: null, level: 100 }));
  const samLabel = gearToSearchView(sam.job, sam.sync, 100, sam.recipe, testSession).gcdLabel;
  assert.equal(samLabel.haste, 'Fuka 13%');
  assert.match(samLabel.range, /^\d\.\d\d–\d\.\d\d$/);
  assert.ok(hasParts(samLabel.full, 'Fuka', '13%') && samLabel.full.includes(samLabel.range.split('–')[0]), samLabel.full);
  // a small pool: the count is of that pool
  const pool = windowPool(job);
  const own = gearToSearchView(job, sync, level, recipe, makeSession({ gear: () => pool }));
  assert.ok(pool.length < 1000);
  assert.ok(own.countText.endsWith(` of ${pool.length} pieces`), own.countText);
});
