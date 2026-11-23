// The Sheets tab in two browser tabs.

import { PAGE, STORE_KEY } from '../../lib/constants.mjs';
import { check, expect, same, stepRecord } from '../../lib/expect.mjs';
import { newPage, waitReady } from '../../lib/nav.mjs';
import { rowAction, sheetNames } from '../../lib/sheets.mjs';

/** Open the New sheet dialog from the manager (empty or not), pick `job`, type `name`, and create: the new sheet's page opens. */
async function createSheetByHand(page, job, name) {
  await page.locator('#sh-new-first, #sh-new').first().click();
  await page.click(`#sh-dialog [data-job-id=${job}]`);
  await page.fill('#sh-dlg-name', name);
  await page.click('#sh-dlg-ok');
  await expect(page.locator('#sh-sheet .crumbhere')).toHaveText(name);
}

/** From a sheet's page (or a set's) to the sheet manager, by the breadcrumb. */
async function toManager(page) {
  await page.locator('#sh-sheet .setcrumb a, #sh-set .setcrumb a').first().click();
  await expect(page.locator('#sh-manager')).toBeVisible();
}

/** The sheets' record keys and index, as another browser tab would find them in the shared storage. */
const storedSheets = page =>
  page.evaluate(key => {
    const records = {};
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name.startsWith(`${key}:sheet:`)) records[name.slice(`${key}:sheet:`.length)] = localStorage.getItem(name);
    }
    return { index: JSON.parse(localStorage.getItem(`${key}:sheets`) ?? 'null'), records };
  }, STORE_KEY);

/** Two browser tabs on the same saved sheets (docs/engineering/sheets.md, "Reading and writing": a tab reads fresh records
 * each time it opens the manager or a sheet; the last write of a sheet wins; there is no live sync; a sheet record the
 * index lacks is listed after the indexed ones; an unreadable record is listed with its cause and left alone). Two pages of
 * one browser context share localStorage, as two browser tabs do. Page A is the step's page, page B a second one. Checked:
 * B reads A's new sheet and set when it opens; B's open pages do not change under it (no live sync) until it opens the
 * manager or a sheet again; a rename in B is what A reads on its next open; two edits of one sheet leave the last saved
 * record whole and both managers list every sheet once; A's reorder is the order B reads; a sheet deleted in A that B
 * lists sends B to the manager (the sheet is gone), and one B still has open and edits is written back by B (the last
 * write wins) and listed once; a record the index lacks, an index naming a record that does not exist and a record this build
 * cannot read are listed as the docs say. Both pages must raise no page or console error (the runner reports those). */
