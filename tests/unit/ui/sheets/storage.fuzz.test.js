/* Saved sheet records damaged in several fields at once (helpers/fuzz.js), from a fixed seed, through every reader: parseSheet
   and loadSheets with the sheet manager's view never throw; a record that is still readable goes through repairSheet and then
   evaluateInSheet, fillPlan and fillRecipe without throwing, and no total is NaN or negative. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillPlan } from '../../../../src/ui/sheets/fill.ts';
import { fillRecipe, fillSettingsOf } from '../../../../src/ui/sheets/fill-settings.ts';
import { repairSheet } from '../../../../src/ui/sheets/ops.ts';
import { loadSheets, parseSheet } from '../../../../src/ui/sheets/storage.ts';
import { sheetManagerView } from '../../../../src/ui/views/sheet-manager.ts';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.ts';
import { rng } from '../../helpers/common.js';
import { damage } from '../../helpers/fuzz.js';
import { fakeStorage, sageSet, sheetOf, warSet } from '../../helpers/sheet-fixtures.js';

const CASES = 20000;
const isTotal = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

test('damaged sheet records never throw in the readers or the views built from them', () => {
  const rand = rng(20261113);
  const pick = list => list[Math.floor(rand() * list.length)];
  const good = [
    sheetOf('SGE', [sageSet()]),
    sheetOf('WAR', [warSet()], { level: 90, sync: { on: false, cap: 795 } }),
    sheetOf('PLD', [warSet({ id: 'g_p' })], { sync: { on: true, cap: 660 } }),
  ];
  let readable = 0;
  for (let n = 0; n < CASES; n++) {
    const original = pick(good);
    const raw = damage(original, 1 + Math.floor(rand() * (n % 2 ? 4 : 2)), rand);
    const label = JSON.stringify(raw).slice(0, 500);

    // reading it, listing it and the manager's row for it
    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseSheet(JSON.stringify(raw), original.id);
      const storage = fakeStorage();
      storage.setItem(`ilvl-stat-lab-v4:sheet:${original.id}`, JSON.stringify(raw));
      sheetManagerView(loadSheets(storage));
    }, label);
    if (!parsed.sheet) {
      continue;
    }
    readable++;

    // a readable record repaired, evaluated and planned for Auto-fill
    assert.doesNotThrow(() => {
      const sheet = repairSheet(parsed.sheet);
      for (const set of sheet.sets) {
        const { evaluated, job } = evaluateInSheet(sheet, set);
        const totals = [
          ...Object.values(evaluated.withFood ?? {}),
          ...Object.values(evaluated.gear ?? {}),
          evaluated.gcd?.spd,
          evaluated.defense?.phys,
          evaluated.defense?.mag,
        ];
        for (const total of totals) {
          assert.ok(total === undefined || isTotal(total), `total ${total}: ${label}`);
        }
        fillPlan(job, set);
        fillRecipe(fillSettingsOf(job, set));
      }
    }, label);
  }
  assert.ok(readable > CASES / 20, `only ${readable} of ${CASES} damaged records were still readable`);
});
