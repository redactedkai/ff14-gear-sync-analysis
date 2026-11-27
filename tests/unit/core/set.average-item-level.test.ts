/* The set's average item level (src/core/set.ts averageItemLevel): the sum of the slots' own item levels over 12 slots, a
   two-handed weapon counted twice, an empty slot 0, Blue Mage's weapon left out (xivgear's avgIlvl). Expected values are
   hand sums of real items' item levels (the ids and levels are in the comments), not the function's output. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../src/core/constants.ts';
import type { SetPiece, SlotType, Sync } from '../../../src/core/types.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { averageItemLevel, evaluateSet, makeSet } from '../../../src/core/set.ts';
import { SAGE_IDS } from '../helpers/sheet-fixtures.ts';

const NO_SYNC: Sync = { cap: 795, sync: false, level: 100 };
const SLOTS: SlotType[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'];

/* averageItemLevel for `jobId` at level 100 wearing `ids` (a slot's name: its game id; the second ring is 'ring2'). */
function averageOf(jobId: string, ids: Readonly<Record<string, number | undefined>>) {
  const job = makeJobContext(jobId);
  let rings = 0;
  const pieces = SLOTS.map((slot): SetPiece => {
    const key = slot === 'ring' && rings++ ? 'ring2' : slot;
    const gameId = ids[key];
    return gameId != null ? { slot, gameId } : { slot };
  });
  return averageItemLevel(job, evaluateSet(job, makeSet(pieces), NO_SYNC, 100).rows);
}

/* averageOf for a set that has an average: the result, never null. */
function wornAverage(jobId: string, ids: Readonly<Record<string, number | undefined>>) {
  const result = averageOf(jobId, ids);
  assert.ok(result, `${jobId} has an average`);
  return result;
}

/* Sage armor (all item level 115, crafted): head, body, hands, legs, feet, earrings, necklace, bracelet, two rings. */
const ARMOR = { ...SAGE_IDS, ring2: SAGE_IDS.ring };

test('Sage: ten pieces of item level 115 and no weapon give 1150 / 12', () => {
  const result = wornAverage('SGE', ARMOR);
  assert.equal(result.slots, 12);
  assert.equal(result.worn, 10);
  assert.ok(Math.abs(result.value - 1150 / 12) < 1e-9); // 95.83
});

test('Warrior: a 120 axe counted twice, nine 120 pieces and one 100 body (Lionsmane Cuirass, 7361) give 1420 / 12', () => {
  const war = {
    weapon: 8641,
    head: 9901,
    body: 7361,
    hands: 9903,
    legs: 9904,
    feet: 9905,
    ear: 8589,
    neck: 8590,
    wrist: 8588,
    ring: 8591,
    ring2: 8591,
  };
  // 2 x 120 for the axe, 9 x 120 and 100 for the body
  assert.ok(Math.abs(wornAverage('WAR', war).value - 1420 / 12) < 1e-9); // 118.33
  assert.equal(wornAverage('WAR', war).slots, 12);
});

test('Paladin: a one-handed sword (8639, 120) and a shield (Holy Shield Animus 7843, 100) count once each', () => {
  const pld = {
    weapon: 8639,
    offhand: 7843,
    head: 9901,
    body: 7361,
    hands: 9903,
    legs: 9904,
    feet: 9905,
    ear: 8589,
    neck: 8590,
    wrist: 8588,
    ring: 8591,
    ring2: 8591,
  };
  // 120 + 100 + (9 x 120 + 100)
  assert.ok(Math.abs(wornAverage('PLD', pld).value - 1400 / 12) < 1e-9); // 116.67
  // no shield: the off-hand counts 0 (xivgear), the sword once
  const { offhand: _shield, ...bare } = pld;
  assert.ok(Math.abs(wornAverage('PLD', bare).value - 1300 / 12) < 1e-9); // 108.33
});

test('White Mage: a two-handed cane (8645, 120) counts twice; a one-handed wand (7818, 100) once, with or without a shield (2228, 10)', () => {
  assert.ok(Math.abs(wornAverage('WHM', { ...ARMOR, weapon: 8645 }).value - 1390 / 12) < 1e-9); // 1150 + 2 x 120
  assert.ok(Math.abs(wornAverage('WHM', { ...ARMOR, weapon: 7818, offhand: 2228 }).value - 1260 / 12) < 1e-9); // 1150 + 100 + 10
  assert.ok(Math.abs(wornAverage('WHM', { ...ARMOR, weapon: 7818 }).value - 1250 / 12) < 1e-9);
});

test('an empty set has no average', () => {
  assert.equal(averageOf('SGE', {}), null);
  assert.equal(averageOf('PLD', {}), null);
});

test('Blue Mage: no weapon, 10 slots; nine pieces of item level 530 give 4770 / 10', () => {
  // Edenmorn head 32330, body 32331, hands 32332, legs 32333, feet 32334, earrings 32340, necklace 32345, bracelet 32350, one ring 32355
  const blu = { head: 32330, body: 32331, hands: 32332, legs: 32333, feet: 32334, ear: 32340, neck: 32345, wrist: 32350, ring: 32355 };
  const result = wornAverage('BLU', blu);
  assert.equal(result.slots, 10);
  assert.equal(result.value, 477);
});

test('all 23 jobs: an empty set has no average and nothing throws', () => {
  for (const id of Object.keys(JOBS)) {
    const job = makeJobContext(id);
    const result = averageItemLevel(job, evaluateSet(job, makeSet(SLOTS.map(slot => ({ slot }))), NO_SYNC, job.maxLevel).rows);
    assert.equal(result, null, id);
  }
});
