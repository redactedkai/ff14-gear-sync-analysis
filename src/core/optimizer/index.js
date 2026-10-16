/* Gear optimizer: pick one item per slot (two rings) from a pool to maximize a target stat,
   with up to two tiebreak stats and an optional speed range (to reach a GCD tier without overshooting it). */
import { buildCandidates } from './candidates.js';
import { branchAndBound } from './search.js';

export { effStats, itemCaps, itemSyncIlvl } from './candidates.js';

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level}: item level cap, item level sync on, synced level (optional; see itemSyncIlvl)
 * @param opts  {target='spd', tiebreak=[], spdMin, spdMax, nodeLimit=1.5e6, melds=false}: melds gives every piece that is
 *              not synced its best materia melds for the objective; it cannot be combined with a speed range
 * @returns {ok:false, truncated, nodes} when nothing is feasible, otherwise
 *          {ok:true, picks:[{type, item, eff, meld, blockedBy}], totals, truncated, nodes, noMeldData}; an empty pick has
 *          item null, and blockedBy is the chosen item that leaves its slot empty (a cloak for the head), if any; meld is
 *          the pick's melds (bestMeld in meld.js) or null, and eff includes them; noMeldData counts the pool pieces with
 *          no slot data when melds are on
 */
export function optimize(job, pool, sync, opts) {
  opts = opts || {};
  const target = opts.target || 'spd';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  const spdMin = opts.spdMin > 0 ? opts.spdMin : null;
  const spdMax = opts.spdMax != null ? opts.spdMax : null;
  const nodeLimit = opts.nodeLimit || 1500000;
  const melds = !!opts.melds;
  // One best-melded version per piece is exact only without a speed constraint: with one, the best melds of a piece
  // depend on the rest of the loadout. Refuse rather than return a result that may not be the best.
  if (melds && (spdMin != null || spdMax != null)) throw new Error('Optimizer: melds cannot be combined with a speed range');

  // Dominance assumes more of a stat never hurts, which a maximum breaks, so pruning is off with a speed maximum.
  const prune = spdMax == null;
  const { slotList, posList, dims, noMeldData } = buildCandidates(job, pool, sync, { target, tiebreak }, { prune, melds });
  const { best, nodes, truncated } = branchAndBound({ slotList, posList, dims, spdMin, spdMax, nodeLimit });
  if (!best) return { ok: false, truncated, nodes, noMeldData };

  const picks = [];
  const totals = {};
  dims.forEach(d => {
    totals[d] = 0;
  });
  best.forEach((c, i) => {
    if (!c?.a) {
      picks.push({ type: slotList[i], item: null, blockedBy: c?.blockedBy?.it ?? null });
      return;
    }
    picks.push({ type: slotList[i], item: c.a.it, eff: c.a.v, meld: c.a.meld });
    dims.forEach(d => {
      totals[d] += c.a.v[d];
    });
  });
  return { ok: true, picks, totals, truncated, nodes, noMeldData };
}
