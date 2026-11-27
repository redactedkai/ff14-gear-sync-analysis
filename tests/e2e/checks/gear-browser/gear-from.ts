// A set page: the "Gear categories" menu.

import { ACTIVITY_KEYS } from '../../lib/constants.ts';
import { DEFAULT_EXCLUDE } from '../../lib/core-worker.ts';
import { check, expect, same } from '../../lib/expect.ts';
import { checkFromMenu, fromMenuFit, openFrom, setFrom, showTab, ticked, waitSaved } from '../../lib/nav.ts';

/** The browser's "Gear categories": the default boxes ticked, the button reads "11 of 20", the menu (tabs with the boxes' texts, one size
 * at every width from 960 px, inside the window; checkFromMenu) works; the market board switch off says so on the button, and the
 * choice is saved. */
export async function checkGearFrom(pg) {
  await showTab(pg, 'browse');
  const searchedDefault = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));
  const t0 = await ticked(pg, 'b');
  check(same(t0, searchedDefault), `listed by default: ${JSON.stringify(t0)}, expected ${JSON.stringify(searchedDefault)}`);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);

  // the menu at the narrowest supported window, then at the wide ones: the same width (436 px at the least) and the same height at every width
  const normal = pg.viewportSize();
  const sizes = [];
  for (const [width, height] of [
    [960, 900],
    [1280, 900],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await pg.setViewportSize({ width, height });
    await openFrom(pg, 'b');
    const fit = await fromMenuFit(pg, 'b');
    sizes.push([Math.round(fit.width), Math.round(fit.height)]);
    check(
      fit.box[0] >= 0 && fit.box[2] <= width && fit.box[3] <= height && !fit.pageSideways && !fit.menuScrolls,
      `the browser's Gear categories menu is not whole inside a ${width} x ${height} window: ${JSON.stringify(fit)}`,
    );
    // the menu stays over the page's card: its right edge is not past the card's (the card is 1,280 px wide at most, so on a wide
    // window the card's edge is well inside the window's)
    const edges = await pg.evaluate(() => ({
      menuRight: document.querySelector('#b-from-menu').getBoundingClientRect().right,
      cardRight: document.querySelector('#tab-browse .panel').getBoundingClientRect().right,
    }));
    check(
      edges.menuRight <= edges.cardRight + 1,
      `the browser's Gear categories menu passes the card's right edge at ${width} px: ${JSON.stringify(edges)}`,
    );
    await pg.keyboard.press('Escape');
  }
  check(
    sizes.every(size => size[0] === sizes[0][0] && size[1] === sizes[0][1]) && sizes[0][0] >= 436,
    `the Gear categories menu changes size with the window: ${JSON.stringify(sizes)}`,
  );
  await pg.setViewportSize(normal);

  // the menu's tabs, texts, keys and Escape
  await checkFromMenu(pg, 'b', '#b-lvl');

  // the market board switch off, then Crafted left out: both saved
  await setFrom(pg, 'b', 'market', false);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);
  await setFrom(pg, 'b', 'crafted', false);
  const savedOff = ACTIVITY_KEYS.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k)).join(',');
  await waitSaved(pg, `s => s.browse.market === false && s.browse.exclude.join() === ${JSON.stringify(savedOff)}`);
  await setFrom(pg, 'b', 'crafted', true);
  await setFrom(pg, 'b', 'market', true);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);

  // the closed field: the count, and the market glyph (gold included, red and slashed excluded)
  await checkFromField(pg, 'b');
}

const MARKET_OFF_WORDS = 'Market board gear not included';
const MARKET_ON_WORDS = 'Market board gear included';

/** The color a token resolves to on the page (what the glyph's color must equal), as the browser's computed rgb string. */
async function tokenColor(pg, token) {
  return pg.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/** The closed "Gear categories" field of `pre` ('b' the browser, 's' the Auto-fill settings), at 960 and 1280 px wide: the count
 * ("11 of 20", whole, not clipped) and always the market glyph with its accessible name and the button's title: with market board
 * gear on it is gold with no slash ("included"); with it off it is the delete button's red with the slash ("not included").
 * Leaves the switch on. */
export async function checkFromField(pg, pre) {
  const normal = pg.viewportSize();
  const count = `${ACTIVITY_KEYS.length - DEFAULT_EXCLUDE.length} of ${ACTIVITY_KEYS.length}`;
  const glyph = pg.locator(`#${pre}-from svg.from-market`);
  for (const [width, height] of [
    [960, 900],
    [1280, 900],
  ]) {
    await pg.setViewportSize({ width, height });
    const where = `${pre} at ${width} px`;
    await expect(pg.locator(`#${pre}-from`)).toHaveText(count);
    await expect(glyph).toBeVisible();
    check((await glyph.getAttribute('aria-label')) === MARKET_ON_WORDS, `${where}: the included glyph's accessible name`);
    check((await pg.getAttribute(`#${pre}-from`, 'title')) === MARKET_ON_WORDS, `${where}: the field's title when included`);
    check(
      (await glyph.evaluate(el => getComputedStyle(el).color)) === (await tokenColor(pg, '--gold')),
      `${where}: the included glyph is not gold`,
    );
    await expect(glyph.locator('.from-slash')).toBeHidden();

    await setFrom(pg, pre, 'market', false);
    await expect(glyph).toBeVisible();
    await expect(glyph.locator('.from-slash')).toBeVisible();
    check(
      (await glyph.evaluate(el => getComputedStyle(el).color)) === (await tokenColor(pg, '--danger')),
      `${where}: the excluded glyph is not the delete button's red`,
    );
    await expect(pg.locator(`#${pre}-from`)).toHaveText(count);
    check((await glyph.getAttribute('aria-label')) === MARKET_OFF_WORDS, `${where}: the glyph's accessible name`);
    check((await pg.getAttribute(`#${pre}-from`, 'title')) === MARKET_OFF_WORDS, `${where}: the field's title`);
    const named = await pg.getByRole('button', { name: /Gear categories.*market board/i }).count();
    check(named === 1, `${where}: the button's accessible name lacks the market board words`);
    const text = await pg.locator(`#${pre}-from .from-text`).evaluate(el => [el.scrollWidth, el.clientWidth]);
    check(text[0] <= text[1], `${where}: the count is clipped (${text[0]} px of ${text[1]} px)`);
    const box = await glyph.boundingBox();
    check(box.width >= 16 && box.width <= 18, `${where}: glyph ${box.width} px wide`);
    await setFrom(pg, pre, 'market', true);
  }
  await pg.setViewportSize(normal);
}
