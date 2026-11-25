// The Auto-fill settings dialog (the gear icon on a set page): the sheet and the helpers its checks share.

import { ACTIVITY_KEYS, STORE_KEY } from '../../lib/constants.mjs';
import { DEFAULT_EXCLUDE } from '../../lib/core-worker.mjs';
import { check, expect, poll } from '../../lib/expect.mjs';
import { FILL_SHEET } from '../../lib/fixtures.mjs';
import { runFill } from '../../lib/nav.mjs';
import { checkTotals } from '../../lib/shared-checks.mjs';

export const DIALOG_SYNC = { cap: null, sync: false, level: 100 };

export const DIALOG_SHEET = { ...FILL_SHEET, id: 's_dialog', name: 'Auto-fill dialog', level: 100, sync: { on: false, cap: 795 } };

export const DEFAULT_BOXES = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));

/** A pattern for the Gear to search line: the searched count, then the whole count, as the popover writes numbers
 * (thousands with a comma), whatever words sit between and around them. */
export const searchLine = (searched, all) => {
  const number = value => value.toLocaleString('en-US');
  return new RegExp(`(^|[^\\d,])${number(searched)}[^\\d,].*[^\\d,]${number(all)}($|[^\\d,])`);
};

/** Open the Auto-fill settings popover of the open set page if it is closed. */
export async function openFillSettings(pg) {
  if (!(await pg.locator('#sh-settings-dialog').isVisible())) {
    await pg.click('#sh-settings');
  }
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
}

/** Wait until the Auto-fill settings saved on the sheet's first set satisfy `test` (the set page saves a change at once). */
export async function expectSavedFill(pg, sheet, what, test) {
  await poll(`saved Auto-fill settings: ${what}`, async () => {
    const saved = await pg.evaluate(
      ([key, id]) => JSON.parse(localStorage.getItem(`${key}:sheet:${id}`))?.sets[0]?.fillSettings ?? null,
      [STORE_KEY, sheet.id],
    );
    return { ok: !!saved && test(saved), got: saved && { goal: saved.goal, searchCriteria: saved.searchCriteria } };
  });
}

/** Auto-fill from the bar's button (the settings popover stays open until it is pressed), check the suggestion's Total row against the core's `want` (coreRecipe's shape),
 * run `more` while the result waits, then Discard. */
export async function checkFilled(pg, what, want, more = null) {
  await openFillSettings(pg);
  await runFill(pg);
  await checkTotals(pg, what, want.totals);
  if (more) {
    await more();
  }
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
}

/** The dialog's boxes against `want` ({id: value}): selects and number boxes by their value, switches by state. */
export async function expectDialog(pg, want) {
  for (const [id, value] of Object.entries(want)) {
    const box = pg.locator(`#${id}`);
    if (typeof value === 'boolean') {
      check((await box.isChecked()) === value, `#${id} is ${!value}, expected ${value}`);
    } else {
      await expect(box).toHaveValue(value);
    }
  }
}
