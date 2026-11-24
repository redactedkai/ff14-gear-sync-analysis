// Addresses: every screen has its own, and Back, Forward and reload move between them.

import { UNLOAD_GUARD_OFF_KEY } from '../../../../src/ui/router/unload-guard.js';
import { check, expect, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { waitSaved } from '../../lib/nav.mjs';
import { expectApplyCount, openSageSet, seedSheet } from '../../lib/sheets.mjs';

/** The address (its hash) of the page now. */
const hashOf = pg => pg.evaluate(() => location.hash);

/** Wait for the page's hash to be `expected` (a string, or a RegExp), and check it. */
async function expectHash(pg, expected, what) {
  const isPattern = expected instanceof RegExp;
  await pg.waitForFunction(
    ([want, pattern]) => (pattern ? new RegExp(want).test(location.hash) : location.hash === want),
    [isPattern ? expected.source : expected, isPattern],
  );
  const hash = await hashOf(pg);
  check(isPattern ? expected.test(hash) : hash === expected, `${what}: the address is '${hash}'`);
}

/** Go to the address `hash` the way a typed address does (the page opens its screen without a reload). */
const typeAddress = (pg, hash) =>
  pg.evaluate(address => {
    location.hash = address;
  }, hash);

/** Each screen has an address (the Gear browser and the math views may carry a query: the settings the page holds); Back and Forward move between them; a reload stays on the screen; the math views and the Gear
 * browser are addresses too; an address that names a sheet or gear set that is not saved shows "not found" and keeps its
 * address; an address that names nothing is the Sheets list; the page title names the screen. */
export async function checkRouting(pg) {
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

  // a tab button pushes the tab's address; Back returns to the set page where it was scrolled, then up the screens, and Forward
  // comes down again (the button is clicked from the page: a Playwright click would scroll the tab bar into view first)
  const leftAt = await pg.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  });
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the scroll check below proves nothing`);
  await pg.evaluate(() => document.querySelector('[data-tab=browse]').click());
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await pg.goBack();
  await expectHash(pg, setHash, 'Back from the Gear browser');
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await expect(pg.locator('[data-tab=sheets]')).toHaveAttribute('aria-current', 'page');
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, leftAt);
  await pg.goBack();
  await expectHash(pg, sheetHash, 'Back from the set page');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await pg.goBack();
  await expectHash(pg, '#/sheets', 'Back from the sheet page');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await pg.goForward();
  await expectHash(pg, sheetHash, 'Forward to the sheet page');
  await expect(pg.locator('#sh-sets')).toBeVisible();

  // a reload stays on the screen it was on
  await pg.reload();
  await expectHash(pg, sheetHash, 'a reload on the sheet page');
  await expect(pg.locator('#sh-sets')).toBeVisible();
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

  // the Sheets tab button returns to the screen the tab was left on
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
  await expect(pg.locator('#sh-sets')).toBeVisible();

  // an address that names nothing is the Sheets list
  await typeAddress(pg, '#/nothing/here');
  await expectHash(pg, '#/sheets', 'an address that names nothing');
  await expect(pg.locator('#sh-list')).toBeVisible();
}

/** The browser's Back asks before it leaves a set page that holds a draft (the question the tab buttons ask): Keep editing
 * leaves the page and its address as they were, Discard and leave goes where Back was going. */
export async function checkRoutingGuard(pg) {
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
export async function checkRoutingAfterReload(pg) {
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

/** The reload and close guard: with the dev flag on its off value, a reload with no draft goes through, a reload with a draft
 * raises the browser's beforeunload question (Cancel keeps the page and the draft, Reload drops them), and with the flag
 * off (the smoke default) no question comes. */
export async function checkUnloadGuard(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const questions = [];
  pg.on('dialog', dialog => {
    questions.push(dialog.type());
    // Cancel the first question (the page stays); Reload at the second
    (questions.length === 1 ? dialog.dismiss() : dialog.accept()).catch(() => {});
  });
  const reload = () => pg.evaluate(() => location.reload());
  const settle = () => pg.waitForTimeout(300); // a question, if any, comes within a frame or two of the reload

  // the guard on (the flag at '0': the init script keeps a flag that is set)
  await pg.evaluate(key => localStorage.setItem(key, '0'), UNLOAD_GUARD_OFF_KEY);
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
  await pg.evaluate(key => localStorage.setItem(key, '1'), UNLOAD_GUARD_OFF_KEY);
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
export async function checkAddressSettings(pg) {
  // a link applies its settings; a name the page does not have is dropped from the address
  await typeAddress(pg, '#/gear?job=SGE&il=123&slot=ring&min=700&sort=det&colour=red');
  await expectHash(pg, '#/gear?job=SGE&il=123&slot=ring&min=700&sort=det', 'a link with settings');
  await expect(pg.locator('#b-min')).toHaveValue('700');
  await expect(pg.locator('#b-slot')).toHaveAttribute('aria-label', 'Slot: Ring');

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
  await expect(pg.locator('#b-slot')).toHaveAttribute('aria-label', 'Slot: Any slot');

  // a search text that ends inside an emoji is cut before it, and the page still starts from the address after a reload
  await typeAddress(pg, `#/gear?q=${'x'.repeat(99)}%F0%9F%98%80`);
  await expectHash(pg, `#/gear?q=${'x'.repeat(99)}`, 'a search text cut inside an emoji');
  await pg.reload();
  await expect(pg.locator('#b-q')).toBeVisible();
  await expectHash(pg, `#/gear?q=${'x'.repeat(99)}`, 'a reload after it');

  // text typed just before the player leaves the screen is still there when Back returns
  await typeAddress(pg, '#/gear?max=790');
  await pg.locator('#b-q').fill('Moon');
  await pg.evaluate(() => document.querySelector('[data-tab=math]').click());
  await expectHash(pg, /^#\/math\/piece(\?|$)/, 'to How the math works right after typing');
  await pg.goBack();
  await expect(pg.locator('#b-q')).toHaveValue('Moon');
  await expectHash(pg, '#/gear?q=Moon&max=790', 'Back to the text typed just before leaving');

  // the math views: GCD Scaling's haste and level, and Stat Allocation's piece
  await typeAddress(pg, '#/math/gcd?haste=SAM&gcdlevel=90');
  await expectHash(pg, '#/math/gcd?gcdlevel=90&haste=SAM', 'GCD Scaling');
  await expect(pg.locator('#g-haste')).toHaveValue('SAM');
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
export async function checkScrollOnBack(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const setHash = await hashOf(pg);
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX);
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await pg.evaluate(() => document.querySelector('[data-tab=browse]').click());
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await expect(pg.locator('#b-q')).toBeVisible();
  const startAt = await pg.evaluate(() => window.scrollY);

  // record the scroll position on every frame, then go Back and wait for the router to place the set page
  await pg.evaluate(() => {
    const frames = [];
    const record = () => {
      frames.push(Math.round(window.scrollY));
      window.gsaScrollFrames.timer = requestAnimationFrame(record);
    };
    window.gsaScrollFrames = { frames, timer: 0 };
    record();
  });
  await pg.goBack();
  await expectHash(pg, setHash, 'Back to the set page');
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  await pg.waitForTimeout(300); // frames after landing: it stays there
  const frames = await pg.evaluate(() => {
    cancelAnimationFrame(window.gsaScrollFrames.timer);
    return window.gsaScrollFrames.frames;
  });
  const strays = [...new Set(frames)].filter(y => Math.abs(y - startAt) > 1 && Math.abs(y - leftAt) > 1);
  check(strays.length === 0, `Back showed the scroll positions ${strays.join(', ')} (left from ${startAt}, back to ${leftAt})`);
}

