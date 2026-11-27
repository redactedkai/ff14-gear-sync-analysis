/* Gear optimizer: pick one item per slot (two rings) from a pool to maximize a target stat, with up to two tiebreak
   stats, an optional speed range (Target GCD: a speed minimum, or a band for an exact GCD) and optional minimums on
   other stats (tier ranking). */
import { isDimKeyOf } from '../damage-defense.ts';
import { makeLimit } from './limit.ts';
import { isOneOf, must, present } from '../guards.ts';
import { buildCandidates } from './candidates.ts';
import { branchAndBound } from './search.ts';
import { realSlotType } from './slot-index.ts';
import { SLOT_TYPES } from '../constants.ts';
import type {
  Candidate,
  DimKey,
  Eff,
  JobContext,
  Limit,
  PoolItem,
  Proven,
  SlotPick,
  SpeedKey,
  SolveResult,
  SlotType,
  Sync,
} from '../types.ts';
import type { BuiltCandidates, VersionCache } from './candidates.ts';
import type { Start } from './search.ts';

/* The speed rule of a prepared search: 'min' (a minimum), 'exact' (a band) or null (none). */
export type SpeedRule = 'min' | 'exact' | null;
/* The options of prepare (the fields are explained there). */
export interface PrepareOptions {
  target?: DimKey | '';
  tiebreak?: readonly (DimKey | '' | null | undefined)[];
  melds?: boolean;
  speed?: SpeedRule;
  minStats?: readonly (DimKey | '' | null | undefined)[];
  versionKeys?: readonly DimKey[];
  versionCache?: VersionCache | null;
  weaponFirst?: boolean;
  fixed?: readonly Candidate[];
}
/* The candidate lists for one objective (prepare): buildCandidates' result plus the speed rule, the stats that may get a
   minimum and the job's speed stat. */
export interface Prepared extends BuiltCandidates {
  speed: SpeedRule;
  minStats: DimKey[];
  speedKey: SpeedKey;
}
/* The options of solve (the fields are explained there). */
export interface SolveOptions {
  spdMin?: number | null;
  spdMax?: number | null;
  mins?: Record<string, number>;
  nodeLimit?: number;
  plain?: boolean;
  lazyTables?: number;
  seed?: readonly SlotPick[];
  proven?: readonly Proven[];
}
/* The options of optimize (the fields are explained there). */
export interface OptimizeOptions extends PrepareOptions {
  spdMin?: number | null;
  spdMax?: number | null;
  mins?: Record<string, number>;
  nodeLimit?: number;
}

/* The optimizer's other entry points for the modules built on it (same-result.ts, target-gcd.ts, tier-rank.ts, the
   optimizer view): every candidate unpruned (buildCandidates), the dimensions a candidate tracks (vectorDims) and the
   keys a score ranks (rankedKeys). A piece under sync (itemSyncIlvl, effStats, itemCaps) is core/piece.ts. */
export {
  buildCandidates,
  fixedCandidate,
  pinProblem,
  rankedKeys,
  vectorDims,
} from './candidates.ts';

/* The speed rule of search options {spdMin, spdMax}: the bounds (null for none; a minimum of 0 or less is none) and its
   kind, 'exact' with a maximum (a band), 'min' with a minimum only, null with neither. */
function speedRule(opts: { spdMin?: number | null; spdMax?: number | null }): {
  spdMin: number | null;
  spdMax: number | null;
  kind: SpeedRule;
} {
  const asked = opts.spdMin ?? 0;
  const spdMin = asked > 0 ? asked : null;
  const spdMax = opts.spdMax != null ? opts.spdMax : null;
  let kind: SpeedRule = null;
  if (spdMax != null) {
    kind = 'exact';
  } else if (spdMin != null) {
    kind = 'min';
  }
  return { spdMin, spdMax, kind };
}

