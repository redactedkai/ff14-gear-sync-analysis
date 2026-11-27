// Addresses: every screen has its own, and Back, Forward and reload move between them.

import { ANY_SLOT_LABEL, slotButtonName } from '../../../../src/ui/elements/gear-browser/slot-menu-names.ts';
import { SCROLL_KEY } from '../../../../src/ui/router/scroll-storage.ts';
import { UNLOAD_GUARD_OFF_KEY } from '../../../../src/ui/router/unload-guard.ts';
import { messageOf } from '../../../../src/core/guards.ts';
import { STORE_KEY } from '../../lib/constants.ts';
import { check, expect, poll } from '../../lib/expect.ts';
import { SET_SHEET } from '../../lib/fixtures.ts';
import { afterFrames, clickTabFromPage, framesPass, waitSaved } from '../../lib/nav.ts';
import { expectSelectValue } from '../../lib/select.ts';
import { expectApplyCount, openSageSet, seedSheet, seedSheets } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** One frame the recorder noted: where the page was scrolled (px) and whether the marker element was drawn. */
interface ScrollFrame {
  y: number;
  shown: boolean;
}

/** The address (its hash) of the page now. */
const hashOf = (pg: Page) => pg.evaluate(() => location.hash);

/** How many frames a scroll position is watched after the page has landed on it: more than the router tries the scroll for
 * (MAX_SCROLL_FRAMES in focus.ts, 30), counted in frames and not in ms, so a busy machine, which draws fewer frames a second, is
 * watched for as many. */
const STAY_FRAMES = 35;

/** How much taller the window is made in the scroll check that shortens a screen below its saved position (px). */
const TALLER_WINDOW_PX = 200;

/** Wait for the page's hash to be `expected` (a string, or a RegExp), and check it. */
async function expectHash(pg: Page, expected: string | RegExp, what: string) {
  const isPattern = expected instanceof RegExp;
  await pg.waitForFunction(([want, pattern]) => (pattern ? new RegExp(want).test(location.hash) : location.hash === want), [
    isPattern ? expected.source : expected,
    isPattern,
  ] as const);
  const hash = await hashOf(pg);
  check(isPattern ? expected.test(hash) : hash === expected, `${what}: the address is '${hash}'`);
}

/** Go to the address `hash` the way a typed address does (the page opens its screen without a reload). */
const typeAddress = (pg: Page, hash: string) =>
  pg.evaluate(address => {
    location.hash = address;
  }, hash);

/** The sheet page (its list of gear sets) is shown. When it is not, the failure names what the page held: the address, the saved
 * sheets' keys, the screen state and the page's last actions, since the "not found" screen that took its place on a CI runner left
 * nothing else to go on. `where` says which move it follows. */
async function expectSheetPageShown(pg: Page, where: string) {
  try {
    await expect(pg.locator('#sh-sets')).toBeVisible();
  } catch (e) {
    const held = await pg
      .evaluate(storeKey => {
        const { sheets, log } = window.gsaDebug;
        return {
          hash: location.hash,
          saved: Object.keys(localStorage).filter(key => key.startsWith(storeKey)),
          screen: sheets.screen,
          missing: sheets.missing,
          actions: log.slice(-8),
        };
      }, STORE_KEY)
      .catch(error => String(error.message ?? error));
    throw new Error(`${messageOf(e)} (${where}; the page held ${JSON.stringify(held)})`);
  }
}

/** Each screen has an address (the Gear browser and the math views may carry a query: the settings the page holds); Back and Forward move between them; a reload stays on the screen; the math views and the Gear
 * browser are addresses too; an address that names a sheet or gear set that is not saved shows "not found" and keeps its
 * address; an address that names nothing is the Sheets list; the page title names the screen. */
