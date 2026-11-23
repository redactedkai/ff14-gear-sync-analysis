// The Sheets tab: where a refused dialog shows its reason.

import { NARROW } from '../../lib/constants.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { hasHScroll } from '../../lib/nav.mjs';
import { rowAction, seedSheet } from '../../lib/sheets.mjs';
import { SHEET_GONE_TEXT } from '../../../../src/ui/sheets/store.js';

// White Mage, one gear set holding the Ironworks Magitek Cane (game id 8645) in its weapon row: no other healer wears it
const CANE_SHEET = pieceSheet('s_cane', 'Canes', 'WHM', 0, 8645, []);

/** The box of the first element `selector` matches, in page pixels. */
const boxOf = (pg, selector) =>
  pg
    .locator(selector)
    .first()
    .evaluate(el => {
      const { top, bottom, left, right, height } = el.getBoundingClientRect();
      return { top, bottom, left, right, height };
    });

/** The visible live regions of the open dialog: the reason is the only one. */
const visibleAlerts = pg => pg.locator('#sh-dialog [role=alert]:visible').count();

/** Where the main and Cancel buttons are now ([left, top] of each). */
const buttonSpots = pg =>
  pg.evaluate(() =>
    [...document.querySelectorAll('#sh-dialog .dlgbtns button')].map(button => {
      const { left, top } = button.getBoundingClientRect();
      return [left, top];
    }),
  );

/** A reason `message` (a selector) that sits in the row of `row` (a selector: the field's label row) at the right of the
 * label text `label`, above the field `field` and inside its width; the field is marked (`marked`: a selector that matches
 * only while the mark is on; `inField`: the reason sits inside the marked block, on the line of its label) and names the message (`describes`: a selector of the element whose aria-describedby holds
 * the message's id, or null when the field is a group). `what` names the case. */
async function checkAtField(pg, what, { message, row, label, field, marked, describes, inField = false }) {
  await expect(pg.locator(message)).toBeVisible();
  check((await visibleAlerts(pg)) === 1, `${what}: ${await visibleAlerts(pg)} live regions show, not one`);
  const [msg, rowBox, labelBox, fieldBox] = await Promise.all([boxOf(pg, message), boxOf(pg, row), boxOf(pg, label), boxOf(pg, field)]);
  check(
    msg.top >= rowBox.top - 1 && msg.bottom <= rowBox.bottom + 1,
    `${what}: the reason is outside its label row (${JSON.stringify([msg, rowBox])})`,
  );
  check(msg.left >= labelBox.right, `${what}: the reason is not at the right of the label text`);
  // a reason in a label row is above its field; the tick box's line is inside the warning block that is marked
  if (inField) check(msg.top >= fieldBox.top && msg.bottom <= fieldBox.bottom, `${what}: the reason is outside the marked block`);
  else check(msg.bottom <= fieldBox.top + 1, `${what}: the reason is not above the field`);
  check(msg.left >= fieldBox.left - 1 && msg.right <= fieldBox.right + 1, `${what}: the reason is wider than the field`);
  await expect(pg.locator(marked)).toBeVisible();
  if (describes) {
    const id = await pg.locator(message).getAttribute('id');
    await expect(pg.locator(describes)).toHaveAttribute('aria-describedby', id);
    await expect(pg.locator(describes)).toHaveAttribute('aria-invalid', 'true');
  }
}

/** The New sheet and Copy sheet dialogs at 960 px with a refused press: the reason sits in the label row of the field it is
 * about (the Name label, the Job label, the Copy warning's tick box line) at the right of the label text, or in the title row
 * when it is about no field (the sheet is gone, which the page cannot produce: the open Copy dialog is handed the reason the
 * store gives); the field is marked, the box is named by the reason (aria-describedby, aria-invalid), and the buttons stay
 * exactly where they were while the reason comes and goes. A blank name stays blank. An edit clears the reason. */
