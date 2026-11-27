// The Auto-fill settings dialog (the gear icon on a set page): the sheet and the helpers its checks share.

import { ACTIVITY_KEYS, STORE_KEY } from '../../lib/constants.ts';
import { DEFAULT_EXCLUDE } from '../../lib/core-worker.ts';
import { check, expect, placedByZag, poll } from '../../lib/expect.ts';
import { FILL_SHEET } from '../../lib/fixtures.ts';
import { runFill } from '../../lib/nav.ts';
import { expectSelectValue } from '../../lib/select.ts';
import { checkTotals } from '../../lib/shared-checks.ts';
import type { FillSettings, SavedSheet } from '../../../../src/ui/sheets/saved-types.ts';
import type { Page } from 'playwright';

export const DIALOG_SYNC = { cap: null, sync: false, level: 100 };

export const DIALOG_SHEET = { ...FILL_SHEET, id: 's_dialog', name: 'Auto-fill dialog', level: 100, sync: { on: false, cap: 795 } };

export const DEFAULT_BOXES = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));

/** A pattern for the Gear to search line: the searched count, then the whole count, as the popover writes numbers
 * (thousands with a comma), whatever words sit between and around them. */
export const searchLine = (searched: number, all: number) => {
  const number = (value: number) => value.toLocaleString('en-US');
  return new RegExp(`(^|[^\\d,])${number(searched)}[^\\d,].*[^\\d,]${number(all)}($|[^\\d,])`);
};

/** Open the Auto-fill settings popover of the open set page if it is closed. */
export async function openFillSettings(pg: Page) {
  if (!(await pg.locator('#sh-settings-dialog').isVisible())) {
    await pg.click('#sh-settings');
  }
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await placedByZag(pg, '#sh-settings-dialog');
}

/** Wait until the Auto-fill settings saved on the sheet's first set satisfy `test` (the set page saves a change at once). */
export async function expectSavedFill(pg: Page, sheet: SavedSheet, what: string, test: (fill: FillSettings) => boolean) {
  await poll(`saved Auto-fill settings: ${what}`, async () => {
    const saved = await pg.evaluate(
      ([key, id]) => JSON.parse(localStorage.getItem(`${key}:sheet:${id}`) ?? 'null')?.sets[0]?.fillSettings ?? null,
      [STORE_KEY, sheet.id] as const,
    );
    return { ok: Boolean(saved) && test(saved), got: saved && { goal: saved.goal, searchCriteria: saved.searchCriteria } };
  });
}

/** Auto-fill from the bar's button (the settings popover stays open until it is pressed), check the suggestion's Total row against the core's `want` (coreRecipe's shape),
 * run `more` while the result waits, then Discard. */
export async function checkFilled(
  pg: Page,
  what: string,
  want: { totals: Record<string, number> },
  more: (() => Promise<unknown>) | null = null,
) {
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
export async function expectDialog(pg: Page, want: Record<string, string | boolean>) {
  for (const [id, value] of Object.entries(want)) {
    const box = pg.locator(`#${id}`);
    if (typeof value === 'boolean') {
      check((await box.isChecked()) === value, `#${id} is ${!value}, expected ${value}`);
    } else if (await box.evaluate(element => element.classList.contains('sel-btn'))) {
      await expectSelectValue(pg, `#${id}`, value);
    } else {
      await expect(box).toHaveValue(value);
    }
  }
}
