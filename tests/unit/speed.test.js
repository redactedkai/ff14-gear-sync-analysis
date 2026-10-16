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

/* Haste (Target GCD). Expected no-speed GCDs from the tiers in xivgear's curated BiS set names (static-bis-sets 337c9c0,
   the ultimate sheets; target-gcd research): NIN and VPR 2.12 (15%), SAM 2.17 (Fuka 13%), MNK 2.00 (20%) at levels
   90 and 100, MNK 2.12 at level 70 (15%, UCoB/UWU sets 2.09-2.12). Levels from the official job guides (HASTE in
   constants.js). */
test('hasted GCD with no gear speed matches the published tiers', async () => {
  const { hasteFor } = await import('../../src/core/speed.js');
  const noSpeed = (job, level) => gcdFor(0, level, 2500, hasteFor(job, level)?.pct ?? 0);
  for (const level of [90, 100]) {
    assert.equal(noSpeed('NIN', level), 2.12);
    assert.equal(noSpeed('VPR', level), 2.12);
    assert.equal(noSpeed('SAM', level), 2.17);
    assert.equal(noSpeed('MNK', level), 2.0);
    assert.equal(noSpeed('SGE', level), 2.5);
  }
  assert.equal(noSpeed('MNK', 70), 2.12);
});

test('haste starts at the levels in the official job guides', async () => {
  const { hasteFor } = await import('../../src/core/speed.js');
  const pct = (job, level) => hasteFor(job, level)?.pct ?? 0;
  assert.deepEqual(
    [44, 45].map(l => pct('NIN', l)),
    [0, 15],
  );
  assert.deepEqual(
    [19, 20].map(l => pct('VPR', l)),
    [0, 15],
  );
  assert.deepEqual(
    [17, 18, 77, 78].map(l => pct('SAM', l)),
    [0, 10, 10, 13],
  );
  assert.deepEqual(
    [1, 19, 20, 39, 40, 75, 76].map(l => pct('MNK', l)),
    [5, 5, 10, 10, 15, 15, 20],
  );
  assert.equal(hasteFor('SGE', 100), null);
  assert.equal(hasteFor('WHM', 100), null); // Presence of Mind is a short buff: not counted (owner's decision)
  assert.equal(hasteFor('SAM', 100).name, 'Fuka');
});

test('with no haste the hasted formula is the plain one at every speed', () => {
  for (const level of [50, 70, 90, 100]) {
    for (let s = 0; s <= 3000; s++) assert.equal(gcdFor(s, level, 2500, 0), gcdFor(s, level), `${s} at ${level}`);
  }
});

test('the GCD falls 0.01 s at a time, with or without haste, so no value in between is skipped', () => {
  for (const level of [50, 90, 100]) {
    for (const haste of [0, 5, 10, 13, 15, 20]) {
      let last = gcdFor(0, level, 2500, haste);
      for (let s = 1; s <= 6000; s++) {
        const g = gcdFor(s, level, 2500, haste);
        assert.ok(Math.round((last - g) * 100) <= 1, `level ${level} haste ${haste} at ${s}: ${last} -> ${g}`);
        last = g;
      }
    }
  }
});

/* speedForGcd against the AkhMorning tier starts above (level 100: 2.49 from 22, 2.48 from 107). */
test('speed for a target GCD: the band ends give the GCD, one point outside does not', async () => {
  const { speedForGcd } = await import('../../src/core/speed.js');
  assert.deepEqual(speedForGcd(2.49, 100, 'exact'), { min: 22, max: 106 });
  assert.deepEqual(speedForGcd(2.49, 100, 'min'), { min: 22, max: null });
  assert.deepEqual(speedForGcd(2.5, 100, 'exact'), { min: 0, max: 21 });
  assert.deepEqual(speedForGcd(2.5, 100, 'min'), { min: 0, max: null });
  for (const level of [50, 90, 100]) {
    for (const haste of [0, 13, 15, 20]) {
      const top = gcdFor(0, level, 2500, haste);
      for (const gcd of [top, top - 0.01, top - 0.05, top - 0.13, top - 0.3]) {
        const g = Math.round(gcd * 100) / 100;
        const b = speedForGcd(g, level, 'exact', haste);
        const at = s => gcdFor(s, level, 2500, haste);
        assert.ok(b, `${g} at ${level} haste ${haste}`);
        assert.equal(at(b.min), g);
        assert.equal(at(b.max), g);
        if (b.min > 0) assert.ok(at(b.min - 1) > g);
        assert.ok(at(b.max + 1) < g);
        assert.equal(speedForGcd(g, level, 'min', haste).min, b.min);
      }
    }
  }
});

test('speed for a target GCD: slower than the no-speed GCD', async () => {
  const { speedForGcd } = await import('../../src/core/speed.js');
  // a Ninja's GCD with 15% haste is 2.12 at most: exactly 2.40 cannot be had, 2.40 or faster always is
  assert.equal(speedForGcd(2.4, 100, 'exact', 15), null);
  assert.deepEqual(speedForGcd(2.4, 100, 'min', 15), { min: 0, max: null });
});