/* The candidate lists for one objective, to search many times with different limits (Target GCD: each GCD, each meal;
   tier ranking: each stage's minimums). They depend on the pool, sync, objective, melds and which stats may be limited
   (`speed`: null for no speed rule, 'min' for a minimum only, 'exact' for a maximum too; `minStats`: other stats that
   may get a minimum), never on the limits' values. A list built for 'exact' also serves a speed minimum alone (its
   pruning keeps more), one for 'min' serves only minimums, one for null only searches with no speed rule; a search may
   hold any of `minStats`, or none. The job's speedKey in minStats is a speed rule of 'min' (unless `speed` is set).
   `versionKeys`: stats the meld versions are also on, and `versionCache`: meld versions shared with other lists of
   the same job and sync (buildCandidates). `weaponFirst` (default true): rank weapon damage before the objective
   (rankedKeys in candidates.ts); fastestGcd turns it off. `fixed`: pinned pieces (fixedCandidate), worn as they are:
   the search fills the other slots and solve counts the pinned ones in its totals and limits (buildCandidates).
   opts = {target=job.mainKey, tiebreak=[], melds=false, speed=null, minStats=[], versionKeys=[], versionCache, weaponFirst,
   fixed=[]}.
   Returns {slotList, posList, dims, noMeldData, speed, minStats, speedKey (the job's), fixed, fixedBlocked}. */
export function prepare(job: JobContext, pool: readonly PoolItem[], sync: Sync, opts?: PrepareOptions): Prepared {
  const options: PrepareOptions = opts || {};
  const target = options.target || job.mainKey;
  const tiebreak = present(options.tiebreak || []);
  const asked = [...new Set(present(options.minStats || []))];
  const speed = options.speed || (asked.includes(job.speedKey) ? 'min' : null);
  const minStats = asked.filter(s => s !== job.speedKey);
  const cands = buildCandidates(
    job,
    pool,
    sync,
    { target, tiebreak },
    {
      melds: Boolean(options.melds),
      speed,
      minStats,
      versionKeys: options.versionKeys || [],
      versionCache: options.versionCache,
      weaponFirst: options.weaponFirst !== false,
      fixed: options.fixed || [],
    },
  );
  return { ...cands, speed, minStats, speedKey: job.speedKey };
}

/* The search's limits for solve options: the speed rule (spdMin, spdMax, and a minimum on the speed stat in mins, the larger counting)
   first, then a minimum per stat in mins ({stat: gear points}; 0 or less is none). Each is {stat, min, max}; `kind` is
   the speed rule's (speedRule). Throws when `prep` was not built for one of them (prepare). */
function limitsFor(prep: Prepared, opts: SolveOptions): Limit[] {
  const mins: Record<string, number> = { ...(opts.mins || {}) };
  const spdMin = Math.max(opts.spdMin || 0, mins[prep.speedKey] || 0);
  delete mins[prep.speedKey];
  const { spdMax, kind } = speedRule({ spdMin, spdMax: opts.spdMax });
  // candidates pruned for 'exact' keep more, so they serve a minimum-only search too; 'min' ones cannot serve 'exact'
  if (kind && !(prep.speed === 'exact' || prep.speed === kind)) {
    throw new Error(`Optimizer: candidates prepared for speed rule ${prep.speed} cannot be searched with ${kind}`);
  }
  const limits: Limit[] = kind ? [makeLimit(prep.speedKey, spdMin, spdMax)] : [];
  for (const [stat, min] of Object.entries(mins)) {
    if (!(min > 0)) {
      continue;
    }
    if (!isOneOf(prep.minStats ?? [], stat)) {
      throw new Error(`Optimizer: candidates prepared without a minimum on ${stat} cannot be searched with one`);
    }
    limits.push(makeLimit(stat, min, null));
  }
  return limits;
}

/* The pinned pieces' totals over the dims, {dim: points}: what the search's own slots start from. */
function fixedTotalsOf(fixed: readonly Candidate[], dims: readonly string[]): Eff {
  const totals = Object.fromEntries(dims.map(d => [d, 0]));
  for (const cand of fixed) {
    for (const d of dims) {
      totals[d] += cand.eff[d] || 0;
    }
  }
  return totals;
}

/* `limits` ({stat, min, max}, on the whole loadout's totals) as the search sees them, on the pieces it picks: the pinned
   pieces' points (`fixedTotals`) come off each. A minimum they already meet is no limit; a limit with neither bound left
   is dropped. Returns null when a maximum is already passed by the pinned pieces alone (no loadout meets it). */
