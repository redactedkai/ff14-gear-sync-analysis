// Across the tabs: every tab for each job at 960 px.

import { JOBS, NARROW, HAS_OFFHAND, shot } from '../../lib/constants.ts';
import { DEFAULT_EXCLUDE } from '../../lib/core-worker.ts';
import { coreGear, coreKeys } from '../../lib/core.ts';
import { check, checkNoBadText, expect } from '../../lib/expect.ts';
import { FILL_SHEET } from '../../lib/fixtures.ts';
import { hasHScroll, runFill, setJob, showMath, showTab } from '../../lib/nav.ts';
import { checkSyncCaps, checkTotals } from '../../lib/shared-checks.ts';
import { expectMealEmpty, openSet, seedSheet } from '../../lib/sheets.ts';

/* The level caps of the jobs that stop below 100 (CLAUDE.md: BLU 80, BST 50); every other walked job has 100. */
const JOB_LEVEL_CAP = { BST: 50, BLU: 80 };

/** A saved sheet for `job` at the shared setup (level 50, synced to 123) with one empty set whose Auto-fill settings ask for
 * food: Maximize the main stat, spare points to tiebreaks off (the gear first, then the meal: the cheap search), every box
 * at its default, the equip level at the job's cap. */
const walkSheet = (job, mainKey) => ({
  ...FILL_SHEET,
  id: `s_walk_${job}`,
  name: `Walk ${job}`,
  job,
  sets: [
    {
      ...FILL_SHEET.sets[0],
      fillSettings: {
        goal: { target: mainKey, tb: '', tb2: '', gcd: '', gcdMode: 'exact', byTier: false, melds: true, food: true },
        searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: JOB_LEVEL_CAP[job] ?? 100 },
      },
    },
  ],
});

/** A set page for one walked job, from the shared setup's level and cap: the rows its weapon kind has (jobs with a shield have
 * an off-hand row), the special substat's column only for a job that has one, the Gear to search line counting the
 * pieces the core searches, an Auto-fill with food whose main stat is the core's (a meal has no main stat), a meal on the Food
 * row, the Defense row, no bad text and no sideways scroll at 960 px. The last job takes the screenshot. */
async function checkWalkSet(pg, job) {
  const sync = { cap: 123, sync: true, level: 50 };
  const keys = await coreKeys(job);
  const { on } = await coreGear(job, sync, keys.main);
  await seedSheet(pg, walkSheet(job, keys.main));
  await openSet(pg, `Walk ${job}`, 'Empty');
  const rows = await pg.locator('#sh-gear tr[data-row]').count();
  check(rows === (HAS_OFFHAND.has(job) ? 12 : 11), `${job}: ${rows} rows in the set's table`);
  await expect(pg.locator('#sh-gear thead th[data-col="piety"], #sh-gear thead th[data-col="ten"]')).toHaveCount(keys.spec ? 1 : 0);
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, `${job} Auto-fill with food`, { [keys.main]: on });
  await expectMealEmpty(pg, false); // the fill chose a meal
  // the two defense figures, each with its damage reduction: a number, then a percent, twice
  await expect(pg.locator('#sh-defense td.defense')).toHaveText(/\d[\d,]*\D+−\d+%\D+\d[\d,]*\D+−\d+%/);
  await checkNoBadText(pg, `${job}/set page`);
  check(!(await hasHScroll(pg)), `${job}: the set page scrolls sideways at ${NARROW.width} px`);
  if (job === JOBS.at(-1)) {
    await pg.screenshot({ path: shot('narrow-set.png'), fullPage: true });
  }
  await pg.click('[data-tab=browse]');
}

/** Every tab for one job: no undefined/NaN/null text, correct sync caps, page fits NARROW width, and a set page of the job
 * (checkWalkSet). One step per job; the last job takes the screenshots. */
export const walkJob = job => async pg => {
  await pg.setViewportSize(NARROW);
  await setJob(pg, job);
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-count')).not.toHaveText('');
  await checkNoBadText(pg, `${job}/browse`);
  await showMath(pg, 'piece');
  await expect(pg.locator('#p-bars .num').first()).toBeVisible();
  await checkNoBadText(pg, `${job}/math:piece`);
  await checkSyncCaps(pg, job);
  await showMath(pg, 'gcd');
  await expect(pg.locator('#g-chart svg')).toBeVisible();
  await expect(pg.locator('#g-table tbody tr')).toHaveCount(13);
  await checkNoBadText(pg, `${job}/math:gcd`);
  await showMath(pg, 'tiers');
  await setJob(pg, job); // Substat tiers has its own job
  await expect(pg.locator('#t-table .lrow.cur').first()).toBeVisible();
  await checkNoBadText(pg, `${job}/math:tiers`);
  check(!(await hasHScroll(pg)), `${job}: horizontal page scroll at ${NARROW.width} px`);
  if (job === JOBS.at(-1)) {
    await pg.screenshot({ path: shot('narrow.png'), fullPage: true });
  }
  await checkWalkSet(pg, job);
};
