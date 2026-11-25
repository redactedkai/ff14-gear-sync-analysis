/* Story of <gsa-dialog>: the modal rules the Sheets dialogs rely on, in one pass (the page's own checks cover the forms). */
import { test, expect } from '../fixtures.ts';
import { BEHIND_LABEL, NAME_TEXT, TITLE, type Alert, type Default } from './dialog.story.js';

test.describe('<gsa-dialog>', () => {
  test('a modal box: the focus goes in and stays in, the page behind is out of the accessibility tree, Escape and a press on the backdrop are the page to answer', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>('shared/dialog/Default');
    const box = page.getByRole('dialog', { name: TITLE });
    await expect(box).toBeVisible();
    await expect(page.locator('#story-name')).toBeFocused();
    await expect(page.getByRole('button', { name: BEHIND_LABEL })).toHaveCount(0);
    // the caret is at the end of the name, nothing is selected (a first key adds to the name)
    await expect
      .poll(() => page.locator('#story-name').evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]))
      .toEqual([NAME_TEXT.length, NAME_TEXT.length]);

    // Tab goes round the three controls of the box and never reaches the button behind it
    for (let press = 0; press < 4; press++) {
      await page.keyboard.press('Tab');
      expect(await box.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }

    // the element asks; it does not close itself: the box is still there after Escape and after a press on the backdrop
    await page.keyboard.press('Escape');
    await expect(component.getByTestId('events')).toHaveText('["dialog-escape"]');
    await page.mouse.click(5, 5);
    await expect(component.getByTestId('events')).toHaveText('["dialog-escape","dialog-close"]');
    await expect(box).toBeVisible();
  });

  test('a question is an alertdialog named by its text, with the focus on the asked control', async ({ mount, page }) => {
    await mount<typeof Alert>('shared/dialog/Alert');
    await expect(page.getByRole('alertdialog', { name: 'Leave the page?' })).toBeVisible();
    await expect(page.locator('#story-keep')).toBeFocused();
  });
});
