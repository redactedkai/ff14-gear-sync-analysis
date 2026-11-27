/* Story of <gsa-level-field>: the keys of its number box as the element implements them (an arrow key steps at once, typed digits wait
   and commit once, Enter commits at once, text that is no level is an error and commits nothing; a level out of range moves to the
   nearest on leaving the box; there is no Escape rule), and axe. */
import { expect, test } from '../fixtures.ts';
import { MAX_LEVEL, type Default } from './level-field.story.ts';

const STORY = 'app/level-field/Default';

test.describe('<gsa-level-field>', () => {
  test('an arrow key steps at once, typing commits once, and a level out of range is an error and moves to the nearest on Enter', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const level = page.locator('#p-level');
    await expect(level).toHaveValue(String(MAX_LEVEL));

    await level.focus();
    await page.keyboard.press('ArrowDown');
    await expect(events).toHaveText(`[${MAX_LEVEL - 1}]`);

    // "5", "50" typed: the number on the way is held back, Enter commits the whole number
    await level.selectText();
    await level.pressSequentially('50');
    await page.keyboard.press('Enter');
    await expect(events).toHaveText(`[${MAX_LEVEL - 1},50]`);

    // 101 is above the job's cap: flagged while typed, committed as nothing, and moved to the cap on Enter
    await level.fill('101');
    await expect(page.locator('#p-level-error')).toBeVisible();
    await expect(level).toHaveAttribute('aria-invalid', 'true');
    await expect(events).toHaveText(`[${MAX_LEVEL - 1},50]`);
    await page.keyboard.press('Enter');
    await expect(level).toHaveValue(String(MAX_LEVEL));
    await expect(events).toHaveText(`[${MAX_LEVEL - 1},50,${MAX_LEVEL}]`);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
