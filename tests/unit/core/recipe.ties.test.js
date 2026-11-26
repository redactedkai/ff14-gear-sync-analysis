/* How Auto-fill's ties behave, as three real cases (docs/engineering/optimizer.md, "Ties").

   The rule, as it is:
   - What the search ranks (weapon damage, the goal and its tiebreaks) comes out the same in every pool order.
   - Which pieces show is NOT the same in every pool order when several pieces tie on what is ranked: the optimizer keeps
     the first of equal sets it finds (higher-ranked pieces first, then the order of the pool), and same-result.ts keeps
     "the optimizer's own pick" when two pieces are equally easy (same equip level, same item level). So the pieces, and
     with melds the stones, depend on the order of the pool. That is by design: a fixed tie-break was considered and not
     made (the owner's decision), so this test asserts the rule as it is. It asserts equal pieces nowhere, and it asserts
     that a tie exists: in each case two pieces with equal ranked stats are chosen when the pool comes in the database's
     order and when it comes reversed.

   If a fixed tie-break is ever added, the tie assertions below fail on purpose: change this test then to assert that the
   same pieces (and stones) come out in every order, and give the ties the new rule's name; keep the totals check.

   The pool orders are the database's own, its reverse (two orders that need no seed) and three seeded shuffles (totals
   only). The three cases:
   - Sage, cap 123 at level 50, goal Mind, no tiebreak, plain search: every piece is capped, so many pieces tie on Mind and
     differ only in the stats nobody ranked (hands, legs, earrings and both rings).
   - Paladin, no sync, level 100, goal Strength, no tiebreak: two rings of item level 780 with identical stats.
   - Bard, no sync, level 100, goal Critical Hit then Determination, with melds: two pieces of the same stats where the
     stones differ (crit, crit or det, det: both reach the same capped totals). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weaponDamage } from '../../../src/core/damage-defense.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { equipLevel, jobGear } from '../../../src/core/items.ts';
import { runRecipe } from '../../../src/core/recipe.ts';
import { makeSession } from '../../../src/core/session.ts';
import { evaluateSet } from '../../../src/core/set.ts';
import { syncSettings } from '../../../src/ui/job-sync-panel.ts';
import { defaultFillSettings, fillRecipe } from '../../../src/ui/sheets/fill-settings.ts';
import { rankedOf, setKey, shuffled } from '../helpers/recipe-sets.js';

const ORDER_SEEDS = [11, 222, 3333]; // the shuffled pool orders, besides the database's own and its reverse

/* The three cases. goal: the recipe's changes to the neutral default; totals: the gear's exact totals of the stats the
   search ranks, as every order gives them; ties: where the database order and the reversed order show other pieces, by
   row of the set, with the game ids the database order and the reversed order choose (rows: weapon, off-hand if the job has
   one, head, body, hands, legs, feet, earrings, necklace, wrist, rings) and what the two pieces share:
     'everything'  every stat, the item level and the equip level (two copies of one piece, as the game has them);
     'ranked'      the ranked stats only; some other stat or the stones differ. */
const CASES = [
  {
    name: 'Sage at cap 123, level 50, Mind',
    jobId: 'SGE',
    cap: 123,
    level: 50,
    goal: { target: 'mind', tb: '', byTier: false, melds: false, food: false },
    totals: { mind: 356 },
    ties: [
      { row: 3, slot: 'hands', database: 14739, reversed: 10898, share: 'ranked' },
      { row: 4, slot: 'legs', database: 13673, reversed: 11355, share: 'ranked' },
      { row: 6, slot: 'ear', database: 13314, reversed: 12450, share: 'ranked' },
      { row: 9, slot: 'ring', database: 12471, reversed: 12451, share: 'ranked' },
      { row: 10, slot: 'ring', database: 13218, reversed: 11059, share: 'ranked' },
    ],
  },
  {
    name: 'Paladin, no sync, level 100, Strength',
    jobId: 'PLD',
    cap: null,
    level: 100,
    goal: { target: 'str', tb: '', byTier: false, melds: false, food: false },
    totals: { str: 5980 },
    ties: [{ row: 11, slot: 'ring', database: 51182, reversed: 49576, share: 'everything' }],
  },
  {
    name: 'Bard, no sync, level 100, Critical Hit then Determination, melds',
    jobId: 'BRD',
    cap: null,
    level: 100,
    goal: { target: 'crit', tb: 'det', byTier: false, melds: true, food: false },
    totals: { crit: 3139, det: 1850 },
    ties: [
      { row: 3, slot: 'hands', database: 51873, reversed: 50870, share: 'ranked' },
      { row: 10, slot: 'ring', database: 51184, reversed: 49578, share: 'ranked' },
    ],
  },
];

