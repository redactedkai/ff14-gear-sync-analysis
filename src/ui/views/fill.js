/* Partial fill for a saved gear set: which slots the optimizer must keep (the pinned ones), the button's label, and how a
   solve's result goes back onto the set's rows. Pure view helpers over plain data: no Alpine, no store, so Node can test
   them. The solve itself is core/recipe.js runRecipe (its `pins`), reached through ui/solver.js.

   A gear set here is the saved shape (docs/engineering/sheets.md, "Saved data"): `pieces` 12 rows in SLOT_TYPES order
   with 'ring' twice, each {slot, gameId, stones} or {slot} when empty; `meal` an allMeals key or null; `pinned`
   {pieces: [row indexes], meal: boolean}.

   Rules (sheets.md, "Pins and Fill"):
   - A pin counts only on a row that holds a piece, and only on a row the job uses (the off-hand row of a two-handed job is
     stored but not counted). Other pins are ignored, not errors.
   - The count is the used rows without a counted pin plus the meal when it is not pinned (food counts like a slot, and
     every set has a meal row); the two ring rows count one each. A meal pin counts only when a meal is chosen.
   - Nothing pinned: every slot is open and `pins` is null, so the solve is the plain one. Every slot pinned, the meal
     included: the count is 0 and the button is off. Every piece pinned and the meal open is a fill of the meal alone. */
import { SLOT_LABEL } from '../../core/constants.js';
import { hasPins } from '../../core/recipe.js';
import { plural } from '../helpers.js';
import { usedRows } from './saved-set.js';

/* The meal of `gearSet` that Fill keeps: its meal while the meal is pinned and there is one, else null. */
function pinnedMealOf(gearSet) {
  return gearSet.pinned?.meal && gearSet.meal ? gearSet.meal : null;
}

/* What a Fill of `gearSet` for `job` (a JobContext) keeps and changes. Returns {pins, pinnedRows, openRows, count, label,
   disabled}:
   - pins: runRecipe's `pins`, {pieces: [{slot, gameId, stones}], meal}, in row order, or null when nothing is pinned;
   - pinnedRows, openRows: row indexes of the counted pins, and of the other used rows;
   - mealOpen: true when the meal is not pinned (it is then one of the slots to fill);
   - count: openRows.length, plus 1 when mealOpen; label: "Fill 12 unpinned slots" ("Fill 1 unpinned slot", "Fill 0
     unpinned slots");
   - disabled: true when no slot is open (everything, the meal included, is pinned). */
export function fillPlan(job, gearSet) {
  const flagged = new Set(gearSet.pinned?.pieces ?? []);
  const pinnedRows = [];
  const openRows = [];
  for (const { index, row } of usedRows(job, gearSet)) {
    if (flagged.has(index) && row.gameId != null) pinnedRows.push(index);
    else openRows.push(index);
  }
  const meal = pinnedMealOf(gearSet);
  const mealOpen = !meal;
  const count = openRows.length + (mealOpen ? 1 : 0);
  const pieces = pinnedRows.map(i => ({
    slot: gearSet.pieces[i].slot,
    gameId: gearSet.pieces[i].gameId,
    stones: [...(gearSet.pieces[i].stones ?? [])],
  }));
  return {
    pins: hasPins({ pieces, meal }) ? { pieces, meal } : null,
    pinnedRows,
    openRows,
    mealOpen,
    count,
    label: `Fill ${plural(count, 'unpinned slot')}`,
    disabled: count === 0,
  };
}

/* The set's pieces and meal after a Fill: the rows of `gearSet` with `result` (an ok solve's `set`, core/set.js: pieces
   per active slot in panel order) put on the open rows by slot type; pinned rows, rows the job does not use, and a
   pinned meal stay as they were. Returns {pieces, meal}, new data (the set is not changed).
   The result lists a slot type's pieces with the pinned ones first (a pinned ring before the free one), so the open
   rows of a type take the result's pieces after the pinned ones, in row order. An open row the result leaves empty (a
   piece in another slot covers it) becomes {slot}. */
export function applyFill(job, gearSet, result) {
  const plan = fillPlan(job, gearSet);
  const pinned = new Set(plan.pinnedRows);
  const open = new Set(plan.openRows);
  const resultByType = new Map();
  for (const piece of result.pieces) resultByType.set(piece.slot, [...(resultByType.get(piece.slot) ?? []), piece]);

  // 1. per slot type, the result's pieces left for the open rows once the pinned rows of that type have had theirs
  const free = new Map();
  for (const [type, list] of resultByType) {
    const pinnedOfType = plan.pinnedRows.filter(i => gearSet.pieces[i].slot === type).length;
    free.set(type, list.slice(pinnedOfType));
  }

  // 2. the rows: open ones take the next free result piece of their type
  const pieces = gearSet.pieces.map((row, index) => {
    if (pinned.has(index) || !open.has(index)) return row;
    const next = free.get(row.slot)?.shift();
    if (!next || next.gameId == null) return { slot: row.slot };
    return { slot: row.slot, gameId: next.gameId, stones: next.stones.map(s => s && { ...s }) };
  });
  const meal = pinnedMealOf(gearSet) ?? result.meal ?? null;
  return { pieces, meal };
}

/* The plain line for one problem of a pin, `reason` as runRecipe's found.badPins gives it, `where` the pinned slot's name
   ("Ring") or null for a problem of the pins as a whole. */
function badPinText(job, reason, where) {
  switch (reason) {
    case 'missing':
      return `The piece pinned as ${where} is not in the game data.`;
    case 'slot':
      return `The piece pinned as ${where} is not a ${where} piece.`;
    case 'wearable':
      return `${job.jobName} cannot wear the piece pinned as ${where}.`;
    case 'relic':
      return `The piece pinned as ${where} is a relic whose substats the player allocates; Fill cannot count its stats.`;
    case 'conflict':
      return 'The pinned pieces cannot be worn together: two copies of a Unique piece, more than two rings, two in one slot, or one covers the slot of another.';
    case 'meal':
      return `The pinned meal is not one ${job.jobName} can eat.`;
    default:
      return `A pin cannot be kept (${reason}).`;
  }
}

/* One plain message per bad pin, in the order given. `badPins`: runRecipe's found.badPins, [{index (into pins.pieces, or
   null for the pins as a whole), reason}]; `pins`: the pins that were sent (names the slot). Returns an array of strings. */
export function badPinMessages(job, badPins, pins) {
  return badPins.map(({ index, reason }) => {
    const slot = index == null ? null : pins?.pieces?.[index]?.slot;
    return badPinText(job, reason, slot ? SLOT_LABEL[slot].toLowerCase() : 'piece');
  });
}

/* The pinned rows after dropping the pins named by `badPins` (runRecipe's found.badPins, indexes into fillPlan's
   pins.pieces; a problem of the pins as a whole, index null, drops nothing). Returns {pieces: row indexes still pinned,
   dropped: row indexes dropped}, for the sheet to save and to say which pins it dropped. */
export function dropBadPins(job, gearSet, badPins) {
  const plan = fillPlan(job, gearSet);
  const dropped = badPins.filter(b => b.index != null).map(b => plan.pinnedRows[b.index]);
  const kept = (gearSet.pinned?.pieces ?? []).filter(i => !dropped.includes(i));
  return { pieces: kept, dropped };
}
