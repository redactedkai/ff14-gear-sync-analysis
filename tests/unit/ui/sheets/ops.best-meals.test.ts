/* The tied best meals a gear set saves with an Auto-fill result ("best for goal": `bestMeals`, meal keys): the saved shape, a
   record from before the field reading fine, a damaged value repaired as it is read, Copy set keeping it, Copy sheet and a
   change of level or sync dropping it (docs/engineering/sheets.md, "Saved data"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { copyGearSet, copySheet, newGearSet, repairSheet } from '../../../../src/ui/sheets/ops.ts';
import { parseSheet } from '../../../../src/ui/sheets/storage.ts';
import { fakeStorage, sageSet, sheetOf } from '../../helpers/fixtures/sheet-fixtures.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { createSheetsFacade, idOf, openSetOf, openSheetOf, savedSheet } from '../../helpers/fixtures/stores.ts';
import type { SavedGearSet } from '../../../../src/ui/sheets/saved-types.ts';

const AT = Date.UTC(2026, 10, 10, 12);
/* three real meals of Sage, as an Auto-fill result's tie list names them */
const MEALS = allMeals(makeJobContext('SGE')).slice(-3);
const TIED = MEALS.map(meal => meal.key);
const tagged = (fields: Partial<SavedGearSet> = {}): SavedGearSet => ({ ...sageSet({ meal: TIED[2] }), bestMeals: TIED, ...fields });
const read = (set: SavedGearSet) => parseSheet(JSON.stringify(sheetOf('SGE', [set])), 's_1');
/* The saved text of a Sage sheet whose one set holds `bestMeals` as it is (a value the type does not allow, as a damaged record has it). */
const damagedRecord = (bestMeals: unknown): string => JSON.stringify({ ...sheetOf('SGE', [tagged()]), sets: [{ ...tagged(), bestMeals }] });
/* The one set of a parsed sheet. */
const firstSet = (parsed: ReturnType<typeof read>) => mustFind(mustFind(parsed.sheet, 'the sheet').sets[0], 'its set');

test('a new gear set has no tagged meals; one set with a list reads back whole, and a record from before the field reads fine', () => {
  assert.equal(newGearSet('Set 1', 'g_1', AT).bestMeals, null);
  assert.deepEqual(firstSet(read(tagged())).bestMeals, TIED);
  const old = sageSet({ meal: TIED[2] });
  assert.equal('bestMeals' in old, false);
  assert.deepEqual(firstSet(read(old)), old);
});

test('a damaged bestMeals does not make the record unreadable; reading repairs it to none, and a good one is left alone', () => {
  for (const bestMeals of ['a', 7, [1], { a: 1 }, [null]]) {
    const { sheet, cause } = parseSheet(damagedRecord(bestMeals), 's_1');
    assert.equal(cause, undefined, JSON.stringify(bestMeals));
    assert.equal(repairSheet(mustFind(sheet, 'the sheet')).sets[0]?.bestMeals, null, JSON.stringify(bestMeals));
  }
  const good = mustFind(read(tagged()).sheet, 'the sheet');
  assert.equal(repairSheet(good), good, 'the same object when nothing needs repair');
});

test('Copy set keeps the tagged meals (a deep copy)', () => {
  const original = tagged();
  const copy = copyGearSet(original, 'Set 1 (1)', 'g_c', AT);
  assert.deepEqual(copy.bestMeals, TIED);
  assert.notEqual(copy.bestMeals, original.bestMeals);
});

test('Copy sheet keeps them for the same job, level and sync, and drops them when any of those differ', () => {
  const sheet = sheetOf('SGE', [tagged()], { level: 100, sync: { on: true, cap: 123 } });
  let n = 0;
  const copyAs = (fields: Omit<Parameters<typeof copySheet>[1], 'name'>) =>
    copySheet(sheet, { name: 'Copy', ...fields }, 's_2', AT, () => `g_c${++n}`).sets[0]?.bestMeals;
  assert.deepEqual(copyAs({ job: 'SGE', level: 100, sync: { on: true, cap: 123 } }), TIED);
  assert.equal(copyAs({ job: 'SGE', level: 90, sync: { on: true, cap: 123 } }), null, 'another level');
  assert.equal(copyAs({ job: 'SGE', level: 100, sync: { on: true, cap: 120 } }), null, 'another cap');
  assert.equal(copyAs({ job: 'SGE', level: 100, sync: { on: false, cap: 123 } }), null, 'sync off');
  assert.equal(copyAs({ job: 'WHM', level: 100, sync: { on: true, cap: 123 } }), null, 'another job');
});

test("a change of the open sheet's level or sync drops the tagged meals of its sets, saved; any other edit keeps them", () => {
  const storage = fakeStorage();
  const store = createSheetsFacade({ storage });
  store.createSheet({ name: 'S', description: '', job: 'SGE', level: 100, sync: { on: true, cap: 123 } });
  const id = idOf(store.newSet());
  store.updateSet(id, { bestMeals: TIED });
  store.editSet(id, { name: 'Renamed', description: '' });
  assert.deepEqual(openSetOf(store).bestMeals, TIED, 'a rename keeps it');
  store.setLevel(100);
  assert.deepEqual(openSetOf(store).bestMeals, TIED, 'the same level: nothing changed');
  store.setCap(120);
  assert.equal(openSetOf(store).bestMeals, null);
  assert.equal(savedSheet(createSheetsFacade({ storage }), openSheetOf(store).id).sets[0]?.bestMeals, null, 'saved');
  store.updateSet(id, { bestMeals: TIED });
  store.setSyncOn(false);
  assert.equal(openSetOf(store).bestMeals, null);
  store.updateSet(id, { bestMeals: TIED });
  store.setLevel(90);
  assert.equal(openSetOf(store).bestMeals, null);
});
