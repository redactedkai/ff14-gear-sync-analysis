/* Hand-made optimizer candidates for the tests of the search's building blocks (search.test.ts and its neighbours): a complete
   Candidate (types.ts) with a made-up piece, so a test states only the score, stats and blocked slots it is about. */
import { mkItem } from '../../../src/core/items.ts';
import type { Candidate, Eff, SlotType } from '../../../src/core/types.ts';

let nextId = 0;

/* A synthetic candidate: its `score`, effective stats `eff` and the slot types it blocks. One copy, no melds, and a
   made-up head piece with its own id (c0, c1, ...), so two candidates are never the same piece. */
export function syntheticCandidate(score: number, eff: Eff, blocks: readonly SlotType[] = []): Candidate {
  return { item: mkItem(`c${nextId++}`, 'head', 100, {}), eff, score, sum: score, blocks, copies: 1, meld: null };
}
