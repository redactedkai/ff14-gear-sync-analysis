// The "?" note of the Auto-fill settings' Spare points switch: it is fixed to the window (a Zag popover, <gsa-rank-note>), so it
// follows its button when the page scrolls or the window is resized.

import { check, expect, placedByZag, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { openSageSet, seedSheet } from '../../lib/sheets.mjs';

/** The note's box and its button's, in px of the window, rounded. */
const noteAndButton = pg =>
  pg.evaluate(() => {
    const round = Math.round;
    const note = document.querySelector('#s-rank-pop').getBoundingClientRect();
    const button = document.querySelector('#sh-settings-dialog [aria-controls="s-rank-pop"]').getBoundingClientRect();
    return {
      noteTop: round(note.top),
      noteRight: round(note.right),
      buttonBottom: round(button.bottom),
      buttonRight: round(button.right),
      gap: round(note.top - button.bottom),
    };
  });

/** The Spare points note stays under its "?" button and has its right edge on the button's, however the page moves it: a
 * page scroll (the settings popover is in the header, which scrolls until it sticks) and a window resize. */
export async function checkSparePointsNoteFollowsButton(pg) {
  await pg.setViewportSize({ width: 1600, height: 720 }); // wide: the page content is centred, so a narrower window moves the button
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  await pg.click('#sh-settings');
  await placedByZag(pg, '#sh-settings-dialog'); // the note is placed under its button, so the popover holding the button is placed first
  await pg.click('#sh-settings-dialog [aria-controls="s-rank-pop"]');
  await expect(pg.locator('#s-rank-pop')).toBeVisible();
  await placedByZag(pg, '#s-rank-pop');
  // the first placement can come a frame before the popover that holds the button has settled; the nested layer follows its anchor
  // every frame while open, so the note is under its button within a frame or two
  await poll('the note to open under its button', async () => {
    const got = await noteAndButton(pg);
    return { ok: got.gap >= 0 && got.gap <= 12, got: JSON.stringify(got) };
  });
  const start = await noteAndButton(pg);

  // the page scrolls: the note goes with its button
  const scrolled = await pg.evaluate(() => {
    const before = scrollY;
    scrollBy(0, 40);
    return scrollY - before;
  });
  check(scrolled > 0, 'the page did not scroll, so the note was not tested against a scroll');
  await poll('the Spare points note to stay under its button after the page scrolls', async () => {
    const got = await noteAndButton(pg);
    return { ok: got.gap === start.gap, got };
  });

  // the window is resized (the page at the top, so the resize moves the button and no scroll does): the note keeps its right
  // edge on its button's
  await pg.evaluate(() => scrollTo(0, 0));
  await poll('the page to be at the top', async () => ({ ok: (await pg.evaluate(() => scrollY)) === 0, got: 'scrolled' }));
  await pg.setViewportSize({ width: 1280, height: 720 });
  await poll('the Spare points note to keep its right edge on its button after a resize', async () => {
    const got = await noteAndButton(pg);
    return { ok: got.noteRight === got.buttonRight && got.gap >= 0 && got.gap <= 12, got };
  });
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
}
