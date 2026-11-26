/* Story of <gsa-cap-field>: the keys of its number box as the element implements them (typed digits wait and commit once, Enter commits
   at once, an arrow key steps at once, text that is no item level is an error and commits nothing; there is no Escape rule), the cap
   lowered to what a lower level allows, and axe. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './cap-field.story.js';

const STORY = 'app/cap-field/Default';
// the highest item level the best gear made for level 40 has (capCeiling in core/sync-target.ts): what a cap at level 40 is lowered to
const CAP_AT_LEVEL_40 = 43;

test.describe('<gsa-cap-field>', () => {
  test('typing commits the whole number once, an arrow key steps at once, and text that is no item level is an error', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const cap = page.locator('#cap');
    await expect(cap).toHaveValue('300');

    // "2", "20" and "200" typed: the numbers on the way are held back, Enter commits the whole number
    await cap.selectText();
    await cap.pressSequentially('200');
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('[200]');

    // an arrow key is a step: committed at once
    await page.keyboard.press('ArrowUp');
    await expect(events).toHaveText('[200,201]');

    // 0 is no item level: the error shows, the box is invalid, and nothing is committed
    await cap.fill('0');
    await expect(page.locator('#cap-error')).toBeVisible();
    await expect(cap).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('[200,201]');
  });

  test('a level that allows less lowers the cap, with a note', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const cap = page.locator('#cap');
    await page.getByRole('button', { name: 'Lower the level' }).click();
    await expect(cap).toHaveValue(String(CAP_AT_LEVEL_40));
    await expect(component.getByTestId('events')).toHaveText(`[${CAP_AT_LEVEL_40}]`);
    await expect(cap).toHaveClass(/lowered/);
    await expect(page.locator('#cap-lowered')).toContainText(String(CAP_AT_LEVEL_40));
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
