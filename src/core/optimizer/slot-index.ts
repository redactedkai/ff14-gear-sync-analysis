/* Slot positions and blocked-slot masks, shared by the optimizer's stages (candidates.ts, front.ts, search.ts).
   A loadout's slots are numbered by their position in its slotList (buildCandidates: the slots that have items, 'ring'
   twice, blockable slots last). A candidate's `blocks` lists the slot types it leaves empty (a two-handed weapon the
   off-hand, a cloak the head); as a bit mask, bit p stands for position p. */
import { must } from '../guards.ts';
import { SLOT_TYPES } from '../constants.ts';
import type { SlotType } from '../types.ts';

/* A slot of a search's slot list: a slot type, or FREE_RING (the free ring while the other is pinned). */
export type SearchSlot = SlotType | typeof FREE_RING;

/* Each slot type's position in `slotList`: Map {slot type: position}. A ring, listed twice, maps to its second
   position; a blockable slot is never a ring, so it appears once. */
export function slotPositions(slotList: readonly SearchSlot[]): Map<SearchSlot, number> {
  return new Map(slotList.map((type, position) => [type, position]));
}

/* The positions of the slot types `blocks` as a bit mask (bit p: position p of `positions`, slotPositions). A type the
   loadout has no slot for adds nothing. */
export function positionMask(blocks: readonly SearchSlot[], positions: ReadonlyMap<SearchSlot, number>): number {
  return blocks.reduce((mask, type) => (positions.has(type) ? mask | (1 << must(positions, type, 'slot position')) : mask), 0);
}

/* The slot types some candidate in `lists` (candidate lists) can leave empty, as a Set. */
export function blockableTypes(lists: readonly (readonly { blocks: readonly SlotType[] }[])[]): Set<SearchSlot> {
  return new Set(lists.flatMap(list => list.flatMap(cand => cand.blocks)));
}

/* Bit i of a type mask: SLOT_TYPES[i]. */
const TYPE_BIT = new Map<SlotType, number>(SLOT_TYPES.map((type, i) => [type, 1 << i]));

/* The slot types `blocks` as a bit mask numbered by SLOT_TYPES, the same for every loadout: for comparing which slots
   two candidates leave empty when no slotList is at hand (pruning). Not a position mask (positionMask). */
export function typeMask(blocks: readonly SlotType[]): number {
  return blocks.reduce((mask, type) => mask | must(TYPE_BIT, type, 'slot bit'), 0);
}

/* The name of the search slot for the one free ring while the other ring is pinned (fixed pieces, buildCandidates). It is
   a slot type of its own so the search sees an ordinary one-piece slot: the search treats two consecutive 'ring' slots
   as a pair sharing one list, and has no case for a single one. Never a piece's type: `realSlotType` gives the type. */
export const FREE_RING = 'ring (free)';

/* The slot type of a search slot name: FREE_RING is a 'ring', every other name is its own type. */
export function realSlotType(slot: SearchSlot): SlotType {
  return slot === FREE_RING ? 'ring' : slot;
}
