/* Story of <gsa-collapsible>, in three engines: the keys of a disclosure (the WAI-ARIA disclosure pattern: Enter and Space on the button
   show and hide the panel, `aria-expanded` and `aria-controls` follow, Tab moves on past a shown panel) and axe. */
import { expect, test } from '../fixtures.ts';
import { CONTENT_ID, TRIGGER_ID, type Default } from './collapsible.story.ts';

const STORY = 'shared/collapsible/Default';

test.describe('<gsa-collapsible>', () => {
  test('Enter shows the panel and Space hides it, aria-expanded and aria-controls follow, and Tab moves on', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const trigger = page.locator(`#${TRIGGER_ID}`);
    const panel = page.locator(`#${CONTENT_ID}`);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('aria-controls', CONTENT_ID);
    await expect(panel).toBeHidden();

    // the button asks the page, which sets `open`; the panel shows
    await trigger.focus(); // WebKit does not focus a button on click
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('[true,false]');

    // a shown panel without a control inside takes no Tab stop: the focus goes on to the next control
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('has no axe violations, shown or hidden', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe(), 'hidden').toEqual([]);
    await page.locator(`#${TRIGGER_ID}`).click();
    await expect(page.locator(`#${CONTENT_ID}`)).toBeVisible();
    expect(await axe(), 'shown').toEqual([]);
  });
});
