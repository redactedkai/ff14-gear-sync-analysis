/* A click on a row of the sheet manager or of a sheet's gear sets (src/ui/elements/sheets/open-row.ts): it opens the sheet or the
   set, except when the click belongs to a control of the row or ends a text selection. The events are stand-ins shaped like the
   browser's: the row (currentTarget), the clicked element's closest(), and the page's selection. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { opensRow } from '../../../../../src/ui/elements/sheets/open-row.ts';
import { standsFor, stubGlobal } from '../../../helpers/fakes/dom-fakes.ts';

/* A click on a row: `controlInRow` is the control the click landed in (null for plain cell content), `controlOutside`
   one found above the row (the page around a table). */
function click({
  controlInRow = null,
  controlOutside = null,
}: {
  controlInRow?: object | null;
  controlOutside?: object | null;
} = {}): MouseEvent {
  const row = { contains: (node: unknown) => node === controlInRow };
  const event = { currentTarget: row, target: { closest: () => controlInRow ?? controlOutside } };
  standsFor<MouseEvent>(event);
  return event;
}

/* The functions that put back the globals a test replaced. */
const restores: (() => void)[] = [];

/* Makes the page's selection `text`, inside the row or not. */
function selectText(text: string, inRow: boolean): void {
  const selection = { isCollapsed: text === '', toString: () => text, containsNode: () => inRow };
  restores.push(stubGlobal('getSelection', () => selection));
}

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) {
    restore();
  }
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
  selectText('Week 1', true);
  assert.equal(opensRow(click()), false, 'selected text inside the row');
  selectText('', true);
  assert.equal(opensRow(click()), true);
  selectText('elsewhere', false);
  assert.equal(opensRow(click()), true);
});
