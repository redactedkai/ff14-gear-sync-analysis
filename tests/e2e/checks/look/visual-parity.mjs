// Visual parity: the one look pin that no screenshot baseline shows.
//
// The 30 exact values of the approved prototype (paddings, borders, weights and gaps of the manager, the sheet page and the set
// page, the Auto-fill settings popover, the piece menu footer, the Take line, the locked table, a rank chip's tint, the question
// dialog's width) are the baselines' now (tests/visual: 02-sheets-manager, 03-sheet-page, 04-set-page, 05-set-fill-result,
// 07-set-pick-menu, 29-sheets-delete-question, 31-set-settings-popover; both widths, dark). The Copy dialog is in no baseline view.

import { check, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { seedSheet } from '../../lib/sheets.mjs';

/** The computed value of a design token's colour (read through a probe element, so it holds in either theme), and the computed
 * `properties` of the first element matching `selector`, joined by spaces. */
const tokenColour = (pg, token) =>
  pg.evaluate(name => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

/** The sheet page's Copy dialog with the clearing warning (Copy a Sage sheet holding a Sage-only weapon to Scholar): its left rule is
 * the cap-part colour, 3 px wide. */
export async function checkVisualParity(pg) {
  // the seeded Sage set with a Sage-only weapon (Phantom Pendulums Eclipticum), so that Copy to Scholar has a piece to clear
  const [mine] = SET_SHEET.sets;
  const withWeapon = {
    ...SET_SHEET,
    sets: [{ ...mine, pieces: [{ slot: 'weapon', gameId: 37291, stones: [] }, ...mine.pieces.slice(1)] }],
  };
  await seedSheet(pg, withWeapon);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  await pg.click('#sh-copy');
  await pg.click('#sh-dialog .jobchoice[data-job-id=SCH]');
  await expect(pg.locator('#sh-dlg-clear')).toBeVisible();
  const part = await tokenColour(pg, '--cap-part');
  const warning = await pg.evaluate(() => {
    const style = getComputedStyle(document.querySelector('#sh-dlg-clear'));
    return `${style.borderLeftColor} ${style.borderLeftWidth}`;
  });
  check(warning === `${part} 3px`, `look: the Copy dialog warning left rule (colour, width) is "${warning}", not "${part} 3px"`);
  await pg.keyboard.press('Escape');
}
