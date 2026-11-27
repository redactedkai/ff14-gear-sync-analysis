// Where the menus of a set page's table sit against the pinned headings: a Black Mage set synced to item level 40 with a
// draft (the Apply bar makes the pinned header tall), the Weapon row's piece menu (356 pieces) and a materia menu.

import { check, expect, poll } from '../../lib/expect.ts';
import { expectApplyCount, openSet, seedSheet } from '../../lib/sheets.ts';
import { edgeSheet } from '../sheets/edges.ts';
import type { Page } from 'playwright';

const WINDOW = { width: 960, height: 720 }; // the narrowest window; the page scrolls here with a draft

/** Open the Black Mage 40 sheet's set with a piece in the Hands row (a materia menu to open) and a draft of one change (a
 * piece picked in the Head row, not applied): the Apply bar is shown, as in the owner's report. */
async function openDraftSet(pg: Page) {
  await pg.setViewportSize(WINDOW);
  const sheet = edgeSheet('s_blm40', 'Black Mage 40', 'BLM', 40, { on: true, cap: 40 });
  await seedSheet(pg, sheet);
  await openSet(pg, sheet.name, 'Mine');
  await pickFirstPiece(pg, 4); // Hands: applied, so its materia slots show
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await pickFirstPiece(pg, 2); // Head: left as a draft
  await expectApplyCount(pg, 1);
}

/** Pick the first piece of row `row`'s menu. */
async function pickFirstPiece(pg: Page, row) {
  await pg.click(`#sh-gear tr[data-row="${row}"] [data-pick]`);
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expect(pg.locator('.pick-menu')).toBeHidden(); // the one menu element stays, hidden
}

/** The pinned parts of the page the menu must stay under: the sticky header and the column names. What each is, drawn
 * over `menuSel`'s box: the names of the pinned parts the menu is drawn over (the topmost thing at the middle of the part
 * of the menu that lies under that part is the menu's). */
function pinnedPartsUnderMenu(pg: Page, menuSel: string) {
  return pg.evaluate(menuSelector => {
    const menu = document.querySelector(menuSelector).getBoundingClientRect();
    const parts = { 'pinned header': '#sh-set .shead', 'column names': '#sh-gear thead th' };
    const over = [];
    for (const [name, sel] of Object.entries(parts)) {
      const part = document.querySelector(sel).getBoundingClientRect();
      const left = Math.max(menu.left, part.left);
      const right = Math.min(menu.right, part.right);
      const top = Math.max(menu.top, part.top, 0);
      const bottom = Math.min(menu.bottom, part.bottom);
      if (right - left < 8 || bottom - top < 8) {
        continue;
      }
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (hit?.closest(menuSelector)) {
        over.push(name);
      }
    }
    return over;
  }, menuSel);
}

/** Scroll the page until the box `buttonSel` (a menu's button) sits `depth` px under the window's top, so the pinned heading
 * covers it and the open menu under it reaches up under the heading; returns the scroll made. */
function scrollButtonUnderHeading(pg: Page, buttonSel: string, depth) {
  return pg.evaluate(
    ([selector, scrollDepth]) => {
      const before = scrollY;
      scrollBy(0, document.querySelector(selector).getBoundingClientRect().top - scrollDepth);
      return scrollY - before;
    },
    [buttonSel, depth],
  );
}

/** A table menu (the piece menu of the Weapon row, the materia menu of the Hands row) scrolled up under the pinned heading is
 * drawn under it, not over: the header and the column names stay on top of the menu's rows. */
export async function checkTableMenusUnderHeading(pg: Page) {
  await openDraftSet(pg);
  const menus = [
    ['the Weapon row piece menu', '#sh-gear tr[data-row="0"] [data-pick]', '.pick-menu'],
    ['the Hands row materia menu', '[data-chip="4:0"]', '.matpop'],
  ];
  for (const [what, buttonSel, menuSel] of menus) {
    await pg.click(buttonSel);
    await expect(pg.locator(menuSel)).toBeVisible();
    // the menu is open and placed; the page then scrolls, as a wheel does, until its button is under the heading
    await pg.waitForTimeout(300);
    check((await scrollButtonUnderHeading(pg, buttonSel, 20)) > 0, `${what}: the page did not scroll`);
    await poll(`${what} to sit under the pinned heading`, async () => {
      const over = await pinnedPartsUnderMenu(pg, menuSel);
      return { ok: over.length === 0, got: `drawn over the ${over.join(' and ')}` };
    });
    await pg.keyboard.press('Escape');
    await expect(pg.locator(menuSel)).toBeHidden();
    await pg.evaluate(() => scrollTo(0, 0));
  }
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}

/** The piece menu of the Weapon row opened with a draft in a 960 x 720 window: its button stays in sight below the column
 * names (the page scrolls to show the menu, not past its button), and the menu is under the button and inside the window. */
export async function checkPieceMenuKeepsButtonInSight(pg: Page) {
  await openDraftSet(pg);
  const buttonSel = '#sh-gear tr[data-row="0"] [data-pick]';
  await pg.click(buttonSel);
  await expect(pg.locator('.pick-menu')).toBeVisible();
  await poll('the Weapon button to stay below the column names with the menu under it, inside the window', async () => {
    const got = await pg.evaluate(buttonSelector => {
      const round = Math.round;
      const button = document.querySelector(buttonSelector).getBoundingClientRect();
      const menu = document.querySelector('.pick-menu').getBoundingClientRect();
      const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
      return {
        buttonTop: round(button.top),
        namesBottom: round(names.bottom),
        menuTop: round(menu.top),
        menuBottom: round(menu.bottom),
        window: innerHeight,
      };
    }, buttonSel);
    return { ok: got.buttonTop >= got.namesBottom && got.menuTop >= got.buttonTop && got.menuBottom <= got.window, got };
  });
  await pg.keyboard.press('Escape');
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}
