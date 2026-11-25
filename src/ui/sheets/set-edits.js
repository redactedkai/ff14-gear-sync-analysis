/* The edits a player makes by hand on a set page (a piece, a stone, the meal, a pin), as pure functions: each takes a saved
   GearSet and returns new plain data, never changing its argument. The menus that offer these edits are piece-menu.js,
   stone-menu.js and set-meal-menu.js. Pure: no store. */
import { poolItemById, slotInfo } from '../../core/items.js';
import { meldSlots } from '../../core/meld.js';
import { isUsed, rowLabel } from './saved-set.js';

/* Said under an Off-hand row that a held two-handed weapon covers (its control is disabled); placePiece refuses a shield for
   the same reason. */
export const SHIELD_NEEDS_ONE_HANDED = 'Only a one-handed weapon allows a shield.';

/* A copy of a GearSet deep enough to edit (rows, stones and pins copied). */
export function editableCopy(gearSet) {
  return {
    ...gearSet,
    pieces: gearSet.pieces.map(row => (row.gameId == null ? { slot: row.slot } : { ...row, stones: [...(row.stones ?? [])] })),
    pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: Boolean(gearSet.pinned?.meal) },
  };
}

/* `gearSet` with row `index` pinned or not (`on`); new data. */
export function withPin(gearSet, index, on) {
  const rows = new Set(gearSet.pinned?.pieces ?? []);
  if (on) {
    rows.add(index);
  } else {
    rows.delete(index);
  }
  return { ...gearSet, pinned: { meal: Boolean(gearSet.pinned?.meal), pieces: [...rows].sort((a, b) => a - b) } };
}

/* `gearSet` with its meal pinned or not; new data. */
export function withMealPin(gearSet, on) {
  return { ...gearSet, pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: Boolean(on) } };
}

/* Whether the other ring row of `gearSet` already holds the Unique ring `gameId` (a Unique ring is worn once). */
export function uniqueTaken(job, gearSet, index, gameId) {
  const item = poolItemById(job, gameId);
  if (item?.type !== 'ring' || item.copies !== 1) {
    return false;
  }
  return gearSet.pieces.some((row, i) => i !== index && row.slot === 'ring' && row.gameId === gameId);
}

/* The note after a piece took others off: `names` the names of the pieces removed, `cause` what took them off (a
   two-handed weapon, or the name of the covering piece), e.g. "Tidal Wave Buckler removed due to two-handed weapon." */
export function removedNote(names, cause = 'two-handed weapon') {
  return `${names.join(' and ')} removed due to ${cause}.`;
}

/* Whether a piece worn in a row of `gearSet` other than `index` covers slot type `slot` (a two-handed weapon the
   Off-hand, a cloak the head) and the job uses that row. */
function coveredByWorn(job, gearSet, index, slot) {
  return gearSet.pieces.some((row, i) => {
    if (i === index || row.gameId == null || !isUsed(job, row)) {
      return false;
    }
    const worn = poolItemById(job, row.gameId);
    return Boolean(worn) && slotInfo(job, worn).blocks.includes(slot);
  });
}

/* Row `index` of `gearSet` given the piece `gameId` (from the piece picker), with its materia slots empty, and pinned:
   a piece chosen by hand is one Auto-fill keeps. `gameId` null empties the row and unpins it. A weapon that takes both
   hands (its slot code blocks the Off-hand, e.g. a 2H cane for White Mage) or covers other slots (a cloak covers the head)
   also empties and unpins the rows it blocks that the job uses and that hold a piece (a shield, a head): the pick and the
   removal are one change, so Discard restores both.
   Returns {ok: true, gearSet, note ("Head: Rainbow Cap of Healing (pinned)"), removedNote (removedNote(names): "Tidal Wave
   Buckler removed due to two-handed weapon.", '' when nothing was removed)} or {ok: false} for a Unique ring already in the other
   ring row, or a piece for a row that a worn piece covers (a shield under a two-handed weapon, a head under a cloak). Neither
   is offered: the picker disables the ring ("Unique, in the other ring") and a covered row's control is disabled, so the
   refusal has no note of its own. */