export async function checkRouting(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await expectHash(pg, '#/sheets', 'the Sheets list');
  const listTitle = await pg.title();

  // a set page: its own address and title
  await openSageSet(pg);
  await expectHash(pg, /^#\/sheets\/[^/]+\/sets\/[^/]+$/, 'the set page');
  const setHash = await hashOf(pg);
  const sheetHash = setHash.replace(/\/sets\/.*$/, '');
  // the links of the breadcrumb are the addresses of their screens, so Open in new tab and Copy link give the screen
  const crumbs = pg.locator('nav.setcrumb:visible a');
  await expect(crumbs.nth(0)).toHaveAttribute('href', '#/sheets');
  await expect(crumbs.nth(1)).toHaveAttribute('href', sheetHash);
  const setTitle = await pg.title();
  check(setTitle !== listTitle && setTitle.includes('Mine') && setTitle.includes(SET_SHEET.name), `the set page's title is '${setTitle}'`);

  // a tab link pushes the tab's address; Back returns to the set page where it was scrolled, then up the screens, and Forward
  // comes down again (the button is clicked from the page: a Playwright click would scroll the tab bar into view first)
  const leftAt = await pg.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  });
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the scroll check below proves nothing`);
  await clickTabFromPage(pg, 'browse');
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await pg.goBack();
  await expectHash(pg, setHash, 'Back from the Gear browser');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expect(pg.locator('[data-tab=sheets]')).toHaveAttribute('aria-current', 'page');
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, leftAt);
  await pg.goBack();
  await expectHash(pg, sheetHash, 'Back from the set page');
  await expectSheetPageShown(pg, 'Back from the set page');
  await pg.goBack();
  await expectHash(pg, '#/sheets', 'Back from the sheet page');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await pg.goForward();
  await expectHash(pg, sheetHash, 'Forward to the sheet page');
  await expectSheetPageShown(pg, 'Forward to the sheet page');

  // a reload stays on the screen it was on
  await pg.reload();
  await expectHash(pg, sheetHash, 'a reload on the sheet page');
  await expectSheetPageShown(pg, 'a reload on the sheet page');
  await expect(pg.locator('#sh-list')).toBeHidden();

  // the math views have addresses, and Back goes between them
  await pg.click('[data-tab=math]');
  await expectHash(pg, /^#\/math\/piece(\?|$)/, 'How the math works');
  await pg.click('[data-sub=gcd]');
  await expectHash(pg, /^#\/math\/gcd(\?|$)/, 'the GCD view');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  await pg.goBack();
  await expectHash(pg, /^#\/math\/piece(\?|$)/, 'Back to the piece view');
  await expect(pg.locator('[data-sub=piece]')).toHaveAttribute('aria-current', 'page');

  // the Sheets tab link returns to the screen the tab was left on
  await pg.click('[data-tab=sheets]');
  await expectHash(pg, sheetHash, 'the Sheets tab returns to its last screen');
  await typeAddress(pg, '#/sheets');
  await expect(pg.locator('#sh-list')).toBeVisible();

  // a sheet or gear set that is not saved: its own screen, the address kept through a reload, the way up works
  await typeAddress(pg, '#/sheets/s_not_saved');
  await expect(pg.locator('#sh-missing')).toBeVisible();
  await expectHash(pg, '#/sheets/s_not_saved', 'a sheet that is not saved');
  check((await pg.title()) !== listTitle, 'the not found title names the screen');
  await pg.reload();
  await expect(pg.locator('#sh-missing')).toBeVisible();
  await pg.click('#sh-missing-go');
  await expectHash(pg, '#/sheets', 'up from a sheet that is not saved');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await typeAddress(pg, `${sheetHash}/sets/g_not_saved`);
  await expect(pg.locator('#sh-missing')).toBeVisible();
  await pg.click('#sh-missing-go');
  await expectHash(pg, sheetHash, 'up from a gear set that is not saved');
  await expectSheetPageShown(pg, 'up from a gear set that is not saved');

  // an address that names nothing is the Sheets list
  await typeAddress(pg, '#/nothing/here');
  await expectHash(pg, '#/sheets', 'an address that names nothing');
  await expect(pg.locator('#sh-list')).toBeVisible();
}

/** The browser's Back asks before it leaves a set page that holds a draft (the question the tab links ask): Keep editing
 * leaves the page and its address as they were, Discard and leave goes where Back was going. */
export async function checkRoutingGuard(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const setHash = await hashOf(pg);
  const sheetHash = setHash.replace(/\/sets\/.*$/, '');
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await pg.goBack();
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await expectHash(pg, setHash, 'Back with a draft');
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expectApplyCount(pg, 1);
  await expectHash(pg, setHash, 'Keep editing');
  await pg.goBack();
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-discard');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await expectHash(pg, sheetHash, 'Discard and leave');
  await pg.goForward();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expectHash(pg, setHash, 'Forward to the set page again');
  await expect(pg.locator('#sh-apply')).toHaveCount(0); // the draft was discarded
}

/** The leave guard after the page was loaded again (the entries before the reload keep their place in history) and after a
 * typed address: Back and Keep editing leave the page and its address as they were, a typed address that is refused leaves no
 * duplicate entry, so the next Back is a Back. */
export async function checkRoutingAfterReload(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const setHash = await hashOf(pg);
  const sheetHash = setHash.replace(/\/sets\/.*$/, '');
  await pg.reload();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await pg.goBack();
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expectHash(pg, setHash, 'Back and Keep editing after a reload');

  await typeAddress(pg, '#/gear?job=WAR');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expectHash(pg, setHash, 'a typed address and Keep editing');
  await pg.goBack();
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-discard');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await expectHash(pg, sheetHash, 'the next Back after a refused typed address');
}

/** The reload and close guard, with the dev flag at 0 (the guard is on): a reload with no draft goes through, a reload with a
 * draft raises the browser's beforeunload question (Cancel keeps the page and the draft, Reload drops them); with the flag at 1
 * (the guard is off, the smoke default) no question comes. */
export async function checkUnloadGuard(pg: Page) {
  // TODO: this step fails in Firefox at "Reload: the draft is gone": after Cancel, an accepted second question does not reload the
  // page there, as on a plain page with its own beforeunload listener (WebKit reloads). It goes when Playwright's Firefox does.
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const questions: string[] = [];
  pg.on('dialog', dialog => {
    questions.push(dialog.type());
    // Cancel the first question (the page stays); Reload at the second
    (questions.length === 1 ? dialog.dismiss() : dialog.accept()).catch(() => {});
  });
  const reload = () => pg.evaluate(() => location.reload());
  const settle = () => pg.waitForTimeout(300); // a question, if any, comes within a frame or two of the reload

  // the guard on (the flag at '0': the init script keeps a flag that is set)
  await pg.evaluate((key: string) => localStorage.setItem(key, '0'), UNLOAD_GUARD_OFF_KEY);
  await reload(); // nothing held: no question
  await expect(pg.locator('#sh-gear')).toBeVisible();
  check(questions.length === 0, `no question with nothing held: ${questions}`);

  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await reload();
  await poll('the first question', async () => ({ ok: questions.length === 1, got: questions.length }));
  check(questions[0] === 'beforeunload', `the question is the browser's beforeunload: ${questions[0]}`);
  await settle();
  await expectApplyCount(pg, 1); // Cancel: the draft is still there

  await reload();
  await poll('the second question', async () => ({ ok: questions.length === 2, got: questions.length }));
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expect(pg.locator('#sh-apply')).toHaveCount(0); // Reload: the draft is gone

  // the flag off: a draft is reloaded with no question
  await pg.evaluate((key: string) => localStorage.setItem(key, '1'), UNLOAD_GUARD_OFF_KEY);
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expectApplyCount(pg, 1);
  await reload();
  await settle();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  check(questions.length === 2, `no question with the flag off: ${questions}`);
}

