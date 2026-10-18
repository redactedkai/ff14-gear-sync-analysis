/* Gear optimizer: pick one item per slot (two rings) from a pool to maximize a target stat, with up to two tiebreak
   stats, an optional speed range (Target GCD: a speed minimum, or a band for an exact GCD) and optional minimums on
   other stats (tier ranking). */
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

/* The candidate lists for one objective, to search many times with different limits (Target GCD: each GCD, each meal;
   tier ranking: each stage's minimums). They depend on the pool, sync, objective, melds and which stats may be limited
   (`speed`: null for no speed rule, 'min' for a minimum only, 'exact' for a maximum too; `minStats`: other stats that
   may get a minimum), never on the limits' values. A list built for 'exact' also serves a speed minimum alone (its
   pruning keeps more), one for 'min' serves only minimums, one for null only searches with no speed rule; a search may
   hold any of `minStats`, or none. 'spd' in minStats is a speed rule of 'min' (unless `speed` is set).
   `versionKeys`: stats the meld versions are also on, and `versionCache`: meld versions shared with other lists of
   the same job and sync (buildCandidates).
   opts = {target='spd', tiebreak=[], melds=false, speed=null, minStats=[], versionKeys=[], versionCache}.
   Returns {slotList, posList, dims, noMeldData, speed, minStats}. */
export function prepare(job, pool, sync, opts) {
  opts = opts || {};
  const target = opts.target || 'spd';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  const asked = [...new Set((opts.minStats || []).filter(Boolean))];
  const speed = opts.speed || (asked.includes('spd') ? 'min' : null);
  const minStats = asked.filter(s => s !== 'spd');
  const cands = buildCandidates(
    job,
    pool,
    sync,
    { target, tiebreak },
    { melds: !!opts.melds, speed, minStats, versionKeys: opts.versionKeys || [], versionCache: opts.versionCache },
  );
  return { ...cands, speed, minStats };
}

/* The search's limits for solve options: the speed rule (spdMin, spdMax, and mins.spd, the larger minimum counting)
   first, then a minimum per stat in mins ({stat: gear points}; 0 or less is none). Each is {stat, min, max}; `kind` is
   the speed rule's (speedRule). Throws when `prep` was not built for one of them (prepare). */
function limitsFor(prep, opts) {
  const mins = { ...(opts.mins || {}) };
  const spdMin = Math.max(opts.spdMin || 0, mins.spd || 0);
  delete mins.spd;
  const { spdMax, kind } = speedRule({ spdMin, spdMax: opts.spdMax });
  // candidates pruned for 'exact' keep more, so they serve a minimum-only search too; 'min' ones cannot serve 'exact'
  if (kind && !(prep.speed === 'exact' || prep.speed === kind)) {
    throw new Error(`Optimizer: candidates prepared for speed rule ${prep.speed} cannot be searched with ${kind}`);
  }
  const limits = kind ? [{ stat: 'spd', min: spdMin > 0 ? spdMin : null, max: spdMax }] : [];
  for (const [stat, min] of Object.entries(mins)) {
    if (!(min > 0)) continue;
    if (!prep.minStats?.includes(stat)) {
      throw new Error(`Optimizer: candidates prepared without a minimum on ${stat} cannot be searched with one`);
    }
    limits.push({ stat, min, max: null });
  }
  return limits;
}

/* True when picks (solve's) meet every limit ({stat, min, max}): a seed that does not is ignored, since the search would
   return it as the best when nothing beats its score. */
function meetsLimits(picks, limits) {
  return limits.every(l => {
    const total = picks.reduce((n, p) => n + (p.eff?.[l.stat] || 0), 0);
    return !(l.min > 0 && total < l.min) && !(l.max != null && total > l.max);
  });
}

