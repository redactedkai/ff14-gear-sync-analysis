/* Gear optimizer: pick one item per slot (two rings) from a pool to maximize a target stat,
   with up to two tiebreak stats and an optional speed range (Target GCD: a speed minimum, or a band for an exact GCD). */
import { buildCandidates } from './candidates.js';
import { branchAndBound } from './search.js';
import { SLOT_TYPES } from '../constants.js';

export { effStats, itemCaps, itemSyncIlvl } from './candidates.js';

/* The speed rule of search options {spdMin, spdMax}: the bounds (null for none; a minimum of 0 or less is none) and its
   kind, 'exact' with a maximum (a band), 'min' with a minimum only, null with neither. */
function speedRule(opts) {
  const spdMin = opts.spdMin > 0 ? opts.spdMin : null;
  const spdMax = opts.spdMax != null ? opts.spdMax : null;
  return { spdMin, spdMax, kind: spdMax != null ? 'exact' : spdMin != null ? 'min' : null };
}

/* The candidate lists for one objective, to search many times with different speed rules (Target GCD: each GCD, each
   meal). They depend on the pool, sync, objective, melds and the kind of speed rule (`speed`: null for none, 'min' for a
   minimum only, 'exact' for a maximum too), never on the speed values themselves. A list built for 'exact' also serves
   a minimum alone (its pruning keeps more), one for 'min' serves only minimums, one for null only searches with no rule.
   opts = {target='spd', tiebreak=[], melds=false, speed=null}. Returns {slotList, posList, dims, noMeldData, speed}. */
export function prepare(job, pool, sync, opts) {
  opts = opts || {};
  const target = opts.target || 'spd';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  const speed = opts.speed || null;
  const cands = buildCandidates(job, pool, sync, { target, tiebreak }, { melds: !!opts.melds, speed });
  return { ...cands, speed };
}

/* The most search nodes before a search stops and reports `truncated` (the page passes its own, lower NODE_LIMIT). */
const DEFAULT_NODE_LIMIT = 1500000;

/* Search prepared candidates under {spdMin, spdMax, nodeLimit=DEFAULT_NODE_LIMIT, plain, lazyTables}; same result as optimize. `plain`
   turns off the speed-rule extras of the search (speed tables, speed groups, memo), for checking them; `lazyTables`
   (tests only) is the node count after which the speed tables for blocked slots are built (search.js LAZY_TABLES). */
export function solve(prep, opts) {
  opts = opts || {};
  const { spdMin, spdMax, kind } = speedRule(opts);
  const nodeLimit = opts.nodeLimit || DEFAULT_NODE_LIMIT;
  // candidates pruned for 'exact' keep more, so they serve a minimum-only search too; 'min' ones cannot serve 'exact'
  if (kind && !(prep.speed === 'exact' || prep.speed === kind)) {
    throw new Error(`Optimizer: candidates prepared for speed rule ${prep.speed} cannot be searched with ${kind}`);
  }
  const { slotList, posList, dims, noMeldData } = prep;
  const { best, nodes, truncated } = branchAndBound({
    slotList,
    posList,
    dims,
    spdMin,
    spdMax,
    nodeLimit,
    plain: !!opts.plain,
    lazyTables: opts.lazyTables,
  });
  if (!best) return { ok: false, truncated, nodes, noMeldData };

  const picks = [];
  const totals = {};
  dims.forEach(d => {
    totals[d] = 0;
  });
  best.forEach((slot, i) => {
    if (!slot?.cand) {
      picks.push({ type: slotList[i], item: null, blockedBy: slot?.blockedBy?.item ?? null });
      return;
    }
    picks.push({ type: slotList[i], item: slot.cand.item, eff: slot.cand.eff, meld: slot.cand.meld });
    dims.forEach(d => {
      totals[d] += slot.cand.eff[d];
    });
  });
  // the search fills blockable slots last; show the picks in the game's order (the sort is stable, so rings keep theirs)
  picks.sort((a, b) => SLOT_TYPES.indexOf(a.type) - SLOT_TYPES.indexOf(b.type));
  return { ok: true, picks, totals, truncated, nodes, noMeldData };
}

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level}: item level cap, item level sync on, synced level (optional; see itemSyncIlvl)
 * @param opts  {target='spd', tiebreak=[], spdMin, spdMax, nodeLimit=1.5e6, melds=false}: melds gives every piece that is
 *              not synced its best materia melds for the objective; with a speed range, every meld split worth keeping
 *              (meldVersions in meld.js), since the best melds of a piece then depend on the rest of the loadout
 * @returns {ok:false, truncated, nodes, noMeldData} when nothing is feasible, otherwise
 *          {ok:true, picks:[{type, item, eff, meld, blockedBy}], totals, truncated, nodes, noMeldData}; picks are in the
 *          character panel's slot order (SLOT_TYPES), not the search order; an empty pick has item null, and blockedBy
 *          is the chosen item that leaves its slot empty (a cloak for the head), if any; meld is the pick's melds
 *          (bestMeld in meld.js) or null, and eff includes them; noMeldData counts the pool pieces with no slot data when
 *          melds are on
 */
export function optimize(job, pool, sync, opts) {
  opts = opts || {};
  const { spdMin, spdMax, kind } = speedRule(opts);
  const prep = prepare(job, pool, sync, { ...opts, speed: kind });
  return solve(prep, { spdMin, spdMax, nodeLimit: opts.nodeLimit });
}
