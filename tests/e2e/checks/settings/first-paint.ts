// First paint.

import { STORE_KEY } from '../../lib/constants.ts';
import { check, expect, same } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { waitReady, waitSaved } from '../../lib/nav.ts';
import { openSageSet } from '../../lib/sheets.ts';

const FIRST_PAINT_PROBE = () => {
  const frames = [];
  window.__firstPaint = frames;
  const shown = el => Boolean(el) && el.getClientRects().length > 0;
  const record = () => {
    if (document.body) {
      frames.push({
        page: shown(document.querySelector('.wrap')),
        panel: shown(document.querySelector('section[aria-label="Job and sync settings"]')),
        job: document.getElementById('job-name')?.textContent ?? '',
        tabs: ['sheets', 'browse', 'math'].filter(tab => shown(document.getElementById(`tab-${tab}`))),
      });
    }
    if (frames.length < 600) {
      requestAnimationFrame(record);
    }
  };
  requestAnimationFrame(record);
};

/** The page never paints half-built (owner's report: the empty Job and sync panel and the tab bar with no tab showed for
 * about 100 ms before the Sheets tab): from the first frame the page shows at all, the open tab's panel shows, and the
 * Job and sync panel shows only on the Gear browser. Checked with the CPU slowed 4 times (the window was wider
 * there), on a fresh page (the Sheets tab), with the Gear browser and How the math works open by their addresses, and on
 * a reload from a set page (which opens the same set page). */
export async function checkFirstPaint(pg) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await pg.addInitScript(FIRST_PAINT_PROBE);
  const load = async (where, saved, hash) => {
    await pg.evaluate(
      ([key, state, address]) => {
        localStorage.clear();
        if (state) {
          localStorage.setItem(key, JSON.stringify(state));
        }
        history.replaceState(null, '', address); // the address names the open tab
      },
      [STORE_KEY, saved, hash],
    );
    await pg.reload();
    await waitReady(pg);
    await checkPaints(pg, where);
  };
  await load('a fresh page', null, '#/sheets');
  await load('the Gear browser open', { browse: { job: 'SGE', sync: true, cap: 123, level: 50 } }, '#/gear');
  await load('How the math works open', { piece: { job: 'WHM', sync: false, cap: null, level: 100 } }, '#/math/piece');
  await load('How the math works open with no job', {}, '#/math/piece');
  // a set page open: a reload opens the same set page
  await pg.evaluate(
    ([key, sheet]) => {
      localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet));
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [sheet.id] }));
    },
    [STORE_KEY, SET_SHEET],
  );
  await pg.reload();
  await waitReady(pg);
  await openSageSet(pg);
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await pg.reload();
  await waitReady(pg);
  await checkPaints(pg, 'a reload from a set page');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
}

/** Check the frames FIRST_PAINT_PROBE recorded since the last load: the page settled with the Job and sync panel only
 * on the Gear browser, and every frame that showed the page showed it as it settled. */
async function checkPaints(pg, where) {
  await pg.waitForFunction(() => window.__firstPaint?.length >= 30); // a few frames after the page is ready
  const tab = await pg.locator('[data-tab][aria-current="page"]').getAttribute('data-tab');
  const frames = await pg.evaluate(() => window.__firstPaint);
  const settled = frames.at(-1);
  check(
    settled.page && settled.panel === (tab === 'browse'),
    `first paint, ${where}: the page settled as ${JSON.stringify(settled)} on the ${tab} tab`,
  );
  // every frame that shows the page shows it as it settled
  const bad = frames.findIndex(f => f.page && !same(f, settled));
  check(
    bad < 0,
    `first paint, ${where}: frame ${bad} of ${frames.length} shows ${JSON.stringify(frames[bad])}, then ${JSON.stringify(settled)}`,
  );
}
