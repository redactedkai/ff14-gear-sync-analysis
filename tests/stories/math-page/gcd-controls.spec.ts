/* Stories of <gsa-gcd-controls>: a typed level is sent once typing stops, a pick in the Haste menu is sent, the Haste text stays inside
   its box (every option, 960 and 1280 px and a wider fallback font, one width for every pick, a box forced narrower cuts it), and axe. The keyboard
   model of the Haste menu is the select's own (tests/stories/shared/select.spec.ts). */
import type { Page } from 'playwright/test';
import { HASTE_OPTIONS } from '../../../src/ui/views/gcd.ts';
import { expect, test } from '../fixtures.ts';
import type { Default } from './gcd-controls.story.ts';

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

  /* The strip `width` px wide to the right of the Haste box, over its height: the number of pixels that differ from the strip's top
     left one (the background). Text spilled out of the box shows as such pixels. */
  async function inkRightOfHaste(page: Page, width: number): Promise<number> {
    const box = (await page.locator('#g-haste').boundingBox()) as { x: number; y: number; width: number; height: number };
    const png = await page.screenshot({ clip: { x: box.x + box.width + 2, y: box.y, width, height: box.height } });
    return page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let ink = 0;
      for (let at = 4; at < data.length; at += 4) {
        if (data[at] !== data[0] || data[at + 1] !== data[1] || data[at + 2] !== data[2]) {
          ink++;
        }
      }
      return ink;
    }, png.toString('base64'));
  }

  test('the Haste text stays inside its box: no option names a percent, every pick has one width, the longest fits at 960 and 1280 px and in a wider font, a box forced narrower cuts it', async ({
    mount,
    page,
  }) => {
    try {
      await mount<typeof Default>(STORY);
      expect(HASTE_OPTIONS.length, 'the Haste menu has job options').toBeGreaterThan(1);
      for (const option of HASTE_OPTIONS) {
        expect(option.label, `the Haste option "${option.label}" shows a percent or a list of them`).not.toMatch(/[%/]/);
      }
      const longest = HASTE_OPTIONS.reduce((a, b) => (b.label.length > a.label.length ? b : a));
      const pick = async (value: string) => {
        await page.locator('#g-haste').click();
        await page.locator(`#g-haste-list [role="option"][data-value="${value}"]`).click();
        await expect(page.locator('#g-haste')).toHaveAttribute('data-value', value);
      };
      for (const [width, font] of [
        [960, null],
        [1280, null],
        [960, 'Verdana, sans-serif'],
      ] as const) {
        const where = `at ${width} px${font ? ` in ${font}` : ''}`;
        await page.setViewportSize({ width, height: 700 });
        await page.evaluate(
          fontFamily =>
            fontFamily
              ? document.documentElement.style.setProperty('--sans', fontFamily)
              : document.documentElement.style.removeProperty('--sans'),
          font,
        );
        await pick(longest.value);
        const fit = await page.locator('#g-haste').evaluate(select => {
          const style = getComputedStyle(select);
          const text = (select.textContent ?? '').trim();
          const canvas = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
          canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const border = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
          return {
            text,
            textWidth: canvas.measureText(text).width,
            roomWidth:
              select.getBoundingClientRect().width - border - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
            scrollWidth: select.scrollWidth,
            clientWidth: select.clientWidth,
          };
        });
        expect(fit.text, `the Haste select shows the longest option ${where}`).toBe(longest.label);
        expect(fit.textWidth, `"${fit.text}" fits the room in the box ${where}`).toBeLessThanOrEqual(fit.roomWidth);
        expect(fit.scrollWidth, `the content fits the box ${where}`).toBeLessThanOrEqual(fit.clientWidth);
        // the box is as wide as for the longest text whatever is picked: picking moves nothing
        const widths = new Set<number>();
        for (const option of HASTE_OPTIONS) {
          await pick(option.value);
          widths.add(Math.round(((await page.locator('#g-haste').boundingBox()) as { width: number }).width));
        }
        expect(widths.size, `the Haste select's width changes with the pick (${[...widths].join(', ')} px) ${where}`).toBe(1);
        await pick(longest.value);
      }

      // a box narrower than the text: it is cut at the box, nothing is drawn beside it
      await page.evaluate(() => {
        const select = document.querySelector('#g-haste') as HTMLElement;
        (select.closest('.mctl') as HTMLElement).style.width = '120px';
        select.style.cssText = 'width: 120px; min-width: 0';
      });
      expect(await inkRightOfHaste(page, 60), 'the Haste select, forced to 120 px, drew text outside its box').toBe(0);
    } finally {
      await page.evaluate(() => document.documentElement.style.removeProperty('--sans'));
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
