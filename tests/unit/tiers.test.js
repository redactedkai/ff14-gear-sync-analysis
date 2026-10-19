/* Substat tiers (src/core/tiers.js). Expected values worked by hand from AkhMorning's formulas with ParamGrow's
   LevelModifier (2780 at level 100, 341 at level 50; AKH_LEVEL in helpers/common.js), not from the code under test:
   Critical Hit rate floor(200 g / div + 50) / 10 %, Direct Hit floor(550 g / div) / 10 %, Determination
   floor(140 g / div) per mille, Tenacity floor(112 g / div), Piety floor(150 g / div) MP per tick. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { statTier, tierLadder, tierSizes } from '../../src/core/tiers.js';
import { AKH_LEVEL } from './helpers/common.js';

const sge = makeJobContext('SGE');
const war = makeJobContext('WAR');
const blm = makeJobContext('BLM');

test('effects at level 100 and 50', () => {
  // 200 x 2000 / 2780 = 143.9 -> 143 + 50 = 193 per mille
  assert.deepEqual(statTier(sge, 'crit', 2000, 100), { effect: '19.3%', start: 1988, next: 2002 });
  // 550 x 1000 / 2780 = 197.8 -> 19.7%
  assert.equal(statTier(sge, 'dh', 1000, 100).effect, '19.7%');
  // 140 x 1000 / 2780 = 50.4 -> +5.0%
  assert.equal(statTier(sge, 'det', 1000, 100).effect, '+5.0%');
  // Tenacity 112 x 500 / 2780 = 20.1 -> +2.0%; Piety 150 x 500 / 2780 = 26.9 -> +26 MP
  assert.equal(statTier(war, 'spec', 500, 100).effect, '+2.0%');
  assert.equal(statTier(sge, 'spec', 500, 100).effect, '+26 MP');
  // level 50 (item level 123 sync): 200 x 344 / 341 = 201.8 -> 25.1%
  assert.equal(statTier(sge, 'crit', 344, 50).effect, '25.1%');
  // speed: AkhMorning's level 100 tiers, 22 -> 2.49 s, next 107 (tests/unit/speed.test.js)
  assert.deepEqual(statTier(sge, 'spd', 86, 100), { effect: '2.49s', start: 22, next: 107 });
});

test('no tiers for main stat, Vitality, or a job without a special substat', () => {
  assert.equal(statTier(sge, 'main', 500, 100), null);
  assert.equal(statTier(sge, 'vit', 500, 100), null);
  assert.equal(statTier(blm, 'spec', 0, 100), null);
});

test('start and next bound the step exactly, at every level', () => {
  for (const level of [50, 60, 70, 80, 90, 100]) {
    for (const [job, stat] of [
      [sge, 'crit'],
      [sge, 'det'],
      [sge, 'dh'],
      [sge, 'spec'],
      [war, 'spec'],
      [sge, 'spd'],
    ]) {
      for (let g = 0; g < 2500; g += 13) {
        const t = statTier(job, stat, g, level);
        const effect = x => statTier(job, stat, x, level).effect;
        const label = `${job.jobId} ${stat} ${g} at ${level}`;
        assert.ok(t.start <= g && (t.next == null || g < t.next), label);
        assert.equal(effect(t.start), t.effect, label);
        if (t.start > 0) assert.notEqual(effect(t.start - 1), t.effect, label);
        // the GCD's last step is the game's 1.50 s floor: nothing comes after it
        if (t.next == null) {
          assert.equal(t.effect, '1.50s', label);
          continue;
        }
        assert.equal(effect(t.next - 1), t.effect, label);
        assert.notEqual(effect(t.next), t.effect, label);
      }
    }
  }
});

/* AkhMorning's formulas on full (panel) stats, with MAIN, SUB and DIV from their level table: Critical Hit rate
   floor(200 (CRT - SUB) / DIV + 50) / 10 %, Direct Hit floor(550 (DH - SUB) / DIV) / 10 %, Determination
   floor(140 (DET - MAIN) / DIV) / 10 %, Tenacity floor(112 (TEN - SUB) / DIV) / 10 %, Piety floor(150 (PIE - MAIN) / DIV)
   MP; the GCD as their speed table computes it. The effect from gear points must agree at every level in the table. */
