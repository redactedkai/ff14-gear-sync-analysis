// Jobs with a 2H weapon or a 1H weapon plus a shield (White Mage, Black Mage): a 2H weapon picked over a held shield, on the real page.
// The rows of the set at each level, a pinned shield kept by Auto-fill and a cloak over a head are the unit tests'
// (views/set-rows, sheets/saved-set, sheets/fill.mixed-weapon, sheets/set-edits.covering).

import { check, expect } from '../../lib/expect.ts';
import { pieceSheet } from '../../lib/fixtures.ts';
import { expectApplyCount, openSet, seedSheet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

const TIDAL_WAVE_BUCKLER = 7823; // White Mage, item level 100, equip level 50
const TIDAL_WAVE_WAND = 7818; // White Mage, item level 100, one-handed
const DREADWYRM_CANE = 9006; // White Mage, item level 135, two-handed
const WEAPON_ROW = 0;
const OFFHAND_ROW = 1; // the saved set's second row

/** A White Mage set holding a wand and a shield: picking a 2H cane empties the Off-hand row in the same draft and a note
 * names the shield; Discard brings the shield and the wand back. */
export async function checkTwoHandedPick(pg: Page) {
  const sheet = pieceSheet('s_whm_2h', 'WHM 2H', 'WHM', WEAPON_ROW, TIDAL_WAVE_WAND, []);
  const pieces = sheet.sets[0].pieces.map((piece, i) =>
    i === OFFHAND_ROW ? { slot: piece.slot, gameId: TIDAL_WAVE_BUCKLER, stones: [] } : piece,
  );
  await seedSheet(pg, { ...sheet, sets: [{ ...sheet.sets[0], pieces }] });
  await openSet(pg, 'WHM 2H', 'Mine');
  const weapon = pg.locator(`#sh-gear tr[data-row="${WEAPON_ROW}"]`);
  const offhand = pg.locator(`#sh-gear tr[data-row="${OFFHAND_ROW}"]`);
  await expect(offhand.locator('td.item')).toContainText('Tidal Wave Buckler');

  await weapon.locator('[data-pick]').click();
  await pg.locator(`.pick-menu .same-item[data-game-id="${DREADWYRM_CANE}"]`).click();
  await expect(weapon.locator('td.item')).toContainText('Dreadwyrm Cane');
  await expect(offhand.locator('td.item')).not.toContainText('Tidal Wave Buckler');
  await expect(pg.locator('#sh-toast')).toHaveTextParts(['Tidal Wave Buckler']);
  await expectApplyCount(pg, 2);

  // the covered Off-hand control: dashed, aria-disabled, the rule under it, and a click opens no menu
  const control = offhand.locator('[data-pick]');
  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(offhand.locator('.shield-note')).toBeVisible();
  await control.click({ force: true }); // Playwright treats aria-disabled as not enabled
  check(!(await pg.locator('.pick-menu').isVisible()), 'the covered Off-hand control opened a menu');

  await pg.click('#sh-discard');
  await expect(weapon.locator('td.item')).toContainText('Tidal Wave Wand');
  await expect(offhand.locator('td.item')).toContainText('Tidal Wave Buckler');
  await pg.click('[data-tab=browse]');
}
