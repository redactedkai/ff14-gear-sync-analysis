/* The numbers of the Auto-fill settings (Target GCD, item level range, equip level): a box turns typed text into a number or ''
   once (ui/number-field.ts numberBox), and a saved sheet that holds the Target GCD as text ("2.40", an older save) is read as
   a number (src/ui/sheets/storage.ts withNumericGcd), so the recipe the solver gets (fillRecipe) holds numbers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { numberBox } from '../../../../src/ui/number-field.ts';
import { fillRecipe, fillSettingsOf } from '../../../../src/ui/sheets/fill-settings.ts';
import { parseSheet } from '../../../../src/ui/sheets/storage.ts';
import { FakeInput, dispatchTo } from '../../helpers/dom-fakes.ts';
import { readable, sageSet, sheetOf } from '../../helpers/sheet-fixtures.ts';

const SGE = makeJobContext('SGE');

/* the sheet text with one Sage set whose Auto-fill settings hold `fillSettings`, read back; its first set */
const readSet = (fillSettings: object) =>
  readable(parseSheet(JSON.stringify(sheetOf('SGE', [{ ...sageSet(), fillSettings }])), 's_1')).sets[0];

test('a saved Target GCD typed as text is read as a number; a number and the empty box stay', () => {
  assert.equal(readSet({ goal: { gcd: '2.40' } })?.fillSettings?.goal?.gcd, 2.4);
  assert.equal(readSet({ goal: { gcd: ' 2.45 ' } })?.fillSettings?.goal?.gcd, 2.45);
  assert.equal(readSet({ goal: { gcd: 2.5 } })?.fillSettings?.goal?.gcd, 2.5);
  assert.equal(readSet({ goal: { gcd: '' } })?.fillSettings?.goal?.gcd, '');
  // text that is no number is no limit
  assert.equal(readSet({ goal: { gcd: 'fast' } })?.fillSettings?.goal?.gcd, '');
  // the other fields of the settings come through as they were
  const set = readSet({ goal: { gcd: '2.40', gcdMode: 'min' }, searchCriteria: { min: 700, max: '', lvl: 90 } });
  assert.equal(set?.fillSettings?.goal?.gcdMode, 'min');
  assert.deepEqual(set?.fillSettings?.searchCriteria, { min: 700, max: '', lvl: 90 });
});

test('the recipe of a saved sheet holds numbers, and the empty boxes stay empty text', () => {
  const saved = readSet({ goal: { gcd: '2.40' }, searchCriteria: { min: 700, max: '', lvl: 90 } });
  assert.ok(saved);
  const recipe = fillRecipe(fillSettingsOf(SGE, saved));
  assert.deepEqual([recipe.gcd, recipe.min, recipe.max, recipe.lvl], [2.4, 700, '', 90]);
});

test('the Target GCD box commits typed "2.40" as 2.4 and an emptied box as the empty text', () => {
  let value: number | '' = '';
  const field = numberBox(
    () => value,
    (next: number | '') => {
      value = next;
    },
    1.5,
    3,
    { empty: '', decimals: 2 },
  );
  const leave = (text: string) => dispatchTo(new FakeInput(text), field.onChange, new Event('change'));
  leave('2.40');
  assert.equal(value, 2.4);
  leave('');
  assert.equal(value, '');
});