export async function checkTwoTabs(pg) {
  const rec = stepRecord.getStore();
  const other = await newPage(pg.context());
  other.on('pageerror', e => rec.errors.push(`page error (second tab): ${e.message ?? e}`));
  other.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('ERR_')) rec.errors.push(`console error (second tab): ${m.text()}`);
  });
  const names = (page, table = '#sh-list') => sheetNames(page, table);
  const manager = async page => {
    await page.click('[data-tab=sheets]');
    await expect(page.locator('#tab-sheets')).toBeVisible();
  };
  const renameSheet = async (page, name, description) => {
    await page.click('#sh-edit');
    if (name !== null) await page.fill('#sh-dlg-name', name);
    if (description !== null) await page.fill('#sh-dlg-description', description);
    await page.click('#sh-dlg-ok');
    await expect(page.locator('#sh-dialog')).toHaveCount(0);
  };
  const open = (page, name) => page.locator('#sh-list a.sname', { hasText: new RegExp(`^${name}$`) }).click();

  // 1. A makes a sheet and a set; B, opening the page after that, reads both
  await manager(pg);
  await createSheetByHand(pg, 'SGE', 'Alpha');
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await toManager(pg);
  await other.goto(PAGE);
  await waitReady(other);
  await manager(other);
  check(same(await names(other), ['Alpha']), `two tabs: the second tab lists ${await names(other)}, not Alpha, when it opens`);
  await open(other, 'Alpha');
  check(
    same(await names(other, '#sh-sets'), ['Set 1']),
    `two tabs: the second tab shows the sets ${await names(other, '#sh-sets')}, not Set 1`,
  );

  // 2. A makes a second sheet; B's open page and its switch menu do not change (no live sync); opening the manager reads it
  await createSheetByHand(pg, 'WHM', 'Beta');
  await toManager(pg);
  check(same(await names(pg), ['Beta', 'Alpha']), `two tabs: the first tab lists ${await names(pg)}, not Beta, Alpha`);
  await other.click('#sh-sheet-switch');
  await expect(other.locator('#sh-sheet-menu')).toBeVisible();
  check(
    same(
      await other.locator('#sh-sheet-menu .setitem').allInnerTexts(),
      ['All sheets (1)', 'Alpha', '+ New sheet'].map(t => t),
    ),
    `two tabs: the second tab's switch menu changed under it, to ${await other.locator('#sh-sheet-menu .setitem').allInnerTexts()}`,
  );
  await other.keyboard.press('Escape');
  await expect(other.locator('#sh-sheet-menu')).toHaveCount(0);
  await toManager(other);
  check(same(await names(other), ['Beta', 'Alpha']), `two tabs: the second tab's manager lists ${await names(other)}, not Beta, Alpha`);

  // 3. B renames Alpha; A, with its manager still showing the old name, reads the new one when it opens the sheet
  await open(other, 'Alpha');
  await renameSheet(other, 'Alpha B', null);
  check(same(await names(pg), ['Beta', 'Alpha']), `two tabs: the first tab's manager changed under it, to ${await names(pg)}`);
  await open(pg, 'Alpha');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Alpha B');

  // 4. both edit Alpha B: A its name, then B (which still holds the name it saw) its description; B saved last, so the record
  // is B's whole: its name and its description; A's rename is lost, and nothing is torn or listed twice
  await renameSheet(pg, 'Alpha A', null);
  await renameSheet(other, null, 'from the second tab');
  const record = Object.values((await storedSheets(pg)).records)
    .map(text => JSON.parse(text))
    .find(sheet => sheet.name.startsWith('Alpha'));
  check(
    record.name === 'Alpha B' && record.description === 'from the second tab',
    `two tabs: the stored sheet is "${record.name}" / "${record.description}", not B's whole record "Alpha B" / "from the second tab"`,
  );
  await toManager(pg);
  await open(pg, 'Alpha B');
  await expect(pg.locator('#sh-description')).toHaveText('from the second tab');
  await toManager(pg);
  await toManager(other);
  for (const [which, page] of [
    ['first', pg],
    ['second', other],
  ]) {
    check(same(await names(page), ['Beta', 'Alpha B']), `two tabs: the ${which} tab lists ${await names(page)} after the two edits`);
    check(
      (await page.locator('#sh-unreadable').count()) === 0,
      `two tabs: the ${which} tab lists a sheet that cannot be read after the two edits`,
    );
  }
  const afterEdits = await storedSheets(pg);
  check(
    Object.keys(afterEdits.records).length === 2 && same([...afterEdits.index.order].sort(), Object.keys(afterEdits.records).sort()),
    `two tabs: the index ${JSON.stringify(afterEdits.index)} and the records ${Object.keys(afterEdits.records)} disagree after the two edits`,
  );

  // 5. A reorders (Beta below Alpha B, by keyboard); that order is what B reads
  await pg.locator('#sh-list tbody tr:nth-of-type(1) .draghandle').focus();
  await pg.keyboard.press('ArrowDown');
  check(same(await names(pg), ['Alpha B', 'Beta']), `two tabs: the first tab lists ${await names(pg)} after the move`);
  await open(other, 'Alpha B'); // the second tab's manager is stale (Beta first): opening a sheet reads fresh
  await toManager(other); // and the manager read fresh
  check(same(await names(other), ['Alpha B', 'Beta']), `two tabs: the second tab reads ${await names(other)}, not A's order Alpha B, Beta`);
  const moved = await storedSheets(pg);
  check(
    same(
      moved.index.order.map(id => JSON.parse(moved.records[id]).name),
      ['Alpha B', 'Beta'],
    ),
    `two tabs: the stored order is ${moved.index.order.map(id => JSON.parse(moved.records[id]).name)}, not Alpha B, Beta`,
  );

  // 6. A deletes Beta while B's switch menu (read before) still lists it: choosing it sends B to the manager, without Beta
  await open(other, 'Alpha B');
  await rowAction(pg, '#sh-list', 2, 'delete').click();
  await expect(pg.locator('#sh-dialog .question')).toContainText('Beta');
  await pg.click('#sh-dlg-ok');
  check(same(await names(pg), ['Alpha B']), `two tabs: the first tab lists ${await names(pg)} after deleting Beta`);
  await other.click('#sh-sheet-switch');
  check(
    (await other.locator('#sh-sheet-menu .setitem', { hasText: 'Beta' }).count()) === 1,
    'two tabs: the second tab no longer lists the deleted sheet in its switch menu before it read again',
  );
  await other.locator('#sh-sheet-menu .setitem', { hasText: 'Beta' }).click();
  await expect(other.locator('#sh-manager')).toBeVisible();
  check(same(await names(other), ['Alpha B']), `two tabs: the second tab lists ${await names(other)} after choosing the deleted sheet`);

  // 7. A deletes Alpha B while B has its page open; B's edit writes it back (the last write wins) and it is listed once
  await open(other, 'Alpha B');
  await rowAction(pg, '#sh-list', 1, 'delete').click();
  await expect(pg.locator('#sh-dialog .question')).toHaveTextParts(['Alpha B', 1]);
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-empty')).toBeVisible();
  await expect(other.locator('#sh-sheet .crumbhere')).toHaveText('Alpha B'); // B's open page is not taken away
  await renameSheet(other, 'Back from B', null);
  await createSheetByHand(pg, 'AST', 'Gamma'); // A, from its empty manager
  await toManager(pg);
  check(same(await names(pg), ['Gamma', 'Back from B']), `two tabs: the first tab lists ${await names(pg)} after B's write-back`);
  await toManager(other);
  check(same(await names(other), ['Gamma', 'Back from B']), `two tabs: the second tab lists ${await names(other)} after its write-back`);

  // 8. a record the index lacks comes last; an index naming a record that is not there is ignored; a record this build cannot
  // read is listed with its cause and kept, the sheets around it unharmed
  const state = await storedSheets(pg);
  const backId = state.index.order.find(id => JSON.parse(state.records[id]).name === 'Back from B');
  await pg.evaluate(
    ([key, kept]) => {
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: ['s_ghost', kept] })); // no record s_ghost; Gamma not listed
      localStorage.setItem(`${key}:sheet:s_future`, JSON.stringify({ v: 99, id: 's_future' }));
    },
    [STORE_KEY, backId],
  );
  await open(other, 'Back from B'); // opening a sheet reads fresh ...
  await toManager(other); // ... and so does the manager
  check(
    same(await names(other), ['Back from B', 'Gamma']),
    `two tabs: with Gamma missing from the index the list is ${await names(other)}, not Back from B, Gamma`,
  );
  await expect(other.locator('#sh-unreadable')).toContainText('s_future');
  check((await storedSheets(other)).records.s_future !== undefined, 'two tabs: the record this build cannot read was deleted on its own');
  await other.close();
  await pg.click('[data-tab=browse]');
}
