/* Which jobs have shields, and which weapon mode follows (src/core/constants.js ONE_HANDED_JOBS, MIXED_WEAPON_JOBS;
   makeJobContext's weaponMode, activeSlotTypes). The expected sets are derived from the item database (job mask and slot
   code: 0 two-handed weapon, 1 one-handed weapon, 2 shield), so a data update that gives another job a shield fails here
   instead of hiding its shield. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, MIXED_WEAPON_JOBS, ONE_HANDED_JOBS, ROW } from '../../../src/core/constants.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { ITEMS } from '../../../src/core/tables.js';

const SLOT_2H = 0,
  SLOT_1H = 1,
  SLOT_SHIELD = 2;

/* Per job id, how many rows of each weapon slot code its job mask holds: {twoHanded, oneHanded, shield}. */
function weaponCounts() {
  return Object.fromEntries(
    JOBS.map(({ id }, bit) => {
      const own = ITEMS.filter(r => r[ROW.jobMask] & (1 << bit));
      const count = code => own.filter(r => r[ROW.slotCode] === code).length;
      return [id, { twoHanded: count(SLOT_2H), oneHanded: count(SLOT_1H), shield: count(SLOT_SHIELD) }];
    }),
  );
}

test('the shield jobs in the lists are exactly the jobs the item database gives shields', () => {
  const counts = weaponCounts();
  const oneHanded = JOBS.filter(({ id }) => counts[id].shield > 0 && counts[id].twoHanded === 0).map(j => j.id);
  const mixed = JOBS.filter(({ id }) => counts[id].shield > 0 && counts[id].twoHanded > 0).map(j => j.id);
  assert.deepEqual([...ONE_HANDED_JOBS].sort(), oneHanded.sort(), 'jobs with shields and no two-handed weapon');
  assert.deepEqual([...MIXED_WEAPON_JOBS].sort(), mixed.sort(), 'jobs with shields and two-handed weapons');
  // today: Paladin and Beastmaster one-handed only; White Mage and Black Mage mixed (real data, patch 7.5x)
  assert.deepEqual(oneHanded.sort(), ['BST', 'PLD']);
  assert.deepEqual(mixed.sort(), ['BLM', 'WHM']);
});

test('every job: weaponMode, the Off-hand row and the hand-made weapon share follow the data', () => {
  const counts = weaponCounts();
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const { twoHanded, oneHanded, shield } = counts[id];
    let mode = 'mixed';
    if (shield === 0) {
      mode = '2h';
    } else if (twoHanded === 0) {
      mode = '1h+oh';
    }
    assert.equal(job.weaponMode, mode, id);
    assert.equal(job.activeSlotTypes.includes('offhand'), shield > 0, `${id} Off-hand row`);
    // a job with shields also has one-handed weapons to hold beside them; a job without has no one-handed weapons
    assert.equal(oneHanded > 0, shield > 0, `${id} one-handed weapons`);
    // a hand-made weapon is two-handed (140) without a shield, one-handed (100) with one
    assert.equal(job.slotPct.weapon, shield > 0 ? 100 : 140, `${id} weapon share`);
  }
});

test('White Mage and Black Mage hold a real wand and shield at every level; Sage and Scholar hold none', () => {
  const sets = { WHM: [7818, 7823], BLM: [8378, 2309] }; // Tidal Wave Wand and Buckler; Tremor Cudgel and Ancient Buckler
  for (const [id, [wand, shield]] of Object.entries(sets)) {
    const bit = 1 << makeJobContext(id).jobIndex;
    const wandRow = ITEMS.find(r => r[ROW.gameId] === wand);
    const shieldRow = ITEMS.find(r => r[ROW.gameId] === shield);
    assert.equal(wandRow[ROW.slotCode], SLOT_1H, `${id} wand`);
    assert.equal(shieldRow[ROW.slotCode], SLOT_SHIELD, `${id} shield`);
    assert.ok(wandRow[ROW.jobMask] & bit && shieldRow[ROW.jobMask] & bit, `${id} can wear both`);
  }
  for (const id of ['SGE', 'SCH', 'SMN', 'BLU']) {
    assert.equal(makeJobContext(id).activeSlotTypes.includes('offhand'), false, id);
  }
});
