/* Stories of <gsa-rank-note>: the "?" opens the note under itself with its right edge on the button's (and keeps it there when the
   page scrolls or the window narrows: the note is fixed to the window), names it and says the sentence; the "?" again, Escape (the
   focus back on the "?"), a press outside and the focus leaving it close it; the look of the "?" and the note in the dark scheme; axe. */
import { RANK_NOTE_BUTTON_ID, RANK_NOTE_ID, RANK_NOTE_NAME, RANK_NOTE_TEXT } from '../../../src/ui/elements/set-page/rank-note.ts';
import { expect, test } from '../fixtures.ts';
import { expectForcedColoursLook, styleOf, tapOutside, tokenColor } from '../look.ts';
import type { Default, InSettings } from './rank-note.story.js';

const STORY = 'set-page/rank-note/Default';
const BUTTON = `#${RANK_NOTE_BUTTON_ID}`;
const NOTE = `#${RANK_NOTE_ID}`;

/* The note's box and the button's, in px of the window. */
async function boxes(page: import('playwright/test').Page) {
  const note = await page.locator(NOTE).boundingBox();
  const button = await page.locator(BUTTON).boundingBox();
  if (!note || !button) {
    throw new Error('the note or its button has no box');
  }
  return { gap: note.y - (button.y + button.height), rightOffset: note.x + note.width - (button.x + button.width) };
}

test.describe('<gsa-rank-note>', () => {
  test('the "?" opens the named note under itself, right edge on the button; the "?" again, Escape, a press outside and the focus leaving it close it', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator(BUTTON);
    const note = page.locator(NOTE);
    await expect(note).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(note).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: RANK_NOTE_NAME })).toHaveText(RANK_NOTE_TEXT);
    // Zag shows the note a frame before it places it: poll until it hangs under the button
    await expect.poll(async () => Math.round((await boxes(page)).gap)).toBeGreaterThanOrEqual(0);
    const placed = await boxes(page);
    expect(placed.gap).toBeLessThanOrEqual(12);
    expect(Math.abs(placed.rightOffset)).toBeLessThan(2);
    expect(await axe()).toEqual([]);

    // the "?" again closes it
    await button.click();
    await expect(note).toBeHidden();

    // Escape closes it with the focus on the "?"
    await button.click();
    await expect(note).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(note).toBeHidden();
    await expect(button).toBeFocused();

    // a press outside closes it
    await button.click();
    await expect(note).toBeVisible();
    await component.getByRole('button', { name: 'Before' }).click();
    await expect(note).toBeHidden();

    // the focus leaving the note closes it (a press on the note's text puts the focus in it; the next Tab leaves it)
    await button.click();
    await expect(note).toBeVisible();
    await note.click();
    await expect(note).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(note).toBeHidden();
    // where the focus lands after the Tab differs by engine (Firefox restarts at the first control of the page), so only "not in the note" is asserted
    expect(await page.evaluate(selector => document.querySelector(selector)?.contains(document.activeElement), NOTE)).toBe(false);
  });

  test('the note goes with its "?" when the page scrolls and when the window narrows', async ({ mount, page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await mount<typeof Default>(STORY);
    await page.locator(BUTTON).click();
    await expect(page.locator(NOTE)).toBeVisible();
    await expect.poll(async () => Math.round((await boxes(page)).gap)).toBeGreaterThanOrEqual(0);
    const start = await boxes(page);

    const scrolled = await page.evaluate(() => {
      const before = scrollY;
      scrollBy(0, 40);
      return scrollY - before;
    });
    expect(scrolled, 'the page must scroll for this test to prove anything').toBeGreaterThan(0);
    await expect.poll(async () => Math.round((await boxes(page)).gap)).toBe(Math.round(start.gap));

    // the row is centred, so a narrower window moves the button; the note keeps its right edge on it
    await page.evaluate(() => scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.setViewportSize({ width: 960, height: 720 });
    await expect.poll(async () => Math.abs((await boxes(page)).rightOffset) < 2).toBe(true);
    expect((await boxes(page)).gap).toBeGreaterThanOrEqual(0);
    expect((await boxes(page)).gap).toBeLessThanOrEqual(12);
  });

  test('inside the settings popover, which moves with the window, the note still hangs under its "?" with its right edge on it', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 720 });
    await mount<typeof InSettings>('set-page/rank-note/InSettings');
    await page.locator('#sh-settings').click();
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
    await page.locator(BUTTON).click();
    await expect(page.locator(NOTE)).toBeVisible();
    // the popover is placed a frame after it shows, and the note follows it frame by frame
    const underButton = async () => {
      const got = await boxes(page);
      return got.gap >= 0 && got.gap <= 12 && Math.abs(got.rightOffset) < 2;
    };
    await expect.poll(underButton).toBe(true);

    // the window narrows: the centred gear moves, the popover with it, and the note goes after them
    await page.setViewportSize({ width: 1100, height: 720 });
    await expect.poll(underButton).toBe(true);
    await page.setViewportSize({ width: 960, height: 720 });
    await expect.poll(underButton).toBe(true);
  });

  test('the look in the dark scheme: a round "?" with the accent while open, a note on the raised surface with the accent border, fixed to the window above its layer', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const button = page.locator(BUTTON);
    const note = page.locator(NOTE);

    // closed: a plain round button, 22 px (the switch row's size)
    const closed = await button.boundingBox();
    expect(closed?.width).toBe(22);
    expect(closed?.height).toBe(22);
    expect(await styleOf(button, 'borderRadius')).toBe('50%');
    expect(await styleOf(button, 'color')).not.toBe(await tokenColor(page, '--accent'));

    await button.click();
    await expect(note).toBeVisible();
    expect(await styleOf(button, 'color')).toBe(await tokenColor(page, '--accent'));
    expect(await styleOf(button, 'borderTopColor')).toBe(await tokenColor(page, '--accent'));

    expect(await styleOf(note, 'backgroundColor')).toBe(await tokenColor(page, '--surface2'));
    expect(await styleOf(note, 'borderTopColor')).toBe(await tokenColor(page, '--accent'));
    expect(await styleOf(note, 'borderTopWidth')).toBe('1px');
    expect(await styleOf(note, 'width')).toBe('340px');
    // inside the settings layer the positioner is fixed to the window (its scroll box would cut an absolute note), over the layer
    expect(await styleOf(page.locator('[data-zag-part="positioner"]'), 'position')).toBe('fixed');
    const zIndexes = await page.evaluate(
      ([noteSelector, layerSelector]) => {
        const noteZ = Number(getComputedStyle(document.querySelector(noteSelector) as Element).zIndex);
        const layerZ = Number(getComputedStyle(document.querySelector(layerSelector) as Element).zIndex);
        return { noteZ, layerZ };
      },
      [NOTE, '.setpop'],
    );
    expect(zIndexes.noteZ).toBeGreaterThan(zIndexes.layerZ);
  });
});

test.describe('<gsa-rank-note> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the "?" opens the note, a tap on it again closes it, a tap outside closes it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const note = page.locator(NOTE);
    await page.locator(BUTTON).tap();
    await expect(note).toBeVisible();
    await page.locator(BUTTON).tap();
    await expect(note).toBeHidden();

    await page.locator(BUTTON).tap();
    await expect(note).toBeVisible();
    await tapOutside(page);
    await expect(note).toBeHidden();
  });
});

test.describe('<gsa-rank-note> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open note has an edge, and the "?" has a ring', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(BUTTON).click();
    const note = page.locator(NOTE);
    await expect(note).toBeVisible();
    await expectForcedColoursLook(page, { panel: note, ring: page.locator(BUTTON) });
  });
});
