// The "?" note of a Substat tiers column: it sits under the pinned math bar when the page scrolls.

import { check, expect, placedByZag, poll } from '../../lib/expect.mjs';
import { showMath } from '../../lib/nav.mjs';

/** The pinned parts of the page (the math bar) the note `#t-pop` is drawn over: their names. */
const pinnedPartsUnderNote = pg =>
  pg.evaluate(() => {
    const note = document.querySelector('#t-pop').getBoundingClientRect();
    const over = [];
    for (const [name, sel] of Object.entries({ 'math bar': '#m-bar' })) {
      const part = document.querySelector(sel).getBoundingClientRect();
      const left = Math.max(note.left, part.left);
      const right = Math.min(note.right, part.right);
      const top = Math.max(note.top, part.top, 0);
      const bottom = Math.min(note.bottom, part.bottom);
      if (right - left < 8 || bottom - top < 8) {
        continue;
      }
      if (document.elementFromPoint((left + right) / 2, (top + bottom) / 2)?.closest('#t-pop')) {
        over.push(name);
      }
    }
    return over;
  });

/** A Substat tiers "?" note scrolled up under the pinned math bar is drawn under it, not over it. */
export async function checkTiersNoteUnderPinnedBar(pg) {
  await pg.setViewportSize({ width: 960, height: 720 });
  await showMath(pg, 'tiers');
  const button = pg.locator('#t-table [data-help="crit"]');
  await button.click();
  await expect(pg.locator('#t-pop')).toBeVisible();
  await placedByZag(pg, '#t-pop');
  // scroll until the note's top is 150 px under the window's top: the math bar is pinned by then (flush at the top, about 150 px
  // tall with its controls row), and the note's top is under the bar
  const scrolled = await pg.evaluate(() => {
    const before = scrollY;
    scrollBy(0, document.querySelector('#t-pop').getBoundingClientRect().top - 150);
    return scrollY - before;
  });
  check(scrolled > 0, 'the page did not scroll, so the note was not tested against the pinned bar');
  await poll('the Substat tiers note to sit under the pinned math bar', async () => {
    const over = await pinnedPartsUnderNote(pg);
    return { ok: over.length === 0, got: `drawn over the ${over.join(' and ')}` };
  });
  await pg.keyboard.press('Escape');
}
