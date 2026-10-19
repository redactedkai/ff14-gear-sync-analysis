/* Slot positions and blocked-slot masks, shared by the optimizer's stages (candidates.js, front.js, search.js).
   A loadout's slots are numbered by their position in its slotList (buildCandidates: the slots that have items, 'ring'
   twice, blockable slots last). A candidate's `blocks` lists the slot types it leaves empty (a two-handed weapon the
   off-hand, a cloak the head); as a bit mask, bit p stands for position p. */
import { SLOT_TYPES } from '../constants.js';

/* Each slot type's position in `slotList`: Map {slot type: position}. A ring, listed twice, maps to its second
   position; a blockable slot is never a ring, so it appears once. */
export function slotPositions(slotList) {
  return new Map(slotList.map((type, position) => [type, position]));
}

/* The positions of the slot types `blocks` as a bit mask (bit p: position p of `positions`, slotPositions). A type the
   loadout has no slot for adds nothing. */
export function positionMask(blocks, positions) {
  return blocks.reduce((mask, type) => (positions.has(type) ? mask | (1 << positions.get(type)) : mask), 0);
}

/* The slot types some candidate in `lists` (candidate lists) can leave empty, as a Set. */
export function blockableTypes(lists) {
  return new Set(lists.flatMap(list => list.flatMap(cand => cand.blocks)));
}

/* Bit i of a type mask: SLOT_TYPES[i]. */
const TYPE_BIT = new Map(SLOT_TYPES.map((type, i) => [type, 1 << i]));

/* The slot types `blocks` as a bit mask numbered by SLOT_TYPES, the same for every loadout: for comparing which slots
   two candidates leave empty when no slotList is at hand (pruning). Not a position mask (positionMask). */
export function typeMask(blocks) {
  return blocks.reduce((mask, type) => mask | TYPE_BIT.get(type), 0);
}
