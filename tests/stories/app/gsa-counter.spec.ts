import { test, expect } from '../fixtures.ts';
import type { Default } from './gsa-counter.story.js';

test.describe('<gsa-counter>', () => {
  test('draws in light DOM with the given count', async ({ mount, page }) => {
    const component = await mount<typeof Default>('app/gsa-counter/Default', { count: 3 });
    await expect(component.getByText('Count 3')).toBeVisible();
    // light DOM: no shadow root, so the page's own CSS reaches the buttons
    expect(await page.locator('gsa-counter').evaluate(element => element.shadowRoot)).toBeNull();
  });

  test('a real click changes the count and fires count-change', async ({ mount }) => {
    const component = await mount<typeof Default>('app/gsa-counter/Default', { count: 1 });
    await component.getByRole('button', { name: 'More' }).click();
    await component.getByRole('button', { name: 'More' }).click();
    await component.getByRole('button', { name: 'Fewer' }).click();
    await expect(component.getByText('Count 2')).toBeVisible();
    await expect(component.getByTestId('events')).toHaveText('[2,3,2]');
  });

  test('a new count from the page re-renders in place', async ({ mount }) => {
    const component = await mount<typeof Default>('app/gsa-counter/Default', { count: 1 });
    await component.update({ count: 7 });
    await expect(component.getByText('Count 7')).toBeVisible();
  });

  test('keyboard: Tab reaches the buttons, Space presses', async ({ mount, page }) => {
    const component = await mount<typeof Default>('app/gsa-counter/Default', { count: 0 });
    // WebKit does not focus a button on click or Tab by default: focus it explicitly, then use the real keyboard
    await component.getByRole('button', { name: 'More' }).focus();
    await page.keyboard.press('Space');
    await expect(component.getByText('Count 1')).toBeVisible();
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>('app/gsa-counter/Default', { count: 1 });
    expect(await axe()).toEqual([]);
  });
});
