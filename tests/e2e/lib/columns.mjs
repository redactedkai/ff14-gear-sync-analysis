// Measuring a table's columns, for the checks that a column keeps its width whatever it shows.

/** The window sizes (width, height in px) the column checks measure at: the floor, a common laptop and the widest screen. */
export const COLUMN_WINDOWS = [
  [960, 700],
  [1280, 720],
  [2560, 1440],
];

/** What the page's `tableSelector` table looks like in pixels: `edges` (every heading's left and right edge), `rowHeights`
 * (every body row's height), `overflowing` (the body's number cells that hold text wider than the cell) and `sideways` (whether the
 * table's scroll box or the page scrolls sideways). */
export function measureColumns(pg, tableSelector) {
  return pg.evaluate(selector => {
    const table = document.querySelector(selector);
    const edges = [...table.querySelectorAll('thead th')].map(th => {
      const box = th.getBoundingClientRect();
      return [box.left, box.right];
    });
    const rowHeights = [...table.querySelectorAll('tbody tr')].map(row => row.getBoundingClientRect().height);
    const overflowing = [...table.querySelectorAll('td.n')]
      .filter(cell => cell.scrollWidth > cell.clientWidth + 0.5)
      .map(cell => `${cell.dataset.col ?? 'cell'} "${cell.textContent.trim()}"`);
    const scrollBox = table.closest('.tablewrap');
    const doc = document.documentElement;
    return { edges, rowHeights, overflowing, sideways: scrollBox.scrollWidth > scrollBox.clientWidth || doc.scrollWidth > doc.clientWidth };
  }, tableSelector);
}

/** Why `now` (a measureColumns result) differs from `before`, or '' when its column edges and row heights are the same to
 * half a pixel and nothing overflows or scrolls sideways. */
export function columnsDiffer(before, now) {
  const near = (a, b) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= 0.5);
  if (!near(now.edges.flat(), before.edges.flat())) {
    return `the column edges moved (${JSON.stringify(now.edges.map(e => e.map(Math.round)))} vs ${JSON.stringify(before.edges.map(e => e.map(Math.round)))})`;
  }
  if (!near(now.rowHeights, before.rowHeights)) return `a row's height changed (${now.rowHeights} vs ${before.rowHeights})`;
  if (now.overflowing.length)
    return `${now.overflowing.length} number cells hold text wider than the cell (${[...new Set(now.overflowing)].slice(0, 4).join(', ')})`;
  if (now.sideways) return 'the table or the page scrolls sideways';
  return '';
}
