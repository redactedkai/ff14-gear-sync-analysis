/* A click on a row of the sheet manager or of a sheet's gear sets (src/ui/components/sheets/open-row.js): it opens the sheet
   or the set, except when the click belongs to a control of the row or ends a text selection. The events are stand-ins
   shaped like the browser's: the row (currentTarget), the clicked element's closest(), and the page's selection. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { openRowPart } from '../../../../../src/ui/components/sheets/open-row.js';

/* The part with a store that records which sheet or set it was asked to open. */
function bind() {
  const opened = [];
  const part = Object.assign(openRowPart(), {
    sheets: { openSheet: id => opened.push(['sheet', id]), openSet: id => opened.push(['set', id]) },
  });
  return { part, opened };
}

/* A click on a row: `controlInRow` is the control the click landed in (null for plain cell content), `controlOutside`
   one found above the row (the page around a table). */
function click({ controlInRow = null, controlOutside = null } = {}) {
  const row = { contains: node => node === controlInRow };
  return { currentTarget: row, target: { closest: () => controlInRow ?? controlOutside } };
}

afterEach(() => {
  delete globalThis.getSelection;
});

test('a click on plain cell content opens the set or the sheet of its row', () => {
  const { part, opened } = bind();
  part.openRow('set', 'g_mine', click());
  part.openRow('sheet', 's_sage', click());
  assert.deepEqual(opened, [
    ['set', 'g_mine'],
    ['sheet', 's_sage'],
  ]);
});

test("a click on the row's own link, button or drag handle opens nothing here (the control does its own job)", () => {
  const { part, opened } = bind();
  part.openRow('set', 'g_mine', click({ controlInRow: { tag: 'a' } }));
  part.openRow('set', 'g_mine', click({ controlInRow: { tag: 'button' } }));
  assert.deepEqual(opened, []);
});

test('a control above the row (outside it) does not stop the row from opening', () => {
  const { part, opened } = bind();
  part.openRow('set', 'g_mine', click({ controlOutside: { tag: 'button' } }));
  assert.deepEqual(opened, [['set', 'g_mine']]);
});

test('a click that ends a text selection in the row opens nothing; an empty or other selection does not stop it', () => {
  const { part, opened } = bind();
  const selection = (text, inRow) => ({ isCollapsed: text === '', toString: () => text, containsNode: () => inRow });
  globalThis.getSelection = () => selection('Week 1', true);
  part.openRow('set', 'g_mine', click());
  assert.deepEqual(opened, [], 'selected text inside the row');
  globalThis.getSelection = () => selection('', true);
  part.openRow('set', 'g_mine', click());
  globalThis.getSelection = () => selection('elsewhere', false);
  part.openRow('set', 'g_other', click());
  assert.deepEqual(opened, [
    ['set', 'g_mine'],
    ['set', 'g_other'],
  ]);
});