test('effects equal AkhMorning formulas at every level in their table', () => {
  const pctOf = n => `${(n / 10).toFixed(1)}%`;
  const akh = {
    crit: (v, [, sub, div]) => pctOf(Math.floor((200 * (v - sub)) / div) + 50),
    dh: (v, [, sub, div]) => pctOf(Math.floor((550 * (v - sub)) / div)),
    det: (v, [main, , div]) => `+${pctOf(Math.floor((140 * (v - main)) / div))}`,
    ten: (v, [, sub, div]) => `+${pctOf(Math.floor((112 * (v - sub)) / div))}`,
    piety: (v, [main, , div]) => `+${Math.floor((150 * (v - main)) / div)} MP`,
    // AkhMorning's table has no floor: the game's 1.50 s (GCD_FLOOR_MS) is applied on top
    spd: (v, [, sub, div]) =>
      `${Math.max(1.5, Math.trunc((2500 * (Math.trunc((130 * (sub - v)) / div) + 1000)) / 10000) / 100).toFixed(2)}s`,
  };
  for (const job of [sge, war]) {
    for (const [lv, row] of Object.entries(AKH_LEVEL)) {
      for (const s of job.substats) {
        const key = s === 'spec' ? job.profile.spec : s;
        const base = key === 'det' || key === 'piety' ? row[0] : row[1]; // Determination and Piety start from MAIN
        for (const gear of [0, 1, 17, 123, 480, 1111, 2400]) {
          assert.equal(statTier(job, s, gear, +lv).effect, akh[key](base + gear, row), `${job.jobId} ${s} level ${lv}, gear ${gear}`);
        }
      }
    }
  }
});

/* ---- the tier ladder (How the math works, Tiers): tierLadder and tierSizes ---- */

const pld = makeJobContext('PLD');
const mnk = makeJobContext('MNK');
const startsOf = ladder => ladder.rows.map(r => r && r.start);

test('speed ladder: AkhMorning level 100 tiers on the panel scale (SUB 420)', () => {
  // AkhMorning: gear speed 22 -> 2.49 s, 107 -> 2.48 s, 193 -> 2.47 s; on the panel 442, 527, 613 (validation.md section 5)
  const l = tierLadder(sge, 'spd', 100, 624, 3);
  assert.deepEqual(l.kinds, ['gcd']);
  assert.equal(l.base, 420);
  assert.deepEqual(startsOf(l).slice(0, 4), [420, 442, 527, 613]);
  assert.deepEqual(
    l.rows.slice(0, 4).map(r => r.values[0]),
    ['2.50s', '2.49s', '2.48s', '2.47s'],
  );
  // 624 is in the 613 tier: 11 spare, the next one starts at 698 (gear 278: 2500 x (1000 - ceil(130 x 278 / 2780)) / 1000 = 2.46 s)
  assert.equal(l.spare, 11);
  assert.equal(l.toNext, 74);
  assert.deepEqual([l.rows[4].start, l.rows[4].values[0]], [698, '2.46s']);
});

test('ladder at and under the base: no empty rows, the base tier first and current', () => {
  // Direct Hit at level 100: floor(550 g / 2780) steps every 5.05 points, so 420, 426, 431, 436, 441, 446, 451 (g 0, 6,
  // 11, 16, 21, 26, 31); the rows the base lacks below run on above it (owner, 2026-10-19)
  const l = tierLadder(sge, 'dh', 100, 420, 3);
  assert.deepEqual(startsOf(l), [420, 426, 431, 436, 441, 446, 451]);
  assert.equal(l.cur, 0);
  assert.deepEqual([l.spare, l.toNext, l.under], [0, 6, false]);
  const under = tierLadder(sge, 'dh', 100, 100, 3);
  assert.equal(under.under, true);
  assert.deepEqual([under.rows[0].start, under.cur], [420, 0]);
  // two tiers up: the window still starts at the base, the value's tier third
  assert.equal(tierLadder(sge, 'dh', 100, 432, 3).cur, 2);
});

