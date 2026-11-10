/* The edits a player makes by hand on a set page (a piece, a stone, the meal, a pin), as pure functions: each takes a saved
   GearSet and returns new plain data, never changing its argument. The menus that offer these edits are piece-menu.js,
   stone-menu.js and set-meal-menu.js. Pure: no Alpine, no store. */
import { poolItemById } from '../../core/items.js';
import { meldSlots } from '../../core/meld.js';
import { rowLabel } from './saved-set.js';

/* A copy of a GearSet deep enough to edit (rows, stones and pins copied). */
export function editableCopy(gearSet) {
  return {
    ...gearSet,
    pieces: gearSet.pieces.map(row => (row.gameId == null ? { slot: row.slot } : { ...row, stones: [...(row.stones ?? [])] })),
    pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: !!gearSet.pinned?.meal },
  };
}

/* `gearSet` with row `index` pinned or not (`on`); new data. */
export function withPin(gearSet, index, on) {
  const rows = new Set(gearSet.pinned?.pieces ?? []);
  if (on) rows.add(index);
  else rows.delete(index);
  return { ...gearSet, pinned: { meal: !!gearSet.pinned?.meal, pieces: [...rows].sort((a, b) => a - b) } };
}

/* `gearSet` with its meal pinned or not; new data. */
export function withMealPin(gearSet, on) {
  return { ...gearSet, pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: !!on } };
}

/* Whether the other ring row of `gearSet` already holds the Unique ring `gameId` (a Unique ring is worn once). */
export function uniqueTaken(job, gearSet, index, gameId) {
  const item = poolItemById(job, gameId);
  if (item?.type !== 'ring' || item.copies !== 1) return false;
  return gearSet.pieces.some((row, i) => i !== index && row.slot === 'ring' && row.gameId === gameId);
}

/* Row `index` of `gearSet` given the piece `gameId` (from the piece picker), with its materia slots empty, and pinned:
   a piece chosen by hand is one Fill keeps. `gameId` null empties the row and unpins it. Returns {ok: true,
   gearSet, note ("Head: Rainbow Cap of Healing (pinned)")} or {ok: false, note} for a Unique ring already in the other
   ring row. */
export function placePiece(job, gearSet, index, gameId) {
  const label = rowLabel(gearSet, index);
  if (gameId == null) {
    const pieces = gearSet.pieces.map((row, i) => (i === index ? { slot: row.slot } : row));
    return { ok: true, gearSet: withPin({ ...gearSet, pieces }, index, false), note: `${label}: emptied` };
  }
  const item = poolItemById(job, gameId);
  if (uniqueTaken(job, gearSet, index, gameId)) return { ok: false, note: `${item.name} is Unique: it is already in the other ring row.` };
  const { big, small } = meldSlots(item);
  const pieces = gearSet.pieces.map((row, i) =>
    i === index ? { slot: row.slot, gameId, stones: Array.from({ length: big + small }, () => null) } : row,
  );
  return { ok: true, gearSet: withPin({ ...gearSet, pieces }, index, true), note: `${label}: ${item.name} (pinned)` };
}

/* The stones of a worn piece padded to one entry per materia slot (null for an empty one), as a Fill gives them. */
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
  if (slot !== lastStone(stones)) return gearSet;
  stones[slot] = null;
  const pieces = gearSet.pieces.map((r, i) => (i === index ? { ...r, stones } : r));
  return withPin({ ...gearSet, pieces }, index, true);
}

/* The index of the last stone in `stones`, -1 for none. */
export function lastStone(stones) {
  for (let i = stones.length - 1; i >= 0; i--) if (stones[i]) return i;
  return -1;
}

/* `gearSet` with the meal `key` (an allMeals key, or null for no food), pinned while there is one. New data. */
export function withMeal(gearSet, key) {
  return { ...gearSet, meal: key ?? null, pinned: { pieces: [...(gearSet.pinned?.pieces ?? [])], meal: key != null } };
}
