// An Auto-fill suggestion on a job with a 2H weapon or a 1H weapon plus a shield (White Mage): the Off-hand row's Take box.

import { check, expect } from '../../lib/expect.ts';
import { pieceSheet } from '../../lib/fixtures.ts';
import { runFill } from '../../lib/nav.ts';
import { openSet, seedSheet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

const TIDAL_WAVE_BUCKLER = 7823; // White Mage, item level 100, equip level 50
const TIDAL_WAVE_WAND = 7818; // White Mage, item level 100, one-handed
const WEAPON_ROW = 0;
const OFFHAND_ROW = 1; // the saved set's second row

/** An Auto-fill suggestion on a White Mage set holding a wand and a shield that suggests a 2H cane: the Off-hand row reads just
 * "Unavailable", and its Take box is ticked, dimmed and disabled (it follows the weapon's: the cane covers the Off-hand). With the
 * weapon's Take box off, the saved wand stays and the Off-hand's box is free again. */
export async function checkTakeBoxFollowsWeapon(pg: Page) {
  const sheet = pieceSheet('s_whm_take', 'WHM take', 'WHM', WEAPON_ROW, TIDAL_WAVE_WAND, []);
  const pieces = sheet.sets[0].pieces.map((piece, i) =>
    i === OFFHAND_ROW ? { slot: piece.slot, gameId: TIDAL_WAVE_BUCKLER, stones: [] } : piece,
  );
  await seedSheet(pg, { ...sheet, sets: [{ ...sheet.sets[0], pieces }] });
  await openSet(pg, 'WHM take', 'Mine');
  await runFill(pg);
  const weaponBox = pg.locator(`#sh-gear tr[data-row="${WEAPON_ROW}"] .takebox input`);
  const offhand = pg.locator(`#sh-gear tr[data-row="${OFFHAND_ROW}"]`);
  const offhandBox = offhand.locator('.takebox input');

  // a cane is suggested: the Off-hand row says only "Unavailable", and its box follows the weapon
  await expect(offhand.locator('[data-pick]')).toBeDisabled();
  await expect(offhand.locator('[data-pick]')).toHaveAttribute('title', 'Only a one-handed weapon allows a shield.');
  check(await offhandBox.isChecked(), 'the covered Off-hand Take box is not ticked');
  await expect(offhandBox).toBeDisabled();

  // the weapon's box off: the wand stays, the shield is legal again and its box is free
  await weaponBox.uncheck();
  await expect(offhandBox).toBeEnabled();
  await expect(offhand.locator('td.item')).toContainText('Tidal Wave Buckler');
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}