test('Critical Hit has two values per tier, rate and what a critical hit adds (rate + 35%)', () => {
  // 2000 gear points at level 100: floor(200 x 2000 / 2780) = 143 -> 19.3% rate, 40% + 14.3% = +54.3% on a critical hit
  const l = tierLadder(sge, 'crit', 100, 420 + 2000, 2);
  assert.deepEqual(l.kinds, ['rate', 'onCrit']);
  assert.deepEqual(l.rows[2].values, ['19.3%', '+54.3%']);
  assert.equal(l.rows[2].start, 420 + 1988); // statTier's start for the same tier (test above)
  assert.ok(l.rows.every(r => r.changed.every(Boolean))); // both step together
});

test('Tenacity: a tier ends where either effect steps, and says which one did', () => {
  // 1617 on the panel = 1197 gear at level 100. Dmg & heal floor(112 g / 2780): 48 (+4.8%), steps at 1192 and 1217;
  // Dmg taken floor(200 g / 2780): 86 (-8.6%), steps at 1196 and 1210. The tier is 1196 to 1209: 1616 to 1629.
  const l = tierLadder(pld, 'spec', 100, 1617, 1);
  assert.deepEqual(l.kinds, ['dmgHeal', 'dmgTaken']);
  assert.deepEqual(l.rows[1], { start: 1616, next: 1630, values: ['+4.8%', '−8.6%'], changed: [false, true] });
  assert.deepEqual([l.spare, l.toNext], [1, 13]);
  // the tier before starts at 1192 (1612): the damage step, damage taken unchanged
  assert.deepEqual([l.rows[0].start, l.rows[0].changed], [1612, [true, false]]);
});

test('the last GCD step has no next tier: the rows run on below it, the last one current', () => {
  const l = tierLadder(sge, 'spd', 100, 99999, 2);
  assert.equal(l.rows.length, 5);
  assert.equal(l.cur, 4);
  assert.equal(l.rows[4].values[0], '1.50s');
  assert.equal(l.toNext, null);
});

test('tier sizes: div / step points (AkhMorning: Critical Hit every 13.9 at level 100)', () => {
  // 2780/200 = 13.9, 2780/140 = 19.86, 2780/550 = 5.05, 2780/150 = 18.53, 2780/112 = 24.8; speed 4 x 2780/130 = 85.5
  assert.deepEqual(tierSizes(sge, 'crit', 100), [13, 14]);
  assert.deepEqual(tierSizes(sge, 'det', 100), [19, 20]);
  assert.deepEqual(tierSizes(sge, 'dh', 100), [5, 6]);
  assert.deepEqual(tierSizes(sge, 'spec', 100), [18, 19]);
  assert.deepEqual(tierSizes(pld, 'spec', 100, 0, 'dmgHeal'), [24, 25]);
  assert.deepEqual(tierSizes(pld, 'spec', 100, 0, 'dmgTaken'), [13, 14]);
  assert.deepEqual(tierSizes(sge, 'spd', 100), [85, 86]);
  // level 50 (DIV 341): AkhMorning's 3 -> 2.49 s, 14 -> 2.48 s: 11 points; 4 x 341/130 = 10.5
  assert.deepEqual(tierSizes(sge, 'spd', 50), [10, 11]);
  assert.equal(tierSizes(blm, 'spec', 100), null);
});

test("Monk's haste skips some 0.01 s GCD steps, so a few speed tiers are longer", () => {
  // 20% haste is applied after the speed step is rounded down: some recasts map to the same hundredth, others skip one
  const sizes = tierSizes(mnk, 'spd', 100, 20);
  assert.ok(sizes.includes(85) && sizes.some(s => s > 100), JSON.stringify(sizes));
  const l = tierLadder(mnk, 'spd', 100, 875, 3, 20);
  const gcds = l.rows.map(r => Number(r.values[0].slice(0, -1)));
  for (let i = 1; i < gcds.length; i++) assert.ok([1, 2].includes(Math.round((gcds[i - 1] - gcds[i]) * 100)), JSON.stringify(gcds));
});

test('no ladder for main stat, Vitality or a missing special substat', () => {
  assert.equal(tierLadder(sge, 'main', 100, 500, 3), null);
  assert.equal(tierLadder(blm, 'spec', 100, 500, 3), null);
});