/** The settings an address names (the Gear browser's filters and the math views' fields): a link applies them and the page
 * saves them at once; a bare address keeps what is saved; the address follows a change of a setting without adding a history
 * entry, and takes the search text once typing pauses; a link with a query leaves what it does not name at the default. The
 * tab's job and item level sync are in the address too. */
export async function checkAddressSettings(pg: Page) {
  // a link applies its settings; a name the page does not have is dropped from the address
  await typeAddress(pg, '#/gear?job=SGE&il=123&slot=ring&min=700&sort=det&colour=red');
  await expectHash(pg, '#/gear?job=SGE&il=123&slot=ring&min=700&sort=det', 'a link with settings');
  await expect(pg.locator('#b-min')).toHaveValue('700');
  await expect(pg.locator('#b-slot')).toHaveAttribute('aria-label', slotButtonName('Ring'));

  // saved at once: a bare address after a reload shows them, and stays bare
  await waitSaved(
    pg,
    "s => s.job === 'SGE' && s.sync === true && s.cap === 123 && s.browse.type === 'ring' && s.browse.min === 700 && s.browse.sort === 'det'",
  );
  await pg.evaluate(() => history.replaceState(null, '', '#/gear'));
  await pg.reload();
  await expect(pg.locator('#b-min')).toHaveValue('700');
  await expectHash(pg, '#/gear', 'a bare address keeps the saved settings');

  // a change of a setting writes the address and adds no history entry
  const entries = await pg.evaluate(() => history.length);
  await pg.locator('#b-min').fill('750');
  await pg.locator('#b-min').press('Enter');
  await expectHash(pg, '#/gear?job=SGE&il=123&slot=ring&min=750&sort=det', 'a changed filter');
  check((await pg.evaluate(() => history.length)) === entries, 'a changed filter adds a history entry');

  // the search text is written once typing pauses
  await pg.locator('#b-q').fill('Moon');
  await expectHash(pg, '#/gear?job=SGE&il=123&q=Moon&slot=ring&min=750&sort=det', 'the search text');
  check((await pg.evaluate(() => history.length)) === entries, 'the search text adds a history entry');

  // a link with a query names the whole view: what it leaves out is the default, not what the reader had
  await typeAddress(pg, '#/gear?max=790');
  await expectHash(pg, '#/gear?max=790', 'a link that names one setting');
  await expect(pg.locator('#b-min')).toHaveValue('');
  await expect(pg.locator('#b-q')).toHaveValue('');
  await expect(pg.locator('#b-slot')).toHaveAttribute('aria-label', slotButtonName(ANY_SLOT_LABEL));

  // a search text that ends inside an emoji is cut before it, and the page still starts from the address after a reload
  await typeAddress(pg, `#/gear?q=${'x'.repeat(99)}%F0%9F%98%80`);
  await expectHash(pg, `#/gear?q=${'x'.repeat(99)}`, 'a search text cut inside an emoji');
  await pg.reload();
  await expect(pg.locator('#b-q')).toBeVisible();
  await expectHash(pg, `#/gear?q=${'x'.repeat(99)}`, 'a reload after it');

  // text typed just before the player leaves the screen is still there when Back returns
  await typeAddress(pg, '#/gear?max=790');
  await pg.locator('#b-q').fill('Moon');
  await clickTabFromPage(pg, 'math');
  await expectHash(pg, /^#\/math\/piece(\?|$)/, 'to How the math works right after typing');
  await pg.goBack();
  await expect(pg.locator('#b-q')).toHaveValue('Moon');
  await expectHash(pg, '#/gear?q=Moon&max=790', 'Back to the text typed just before leaving');

  // the math views: GCD Scaling's haste and level, and Stat Allocation's piece
  await typeAddress(pg, '#/math/gcd?haste=SAM&gcdlevel=90');
  await expectHash(pg, '#/math/gcd?gcdlevel=90&haste=SAM', 'GCD Scaling');
  await expectSelectValue(pg, '#g-haste', 'SAM');
  await typeAddress(pg, '#/math/tiers?job=WAR&tierlevel=70');
  await expectHash(pg, '#/math/tiers?job=WAR&tierlevel=70', 'Substat tiers');
  await waitSaved(pg, "s => s.tiers.job === 'WAR'");
  await typeAddress(pg, '#/math/piece?job=DRK&slot=ear&item=710&subs=det&meld=1');
  await expectHash(pg, '#/math/piece?job=DRK&slot=ear&item=710&subs=det&meld=1', 'Stat Allocation');
  await waitSaved(
    pg,
    "s => s.job === 'DRK' && s.piece.slot === 'ear' && s.piece.ilvl === 710 && s.piece.subs.join() === 'det,' && s.piece.slots === 1",
  );
}

/** How far the set page is scrolled in the scroll checks below (px): well past the browser's own clamp on a shorter screen. */
const SCROLLED_PX = 400;

/** Back to a scrolled screen shows no position in between: from the frame the browser moves until the router has placed the
 * screen, the page is at the position it left or the one it returns to, never a third (the browser's own restore, clamped to
 * the shorter screen still on show, used to flash there). */
export async function checkScrollOnBack(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const setHash = await hashOf(pg);
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX);
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await clickTabFromPage(pg, 'browse');
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await expect(pg.locator('#b-q')).toBeVisible();
  const startAt = await pg.evaluate(() => window.scrollY);

  // record the scroll position on every frame, then go Back and wait for the router to place the set page
  await pg.evaluate(() => {
    const frames: number[] = [];
    const recorder = { frames, timer: 0 };
    const record = () => {
      frames.push(Math.round(window.scrollY));
      recorder.timer = requestAnimationFrame(record);
    };
    window.gsaScrollFrames = recorder;
    record();
  });
  await pg.goBack();
  await expectHash(pg, setHash, 'Back to the set page');
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  await framesPass(pg, STAY_FRAMES); // it stays there
  const frames = await pg.evaluate(() => {
    if (!window.gsaScrollFrames) {
      throw new Error('the scroll recorder was never started');
    }
    cancelAnimationFrame(window.gsaScrollFrames.timer);
    return window.gsaScrollFrames.frames;
  });
  const strays = [...new Set(frames)].filter(y => Math.abs(y - startAt) > 1 && Math.abs(y - leftAt) > 1);
  check(strays.length === 0, `Back showed the scroll positions ${strays.join(', ')} (left from ${startAt}, back to ${leftAt})`);
}

