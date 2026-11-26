// The Auto-fill settings dialog: Gear to search, the empty-slot note and Cancel.

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
import { ACTIVITY_KEYS } from '../../lib/constants.mjs';
import { DEFAULT_EXCLUDE } from '../../lib/core-worker.mjs';
import { coreFiltered, coreGear, coreRecipe } from '../../lib/core.mjs';
import { check, checkNoBadText, expect, poll, same } from '../../lib/expect.mjs';
import { checkFromField } from '../gear-browser/gear-from.mjs';
import { SLOW_FILL_SHEET } from '../../lib/fixtures.mjs';
import { checkFromMenu, runFill, setFrom, setNumber, ticked, waitReady } from '../../lib/nav.mjs';
import { checkTotals } from '../../lib/shared-checks.mjs';
import { openSet, seedSheet } from '../../lib/sheets.mjs';
import { pickOption } from '../../lib/select.mjs';

/** An Auto-fill that leaves a slot empty because no piece of it has an equip level within the Auto-fill settings' Gear to search says
 * why under the bar: Sage has no weapon below level 60 (the lowest equip level in the item data), so an Auto-fill up to equip
 * level 50 leaves the weapon empty and says so; the default (the job's cap) does not. */
export async function checkEmptySlotNote(pg) {
  const low = { ...DIALOG_SHEET, id: 's_low_level', name: 'Level 50 sheet', level: 50 };
  // the set's Auto-fill settings with Gear to search up to equip level 50 (the rest is read as the defaults)
  low.sets = low.sets.map(set => ({ ...set, fillSettings: { searchCriteria: { lvl: 50 } } }));
  await seedSheet(pg, low);
  await openSet(pg, low.name, 'Empty');
  await runFill(pg);
  await expect(pg.locator('#sh-empty-note')).toHaveTextParts(['Weapon', 'Sage', 50, 60]);
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-empty-note')).toBeHidden();
  await pg.click('[data-tab=browse]');
}

/** Gear to search in the Auto-fill settings: the Expansion, Item level, Equip level and Gear categories boxes and the market board
 * switch each change the line "searching N of M pieces" and the answer by what the core finds for the same filters; a
 * filter nothing passes turns the Auto-fill button off with a title; they are saved, kept across a reload, and not shared with the Gear browser's own
 * boxes. */
