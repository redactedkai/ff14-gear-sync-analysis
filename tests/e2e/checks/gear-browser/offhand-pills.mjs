// The Off-hand choice of the Gear browser's Slot menu and the Piece stats Slot menu, by job.

import { check, expect } from '../../lib/expect.mjs';
import { setJob, showMath, showTab } from '../../lib/nav.mjs';
import { selectOptions } from '../../lib/select.mjs';

/** For White Mage and Black Mage the Gear browser's Slot menu and Piece stats' Slot menu list the Off-hand; for Sage they do not. */
export async function checkOffhandPills(pg) {
  for (const job of ['WHM', 'BLM']) {
    await setJob(pg, job);
    await showTab(pg, 'browse');
    await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(1);
    await showMath(pg, 'piece');
    const slots = (await selectOptions(pg, '#p-slot')).map(option => option.label);
    check(slots.includes('Off-hand'), `${job}: Piece stats slots ${JSON.stringify(slots)} lack the Off-hand`);
  }
  await setJob(pg, 'SGE');
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(0);
}