/** A sheet with five sets (so its page is long enough to scroll). */
const FIVE_SETS_SHEET = {
  ...SET_SHEET,
  id: 's_five',
  name: 'Five sets',
  sets: [1, 2, 3, 4, 5].map(number => ({ ...SET_SHEET.sets[0], id: `g_five_${number}`, name: `Set ${number}` })),
};

/** Starts a recorder that notes, after each frame is drawn (a message posted from the frame's callback runs after its layout),
 * where the page is scrolled and whether the element `marker` is drawn (it takes room on the page); kept in window.gsaFrameRecorder. */
const startFrameRecorder = (pg: Page, marker: string) =>
  pg.evaluate((selector: string) => {
    const frames: ScrollFrame[] = [];
    const channel = new MessageChannel();
    channel.port1.onmessage = () =>
      frames.push({ y: Math.round(window.scrollY), shown: (document.querySelector(selector)?.getClientRects().length ?? 0) > 0 });
    const state = { frames, stopped: false };
    const tick = () => {
      if (state.stopped) {
        return;
      }
      channel.port2.postMessage(0);
      requestAnimationFrame(tick);
    };
    window.gsaFrameRecorder = state;
    tick();
  }, marker);

/** Stops the recorder and returns what it saw, one {y, shown} per frame. */
const stopFrameRecorder = (pg: Page) =>
  pg.evaluate(() => {
    if (!window.gsaFrameRecorder) {
      throw new Error('the frame recorder was never started');
    }
    window.gsaFrameRecorder.stopped = true;
    return window.gsaFrameRecorder.frames;
  });

