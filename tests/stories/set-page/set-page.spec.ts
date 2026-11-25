/* Stories of <gsa-set-page>: a piece picked by hand opens a draft with Apply and Discard, and Discard puts the set back; leaving with a
   draft asks first, and Keep editing stays; Tab goes from the set's buttons to Auto-fill and the gear; axe. */
import { expect, test } from '../fixtures.ts';
import { HEAD_ROW, type Default } from './set-page.story.js';

const STORY = 'set-page/set-page/Default';

test.describe('<gsa-set-page>', () => {
  test('a piece picked by hand opens a draft with Apply and Discard in place of Auto-fill; Discard puts the set back', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#sh-fill')).toBeVisible();
    await page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`).click();
    await page.locator('.pick-menu .same-item[data-game-id]').nth(1).click();
    await expect(page.locator('#sh-apply')).toContainText('1 change');
    await expect(page.locator('#sh-fill')).toHaveCount(0);
    await expect(page.locator('#sh-figures')).toContainText('After');
    await page.locator('#sh-discard').click();
    await expect(page.locator('#sh-apply')).toHaveCount(0);
    await expect(page.locator('#sh-fill')).toBeFocused();
  });

  test('leaving with a draft asks first; Keep editing stays on the page with the draft', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`).click();
    await page.locator('.pick-menu .same-item[data-game-id]').nth(1).click();
    await expect(page.locator('#sh-apply')).toBeVisible();
    await page.locator('.setcrumb a').first().click();
    await expect(page.locator('#sh-leave-q')).toContainText('unapplied');
    await expect(page.locator('#sh-leave-keep')).toBeFocused();
    await page.locator('#sh-leave-keep').click();
    await expect(page.locator('#sh-leave')).toHaveCount(0);
    await expect(page.locator('#sh-apply')).toBeVisible();
  });

  test('Tab goes from the set buttons to Auto-fill and then to the gear', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#sh-set-delete').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#sh-fill')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Auto-fill settings' })).toBeFocused();
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
