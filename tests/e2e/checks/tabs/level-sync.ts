// Across the tabs: level sync.

import { NARROW, shot } from '../../lib/constants.ts';
import { check, checkNoBadText, expect } from '../../lib/expect.ts';
import { browserRows, fillBrowser, hasHScroll, setCap, setJob, setNumber, showMath, showTab } from '../../lib/nav.ts';
import { pickOption } from '../../lib/select.ts';
import type { Page } from 'playwright';

// Level sync: level 100 healer head pieces at item level 780 or more, at synced level 90 (item level sync off), are
// capped at the item level 660 head values; Mind 248 and the head substat cap 184 come from ItemLevel row 660 x 85 per
// mille (core/sync-target.test.ts).
const HEAD_MAIN_CAP_660 = 248;

const HEAD_SUB_CAP_660 = '184';

/** Synced level 90 with item level sync off, at NARROW width: the gear browser shows the level-synced value, Piece stats
 * cuts a head to the item level 660 caps; no bad text, no horizontal scroll. */
export async function checkLevelSync(pg: Page) {
  await pg.setViewportSize(NARROW);
  await setJob(pg, 'SGE');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '90');
  await fillBrowser(pg, 780, '', 100, 'head');
  // the synced main stat on top with the cap bar, the head's own value on the muted line under it
  check(/\bsynced\b/.test((await browserRows(pg).first().getAttribute('class')) || ''), 'a synced browser row is not marked synced');
  await expect(pg.locator('#b-key')).toBeVisible();
  await expect(browserRows(pg).first().locator('td.cut > span:first-child').first()).toHaveText(String(HEAD_MAIN_CAP_660));
  await checkNoBadText(pg, 'level sync/browse');
  check(!(await hasHScroll(pg)), `level sync: horizontal page scroll at ${NARROW.width} px (browse)`);
  await showMath(pg, 'piece');
  await pickOption(pg, '#p-slot', 'head');
  await setNumber(pg, '#p-ilvl', '780');
  await expect(pg.locator('#p-lead')).toHaveNumber(660);
  const kept = await pg.locator('#p-bars .num b').allInnerTexts();
  check(kept[0] === String(HEAD_MAIN_CAP_660), `level 90 head main stat cap '${kept[0]}', expected ${HEAD_MAIN_CAP_660}`);
  check(kept[2] === HEAD_SUB_CAP_660, `level 90 head substat cap '${kept[2]}', expected ${HEAD_SUB_CAP_660}`);
  await checkNoBadText(pg, 'level sync/piece');
  check(!(await hasHScroll(pg)), `level sync: horizontal page scroll at ${NARROW.width} px (math)`);
  await pg.click('#p-ilvl-reset');
  await showTab(pg, 'browse');
  await pg.screenshot({ path: shot('level-sync.png'), fullPage: true });
  // back to the shared setup: level 50, sync to 123, no browser filters
  await fillBrowser(pg, '', '', 100);
  await setNumber(pg, '#level', '50');
  await setCap(pg, '123');
  await pg.setViewportSize({ width: 1000, height: 900 });
}
