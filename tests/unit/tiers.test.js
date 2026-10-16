/* Substat tiers (src/core/tiers.js). Expected values worked by hand from AkhMorning's formulas with ParamGrow's
   LevelModifier (2780 at level 100, 341 at level 50; AKH_LEVEL in helpers/common.js), not from the code under test:
   Critical Hit rate floor(200 g / div + 50) / 10 %, Direct Hit floor(550 g / div) / 10 %, Determination
   floor(140 g / div) per mille, Tenacity floor(112 g / div), Piety floor(150 g / div) MP per tick. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { gcdFor } from '../../src/core/speed.js';
import { statTier } from '../../src/core/tiers.js';
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
        assert.ok(t.start <= g && g < t.next, label);
        assert.equal(effect(t.start), t.effect, label);
        if (t.start > 0) assert.notEqual(effect(t.start - 1), t.effect, label);
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
    spd: (v, [, sub, div]) => `${(Math.trunc((2500 * (Math.trunc((130 * (sub - v)) / div) + 1000)) / 10000) / 100).toFixed(2)}s`,
  };
  for (const job of [sge, war]) {
    for (const [lv, row] of Object.entries(AKH_LEVEL)) {
      for (const s of job.substats) {
        const key = s === 'spec' ? job.profile.spec : s;
        const base = key === 'det' || key === 'piety' ? row[0] : row[1]; // Determination and Piety start from MAIN
        for (const gear of [0, 1, 17, 123, 480, 1111, 2400]) {
          // at low levels this much speed would take the GCD below zero, where only the rounding of negatives differs
          if (key === 'spd' && gcdFor(gear, +lv) <= 0) continue;
          assert.equal(statTier(job, s, gear, +lv).effect, akh[key](base + gear, row), `${job.jobId} ${s} level ${lv}, gear ${gear}`);
        }
      }
    }
  }
});