export async function checkDialogErrors(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, CANE_SHEET);
  await pg.click('[data-tab=sheets]');

  // New sheet, no job: the Job label row
  await pg.locator('#sh-new-first, #sh-new').first().click();
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  const resting = await buttonSpots(pg);
  await pg.click('#sh-dlg-ok');
  await checkAtField(pg, 'New sheet, no job', {
    message: '#sh-dlg-job-err',
    row: '#sh-dialog .jobpick > .f-head',
    label: '#sh-dialog .jobpick > .f-head > span',
    field: '#sh-dialog .jobrows',
    marked: '#sh-dialog .jobpick.invalid',
    describes: '#sh-dialog .jobrows',
  });
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(resting), 'New sheet, no job: the buttons moved when the reason showed');
  await pg.click('#sh-dialog [data-job-id=WHM]');
  await expect(pg.locator('#sh-dlg-job-err')).toBeHidden();
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(resting), 'New sheet, no job: the buttons moved when the reason went');

  // New sheet, blank name: the Name label row; the box stays empty and is marked
  await pg.fill('#sh-dlg-name', '');
  await pg.locator('#sh-dlg-name').press('Enter');
  await checkAtField(pg, 'New sheet, blank name', {
    message: '#sh-dlg-name-err',
    row: '#sh-dialog label:has(#sh-dlg-name) .f-head',
    label: '#sh-dlg-name-label',
    field: '#sh-dlg-name',
    marked: '#sh-dlg-name.invalid',
    describes: '#sh-dlg-name',
  });
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(resting), 'New sheet, blank name: the buttons moved');
  check(!(await hasHScroll(pg)), `Sheets: the New sheet dialog with a reason scrolls sideways at ${NARROW.width} px`);
  await pg.fill('#sh-dlg-name', 'Mine');
  await expect(pg.locator('#sh-dlg-name-err')).toBeHidden();
  check((await visibleAlerts(pg)) === 0, 'New sheet: a reason is still shown after the name was typed');
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(resting), 'New sheet, blank name: the buttons moved when the reason went');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // Copy sheet to a job that cannot wear the cane, Enter in the name box with the box unticked: the tick box line
  await rowAction(pg, '#sh-list', 1, 'copy').click();
  await pg.click('#sh-dialog [data-job-id=AST]');
  await expect(pg.locator('#sh-dlg-clear')).toBeVisible();
  const copyResting = await buttonSpots(pg);
  await pg.locator('#sh-dlg-name').press('Enter');
  await checkAtField(pg, 'Copy sheet, box not ticked', {
    message: '#sh-dlg-ack-err',
    row: '#sh-dlg-clear .ackrow',
    label: '#sh-dlg-clear .ackline',
    field: '#sh-dlg-clear',
    marked: '#sh-dlg-clear.invalid',
    describes: '#sh-dlg-ack',
    inField: true,
  });
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(copyResting), 'Copy sheet, box not ticked: the buttons moved');
  check(!(await hasHScroll(pg)), `Sheets: the Copy sheet dialog with a reason scrolls sideways at ${NARROW.width} px`);
  await pg.locator('#sh-dlg-ack').check();
  await expect(pg.locator('#sh-dlg-ack-err')).toBeHidden();
  check(
    JSON.stringify(await buttonSpots(pg)) === JSON.stringify(copyResting),
    'Copy sheet, box not ticked: the buttons moved when the reason went',
  );

  // the sheet is gone: no field, so the title row, at the right of the title; nothing is marked
  await pg.evaluate(text => {
    const data = window.gsaDebug.scope('#tab-sheets');
    data.dialog.error = text;
    data.dialog.errorField = '';
  }, SHEET_GONE_TEXT);
  await expect(pg.locator('#sh-dlg-title-err')).toBeVisible();
  check((await visibleAlerts(pg)) === 1, 'Copy sheet, sheet gone: not one live region shows');
  const [msg, titleRow, title] = await Promise.all([
    boxOf(pg, '#sh-dlg-title-err'),
    boxOf(pg, '#sh-dialog .dlgtitle'),
    boxOf(pg, '#sh-dlg-title'),
  ]);
  check(
    msg.top >= titleRow.top - 1 && msg.bottom <= titleRow.bottom + 1 && msg.left >= title.right,
    'Copy sheet, sheet gone: the reason is not in the title row, at the right of the title',
  );
  check((await pg.locator('#sh-dialog .invalid').count()) === 0, 'Copy sheet, sheet gone: a field is marked');
  check(JSON.stringify(await buttonSpots(pg)) === JSON.stringify(copyResting), 'Copy sheet, sheet gone: the buttons moved');
  await pg.fill('#sh-dlg-name', 'Copy of canes');
  await expect(pg.locator('#sh-dlg-title-err')).toBeHidden();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // back on the Gear browser for the runner (the shared setup's panel)
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
