/* Stories of <gsa-set-page>: a piece picked by hand opens a draft with Apply and Discard, and Discard puts the set back; leaving with a
   draft asks first, and Keep editing stays; Tab goes from the set's buttons to Auto-fill and the gear; an Auto-fill that fails (the
   solver rejects, answers with an error, or stops at its step limit) says so in a line and leaves the page as it was; a running
   Auto-fill locks the set (Cancel, and the question before leaving); axe. */
import { STEP_LIMIT_TEXT, failedText } from '../../../src/ui/views/set-suggestion.ts';
import { expect, test } from '../fixtures.ts';
import { FILL_ERROR_MESSAGE, HEAD_ROW, type Default, type FillFails, type FillHeld } from './set-page.story.ts';
import { focusInside } from '../layers.ts';

const STORY = 'set-page/set-page/Default';

test.describe('<gsa-set-page>', () => {
  test('a piece picked by hand opens a draft with Apply and Discard in place of Auto-fill; Discard puts the set back', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#sh-fill')).toBeVisible();
    await page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`).click();
    await page.locator('.pick-menu .same-item[data-game-id]').nth(1).click();
    // Zag gives the focus back to the piece button a frame after the pick; Discard comes after that, or it would take the focus off the Auto-fill button
    await expect(page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`)).toBeFocused();
    await expect(page.locator('#sh-apply')).toContainText('1 change');
    await expect(page.locator('#sh-fill')).toHaveCount(0);
    await expect(page.locator('#sh-figures')).toContainText('After');
    await page.locator('#sh-discard').click();
    await expect(page.locator('#sh-apply')).toHaveCount(0);
    await expect(page.locator('#sh-fill')).toBeFocused();
  });

  test('leaving with a draft asks first; Keep editing stays on the page with the draft', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`).click();
    await page.locator('.pick-menu .same-item[data-game-id]').nth(1).click();
    await expect(page.locator('#sh-apply')).toBeVisible();
    await page.locator('.setcrumb a').first().click();
    await expect(page.locator('#sh-leave-q')).toContainText('unapplied');
    await expect(page.locator('#sh-leave-keep')).toBeFocused();
    await page.locator('#sh-leave-keep').click();
    await expect(page.locator('#sh-leave')).toHaveCount(0);
    await expect(page.locator('#sh-apply')).toBeVisible();
  });

  test('Tab goes from the set buttons to Auto-fill and then to the gear', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#sh-set-delete').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#sh-fill')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Auto-fill settings' })).toBeFocused();
  });

  test('in the Auto-fill settings Tab goes through the Goal boxes in the order drawn, and back with Shift+Tab, with the popover kept open', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#sh-settings').click();
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
    await focusInside(page.locator('#sh-settings-dialog')); // the popover takes the focus a frame after it opens, over the box focused here
    await page.locator('#s-target').focus();
    const goal = ['s-tb1', 's-tb2', 's-gcd'];
    for (const id of goal) {
      await page.keyboard.press('Tab');
      await expect(page.locator(`#${id}`), `Tab to ${id}`).toBeFocused();
    }
    for (const id of ['s-tb2', 's-tb1', 's-target']) {
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator(`#${id}`), `Shift+Tab to ${id}`).toBeFocused();
    }
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
  });

  for (const [failure, expected] of [
    ['rejects', failedText(FILL_ERROR_MESSAGE)],
    ['error', failedText(FILL_ERROR_MESSAGE)],
    ['infeasible', STEP_LIMIT_TEXT],
  ] as const) {
    test(`an Auto-fill that fails (${failure}) shows its line and leaves the set, the buttons and the page free`, async ({
      mount,
      page,
      axe,
    }) => {
      await mount<typeof FillFails>('set-page/set-page/FillFails', { failure });
      const line = page.locator('#sh-fill-line');
      await expect(line).toBeHidden();
      await expect(page.locator('#sh-fill')).toBeEnabled();
      await page.locator('#sh-fill').click();

      // the line the player reads: an alert that names the failure, and nothing offered to apply
      await expect(line).toBeVisible();
      await expect(line).toHaveText(expected);
      await expect(line).toHaveAttribute('role', 'alert');
      await expect(page.locator('#sh-apply')).toHaveCount(0);
      await expect(page.locator('#sh-discard')).toHaveCount(0);

      // the run is over: Auto-fill can be pressed again, the set can be edited, and no Cancel is left
      await expect(page.locator('#sh-cancel')).toHaveCount(0);
      await expect(page.locator('#sh-fill')).toBeEnabled();
      await expect(page.locator('#sh-set-edit')).toBeEnabled();
      expect(await axe()).toEqual([]);

      // pressing it again shows the same one line again
      await page.locator('#sh-fill').click();
      await expect(line).toHaveText(expected);
      await expect(page.locator('#sh-fill-line')).toHaveCount(1);
    });
  }

  test('Keep editing returns the focus to the sets button', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(`.same-btn[data-pick="${HEAD_ROW}"]`).click();
    await page.locator('.pick-menu .same-item[data-game-id]').nth(1).click();
    await page.locator('.setcrumb a').first().click();
    await page.locator('#sh-leave-keep').click();
    await expect(page.locator('#sh-set-switch')).toBeFocused();
  });

  test('Cancel ends a running Auto-fill and the focus goes back to Auto-fill; Cancel is the only way on while it runs', async ({
    mount,
    page,
  }) => {
    await mount<typeof FillHeld>('set-page/set-page/FillHeld');
    await page.locator('#sh-fill').click();
    await expect(page.locator('#sh-cancel')).toBeVisible();
    // the Auto-fill button gives way to Cancel, and the gear and the goal leave the bar
    await expect(page.locator('#sh-fill')).toHaveCount(0);
    await expect(page.locator('#sh-settings')).toHaveCount(0);
    await expect(page.locator('#sh-goal')).toHaveCount(0);
    // every control that changes the set or its sheet is off, and a click on a pin changes nothing
    for (const selector of [
      '#sh-set-edit',
      '#sh-set-copy',
      '#sh-set-delete',
      `#sh-gear tr[data-row="${HEAD_ROW}"] [data-pick]`,
      `#sh-gear tr[data-row="${HEAD_ROW}"] .pinic`,
      '#sh-meal-btn',
    ]) {
      await expect(page.locator(selector), selector).toBeDisabled();
    }
    const pin = page.locator(`#sh-gear tr[data-row="${HEAD_ROW}"] .pinic`);
    const pressedBefore = await pin.getAttribute('aria-pressed');
    await pin.click({ force: true });
    await expect(pin).toHaveAttribute('aria-pressed', pressedBefore ?? 'false');

    await page.locator('#sh-cancel').click();
    await expect(page.locator('#sh-fill')).toBeEnabled();
    await expect(page.locator('#sh-fill')).toBeFocused();
    await expect(page.locator('#sh-set-edit')).toBeEnabled();
  });

  test('leaving a running Auto-fill asks: Keep waiting and the X stay with it running, Leave cancels it', async ({ mount, page }) => {
    await mount<typeof FillHeld>('set-page/set-page/FillHeld');
    await page.locator('#sh-fill').click();
    await expect(page.locator('#sh-cancel')).toBeVisible();
    await page.locator('.setcrumb a').first().click();
    await expect(page.locator('#sh-leave-q')).toBeVisible();
    await page.locator('#sh-leave-keep').click();
    await expect(page.locator('#sh-leave')).toHaveCount(0);
    await expect(page.locator('#sh-cancel')).toBeVisible();
    // the X at the question's top right is Keep too
    await page.locator('.setcrumb a').first().click();
    await page.locator('#sh-leave .dlgclose').click();
    await expect(page.locator('#sh-leave')).toHaveCount(0);
    await expect(page.locator('#sh-cancel')).toBeVisible();
    // Leave cancels the Auto-fill: the page's controls are on again
    await page.locator('.setcrumb a').first().click();
    await page.locator('#sh-leave-go').click();
    await expect(page.locator('#sh-leave')).toHaveCount(0);
    await expect(page.locator('#sh-cancel')).toHaveCount(0);
  });

  /* The pop-ups of the Auto-fill settings: the menu (or note) opens fully inside the window, with no scroll of its own and its text
     whole; its last rows belong to it and not to the page behind it; the popover gets no scrollbar of its own. The pop-ups float
     over the popover instead of being cut by its scroll box. */
  for (const { width, height } of [
    { width: 960, height: 900 },
    { width: 960, height: 700 },
    { width: 1925, height: 1000 },
  ]) {
    test(`at ${width} x ${height} the pop-ups of the Auto-fill settings open inside the window, whole and uncut, and Escape closes one layer at a time`, async ({
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height });
      try {
        await mount<typeof Default>(STORY);
        await page.locator('#sh-settings').click();
        const dialog = page.locator('#sh-settings-dialog');
        await expect(dialog).toBeVisible();
        for (const [what, openerSelector, buttonId, menuSelector] of [
          ['Gear categories menu', '#s-from', 's-from', '#s-from-menu'],
          ['Expansion menu', '#s-exp', 's-exp', '#s-exp-menu'],
          ['Spare points note', '#sh-settings-dialog .shelp', '', '#s-rank-pop'],
        ]) {
          await page.locator(openerSelector).click();
          const menu = page.locator(menuSelector);
          await expect(menu).toBeVisible();
          // Zag shows a pop-up a frame before it places it
          await expect
            .poll(() => menu.evaluate(element => element.closest<HTMLElement>('[data-part="positioner"]')?.style.getPropertyValue('--y')), {
              message: `${what} is placed`,
            })
            .toBeTruthy();
          await expect
            .poll(
              () =>
                page.evaluate(
                  ([menuSel]) => {
                    const element = document.querySelector(menuSel as string) as HTMLElement;
                    const box = element.getBoundingClientRect();
                    const owns = (x: number, y: number) => element.contains(document.elementFromPoint(x, y));
                    const popover = document.querySelector('#sh-settings-dialog') as HTMLElement;
                    const problems: string[] = [];
                    if (box.left < 0 || box.top < 0 || box.right > document.documentElement.clientWidth || box.bottom > innerHeight) {
                      problems.push(`outside the window: ${[box.left, box.top, box.right, box.bottom].map(Math.round)}`);
                    }
                    // the menu's own corners (a hair inside): clipped by the popover they would show what is behind it
                    if (!(owns(box.right - 6, box.bottom - 6) && owns(box.left + 6, box.top + 6))) {
                      problems.push('a corner belongs to the page behind it');
                    }
                    for (const each of element.querySelectorAll('span, small, p, label')) {
                      // an inline element has no client width in Chromium and WebKit (nothing to cut); Firefox gives it its text's width
                      if (each.clientWidth > 0 && each.scrollWidth > each.clientWidth + 1) {
                        problems.push(
                          `a text is cut: <${each.localName} class="${each.className}"> ${each.scrollWidth} in ${each.clientWidth}`,
                        );
                      }
                    }
                    if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
                      problems.push('the menu scrolls');
                    }
                    if (popover.scrollWidth > popover.clientWidth || popover.scrollHeight > popover.clientHeight) {
                      problems.push('the popover has a scrollbar');
                    }
                    return problems;
                  },
                  [menuSelector],
                ),
              { message: `${what} fits the window` },
            )
            .toEqual([]);
          // Escape closes the pop-up and keeps the popover; the focus goes back to the pop-up's button (the note's "?" takes none)
          if (buttonId) {
            await menu.locator('input').first().focus();
          }
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(dialog).toBeVisible();
          if (buttonId) {
            await expect(page.locator(`#${buttonId}`)).toBeFocused();
          }
        }
        // with every pop-up closed, the next Escape closes the popover
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });
  }

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
