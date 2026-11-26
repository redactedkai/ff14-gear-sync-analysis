/* The rules of a saved gear set's rows that every set page builder shares, written once: the rows the job uses, a row's
   name, and when two rows hold the same thing. A gear set is the saved shape (docs/engineering/sheets.md, "Saved
   data"): `pieces` 12 rows in SLOT_TYPES order with 'ring' twice, each {slot, gameId, stones} or {slot} when empty.
   Pure: no store. */
import { SLOT_LABEL } from '../../core/constants.ts';

/* Whether `job` (a JobContext) uses a row of slot `row.slot`: a row the job does not use (the off-hand of a two-handed
   job) keeps its piece in the saved set but is not shown, counted, filled or compared. */
export function isUsed(job, row) {
  return job.activeSlotTypes.includes(row.slot);
}

/* The rows of `gearSet` that `job` uses, in row order: [{index (the saved row's number), row}]. */
export function usedRows(job, gearSet) {
  return gearSet.pieces.flatMap((row, index) => (isUsed(job, row) ? [{ index, row }] : []));
}

/* Whether some row `job` uses holds a piece. */
export function holdsPiece(job, gearSet) {
  return usedRows(job, gearSet).some(({ row }) => row.gameId != null);
}

/* The meal row's name as the table labels it (the "<row> unpinned" line names it the same way). */
export const MEAL_ROW_LABEL = 'Food';

/* A saved row's name as the table labels it: the slot's name, the two ring rows "Ring 1" and "Ring 2". */
export function rowLabel(gearSet, index) {
  const slot = gearSet.pieces[index].slot;
  if (slot !== 'ring') {
    return SLOT_LABEL[slot];
  }
  return `Ring ${gearSet.pieces.slice(0, index + 1).filter(row => row.slot === 'ring').length}`;
}

/* A row's stones as one comparable text: a missing list is no stones, and empty materia slots at the end count for
   nothing ([null, null] is []), since a stone's place is its slot. */
function stonesKey(stones) {
  const list = [...(stones ?? [])];
  while (list.length && !list.at(-1)) {
    list.pop();
  }
  return JSON.stringify(list.map(stone => (stone ? [stone.stat, stone.grade] : null)));
}

/* Whether two saved rows hold the same piece with the same stones. An empty row is the same whether its game id is
   missing or null, and stones are compared by stonesKey, since an Auto-fill's rows, a piece picked by hand and an older save
   write an empty list either way. The draft's change count and an Auto-fill suggestion's both use it. */
export function sameRow(a, b) {
  return (a.gameId ?? null) === (b.gameId ?? null) && stonesKey(a.stones) === stonesKey(b.stones);
}
