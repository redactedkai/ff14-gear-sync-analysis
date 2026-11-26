/* The item stat model on the shields and one-handed weapons of White Mage and Black Mage (A Realm Reborn wands, scepters
   and bucklers, equip level 1 to 50): the formula's prediction of each piece's stats against the real rows, which
   are the expected values (docs/mechanics/math.md section 3: off-hand = two-handed value - one-handed value). What the
   game data does not hold is the synced stat of a shield; the caps follow the same rule and are not checked here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROW } from '../../../src/core/constants.ts';
import { predictRaw } from '../../../src/core/formulas.ts';
import { rowStats } from '../../../src/core/items.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { ITEMS } from '../../../src/core/tables.ts';
import { rowItem } from '../helpers/model-validation.js';

const SLOT_1H = 1,
  SLOT_SHIELD = 2;
/* Round Shield (item level 10, id 2228): its row holds Direct Hit 1 where the formula gives 0 (the fixed Direct Hit line
   at 20% rounds to 0 at this tiny budget); the same row is worn by Paladin and Beastmaster, so it is off by one for them too. */
const KNOWN_OFF_BY_ONE = new Set(['Round Shield']);

for (const [id, wantShields, want1H] of [
  ['WHM', 28, 28],
  ['BLM', 27, 42],
]) {
  test(`${id}: the formula reproduces the shields and one-handed weapons in the data`, () => {
    const bit = 1 << makeJobContext(id).jobIndex;
    for (const [code, wantCount] of [
      [SLOT_SHIELD, wantShields],
      [SLOT_1H, want1H],
    ]) {
      const rows = ITEMS.filter(r => r[ROW.jobMask] & bit && r[ROW.slotCode] === code);
      assert.equal(rows.length, wantCount, `${id} rows of slot code ${code}`);
      for (const r of rows) {
        const stats = rowStats(r);
        const predicted = predictRaw(r[ROW.ilvl], code, stats, r[ROW.kind], rowItem(r));
        if (KNOWN_OFF_BY_ONE.has(r[ROW.name])) {
          assert.ok(
            predicted.every((v, i) => Math.abs(v - stats[i]) <= 1),
            r[ROW.name],
          );
        } else {
          assert.deepEqual(predicted, stats, `${r[ROW.name]} (item level ${r[ROW.ilvl]})`);
        }
      }
    }
  });
}

test('named pieces: Tidal Wave Buckler (item level 100) and Ancient Buckler (item level 90) are the 2H value minus the 1H value', () => {
  for (const id of [7823, 2309]) {
    const r = ITEMS.find(row => row[ROW.gameId] === id);
    assert.equal(r[ROW.slotCode], SLOT_SHIELD);
    const stats = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], SLOT_SHIELD, stats, r[ROW.kind], rowItem(r)), stats, r[ROW.name]);
  }
});
