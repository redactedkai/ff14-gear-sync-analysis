// A set page: Auto-fill with no Worker, and over every real piece a healer can wear.

import { coreGear, coreRecipe } from '../../lib/core.mjs';
import { check, checkNoBadText, expect } from '../../lib/expect.mjs';
import { FILL_SHEET } from '../../lib/fixtures.mjs';
import { afterFrames, runFill } from '../../lib/nav.mjs';
import { checkTotals } from '../../lib/shared-checks.mjs';
import { openSet, seedSheet } from '../../lib/sheets.mjs';
import { pickOption } from '../../lib/select.mjs';

/** A set page's Auto-fill when its worker cannot run (ui/solver.js workerSolver's fallback, main.js): the search runs on the
 * page's thread with the core's numbers and its result can be applied; the Gear to search line and a changed goal are
 * answered too (a settings change searches again); Cancel right after Auto-fill drops the search; the next Auto-fill works; and no
 * worker is left running. The group's page errors are the runner's. */
export async function checkWorkerFallback(pg) {
  const sync = { cap: 123, sync: true, level: 50 };
  const [mind, crit] = await Promise.all([coreRecipe('SGE', sync, {}), coreRecipe('SGE', sync, { target: 'crit' })]);
  await seedSheet(pg, FILL_SHEET);
  await openSet(pg, FILL_SHEET.name, 'Empty');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'the fallback Auto-fill', mind.totals);
  // the next Auto-fill works too: on the applied set it finds nothing to change
  await runFill(pg);
  await expect(pg.locator('#sh-apply')).toBeDisabled(); // nothing to change
  await pg.click('#sh-discard');
  await checkTotals(pg, 'after Discard', mind.totals);

  // a settings change searches again: the Gear to search line is answered, and Auto-fill gives the new goal's set
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count[data-state="ready"]')).toBeVisible(); // the count has landed
  await pickOption(pg, '#s-target', 'crit');
  await runFill(pg);
  await checkTotals(pg, 'the fallback Auto-fill for another goal', crit.totals);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);

  // Cancel at once (both clicks in one task, before the search's frames): the search is dropped, the set stays
  const runs = await pg.evaluate("performance.getEntriesByName('fill').length");
  await pg.evaluate(async () => {
    document.querySelector('#sh-fill').click();
    await Promise.resolve(); // Alpine draws Cancel in a microtask
    document.querySelector('#sh-cancel').click();
  });
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await expect(pg.locator('#sh-toast')).toBeVisible();
  await afterFrames(pg); // a search Cancel failed to drop would have run by now
  const finished = (await pg.evaluate("performance.getEntriesByName('fill').length")) - runs;
  check(finished === 0, `a search cancelled before it started still ran (${finished})`);
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'after the cancelled Auto-fill', crit.totals);
  await runFill(pg);
  await expect(pg.locator('#sh-apply')).toBeDisabled(); // nothing to change
  await pg.click('#sh-discard');
  check(pg.workers().length === 0, `${pg.workers().length} workers running after the fallback, not 0`);
  await pg.click('[data-tab=browse]');
}

/* A Sage sheet at the shared setup (level 50, synced to 123) with one set whose rows are all empty and unpinned, at its
   Auto-fill settings' defaults (Mind first, melds on, food on). */

/** A set page's Auto-fill on every piece a Sage can wear, at the shared setup's level and cap, with the Auto-fill settings'
 * defaults: the set it suggests, applied, has the Mind the core finds for the same gear in Node (Total row: gear plus
 * the character's base). */
export async function checkFillRealGear(pg) {
  const want = await coreGear('SGE', { cap: 123, sync: true, level: 50 }, 'mind');
  await seedSheet(pg, FILL_SHEET);
  await openSet(pg, FILL_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-fill')).toContainText('Auto-fill ');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(pg.locator('#sh-total td[data-col="mind"]')).toHaveText(want.on.toLocaleString('en-US'));
  await checkNoBadText(pg, 'a filled set');
  await pg.click('[data-tab=browse]');
}

// ---------- checks: the Auto-fill settings dialog (the gear icon on a set page) ----------

/* The Auto-fill settings checks run on a Sage sheet at level 100 with item level sync off, where Critical Hit is a goal that
   materia, spare points, a Target GCD, food, crafted gear and the filters under Gear to search all change. */
