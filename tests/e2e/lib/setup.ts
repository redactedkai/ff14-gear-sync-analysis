// The shared setup every group but the fresh ones starts from.

import { expect } from './expect.ts';
import { readPanel, setCap, setJob, setNumber } from './nav.ts';

export const SHARED_SETUP = { job: 'SGE', sync: true, cap: '123', level: '50' };

/** Set the page to SHARED_SETUP, on the Gear browser (the page opens on the Sheets tab, which has no panel). */
export async function setUpShared(pg) {
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('[data-tab=browse]')).toHaveAttribute('aria-current', 'page');
  await setJob(pg, SHARED_SETUP.job);
  await setCap(pg, SHARED_SETUP.cap);
  await setNumber(pg, '#level', SHARED_SETUP.level);
}

/** The settings that differ from SHARED_SETUP, as "field now (setup)" texts; empty when none does. */
export async function sharedSetupChanges(pg) {
  const now = await readPanel(pg);
  return Object.keys(SHARED_SETUP)
    .filter(k => now[k] !== SHARED_SETUP[k])
    .map(k => `${k} ${now[k]} (${SHARED_SETUP[k]})`);
}
