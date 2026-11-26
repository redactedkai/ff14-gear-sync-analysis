/* Partial fill for a saved gear set: which slots the optimizer must keep (the pinned ones), the button's label, and how a
   solve's result goes back onto the set's rows. Pure view helpers over plain data: no store, so Node can test
   them. The solve itself is core/recipe.js runRecipe (its `pins`), reached through ui/solver.js.

   A gear set here is the saved shape (docs/engineering/sheets.md, "Saved data"): `pieces` 12 rows in SLOT_TYPES order
   with 'ring' twice, each {slot, gameId, stones} or {slot} when empty; `meal` an allMeals key or null; `pinned`
   {pieces: [row indexes], meal: boolean}.

   Rules (sheets.md, "Pins and Auto-fill"):
   - A pin counts only on a row that holds a piece, and only on a row the job uses (the off-hand row of a two-handed job is
     stored but not counted). Other pins are ignored, not errors.
   - The count is the used rows without a counted pin plus the meal when it is not pinned (food counts like a slot, and
     every set has a meal row); the two ring rows count one each. A meal pin counts only when a meal is chosen.
   - Nothing pinned: every slot is open and `pins` is null, so the solve is the plain one. Every slot pinned, the meal
     included: the count is 0 and the button is off. Every piece pinned and the meal open is a fill of the meal alone. */
import { hasPins } from '../../core/recipe.js';
import { joinNames, oneOrMany, plural } from '../text.ts';
import { usedRows } from './saved-set.js';

/* The meal of `gearSet` that Auto-fill keeps: its meal while the meal is pinned and there is one, else null. */
function pinnedMealOf(gearSet) {
  return gearSet.pinned?.meal && gearSet.meal ? gearSet.meal : null;
}

/* What an Auto-fill of `gearSet` for `job` (a JobContext) keeps and changes. Returns {pins, pinnedRows, openRows, count, label,
   disabled}:
   - pins: runRecipe's `pins`, {pieces: [{slot, gameId, stones}], meal}, in row order, or null when nothing is pinned;
   - pinnedRows, openRows: row indexes of the counted pins, and of the other used rows;
   - mealOpen: true when the meal is not pinned (it is then one of the slots to fill);
   - count: openRows.length, plus 1 when mealOpen; label: "Auto-fill 12 slots" ("Auto-fill 1 slot", "Auto-fill 0
     slots");
   - disabled: true when no slot is open (everything, the meal included, is pinned). */
export function fillPlan(job, gearSet) {
  const flagged = new Set(gearSet.pinned?.pieces ?? []);
  const pinnedRows = [];
  const openRows = [];
  for (const { index, row } of usedRows(job, gearSet)) {
    if (flagged.has(index) && row.gameId != null) {
      pinnedRows.push(index);
    } else {
      openRows.push(index);
    }
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
    label: `Auto-fill ${plural(count, 'slot')}`,
    disabled: count === 0,
  };
}

/* The set's pieces and meal after an Auto-fill: the rows of `gearSet` with `result` (an ok solve's `set`, core/set.ts: pieces
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
  for (const piece of result.pieces) {
    resultByType.set(piece.slot, [...(resultByType.get(piece.slot) ?? []), piece]);
  }

  // 1. per slot type, the result's pieces left for the open rows once the pinned rows of that type have had theirs
  const free = new Map();
  for (const [type, list] of resultByType) {
    const pinnedOfType = plan.pinnedRows.filter(i => gearSet.pieces[i].slot === type).length;
    free.set(type, list.slice(pinnedOfType));
  }

  // 2. the rows: open ones take the next free result piece of their type
  const pieces = gearSet.pieces.map((row, index) => {
    if (pinned.has(index) || !open.has(index)) {
      return row;
    }
    const next = free.get(row.slot)?.shift();
    if (!next || next.gameId == null) {
      return { slot: row.slot };
    }
    return { slot: row.slot, gameId: next.gameId, stones: next.stones.map(s => s && { ...s }) };
  });
  const meal = pinnedMealOf(gearSet) ?? result.meal ?? null;
  return { pieces, meal };
}

/* The line shown when the pinned pieces cannot be worn together. The page does not list the causes (two copies of a Unique
   piece, more than two rings, two in one slot, or one covering the slot of another); core/optimizer/candidates.js
   (buildCandidates) and core/recipe.js explain them where the search throws. */
export const PINS_CONFLICT_TEXT = 'The pinned pieces cannot be worn together.';

/* The line under the header after Auto-fill dropped pins: `names` the rows unpinned for a plain reason (a piece or meal that
   is missing, in the wrong slot, one the job cannot wear or eat), by the table's names ("Head", "Ring 2", MEAL_ROW_LABEL);
   `relicNames` the rows unpinned because the piece is a relic whose substats the player allocates. Names no reason: the
   rows are open again, so Auto-fill can fill them. Returns '' when nothing was unpinned. */
export function unpinnedText(names, relicNames) {
  const lines = [];
  if (names.length) {
    lines.push(`${joinNames(names)} unpinned. Auto-fill again to fill ${oneOrMany(names.length, 'it', 'them')}.`);
  }
  if (relicNames.length) {
    lines.push(`${joinNames(relicNames)} unpinned: Auto-fill can't count a relic's substats.`);
  }
  return lines.join(' ');
}

/* The plain line for a problem of the pins that names no row, `reason` as runRecipe's found.badPins gives it: the pins as a
   whole ('conflict') or an unknown reason. null for the problems that name a row (a piece or meal that cannot be used, a
   relic): the line under the header says those (unpinnedText). */
function badPinText(reason) {
  switch (reason) {
    case 'missing':
    case 'slot':
    case 'wearable':
    case 'meal':
    case 'relic':
      return null;
    case 'conflict':
      return PINS_CONFLICT_TEXT;
    default:
      return `A pin cannot be kept (${reason}).`;
  }
}

/* One plain line per problem of the pins that names no row, in the order given. `badPins`: runRecipe's found.badPins,
   [{index (into pins.pieces, or null for the pins as a whole), reason}]. Returns an array of strings, empty when every problem
   names a row. */
export function badPinMessages(badPins) {
  return badPins.map(({ reason }) => badPinText(reason)).filter(Boolean);
}

/* The pins left after dropping the ones named by `badPins` (runRecipe's found.badPins, indexes into fillPlan's pins.pieces).
   A problem with the meal ('meal') drops the meal pin; any other problem of the pins as a whole (index null: 'conflict')
   drops nothing. Returns {pieces: row indexes still pinned, dropped: row indexes dropped, relicRows: the dropped rows whose
   piece is a relic, mealDropped: whether the meal pin is dropped}, for the sheet to save and to say which pins it dropped. */
export function dropBadPins(job, gearSet, badPins) {
  const plan = fillPlan(job, gearSet);
  const dropped = badPins.filter(b => b.index != null).map(b => plan.pinnedRows[b.index]);
  const kept = (gearSet.pinned?.pieces ?? []).filter(i => !dropped.includes(i));
  const relicRows = badPins.filter(b => b.index != null && b.reason === 'relic').map(b => plan.pinnedRows[b.index]);
  return { pieces: kept, dropped, relicRows, mealDropped: badPins.some(b => b.reason === 'meal') };
}
