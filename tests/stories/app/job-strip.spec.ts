/* Stories of <gsa-job-strip> with its two fields: a typed item level commits, a level that allows less lowers the cap with its note, flag
   and gold border (the field follows the level), text that is no item level is an error, and axe. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './job-strip.story.js';

const STORY = 'app/job-strip/Default';
// the highest item level the best gear made for level 40 has (capCeiling in core/sync-target.js): what a cap at level 40 is lowered to
const CAP_AT_LEVEL_40 = 43;

test.describe('<gsa-job-strip>', () => {
  test('a typed item level commits, a lower level lowers it with a note, and text that is no item level is an error', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const cap = page.locator('#cap');
    await expect(cap).toHaveValue('300');

    await cap.fill('200');
    await expect(events).toContainText('cap:200');

    // the level settles at 40: the cap follows it, and the field says so
    await page.locator('#level').fill('40');
    await expect(cap).toHaveValue(String(CAP_AT_LEVEL_40));
    await expect(page.locator('#cap-lowered')).toContainText(String(CAP_AT_LEVEL_40));
    await expect(cap).toHaveClass(/lowered/);
    await expect(page.locator('#cap-range')).toBeHidden();
    await expect(page.locator('.f-flag.lowered')).toBeVisible();

    // text that is no whole item level: the error shows at once and the stored cap stays
    await cap.fill('0');
    await expect(page.locator('#cap-error')).toBeVisible();
    await expect(cap).toHaveAttribute('aria-invalid', 'true');
    await expect(events).not.toContainText('cap:0');
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
