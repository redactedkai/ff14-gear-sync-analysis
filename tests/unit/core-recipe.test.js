/* A recipe and its solve (src/core/recipe.js): the session keys each recipe field belongs to, the solve's set and record,
   picks by gameId, and that a warm session gives what a fresh one does without solving again what it already holds. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES } from '../../src/core/constants.js';
import { allMeals } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { recipeKey, runRecipe } from '../../src/core/recipe.js';
import { makeSession } from '../../src/core/session.js';
import { defaultState } from '../../src/ui/state.js';
import { recipeOf, syncSettings } from '../../src/ui/settings.js';
import { appState } from './helpers/common.js';

const sge = makeJobContext('SGE');
const SYNC = { cap: 123, sync: true, level: 100 };
/* The page's recipe for Sage with `patch` on top. */
const recipe = (patch = {}) => ({ ...recipeOf(appState({ job: 'SGE' })), ...patch });

test('recipeKey: each kind of session entry changes with exactly the fields it depends on', () => {
  const pool = ['exclude', 'market', 'expOff', 'min', 'max', 'lvl', 'melds'];
  const dependsOn = {
    tier: pool,
    fast: pool,
    prep: [...pool, 'target', 'tb', 'tb2', 'gcdMode'],
    same: [...pool, 'target', 'tb', 'tb2'],
  };
  const other = v => (typeof v === 'boolean' ? !v : Array.isArray(v) ? [...v, 'x'] : v === 'x' ? 'y' : 'x');
  const base = recipe();
  for (const [kind, fields] of Object.entries(dependsOn)) {
    const key = recipeKey(kind, sge, SYNC, 100, base);
    for (const field of Object.keys(defaultState().opt)) {
      const changed = recipeKey(kind, sge, SYNC, 100, { ...base, [field]: other(base[field]) });
      assert.equal(changed !== key, fields.includes(field), `${kind}: ${field}`);
    }
    // the job, sync, level and the extra part always count
    assert.notEqual(recipeKey(kind, makeJobContext('WHM'), SYNC, 100, base), key);
    assert.notEqual(recipeKey(kind, sge, { ...SYNC, cap: 124 }, 100, base), key);
    assert.notEqual(recipeKey(kind, sge, SYNC, 90, base), key);
    assert.notEqual(recipeKey(kind, sge, SYNC, 100, base, 'min'), key);
  }
});

test('runRecipe: the set by gameId, the record with the goal as asked, and no set when nothing passes the filters', () => {
  const asked = recipe({ target: 'main', tb: 'crit', food: true });
  const run = runRecipe(sge, SYNC, 100, asked, makeSession());
  assert.equal(run.status, 'ok');
  assert.ok(Object.isFrozen(run.set) && Object.isFrozen(run.record));
  assert.equal(run.set.pieces.length, 11);
  for (const [i, piece] of run.set.pieces.entries()) {
    const pick = run.found.picks[i];
    assert.equal(piece.gameId, pick.item?.gameId, `row ${i}`);
    if (pick.item) assert.equal(piece.name, pick.item.name);
  }
  assert.equal(run.set.meal, run.found.food.shown.key);
  // the record is a frozen copy: a later change to the recipe handed in does not reach it
  assert.deepEqual(run.record, { job: 'SGE', sync: SYNC, level: 100, recipe: asked });
  asked.target = 'det';
  asked.exclude.push('crafted');
  assert.equal(run.record.recipe.target, 'main');
  assert.ok(!run.record.recipe.exclude.includes('crafted'));
  // every box off and no market board
  const none = runRecipe(sge, SYNC, 100, recipe({ exclude: ACTIVITIES.map(a => a.key), market: false }), makeSession());
  assert.deepEqual([none.status, none.set], ['excluded', null]);
});

test('runRecipe: a piece picked by gameId is shown where it gives the same result', () => {
  const asked = recipe({ target: 'main', tb: 'crit' });
  const session = makeSession();
  const run = runRecipe(sge, SYNC, 100, asked, session);
  // the first other piece of some row's menu that the row takes (a menu lists the pieces that fit the rows as shown,
  // which a pick is checked against again)
  let shown = null;
  for (const [row, options] of run.found.options.entries()) {
    for (const c of options.filter(o => o.item !== run.found.picks[row].item)) {
      const picked = runRecipe(sge, SYNC, 100, asked, session, { pieces: { [row]: c.item.gameId } });
      if (picked.set.pieces[row].gameId === c.item.gameId) shown = { row, picked };
      if (shown) break;
    }
    if (shown) break;
  }
  assert.ok(shown, 'some row shows a picked piece');
  assert.equal(shown.picked.status, 'ok');
});

/* A session that counts what its memo builds and what its get finds, by kind. */
function counting() {
  const inner = makeSession();
  const built = {},
    found = {};
  return {
    built,
    found,
    session: {
      gear: inner.gear,
      memo: (kind, key, build) =>
        inner.memo(kind, key, () => {
          built[kind] = (built[kind] ?? 0) + 1;
          return build();
        }),
      get: (kind, key) => {
        const v = inner.get(kind, key);
        if (v !== undefined) found[kind] = (found[kind] ?? 0) + 1;
        return v;
      },
      set: inner.set,
    },
  };
}

test('runRecipe: a warm session gives what a fresh one does, and keeps its lists while only the GCD, meal or picks change', () => {
  const { session, built, found } = counting();
  const steps = [
    recipe({ target: 'det', tb: 'crit', byTier: false, gcd: 2.4, gcdMode: 'min' }),
    recipe({ target: 'det', tb: 'crit', byTier: false, gcd: 2.45, gcdMode: 'min' }),
    recipe({ target: 'det', tb: 'crit', byTier: false, gcd: 2.4, gcdMode: 'min', food: true }),
    recipe({ target: 'crit', tb: 'det', byTier: true, gcd: 2.45, food: true }),
    recipe({ target: 'det', tb: 'dh', byTier: true, food: true }),
    recipe({ target: 'det', tb: 'dh', byTier: true, food: true }),
  ];
  const sync = syncSettings({ cap: 400, sync: true, level: 80 });
  const meal = allMeals(sge)[5].key;
  for (const [i, r] of steps.entries()) {
    const choices = i === 5 ? { meal } : {};
    const warm = runRecipe(sge, sync, 80, r, session, choices);
    const fresh = runRecipe(sge, sync, 80, r, makeSession(), choices);
    assert.equal(warm.status, 'ok', `step ${i}`);
    assert.deepEqual(warm.set, fresh.set, `step ${i}`);
    assert.deepEqual([warm.found.gcd, warm.found.held, warm.found.truncated], [fresh.found.gcd, fresh.found.held, fresh.found.truncated]);
  }
  // Target GCD's candidates: built by the first search, reused by the next two (another GCD, then food)
  assert.equal(found.prep, 2);
  // the menus' candidates: one list for det > crit with a GCD, one for crit > det, one for det > dh with none
  assert.equal(built.same, 3);
  // tier ranking's lists: one map for the pool, whatever the goal, meal or GCD
  assert.equal(built.tier, 1);
});
