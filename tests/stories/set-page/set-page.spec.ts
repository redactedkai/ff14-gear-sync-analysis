/* Stories of <gsa-set-page>: a piece picked by hand opens a draft with Apply and Discard, and Discard puts the set back; leaving with a
   draft asks first, and Keep editing stays; Tab goes from the set's buttons to Auto-fill and the gear; an Auto-fill that fails (the
   solver rejects, answers with an error, or stops at its step limit) says so in a line and leaves the page as it was; axe. */
import { STEP_LIMIT_TEXT, failedText } from '../../../src/ui/views/set-suggestion.ts';
import { expect, test } from '../fixtures.ts';
import { FILL_ERROR_MESSAGE, HEAD_ROW, type Default, type FillFails } from './set-page.story.js';

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

  test('in the Auto-fill settings Tab goes through the Goal boxes in the order drawn, and back with Shift+Tab, with the popover kept open', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#sh-settings').click();
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
    await page.locator('#s-target').focus();
    const goal = ['s-tb1', 's-tb2', 's-gcd'];
    for (const id of goal) {
      await page.keyboard.press('Tab');
      await expect(page.locator(`#${id}`), `Tab to ${id}`).toBeFocused();
    }
    for (const id of ['s-tb2', 's-tb1', 's-target']) {
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator(`#${id}`), `Shift+Tab to ${id}`).toBeFocused();
    }
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
  });

  for (const [failure, expected] of [
    ['rejects', failedText(FILL_ERROR_MESSAGE)],
    ['error', failedText(FILL_ERROR_MESSAGE)],
    ['infeasible', STEP_LIMIT_TEXT],
  ] as const) {
    test(`an Auto-fill that fails (${failure}) shows its line and leaves the set, the buttons and the page free`, async ({
      mount,
      page,
      axe,
    }) => {
      await mount<typeof FillFails>('set-page/set-page/FillFails', { failure });
      const line = page.locator('#sh-fill-line');
      await expect(line).toBeHidden();
      await expect(page.locator('#sh-fill')).toBeEnabled();
      await page.locator('#sh-fill').click();

      // the line the player reads: an alert that names the failure, and nothing offered to apply
      await expect(line).toBeVisible();
      await expect(line).toHaveText(expected);
      await expect(line).toHaveAttribute('role', 'alert');
      await expect(page.locator('#sh-apply')).toHaveCount(0);
      await expect(page.locator('#sh-discard')).toHaveCount(0);

      // the run is over: Auto-fill can be pressed again, the set can be edited, and no Cancel is left
      await expect(page.locator('#sh-cancel')).toHaveCount(0);
      await expect(page.locator('#sh-fill')).toBeEnabled();
      await expect(page.locator('#sh-set-edit')).toBeEnabled();
      expect(await axe()).toEqual([]);

      // pressing it again shows the same one line again
      await page.locator('#sh-fill').click();
      await expect(line).toHaveText(expected);
      await expect(page.locator('#sh-fill-line')).toHaveCount(1);
    });
  }

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