/** Forward to a screen that was left scrolled shows it at that position from its first frame: no frame of the new screen is
 * drawn at the top first (a screen still being built is shorter than the position, which the browser clamps to the top). */
export async function checkScrollOnForward(pg: Page) {
  await seedSheet(pg, FIVE_SETS_SHEET);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: FIVE_SETS_SHEET.name }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await pg.locator('#sh-sets a.sname', { hasText: 'Set 4' }).click();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX);
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await afterFrames(pg); // the scroll event is noted
  await pg.goBack();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await framesPass(pg, STAY_FRAMES);

  await startFrameRecorder(pg, '#sh-gear');
  await pg.goForward();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  await framesPass(pg, STAY_FRAMES); // it stays there
  const frames = (await stopFrameRecorder(pg)).filter((frame: ScrollFrame) => frame.shown);
  const strays = [...new Set(frames.map((frame: ScrollFrame) => frame.y))].filter(y => Math.abs(y - leftAt) > 1);
  check(
    frames.length > 0 && strays.length === 0,
    `Forward drew the set page at ${strays.join(', ')} before ${leftAt} (${frames.length} frames)`,
  );
}

/** Back from the Gear browser to a scrolled math view shows no third position: from the frame the browser moves until the router has
 * placed the view, the page is at the position it left or the one it returns to (the browser's own scroll anchoring, which moves the
 * page while the screens are swapped, is off). */
