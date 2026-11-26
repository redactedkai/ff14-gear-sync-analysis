/* Saved sheets and the stat keys (src/ui/sheets/storage.js withCurrentStatKeys). A record written before the keys were the
   game's own names the goal (target, tb, tb2) and the stones by position: `main`, `spd`, `spec`. The tolerant reader gives
   the sheet the job's own keys, whichever kind the record holds, and `v` stays 1. One v1 record per stat profile. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet } from '../../../../src/ui/sheets/storage.js';
import { fillSettingsOf } from '../../../../src/ui/sheets/fill-settings.js';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

/* One job per profile, with the game's own main, speed and special stat written out (the game's names, not read from the
   code under test): Sage (healer), Warrior (tank), Samurai (Strength melee), Ninja (Dexterity), Black Mage (caster). */
const PROFILES = [
  ['SGE', { main: 'mind', spd: 'sps', spec: 'piety' }],
  ['WAR', { main: 'str', spd: 'sks', spec: 'ten' }],
  ['SAM', { main: 'str', spd: 'sks', spec: null }],
  ['NIN', { main: 'dex', spd: 'sks', spec: null }],
  ['BLM', { main: 'int', spd: 'sps', spec: null }],
];

/* A saved set with the goal `[target, tb, tb2]` and the stones `stones` on the head. */
function setWith(goal, stones) {
  const set = sageSet({ fillSettings: { goal: { target: goal[0], tb: goal[1], tb2: goal[2], gcd: '', gcdMode: 'exact' } } });
  set.pieces = set.pieces.map(row => (row.slot === 'head' ? { ...row, stones } : row));
  return set;
}
const read = (job, set) => parseSheet(JSON.stringify(sheetOf(job, [set])), 's_1');

for (const [jobId, game] of PROFILES) {
  test(`${jobId}: a v1 record with position keys reads with the game's keys (goal and stones)`, () => {
    const old = setWith(['main', 'spd', game.spec ? 'spec' : 'crit'], [{ stat: 'spd', grade: 12 }, { stat: 'det', grade: 11 }, null]);
    const { sheet, cause } = read(jobId, old);
    assert.equal(cause, undefined);
    assert.equal(sheet.v, 1);
    const set = sheet.sets[0];
    assert.deepEqual(
      [set.fillSettings.goal.target, set.fillSettings.goal.tb, set.fillSettings.goal.tb2],
      [game.main, game.spd, game.spec ?? 'crit'],
    );
    assert.deepEqual(set.pieces.find(r => r.slot === 'head').stones, [{ stat: game.spd, grade: 12 }, { stat: 'det', grade: 11 }, null]);
    // the rest of the goal and the other fields are untouched
    assert.equal(set.fillSettings.goal.gcdMode, 'exact');
    assert.equal(set.pieces.length, old.pieces.length);
  });

  test(`${jobId}: a record with the game's keys reads as it is, and a second read changes nothing`, () => {
    const fresh = setWith([game.main, game.spd, 'crit'], [{ stat: game.spd, grade: 12 }]);
    const { sheet } = read(jobId, fresh);
    assert.deepEqual(sheet.sets[0], fresh);
    assert.deepEqual(read(jobId, sheet.sets[0]).sheet.sets[0], fresh);
  });

  test(`${jobId}: the Auto-fill settings of a read old record are the page's goal (no stat put back to a default)`, () => {
    const { sheet } = read(jobId, setWith(['main', 'spd', 'crit'], []));
    const goal = fillSettingsOf(makeJobContext(jobId), sheet.sets[0]).goal;
    assert.deepEqual([goal.target, goal.tb, goal.tb2], [game.main, game.spd, 'crit']);
  });
}

test('a goal or stone that is neither a position key nor a stat key is left as it is', () => {
  const { sheet } = read('SGE', setWith(['crit', 'vit', ''], [{ stat: 'no such stat', grade: 3 }]));
  const set = sheet.sets[0];
  assert.deepEqual([set.fillSettings.goal.target, set.fillSettings.goal.tb, set.fillSettings.goal.tb2], ['crit', 'vit', '']);
  assert.deepEqual(set.pieces.find(r => r.slot === 'head').stones, [{ stat: 'no such stat', grade: 3 }]);
});

test('a position key the job has no stat for stays and is dropped by the Auto-fill settings, as before (Black Mage: spec)', () => {
  const { sheet } = read('BLM', setWith(['spec', 'crit', ''], []));
  assert.equal(sheet.sets[0].fillSettings.goal.target, 'spec');
  const goal = fillSettingsOf(makeJobContext('BLM'), sheet.sets[0]).goal;
  assert.deepEqual([goal.target, goal.tb, goal.tb2], ['int', 'crit', '']);
});

test('sets with no Auto-fill settings and rows with no stones read untouched', () => {
  const plain = sageSet();
  const { sheet } = read('SGE', plain);
  assert.deepEqual(sheet.sets[0], plain);
});

test('the reader does not change the record text it read from', () => {
  const text = JSON.stringify(sheetOf('SGE', [setWith(['main', 'spd', ''], [{ stat: 'spd', grade: 12 }])]));
  const before = text.slice();
  parseSheet(text, 's_1');
  assert.equal(text, before);
});
