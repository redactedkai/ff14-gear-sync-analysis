/* Base stats (src/core/base-stats.ts): the level's main stat base and ParamGrow BaseSpeed that a character starts from,
   checked against xivgear's and AkhMorning's level tables. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_MAIN, statBase } from '../../../src/core/base-stats.ts';
import type { StatKey } from '../../../src/core/types.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { levelParams } from '../../../src/core/level-params.ts';
import { PG } from '../../../src/core/tables.ts';
import { AKH_LEVEL } from '../helpers/common.ts';

const SGE = makeJobContext('SGE');
const WAR = makeJobContext('WAR');

test('LEVEL_MAIN: 100 levels, equal to xivgear at 50, 60, ..., 100, never falling', () => {
  assert.equal(LEVEL_MAIN.length, 100);
  // xivgear LEVEL_STATS baseMainStat (packages/xivmath/src/xivconstants.ts, commit 6c3c878)
  const xivgear: Record<number, number> = { 50: 202, 60: 218, 70: 292, 80: 340, 90: 390, 100: 440 };
  for (const [lv, v] of Object.entries(xivgear)) {
    assert.equal(LEVEL_MAIN[Number(lv) - 1], v, `level ${lv}`);
  }
  assert.ok(LEVEL_MAIN.every((v, i) => i === 0 || v >= (LEVEL_MAIN[i - 1] ?? 0)));
});

test('base: Determination and Piety from the main stat base, the other substats from ParamGrow BaseSpeed', () => {
  assert.equal(statBase(SGE, 'det', 50), 202);
  assert.equal(statBase(SGE, 'piety', 50), 202); // Piety
  assert.equal(statBase(WAR, 'ten', 50), PG[49][0]); // Tenacity
  for (const s of ['crit', 'dh', 'sps'] as const) {
    assert.equal(statBase(SGE, s, 100), 420);
  }
  assert.equal(statBase(SGE, 'crit', 100), PG[99][0]);
});

/* Character panel numbers against AkhMorning's Level Modifiers table (AKH_LEVEL, helpers/common.ts). */
/* The main stat and Vitality: MAIN x the job's modifier (ClassJob.csv: Sage Mind 115, Vitality 100; Warrior Strength
   105, Vitality 110; Black Mage Intelligence 115, Vitality 100), floored, as AkhMorning and xivgear count it, without
   the clan's bonus. */
test('panel base: AkhMorning level table (Determination and Piety from MAIN, the other substats from SUB, the main stat and Vitality from MAIN x the job modifier)', () => {
  const cases: [id: string, stats: StatKey[], mainMod: number, vitMod: number][] = [
    ['SGE', ['crit', 'det', 'dh', 'sps', 'piety'], 115, 100],
    ['WAR', ['crit', 'det', 'dh', 'sks', 'ten'], 105, 110],
    ['BLM', ['crit', 'det', 'dh', 'sps'], 115, 100],
  ];
  for (const [id, stats, mainMod, vitMod] of cases) {
    const job = makeJobContext(id);
    for (const [lv, [main, sub, div]] of Object.entries(AKH_LEVEL)) {
      assert.equal(levelParams(Number(lv)).div, div, `level ${lv} DIV`);
      for (const s of stats) {
        const fromMain = s === 'det' || s === 'piety';
        assert.equal(statBase(job, s, Number(lv)), fromMain ? main : sub, `${id} ${s} level ${lv}`);
      }
      assert.equal(statBase(job, job.mainKey, Number(lv)), Math.floor((main * mainMod) / 100), `${id} main stat level ${lv}`);
      assert.equal(statBase(job, 'vit', Number(lv)), Math.floor((main * vitMod) / 100), `${id} Vitality level ${lv}`);
    }
  }
});
