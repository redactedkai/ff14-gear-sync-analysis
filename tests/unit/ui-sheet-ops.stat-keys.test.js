/* Copy sheet to another job (src/ui/sheet-ops.js copySheet): the goal and the stones move to the new job by position (the
   main stat to the main stat, speed to speed, the special substat to the special substat); a stat the new job lacks is
   kept as it is, and the set's Fill settings put it back to the default (fillSettingsOf). Stat keys are the game's own. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySheet } from '../../src/ui/sheet-ops.js';
import { fillSettingsOf } from '../../src/ui/views/fill-settings.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const AT = 1762800000000;

/* A saved Sage set with goal Mind > Spell Speed > Piety and Spell Speed and Determination stones on a ring. */
function sageGoalSheet() {
  const set = sageSet({ fillSettings: { goal: { target: 'mind', tb: 'sps', tb2: 'piety', gcd: '', gcdMode: 'exact' } } });
  set.pieces = set.pieces.map(row =>
    row.slot === 'ring'
      ? {
          ...row,
          stones: [
            { stat: 'sps', grade: 12 },
            { stat: 'det', grade: 12 },
          ],
        }
      : row,
  );
  return sheetOf('SGE', [set]);
}
const copyFor = (sheet, job) => copySheet(sheet, { name: 'Copy', job, level: 100, sync: sheet.sync }, 's_2', AT, () => 'g_c1');
const goalOf = set => [set.fillSettings.goal.target, set.fillSettings.goal.tb, set.fillSettings.goal.tb2];
const ringStones = set => set.pieces.find(row => row.slot === 'ring').stones;

test('Copy sheet healer to tank: Mind, Spell Speed and Piety become Strength, Skill Speed and Tenacity', () => {
  const sheet = sageGoalSheet();
  const set = copyFor(sheet, 'WAR').sets[0];
  assert.deepEqual(goalOf(set), ['str', 'sks', 'ten']);
  assert.deepEqual(ringStones(set), [
    { stat: 'sks', grade: 12 },
    { stat: 'det', grade: 12 },
  ]);
  assert.deepEqual(goalOf(sheet.sets[0]), ['mind', 'sps', 'piety'], 'the original is not changed');
});

test('Copy sheet healer to Dexterity and caster jobs: the main stat and speed follow; Piety, which they lack, stays for the settings to drop', () => {
  for (const [job, main, speed] of [
    ['NIN', 'dex', 'sks'],
    ['BLM', 'int', 'sps'],
    ['SAM', 'str', 'sks'],
  ]) {
    const set = copyFor(sageGoalSheet(), job).sets[0];
    assert.deepEqual(goalOf(set), [main, speed, 'piety'], job);
    assert.equal(ringStones(set)[0].stat, speed, job);
    // the Fill settings of the copy: the stat the job lacks is put back to the default, never a stat of the old job
    const goal = fillSettingsOf(makeJobContext(job), set).goal;
    assert.deepEqual([goal.target, goal.tb, goal.tb2], [main, speed, ''], job);
  }
});

test('Copy sheet to the same job, and a goal on stats every job has, change nothing', () => {
  const same = copyFor(sageGoalSheet(), 'SGE').sets[0];
  assert.deepEqual(goalOf(same), ['mind', 'sps', 'piety']);
  const set = sageSet({ fillSettings: { goal: { target: 'crit', tb: 'det', tb2: 'vit' } } });
  const copy = copyFor(sheetOf('SGE', [set]), 'WAR').sets[0];
  assert.deepEqual(goalOf(copy), ['crit', 'det', 'vit']);
});

test('Copy sheet tank to healer: Strength, Skill Speed and Tenacity become Mind, Spell Speed and Piety', () => {
  const set = sageSet({ fillSettings: { goal: { target: 'str', tb: 'sks', tb2: 'ten', gcd: '', gcdMode: 'exact' } } });
  const copy = copyFor(sheetOf('WAR', [set]), 'AST').sets[0];
  assert.deepEqual(goalOf(copy), ['mind', 'sps', 'piety']);
});