export async function checkScrollOnBackToMath(pg: Page) {
  await pg.setViewportSize({ width: 1280, height: 720 });
  await pg.click('[data-tab=math]');
  await pg.click('[data-sub=gcd]');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX / 2);
  check(leftAt > 50, `the GCD Scaling view cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await afterFrames(pg); // the scroll event is noted
  await clickTabFromPage(pg, 'browse');
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await expect(pg.locator('#b-q')).toBeVisible();
  const startAt = await pg.evaluate(() => window.scrollY);
  await startFrameRecorder(pg, '#tab-gcd');
  await pg.goBack();
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  await framesPass(pg, STAY_FRAMES); // it stays there
  const frames = (await stopFrameRecorder(pg)).filter((frame: ScrollFrame) => frame.shown);
  const strays = [...new Set(frames.map((frame: ScrollFrame) => frame.y))].filter(
    y => Math.abs(y - startAt) > 1 && Math.abs(y - leftAt) > 1,
  );
  check(
    frames.length > 0 && strays.length === 0,
    `Back drew GCD Scaling at ${strays.join(', ')} (left from ${startAt}, back to ${leftAt})`,
  );
}

/** A screen that cannot scroll, opened from a scrolled Gear browser, is noted as left at the top: the scroll events that come after
 * the click (the Gear browser's own, a frame late, and the browser holding the position to the shorter page) are not where the new
 * screen was left. Read from what the page keeps of the positions over a reload (written when the page is hidden), as an entry's
 * position is not shown anywhere else; and Forward to the screen draws it at the top from its first frame. */
export async function checkScrollOnForwardToUnscrolled(pg: Page) {
  await pg.setViewportSize({ width: 960, height: 700 });
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#b-q')).toBeVisible();
  await afterFrames(pg);
  const reach = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(reach > 150, `the Gear browser cannot be scrolled (${reach}), so the check below proves nothing`);

  // scrolled, then the Math tab clicked: the click scrolls the tab into view first, and that scroll event comes after the new
  // screen is pushed
  await scrollPageTo(pg, 100);
  await afterFrames(pg); // the scroll event is noted
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#tab-piece')).toBeVisible();
  await framesPass(pg, STAY_FRAMES);
  const mathReach = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(mathReach <= 0, `Stat Allocation can be scrolled (${mathReach}), so the check below proves nothing`);
  const notedAt = await pg.evaluate((key: string) => {
    dispatchEvent(new Event('pagehide')); // the page writes the positions it has noted
    return JSON.parse(sessionStorage.getItem(key) ?? '{}')[history.state.id] ?? 0;
  }, SCROLL_KEY);
  check(notedAt === 0, `Stat Allocation, which cannot scroll, is noted as left at ${notedAt}`);

  await pg.goBack();
  await expect(pg.locator('#b-q')).toBeVisible();
  await framesPass(pg, STAY_FRAMES);
  await startFrameRecorder(pg, '#tab-piece');
  await pg.goForward();
  await expect(pg.locator('#tab-piece')).toBeVisible();
  await framesPass(pg, STAY_FRAMES);
  const frames = await stopFrameRecorder(pg);
  const strays = drawnPositions(frames).filter(y => Math.abs(y) > 1);
  check(
    frames.some((frame: ScrollFrame) => frame.shown) && strays.length === 0,
    `Forward drew Stat Allocation at ${strays.join(', ')} before 0, a position it was never scrolled to`,
  );
}

/** The positions the recorder saw the screen at, in the frames that drew it (see startFrameRecorder). */
const drawnPositions = (frames: ScrollFrame[]) => [...new Set(frames.filter(frame => frame.shown).map(frame => frame.y))];

/** Scrolls the page to `y` as far as it goes, from the page itself (a Playwright wheel or click would scroll on its own); returns
 * where it is. */
const scrollPageTo = (pg: Page, y: number) =>
  pg.evaluate(target => {
    window.scrollTo(0, target);
    return window.scrollY;
  }, y);

/** Clicks the link `selector` (the one with `text`) from the page itself: a Playwright click scrolls the page to the link first. */
const clickFromPage = (pg: Page, selector: string, text: string) =>
  pg.evaluate(
    ([css, wanted]) => {
      const link = [...document.querySelectorAll<HTMLElement>(css)].find(candidate => candidate.textContent?.includes(wanted));
      if (!link) {
        throw new Error(`no ${css} with the text ${wanted}`);
      }
      link.click();
    },
    [selector, text] as const,
  );

/** Back to a screen left at the top, or left scrolled, draws it at that position from its first frame, whichever screen it came
 * from (a set page, the Gear browser); a quick Back, Forward, Back leaves the sheet page at the top. The browser clamps the old
 * position to a screen shorter than it (the page end), and used to draw that for a frame before the router placed the screen. */
export async function checkScrollOnBackToLeftPosition(pg: Page) {
  await pg.setViewportSize({ width: 1000, height: 600 });
  await seedSheet(pg, FIVE_SETS_SHEET);
  await pg.click('[data-tab=sheets]');
  await clickFromPage(pg, '#sh-list a.sname', FIVE_SETS_SHEET.name);
  await expect(pg.locator('#sh-sets')).toBeVisible();
  const sheetHash = await hashOf(pg);
  const sheetEnd = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(sheetEnd > 100, `the sheet page cannot be scrolled (${sheetEnd}), so the check below proves nothing`);

  // a set page scrolled well past the end of the sheet page, then Back to the sheet page, left at the top
  await clickFromPage(pg, '#sh-sets a.sname', 'Set 4');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  const setHash = await hashOf(pg);
  const leftAt = await scrollPageTo(pg, sheetEnd + 400);
  check(leftAt > sheetEnd + 100, `the set page cannot be scrolled past the sheet page's end (${leftAt} of ${sheetEnd})`);
  await afterFrames(pg); // the scroll event is noted
  await startFrameRecorder(pg, '#sh-sets');
  await pg.goBack();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await pg.waitForFunction(() => Math.abs(window.scrollY) <= 1);
  await framesPass(pg, STAY_FRAMES); // it stays there
  let frames = await stopFrameRecorder(pg);
  let strays = drawnPositions(frames).filter(y => Math.abs(y) > 1);
  check(
    frames.some((frame: ScrollFrame) => frame.shown) && strays.length === 0,
    `Back drew the sheet page at ${strays.join(', ')} before 0 (its end is ${sheetEnd})`,
  );

  // a quick Back, Forward, Back: the sheet page is still left at the top
  await pg.goForward();
  await expectHash(pg, setHash, 'Forward to the set page');
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  // each move is made in the task after the browser delivered the one before (a move made while the earlier one is still on its
  // way is counted from where the page still is, so on a busy machine the three would end somewhere else), with no frame between
  await pg.evaluate(
    () =>
      new Promise<void>(done => {
        const later = [() => history.forward(), () => history.back()];
        const onMove = () => {
          const next = later.shift();
          if (next) {
            return setTimeout(next);
          }
          removeEventListener('popstate', onMove);
          done(); // the third move has arrived
        };
        addEventListener('popstate', onMove);
        history.back();
      }),
  );
  await expectHash(pg, sheetHash, 'the quick Back, Forward, Back');
  await framesPass(pg, STAY_FRAMES); // the moves have settled and the router has placed the page
  const quickEnd = await pg.evaluate(() => window.scrollY);
  check(Math.abs(quickEnd) <= 1, `after Back, Forward, Back in quick turn the sheet page is scrolled to ${quickEnd}, not left at 0`);

  // the Gear browser (a tab swapped in after a frame) to the sheet page left scrolled
  const sheetAt = await scrollPageTo(pg, sheetEnd);
  check(sheetAt > 100, `the sheet page cannot be scrolled (${sheetAt})`);
  await afterFrames(pg); // the scroll event is noted
  await clickTabFromPage(pg, 'browse');
  await expect(pg.locator('#b-q')).toBeVisible();
  await scrollPageTo(pg, 100);
  await afterFrames(pg); // the scroll event is noted
  await startFrameRecorder(pg, '#sh-sets');
  await pg.goBack();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, sheetAt);
  await framesPass(pg, STAY_FRAMES);
  frames = await stopFrameRecorder(pg);
  strays = drawnPositions(frames).filter(y => Math.abs(y - sheetAt) > 1);
  check(
    frames.some((frame: ScrollFrame) => frame.shown) && strays.length === 0,
    `Back from the Gear browser drew the sheet page at ${strays.join(', ')} before ${sheetAt}`,
  );

  // the window got taller meanwhile, so the sheet page no longer reaches the position it was left at: it is drawn at its own end
  // from its first frame, not at the old position over blank space (the page is held tall for that position only until the screen
  // shows it does not reach it)
  await clickTabFromPage(pg, 'browse');
  await expect(pg.locator('#b-q')).toBeVisible();
  await pg.setViewportSize({ width: 1000, height: 600 + TALLER_WINDOW_PX });
  await startFrameRecorder(pg, '#sh-sets');
  await pg.goBack();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await framesPass(pg, STAY_FRAMES);
  frames = await stopFrameRecorder(pg);
  const newEnd = await pg.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const heldAt = await pg.evaluate(() => document.documentElement.style.minHeight);
  check(newEnd < sheetAt - TALLER_WINDOW_PX / 2, `the taller window did not shorten the sheet page's reach (${sheetAt} to ${newEnd})`);
  strays = drawnPositions(frames).filter(y => Math.abs(y - newEnd) > 1);
  check(
    frames.some((frame: ScrollFrame) => frame.shown) && strays.length === 0 && heldAt === '',
    `Back to a screen shorter than its saved position drew the sheet page at ${strays.join(', ')} before its end ${newEnd} (height held: '${heldAt}')`,
  );
  await pg.setViewportSize({ width: 1000, height: 900 });
}

