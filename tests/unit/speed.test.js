import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotMult, gcdFor, gcdTiers } from '../../src/core/speed.js';

/* Expected values in this file are read from AkhMorning's published tier tables:
   https://www.akhmorning.com/allagan-studies/stats/speed/ ("Table View: 2.5s Tiers", "Show data for level" 50 / 90 /
   100; read 2026-10-11). The table lists total speed and its delta from the level's base (SUB); the delta is gear
   speed here. Each pair below is the first gear speed of a tier and its GCD (2.5 s base) and DoT scalar. The page
   text also says "2.49 happens at the 1st [tier], then 2.48s at the 5th, 2.47s at the 9th" at level 100, every
   2780/130 = 21.38 points. The table is AkhMorning's formula with their level modifiers, so it confirms this code's
   formula and ParamGrow inputs against a published source, not against in-game measurement. */

// [gear speed, GCD, DoT scalar] at each tier start; the value one below must still be on the previous tier.
const AKH = {
  50: [
    [3, 2.49, 1.001],
    [14, 2.48, 1.005],
    [150, 2.35, 1.057],
    [202, 2.3, 1.077],
    [286, 2.22, 1.109],
    [297, 2.21, 1.113],
    [307, 2.2, 1.117],
    [349, 2.16, 1.133],
  ],
  90: [
    [15, 2.49, 1.001],
    [74, 2.48, 1.005],
    [834, 2.35, 1.057],
    [1594, 2.22, 1.109],
  ],
  100: [
    [22, 2.49, 1.001],
    [107, 2.48, 1.005],
    [193, 2.47, 1.009],
    [1219, 2.35, 1.057],
    [1818, 2.28, 1.085],
    [1904, 2.27, 1.089],
    [2845, 2.16, 1.133],
  ],
};

for (const [level, rows] of Object.entries(AKH)) {
  test(`AkhMorning level ${level} GCD tiers (2.5 s base) and DoT scalars`, () => {
    for (const [spd, gcd, mult] of rows) {
      assert.equal(gcdFor(spd, +level), gcd, `gcd at ${spd}`);
      assert.ok(gcdFor(spd - 1, +level) > gcd, `${spd - 1} is still on the previous tier`);
      assert.equal(dotMult(spd, +level), mult, `DoT scalar at ${spd}`);
    }
  });
}

test('zero gear speed is the 2.50 s base at every level', () => {
  for (const level of [50, 90, 100]) assert.equal(gcdFor(0, level), 2.5);
});

test('gcdTiers at level 50 lists the AkhMorning tier starts', () => {
  const tiers = new Map(gcdTiers(50, 2500).map(x => [x.spd, x.gcd]));
  for (const [spd, gcd] of AKH[50]) assert.equal(tiers.get(spd), gcd, `tier at ${spd}`);
});

test("expansion boundaries are the game's own sync item level at each level cap (ParamGrow)", async () => {
  const { expansionBounds } = await import('../../src/core/speed.js');
  assert.deepEqual(
    expansionBounds().map(e => [e.short, e.from, e.to]),
    [
      ['ARR', null, 130],
      ['HW', 130, 270],
      ['SB', 270, 400],
      ['ShB', 400, 530],
      ['EW', 530, 660],
      ['DT', 660, null],
    ],
  );
});

/* AkhMorning's level 100 speed table, as the page's script computes it (https://www.akhmorning.com/allagan-studies/
   stats/speed/, read 2026-10-16): for full speed S from 420 to 420 + 3,365, speedMod = trunc(130 (420 - S) / 2780) +
   1000 and GCD = trunc(recast x speedMod / 10000) / 100, for recasts 1.5 to 4.0 s. Our GCD takes gear speed S - 420. */
test('GCD equals AkhMorning speed table at level 100, every speed and recast', () => {
  for (const ms of [1500, 2000, 2500, 2800, 3000, 3500, 4000]) {
    for (let S = 420; S <= 420 + 3365; S++) {
      const mod = Math.trunc((130 * (420 - S)) / 2780) + 1000;
      assert.equal(gcdFor(S - 420, 100, ms), Math.trunc((ms * mod) / 10000) / 100, `speed ${S}, recast ${ms}`);
    }
  }
});
