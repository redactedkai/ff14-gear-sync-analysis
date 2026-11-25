/* Stories of <gsa-job-menu>: a menu button with radio items in role rows. ArrowDown opens it on the chosen job, the arrows move by
   role (Up and Down) and inside a role (Left and Right), Enter picks and gives the focus back to the button, Escape closes it with
   the focus on the button, Tab closes it and moves on, a click on an icon picks, all 23 jobs are there, and axe. */
import { test, expect } from '../fixtures.ts';
import { START_JOB, START_JOB_NAME, type Default } from './job-menu.story.js';

const STORY = 'app/job-menu/Default';
const JOB_COUNT = 23;

test.describe('<gsa-job-menu>', () => {
  test('the keys move by role and inside a role, Enter and a click pick, Escape and Tab close', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator('#job-menu-btn');
    const menu = page.locator('#job-menu');
    const tile = (id: string) => menu.locator(`[data-job-id="${id}"]`);
    await expect(button).toContainText(START_JOB_NAME);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    // ArrowDown opens it on the chosen job, all jobs are there, the chosen one is checked
    await button.focus(); // WebKit does not focus a button on click
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(menu).toBeFocused();
    await expect(menu.locator('[data-job-id]')).toHaveCount(JOB_COUNT);
    await expect(tile(START_JOB)).toHaveAttribute('aria-checked', 'true');
    await expect(tile(START_JOB)).toHaveAttribute('data-highlighted', '');

    // Right along Healers (WHM SCH AST SGE) stops at the end; Up goes to the Tanks row, the same place or the last (GNB); Down back
    await page.keyboard.press('ArrowRight');
    await expect(tile(START_JOB)).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowUp');
    await expect(tile('GNB')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowLeft');
    await expect(tile('DRK')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await expect(tile('AST')).toHaveAttribute('data-highlighted', '');

    // Enter picks: the menu closes with the focus on the button, which names the new job
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["AST"]');
    await expect(button).toContainText('Astrologian');

    // Escape closes with the focus on the button; a click on an icon picks
    await button.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await tile('WAR').click();
    await expect(menu).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["AST","WAR"]');

    // Tab closes it and the focus goes on to the next control
    await button.click();
    await expect(menu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(component.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
    await page.locator('#job-menu-btn').click();
    await expect(page.locator('#job-menu')).toBeVisible();
    expect(await axe()).toEqual([]);
  });
});
