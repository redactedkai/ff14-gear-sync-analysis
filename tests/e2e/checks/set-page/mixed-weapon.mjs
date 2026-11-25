// Jobs with a 2H weapon or a 1H weapon plus a shield (White Mage, Black Mage): the Off-hand row at every level.

import { check, expect } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { runFill, setNumber, waitSaved } from '../../lib/nav.mjs';
import { expectApplyCount, openSet, seedSheet } from '../../lib/sheets.mjs';
import { STORE_KEY } from '../../lib/constants.mjs';

const TIDAL_WAVE_BUCKLER = 7823; // White Mage, item level 100, equip level 50
const TIDAL_WAVE_WAND = 7818; // White Mage, item level 100, one-handed
const DREADWYRM_CANE = 9006; // White Mage, item level 135, two-handed
const WEAPON_ROW = 0;
const OFFHAND_ROW = 1; // the saved set's second row
const HEAD_ROW = 2;
const BODY_ROW = 3;
const RAINBOW_CAP_OF_HEALING = 10880; // Sage head
const VERMILION_CLOAK_OF_HEALING = 24856; // Sage body piece that covers the head

/** A White Mage set page at level 100 and at level 50 has the Off-hand row (12 rows, a shield on it shown), and a Sage set
 * holding the same shield does not show it. */
export async function checkOffhandRow(pg) {
  for (const level of [100, 50]) {
    const sheet = pieceSheet(`s_whm_${level}`, `WHM ${level}`, 'WHM', OFFHAND_ROW, TIDAL_WAVE_BUCKLER, []);
    await seedSheet(pg, { ...sheet, level });
    await openSet(pg, `WHM ${level}`, 'Mine');
    const rows = await pg.locator('#sh-gear tr[data-row]').count();
    check(rows === 12, `White Mage level ${level}: ${rows} rows in the set's table, expected 12`);
    await expect(pg.locator(`#sh-gear tr[data-row="${OFFHAND_ROW}"] td.item`)).toContainText('Tidal Wave Buckler');
    await pg.click('[data-tab=browse]');
  }
  await seedSheet(pg, pieceSheet('s_sge_shield', 'SGE shield', 'SGE', OFFHAND_ROW, TIDAL_WAVE_BUCKLER, []));
  await openSet(pg, 'SGE shield', 'Mine');
  const rows = await pg.locator('#sh-gear tr[data-row]').count();
  check(rows === 11, `Sage holding a shield: ${rows} rows in the set's table, expected 11`);
  await expect(pg.locator(`#sh-gear tr[data-row="${OFFHAND_ROW}"]`)).toHaveCount(0);
  await pg.click('[data-tab=browse]');
}

/** A shield pinned on a White Mage set stays through Auto-fill (the search takes a one-handed weapon beside it), and a
 * change of the sheet's level keeps the saved shield. */
export async function checkPinnedShield(pg) {
  const sheet = pieceSheet('s_whm_pin', 'WHM pin', 'WHM', OFFHAND_ROW, TIDAL_WAVE_BUCKLER, []);
  const pinned = { ...sheet, sync: { on: true, cap: 123 }, sets: [{ ...sheet.sets[0], pinned: { pieces: [OFFHAND_ROW], meal: false } }] };
  await seedSheet(pg, pinned);
  await openSet(pg, 'WHM pin', 'Mine');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(pg.locator(`#sh-gear tr[data-row="${OFFHAND_ROW}"] td.item`)).toContainText('Tidal Wave Buckler');
  await expect(pg.locator('#sh-gear tr[data-row="0"] td.item')).toHaveText(/\S/);

  // the sheet's level: 100 to 50 and back keeps the shield in the saved record
  await seedSheet(pg, pinned);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'WHM pin' }).click();
  for (const level of ['50', '100']) {
    await setNumber(pg, '#sh-level', level);
    await waitSaved(pg, 's => true');
    const held = await pg.evaluate(
      ([key, row]) => JSON.parse(localStorage.getItem(`${key}:sheet:s_whm_pin`)).sets[0].pieces[row].gameId,
      [STORE_KEY, OFFHAND_ROW],
    );
    check(held === TIDAL_WAVE_BUCKLER, `level ${level}: the saved shield is ${held}, expected ${TIDAL_WAVE_BUCKLER}`);
  }
  await pg.click('[data-tab=browse]');
}

/** A White Mage set holding a wand and a shield: picking a 2H cane empties the Off-hand row in the same draft and a note
 * names the shield; Discard brings the shield and the wand back. */
export async function checkTwoHandedPick(pg) {
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

/** A Sage set holding a head: picking a cloak (a body piece that covers the head) empties the Head row in the same draft and
 * a note names the head; the covered Head control is disabled and opens no menu; Discard brings the head back. */
export async function checkCloakPick(pg) {
  await seedSheet(pg, pieceSheet('s_sge_cloak', 'SGE cloak', 'SGE', HEAD_ROW, RAINBOW_CAP_OF_HEALING, []));
  await openSet(pg, 'SGE cloak', 'Mine');
  const head = pg.locator(`#sh-gear tr[data-row="${HEAD_ROW}"]`);
  const body = pg.locator(`#sh-gear tr[data-row="${BODY_ROW}"]`);
  await expect(head.locator('td.item')).toContainText('Rainbow Cap of Healing');

  await body.locator('[data-pick]').click();
  await pg.locator(`.pick-menu .same-item[data-game-id="${VERMILION_CLOAK_OF_HEALING}"]`).click();
  await expect(body.locator('td.item')).toContainText('Vermilion Cloak of Healing');
  await expect(head.locator('td.item')).not.toContainText('Rainbow Cap of Healing');
  await expect(pg.locator('#sh-toast')).toHaveTextParts(['Rainbow Cap of Healing']);

  // the covered Head control is off: aria-disabled, and a click opens no menu
  const control = head.locator('[data-pick]');
  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await control.click({ force: true });
  check(!(await pg.locator('.pick-menu').isVisible()), 'the covered Head control opened a menu');

  await pg.click('#sh-discard');
  await expect(head.locator('td.item')).toContainText('Rainbow Cap of Healing');
  await pg.click('[data-tab=browse]');
}
