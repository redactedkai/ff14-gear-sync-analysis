/* Stories of <gsa-materia-menu>: the menu opens under the pressed chip with the worn stone focused, a pick is told to the page
   and closes it with the focus back on the chip, Escape and a press outside close it; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './materia-menu.story.js';
import { expectForcedColoursLook, expectLookApart, hasRing, tapOutside } from '../look.ts';

const STORY = 'set-page/materia-menu/Default';

test.describe('<gsa-materia-menu>', () => {
  test('opens under the chip with the worn stone focused; a pick closes it with the focus on the chip; Escape and a press outside close it', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('.matpop');
    const chip = component.getByRole('button', { name: 'crit +36' });
    await expect(menu).toBeHidden();

    await chip.click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('button[data-stone="crit:11"]')).toBeFocused();
    expect(await axe()).toEqual([]);
    const chipBox = await chip.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.y).toBeGreaterThan((chipBox?.y ?? 0) + (chipBox?.height ?? 0));

    await menu.locator('button[data-stone="det:12"]').click();
    await expect(menu).toBeHidden();
    await expect(chip).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["det:12"]');

    await chip.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(chip).toBeFocused();

    // the chip again opens it, and a press outside closes it
    await chip.click();
    await expect(menu).toBeVisible();
    await component.getByRole('textbox', { name: 'After the chips' }).click();
    await expect(menu).toBeHidden();
  });
});

test.describe('<gsa-materia-menu> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the chip opens the menu, a tap on a stone picks it, a tap outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('.matpop');
    const chip = component.getByRole('button', { name: 'crit +36' });
    await chip.tap();
    await expect(menu).toBeVisible();
    await menu.locator('button[data-stone="det:12"]').tap();
    await expect(menu).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["det:12"]');

    await chip.tap();
    await expect(menu).toBeVisible();
    await tapOutside(page);
    await expect(menu).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["det:12"]');
  });
});

test.describe('<gsa-materia-menu> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open menu has an edge and a focused stone has a ring', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: 'crit +36' }).click();
    const menu = page.locator('.matpop');
    await expect(menu).toBeVisible();
    await expectForcedColoursLook(page, { panel: menu, ring: menu.locator('button[data-stone="det:12"]') });
  });

  test('the worn stone has a mark of its own: with no focus on it, it looks different from a stone not worn', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: 'crit +36' }).click();
    const menu = page.locator('.matpop');
    await expect(menu).toBeVisible();
    // the menu opens with the worn stone focused: the focus goes to Close, so that the ring is not the mark
    await menu.getByRole('button', { name: 'Close' }).focus();
    const worn = menu.locator('button[data-stone="crit:11"]');
    const plain = menu.locator('button[data-stone="det:12"]');
    expect(await hasRing(worn), 'the worn stone has no focus ring here').toBe(false);
    await expectLookApart(worn, plain, 'the worn stone looks like a stone not worn');
  });
});
