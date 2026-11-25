/* Stories of <gsa-stat-note>: the note opens under the pressed "?", is named by its heading, moves to another "?", and closes
   by Escape (the focus back on its "?") or a press outside; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './stat-note.story.js';

const STORY = 'math-page/stat-note/Default';

test.describe('<gsa-stat-note>', () => {
  test('opens from each "?", is named by its heading, moves with the press, and Escape or a press outside closes it', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const note = page.locator('#t-pop');
    const crit = component.getByRole('button', { name: /Critical Hit/ });
    const det = component.getByRole('button', { name: /Determination/ });
    await expect(note).toBeHidden();

    await crit.click();
    await expect(page.getByRole('dialog', { name: 'Critical Hit' })).toBeVisible();
    expect(await axe()).toEqual([]);
    const critBox = await crit.boundingBox();
    const noteBox = await note.boundingBox();
    expect(noteBox?.y).toBeGreaterThan((critBox?.y ?? 0) + (critBox?.height ?? 0));

    // a second "?" moves the note under itself (its left edge is 20 px left of the button's)
    await det.click();
    await expect(page.getByRole('dialog', { name: 'Determination' })).toBeVisible();
    const detBox = await det.boundingBox();
    const movedBox = await note.boundingBox();
    expect(Math.abs((movedBox?.x ?? 0) - ((detBox?.x ?? 0) - 20))).toBeLessThan(2);

    // the same "?" again closes it
    await det.click();
    await expect(note).toBeHidden();

    // Escape closes it with the focus on the "?" that opened it
    await crit.focus();
    await crit.click();
    await expect(note).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(note).toBeHidden();
    await expect(crit).toBeFocused();

    // a press outside closes it
    await crit.click();
    await expect(note).toBeVisible();
    await component.getByRole('textbox', { name: 'After the buttons' }).click();
    await expect(note).toBeHidden();
  });
});
