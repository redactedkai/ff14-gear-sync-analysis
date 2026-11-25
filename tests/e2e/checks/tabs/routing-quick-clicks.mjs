// Back to a screen scrolled lands where the screen was left, however soon after the scroll or after a move through history the
// player acted: real wheel input, the player acting as soon as the page shows the new position (its scroll event comes a frame
// later), and the same under a slower CPU (a page slow to draw widens every window in which a scroll has not been reported).
// A scroll made by the page's own script is not reported to it until the next frame, whatever the speed: a Back made at once
// after it is the sharpest case of that window (a wheel scroll is hidden from the page until it commits, which no player can
// act inside, so the wheel paths wait for the page to show the position first).
//
// The screen scrolled is the Sheets list, and the player acts on a link that is on screen both before and after the scroll:
// a Playwright click would scroll an off-screen link into view first (the page would then really be somewhere else), and a
// click on a link that is on screen is the one the player can make.

import { check, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { afterFrames } from '../../lib/nav.mjs';
import { seedSheets } from '../../lib/sheets.mjs';

/** How many times each path is run in each configuration: a loss that happened 1 run in 15 shows up here. */
const ROUNDS = 20;

/** The CPU slow-down factors the paths run at (Chrome DevTools Protocol `Emulation.setCPUThrottlingRate`). */
const CPU_RATES = [1, 4];

/** The window sizes the paths run in. */
const WINDOWS = [
  { width: 1280, height: 800 },
  { width: 960, height: 700 },
];

/** How many frames the page is watched after it has landed (more than the router tries a scroll for), counted in frames so a slow
 * machine is watched for as many. */
const STAY_FRAMES = 35;

/** How far the wheel scrolls the list (px): deep enough to tell from the top, short enough that links on screen at the top are
 * still on screen after it. */
const WHEEL_PX = 300;

/** How many sheets fill the list so that it scrolls: copies of one sheet. */
const SHEET_COUNT = 24;

/** The room kept between a link and the edges of the window when one is chosen to act on (px). */
const EDGE_PX = 60;

/** Resolves after `count` frames of the page have been drawn. */
const framesPass = (pg, count) =>
  pg.evaluate(
    total =>
      new Promise(done => {
        let left = total;
        const frame = () => (--left > 0 ? requestAnimationFrame(frame) : done());
        requestAnimationFrame(frame);
      }),
    count,
  );

/** Runs `body()` with the page's CPU slowed `rate` times (1: not slowed), and puts it back to normal after. */
async function atCpuRate(pg, rate, body) {
  const session = await pg.context().newCDPSession(pg);
  try {
    await session.send('Emulation.setCPUThrottlingRate', { rate });
    return await body();
  } finally {
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await session.detach().catch(() => {});
  }
}

/** Opens the Sheets list from its top, as a new history entry after the Gear browser's (so a Back from it stays in the page). */
async function listAtTop(pg) {
  await pg.evaluate(() => document.querySelector('[data-tab=browse]').click());
  await expect(pg.locator('#b-q')).toBeVisible();
  await pg.evaluate(() => document.querySelector('[data-tab=sheets]').click());
  await expect(pg.locator('#sh-list')).toBeVisible();
  await pg.evaluate(() => window.scrollTo(0, 0));
  await framesPass(pg, STAY_FRAMES);
}

/** The index (in the list's sheet links) of one that is on screen at the top of the page and also after a scroll of WHEEL_PX. */
const linkOnScreenBeforeAndAfter = (pg, wheelPx) =>
  pg.evaluate(
    ([distance, edge]) => {
      const links = [...document.querySelectorAll('#sh-list a.sname')];
      return links.findIndex(link => {
        const { top, bottom } = link.getBoundingClientRect();
        return top - distance > edge && bottom < innerHeight - edge;
      });
    },
    [wheelPx, EDGE_PX],
  );

/** Scrolls the list from its top with the wheel (real input) and returns the link to act on, as soon as the page shows a scroll
 * (`scrolledAtLeast`, px: 1 when the position is not yet known; the scroll event of that scroll has not come yet). */
async function wheelList(pg, scrolledAtLeast = 1) {
  const link = await linkOnScreenBeforeAndAfter(pg, WHEEL_PX);
  check(link >= 0, 'no sheet link is on screen both before and after the scroll, so the check proves nothing');
  const { width, height } = pg.viewportSize();
  await pg.mouse.move(width / 2, height / 2);
  await pg.mouse.wheel(0, WHEEL_PX);
  await pg.waitForFunction(least => window.scrollY >= least, scrolledAtLeast);
  return link;
}

/** Acts on the link `link` of the list from the page itself, with no wait after the wheel. */
const openLink = (pg, link) => pg.evaluate(index => document.querySelectorAll('#sh-list a.sname')[index].click(), link);

/** Where the wheel puts the list in this window: scrolled, and settled. */
async function calibrate(pg) {
  await listAtTop(pg);
  await wheelList(pg);
  await framesPass(pg, STAY_FRAMES);
  const wheeled = await pg.evaluate(() => window.scrollY);
  const reach = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(wheeled > 100 && wheeled < reach, `the wheel put the list at ${wheeled} of ${reach}, so the check proves nothing`);
  return wheeled;
}

/** Waits until the page has stayed at `want` for STAY_FRAMES frames, and returns where it is after that. */
async function settledScroll(pg, want) {
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, want, { timeout: 5000 }).catch(() => {});
  await framesPass(pg, STAY_FRAMES);
  return pg.evaluate(() => window.scrollY);
}