/** A reload on a scrolled screen keeps its place, whether the browser or the router restores it. */
export async function checkScrollOnReload(pg: Page) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  // the router does not remember a scroll made while it is still placing the screen it opened (until that screen's first frame): a
  // player cannot scroll in that frame, a script can, and on a runner whose frames come late it did, and a reload then opened at the top
  await afterFrames(pg);
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX);
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await afterFrames(pg); // the scroll event is noted
  await pg.reload();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, leftAt);
}

/** A sheet with twelve sets: its page is tall, so it scrolls deeper than the set pages are drawn at when they first appear. */
const TALL_SHEET = {
  ...FIVE_SETS_SHEET,
  id: 's_tall',
  name: 'Tall sheet',
  sets: Array.from({ length: 12 }, (_, number) => ({ ...SET_SHEET.sets[0], id: `g_tall_${number + 1}`, name: `Set ${number + 1}` })),
};

/** How many other sheets fill the Sheets list in the check below (so the list can scroll): copies of TALL_SHEET. */
const LIST_FILLER_COUNT = 24;

/** A screen opened by a click or by the page's own navigation (a math sub-tab included) starts at the top, whatever depth the screen before it was
 * scrolled to, and no frame draws it at that depth (the browser kept the position when the screens were swapped). The screen left
 * keeps its own position: Back draws it at the depth it was left at, from its first frame. Frames are counted, never timed. */