export async function checkFillSearch(pg) {
  const filter = { expOff: ['ARR', 'HW', 'SB', 'ShB'], ilvlMax: 700 };
  const full = await coreGear('SGE', DIALOG_SYNC, 'crit');
  const noMarket = await coreGear('SGE', DIALOG_SYNC, 'crit', ['crafted'], DEFAULT_EXCLUDE, false);
  const filtered = await coreFiltered('SGE', DIALOG_SYNC, 'crit', filter);
  const low = await coreFiltered('SGE', DIALOG_SYNC, 'crit', { lvlMax: 50 });
  const noCrafted = await coreGear('SGE', DIALOG_SYNC, 'crit', [], ['crafted', ...DEFAULT_EXCLUDE], false);
  const crafted = noMarket.searched - noCrafted.searched;
  const usable = [
    check(filtered.on < full.on, 'the Expansion and item level filters do not lower Critical Hit; pick another case'),
    check(noMarket.without < noMarket.on, 'leaving crafted gear out does not lower Critical Hit; pick another case'),
    check(crafted > 0 && low.searched < full.searched, 'a box or the equip level leaves no piece out; pick another case'),
  ].every(Boolean);
  if (!usable) {
    return;
  }
  const line = result => searchLine(result.searched, result.all);

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await pickOption(pg, '#s-target', 'crit');
  await pg.locator('#s-food').uncheck(); // Food is on by default; coreGear and coreFiltered answer for the gear alone
  await expect(pg.locator('#s-count')).toHaveText(line(full));

  // 1. Expansion and Item level: the count and the answer follow the browser's own filters; the menu closes by its button
  await pg.click('#s-exp');
  for (const box of await pg.locator('#s-exp-menu input').all()) {
    if (filter.expOff.includes(await box.getAttribute('data-exp'))) {
      await box.uncheck();
    }
  }
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveNumber(2);
  await setNumber(pg, '#s-max', String(filter.ilvlMax));
  await expect(pg.locator('#s-count')).toHaveText(line(filtered));
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'two expansions, item level 700',
    f => same(f.searchCriteria.expOff, filter.expOff) && Number(f.searchCriteria.max) === filter.ilvlMax,
  );
  await checkFilled(pg, 'Expansion and item level filters', { totals: { crit: filtered.on } });

  // 2. a filter nothing passes: no pieces, and the Auto-fill button is off and says why
  await openFillSettings(pg);
  await setNumber(pg, '#s-min', '9999');
  await expect(pg.locator('#s-count')).toHaveText(searchLine(0, full.all));
  await expect(pg.locator('#sh-fill')).toBeDisabled();
  await expect(pg.locator('#sh-fill')).toHaveAttribute('title', 'No piece matches Gear to search.');
  // the chip after the gear button says why, in gold, and the spoken line carries the sentence
  await expect(pg.locator('#sh-no-pieces')).toHaveText('No pieces to search');
  await expect(pg.locator('#sh-no-pieces')).toHaveAttribute('title', 'No piece matches Gear to search.');
  await expect(pg.locator('#sh-no-pieces-note')).toHaveText('No piece matches Gear to search.');
  await setNumber(pg, '#s-min', '');
  await setNumber(pg, '#s-max', '');
  await pg.click('#s-exp');
  for (const box of await pg.locator('#s-exp-menu input').all()) {
    await box.check();
  }
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveText('All expansions');
  await expect(pg.locator('#s-count')).toHaveText(line(full));
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  check(!(await pg.getAttribute('#sh-fill', 'title')), 'the Auto-fill button keeps its no-pieces title with pieces in the pool');
  await expect(pg.locator('#sh-no-pieces')).toHaveCount(0);
  await expect(pg.locator('#sh-no-pieces-note')).toHaveText('');

  // 3. Equip level: held to the job's level cap, and a lower one leaves out the pieces above it
  await setNumber(pg, '#s-lvl', '101');
  await expect(pg.locator('#s-lvl')).toHaveValue('100');
  await setNumber(pg, '#s-lvl', '50');
  await expect(pg.locator('#s-count')).toHaveText(line(low));
  await expectSavedFill(pg, DIALOG_SHEET, 'equip level 50', f => Number(f.searchCriteria.lvl) === 50);
  await setNumber(pg, '#s-lvl', '100');
  await expect(pg.locator('#s-count')).toHaveText(line(full));
  // Item level: held to the highest real item level, as Equip level is to the level cap
  await setNumber(pg, '#s-max', '999');
  await expect(pg.locator('#s-max')).toHaveValue('795');
  await setNumber(pg, '#s-min', '999');
  await expect(pg.locator('#s-min')).toHaveValue('795');
  await setNumber(pg, '#s-min', '');
  await setNumber(pg, '#s-max', '');

  // 4. Gear categories: the menu (tabs, the boxes' texts, inside the window; checkFromMenu), the market board
  // switch and Crafted left out, each with the count and the answer the core finds
  await checkFromMenu(pg, 's', '#s-goal-h');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible(); // the dialog stays open under Escape and the outside click
  await checkFromField(pg, 's'); // the closed field's count and market board glyph at 960 and 1280 px
  await setFrom(pg, 's', 'market', false);
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length}`);
  await expect(pg.locator('#s-count')).toHaveText(line(noMarket));
  await setFrom(pg, 's', 'crafted', false);
  await expect(pg.locator('#s-count')).toHaveText(line(noCrafted));
  const leftOut = ACTIVITY_KEYS.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k));
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'no market board, no crafted',
    f => f.searchCriteria.market === false && same(f.searchCriteria.exclude, leftOut),
  );
  await checkFilled(pg, 'no market board, no crafted gear', { totals: { crit: noMarket.without } });

  // 5. the choice is the set's own: the Gear browser's boxes stay at the defaults, and a reload keeps the set's
  await openFillSettings(pg);
  await pg.click('#s-exp');
  await pg.locator('#s-exp-menu input[data-exp="ARR"]').uncheck();
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveNumber(5);
  const withoutArr = await pg.locator('#s-count').innerText();
  await setNumber(pg, '#s-max', '700');
  await expect(pg.locator('#s-count')).not.toHaveText(withoutArr);
  const shownLine = await pg.locator('#s-count').innerText();
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
  check(same(await ticked(pg, 'b'), DEFAULT_BOXES), "the Gear browser's boxes followed the Auto-fill settings");
  await expect(pg.locator('#b-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length}`);
  await expect(pg.locator('#b-exp')).toHaveText('All expansions');
  await pg.reload();
  await waitReady(pg);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count')).toHaveText(shownLine);
  await expect(pg.locator('#s-exp')).toHaveNumber(5);
  await expectDialog(pg, { 's-max': '700', 's-min': '', 's-lvl': '100' });
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length - 1} of ${ACTIVITY_KEYS.length}`);
  check(!(await ticked(pg, 's')).includes('crafted'), 'Crafted came back after a reload');
  await checkNoBadText(pg, 'the Auto-fill settings (Gear to search)');
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
}

/* A Warrior sheet (level 100, no sync) whose set's Auto-fill is as heavy as the data makes it: every "Gear categories" box ticked
   (the most pieces), Determination > Critical Hit > Direct Hit, a Target GCD of 2.30, food and tier ranking. */

const CANCEL_SHEET = {
  ...SLOW_FILL_SHEET,
  id: 's_cancel',
  name: 'Cancel fill',
  sets: [
    {
      ...SLOW_FILL_SHEET.sets[0],
      fillSettings: {
        goal: SLOW_FILL_SHEET.sets[0].fillSettings.goal,
        searchCriteria: { ...SLOW_FILL_SHEET.sets[0].fillSettings.searchCriteria, exclude: [] },
      },
    },
  ],
};

/** Cancel stops a running Auto-fill (ui/solver.ts workerSolver cancel): the worker holding the search is ended, the result never
 * lands, the set is left as it was, one solver worker remains, and the next Auto-fill is answered by the new worker with the
 * numbers the core finds. Auto-fill and Cancel are clicked in one task, so no reply can arrive between them whatever the
 * machine's speed (a worker answers in a later task); the data (every box under Gear categories, three goal stats, a Target GCD,
 * food) keeps the worker busy when it is ended, but nothing here depends on how long a search takes. */
export async function checkFillCancel(pg) {
  const quick = { target: 'det', tb: '', tb2: '', food: false, gcd: '', exclude: [] };
  const want = await coreRecipe('WAR', { cap: null, sync: false, level: 100 }, quick);
  await seedSheet(pg, CANCEL_SHEET);
  await openSet(pg, CANCEL_SHEET.name, 'Empty');
  // the worker has the job's gear once the Gear to search line shows
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count[data-state="ready"]')).toBeVisible(); // the count has landed
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toBeHidden();
  let closed = 0;
  const watch = w => w.on('close', () => closed++);
  pg.workers().forEach(watch);
  pg.on('worker', watch);

  // Auto-fill and Cancel in one task (the set page draws Cancel in a microtask)
  const runs = await pg.evaluate("performance.getEntriesByName('fill').length");
  await pg.evaluate(async () => {
    document.querySelector('#sh-fill').click();
    await Promise.resolve();
    document.querySelector('#sh-cancel').click();
  });
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await poll('Cancel to end the searching worker', () => ({ ok: closed === 1, got: `${closed} workers ended` }));
  check(pg.workers().length === 1, `${pg.workers().length} solver workers after Cancel, not 1`);
  const finished = (await pg.evaluate("performance.getEntriesByName('fill').length")) - runs;
  check(finished === 0, `a cancelled Auto-fill still answered (${finished})`);
  await expect(pg.locator('#sh-total td.small')).toHaveNumber(11); // every slot empty: the set is as it was

  // the next Auto-fill, a light one, is answered by the new worker with the core's numbers
  await pg.click('#sh-settings');
  await pickOption(pg, '#s-tb1', '');
  await pickOption(pg, '#s-tb2', '');
  await pg.locator('#s-food').uncheck();
  await setNumber(pg, '#s-gcd', '');
  await runFill(pg);
  await checkTotals(pg, 'the Auto-fill after Cancel', want.totals);
  check(pg.workers().length === 1, `${pg.workers().length} solver workers after the next Auto-fill, not 1`);
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}
