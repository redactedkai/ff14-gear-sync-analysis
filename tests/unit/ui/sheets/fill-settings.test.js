/* A set's Auto-fill settings (src/ui/sheets/fill-settings.js) on real items: the defaults, a stat the job lacks put back, the
   recipe and the goal line they make. Expected values come from the items' published facts, not from the code. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { defaultFillSettings, fillRecipe, fillSettingsOf, goalText } from '../../../../src/ui/sheets/fill-settings.js';
import { sageSet } from '../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');

test('Auto-fill settings: the defaults, a stat the job lacks put back, the level filter held to the job', () => {
  assert.equal(defaultFillSettings(SGE).goal.target, 'mind');
  assert.equal(defaultFillSettings(makeJobContext('BLU')).searchCriteria.lvl, 80);
  const drg = makeJobContext('DRG'); // no special substat
  const own = { goal: { target: 'piety', tb: 'crit', tb2: 'crit' }, searchCriteria: { lvl: 200, market: false } };
  const settings = fillSettingsOf(drg, sageSet({ fillSettings: own }));
  assert.deepEqual([settings.goal.target, settings.goal.tb, settings.goal.tb2], ['str', 'crit', '']);
  assert.deepEqual([settings.searchCriteria.lvl, settings.searchCriteria.market], [100, false]);
  assert.deepEqual(fillSettingsOf(SGE, sageSet()), defaultFillSettings(SGE));

  const recipe = fillRecipe(settings);
  assert.deepEqual([recipe.target, recipe.tb, recipe.lvl, recipe.market, recipe.byTier], ['str', 'crit', 100, false, true]);
  assert.notEqual(recipe.exclude, settings.searchCriteria.exclude, 'the recipe holds its own lists');
});

test('the goal line: stat abbreviations in rank order, then the Target GCD', () => {
  const goal = { target: 'mind', tb: 'crit', tb2: 'det', gcd: '', gcdMode: 'exact' };
  assert.equal(goalText(SGE, goal), 'MND › CRT › DET');
  assert.equal(goalText(SGE, { ...goal, tb2: '', gcd: 2.45, gcdMode: 'min' }), 'MND › CRT, GCD 2.45 or faster');
  assert.equal(goalText(SGE, { ...goal, tb: '', tb2: '', gcd: '2.5' }), 'MND, GCD 2.50');
});
