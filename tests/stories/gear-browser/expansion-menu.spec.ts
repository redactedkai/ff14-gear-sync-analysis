/* Stories of <gsa-expansion-menu>: the keys of its popover of checkboxes. ArrowDown on the button opens the panel with the focus
   left on the button; Tab goes into the boxes in the order of the expansions; Space ticks or unticks the box in focus and the list
   the menu sends and the button's text follow; Shift+Tab from the first box goes back to the button with the panel open; Escape
   closes it with the focus on the button; Tab out of the last box closes it and moves on; a press outside closes it; axe. */
import { EXPANSIONS } from '../../../src/core/constants.js';
import { EXPANSION_LABEL, expansionSummary } from '../../../src/ui/elements/gear-browser/filter-menu-model.ts';
import { expect, test } from '../fixtures.ts';
import type { Default } from './expansion-menu.story.js';
import { expectForcedColoursLook, expectLookApart, partShows, tapOutside } from '../look.ts';

const STORY = 'gear-browser/expansion-menu/Default';
const BUTTON = '#b-exp';
const MENU = '#b-exp-menu';
const SHORTS: string[] = EXPANSIONS.map((expansion: { short: string }) => expansion.short);

/* The selector of the box of one expansion. */
const box = (short: string) => `${MENU} input[data-exp="${short}"]`;

test.describe('<gsa-expansion-menu>', () => {
  test('ArrowDown opens the panel with the focus on the button; Tab walks the boxes in order; Shift+Tab from the first goes back to the button', async ({
    mount,
    page,
    axe,
  }) => {
    await mount<typeof Default>(STORY);
    const button = page.locator(BUTTON);
    const menu = page.locator(MENU);
    expect(await axe(), 'closed').toEqual([]);
    await expect(menu).toBeHidden();

    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(button).toBeFocused();
    await expect(page.getByRole('dialog', { name: EXPANSION_LABEL })).toBeVisible();
    expect(await axe(), 'open').toEqual([]);

    // Tab goes into the boxes, one expansion after another, oldest first
    for (const short of SHORTS) {
      await page.keyboard.press('Tab');
      await expect(page.locator(box(short)), `Tab to the box of ${short}`).toBeFocused();
    }

    // Shift+Tab walks back, and from the first box it goes to the button with the panel still open
    for (const short of SHORTS.slice(0, -1).reverse()) {
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator(box(short)), `Shift+Tab to the box of ${short}`).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    await expect(menu).toBeVisible();
  });

  test('Space ticks and unticks the box in focus; the list sent and the button follow, and the other boxes stay as they were', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator(BUTTON);
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(`${MENU} input:checked`)).toHaveCount(SHORTS.length);

    // the third box: Tab three times from the button
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Tab');
    }
    const third = SHORTS[2];
    await expect(page.locator(box(third))).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator(box(third))).not.toBeChecked();
    await expect(component.getByTestId('events')).toHaveText(JSON.stringify([[third]]));
    await expect(button).toHaveText(expansionSummary([third]));
    await expect(page.locator(`${MENU} input:checked`)).toHaveCount(SHORTS.length - 1);
    await expect(page.locator(MENU)).toBeVisible();

    // the box before it: the list is the two, oldest first
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator(box(SHORTS[1]))).toBeFocused();
    await page.keyboard.press('Space');
    await expect(button).toHaveText(expansionSummary([SHORTS[1], third]));
    await expect(component.getByTestId('events')).toHaveText(JSON.stringify([[third], [SHORTS[1], third]]));

    // Space again puts the box back
    await page.keyboard.press('Space');
    await expect(page.locator(box(SHORTS[1]))).toBeChecked();
    await expect(button).toHaveText(expansionSummary([third]));
  });

  test('Escape closes the panel with the focus on the button and the ticks kept; Tab out of the last box closes it and the focus moves on; a press outside closes it', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY, { off: [SHORTS[0]] });
    const button = page.locator(BUTTON);
    const menu = page.locator(MENU);
    await expect(button).toHaveText(expansionSummary([SHORTS[0]]));

    // the panel opens on the saved ticks
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(page.locator(box(SHORTS[0]))).not.toBeChecked();
    await expect(page.locator(`${MENU} input:checked`)).toHaveCount(SHORTS.length - 1);

    // Escape from inside a box: closed, the focus on the button (Zag gives it back a frame after the key), the ticks kept
    await page.keyboard.press('Tab');
    await expect(page.locator(box(SHORTS[0]))).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveText(expansionSummary([SHORTS[0]]));
    await expect(component.getByTestId('events')).toHaveText('');

    // Tab out of the last box closes it and the focus goes to the control after the menu
    await button.press('ArrowDown');
    await expect(menu).toBeVisible();
    await page.locator(box(SHORTS[SHORTS.length - 1])).focus();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();

    // a press on the button opens it and a press outside closes it
    await button.click();
    await expect(menu).toBeVisible();
    await page.getByRole('button', { name: 'Before' }).click();
    await expect(menu).toBeHidden();
  });
});

test.describe('<gsa-expansion-menu> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the button opens the panel, a tap on a box ticks it, a tap outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator(MENU);
    await page.locator(BUTTON).tap();
    await expect(menu).toBeVisible();
    await page.locator(box(SHORTS[2])).tap();
    await expect(page.locator(box(SHORTS[2]))).not.toBeChecked();
    await expect(component.getByTestId('events')).toHaveText(JSON.stringify([[SHORTS[2]]]));
    await expect(menu).toBeVisible();
    await tapOutside(page);
    await expect(menu).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText(JSON.stringify([[SHORTS[2]]]));
  });
});

test.describe('<gsa-expansion-menu> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open panel has an edge and a focused box has a ring', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(BUTTON).click();
    await expect(page.locator(MENU)).toBeVisible();
    await expectForcedColoursLook(page, { panel: page.locator(MENU), ring: page.locator(box(SHORTS[1])) });
  });

  test('a ticked box differs from an unticked one and its tick shows against its fill', async ({ mount, page }) => {
    await mount<typeof Default>(STORY, { off: [SHORTS[0]] });
    await page.locator(BUTTON).click();
    await expect(page.locator(MENU)).toBeVisible();
    const ticked = page.locator(box(SHORTS[1]));
    const unticked = page.locator(box(SHORTS[0]));
    await expect(ticked).toBeChecked();
    await expect(unticked).not.toBeChecked();
    await expectLookApart(ticked, unticked, 'a ticked box looks like an unticked one');
    expect(await partShows(ticked, '::after'), 'the tick shows against the fill of a ticked box').toBe(true);
  });
});
