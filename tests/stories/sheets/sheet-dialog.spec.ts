/* Stories of <gsa-sheet-dialog>: the New sheet dialog is a modal box that keeps Tab inside, a refused Create shows its reason at the
   field, a job and a typed name are what Enter in the Name box creates, Escape and the X close it with the focus back on the button
   that opened it, and axe. */
import { expect, test } from '../fixtures.ts';
import { OPENER_LABEL, TITLE, type Default } from './sheet-dialog.story.js';

const STORY = 'sheets/sheet-dialog/Default';

test.describe('<gsa-sheet-dialog>', () => {
  test('a refused Create names the field, Tab stays inside the box, Escape and the X close it with the focus on the opener', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const box = page.getByRole('dialog', { name: TITLE });
    const opener = page.getByRole('button', { name: OPENER_LABEL });
    await expect(box).toBeVisible();
    await expect(page.locator('#sh-dlg-name')).toBeFocused();

    // no job chosen: Create is refused with the reason at the Job label, and the Job group is marked
    await page.locator('#sh-dlg-ok').click();
    await expect(page.locator('#sh-dlg-job-err')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Job' })).toHaveAttribute('aria-invalid', 'true');

    // Tab goes round the box and never reaches the button behind it
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab');
      expect(await box.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a picked job and a typed name are what Enter in the Name box creates', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await page.locator('[data-job-id="SGE"]').click();
    await expect(page.locator('[data-job-id="SGE"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#sh-dlg-name').fill('Mine');
    await page.locator('#sh-dlg-name').press('Enter');
    await expect(component.getByTestId('events')).toHaveText('["create:Mine:SGE"]');
    await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0);
    await expect(page.getByRole('button', { name: OPENER_LABEL })).toBeFocused();
  });

  test('the X closes it too', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0);
    await expect(page.getByRole('button', { name: OPENER_LABEL })).toBeFocused();
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
