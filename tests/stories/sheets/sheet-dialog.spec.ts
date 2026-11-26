/* Stories of <gsa-sheet-dialog>: the New sheet dialog is a modal box that keeps Tab inside, a refused Create shows its reason at the
   field, a job and a typed name are what Enter in the Name box creates, Escape and the X close it with the focus back on the button
   that opened it, and axe. */
import { expect, test } from '../fixtures.ts';
import type { Page } from 'playwright/test';
import { SHEET_GONE_TEXT } from '../../../src/ui/sheets/store-shared.ts';
import { OPENER_LABEL, TITLE, type Copy, type Default } from './sheet-dialog.story.js';

const STORY = 'sheets/sheet-dialog/Default';

test.describe('<gsa-sheet-dialog>', () => {
  test('a refused Create names the field, Tab stays inside the box, Escape and the X close it with the focus on the opener', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const box = page.getByRole('dialog', { name: TITLE });
    const opener = page.getByRole('button', { name: OPENER_LABEL });
    await expect(box).toBeVisible();
    await expect(page.locator('#sh-dlg-name')).toBeFocused();

    // no job chosen: Create is refused with the reason at the Job label, and the Job group is marked
    await page.locator('#sh-dlg-ok').click();
    await expect(page.locator('#sh-dlg-job-err')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Job' })).toHaveAttribute('aria-invalid', 'true');

    // Tab goes round the box and never reaches the button behind it
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab');
      expect(await box.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  /* Where a refused dialog shows its reason, at 960 px: in the label row of the field it is about, at the right of the label text,
     above the field (or, for the warning's tick box, on its line inside the marked block) and inside its width; the field is marked and
     named by the reason; one live region; and the buttons are where they were while the reason comes and goes. */
  const boxes = (page: Page, selectors: string[]) =>
    page.evaluate(list => list.map(selector => (document.querySelector(selector) as Element).getBoundingClientRect().toJSON()), selectors);
  const buttonSpots = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('#sh-dialog .dlgbtns button')].map(button => [
        button.getBoundingClientRect().left,
        button.getBoundingClientRect().top,
      ]),
    );
  const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  type ReasonAt = {
    message: string;
    row: string;
    label: string;
    field: string;
    marked: string;
    describes: string | null;
    inField?: boolean;
  };
  async function expectAtField(page: Page, what: string, { message, row, label, field, marked, describes, inField = false }: ReasonAt) {
    await expect(page.locator(message)).toBeVisible();
    expect(await page.locator('#sh-dialog [role=alert]:visible').count(), `${what}: one live region shows`).toBe(1);
    const [msg, rowBox, labelBox, fieldBox] = await boxes(page, [message, row, label, field]);
    expect(msg.top >= rowBox.top - 1 && msg.bottom <= rowBox.bottom + 1, `${what}: the reason is in its label row`).toBe(true);
    expect(msg.left, `${what}: the reason is at the right of the label text`).toBeGreaterThanOrEqual(labelBox.right);
    if (inField) {
      expect(msg.top >= fieldBox.top && msg.bottom <= fieldBox.bottom, `${what}: the reason is inside the marked block`).toBe(true);
    } else {
      expect(msg.bottom, `${what}: the reason is above the field`).toBeLessThanOrEqual(fieldBox.top + 1);
    }
    expect(msg.left >= fieldBox.left - 1 && msg.right <= fieldBox.right + 1, `${what}: the reason is no wider than the field`).toBe(true);
    await expect(page.locator(marked)).toBeVisible();
    if (describes) {
      const id = await page.locator(message).getAttribute('id');
      await expect(page.locator(describes)).toHaveAttribute('aria-describedby', id as string);
      await expect(page.locator(describes)).toHaveAttribute('aria-invalid', 'true');
    }
  }

  test('New sheet at 960 px: a refused press shows its reason in the label row of the Job or Name field, the field is marked, the buttons never move', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    try {
      await mount<typeof Default>(STORY);
      const resting = await buttonSpots(page);
      await page.locator('#sh-dlg-ok').click();
      await expectAtField(page, 'New sheet, no job', {
        message: '#sh-dlg-job-err',
        row: '#sh-dialog .jobpick > .f-head',
        label: '#sh-dialog .jobpick > .f-head > span',
        field: '#sh-dialog .jobrows',
        marked: '#sh-dialog .jobpick.invalid',
        describes: '#sh-dialog .jobrows',
      });
      expect(await buttonSpots(page), 'the buttons moved when the reason showed').toEqual(resting);
      await page.locator('#sh-dialog [data-job-id=WHM]').click();
      await expect(page.locator('#sh-dlg-job-err')).toBeHidden();
      expect(await buttonSpots(page), 'the buttons moved when the reason went').toEqual(resting);

      // a blank name: the Name label row; the box stays empty and is marked
      await page.locator('#sh-dlg-name').fill('');
      await page.locator('#sh-dlg-name').press('Enter');
      await expectAtField(page, 'New sheet, blank name', {
        message: '#sh-dlg-name-err',
        row: '#sh-dialog label:has(#sh-dlg-name) .f-head',
        label: '#sh-dlg-name-label',
        field: '#sh-dlg-name',
        marked: '#sh-dlg-name.invalid',
        describes: '#sh-dlg-name',
      });
      await expect(page.locator('#sh-dlg-name')).toHaveValue('');
      expect(await buttonSpots(page), 'the buttons moved with a blank name').toEqual(resting);
      expect(await noSideways(page), 'the dialog with a reason fits the window').toBe(true);
      await page.locator('#sh-dlg-name').fill('Mine');
      await expect(page.locator('#sh-dlg-name-err')).toBeHidden();
      expect(await page.locator('#sh-dialog [role=alert]:visible').count(), 'a reason is still shown after the name was typed').toBe(0);
      expect(await buttonSpots(page), 'the buttons moved when the name reason went').toEqual(resting);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('Copy sheet at 960 px: the unticked warning shows its reason on the tick box line, a reason about no field takes the title row, the buttons never move', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    try {
      await mount<typeof Copy>('sheets/sheet-dialog/Copy');
      await page.locator('#sh-dialog [data-job-id=AST]').click();
      await expect(page.locator('#sh-dlg-clear')).toBeVisible();
      const resting = await buttonSpots(page);
      await page.locator('#sh-dlg-name').press('Enter');
      await expectAtField(page, 'Copy sheet, box not ticked', {
        message: '#sh-dlg-ack-err',
        row: '#sh-dlg-clear .ackrow',
        label: '#sh-dlg-clear .ackline',
        field: '#sh-dlg-clear',
        marked: '#sh-dlg-clear.invalid',
        describes: '#sh-dlg-ack',
        inField: true,
      });
      expect(await buttonSpots(page), 'the buttons moved when the reason showed').toEqual(resting);
      expect(await noSideways(page), 'the dialog with a reason fits the window').toBe(true);
      await page.locator('#sh-dlg-ack').check();
      await expect(page.locator('#sh-dlg-ack-err')).toBeHidden();
      expect(await buttonSpots(page), 'the buttons moved when the reason went').toEqual(resting);

      // the sheet is gone: no field, so the title row, at the right of the title; nothing is marked (the page hands the dialog a view
      // with the reason; the next edit gives it a new one)
      await page.evaluate(text => {
        const dialog = document.querySelector('gsa-sheet-dialog') as HTMLElement & { view: Record<string, unknown> };
        dialog.view = { ...dialog.view, error: text, errors: { name: '', job: '', ack: '', title: text } };
      }, SHEET_GONE_TEXT);
      await expect(page.locator('#sh-dlg-title-err')).toBeVisible();
      expect(await page.locator('#sh-dialog [role=alert]:visible').count(), 'sheet gone: one live region shows').toBe(1);
      const [msg, titleRow, title] = await boxes(page, ['#sh-dlg-title-err', '#sh-dialog .dlgtitle', '#sh-dlg-title']);
      expect(
        msg.top >= titleRow.top - 1 && msg.bottom <= titleRow.bottom + 1 && msg.left >= title.right,
        'sheet gone: the reason is in the title row, at the right of the title',
      ).toBe(true);
      expect(await page.locator('#sh-dialog .invalid').count(), 'sheet gone: a field is marked').toBe(0);
      expect(await buttonSpots(page), 'sheet gone: the buttons moved').toEqual(resting);
      await page.locator('#sh-dlg-name').fill('Copy of canes');
      await expect(page.locator('#sh-dlg-title-err')).toBeHidden();
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('a picked job and a typed name are what Enter in the Name box creates', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await page.locator('[data-job-id="SGE"]').click();
    await expect(page.locator('[data-job-id="SGE"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#sh-dlg-name').fill('Mine');
    await page.locator('#sh-dlg-name').press('Enter');
    await expect(component.getByTestId('events')).toHaveText('["create:Mine:SGE"]');
    await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0);
    await expect(page.getByRole('button', { name: OPENER_LABEL })).toBeFocused();
  });

  test('the X closes it too', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0);
    await expect(page.getByRole('button', { name: OPENER_LABEL })).toBeFocused();
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
