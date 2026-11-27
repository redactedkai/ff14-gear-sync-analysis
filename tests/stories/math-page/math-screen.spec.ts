/* Stories of <gsa-math-screen>: a click on a sub-tab link shows that sub-tab and hides the other two (through the store), a pick in the
   Job menu edits the store and the bar follows it; axe. The links' own behaviour is math-bar.spec.ts, the job each sub-tab edits is
   math-inputs.test.ts. */
import { expect, test } from '../fixtures.ts';
import { PICKED_JOB, START_JOB_NAME, type Default } from './math-screen.story.ts';

const STORY = 'math-page/math-screen/Default';
// the finding axe has on the math bar, known on the page too (see math-bar.spec.ts)
// TODO: goes when the chips' names include their visible text.
const KNOWN_CHIPS = ['label-content-name-mismatch: #p-piece-chip', 'label-content-name-mismatch: #p-piece-chip | #p-sync-chip'];

test.describe('<gsa-math-screen>', () => {
  test('a click on a sub-tab link shows that sub-tab and hides the other two', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const sections = page.locator('section.subtab:not([hidden])');
    await expect(sections).toHaveCount(1);
    await expect(sections).toHaveId('tab-piece');
    for (const [sub, section] of [
      ['gcd', 'tab-gcd'],
      ['tiers', 'tab-tiers'],
    ]) {
      await page.locator(`[data-sub=${sub}]`).click();
      await expect(page.locator(`[data-sub=${sub}]`)).toHaveAttribute('aria-current', 'page');
      await expect(sections).toHaveCount(1);
      await expect(sections).toHaveId(section);
    }
  });

  test('a pick in the Job menu reaches the store and the bar follows it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#m-job-btn')).toContainText(START_JOB_NAME);
    await page.locator('#m-job-btn').click();
    await page.locator(`#m-job-menu [data-job-id="${PICKED_JOB.id}"]`).click();
    await expect(page.locator('#m-job-btn')).toContainText(PICKED_JOB.name);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect((await axe()).filter(finding => !KNOWN_CHIPS.includes(finding))).toEqual([]);
  });
});
