/* Overmeld odds (src/core/meld.ts overmeldChance, usesNqOvermeldRates, overmeldNumber). Expected values: the HQ table of
   the Console Games Wiki, Advanced Materia Melding (grades I to IV, then V and up: 90/48/28/16, 82/44/26/16, 70/38/22/14,
   58/32/20/12, 17/10/7/5; VI, VIII, X and XII only in the first overmeld slot) and the MateriaGrade sheet for the NQ rates
   (80/40/20/10 for grade I, 12/6/3/2 for V and up). The Wiki's footnote gives 3% for the last NQ slot of V+, the sheet 2%;
   the sheet is the source. Items are real: "Courtly Lover's Earrings of Healing" (item level 770, 1 slot + overmeld, can be
   HQ) and "Axe of the Fury" (item level 205, 2 slots + overmeld, cannot be HQ). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { MATERIA } from '../../../src/core/tables.ts';
import { overmeldChance, overmeldNumber, usesNqOvermeldRates } from '../../../src/core/meld.ts';
import { piece } from '../helpers/fixtures/common.ts';

const earrings = piece(makeJobContext('SGE'), "Courtly Lover's Earrings of Healing");
const axe = piece(makeJobContext('WAR'), 'Axe of the Fury');

test('the HQ rates are the Wiki table, 4 overmeld slots per grade', () => {
  assert.equal(usesNqOvermeldRates(earrings), false);
  const wiki = {
    1: [90, 48, 28, 16],
    2: [82, 44, 26, 16],
    3: [70, 38, 22, 14],
    4: [58, 32, 20, 12],
    5: [17, 10, 7, 5],
    7: [17, 10, 7, 5],
    12: [17, 0, 0, 0],
  };
  for (const [grade, rates] of Object.entries(wiki)) {
    assert.deepEqual(
      [1, 2, 3, 4].map(n => overmeldChance(earrings, Number(grade), n)),
      rates,
      `grade ${grade}`,
    );
  }
});

test('a piece that cannot be HQ uses the NQ rates', () => {
  assert.equal(usesNqOvermeldRates(axe), true);
  assert.deepEqual(
    [1, 2, 3, 4].map(n => overmeldChance(axe, 1, n)),
    [80, 40, 20, 10],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map(n => overmeldChance(axe, 11, n)),
    [12, 6, 3, 2],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map(n => overmeldChance(axe, 8, n)),
    [12, 0, 0, 0],
  );
});

test('the high grades have no chance past the first overmeld slot, and the table agrees with MATERIA.high', () => {
  for (const grade of MATERIA.high) {
    for (const item of [earrings, axe]) {
      assert.deepEqual(
        [2, 3, 4].map(n => overmeldChance(item, grade, n)),
        [0, 0, 0],
        `grade ${grade}`,
      );
    }
  }
  assert.equal(overmeldChance(earrings, 0, 1), null);
  assert.equal(overmeldChance(earrings, 13, 1), null);
  assert.equal(overmeldChance(earrings, 1, 5), null);
});

test('overmeld slot numbers follow the guaranteed slots', () => {
  // earrings: 1 guaranteed slot (0), overmeld slots 1 to 4 are slots 1 to 4
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(s => overmeldNumber(earrings, s)),
    [0, 1, 2, 3, 4],
  );
  // axe: 2 guaranteed slots, overmeld slots 1 to 3 are slots 2 to 4
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map(s => overmeldNumber(axe, s)),
    [0, 0, 1, 2, 3, 0],
  );
});