export async function checkScrollOnOpenedScreen(pg: Page) {
  await pg.setViewportSize({ width: 1000, height: 600 });
  const fillers = Array.from({ length: LIST_FILLER_COUNT }, (_, number) => ({
    ...TALL_SHEET,
    id: `s_filler_${number}`,
    name: `Filler ${number}`,
  }));
  await seedSheets(pg, [TALL_SHEET, ...fillers]);
  const setSelector = '#sh-gear';

  /** Opens `to` from `from` (the screen `fromAddress` names, scrolled to `depth`), and goes Back; `open` clicks from the page. */
  const openFromScrolled = async ({
    what,
    fromAddress,
    fromMarker,
    depth,
    open,
    toMarker,
  }: {
    what: string;
    fromAddress: string;
    fromMarker: string;
    depth: number;
    open: () => Promise<unknown>;
    toMarker: string;
  }) => {
    await typeAddress(pg, fromAddress);
    await expect(pg.locator(fromMarker)).toBeVisible();
    await framesPass(pg, STAY_FRAMES);
    const leftAt = await scrollPageTo(pg, depth);
    check(leftAt > 100, `${what}: the screen left cannot be scrolled (${leftAt}), so the check proves nothing`);
    await afterFrames(pg); // the scroll event is noted

    // opened: from its first frame the new screen is at the top
    await startFrameRecorder(pg, toMarker);
    await open();
    await expect(pg.locator(toMarker)).toBeVisible();
    await framesPass(pg, STAY_FRAMES);
    let frames = await stopFrameRecorder(pg);
    let strays = drawnPositions(frames).filter(y => Math.abs(y) > 1);
    check(
      frames.some((frame: ScrollFrame) => frame.shown) && strays.length === 0,
      `${what}: the new screen was drawn at ${strays.join(', ')} before the top (the screen left was at ${leftAt})`,
    );

    // Back: the screen left is drawn at the depth it was left at, from its first frame
    await startFrameRecorder(pg, fromMarker);
    await pg.goBack();
    await expect(pg.locator(fromMarker)).toBeVisible();
    await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
    await framesPass(pg, STAY_FRAMES);
    frames = await stopFrameRecorder(pg);
    strays = drawnPositions(frames).filter(y => Math.abs(y - leftAt) > 1);
    check(strays.length === 0, `${what}: Back drew the screen left at ${strays.join(', ')} before ${leftAt}`);
  };

  const listHeight = await pg.evaluate(() => document.documentElement.scrollHeight);
  check(listHeight > 1200, `the Sheets list is too short to scroll (${listHeight}), so the checks below prove nothing`);
  await openFromScrolled({
    what: 'a sheet opened from the scrolled list',
    fromAddress: '#/sheets',
    fromMarker: '#sh-list',
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '#sh-list a.sname', TALL_SHEET.name),
    toMarker: '#sh-sets',
  });
  await openFromScrolled({
    what: 'a gear set opened from the scrolled sheet page',
    fromAddress: `#/sheets/${TALL_SHEET.id}`,
    fromMarker: '#sh-sets',
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '#sh-sets a.sname', 'Set 4'),
    toMarker: setSelector,
  });
  await openFromScrolled({
    what: 'the sheet page opened from the breadcrumb of the scrolled set page',
    fromAddress: `#/sheets/${TALL_SHEET.id}/sets/${TALL_SHEET.sets[3].id}`,
    fromMarker: setSelector,
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '.setcrumb a', TALL_SHEET.name),
    toMarker: '#sh-sets',
  });
  await openFromScrolled({
    what: 'the Gear browser opened from the scrolled sheet page',
    fromAddress: `#/sheets/${TALL_SHEET.id}`,
    fromMarker: '#sh-sets',
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '[data-tab]', 'Gear browser'),
    toMarker: '#b-q',
  });
  await openFromScrolled({
    what: 'the Sheets tab, which reopens its sheet page, opened from the scrolled Gear browser',
    fromAddress: '#/gear',
    fromMarker: '#b-q',
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '[data-tab]', 'Sheets'),
    toMarker: '#sh-sets',
  });
  // a math sub-tab is a screen too: it starts at the top. A short window makes Stat Allocation scroll.
  await pg.setViewportSize({ width: 960, height: 420 });
  await openFromScrolled({
    what: 'the Substat tiers sub-tab opened from the scrolled Stat Allocation',
    fromAddress: '#/math/piece',
    fromMarker: '#p-slot',
    depth: SCROLLED_PX,
    open: () => clickFromPage(pg, '[data-sub]', 'Substat tiers'),
    toMarker: '#t-level',
  });
}
