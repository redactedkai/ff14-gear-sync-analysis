/* The clan and the party bonus in the saved-set views (src/ui/views/set-totals.ts, sheet-sets.ts): the Total row with and
   without the meal, the header's main-stat figure, the sheet list's Stat points tab and the note under the table. The sheet
   holds the two values (`clan`, `partyRoles`). Numbers are summed by hand from the Warrior set's raw items (342 Strength and
   356 Vitality at the level 100 base of 462 and 484) and the Sage set's (279 Mind, 257 Vitality at 506 and 440). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { sheetPageView } from '../../../../src/ui/views/sheet-sets.ts';
import { bonusNote, evaluateInSheet, setFigures, setTotalsView } from '../../../../src/ui/views/set-totals.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { rawGear, sageSet, sheetOf, warSet } from '../../helpers/fixtures/sheet-fixtures.ts';
import type { SavedGearSet, SavedSheet } from '../../../../src/ui/sheets/saved-types.ts';

const NO_SYNC = { on: false, cap: 795 };
const warSheet = (extra: Partial<SavedSheet> = {}, sets: SavedGearSet[] = []): SavedSheet => ({
  ...sheetOf('WAR', sets, { sync: NO_SYNC }),
  ...extra,
});
const valuesOf = (cells: readonly { stat: string; value: number }[]): Record<string, number> =>
  Object.fromEntries(cells.map(c => [c.stat, c.value]));

test('a sheet without the fields, or with none set, shows the numbers it showed before', () => {
  const plain = setTotalsView(evaluateInSheet(warSheet(), warSet())).total;
  const none = setTotalsView(evaluateInSheet(warSheet({ clan: null, partyRoles: 0 }), warSet())).total;
  assert.deepEqual(none, plain);
  const gear = rawGear('WAR', warSet().pieces);
  assert.equal(valuesOf(plain.cells).str, 462 + (gear.str ?? 0));
  assert.equal(valuesOf(plain.cells).vit, 484 + (gear.vit ?? 0));
});

test('Warrior, Midlander and 5 roles: the Total row, with and without a meal', () => {
  const sheet = warSheet({ clan: 'Midlander', partyRoles: 5 });
  const view = setTotalsView(evaluateInSheet(sheet, warSet())).total;
  // Strength floor((462 + 2 + 342) x 1.05) = 846, Vitality floor((484 + 356) x 1.05) = 882, Critical Hit 420 + 137 untouched
  const values = valuesOf(view.cells);
  assert.deepEqual([values.str, values.vit, values.crit], [846, 882, 557]);
  assert.deepEqual(view.withoutMeal, view.cells);

  // the newest meal gives Vitality floor(10% of 840) = 84, added after the party bonus; without a meal the cells go on
  const meal = mustFind(allMeals(makeJobContext('WAR')).at(-1), 'a meal');
  const fed = setTotalsView(evaluateInSheet(sheet, { ...warSet(), meal: meal.key })).total;
  assert.equal(valuesOf(fed.cells).vit, 882 + 84);
  assert.equal(valuesOf(fed.cells).str, 846);
  assert.deepEqual(valuesOf(fed.withoutMeal), valuesOf(view.cells));
});

test('the header figure of the main stat, and a Sage with Mind', () => {
  const sheet = warSheet({ clan: 'Midlander', partyRoles: 5 });
  const main = mustFind(
    setFigures(evaluateInSheet(sheet, warSet())).find(f => f.key === 'main'),
    'the main stat figure',
  );
  assert.equal(main.text, '846');
  assert.equal(main.label, 'STR');
  // Sage: Keeper of the Moon +3 Mind, 3 roles: floor((506 + 3 + 279) x 1.03) = 811; without them 506 + 279 = 785
  const sage = sheetOf('SGE', [], { sync: { on: true, cap: 123 } });
  const withBonus = setFigures(evaluateInSheet({ ...sage, clan: 'Keeper of the Moon', partyRoles: 3 }, sageSet()));
  assert.equal(withBonus.find(f => f.key === 'main')?.text, '811');
  assert.equal(setFigures(evaluateInSheet(sage, sageSet())).find(f => f.key === 'main')?.text, '785');
  // Critical Hit's figure counts no bonus: the same on both
  assert.deepEqual(
    withBonus.find(f => f.key === 'crit'),
    setFigures(evaluateInSheet(sage, sageSet())).find(f => f.key === 'crit'),
  );
});

test('the sheet list: the Stat points tab counts the bonuses and the note names them', () => {
  const sheet = warSheet({ clan: 'Midlander', partyRoles: 5 }, [warSet()]);
  const page = sheetPageView(sheet);
  const points = Object.fromEntries(page.rows[0].points.map(p => [p.key, p.text]));
  assert.deepEqual([points.str, points.vit], ['846', '882']);
  // the note's parts, not its sentence: the two stats, the clan and the party percent
  for (const part of ['STR', 'VIT', 'Midlander', '5%']) {
    assert.ok(page.bonusNote.includes(part), `${part} in: ${page.bonusNote}`);
  }
  const plain = sheetPageView(warSheet({}, [warSet()]));
  assert.equal(plain.bonusNote, '');
  assert.equal(plain.rows[0].points.find(p => p.key === 'str')?.text, String(462 + 342));
});

test('the note names the offset when both stats get the same one, and says "rounded down" only with a party bonus', () => {
  const note = (extra: Partial<Pick<SavedSheet, 'clan' | 'partyRoles'>>) => bonusNote({ job: 'WAR', ...extra });
  const has = (text: string, ...parts: string[]) => parts.every(part => text.includes(part));
  assert.equal(note({}), '');
  assert.equal(note({ clan: null, partyRoles: 0 }), '');
  assert.equal(note({ clan: 'Nobody', partyRoles: 0 }), '');
  // Helions: +3 Strength and +3 Vitality, so the note names the offset; no party bonus, so no rounding
  const helions = note({ clan: 'Helions' });
  assert.ok(has(helions, 'Helions', '+3'), helions);
  assert.ok(!helions.includes('%') && !helions.includes('rounded down'), helions);
  // Midlander: +2 and 0, so no single number
  const midlander = note({ clan: 'Midlander' });
  assert.ok(has(midlander, 'Midlander') && !/\d/.test(midlander), midlander);
  // a party bonus alone: the percent and the rounding, no clan
  const party = note({ partyRoles: 2 });
  assert.ok(has(party, '2%', 'rounded down') && !party.includes('clan'), party);
  const both = note({ clan: 'The Lost', partyRoles: 5 });
  assert.ok(has(both, 'Lost', '+3', '5%', 'rounded down'), both);
  // the job's own short names: a Sage's main stat is Mind
  const sage = bonusNote({ job: 'SGE', partyRoles: 1 });
  assert.ok(has(sage, 'MND', 'VIT', '1%') && !sage.includes('STR'), sage);
});
