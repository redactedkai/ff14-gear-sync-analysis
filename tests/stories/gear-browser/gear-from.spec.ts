/* Stories of the closed "Gear categories" field (<gsa-gear-categories> before it is opened, the Gear from field of the Gear browser and
   the Auto-fill settings): the count says what the boxes leave out, the market stall glyph is always there with its accessible name
   and the button's title, gold with no slash while market board gear is searched and the delete button's red with the slash while
   it is left out, the count is not clipped and the glyph is 16 to 18 px at 960 and 1280 px wide; axe. The opened menu is
   gear-categories.spec's. */
import { ACTIVITIES } from '../../../src/core/constants.ts';
import { gearFromSummary, marketWords } from '../../../src/ui/elements/gear-browser/filter-menu-model.ts';
import { expect, test } from '../fixtures.ts';
import { styleOf, tokenColor } from '../look.ts';
import { DEFAULT_LEFT_OUT, type Default } from './gear-categories.story.ts';

const STORY = 'gear-browser/gear-categories/Default';
const FIELD = '#b-from';
const GLYPH = `${FIELD} svg.from-market`;
const ALL_KEYS = ACTIVITIES.map(activity => activity.key);

test.describe('the closed Gear categories field', () => {
  test('the count follows the boxes left out: all, all but a few, a count of the total, none', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY, { exclude: [] });
    await expect(page.locator(FIELD)).toHaveText(gearFromSummary([]));
    expect(await axe()).toEqual([]);

    for (const exclude of [ALL_KEYS.slice(0, 2), DEFAULT_LEFT_OUT, ALL_KEYS]) {
      await mount<typeof Default>(STORY, { exclude });
      await expect(page.locator(FIELD), `${exclude.length} boxes left out`).toHaveText(gearFromSummary(exclude));
    }
    // the default is a count of the total, which is the form the field has to fit
    await mount<typeof Default>(STORY, { exclude: DEFAULT_LEFT_OUT });
    await expect(page.locator(FIELD)).toHaveText(`${ALL_KEYS.length - DEFAULT_LEFT_OUT.length} of ${ALL_KEYS.length}`);
  });

  for (const width of [960, 1280]) {
    test(`at ${width} px the market glyph is gold while included and the delete red with a slash while left out, the count is whole`, async ({
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mount<typeof Default>(STORY, { exclude: DEFAULT_LEFT_OUT, market: true });
      const field = page.locator(FIELD);
      const glyph = page.locator(GLYPH);
      const count = `${ALL_KEYS.length - DEFAULT_LEFT_OUT.length} of ${ALL_KEYS.length}`;

      // included: gold, no slash, named by the words, which are also the button's title
      await expect(field).toHaveText(count);
      await expect(glyph).toBeVisible();
      await expect(glyph).toHaveAttribute('aria-label', marketWords(true));
      await expect(field).toHaveAttribute('title', marketWords(true));
      expect(await styleOf(glyph, 'color')).toBe(await tokenColor(page, '--gold'));
      await expect(glyph.locator('.from-slash')).toBeHidden();
      await expect(page.getByRole('button', { name: new RegExp(marketWords(true)) })).toHaveCount(1);

      // left out: the delete button's red with the slash; the count and the field's width do not change
      const widthBefore = (await field.boundingBox())?.width;
      await mount<typeof Default>(STORY, { exclude: DEFAULT_LEFT_OUT, market: false });
      await expect(glyph.locator('.from-slash')).toBeVisible();
      expect(await styleOf(glyph, 'color')).toBe(await tokenColor(page, '--danger'));
      expect(await styleOf(glyph.locator('.from-slash-gap'), 'stroke')).toBe(await tokenColor(page, '--bg'));
      await expect(glyph).toHaveAttribute('aria-label', marketWords(false));
      await expect(field).toHaveAttribute('title', marketWords(false));
      await expect(page.getByRole('button', { name: new RegExp(marketWords(false)) })).toHaveCount(1);
      await expect(field).toHaveText(count);
      expect((await field.boundingBox())?.width).toBe(widthBefore);

      // the count is whole (not cut with an ellipsis) and the glyph is 16 to 18 px
      const text = await page.locator(`${FIELD} .from-text`).evaluate(element => [element.scrollWidth, element.clientWidth]);
      expect(text[0], `the count is clipped (${text[0]} px of ${text[1]} px)`).toBeLessThanOrEqual(text[1]);
      const box = await glyph.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(16);
      expect(box?.width).toBeLessThanOrEqual(18);
    });
  }
});
