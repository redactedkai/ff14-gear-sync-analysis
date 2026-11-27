/* Stories of <gsa-job-strip> with its two fields: a typed item level commits, a level that allows less lowers the cap with its note, flag
   and gold border (the field follows the level; the error for text that is no item level is cap-field.spec's), the strip not moving
   when the cap is lowered, and axe. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './job-strip.story.ts';
import { partShows } from '../look.ts';

const STORY = 'app/job-strip/Default';
// the highest item level the best gear made for level 40 has (capCeiling in core/sync-target.ts): what a cap at level 40 is lowered to
const CAP_AT_LEVEL_40 = 43;

test.describe('<gsa-job-strip>', () => {
  test('a typed item level commits and a lower level lowers it with a note', async ({ mount, page }) => {
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
  });

  test('a lowered cap keeps the strip as it was: the cap line is one line and the IL Sync switch and Reset stay in place', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const placeOf = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const rect = (document.querySelector(selector) as Element).getBoundingClientRect();
          return [rect.left, rect.top, rect.width, rect.height];
        };
        const label = document.querySelector('label[for=cap]') as HTMLElement;
        return {
          capLabelLines: label.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(label).lineHeight),
          cap: box('#cap'),
          neighbours: ['#level', '#sync', '#reset'].map(box),
        };
      });
    const before = await placeOf();
    expect(before.capLabelLines, 'the cap label is one line').toBeLessThan(2);
    await page.locator('#level').fill('40');
    await expect(page.locator('#cap-lowered')).toContainText(String(CAP_AT_LEVEL_40));
    const after = await placeOf();
    expect(after.capLabelLines, 'the lowered flag keeps the label on one line').toBeLessThan(2);
    expect(after.cap, 'the cap box moved').toEqual(before.cap);
    expect(after.neighbours, 'a box beside the cap moved').toEqual(before.neighbours);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});

test.describe('<gsa-job-strip> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the IL Sync switch shows its knob against its track, and looks different on and off', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const sync = page.locator('#sync');
    const look = () =>
      sync.evaluate(element => {
        const knob = getComputedStyle(element, '::before');
        return [getComputedStyle(element).backgroundColor, knob.backgroundColor, knob.transform].join(' ');
      });
    await expect(sync).toBeChecked();
    expect(await partShows(sync, '::before'), 'the knob shows against the track when on').toBe(true);
    const on = await look();
    await sync.click();
    await expect(sync).not.toBeChecked();
    expect(await partShows(sync, '::before'), 'the knob shows against the track when off').toBe(true);
    expect(await look(), 'the switch looks the same on and off').not.toBe(on);
  });
});
