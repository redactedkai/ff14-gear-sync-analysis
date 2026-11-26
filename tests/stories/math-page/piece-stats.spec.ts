/* Stories of <gsa-piece-stats> (Stat Allocation): the look of its states in the dark scheme (the bars' segments in the page's tokens
   and abutting each other, the hatched cut, the materia outline, the marked slice, the clamp colour), the closed "step by step" panel
   taking no room beyond its summary, the two panels side by side from 1300 px and stacked below, the chart drawn at its box, the
   sentence in place of the panels while no sync applies, and axe. */
import { OFF_TEXT } from '../../../src/ui/views/sync-explainer.js';
import { expect, test } from '../fixtures.ts';
import { styleOf, tokenColor } from '../look.ts';
import { type Default, NO_SYNC } from './piece-stats.story.js';

const STORY = 'math-page/piece-stats/Default';
/* A body piece below the cap: it keeps its materia, so the bars show the meld segment. */
const BODY_BELOW_CAP = { ilvl: 120, slot: 'body', subs: ['crit', 'sps'], slots: null };

test.describe('<gsa-piece-stats>', () => {
  test('a piece above the cap: the bars are kept (accent), gained (gold), cut (hatched) and end at the cap mark, the segments abut and the slice of its slot is marked', async ({
    mount,
    page,
    axe,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await mount<typeof Default>(STORY);
    await expect(page.locator('#p-bars .bar').first()).toBeVisible();
    expect(await axe()).toEqual([]);

    const accent = await tokenColor(page, '--accent');
    const gold = await tokenColor(page, '--gold');
    const foreground = await tokenColor(page, '--fg');
    const surface2 = await tokenColor(page, '--surface2');
    const bars = page.locator('#p-bars .bar');
    const barCount = await bars.count();
    expect(barCount, 'the main stat, Vitality and the two substats').toBe(4);

    let sawRise = false;
    let sawCut = false;
    for (let index = 0; index < barCount; index += 1) {
      const bar = bars.nth(index);
      expect(await styleOf(bar, 'backgroundColor'), `bar ${index} track`).toBe(surface2);
      expect(await styleOf(bar.locator('.keep'), 'backgroundColor'), `bar ${index} kept part`).toBe(accent);
      expect(await styleOf(bar.locator('.rise'), 'backgroundColor'), `bar ${index} gained part`).toBe(gold);
      expect(await styleOf(bar.locator('.capmark'), 'backgroundColor'), `bar ${index} cap mark`).toBe(foreground);

      // the three segments sit one after another on the track: kept, then gained, then cut
      const track = (await bar.boundingBox()) as { x: number; width: number };
      const keep = (await bar.locator('.keep').boundingBox()) as { x: number; width: number };
      const rise = (await bar.locator('.rise').boundingBox()) as { x: number; width: number };
      const cut = (await bar.locator('.cut').boundingBox()) as { x: number; width: number };
      expect(Math.abs(keep.x - track.x)).toBeLessThan(1);
      expect(Math.abs(rise.x - (keep.x + keep.width))).toBeLessThan(1);
      if (rise.width > 0) {
        sawRise = true;
        expect(Math.abs(cut.x - (rise.x + rise.width))).toBeLessThan(1);
      }
      if (cut.width > 0) {
        sawCut = true;
        expect(await styleOf(bar.locator('.cut'), 'backgroundImage'), `bar ${index} cut part`).toContain('repeating-linear-gradient');
        expect(await styleOf(bar.locator('.cut'), 'opacity')).toBe('0.55');
        expect(cut.x + cut.width, 'the cut part stays on the track').toBeLessThanOrEqual(track.x + track.width + 1);
      }
      const mark = (await bar.locator('.capmark').boundingBox()) as { x: number; width: number };
      expect(mark.x, 'the cap mark is on the track').toBeGreaterThanOrEqual(track.x - 1);
      expect(mark.x).toBeLessThanOrEqual(track.x + track.width + 1);
      expect(Math.round(mark.width)).toBe(2);
    }
    expect(sawRise, 'a piece above the cap gains on its second substat, so some bar has a gold part').toBe(true);
    expect(sawCut, 'a piece above the cap loses points, so some bar has a hatched part').toBe(true);

    // a synced piece keeps no materia: the legend has no Materia box and the row's note says so
    await expect(page.locator('.legend .meldbox')).toHaveCount(0);
    await expect(page.locator('#p-bars .bar .meld')).toHaveCount(0);

    // the step-by-step panel: the slot's slice is the marked one, in the accent; a cut stat's clamp is in the "bad" colour
    await page.locator('#p-steps > summary').click();
    const marked = page.locator('#p-slices span.on');
    await expect(marked.first()).toBeVisible();
    expect(await marked.count(), 'some slices are marked and some are not').toBeLessThan(await page.locator('#p-slices span').count());
    for (const slice of await marked.all()) {
      expect(await styleOf(slice, 'backgroundColor')).toBe(accent);
      expect(await styleOf(slice, 'color')).toBe(await tokenColor(page, '--accent-fg'));
    }
    expect(await styleOf(page.locator('#p-slices span:not(.on)').first(), 'backgroundColor')).toBe(surface2);
    expect(await styleOf(page.locator('.steps-table .clamp').first(), 'color')).toBe(await tokenColor(page, '--bad'));
    expect(await axe(), 'the step table open').toEqual([]);
  });

  test('a piece below the cap keeps its materia: the stones are chips in the accent and each bar shows its meld segment in the accent outline', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY, { piece: BODY_BELOW_CAP });
    const accent = await tokenColor(page, '--accent');
    const chips = page.locator('#p-materia .meldchip.on');
    await expect(chips.first()).toBeVisible();
    expect(await styleOf(chips.first(), 'color')).toBe(accent);
    expect(await styleOf(chips.first(), 'borderTopColor')).toBe(accent);
    expect(await styleOf(chips.first(), 'borderTopStyle')).toBe('solid');

    const meld = page.locator('#p-bars .bar .meld').first();
    await expect(meld).toBeVisible();
    expect(await styleOf(meld, 'backgroundColor')).toBe(await tokenColor(page, '--accent-soft'));
    expect(await styleOf(meld, 'boxShadow')).toContain(accent);
    await expect(page.locator('.legend .meldbox')).toBeVisible();
    // no gain, no cut at or below the cap: no gold and no hatch
    for (const part of ['.rise', '.cut']) {
      const widths = await page
        .locator(`#p-bars .bar ${part}`)
        .evaluateAll(parts => parts.map(element => element.getBoundingClientRect().width));
      expect(Math.max(...widths), `${part} below the cap`).toBe(0);
    }
  });

  test('a closed "step by step" panel is its summary and padding only, and opens to the table', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const panel = page.locator('#p-steps');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveJSProperty('open', true);
    // the panel's flex gap must not add room for the hidden content (it once added 14 px)
    const extra = await panel.evaluate(element => {
      const style = getComputedStyle(element);
      const frame = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
        (sum, property) => sum + parseFloat(style[property as 'paddingTop']),
        0,
      );
      return element.getBoundingClientRect().height - frame - (element.querySelector('summary') as Element).getBoundingClientRect().height;
    });
    expect(Math.abs(extra)).toBeLessThan(1);
    await expect(page.locator('#p-out')).toBeHidden();

    await page.locator('#p-steps > summary').click();
    await expect(page.locator('#p-out')).toBeVisible();
    await expect(page.locator('.steps-table tbody tr').first()).toBeVisible();
  });

  test('the two panels sit side by side from 1300 px and stack below, the chart is drawn at its box, and the page never scrolls sideways', async ({
    mount,
    page,
  }) => {
    for (const [width, sideBySide] of [
      [1400, true],
      [960, false],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await mount<typeof Default>(STORY);
      await expect(page.locator('#p-curve-chart svg')).toBeVisible();
      const first = (await page.locator('#p-piece').boundingBox()) as { x: number; y: number; width: number; height: number };
      const second = (await page.locator('#p-curve').boundingBox()) as { x: number; y: number; width: number; height: number };
      if (sideBySide) {
        expect(Math.abs(first.y - second.y), `${width} px: same top`).toBeLessThan(1);
        expect(second.x).toBeGreaterThan(first.x + first.width - 1);
      } else {
        expect(second.y, `${width} px: the curve panel is under the piece panel`).toBeGreaterThan(first.y + first.height - 1);
      }
      // the chart is as wide as its box, so its text keeps the page's size
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const box = (document.querySelector('#p-curve-chart') as HTMLElement).clientWidth;
            const svg = (document.querySelector('#p-curve-chart svg') as SVGElement).getBoundingClientRect().width;
            return Math.abs(box - svg) <= 2;
          }),
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }
  });

  test('with no sync a sentence takes the place of the two panels and the step table still shows the piece', async ({
    mount,
    page,
    axe,
  }) => {
    await mount<typeof Default>(STORY, { sync: NO_SYNC, switchOn: false });
    await expect(page.locator('#m-off')).toHaveText(OFF_TEXT.off);
    await expect(page.locator('#p-piece')).toHaveCount(0);
    await expect(page.locator('#p-curve')).toHaveCount(0);
    await page.locator('#p-steps > summary').click();
    await expect(page.locator('.steps-table tbody tr').first()).toBeVisible();
    // without a sync the table has no "in the duty" columns
    await expect(page.locator('.steps-table thead th')).toHaveCount(2);
    expect(await axe()).toEqual([]);

    // the switch on with no item level entered says that instead
    await mount<typeof Default>(STORY, { sync: { cap: null, sync: false, level: 100 }, switchOn: true });
    await expect(page.locator('#m-off')).toHaveText(OFF_TEXT.needCap);
  });
});