/** Runs `path(pg, want)` ROUNDS times at each CPU rate in each window; `path` returns where the page landed. Returns the runs that
 * did not land on the position the wheel gave, as text. */
async function runsThatMissed(pg, path) {
  const missed = [];
  for (const size of WINDOWS) {
    await pg.setViewportSize(size);
    const want = await calibrate(pg);
    for (const rate of CPU_RATES) {
      await atCpuRate(pg, rate, async () => {
        for (let round = 1; round <= ROUNDS; round++) {
          await listAtTop(pg);
          const got = await path(pg, want);
          if (Math.abs(got - want) > 1) {
            missed.push(`${size.width}x${size.height} at ${rate}x CPU, run ${round}: wanted ${want}, landed at ${got}`);
          }
        }
      });
    }
  }
  return missed;
}

/** Seeds a sheet list long enough to scroll. */
async function seedLongList(pg) {
  const sheets = Array.from({ length: SHEET_COUNT }, (_, number) => ({ ...SET_SHEET, id: `s_long_${number}`, name: `Sheet ${number}` }));
  await seedSheets(pg, sheets);
  await afterFrames(pg);
}

/** The Sheets list scrolled with the wheel, a sheet opened at once, then Back: the list is where it was scrolled to, in every run.
 * Two window sizes (1280 x 800 and 960 x 700) at normal speed and at 4x slower CPU. */
export async function checkBackAfterQuickClick(pg) {
  await seedLongList(pg);
  const missed = await runsThatMissed(pg, async (page, want) => {
    const link = await wheelList(page, want - 1);
    await openLink(page, link);
    await expect(page.locator('#sh-sets')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#sh-list')).toBeVisible();
    return settledScroll(page, want);
  });
  check(
    missed.length === 0,
    `Back after a quick click lost the scroll position in ${missed.length} runs: ${missed.slice(0, 5).join('; ')}`,
  );
}

/** The path the Gear browser's loss was first seen on, on the Sheets list: the list scrolled with the wheel, Back, Forward, a sheet
 * opened, Back: the list is where it was scrolled to, in every run, at normal speed and at 4x slower CPU. */
export async function checkBackAfterBackAndForward(pg) {
  await seedLongList(pg);
  const missed = await runsThatMissed(pg, async (page, want) => {
    const link = await wheelList(page, want - 1);
    await page.goBack(); // the wheel's scroll may not have been reported to the page yet
    await page.goForward();
    await expect(page.locator('#sh-list')).toBeVisible();
    await settledScroll(page, want); // the Forward has put the list back
    await openLink(page, link);
    await expect(page.locator('#sh-sets')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#sh-list')).toBeVisible();
    return settledScroll(page, want);
  });
  check(
    missed.length === 0,
    `Back after Back, Forward and a click lost the scroll position in ${missed.length} runs: ${missed.slice(0, 5).join('; ')}`,
  );
}

/** The list scrolled by the page's own script and Back made in the same task, then Forward: the list is where it was scrolled to,
 * in every run. The page hears of a script's scroll a frame later (its scroll event), so only the position the page reads as the
 * browser moves can keep it. */
export async function checkBackAfterScriptScroll(pg) {
  await seedLongList(pg);
  const missed = await runsThatMissed(pg, async (page, want) => {
    await page.evaluate(y => {
      window.scrollTo(0, y);
      history.back();
    }, want);
    await expect(page.locator('#b-q')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#sh-list')).toBeVisible();
    return settledScroll(page, want);
  });
  check(
    missed.length === 0,
    `Back made at once after a scroll lost the scroll position in ${missed.length} runs: ${missed.slice(0, 5).join('; ')}`,
  );
}
