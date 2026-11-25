/* A click on a row of the sheet manager or of a sheet's gear sets (src/ui/elements/sheets/open-row.ts): it opens the sheet or the
   set, except when the click belongs to a control of the row or ends a text selection. The events are stand-ins shaped like the
   browser's: the row (currentTarget), the clicked element's closest(), and the page's selection. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { opensRow } from '../../../../../src/ui/elements/sheets/open-row.ts';

/* A click on a row: `controlInRow` is the control the click landed in (null for plain cell content), `controlOutside`
   one found above the row (the page around a table). */
function click({ controlInRow = null, controlOutside = null } = {}) {
  const row = { contains: node => node === controlInRow };
  return { currentTarget: row, target: { closest: () => controlInRow ?? controlOutside } };
}

afterEach(() => {
  delete globalThis.getSelection;
});

test('a click on plain cell content opens its row', () => {
  assert.equal(opensRow(click()), true);
});

test("a click on the row's own link, button or drag handle opens nothing here (the control does its own job)", () => {
  assert.equal(opensRow(click({ controlInRow: { tag: 'a' } })), false);
  assert.equal(opensRow(click({ controlInRow: { tag: 'button' } })), false);
});

test('a control above the row (outside it) does not stop the row from opening', () => {
  assert.equal(opensRow(click({ controlOutside: { tag: 'button' } })), true);
});

test('a click that ends a text selection in the row opens nothing; an empty or other selection does not stop it', () => {
  const selection = (text, inRow) => ({ isCollapsed: text === '', toString: () => text, containsNode: () => inRow });
  globalThis.getSelection = () => selection('Week 1', true);
  assert.equal(opensRow(click()), false, 'selected text inside the row');
  globalThis.getSelection = () => selection('', true);
  assert.equal(opensRow(click()), true);
  globalThis.getSelection = () => selection('elsewhere', false);
  assert.equal(opensRow(click()), true);
});
