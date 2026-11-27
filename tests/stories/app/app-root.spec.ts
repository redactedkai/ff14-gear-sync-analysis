/* Stories of <gsa-app>: a click on a tab link opens that tab (the link is the current one and only its section shows, and the root has
   no section beyond the three tabs'); axe. The tab links' addresses, the loading line and the leave question are
   app-root-model.test.ts; the start marker and the boot shell are the smoke test's. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './app-root.story.ts';

const STORY = 'app/app-root/Default';
const TABS = ['sheets', 'browse', 'math'];

test.describe('<gsa-app>', () => {
  test('a click on a tab link opens that tab: it is the current link and its section is the only one shown', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const shown = page.locator('gsa-app > section.tab:not([hidden])');
    await expect(page.locator('gsa-app > section.tab')).toHaveCount(TABS.length);
    for (const tab of ['math', 'browse', 'sheets']) {
      await page.locator(`#tablink-${tab}`).click();
      await expect(page.locator(`#tablink-${tab}`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('nav.tabs [aria-current]')).toHaveCount(1);
      await expect(shown).toHaveCount(1);
      await expect(shown).toHaveId(`tab-${tab}`);
    }
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
