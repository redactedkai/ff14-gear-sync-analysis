/* The window of rows a Substat tiers card draws. A card has up to some 650 rows (about 1,450 over a job's cards), too many
   to keep in the page: drawing them all took about 0.3 s more per job or level change at 4x CPU slowdown, and the
   window of rows in view costs about a tenth of it. So a card draws the rows in its scroll area plus OVERSCAN_ROWS above
   and below, and pads the rest with the height they would take (the padding keeps the scroll bar and the scroll
   position true). Pure: sizes in px, rows by index. Used by components/tiers.js. */

/* Rows drawn above and below the ones in view: the list redraws once the view leaves the drawn rows, so the
   scrolling a wheel or key does in a frame stays inside them. */
export const OVERSCAN_ROWS = 20;
/* The rows `count` rows tall `rowHeight` px each that show in an area `areaHeight` px tall scrolled to `scrollTop`:
   {first, last}, the index of the first row in view and one past the last. Rows start at the area's top; the stuck
   column names cover the first of them, which does no harm here. */
export function rowsInView(scrollTop, areaHeight, rowHeight, count) {
  const first = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight)));
  const last = Math.min(count, Math.max(first, Math.ceil((scrollTop + areaHeight) / rowHeight)));
  return { first, last };
}

/* The rows to draw for a view {first, last} out of `count`: {from, to} (one past the last), the view plus OVERSCAN_ROWS
   each side. */
export function rowsToDraw({ first, last }, count) {
  return { from: Math.max(0, first - OVERSCAN_ROWS), to: Math.min(count, last + OVERSCAN_ROWS) };
}

/* Whether the rows drawn, {from, to}, miss part of the view {first, last} (a row that is in range of `count`). */
export function viewLeavesDrawn(drawn, { first, last }, count) {
  return (first < drawn.from && drawn.from > 0) || (last > drawn.to && drawn.to < count);
}

/* The scroll position (px) that puts the middle of row `index` in the middle of the rows' part of the area: the part
   under `namesHeight` px of stuck column names. The area clamps it at its ends. */
export function scrollTopToCenter(index, areaHeight, namesHeight, rowHeight) {
  return index * rowHeight + rowHeight / 2 - (areaHeight - namesHeight) / 2;
}
