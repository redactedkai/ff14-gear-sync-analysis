/* Story of <gsa-cap-field>: the keys of its number box as the element implements them (typed digits wait and commit once, Enter commits
   at once, an arrow key steps at once, text that is no item level is an error and commits nothing; there is no Escape rule), the cap
   lowered to what a lower level allows, and axe. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './cap-field.story.js';

const STORY = 'app/cap-field/Default';
// the highest item level the best gear made for level 40 has (capCeiling in core/sync-target.ts): what a cap at level 40 is lowered to
const CAP_AT_LEVEL_40 = 43;

test.describe('<gsa-cap-field>', () => {
  test('typing commits the whole number once, an arrow key steps at once, and text that is no item level is an error', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const cap = page.locator('#cap');
    await expect(cap).toHaveValue('300');

    // "2", "20" and "200" typed: the numbers on the way are held back, Enter commits the whole number
    await cap.selectText();
    await cap.pressSequentially('200');
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('[200]');

    // an arrow key is a step: committed at once
    await page.keyboard.press('ArrowUp');
    await expect(events).toHaveText('[200,201]');

    // 0 is no item level: the error shows, the box is invalid, and nothing is committed
    await cap.fill('0');
    await expect(page.locator('#cap-error')).toBeVisible();
    await expect(cap).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('[200,201]');
  });

  test('a level that allows less lowers the cap, with a note', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const cap = page.locator('#cap');
    await page.getByRole('button', { name: 'Lower the level' }).click();
    await expect(cap).toHaveValue(String(CAP_AT_LEVEL_40));
    await expect(component.getByTestId('events')).toHaveText(`[${CAP_AT_LEVEL_40}]`);
    await expect(cap).toHaveClass(/lowered/);
    await expect(page.locator('#cap-lowered')).toContainText(String(CAP_AT_LEVEL_40));
  });

  test('the up arrow at the limit lowers the cap again each press, and the note stays shown instead of hiding and showing', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const cap = page.locator('#cap');
    await page.getByRole('button', { name: 'Lower the level' }).click();
    await expect(cap).toHaveValue(String(CAP_AT_LEVEL_40));
    const note = page.locator('#cap-lowered');
    await expect(note).toContainText(String(CAP_AT_LEVEL_40));
    // counts every time the note is hidden (the page's panel jumped when it was)
    await note.evaluate(element => {
      (window as unknown as { noteHidden: number }).noteHidden = 0;
      new MutationObserver(() => {
        if ((element as HTMLElement).style.display === 'none') {
          (window as unknown as { noteHidden: number }).noteHidden++;
        }
      }).observe(element, { attributes: true, attributeFilter: ['style'] });
    });
    await cap.focus();
    for (let press = 0; press < 5; press++) {
      await page.keyboard.press('ArrowUp');
      // two frames: the step, the lowering again and the new draw have happened
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    }
    await expect(cap).toHaveValue(String(CAP_AT_LEVEL_40));
    await expect(note).toContainText(String(CAP_AT_LEVEL_40));
    expect(await page.evaluate(() => (window as unknown as { noteHidden: number }).noteHidden), 'the note hid and showed again').toBe(0);
    // each press stepped to 44 and was lowered to 43 again: the page was told of both
    await expect(component.getByTestId('events')).toHaveText(
      `[${CAP_AT_LEVEL_40}${`,${CAP_AT_LEVEL_40 + 1},${CAP_AT_LEVEL_40}`.repeat(5)}]`,
    );
  });

  test('the field keeps its line in every state: text that is no cap, a valid cap and a lowered cap', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const cap = page.locator('#cap');
    // what the line is made of: the label's height and the box's height and left edge
    const shape = () =>
      page.evaluate(() => {
        const label = document.querySelector('label[for=cap]') as HTMLElement;
        const input = document.querySelector('#cap') as HTMLElement;
        const labelBox = label.getBoundingClientRect();
        const inputBox = input.getBoundingClientRect();
        return {
          labelHeight: labelBox.height,
          inputTop: inputBox.top,
          inputLeft: inputBox.left,
          inputWidth: inputBox.width,
          inputHeight: inputBox.height,
        };
      });
    const valid = await shape();
    await cap.fill('0');
    await expect(page.locator('#cap-error')).toBeVisible();
    expect(await shape(), 'text that is no cap moved the line').toEqual(valid);
    await cap.fill('300');
    await page.keyboard.press('Enter');
    await expect(page.locator('#cap-error')).toBeHidden();
    await page.getByRole('button', { name: 'Lower the level' }).click();
    await expect(page.locator('#cap-lowered')).toContainText(String(CAP_AT_LEVEL_40));
    expect(await shape(), 'a lowered cap moved the line').toEqual(valid);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
