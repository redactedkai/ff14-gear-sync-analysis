// The Auto-fill settings dialog: the goal.

import {
  DEFAULT_BOXES,
  DIALOG_SHEET,
  DIALOG_SYNC,
  checkFilled,
  expectDialog,
  expectSavedFill,
  openFillSettings,
  searchLine,
} from './dialog.mjs';
import { ACTIVITY_KEYS, shot } from '../../lib/constants.mjs';
import { coreGear, coreRecipe } from '../../lib/core.mjs';
import { check, checkNoBadText, expect, poll, same } from '../../lib/expect.mjs';
import { runFill, setNumber, ticked, waitReady } from '../../lib/nav.mjs';
import { openSet, seedSheet, reloadAtSheets } from '../../lib/sheets.mjs';
import { pickOption, selectOptions } from '../../lib/select.mjs';

/** The checked radio of the Target GCD mode (value exact or min). */
const MODE_CHECKED = '#sh-settings-dialog input[name="s-gcd-mode"]:checked';

/** The goal part of the Auto-fill settings dialog: Maximize, the tiebreaks, Spare points to tiebreaks, Materia and the Target
 * GCD, each wired (it saves into the set's fillSettings and changes what Auto-fill finds, against the core), and all of it
 * kept across a reload. A change under a waiting Auto-fill result drops the result. Food and the filters are in the next steps. */