/* An earlier result's picks (solve's `picks`, from the same pool and sync) as a start for the search over `prep`:
   {best, score}, with best in search order (prep.slotList; rings in their order) and each piece scored by this prep's
   objective. Its eff stays as it was, so a meld version this prep pruned still counts as itself. Every stat total of
   the picks lies within the ranges the scorer was built on (each key's most per piece is some kept meld version's), so
   its score ranks like any loadout's. */
export function seedStart(prep, picks) {
  const byType = new Map();
  for (const p of picks) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  let score = 0;
  const best = prep.slotList.map(type => {
    const p = byType.get(type)?.shift();
    if (!p?.item) return { cand: null, rank: -1, blockedBy: p?.blockedBy ? { item: p.blockedBy } : undefined };
    const cand = { item: p.item, eff: p.eff, meld: p.meld, score: prep.score(p.eff) };
    score += cand.score;
    return { cand, rank: -1 };
  });
  return { best, score };
}

/* The most search nodes before a search stops and reports `truncated` (the page passes its own, lower NODE_LIMIT). */
const DEFAULT_NODE_LIMIT = 1500000;

/* Search prepared candidates under {spdMin, spdMax, mins, nodeLimit=DEFAULT_NODE_LIMIT, plain, lazyTables, seed,
   proven}; same result as optimize. mins = {stat: gear points}: minimums on stats prepared for them (prepare's
   minStats; mins.spd joins spdMin). `plain` turns off every extra (the filters, the Lagrangian bound, regain cuts, slot
   order, trial search, fronts, limit tables, groups, memo), for checking them;
   `lazyTables` (tests only) is the node count after which the tables for blocked slots are built (search.js
   LAZY_TABLES). `seed`: the picks of an earlier result that meets every limit of this search (tier ranking passes the
   stage before's); the search starts from it, so it returns at least as good a loadout, that one when it stops early.
   On a tie with the seed the seed is returned. A seed that breaks a limit is ignored. With a seed and limits the
   search filters by the Lagrangian bound and may settle by a short trial search or Pareto fronts (search.js
   branchAndBound). `proven`: maxima earlier searches proved, [{stat, most, minStats, speed}] (regain.js), each under
   limits this search's include (the same speed rule, minimums no lower on minStats); tier ranking passes its
   finished stages'. The result adds `method` ('trial', 'fronts' or 'search'), `kept` (candidates left after the
   filters) and `frontSizes` to optimize's. */
export function solve(prep, opts) {
  opts = opts || {};
  const limits = limitsFor(prep, opts);
  const nodeLimit = opts.nodeLimit || DEFAULT_NODE_LIMIT;
  const { slotList, posList, dims, noMeldData } = prep;
  const start = opts.seed && meetsLimits(opts.seed, limits) ? seedStart(prep, opts.seed) : null;
  const { best, nodes, truncated, method, kept, frontSizes } = branchAndBound({
    slotList,
    posList,
    dims,
    limits,
    nodeLimit,
    plain: !!opts.plain,
    lazyTables: opts.lazyTables,
    start,
    proven: opts.proven,
  });
  if (!best) return { ok: false, truncated, nodes, noMeldData, method, kept, frontSizes };

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
  return { ok: true, picks, totals, truncated, nodes, noMeldData, method, kept, frontSizes };
}

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level}: item level cap, item level sync on, synced level (optional; see itemSyncIlvl)
 * @param opts  {target='spd', tiebreak=[], spdMin, spdMax, mins={}, nodeLimit=1.5e6, melds=false}: mins = {stat: gear
 *              points}, minimums on any stat's total; melds gives every piece that is not synced its best materia melds
 *              for the objective; with a speed range or minimums, every meld split worth keeping (meldVersions in
 *              meld.js), since the best melds of a piece then depend on the rest of the loadout
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
  const mins = opts.mins || {};
  const minStats = Object.keys(mins).filter(s => mins[s] > 0);
  const prep = prepare(job, pool, sync, { ...opts, speed: kind, minStats });
  return solve(prep, { spdMin, spdMax, mins, nodeLimit: opts.nodeLimit });
}
