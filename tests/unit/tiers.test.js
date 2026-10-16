/* Substat tiers (src/core/tiers.js). Expected values worked by hand from AkhMorning's formulas with ParamGrow's
   LevelModifier (2780 at level 100, 341 at level 50; checked below), not from the code under test:
   Critical Hit rate floor(200 g / div + 50) / 10 %, Direct Hit floor(550 g / div) / 10 %, Determination
   floor(140 g / div) per mille, Tenacity floor(112 g / div), Piety floor(150 g / div) MP per tick. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { speedParams } from '../../src/core/speed.js';
import { statTier } from '../../src/core/tiers.js';

const sge = makeJobContext('SGE');
const war = makeJobContext('WAR');
const blm = makeJobContext('BLM');

test('level modifiers from ParamGrow', () => {
  assert.equal(speedParams(100).div, 2780);
  assert.equal(speedParams(50).div, 341);
});

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
