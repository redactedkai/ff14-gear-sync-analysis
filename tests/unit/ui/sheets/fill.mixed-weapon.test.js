/* Auto-fill for a job that wields a 2H weapon or a 1H weapon with a shield (White Mage, Black Mage): the solve may pick a
   wand and a shield, and the set's Off-hand row must keep that shield (src/ui/sheets/fill.ts applyFill reaches rows
   through usedRows, which follows the job's activeSlotTypes). Before A18 the page dropped that shield. The solve at a
   sync cap of 13 (item level) picks a wand and shield for goal Mind; the expected shield is read from the solve, the
   claim tested is that the page keeps what the search chose. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemById } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { runRecipe } from '../../../../src/core/recipe.ts';
import { makeSession } from '../../../../src/core/session.ts';
import { applyFill, fillPlan } from '../../../../src/ui/sheets/fill.ts';
import { appState } from '../../helpers/common.js';

const SLOT_OF_ROW = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'];
const emptySet = () => ({ pieces: SLOT_OF_ROW.map(slot => ({ slot })), meal: null, pinned: { pieces: [], meal: false } });

for (const level of [100, 50]) {
  test(`White Mage level ${level}, sync cap 13, goal Mind: the shield the solve picks stays on the Off-hand row`, () => {
    const job = makeJobContext('WHM');
    const recipe = { ...appState({ job: 'WHM' }).recipe, target: 'mind', tb: 'crit', melds: true, food: false };
    const run = runRecipe(job, { cap: 13, sync: true, level }, level, recipe, makeSession());
    assert.equal(run.status, 'ok');
    const shield = run.set.pieces.find(p => p.slot === 'offhand' && p.gameId != null);
    assert.ok(shield, 'the search itself picks a shield here (a one-handed wand and a shield beat a two-handed weapon at item level 13)');
    const filled = applyFill(job, emptySet(), run.set);
    assert.equal(filled.pieces[1].gameId, shield.gameId, 'the Off-hand row holds the picked shield');
    assert.equal(fillPlan(job, emptySet()).count, 13, 'twelve rows (the Off-hand row counts) and the meal');
  });
}

test('Sage: a set holding a shield keeps it hidden (a job without shields has no Off-hand row)', () => {
  const job = makeJobContext('SGE');
  const set = emptySet();
  set.pieces[1] = { slot: 'offhand', gameId: 7823, stones: [] };
  assert.ok(itemById(7823), 'Tidal Wave Buckler (7823) is in the data');
  assert.equal(fillPlan(job, set).count, 12, 'eleven rows and the meal; the shield row is not one of them');
});

/* A 2H weapon and a shield never end up together through an Auto-fill Apply: with the cane pinned, the held shield is an open
   row and the result leaves it empty; with the cane and the shield both pinned the solve reports a conflict and stops. */
const CANE = 9006; // Dreadwyrm Cane, two-handed
const BUCKLER = 7823; // Tidal Wave Buckler

test('White Mage: a pinned 2H cane and a held shield that is not pinned: Apply leaves the Off-hand row empty', () => {
  const job = makeJobContext('WHM');
  const held = emptySet();
  held.pieces[0] = { slot: 'weapon', gameId: CANE, stones: [] };
  held.pieces[1] = { slot: 'offhand', gameId: BUCKLER, stones: [] };
  held.pinned = { pieces: [0], meal: false };
  const plan = fillPlan(job, held);
  const recipe = { ...appState({ job: 'WHM' }).recipe, target: 'mind', tb: 'crit', melds: true, food: false };
  const run = runRecipe(job, { cap: 795, sync: false }, 100, recipe, makeSession(), {}, plan.pins);
  assert.equal(run.status, 'ok');
  const filled = applyFill(job, held, run.set);
  assert.equal(filled.pieces[0].gameId, CANE, 'the pinned cane stays');
  assert.deepEqual(filled.pieces[1], { slot: 'offhand' }, 'the shield is gone');
});

test('White Mage: a pinned cane and a pinned shield are a conflict, so no result is applied', () => {
  const job = makeJobContext('WHM');
  const held = emptySet();
  held.pieces[0] = { slot: 'weapon', gameId: CANE, stones: [] };
  held.pieces[1] = { slot: 'offhand', gameId: BUCKLER, stones: [] };
  held.pinned = { pieces: [0, 1], meal: false };
  const recipe = { ...appState({ job: 'WHM' }).recipe, target: 'mind', tb: 'crit', melds: true, food: false };
  const run = runRecipe(job, { cap: 795, sync: false }, 100, recipe, makeSession(), {}, fillPlan(job, held).pins);
  assert.notEqual(run.status, 'ok');
});