function limitsWithoutFixed(limits: readonly Limit[], fixedTotals: Eff): Limit[] | null {
  const out: Limit[] = [];
  for (const limit of limits) {
    const held = fixedTotals[limit.stat] || 0;
    const min = Math.max(0, limit.min - held);
    const max = limit.max != null ? limit.max - held : null;
    if (max != null && max < 0) {
      return null;
    }
    if (min > 0 || max != null) {
      out.push({ ...limit, min, max });
    }
  }
  return out;
}

/* True when picks (solve's) meet every limit ({stat, min, max}): a seed that does not is ignored, since the search would
   return it as the best when nothing beats its score. */
function meetsLimits(picks: readonly SlotPick[], limits: readonly Limit[]): boolean {
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
export function seedStart(prep: Prepared, picks: readonly SlotPick[]): Start {
  const byType = new Map<SlotType, SlotPick[]>();
  for (const p of picks) {
    if (!byType.has(p.type)) {
      byType.set(p.type, []);
    }
    must(byType, p.type, 'slot picks').push(p);
  }
  let score = 0;
  const best = prep.slotList.map(type => {
    const p = byType.get(realSlotType(type))?.shift();
    if (!p?.item) {
      return { cand: null, rank: -1, blockedBy: p?.blockedBy ? { item: p.blockedBy } : undefined };
    }
    const cand = { item: p.item, eff: p.eff, meld: p.meld, score: prep.score(p.eff) } as Candidate;
    score += cand.score;
    return { cand, rank: -1 };
  });
  return { best, score };
}

/* The most search nodes before a search stops and reports `truncated` (the page passes its own, lower NODE_LIMIT). */
const DEFAULT_NODE_LIMIT = 1500000;

/* Search prepared candidates under {spdMin, spdMax, mins, nodeLimit=DEFAULT_NODE_LIMIT, plain, lazyTables, seed,
   proven}; same result as optimize. mins = {stat: gear points}: minimums on stats prepared for them (prepare's
   minStats; a minimum on the speed stat joins spdMin). `plain` turns off every extra (the filters, the Lagrangian bound, regain cuts, slot
   order, trial search, fronts, limit tables, groups, memo), for checking them;
   `lazyTables` (tests only) is the node count after which the tables for blocked slots are built (search.ts
   LAZY_TABLES). `seed`: the picks of an earlier result that meets every limit of this search (tier ranking passes the
   stage before's); the search starts from it, so it returns at least as good a loadout, that one when it stops early.
   On a tie with the seed the seed is returned. A seed that breaks a limit is ignored. With a seed and limits the
   search filters by the Lagrangian bound and may settle by a short trial search or Pareto fronts (search.ts
   branchAndBound). `proven`: maxima earlier searches proved, [{stat, most, minStats, speed}] (regain.ts), each under
   limits this search's include (the same speed rule, minimums no lower on minStats); tier ranking passes its
   finished stages'. Limits, seed and proven maxima are on the whole loadout, pinned pieces (prepare's `fixed`) included;
   a pinned pick is marked `pinned`, and a seed's are ignored. The result adds `method` ('trial', 'fronts' or
   'search'), `kept` (candidates left after the filters) and `frontSizes` to optimize's. */
export function solve(prep: Prepared, opts?: SolveOptions): SolveResult {
  const options: SolveOptions = opts || {};
  const wholeLimits = limitsFor(prep, options);
  const nodeLimit = options.nodeLimit || DEFAULT_NODE_LIMIT;
  const { slotList, posList, dims, noMeldData, speedKey, fixed = [], fixedBlocked = [] } = prep;

  // 1. with pinned pieces, the limits and proven maxima as the search's own slots see them (without the pinned points),
  // and a seed without its pinned picks; with none, everything as given
  const fixedTotals = fixedTotalsOf(fixed, dims);
  const limits = fixed.length ? limitsWithoutFixed(wholeLimits, fixedTotals) : wholeLimits;
  const proven = fixed.length ? options.proven?.map(p => ({ ...p, most: p.most - (fixedTotals[p.stat] || 0) })) : options.proven;
  const seedPicks = fixed.length ? options.seed?.filter(p => !p.pinned) : options.seed;
  if (!limits) {
    return { ok: false, truncated: false, nodes: 0, noMeldData, method: 'search', kept: 0 };
  }
  const start = seedPicks && meetsLimits(seedPicks, limits) ? seedStart(prep, seedPicks) : null;

  // 2. the search; pinned pieces alone fill every slot when the search has none
  const { best, nodes, truncated, method, kept, frontSizes } =
    slotList.length || !fixed.length
      ? branchAndBound({
          slotList,
          posList,
          dims,
          limits,
          nodeLimit,
          plain: Boolean(options.plain),
          lazyTables: options.lazyTables,
          start,
          proven,
          speedKey,
        })
      : { best: limits.some(l => l.min > 0) ? null : [], nodes: 0, truncated: false, method: 'search' as const, kept: 0 };
  if (!best) {
    return { ok: false, truncated, nodes, noMeldData, method, kept, frontSizes };
  }

  // 3. the picks: pinned pieces first (a pinned ring before the free one), the slots they cover empty, then the search's
  const picks: SlotPick[] = [];
  const totals: Eff = { ...fixedTotals };
  for (const cand of fixed) {
    picks.push({ type: cand.item.type, item: cand.item, eff: cand.eff, meld: cand.meld, pinned: true });
  }
  for (const { type, blockedBy } of fixedBlocked) {
    picks.push({ type, item: null, blockedBy: blockedBy ?? null });
  }
  best.forEach((slot, i) => {
    const type = realSlotType(slotList[i]);
    if (!slot?.cand) {
      picks.push({ type, item: null, blockedBy: slot?.blockedBy?.item ?? null });
      return;
    }
    const { cand } = slot;
    picks.push({ type, item: cand.item, eff: cand.eff, meld: cand.meld });
    dims.forEach(d => {
      totals[d] += cand.eff[d];
    });
  });
  // the search fills blockable slots last; show the picks in the game's order (the sort is stable, so rings keep theirs)
  picks.sort((a, b) => SLOT_TYPES.indexOf(a.type) - SLOT_TYPES.indexOf(b.type));
  return { ok: true, picks, totals, truncated, nodes, noMeldData, method, kept, frontSizes };
}

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level}: item level cap, item level sync on, synced level (optional; see itemSyncIlvl in piece.ts)
 * @param opts  {target=job.mainKey, tiebreak=[], spdMin, spdMax, mins={}, nodeLimit=1.5e6, melds=false, fixed=[]}: `fixed`
 *              pinned pieces (fixedCandidate), counted in the totals and every limit but not searched; mins = {stat: gear
 *              points}, minimums on any stat's total; melds gives every piece that is not synced its best materia melds
 *              for the objective; with a speed range or minimums, every meld split worth keeping (meldVersions in
 *              meld.ts), since the best melds of a piece then depend on the rest of the loadout
 * @returns {ok:false, truncated, nodes, noMeldData} when nothing is feasible, otherwise
 *          {ok:true, picks:[{type, item, eff, meld, blockedBy, pinned}], totals, truncated, nodes, noMeldData}; picks are in the
 *          character panel's slot order (SLOT_TYPES), not the search order; an empty pick has item null, and blockedBy
 *          is the chosen item that leaves its slot empty (a cloak for the head), if any; meld is the pick's melds
 *          (bestMeld in meld.ts) or null, and eff includes them; noMeldData counts the pool pieces with no slot data when
 *          melds are on
 */
export function optimize(job: JobContext, pool: readonly PoolItem[], sync: Sync, opts?: OptimizeOptions): SolveResult {
  const options: OptimizeOptions = opts || {};
  const { spdMin, spdMax, kind } = speedRule(options);
  const mins = options.mins || {};
  const minStats = Object.keys(mins).filter((s): s is DimKey => mins[s] > 0 && isDimKeyOf(job, s));
  const prep = prepare(job, pool, sync, { ...options, speed: kind, minStats });
  return solve(prep, { spdMin, spdMax, mins, nodeLimit: options.nodeLimit });
}
