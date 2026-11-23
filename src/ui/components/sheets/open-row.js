/* Opening a row of the sheet manager or of a sheet's gear sets with a click anywhere on the row.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets (frame.js).
   The name link stays the keyboard and screen-reader way in: it is a real link, and the row itself has no role and no tab
   stop, so a screen reader announces one control per row. */

/* What inside a row handles its own click (the name link, the Edit / Copy / Delete buttons, the drag handle). */
const OWN_CLICK = 'a, button, input, select, textarea, label, [role="button"]';

/* Whether the page has text selected inside `row` (a click that ends a drag over the row's text is not a click on the row). */
function hasSelectionIn(row) {
  const selection = globalThis.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString() !== '' && selection.containsNode(row, true));
}

/* Returns the part's members. */
export function openRowPart() {
  return {
    /* A click on row `id` of list `kind` ('sheet' or 'set'; `event` the click, handled on the row's <tr>): opens the sheet or
       the set, unless the click was on a control of the row's own (the link, a button, the drag handle) or ended a text
       selection. */
    openRow(kind, id, event) {
      const row = event.currentTarget;
      const control = event.target.closest(OWN_CLICK);
      if (control && row.contains(control)) return;
      if (hasSelectionIn(row)) return;
      if (kind === 'sheet') this.sheets.openSheet(id);
      else this.sheets.openSet(id);
    },
  };
}
