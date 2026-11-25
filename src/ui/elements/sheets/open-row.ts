/* Opening a row of the sheet manager or of a sheet's gear sets with a click anywhere on the row.
   The name link stays the keyboard and screen-reader way in: it is a real link, and the row itself has no role and no tab
   stop, so a screen reader announces one control per row. */

/* What inside a row handles its own click (the name link, the Edit / Copy / Delete buttons, the drag handle). */
const OWN_CLICK = 'a, button, input, select, textarea, label, [role="button"]';

/* Whether the page has text selected inside `row` (a click that ends a drag over the row's text is not a click on the row). */
function hasSelectionIn(row: Element): boolean {
  const selection = globalThis.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString() !== '' && selection.containsNode(row, true));
}

/* Whether `event` (a click handled on a row's `<tr>`) opens the row: false when it was on a control of the row's own (the link, a
   button, the drag handle) or ended a text selection. */
export function opensRow(event: MouseEvent): boolean {
  const row = event.currentTarget as Element;
  const control = (event.target as Element).closest(OWN_CLICK);
  if (control && row.contains(control)) {
    return false;
  }
  return !hasSelectionIn(row);
}
