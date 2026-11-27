/* Stories of <gsa-sheets-screen>: another gear set is a new set page (nothing of the first one stays), a Back or Forward of the browser
   closes an open dialog; axe. What the screen shows for each address is the model's unit test (sheets-screen-model.test.ts). */
import { expect, test } from '../fixtures.ts';
import { FIRST_SET, OPEN_SECOND_LABEL, SECOND_SET, type Default } from './sheets-screen.story.ts';

const STORY = 'sheets/sheets-screen/Default';

test.describe('<gsa-sheets-screen>', () => {
  test('opening another gear set draws a new set page: nothing of the first one stays', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#sh-set-name')).toHaveText(FIRST_SET.name);
    // a mark on the first set's page element: a page drawn again in place would keep it
    await page.locator('gsa-set-page').evaluate(element => element.setAttribute('data-first-page', ''));
    await page.getByRole('button', { name: OPEN_SECOND_LABEL }).click();
    await expect(page.locator('#sh-set-name')).toHaveText(SECOND_SET.name);
    await expect(page.locator('gsa-set-page')).toHaveCount(1);
    await expect(page.locator('gsa-set-page')).not.toHaveAttribute('data-first-page', '');
  });

  test('Back closes an open dialog', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#sh-set-edit').click();
    await expect(page.locator('#sh-dialog')).toBeVisible();
    // a step in the history and back, as the browser's own Back does: the browser sends the popstate
    await page.evaluate(() => {
      history.pushState(null, '', '#next');
      history.back();
    });
    await expect(page.locator('#sh-dialog')).toHaveCount(0);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