export async function checkFillGoal(pg) {
  const fill = fields => coreRecipe('SGE', DIALOG_SYNC, fields);
  const crit = { target: 'crit', food: false }; // the goal's own steps run with Food off (it is on by default); checkFillFood has it on
  const [free, noMelds, tier, plain, gcd, gcdMin] = await Promise.all([
    fill(crit),
    fill({ ...crit, melds: false }),
    fill({ ...crit, tb: 'det' }),
    fill({ ...crit, tb: 'det', byTier: false }),
    fill({ ...crit, tb: 'det', gcd: 2.4 }),
    fill({ ...crit, tb: 'det', gcd: 2.4, gcdMode: 'min' }),
  ]);
  const { all, searched } = await coreGear('SGE', DIALOG_SYNC, 'crit');
  // each switch must change the answer, or the step could not tell that it is wired
  const moves = [
    ['Materia', free.totals.crit, noMelds.totals.crit],
    ['Spare points to tiebreaks', tier.totals.det, plain.totals.det],
    ['Target GCD', tier.totals.sps, gcd.totals.sps],
  ];
  let usable = gcd.status === 'ok' && gcdMin.status === 'ok';
  for (const [name, a, b] of moves) {
    usable = check(a !== b, `${name} does not change the answer for Sage at level 100; pick another case`) && usable;
  }
  if (!usable) {
    return;
  }

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-goal')).toHaveCount(1); // no Auto-fill settings saved yet: the goal line shows the defaults' goal
  await pg.click('#sh-settings');

  // 1. the defaults: Mind first, Materia on, Food on, spare points on but disabled with no tiebreak, any GCD, every
  // expansion, the default boxes, the equip level at the cap, and the line saying how many pieces are searched
  await expect(pg.locator('#s-count')).toHaveText(searchLine(searched, all));
  await expectDialog(pg, { 's-target': 'mind', 's-tb1': '', 's-tb2': '', 's-gcd': '', 's-lvl': '100', 's-min': '', 's-max': '' });
  await expectDialog(pg, { 's-melds': true, 's-food': true, 's-by-tier': true });
  await expect(pg.locator('#s-by-tier')).toBeDisabled();
  await expect(pg.locator('#s-gcd')).toBeEnabled();
  await expect(pg.locator(MODE_CHECKED)).toHaveValue('exact');
  await expect(pg.locator('#s-exp')).toHaveText('All expansions');
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length}`);
  const boxes = await ticked(pg, 's');
  check(same(boxes, DEFAULT_BOXES), `Gear categories boxes in the Auto-fill settings: ${JSON.stringify(boxes)}`);
  await pg.screenshot({ path: shot('fill-settings.png') });

  // 2. Maximize: saved, and the Target GCD range under its label
  await pickOption(pg, '#s-target', 'crit');
  await expectSavedFill(pg, DIALOG_SHEET, 'Maximize Critical Hit', f => f.goal.target === 'crit');
  await pg.locator('#s-food').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'Food off', f => f.goal.food === false);
  await expect(pg.locator('label[for="s-gcd"] .sr-only')).toHaveNumber('2.50'); // the range starts at the base GCD
  const onLabel = (await pg.locator('label[for="s-gcd"] .sr-only').textContent()).trim();
  await checkFilled(pg, 'Maximize Critical Hit', free, async () => {
    await expect(pg.locator('#sh-goal .gtxt')).toHaveText('CRT');
  });
  await expect(pg.locator('#sh-goal .gtxt')).toHaveText('CRT'); // at rest again

  // 3. Materia off, then on again
  await openFillSettings(pg);
  await pg.locator('#s-melds').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'Materia off', f => f.goal.melds === false);
  await checkFilled(pg, 'Materia off', noMelds);
  await openFillSettings(pg);
  await pg.locator('#s-melds').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'Materia on', f => f.goal.melds === true);

  // 4. Tiebreak 1: a stat holds one rank (the goal's is not offered again, and a goal set to a tiebreak's stat swaps them);
  // Spare points to tiebreaks is usable once there is a tiebreak, and it changes the answer
  check(!(await selectOptions(pg, '#s-tb1')).some(option => option.value === 'crit'), "Tiebreak 1 offers the goal's own stat");
  await pickOption(pg, '#s-tb1', 'det');
  await expect(pg.locator('#s-by-tier')).toBeEnabled();
  await expectSavedFill(pg, DIALOG_SHEET, 'Tiebreak 1 Determination', f => f.goal.tb === 'det');
  await checkFilled(pg, 'Determination as Tiebreak 1, spare points on', tier);
  await openFillSettings(pg);
  await pg.locator('#s-by-tier').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'spare points off', f => f.goal.byTier === false);
  await checkFilled(pg, 'Determination as Tiebreak 1, spare points off', plain);
  await openFillSettings(pg);
  await pg.locator('#s-by-tier').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'spare points on', f => f.goal.byTier === true);
  await pg.click('#sh-settings-dialog .shelp');
  // the note's right edge is on the ? button's and inside the dialog (B17)
  await expect(pg.locator('#s-rank-pop')).toBeVisible();
  await poll('the Spare points note right edge on the ? button, inside the dialog', async () => {
    const edges = await pg.evaluate(() => {
      const right = selector => document.querySelector(selector).getBoundingClientRect().right;
      return { note: right('#s-rank-pop'), button: right('#sh-settings-dialog .shelp'), dialog: right('#sh-settings-dialog') };
    });
    return { ok: Math.abs(edges.note - edges.button) <= 1 && edges.note <= edges.dialog, got: edges };
  });
  await pg.click('#sh-settings-dialog .shelp');
  await expect(pg.locator('#s-rank-pop')).toBeHidden();
  await pickOption(pg, '#s-target', 'det');
  await expectDialog(pg, { 's-target': 'det', 's-tb1': 'crit' });
  // a pick that moves another rank says so, as the prototype does
  await expect(pg.locator('#s-rank-note')).toContainText('Critical Hit');
  await pickOption(pg, '#s-target', 'crit');
  await expectDialog(pg, { 's-target': 'crit', 's-tb1': 'det' });
  await expect(pg.locator('#s-rank-note')).toContainText('Determination');

  // 5. Target GCD: the box commits a number, exactly is marked, the goal line names it; a GCD one cannot have goes to the
  // slowest base GCD; with speed as the goal the box is off
  await setNumber(pg, '#s-gcd', '2.40');
  await expect(pg.locator('#s-rank-note')).toBeHidden(); // any other edit clears the swap note
  await expectSavedFill(pg, DIALOG_SHEET, 'Target GCD 2.40', f => Number(f.goal.gcd) === 2.4 && f.goal.gcdMode === 'exact');
  await expect(pg.locator('#sh-goal')).toContainText('CRT › DET, GCD 2.40');
  await checkFilled(pg, 'Target GCD 2.40', gcd, () => expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(gcd.gcd));
  await openFillSettings(pg);
  await pg.locator('#sh-settings-dialog .seg label:has(input[value="min"])').click();
  await expect(pg.locator(MODE_CHECKED)).toHaveValue('min');
  await expectSavedFill(pg, DIALOG_SHEET, 'GCD or faster', f => f.goal.gcdMode === 'min');
  await expect(pg.locator('#sh-goal')).toContainText('2.40');
  await checkFilled(pg, 'Target GCD 2.40 or faster', gcdMin, () =>
    expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(gcdMin.gcd),
  );
  await openFillSettings(pg);
  await setNumber(pg, '#s-gcd', '3.00');
  await expect(pg.locator('#s-gcd')).toHaveValue('2.5');
  await expectSavedFill(pg, DIALOG_SHEET, 'GCD held to 2.5', f => Number(f.goal.gcd) === 2.5);
  await setNumber(pg, '#s-gcd', '2.40');
  await pickOption(pg, '#s-target', 'sps');
  await expect(pg.locator('#s-gcd')).toBeDisabled();
  await expect(pg.locator('label[for="s-gcd"] .sr-only')).not.toHaveText(onLabel); // off, the label no longer gives the range
  await pickOption(pg, '#s-target', 'crit');
  await expect(pg.locator('#s-gcd')).toBeEnabled();
  await setNumber(pg, '#s-gcd', '');
  await expectSavedFill(pg, DIALOG_SHEET, 'any GCD', f => f.goal.gcd === '');

  // 6. a waiting result has no gear on the bar, so the settings cannot change under it (the component's own drop of a result
  // on a settings change is tested in ui/components/set-page/auto-fill-settings)
  await runFill(pg);
  await expect(pg.locator('#sh-settings')).toHaveCount(0);
  await pg.click('#sh-discard');
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();

  // 7. the settings kept across a reload, and the goal line with them
  await pickOption(pg, '#s-tb2', 'dh');
  await pg.locator('#s-by-tier').uncheck();
  await pg.locator('#s-melds').uncheck();
  await setNumber(pg, '#s-gcd', '2.40');
  await pg.locator('#sh-settings-dialog .seg label:has(input[value="exact"])').click();
  await pg.locator('#s-food').check();
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'the whole goal',
    f => f.goal.tb2 === 'dh' && !f.goal.byTier && !f.goal.melds && f.goal.food && Number(f.goal.gcd) === 2.4 && f.goal.gcdMode === 'exact',
  );
  await reloadAtSheets(pg);
  await waitReady(pg);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-goal')).toContainText('CRT › DET › DHT, GCD 2.40');
  await pg.click('#sh-settings');
  await expectDialog(pg, { 's-target': 'crit', 's-tb1': 'det', 's-tb2': 'dh', 's-gcd': '2.4' });
  await expectDialog(pg, { 's-melds': false, 's-food': true, 's-by-tier': false });
  await expect(pg.locator(MODE_CHECKED)).toHaveValue('exact');
  await checkNoBadText(pg, 'the Auto-fill settings');
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
}
