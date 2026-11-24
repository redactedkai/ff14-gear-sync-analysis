/* Stories of <gsa-slot-menu>: the keyboard model of a menu button with radio items (the WAI-ARIA menu button pattern), the
   focus rules (back on the button after a pick or Escape, on to the next control after Tab) and axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './slot-menu.story.js';

const STORY = 'gear-browser/slot-menu/Default';

test.describe('<gsa-slot-menu>', () => {
  test('ArrowDown opens the menu with the first slot lit, and the button says it is expanded', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    const menu = page.locator('#b-slots');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    // WebKit does not focus a button on click: focus it explicitly before using the keyboard
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitemradio', { name: /^Any slot/ })).toHaveAttribute('data-highlighted', '');
  });

  test('the arrows and End move through the slots and skip a slot with no match; Enter picks and gives the focus back to the button', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    const menu = page.locator('#b-slots');
    await button.focus();
    await page.keyboard.press('ArrowDown'); // Any slot
    await page.keyboard.press('ArrowDown'); // Weapon
    await expect(menu.getByRole('menuitemradio', { name: /^Weapon/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown'); // Off-hand has no match: Head
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown'); // Ring, the last
    await expect(menu.getByRole('menuitemradio', { name: /^Ring/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowUp'); // back over the same slots
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitemradio', { name: /^Ring/ })).toHaveAttribute('data-highlighted', '');

    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["ring"]');
  });

  test('a slot with no match cannot be picked, unless it is the chosen one', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('#b-slots');
    await component.getByRole('button', { name: 'Slot: Any slot' }).click();
    const empty = menu.getByRole('menuitemradio', { name: /^Off-hand/ });
    await expect(empty).toHaveAttribute('aria-disabled', 'true');
    await empty.click({ force: true });
    await expect(menu, 'a click on a slot with no match leaves the menu open').toBeVisible();
    await expect(component.getByTestId('events')).toHaveText('');

    // the chosen slot stays pickable and is marked, even when it has no match any more
    await component.update({ value: 'offhand' });
    await expect(component.getByRole('button', { name: 'Slot: Off-hand' })).toBeVisible();
    await expect(empty).not.toHaveAttribute('aria-disabled', 'true');
    await expect(empty).toHaveAttribute('aria-checked', 'true');
  });

  test('a click on a slot picks it; the page sets the value back and the button names it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('#b-slots');
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    await button.click();
    await menu.getByRole('menuitemradio', { name: /^Head/ }).click();
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["head"]');

    await component.update({ value: 'head' });
    await expect(component.getByRole('button', { name: 'Slot: Head' })).toHaveText('Head');
    await component.getByRole('button', { name: 'Slot: Head' }).click();
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: /^Any slot/ })).toHaveAttribute('aria-checked', 'false');
  });

  test('Escape closes the menu with the focus back on the button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    await button.click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('');
  });

  test('Tab closes the menu and the focus moves on to the next control', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(component.getByRole('textbox', { name: 'Search gear by name' })).toBeFocused();
  });

  test('a press outside closes the menu', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: 'Slot: Any slot' }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await component.getByRole('button', { name: 'Before' }).click();
    await expect(page.locator('#b-slots')).toBeHidden();
  });

  test('the open menu is as wide as its button, and the button keeps its width when the choice changes', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const width = (element: Element) => element.getBoundingClientRect().width;
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    const closedWidth = await button.evaluate(width);
    await button.click();
    expect(await page.locator('#b-slots').evaluate(width)).toBeCloseTo(closedWidth, 0);
    await page.keyboard.press('Escape');

    await component.update({ value: 'ring' });
    expect(await component.getByRole('button', { name: 'Slot: Ring' }).evaluate(width)).toBeCloseTo(closedWidth, 0);
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    const component = await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
    await component.getByRole('button', { name: 'Slot: Any slot' }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    expect(await axe()).toEqual([]);
  });

  test('opens and closes with Escape ten times in a row, each time with the focus back on the button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: 'Slot: Any slot' });
    for (let round = 0; round < 10; round++) {
      await button.click();
      await expect(page.locator('#b-slots')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#b-slots')).toBeHidden();
      await expect(button).toBeFocused();
    }
  });
});
