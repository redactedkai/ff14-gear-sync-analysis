/* Saved sheets and the stat keys (src/ui/sheets/storage.ts withCurrentStatKeys). A record written before the keys were the
   game's own names the goal (target, tb, tb2) and the stones by position: `main`, `spd`, `spec`. The tolerant reader gives
   the sheet the job's own keys, whichever kind the record holds, and `v` stays 1. One v1 record per stat profile. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet } from '../../../../src/ui/sheets/storage.ts';
import { fillSettingsOf } from '../../../../src/ui/sheets/fill-settings.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { readable, sageSet, sheetOf } from '../../helpers/fixtures/sheet-fixtures.ts';
import type { SavedGearSet, SavedRow, SavedSheet } from '../../../../src/ui/sheets/saved-types.ts';

/* One job per profile, with the game's own main, speed and special stat written out (the game's names, not read from the
   code under test): Sage (healer), Warrior (tank), Samurai (Strength melee), Ninja (Dexterity), Black Mage (caster). */
const PROFILES: [string, { main: string; spd: string; spec: string | null }][] = [
  ['SGE', { main: 'mind', spd: 'sps', spec: 'piety' }],
  ['WAR', { main: 'str', spd: 'sks', spec: 'ten' }],
  ['SAM', { main: 'str', spd: 'sks', spec: null }],
  ['NIN', { main: 'dex', spd: 'sks', spec: null }],
  ['BLM', { main: 'int', spd: 'sps', spec: null }],
];

/* A stone as a record may hold it: its stat any text (an old position key, or a name no stat has). */
interface StoneOnDisk {
  stat: string;
  grade: number;
}
/* A saved set as a record on disk may hold it: the head's stones, and the goal's stats, as written. */
type SetOnDisk = Omit<SavedGearSet, 'pieces'> & { pieces: (Omit<SavedRow, 'stones'> & { stones?: (StoneOnDisk | null)[] })[] };

/* A saved set with the goal `[target, tb, tb2]` and the stones `stones` on the head. */
function setWith(goal: [string, string, string], stones: (StoneOnDisk | null)[]): SetOnDisk {
  const set = sageSet({ fillSettings: { goal: { target: goal[0], tb: goal[1], tb2: goal[2], gcd: '', gcdMode: 'exact' } } });
  return { ...set, pieces: set.pieces.map(row => (row.slot === 'head' ? { ...row, stones } : row)) };
}
/* The one set of a sheet, its goal and the stones of its head row. */
const firstSet = (sheet: SavedSheet) => mustFind(sheet.sets[0], 'the sheet set');
const goalOf = (set: SavedGearSet) => mustFind(set.fillSettings?.goal, 'the set goal');
const headStones = (set: SavedGearSet) =>
  mustFind(
    set.pieces.find(r => r.slot === 'head'),
    'the head row',
  ).stones;
const read = (job: string, set: SetOnDisk) => parseSheet(JSON.stringify({ ...sheetOf(job, []), sets: [set] }), 's_1');

for (const [jobId, game] of PROFILES) {
  test(`${jobId}: a v1 record with position keys reads with the game's keys (goal and stones)`, () => {
    const old = setWith(['main', 'spd', game.spec ? 'spec' : 'crit'], [{ stat: 'spd', grade: 12 }, { stat: 'det', grade: 11 }, null]);
    const parsed = read(jobId, old);
    assert.equal(parsed.cause, undefined);
    const sheet = readable(parsed);
    assert.equal(sheet.v, 1);
    const set = firstSet(sheet);
    const goal = goalOf(set);
    assert.deepEqual([goal.target, goal.tb, goal.tb2], [game.main, game.spd, game.spec ?? 'crit']);
    assert.deepEqual(headStones(set), [{ stat: game.spd, grade: 12 }, { stat: 'det', grade: 11 }, null]);
    // the rest of the goal and the other fields are untouched
    assert.equal(goal.gcdMode, 'exact');
    assert.equal(set.pieces.length, old.pieces.length);
  });

  test(`${jobId}: a record with the game's keys reads as it is, and a second read changes nothing`, () => {
    const fresh = setWith([game.main, game.spd, 'crit'], [{ stat: game.spd, grade: 12 }]);
    const sheet = readable(read(jobId, fresh));
    assert.deepEqual(firstSet(sheet), fresh);
    assert.deepEqual(firstSet(readable(read(jobId, firstSet(sheet)))), fresh);
  });

  test(`${jobId}: the Auto-fill settings of a read old record are the page's goal (no stat put back to a default)`, () => {
    const sheet = readable(read(jobId, setWith(['main', 'spd', 'crit'], [])));
    const goal = fillSettingsOf(makeJobContext(jobId), firstSet(sheet)).goal;
    assert.deepEqual([goal.target, goal.tb, goal.tb2], [game.main, game.spd, 'crit']);
  });
}

test('a goal or stone that is neither a position key nor a stat key is left as it is', () => {
  const set = firstSet(readable(read('SGE', setWith(['crit', 'vit', ''], [{ stat: 'no such stat', grade: 3 }]))));
  const goal = goalOf(set);
  assert.deepEqual([goal.target, goal.tb, goal.tb2], ['crit', 'vit', '']);
  assert.deepEqual(headStones(set), [{ stat: 'no such stat', grade: 3 }]);
});

test('a position key the job has no stat for stays and is dropped by the Auto-fill settings, as before (Black Mage: spec)', () => {
  const set = firstSet(readable(read('BLM', setWith(['spec', 'crit', ''], []))));
  assert.equal(goalOf(set).target, 'spec');
  const goal = fillSettingsOf(makeJobContext('BLM'), set).goal;
  assert.deepEqual([goal.target, goal.tb, goal.tb2], ['int', 'crit', '']);
});

test('sets with no Auto-fill settings and rows with no stones read untouched', () => {
  const plain = sageSet();
  assert.deepEqual(firstSet(readable(read('SGE', plain))), plain);
});

test('the reader does not change the record text it read from', () => {
  const text = JSON.stringify({ ...sheetOf('SGE', []), sets: [setWith(['main', 'spd', ''], [{ stat: 'spd', grade: 12 }])] });
  const before = text.slice();
  parseSheet(text, 's_1');
  assert.equal(text, before);
});
