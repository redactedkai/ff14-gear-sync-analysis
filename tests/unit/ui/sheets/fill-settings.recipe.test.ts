/* The recipe an Auto-fill (and the Gear to search line) sends, built from a set's Auto-fill settings (src/ui/sheets/fill-settings.ts
   fillRecipe, fillSettingsOf): every Auto-fill setting reaches the request, nothing else does. Replaces the old optimizerKey test of the removed Gear tab ("every
   optimizer setting changes the key, the menu-only state does not"). Expected values are the field lists of the
   settings themselves, and the Food default the owner chose (off). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { syncSettings } from '../../../../src/ui/job-sync-panel.ts';
import { solverRequest } from '../../../../src/ui/solver.ts';
import { defaultFillSettings, fillRecipe, fillSettingsOf } from '../../../../src/ui/sheets/fill-settings.ts';
import type { FillSettings } from '../../../../src/ui/sheets/saved-types.ts';
import { sageSet } from '../../helpers/sheet-fixtures.ts';

const SGE = makeJobContext('SGE');
const SYNC = syncSettings({ cap: 123, sync: true, level: 100 });

/* a value that differs from `v` and has the same kind */
const other = (v: unknown): unknown => {
  if (typeof v === 'boolean') {
    return !v;
  }
  if (Array.isArray(v)) {
    return [...v, 'x'];
  }
  if (typeof v === 'number') {
    return v + 1;
  }
  return v === 'x' ? 'y' : 'x';
};

/* The list `field` of `owner` (a recipe), as a list the test may change. */
function listOf(owner: object, field: string): unknown[] {
  const list = Reflect.get(owner, field);
  if (!Array.isArray(list)) {
    throw new Error(`${field} is not a list`);
  }
  return list;
}

test('every Auto-fill setting changes the recipe and the solver request, and no other field comes with it', () => {
  const base = defaultFillSettings(SGE);
  const request = (settings: FillSettings) =>
    solverRequest('solve', { job: SGE, sync: SYNC, level: 100, recipe: fillRecipe(settings) }, { key: 'g_1' });
  const baseRecipe = fillRecipe(base);
  const baseRequest = JSON.stringify(request(base));
  for (const group of ['goal', 'searchCriteria'] as const) {
    for (const field of Object.keys(base[group])) {
      const changed = structuredClone(base);
      Reflect.set(changed[group], field, other(Reflect.get(base[group], field)));
      const recipe = fillRecipe(changed);
      const differing = Object.keys(recipe).filter(
        k => JSON.stringify(Reflect.get(recipe, k)) !== JSON.stringify(Reflect.get(baseRecipe, k)),
      );
      assert.deepEqual(differing, [field], `${group}.${field}`);
      assert.notEqual(JSON.stringify(request(changed)), baseRequest, `${group}.${field} reaches the request`);
    }
  }
  // the recipe holds exactly the settings' fields: none invented, none missing
  assert.deepEqual(Object.keys(baseRecipe).sort(), [...Object.keys(base.goal), ...Object.keys(base.searchCriteria)].sort());
});

test("the recipe depends on the Auto-fill settings only: the set's name, pieces, pins and meal change nothing", () => {
  const plain = fillRecipe(fillSettingsOf(SGE, sageSet()));
  const busy = sageSet({ name: 'Raid night', meal: 'f1', pinned: { pieces: [2, 3], meal: true } });
  busy.description = 'notes';
  assert.deepEqual(fillRecipe(fillSettingsOf(SGE, busy)), plain);
});

test('a recipe does not share its lists with the settings: editing one never edits the other', () => {
  const settings = defaultFillSettings(SGE);
  const recipe = fillRecipe(settings);
  listOf(recipe, 'exclude').push('x');
  listOf(recipe, 'expOff').push('DT');
  assert.equal(settings.searchCriteria.exclude.includes('x'), false);
  assert.deepEqual(settings.searchCriteria.expOff, []);
});

test("Food is on by default; a save's old meal choice (foodPair) or a missing field adds nothing to the recipe", () => {
  assert.equal(defaultFillSettings(SGE).goal.food, true);
  const oldGoal = { target: 'crit', foodPair: 'spd+spec' } as const;
  const old = sageSet({ fillSettings: { goal: oldGoal } });
  const recipe = fillRecipe(fillSettingsOf(SGE, old));
  assert.equal('foodPair' in recipe, false);
  assert.deepEqual([recipe.food, recipe.target, recipe.melds], [true, 'crit', true]);
});