export function placePiece(job, gearSet, index, gameId) {
  const label = rowLabel(gearSet, index);
  if (gameId == null) {
    const pieces = gearSet.pieces.map((row, i) => (i === index ? { slot: row.slot } : row));
    return { ok: true, gearSet: withPin({ ...gearSet, pieces }, index, false), note: `${label}: emptied`, removedNote: '' };
  }
  const item = poolItemById(job, gameId);
  if (uniqueTaken(job, gearSet, index, gameId)) {
    return { ok: false };
  }
  // a piece for a row a worn piece covers (a shield under a two-handed weapon, a head under a cloak): refused (the row's
  // control is disabled; Auto-fill never picks one)
  if (coveredByWorn(job, gearSet, index, item.type)) {
    return { ok: false };
  }
  const { big, small } = meldSlots(item);

  // the rows the piece covers (a 2H weapon the Off-hand, a cloak the head) that the job uses and that hold a piece: emptied and unpinned
  const covered = slotInfo(job, item).blocks;
  const removedRows = gearSet.pieces.flatMap((row, i) =>
    i !== index && covered.includes(row.slot) && isUsed(job, row) && row.gameId != null ? [i] : [],
  );
  const removedNames = removedRows.map(i => poolItemById(job, gearSet.pieces[i].gameId)?.name ?? `item ${gearSet.pieces[i].gameId}`);
  const pieces = gearSet.pieces.map((row, i) => {
    if (i === index) {
      return { slot: row.slot, gameId, stones: Array.from({ length: big + small }, () => null) };
    }
    return removedRows.includes(i) ? { slot: row.slot } : row;
  });
  let next = withPin({ ...gearSet, pieces }, index, true);
  for (const i of removedRows) {
    next = withPin(next, i, false);
  }
  return {
    ok: true,
    gearSet: next,
    note: `${label}: ${item.name} (pinned)`,
    removedNote: removedRows.length ? removedNote(removedNames, item.type === 'weapon' ? undefined : item.name) : '',
  };
}

/* The stones of a worn piece padded to one entry per materia slot (null for an empty one), as an Auto-fill gives them. */
export function paddedStones(item, stones) {
  const { big, small } = meldSlots(item);
  return Array.from({ length: big + small }, (_, i) => stones?.[i] ?? null);
}

/* Row `index` of `gearSet` with `stone` ({stat, grade}) in materia slot `slot`; an empty slot past the first empty one
   takes the stone in the first empty one instead (slots fill in order). The row is pinned. New data. */
export function withStone(job, gearSet, index, slot, stone) {
  const row = gearSet.pieces[index];
  const item = poolItemById(job, row.gameId);
  const stones = paddedStones(item, row.stones);
  let at = slot;
  if (!stones[at]) {
    const first = stones.findIndex(s => !s);
    at = Math.min(at, first < 0 ? stones.length : first);
  }
  stones[at] = { stat: stone.stat, grade: stone.grade };
  const pieces = gearSet.pieces.map((r, i) => (i === index ? { ...r, stones } : r));
  return withPin({ ...gearSet, pieces }, index, true);
}

/* Row `index` of `gearSet` with the stone in materia slot `slot` taken out: only the last stone can go, so no other chip
   moves. The row is pinned. Returns the new GearSet, or `gearSet` itself when `slot` is not the last stone. */
export function withoutStone(job, gearSet, index, slot) {
  const row = gearSet.pieces[index];
  const item = poolItemById(job, row.gameId);
  const stones = paddedStones(item, row.stones);
  if (slot !== lastStone(stones)) {
    return gearSet;
  }
  stones[slot] = null;
  const pieces = gearSet.pieces.map((r, i) => (i === index ? { ...r, stones } : r));
  return withPin({ ...gearSet, pieces }, index, true);
}

/* The index of the last stone in `stones`, -1 for none. */
export function lastStone(stones) {
  for (let i = stones.length - 1; i >= 0; i--) {
    if (stones[i]) {
      return i;
    }
  }
  return -1;
}

/* `gearSet` with the meal `key` (an allMeals key, or null for no food), pinned while there is one. New data. */
export function withMeal(gearSet, key) {
  return { ...gearSet, meal: key ?? null, pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: key != null } };
}
