/* Stories of <gsa-gcd-controls>: a typed level is sent once typing stops, a pick in the Haste menu is sent, and axe. The keyboard
   model of the Haste menu is the select's own (tests/stories/shared/select.spec.ts). */
import { expect, test } from '../fixtures.ts';
import type { Default } from './gcd-controls.story.js';

const STORY = 'math-page/gcd-controls/Default';

test.describe('<gsa-gcd-controls>', () => {
  test('a typed level and a pick in the Haste menu are sent to the page', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    await expect(page.locator('#g-level')).toHaveValue('50');

    await page.locator('#g-level').fill('70');
    await expect(events).toContainText('"level":70');

    await page.locator('#g-haste').click();
    await page.getByRole('option').nth(1).click();
    await expect(events).toContainText('"haste":"');
    await expect(events).not.toContainText('"haste":""');
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
