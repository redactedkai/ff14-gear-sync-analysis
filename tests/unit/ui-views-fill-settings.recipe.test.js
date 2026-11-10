/* The recipe a Fill (and the Gear to search line) sends, built from a set's Fill settings (src/ui/views/fill-settings.js
   fillRecipe, fillSettingsOf): every Fill setting reaches the request, nothing else does, and the session keys
   (core/recipe.js recipeKey) follow the same fields. Replaces the old optimizerKey test of the removed Gear tab ("every
   optimizer setting changes the key, the menu-only state does not"). Expected values are the field lists of the
   settings themselves, and the Food default the owner chose (off). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { syncSettings } from '../../src/ui/settings.js';
import { solverRequest } from '../../src/ui/solver.js';
import { defaultFillSettings, fillRecipe, fillSettingsOf } from '../../src/ui/views/fill-settings.js';
import { sageSet } from './helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const SYNC = syncSettings({ cap: 123, sync: true, level: 100 });

/* a value that differs from `v` and has the same kind */
const other = v => (typeof v === 'boolean' ? !v : Array.isArray(v) ? [...v, 'x'] : typeof v === 'number' ? v + 1 : v === 'x' ? 'y' : 'x');

test('every Fill setting changes the recipe and the solver request, and no other field comes with it', () => {
  const base = defaultFillSettings(SGE);
  const request = settings => solverRequest('solve', { job: SGE, sync: SYNC, level: 100, recipe: fillRecipe(settings) }, { key: 'g_1' });
  const baseRecipe = fillRecipe(base);
  const baseRequest = JSON.stringify(request(base));
  for (const group of ['goal', 'searchCriteria']) {
    for (const field of Object.keys(base[group])) {
      const changed = structuredClone(base);
      changed[group][field] = other(base[group][field]);
      const recipe = fillRecipe(changed);
      const differing = Object.keys(recipe).filter(k => JSON.stringify(recipe[k]) !== JSON.stringify(baseRecipe[k]));
      assert.deepEqual(differing, [field], `${group}.${field}`);
      assert.notEqual(JSON.stringify(request(changed)), baseRequest, `${group}.${field} reaches the request`);
    }
  }
  // the recipe holds exactly the settings' fields: none invented, none missing
  assert.deepEqual(Object.keys(baseRecipe).sort(), [...Object.keys(base.goal), ...Object.keys(base.searchCriteria)].sort());
});

test("the recipe depends on the Fill settings only: the set's name, pieces, pins and meal change nothing", () => {
  const plain = fillRecipe(fillSettingsOf(SGE, sageSet()));
  const busy = sageSet({ name: 'Raid night', meal: 'f1', pinned: { pieces: [2, 3], meal: true } });
  busy.description = 'notes';
  assert.deepEqual(fillRecipe(fillSettingsOf(SGE, busy)), plain);
});

test('a recipe does not share its lists with the settings: editing one never edits the other', () => {
  const settings = defaultFillSettings(SGE);
  const recipe = fillRecipe(settings);
  recipe.exclude.push('x');
  recipe.expOff.push('DT');
  assert.equal(settings.searchCriteria.exclude.includes('x'), false);
  assert.deepEqual(settings.searchCriteria.expOff, []);
});

test("Food is off by default; a save's old meal choice (foodPair) or a missing field adds nothing to the recipe", () => {
  assert.equal(defaultFillSettings(SGE).goal.food, false);
  const old = sageSet({ fillSettings: { goal: { target: 'crit', foodPair: 'spd+spec' } } });
  const recipe = fillRecipe(fillSettingsOf(SGE, old));
  assert.equal('foodPair' in recipe, false);
  assert.deepEqual([recipe.food, recipe.target, recipe.melds], [false, 'crit', true]);
});
