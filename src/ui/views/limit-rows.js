/* A long menu list drawn in steps: how many rows the first step draws, how many each later step adds, and the cut of a
   grouped list to a row count. Drawing every row of a 300-piece menu at once is one 150 ms task at normal speed and
   about 1 s with a 4x slower processor; the first rows are drawn at once and the rest in later tasks (ui/draw-in-steps.js).
   Pure: no DOM. */

/* Rows drawn when a menu opens: a little over what its window shows (about 10 rows). */
export const FIRST_ROWS = 30;
/* Rows added by each later step. */
export const ROWS_PER_STEP = 40;

/* `groups` ([{label, items: [...]}, ...], other fields kept) cut to their first `limit` items in order; a group left
   with no item is dropped. A group is returned as it is when all its items fit. Returns a new array. */
export function limitRows(groups, limit) {
  let room = limit;
  const kept = [];
  for (const group of groups) {
    if (room <= 0) {
      break;
    }
    kept.push(group.items.length <= room ? group : { ...group, items: group.items.slice(0, room) });
    room -= group.items.length;
  }
  return kept;
}