/** Starts a recorder that notes, after each frame is drawn (a message posted from the frame's callback runs after its layout),
 * where the page is scrolled and whether the element `marker` is drawn (it takes room on the page); kept in window.gsaScrollFrames. */
const startFrameRecorder = (pg, marker) =>
  pg.evaluate(selector => {
    const frames = [];
    const channel = new MessageChannel();
    channel.port1.onmessage = () =>
      frames.push({ y: Math.round(window.scrollY), shown: (document.querySelector(selector)?.getClientRects().length ?? 0) > 0 });
    const state = { frames, stopped: false };
    const tick = () => {
      if (state.stopped) return;
      channel.port2.postMessage(0);
      requestAnimationFrame(tick);
    };
    window.gsaScrollFrames = state;
    tick();
  }, marker);

/** Stops the recorder and returns what it saw, one {y, shown} per frame. */
const stopFrameRecorder = pg =>
  pg.evaluate(() => {
    window.gsaScrollFrames.stopped = true;
    return window.gsaScrollFrames.frames;
  });

/** Back from the Gear browser to a scrolled math view shows no third position: from the frame the browser moves until the router has
 * placed the view, the page is at the position it left or the one it returns to (the browser's own scroll anchoring, which moves the
 * page while the screens are swapped, is off). */
export async function checkScrollOnBackToMath(pg) {
  await pg.setViewportSize({ width: 1280, height: 720 });
  await pg.click('[data-tab=math]');
  await pg.click('[data-sub=gcd]');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX / 2);
  check(leftAt > 50, `the GCD Scaling view cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await pg.waitForTimeout(200); // the scroll event is noted
  await pg.evaluate(() => document.querySelector('[data-tab=browse]').click());
  await expectHash(pg, /^#\/gear(\?|$)/, 'the Gear browser');
  await expect(pg.locator('#b-q')).toBeVisible();
  const startAt = await pg.evaluate(() => window.scrollY);
  await startFrameRecorder(pg, '#tab-gcd');
  await pg.goBack();
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 1, leftAt);
  await pg.waitForTimeout(300); // frames after landing: it stays there
  const frames = (await stopFrameRecorder(pg)).filter(frame => frame.shown);
  const strays = [...new Set(frames.map(frame => frame.y))].filter(y => Math.abs(y - startAt) > 1 && Math.abs(y - leftAt) > 1);
  check(
    frames.length > 0 && strays.length === 0,
    `Back drew GCD Scaling at ${strays.join(', ')} (left from ${startAt}, back to ${leftAt})`,
  );
}

/** A reload on a scrolled screen keeps its place, whether the browser or the router restores it. */
export async function checkScrollOnReload(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const leftAt = await pg.evaluate(y => {
    window.scrollTo(0, y);
    return window.scrollY;
  }, SCROLLED_PX);
  check(leftAt > 100, `the set page cannot be scrolled (${leftAt}), so the check below proves nothing`);
  await pg.waitForTimeout(200); // the scroll event is noted
  await pg.reload();
  await expect(pg.locator('#sh-gear')).toBeVisible();
  await pg.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, leftAt);
}
