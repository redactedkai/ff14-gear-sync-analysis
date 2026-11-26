/* An independent exact solver for the optimizer's plain goal: the stats a gear set adds up to are a sum over its slots, so
   the best set is the best item per slot, with the ring pair and the slots a piece blocks handled exactly. Written here from
   the rules (optimizer.md, section 2), not from the search. It shares the sync model (effStats, weaponDamage) with the code
   under test, so it does not check that; with melds it takes each item's stat vectors from the meld enumerator
   `meldVectors` (exhaustive.js). Used by core/optimizer/index.exact-solver.test.js. */
import { SLOT_TYPES } from '../../../src/core/constants.ts';
import { slotInfo } from '../../../src/core/items.ts';
import { weaponDamage } from '../../../src/core/damage-defense.ts';
import { effStats, itemSyncIlvl } from '../../../src/core/piece.js';
import { meldVectors } from './exhaustive.js';

/* Compares two equal-length number lists like words in a dictionary: negative, 0 or positive. */
export const lexCompare = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
};
const addLists = (a, b) => a.map((x, i) => x + b[i]);

/* The best ranked totals of `pool` for `job` under `sync`, goal `goal` and tiebreaks `tiebreak` (stat keys), with or without
   melds: {ranked: the keys in rank order (weapon damage 'wd' first when the job has it), total: their numbers}, or null
   when no legal set exists. */
export function solveExact(job, pool, sync, goal, tiebreak, melds) {
  const keys = [goal, ...tiebreak];
  const ranked = job.damageKey ? ['wd', ...keys] : keys;
  const zero = ranked.map(() => 0);

  // an item's best stat list in rank order (with melds: the best of every stone placement)
  const vectorsOf = item => {
    const wd = job.damageKey ? weaponDamage(job, item, itemSyncIlvl(item, sync)) : 0;
    const asRanked = stats => ranked.map(k => (k === 'wd' ? wd : stats[k] || 0));
    return melds ? meldVectors(job, item, sync, keys).map(asRanked) : [asRanked(effStats(job, item, sync))];
  };
  const bestVector = item => vectorsOf(item).reduce((a, b) => (lexCompare(a, b) >= 0 ? a : b));

  // per slot type: the choices that can matter, each with the slots it blocks
  const choicesByType = new Map();
  for (const type of SLOT_TYPES) {
    const items = pool.filter(item => item.type === type);
    if (!items.length) {
      continue;
    }
    if (type === 'ring') {
      // the best pair: a pair is worth the sum of its two rings, so it is among the top few rings (the same ring twice only with two copies)
      const scored = items.map(item => ({ item, vector: bestVector(item) })).sort((a, b) => lexCompare(b.vector, a.vector));
      let pair = null;
      for (let x = 0; x < scored.length; x++) {
        for (let y = x; y < scored.length; y++) {
          if (x === y && (scored[x].item.copies || 1) < 2) {
            continue;
          }
          const vector = addLists(scored[x].vector, scored[y].vector);
          if (!pair || lexCompare(vector, pair) > 0) {
            pair = vector;
          }
        }
        if (x > 3) {
          break;
        }
      }
      choicesByType.set('ring', [{ vector: pair ?? scored[0].vector, blocks: [] }]);
      continue;
    }
    // items blocking the same slots are interchangeable: keep the best of each kind
    const bestByBlocks = new Map();
    for (const item of items) {
      const blocks = slotInfo(job, item).blocks;
      const vector = bestVector(item);
      const kind = blocks.join();
      if (!bestByBlocks.has(kind) || lexCompare(vector, bestByBlocks.get(kind).vector) > 0) {
        bestByBlocks.set(kind, { vector, blocks });
      }
    }
    choicesByType.set(type, [...bestByBlocks.values()]);
  }

  // every combination of one choice per slot type; a slot that a piece blocks is empty, any other slot is filled
  const types = [...choicesByType.keys()];
  const blockable = new Set([...choicesByType.values()].flat().flatMap(choice => choice.blocks));
  let best = null;
  const picked = [];
  const search = depth => {
    if (depth === types.length) {
      const blocked = new Set(picked.flatMap(choice => choice.blocks));
      if (picked.some((choice, i) => Boolean(choice.empty) !== blocked.has(types[i]))) {
        return;
      }
      const total = picked.reduce((sum, choice) => addLists(sum, choice.vector), zero);
      if (!best || lexCompare(total, best) > 0) {
        best = total;
      }
      return;
    }
    const choices = [...choicesByType.get(types[depth])];
    if (blockable.has(types[depth])) {
      choices.push({ vector: zero, blocks: [], empty: true });
    }
    for (const choice of choices) {
      picked.push(choice);
      search(depth + 1);
      picked.pop();
    }
  };
  search(0);
  return best ? { ranked, total: best } : null;
}