/* Auto-fill for `testCase` with the job's gear in `pool`'s order: {job, sync, recipe, set, evaluated}. */
function solveWith(testCase, pool) {
  const job = makeJobContext(testCase.jobId);
  const sync = syncSettings({ cap: testCase.cap, sync: testCase.cap != null, level: testCase.level });
  const recipe = { ...fillRecipe(defaultFillSettings(job)), ...testCase.goal };
  const result = runRecipe(job, sync, testCase.level, recipe, makeSession({ gear: () => pool }));
  assert.equal(result.status, 'ok', `${testCase.name}: ${result.status}`);
  return { job, sync, recipe, set: result.set, evaluated: evaluateSet(job, result.set, sync, testCase.level) };
}

/* The gear's weapon damage after sync: the first key of every search, which the ranked text of rankedOf leaves out. */
function weaponDamageOf(job, evaluated) {
  return evaluated.rows.reduce((sum, row) => sum + (row.item ? weaponDamage(job, row.item, row.target) : 0), 0);
}

/* What a case's solves in the first `count` pool orders give: [{label, solved}], the database's order first. */
function solveInOrders(testCase, count = Infinity) {
  const gear = jobGear(makeJobContext(testCase.jobId));
  const orders = [
    ['database order', gear],
    ['reversed order', [...gear].reverse()],
    ...ORDER_SEEDS.map(seed => [`order ${seed}`, shuffled(gear, seed)]),
  ];
  return orders.slice(0, count).map(([label, pool]) => ({ label, solved: solveWith(testCase, pool) }));
}

test('the ranked totals of a tied Auto-fill are the same in every pool order', () => {
  for (const testCase of CASES) {
    const [first, ...others] = solveInOrders(testCase);
    const { job, sync, recipe, evaluated } = first.solved;
    for (const [key, points] of Object.entries(testCase.totals)) {
      assert.equal(evaluated.gear[key], points, `${testCase.name}: ${key} in the ${first.label}`);
    }
    const want = rankedOf(job, first.solved.set, sync, testCase.level, recipe);
    const wantDamage = weaponDamageOf(job, evaluated);
    for (const other of others) {
      assert.equal(rankedOf(job, other.solved.set, sync, testCase.level, recipe), want, `${testCase.name}: ${other.label}`);
      assert.equal(weaponDamageOf(job, other.solved.evaluated), wantDamage, `${testCase.name}: weapon damage, ${other.label}`);
      for (const key of Object.keys(testCase.totals)) {
        assert.equal(other.solved.evaluated.gear[key], testCase.totals[key], `${testCase.name}: ${key}, ${other.label}`);
      }
    }
  }
});

test('equal pieces on the ranked stats are chosen differently when the pool comes in another order', () => {
  for (const testCase of CASES) {
    const [database, reversed] = solveInOrders(testCase, 2).map(entry => entry.solved);
    const job = database.job;
    const rankedKeys = [database.recipe.target, database.recipe.tb, database.recipe.tb2].filter(Boolean);
    assert.notEqual(setKey(database.set), setKey(reversed.set), `${testCase.name}: the two orders no longer show different pieces`);

    for (const tie of testCase.ties) {
      const label = `${testCase.name}, ${tie.slot} (row ${tie.row})`;
      const first = database.evaluated.rows[tie.row];
      const second = reversed.evaluated.rows[tie.row];
      assert.equal(first.slot, tie.slot, `${label}: the row's slot`);
      assert.equal(first.item.gameId, tie.database, `${label}: the database order's piece`);
      assert.equal(second.item.gameId, tie.reversed, `${label}: the reversed order's piece`);

      // the two pieces tie: every ranked stat is equal
      for (const key of rankedKeys) {
        assert.equal(first.stats[key], second.stats[key], `${label}: ${key}`);
      }
      assert.equal(weaponDamage(job, first.item, first.target), weaponDamage(job, second.item, second.target), `${label}: weapon damage`);

      if (tie.share === 'everything') {
        assert.deepEqual(first.stats, second.stats, `${label}: all stats`);
        assert.equal(first.item.ilvl, second.item.ilvl, `${label}: item level`);
        assert.equal(equipLevel(first.item), equipLevel(second.item), `${label}: equip level`);
      } else {
        // a real tie, not one piece twice: some stat or the stones are not the same
        assert.notDeepEqual([first.stats, first.meldText], [second.stats, second.meldText], `${label}: the pieces are alike`);
      }
    }
  }
});
