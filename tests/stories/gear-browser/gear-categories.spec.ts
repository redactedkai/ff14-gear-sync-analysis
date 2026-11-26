/* Stories of <gsa-gear-categories>: the keyboard model of its tabs (the WAI-ARIA tabs pattern: the arrows, Home and End move and
   select, wrapping; only the selected tab is in the Tab order), the way out of the menu (Escape gives the focus back to the button
   and keeps the tab; Tab closes it) and the menu's place in a 960 px row, in three engines. The page's smoke test covers the rest
   of the menu (texts, counts, All / None / Default) in Chromium. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './gear-categories.story.js';
import { layerArmed, layerPlaced } from '../layers.ts';
import { expectForcedColoursLook, expectLookApart, partShows, settled, tapOutside } from '../look.ts';

const STORY = 'gear-browser/gear-categories/Default';
const MENU = '#b-from-menu';
const TAB_IDS = ['b-from-tab-everyday', 'b-from-tab-side-content', 'b-from-tab-hard-content'];

test.describe('<gsa-gear-categories>', () => {
  test('the arrows, Home and End move between the tabs and select them; Tab goes from the selected tab into its boxes', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#b-from').click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator(`#${TAB_IDS[0]}`).focus();
    const focusedId = () => page.evaluate(() => document.activeElement?.id);
    for (const [key, expected] of [
      ['ArrowRight', 1],
      ['ArrowRight', 2],
      ['ArrowRight', 0],
      ['ArrowLeft', 2],
      ['Home', 0],
      ['End', 2],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.locator(`#${TAB_IDS[expected]}`)).toHaveAttribute('aria-selected', 'true');
      expect(await focusedId(), `the focus after ${key}`).toBe(TAB_IDS[expected]);
    }
    await page.keyboard.press('Home');
    // the Tab below starts from the first tab, once the focus has moved there and its panel is the one shown
    await expect(page.locator(`#${TAB_IDS[0]}`)).toBeFocused();
    await expect(page.locator(`#${TAB_IDS[0]}`)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.activity)).toBeTruthy();
  });

  test('Escape closes the menu with the focus on the button and keeps the tab; Tab out of the menu closes it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const button = page.locator('#b-from');
    await button.click();
    await page.locator(`#${TAB_IDS[2]}`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(button).toBeFocused();
    await button.press('ArrowDown');
    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(`#${TAB_IDS[2]}`)).toHaveAttribute('aria-selected', 'true');
    await layerArmed(page); // Zag watches for the focus leaving the menu a frame after the opening: not before

    // from the last control of the menu (Default) a Tab leaves it: the menu closes and the focus is on the next control
    await page.locator('[data-action="default"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('the open menu stays inside a 960 px window with nothing scrolling, and has no axe violations', async ({ mount, page, axe }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    await mount<typeof Default>(STORY, { counts: { crafted: 1380, pvp: 0, quests: 1 } });
    expect(await axe(), 'closed').toEqual([]);
    await page.locator('#b-from').click();
    await expect(page.locator(MENU)).toBeVisible();
    await layerPlaced(page.locator(MENU));
    const fit = await page.locator(MENU).evaluate(menu => {
      const box = menu.getBoundingClientRect();
      return {
        inside: box.left >= 0 && box.right <= document.documentElement.clientWidth && box.top >= 0 && box.bottom <= innerHeight,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        menuScrolls: menu.scrollHeight > menu.clientHeight + 1 || menu.scrollWidth > menu.clientWidth + 1,
      };
    });
    expect(fit).toEqual({ inside: true, sideways: false, menuScrolls: false });
    expect(await axe(), 'open').toEqual([]);
  });

  test('in a window shorter than the menu the wheel scrolls the menu to its last row, and the scroll does not put it back at the top', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 300 });
    try {
      await mount<typeof Default>(STORY);
      await page.locator('#b-from').click();
      const menu = page.locator(MENU);
      await expect(menu).toBeVisible();
      const sizes = () =>
        menu.evaluate(element => ({ top: Math.round(element.scrollTop), height: element.scrollHeight, client: element.clientHeight }));
      const start = await sizes();
      expect(start.height, 'the window is short enough that the menu scrolls').toBeGreaterThan(start.client + 1);
      const box = await menu.boundingBox();
      await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + Math.min(box?.height ?? 0, 300 - (box?.y ?? 0)) / 2);
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await sizes()).top, { message: 'one wheel tick moves the menu off the top' }).toBeGreaterThan(0);
      // on to the end a tick at a time (more ticks would scroll the page behind, which moves the menu with its button)
      for (let tick = 0; tick < 30; tick++) {
        const now = await sizes();
        if (now.top + now.client >= now.height - 1) {
          break;
        }
        await page.mouse.wheel(0, 60);
        await expect.poll(async () => (await sizes()).top).not.toBe(now.top);
      }
      const lastRowBelowBox = () =>
        menu.evaluate(element => {
          const bottom = element.getBoundingClientRect().bottom;
          const rows = [...element.querySelectorAll('.multi-opt')];
          return Math.round(Math.max(...rows.map(row => row.getBoundingClientRect().bottom)) - bottom);
        });
      await expect.poll(lastRowBelowBox, { message: 'the last row ends inside the menu after wheeling to the end' }).toBeLessThanOrEqual(0);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });
});

test.describe('<gsa-gear-categories> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the button opens the menu, a tap on a box ticks it, a tap outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator(MENU);
    await page.locator('#b-from').tap();
    await expect(menu).toBeVisible();
    const boxes = menu.locator('input[data-activity]:visible');
    const first = boxes.first();
    const before = await first.isChecked();
    await first.tap();
    await expect(first).toBeChecked({ checked: !before });
    await expect(component.getByTestId('events')).not.toHaveText('');
    await expect(menu).toBeVisible();
    await tapOutside(page);
    await expect(menu).toBeHidden();
  });
});

test.describe('<gsa-gear-categories> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open menu has an edge and a focused box has a ring', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#b-from').click();
    const menu = page.locator(MENU);
    await expect(menu).toBeVisible();
    const boxes = menu.locator('input[data-activity]:visible');
    await expectForcedColoursLook(page, { panel: menu, ring: boxes.nth(1) });
  });

  test('a ticked box differs from an unticked one with its tick showing, and the market board switch on differs from off', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#b-from').click();
    const menu = page.locator(MENU);
    await expect(menu).toBeVisible();

    // the first tab has ticked boxes and, by default, an unticked one (Miscellaneous)
    const ticked = menu.locator('input[data-activity]:checked:visible').first();
    const unticked = menu.locator('input[data-activity]:not(:checked):visible').first();
    await expectLookApart(ticked, unticked, 'a ticked box looks like an unticked one');
    expect(await partShows(ticked, '::after'), 'the tick shows against the fill of a ticked box').toBe(true);

    // the switch: its knob shows against its track, and a press changes the track's fill and the knob's place
    const marketSwitch = menu.locator('.from-switch input');
    const trackFill = () => marketSwitch.evaluate(element => getComputedStyle(element).backgroundColor);
    const knobPlace = () => marketSwitch.evaluate(element => getComputedStyle(element, '::before').left);
    await expect(marketSwitch).toBeChecked();
    expect(await partShows(marketSwitch, '::before'), 'the knob shows against the track when on').toBe(true);
    const fillOn = await trackFill();
    const placeOn = await knobPlace();
    await marketSwitch.click();
    await expect(marketSwitch).not.toBeChecked();
    await settled(marketSwitch); // the knob slides and the track fades: read them once they have arrived
    expect(await partShows(marketSwitch, '::before'), 'the knob shows against the track when off').toBe(true);
    expect(await trackFill(), 'the track has the same fill on and off').not.toBe(fillOn);
    expect(await knobPlace(), 'the knob is in the same place on and off').not.toBe(placeOn);
  });
});
