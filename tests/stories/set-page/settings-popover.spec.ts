/* Stories of <gsa-settings-popover>: the popover is not modal (a name and no aria-modal, no trap, still open when the focus goes
   to the next control), the menus inside it are its child layers (Escape closes the child only, then the popover), and the gear,
   the X, Escape and a press outside close it with the focus where each should leave it. In three engines. */
import { RANK_NOTE_ID } from '../../../src/ui/elements/set-page/rank-note.ts';
import { expect, test } from '../fixtures.ts';
import { GEAR_ID, POPOVER_ID, type Default } from './settings-popover.story.ts';
import { expectForcedColoursLook, tapOutside } from '../look.ts';

const STORY = 'set-page/settings-popover/Default';
const CLOSE_X = `#${POPOVER_ID} [data-part="close-trigger"]`;

test.describe('<gsa-settings-popover>', () => {
  test('it stays open when the focus leaves it; the menus inside are child layers; the gear, the X, Escape and a press outside close it', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const gear = page.locator(`#${GEAR_ID}`);
    const popover = page.locator(`#${POPOVER_ID}`);
    const after = page.getByRole('button', { name: 'After' });
    await expect(popover).toBeHidden();

    // opened by the gear: a dialog with a name and no aria-modal; the focus goes to the first select; the gear says it is open
    await gear.click();
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toHaveAttribute('aria-label', 'Auto-fill settings');
    await expect(popover).not.toHaveAttribute('aria-modal', /.*/);
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#s-target')).toBeFocused();

    // the focus leaving it (Tab from its last box) does not close it, and nothing traps the Tab key
    await page.locator('#s-min').focus();
    await page.keyboard.press('Tab');
    await expect(after).toBeFocused();
    await expect(popover).toBeVisible();
    await page.locator('#s-target').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator(CLOSE_X)).toBeFocused();

    // the Expansion menu is a child layer: a press inside it keeps the popover open, and Escape closes the menu only
    await page.locator('#s-exp').click();
    await expect(page.locator('#s-exp-menu')).toBeVisible();
    await page.locator('#s-exp-menu input').first().click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#s-exp-menu')).toBeHidden();
    await expect(page.locator('#s-exp')).toBeFocused();
    await expect(popover).toBeVisible();

    // the note of the "?" is a child layer too
    await page.locator('.shelp').click();
    await expect(page.locator(`#${RANK_NOTE_ID}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(`#${RANK_NOTE_ID}`)).toBeHidden();
    await expect(popover).toBeVisible();

    // Escape with nothing else open closes the popover with the focus on the gear
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(gear).toBeFocused();

    // the X closes it with the focus on the gear; the gear closes it too (the focus stays on the gear where a press focuses a button; the
    // WebKit of the test machine does not focus a pressed button, and Zag's own fix for Safari reads the platform, so it is not asserted)
    await gear.click();
    await expect(popover).toBeVisible();
    await page.locator(CLOSE_X).click();
    await expect(popover).toBeHidden();
    await expect(gear).toBeFocused();
    await gear.click();
    await expect(popover).toBeVisible();
    await gear.click();
    await expect(popover).toBeHidden();

    // a press outside closes it and does not pull the focus back to the gear
    await gear.click();
    await expect(popover).toBeVisible();
    await after.click();
    await expect(popover).toBeHidden();
    await expect(gear).not.toBeFocused();

    // every open and close was reported
    await expect(component.getByTestId('events')).toHaveText('[true,false,true,false,true,false,true,false]');
  });

  test('the open popover sits under the bar inside a 960 px window, a menu in it is not cut by its scroll box, and axe finds nothing', async ({
    mount,
    page,
    axe,
  }) => {
    await page.setViewportSize({ width: 960, height: 500 });
    await mount<typeof Default>(STORY);
    await page.locator(`#${GEAR_ID}`).click();
    await expect(page.locator(`#${POPOVER_ID}`)).toBeVisible();
    await page.locator('#s-exp').click();
    await expect(page.locator('#s-exp-menu')).toBeVisible();
    // Zag shows a popover a frame before it places it
    await expect
      .poll(() =>
        page.locator('#s-exp-menu').evaluate(menu => menu.closest<HTMLElement>('[data-part="positioner"]')?.style.getPropertyValue('--y')),
      )
      .toBeTruthy();
    const place = await page.evaluate(
      ([popoverSelector]) => {
        const boxOf = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`no ${selector} in the story`);
          }
          return element.getBoundingClientRect();
        };
        const bar = boxOf('.tbar');
        const box = boxOf(popoverSelector);
        const menu = boxOf('#s-exp-menu');
        return {
          underBar: Math.round(box.top - bar.bottom),
          leftOnBar: Math.round(box.left - bar.left),
          fitsBar: box.width <= bar.width,
          menuInside: menu.right <= innerWidth && menu.bottom <= innerHeight,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      },
      [`#${POPOVER_ID}`],
    );
    expect(place).toEqual({ underBar: 6, leftOnBar: 0, fitsBar: true, menuInside: true, sideways: false });
    expect(await axe(), 'open').toEqual([]);
  });
});

test.describe('<gsa-settings-popover> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the gear opens the popover, a tap on the X closes it, a tap outside closes it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const popover = page.locator(`#${POPOVER_ID}`);
    await page.locator(`#${GEAR_ID}`).tap();
    await expect(popover).toBeVisible();
    await page.locator(CLOSE_X).tap();
    await expect(popover).toBeHidden();

    await page.locator(`#${GEAR_ID}`).tap();
    await expect(popover).toBeVisible();
    await tapOutside(page);
    await expect(popover).toBeHidden();
  });
});

test.describe('<gsa-settings-popover> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open popover has an edge, and a focused field has a ring', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(`#${GEAR_ID}`).click();
    const popover = page.locator(`#${POPOVER_ID}`);
    await expect(popover).toBeVisible();
    await expectForcedColoursLook(page, { panel: popover, ring: page.locator('#s-min') });
  });
});
