/* Optimizer stage 1: turn a pool into per-slot candidate lists.
   Each candidate carries its effective stat vector (synced where item level or level sync applies) and its scalar score.
   Candidates dominated by another item in the same slot are dropped.

   A candidate (built by withMeld, read by search.ts and solve in index.ts):
     item    the pool item
     eff     its effective stats: after sync, plus its melds ({stat key: points}, the job's stats), and its weapon
             damage after sync under WD_KEY when the job ranks it (damage-defense.ts; 0 off the weapon)
     copies  how many of it can be worn (2 for a non-Unique ring), counted per item, not per candidate
     blocks  slot types it leaves empty (a two-handed weapon the off-hand, a cloak the head)
     meld    its melds (bestMeld in meld.ts) or null
     score   [weapon damage, target, tiebreak 1, tiebreak 2] packed into one number (makeScorer); set by buildCandidates
     sum     its stat total, the sort tiebreak; set by buildCandidates
     versions every meld version of the piece, this one among them (itemVersions only): a regain cut (regain.ts) may
             swap a ring for any of them, including those pruning dropped
     fixed   true on a pinned piece (fixedCandidate): worn as it is, in a slot the search does not fill */
import { must, present } from '../guards.ts';
import { SLOT_TYPES } from '../constants.ts';
import { WD_KEY, weaponDamage } from '../damage-defense.ts';
import { meldInfo, slotInfo } from '../items.ts';
import { applyStones, bestMeld, meldVersions } from '../meld.ts';
import { effStats, itemSyncIlvl, keepsMelds } from '../piece.ts';
import { FREE_RING, blockableTypes, typeMask, type SearchSlot } from './slot-index.ts';
import type { Candidate, DimKey, Eff, JobContext, Meld, PoolItem, SlotType, StatMap, Stone, Sync } from '../types.ts';

/* The meld versions built for a piece, by job, sync, keys and speed rule (itemVersions' `versionCache`). */
export type VersionCache = Map<PoolItem, Map<string, Candidate[]>>;
/* A search's goal: the stat to maximize and up to two tiebreaks ('' or missing for none). */
export interface Objective {
  target: DimKey;
  tiebreak?: readonly (DimKey | '' | null | undefined)[];
}
/* The options of buildCandidates (the fields are explained at buildCandidates). */
export interface BuildOptions {
  prune?: boolean;
  melds?: boolean;
  speed?: 'min' | 'exact' | null;
  minStats?: readonly DimKey[];
  versionKeys?: readonly DimKey[];
  versionCache?: VersionCache | null;
  weaponFirst?: boolean;
  fixed?: readonly Candidate[];
}
/* A slot the pinned pieces leave empty that the pool has pieces for (buildCandidates' `fixedBlocked`): covered by a pinned
   piece, or with no piece that fits beside them (blockedBy null). */
export interface FixedBlocked {
  type: SlotType;
  blockedBy: PoolItem | null;
}
/* What buildCandidates returns (the fields are explained there). */
export interface BuiltCandidates {
  slotList: SearchSlot[];
  posList: Candidate[][];
  dims: DimKey[];
  noMeldData: number;
  score: (eff: Eff) => number;
  fixed: readonly Candidate[];
  fixedBlocked: FixedBlocked[];
}
/* Where pinned pieces sit (pinnedSlots). */
interface PinnedSlots {
  filled: Set<SlotType>;
  rings: number;
  ringCopies: Map<string, number>;
  covered: Set<SlotType>;
  coveredBy: Map<SlotType, PoolItem>;
}

/* The most keys of a goal: the target and two tiebreaks. Melds are chosen for these (weapon damage is no meld's). */
const MAX_GOAL_KEYS = 3;
/* The most keys a score ranks: weapon damage and the goal's keys. A fifth key would push the packed score past 2^53 on
   real pools (about 150 × 3,500³ ≈ 6e12 for four keys), so makeScorer throws rather than drop it. */
const MAX_KEYS = MAX_GOAL_KEYS + 1;

/* Lexicographic score over `keys` (rankedKeys: weapon damage first when ranked, then the target and tiebreaks; empty
   ones ignored) packed into one number, so the search can add and bound it like any sum. Fixed weights (1e8 / 1e4 / 1)
   are only lexicographic while tiebreak totals stay below 10,000 (docs/history.md), so the weights are derived from
   the pool instead: with R2 = the range a loadout's tiebreak-2 total can span (sum over slots of max - min, 0 included
   for an empty slot) and R1 likewise, W2 = 1, W1 = R2 + 1, W0 = R1 * W1 + R2 + 1. Then a tiebreak difference can never outweigh one unit of a
   higher key, for any totals. Stats are integers, so the scores are exact while they stay within
   Number.MAX_SAFE_INTEGER; that is checked, and a pool too large for it throws instead of ranking wrongly.
   `slotVectors[i]` is the list of stat vectors for slot i of the loadout (the ring list appears twice). */
export function makeScorer(keys: readonly (string | null | undefined)[], slotVectors: readonly (readonly Eff[])[]): (v: Eff) => number {
  const ranked = present(keys);
  if (ranked.length > MAX_KEYS) {
    throw new Error(`Optimizer: at most ${MAX_KEYS} ranked keys fit one score, got ${ranked.length} (${ranked.join(', ')})`);
  }
  const keySpan = (k: string) =>
    slotVectors.reduce(
      (acc, vs) => {
        let lo = 0,
          hi = 0;
        vs.forEach(v => {
          const x = v[k] || 0;
          if (x < lo) {
            lo = x;
          }
          if (x > hi) {
            hi = x;
          }
        });
        return { span: acc.span + hi - lo, abs: acc.abs + Math.max(hi, -lo) };
      },
      { span: 0, abs: 0 },
    );
  const spans = ranked.map(keySpan);
  const weights = new Array(ranked.length).fill(1);
  // the last key weighs 1; each higher key weighs more than every lower key together can swing, so packed scores
  // order like the key tuples
  for (let i = ranked.length - 2; i >= 0; i--) {
    // W_i = (span of everything below key i, in score units) + 1
    let below = 0;
    for (let j = i + 1; j < ranked.length; j++) {
      below += spans[j].span * weights[j];
    }
    weights[i] = below + 1;
  }
  const maxAbs = spans.reduce((a, span, i) => a + span.abs * weights[i], 0);
  if (!Number.isSafeInteger(maxAbs) || !weights.every(Number.isSafeInteger)) {
    throw new Error('Optimizer: stat totals too large to rank exactly (score bound ' + maxAbs + ' exceeds 2^53)');
  }
  return v => {
    let score = 0;
    for (let i = 0; i < ranked.length; i++) {
      score += (v[ranked[i]] || 0) * weights[i];
    }
    return score;
  };
}

/* Dimensions tracked per item: the job's stats, and weapon damage (WD_KEY) when the job ranks it (job.damageKey). */
export function vectorDims(job: JobContext): DimKey[] {
  return job.damageKey ? [...job.stats, WD_KEY] : job.stats.slice();
}

/* The keys a score ranks, in order: weapon damage first when the job ranks it and `weaponFirst` (owner's decision
   2026-10-18: no set gives it up for more of the goal's stats; only the weapon carries it), then the target and
   tiebreaks, each once. fastestGcd turns `weaponFirst` off: it asks for the most speed at any weapon damage. */
export function rankedKeys(
  job: JobContext,
  target: DimKey,
  tiebreak: readonly (DimKey | '' | null | undefined)[],
  weaponFirst = true,
): DimKey[] {
  return [...new Set<DimKey>([...(weaponFirst && job.damageKey ? [WD_KEY] : []), target, ...present(tiebreak)])];
}

/* A pool item's candidate: its effective stat vector and, when `keys` is given (melds on) and the piece is not synced,
   its best melds for the objective (bestMeld), already added to the vector. One melded version per piece is exact:
   the loadout score is a sum of per-piece terms, and copies and blocked slots depend on the item, not on its melds, so
   giving every worn piece its own best melds never lowers a loadout (docs/engineering/optimizer.md, section 6). A synced piece
   keeps no melds (keepsMelds in piece.ts). */
function itemCandidate(job: JobContext, item: PoolItem, sync: Sync, keys: readonly DimKey[] | null): Candidate {
  const target = itemSyncIlvl(item, sync);
  const synced = effStats(job, item, sync);
  const meld = keys && keepsMelds(item, sync) ? bestMeld(job, item, keys) : null;
  return withMeld(job, item, synced, meld, target);
}

/* A candidate for `item`: its synced stats plus the melds' gains, and its weapon damage (WD_KEY) after sync when the job
   ranks it. `target`: the item level it is synced to (itemSyncIlvl), null when untouched. */
function withMeld(job: JobContext, item: PoolItem, synced: StatMap, meld: Meld | null, target: number | null): Candidate {
  const v: Eff = {};
  job.stats.forEach(s => {
    v[s] = (synced[s] || 0) + (meld?.gain[s] || 0);
  });
  if (job.damageKey) {
    v[WD_KEY] = weaponDamage(job, item, target);
  }
  // score and sum are set by buildCandidates
  return { item, eff: v, copies: item.copies || 1, blocks: slotInfo(job, item).blocks, meld } as Candidate;
}

/* The candidate of a pinned piece: `item` (a pool item) worn with exactly `stones` (a set piece's stones: one entry per
   meld slot, {stat, grade} or null; applyStones keeps the ones the piece takes under `sync`), as one candidate with one
   meld, however many versions the optimizer would try. Its stats, melds and weapon damage are those the set's own
   evaluation gives it (evaluateSet), so a pinned piece counts the same in the search and in the sheet. */
export function fixedCandidate(job: JobContext, item: PoolItem, stones: readonly (Stone | null)[], sync: Sync): Candidate {
  const { meld } = applyStones(job, item, stones, sync);
  return { ...withMeld(job, item, effStats(job, item, sync), meld, itemSyncIlvl(item, sync)), fixed: true };
}

/* With limits (a speed rule, stat minimums) and melds: one candidate per meld version of the piece (meldVersions) on
   `keys`, the objective's keys and the limited stats, all sharing the item, so copies and Unique rings still count
   once per piece (pruneDominated counts by `item`, the search by item id). Each keeps the whole list as `versions`.
   `versionCache` (optional, a Map): the versions built before for the same item, keys and speed rule, from the same
   job and sync. They depend on nothing else (not on the objective), so tier ranking's stages, one candidate list
   each, build them once; each list gets its own shallow copies, since buildCandidates writes each candidate's score
   and sum. */
function itemVersions(
  job: JobContext,
  item: PoolItem,
  sync: Sync,
  keys: readonly DimKey[],
  exactSpd: boolean,
  versionCache: VersionCache | null | undefined,
): Candidate[] {
  const build = (): Candidate[] => {
    const target = itemSyncIlvl(item, sync);
    const synced = effStats(job, item, sync);
    if (!keepsMelds(item, sync)) {
      return [withMeld(job, item, synced, null, target)];
    }
    const versions = meldVersions(job, item, keys, { exactSpd }).map(meld => withMeld(job, item, synced, meld, null));
    for (const v of versions) {
      v.versions = versions;
    }
    return versions;
  };
  if (!versionCache) {
    return build();
  }
  const key = `${job.jobId}|${sync.cap}|${sync.sync}|${sync.level}|${keys.join()}|${exactSpd}`;
  let byKey = versionCache.get(item);
  if (!byKey) {
    byKey = new Map();
    versionCache.set(item, byKey);
  }
  if (!byKey.has(key)) {
    byKey.set(key, build());
  }
  return must(byKey, key, 'cached candidates').map(v => ({ ...v }));
}

/* A (`rival` in the code) beats B (`cand`) when A is >= on every dimension and either > on one of them or, for an exact tie, comes first, and A
   leaves no slot empty that B does not (a cloak covering the head never beats a plain body piece).
   B can be dropped only when the items that beat it have enough copies between them to fill every slot of
   this type (`slotsOfType`: 1, or 2 for rings). Then any loadout using B can swap it for one of them without
   losing anything. For rings, a single better Unique ring is not enough: the best pair may be that ring plus B
   (docs/history.md). Dropped items' own beaters also beat B, so the kept set always has enough copies.
   Copies are counted once per item: several candidates of one item (`item`) are still one item's copies.
   `sorted`: every beater of a candidate comes before it in arr (buildCandidates sorts by score, then stat sum, ties in
   pool order). Then B is compared with the kept candidates only: since the kept beaters always have enough copies (see
   above), that drops exactly the same candidates, and the kept list is much shorter than arr. buildCandidates always
   passes sorted; the unsorted mode is the reference that scripts/perf/compare.mjs and the tests check it against. */
export function pruneDominated(arr: readonly Candidate[], dims: readonly string[], slotsOfType: number, sorted = false): Candidate[] {
  const keep: Candidate[] = [];
  for (let i = 0; i < arr.length; i++) {
    const cand = arr[i];
    let copies = 0;
    const counted = new Set();
    const rivals = sorted ? keep : arr;
    for (let j = 0; j < rivals.length && copies < slotsOfType; j++) {
      const rival = rivals[j];
      if (rival === cand) {
        continue;
      }
      if (counted.has(rival.item)) {
        continue;
      }
      if (!rival.blocks.every(t => cand.blocks.includes(t))) {
        continue;
      }
      let allGe = true,
        anyGt = false;
      for (const d of dims) {
        if (rival.eff[d] < cand.eff[d]) {
          allGe = false;
          break;
        }
        if (rival.eff[d] > cand.eff[d]) {
          anyGt = true;
        }
      }
      // an exact tie counts only for the earlier of the two; sorted, every rival is an earlier, kept candidate
      if (allGe && (anyGt || sorted || j < i)) {
        copies += rival.copies;
        counted.add(rival.item);
      }
    }
    if (copies < slotsOfType) {
      keep.push(cand);
    }
  }
  return keep;
}

/* Pruning with limits on stats (Target GCD: a speed minimum or band; tier ranking: minimums on other stats). The search
   needs only a candidate's score (target and tiebreaks, packed) and its limited stats (`stats`), so A (`rival`) beats
   B (`cand`) when A has at least B's score and at least B's value of every limited stat (a minimum: more never hurts),
   exactly B's speed when `exactSpeedKey` (the speed stat's key, given for a speed maximum too: more speed can break it), and leaves no slot empty that B
   does not. Any loadout using B can then swap in A without a lower score or a broken limit. The other stats play no
   part, so far more candidates go than with pruneDominated, which compares every stat (they are still shown in the
   result; between loadouts that tie on the score, which one is returned can differ). Copies as in pruneDominated,
   counted once per item. `arr` is sorted by score, then the sum of the limited stats, highest first (buildCandidates),
   so every beater of a candidate comes before it and only the kept ones need comparing. With `exactSpeedKey` only equal
   speeds compare, so it runs per speed. */
export function pruneForLimits(
  arr: readonly Candidate[],
  slotsOfType: number,
  stats: readonly string[],
  exactSpeedKey: string | null = null,
): Candidate[] {
  if (exactSpeedKey) {
    const bySpd = new Map<number, Candidate[]>();
    for (const a of arr) {
      const s = a.eff[exactSpeedKey] || 0;
      if (!bySpd.has(s)) {
        bySpd.set(s, []);
      }
      must(bySpd, s, 'speed group').push(a);
    }
    const kept = new Set<Candidate>();
    for (const group of bySpd.values()) {
      for (const a of pruneForLimits(group, slotsOfType, stats)) {
        kept.add(a);
      }
    }
    return arr.filter(a => kept.has(a));
  }
  // blocked slots as a bit mask (typeMask), so the inner loop does no allocation
  // the kept candidates' score, limited values (keptValues[k][j] for stats[k]) and mask, in arrays for the inner loop
  const keep: Candidate[] = [],
    keptScore: number[] = [],
    keptValues: number[][] = stats.map(() => []),
    keptMask: number[] = [];
  for (const cand of arr) {
    const candMask = typeMask(cand.blocks),
      candValues = stats.map(s => cand.eff[s] || 0);
    let copies = 0;
    const counted = new Set();
    for (let j = 0; j < keep.length && copies < slotsOfType; j++) {
      // the rival needs at least the score and every limited value, and must leave empty no slot that cand fills
      if (keptScore[j] < cand.score || (keptMask[j] & candMask) !== keptMask[j]) {
        continue;
      }
      let allGe = true;
      for (let k = 0; k < stats.length; k++) {
        if (keptValues[k][j] < candValues[k]) {
          allGe = false;
          break;
        }
      }
      if (!allGe) {
        continue;
      }
      const rival = keep[j];
      if (counted.has(rival.item)) {
        continue;
      }
      copies += rival.copies;
      counted.add(rival.item);
    }
    if (copies < slotsOfType) {
      keep.push(cand);
      keptScore.push(cand.score);
      for (let k = 0; k < stats.length; k++) {
        keptValues[k].push(candValues[k]);
      }
      keptMask.push(candMask);
    }
  }
  return keep;
}

/* objective = {target, tiebreak}, ranked after weapon damage (rankedKeys; `weaponFirst` false: the objective alone).
   Returns {slotList, posList, dims, noMeldData, score, fixed, fixedBlocked}: slotList is the slot sequence to fill (slots
   that have items, 'ring' twice), posList[i] is the candidate list for slotList[i], best score first. Each candidate lists
   the slot types it leaves empty (`blocks`); a slot some candidate can block comes after every other slot, so the
   search knows whether it is blocked when it gets there. The pool holds only gear the job can wear (it is emptied on a
   job change), so an off-hand in it means the job can use one. `melds`: give every piece that is not synced its best
   melds for the objective (itemCandidate). The loadout's limits, which the search may then hold:
   - `speed`: a speed rule, 'min' (a minimum) or 'exact' (a maximum too);
   - `minStats`: other stats that may get a minimum (tier ranking).
   With any limit, every piece brings each of its meld versions (itemVersions) when melds are on, and pruning compares
   the score and the limited stats only (pruneForLimits). The versions are on the objective's keys and the limited
   stats, after `versionKeys` (more stats keep more versions, which is still exact): tier ranking passes every key of
   its goal, in one order, so its stages share meldVersions' memo instead of each enumerating its own, and a
   `versionCache` (itemVersions), so they build each piece's versions once.

   `fixed`: pinned pieces (fixedCandidate), worn as they are. The search does not fill their slots: a slot with a pinned
   piece, or covered by one (a pinned cloak covers the head), has no list; a pool piece that would cover a pinned
   piece's slot is left out; with one ring pinned the other ring is a slot of its own (FREE_RING) whose pieces have
   their copies less the pinned ring's (a pinned Unique ring is no candidate); with both pinned there is none. The
   caller adds the pinned pieces' stats to the search's totals and takes them off its limits (solve in index.ts).
   `fixed` is returned as accepted; `fixedBlocked` lists the slots the pinned pieces leave empty that the pool has
   pieces for, [{type, blockedBy}], for the empty picks: covered by a pinned piece (blockedBy: that item), or with no
   piece that fits beside them, like the one free ring when only a pinned Unique ring is left (blockedBy: null). Throws on pins that cannot be worn together: two in
   one slot, three rings, a Unique ring on both ring rows, or one in a slot another covers. */
export function buildCandidates(
  job: JobContext,
  pool: readonly PoolItem[],
  sync: Sync,
  { target, tiebreak = [] }: Objective,
  {
    prune = true,
    melds = false,
    speed = null,
    minStats = [],
    versionKeys = [],
    versionCache = null,
    weaponFirst = true,
    fixed = [],
  }: BuildOptions = {},
): BuiltCandidates {
  const dims = vectorDims(job);
  const ranked = rankedKeys(job, target, tiebreak, weaponFirst);
  // the stats the search may hold to a minimum or band, speed first
  const limitStats = [...new Set([...(speed ? [job.speedKey] : []), ...minStats])];
  // melds are chosen per piece from the objective's keys (meld.ts keeps the substats among them; weapon damage is no
  // meld's), before the score weights are derived from the vectors
  const keys = melds ? [target, ...present(tiebreak)].slice(0, MAX_GOAL_KEYS) : null;

  // pinned pieces: the slot types they fill, what they cover, and how many copies of each ring they wear
  const pinned = pinnedSlots(fixed);
  const slotNames = SLOT_TYPES.map(t => (t === 'ring' && pinned.rings === 1 ? FREE_RING : t));
  const candsByType: Record<string, Candidate[]> = {};
  SLOT_TYPES.forEach((t, k) => {
    const name = slotNames[k];
    const taken = t === 'ring' ? pinned.rings === 2 : pinned.filled.has(t);
    if (taken || pinned.covered.has(t)) {
      candsByType[name] = [];
      return;
    }
    const items = pool.filter(i => i.type === t);
    const cands =
      melds && limitStats.length
        ? items.flatMap(item =>
            itemVersions(
              job,
              item,
              sync,
              [...new Set<DimKey>([...versionKeys, ...(keys ?? []), ...limitStats])],
              speed === 'exact',
              versionCache,
            ),
          )
        : items.map(item => itemCandidate(job, item, sync, keys));
    candsByType[name] = fixed.length ? leftFor(cands, pinned) : cands;
  });
  const blockable = blockableTypes(slotNames.map(n => candsByType[n]));
  // slots some candidate can leave empty go last, so the search knows whether a chosen piece blocks them
  const order = [...slotNames.filter(t => !blockable.has(t)), ...slotNames.filter(t => blockable.has(t))];
  const slotList: SearchSlot[] = [];
  order.forEach(t => {
    if (!candsByType[t].length) {
      return;
    }
    slotList.push(t);
    if (t === 'ring') {
      slotList.push('ring');
    }
  });
  const score = makeScorer(
    ranked,
    slotList.map(t => candsByType[t].map(a => a.eff)),
  );
  const prunedByType: Record<string, Candidate[]> = {};
  slotList.forEach(t => {
    if (prunedByType[t]) {
      return;
    }
    const arr = candsByType[t];
    arr.forEach(a => {
      a.score = score(a.eff);
    });
    // beaters first (pruneDominated, sorted): a beater has at least the score and, unless it is an exact tie, a larger
    // stat sum; the sort is stable, so exact ties keep pool order, which is what the tie rule goes by
    const sum = (a: Candidate) => dims.reduce((x, d) => x + a.eff[d], 0);
    arr.forEach(a => {
      a.sum = sum(a);
    });
    const slotsOfType = slotList.filter(x => x === t).length;
    let keep = arr;
    if (limitStats.length) {
      // a beater has at least the score and every limited value, so at least their sum
      const limitedSum = (a: Candidate) => limitStats.reduce((x, s) => x + (a.eff[s] || 0), 0);
      arr.sort((a, b) => b.score - a.score || limitedSum(b) - limitedSum(a) || b.sum - a.sum);
      if (prune) {
        keep = pruneForLimits(arr, slotsOfType, limitStats, speed === 'exact' ? job.speedKey : null);
      }
    } else {
      arr.sort((a, b) => b.score - a.score || b.sum - a.sum);
      if (prune) {
        keep = pruneDominated(arr, dims, slotsOfType, true);
      }
    }
    prunedByType[t] = keep;
  });
  // for the page's note: pieces with no slot data (hand-made, generated) never take melds
  const noMeldData = melds ? pool.filter(i => !meldInfo(i)).length : 0;
  const fixedBlocked = fixed.length
    ? SLOT_TYPES.flatMap((t, k): FixedBlocked[] => {
        const hasPieces = pool.some(i => i.type === t);
        if (pinned.covered.has(t)) {
          return hasPieces ? [{ type: t, blockedBy: must(pinned.coveredBy, t, 'covering piece') }] : [];
        }
        const open = t === 'ring' ? pinned.rings < 2 : !pinned.filled.has(t);
        return open && hasPieces && !candsByType[slotNames[k]].length ? [{ type: t, blockedBy: null }] : [];
      })
    : ([] as FixedBlocked[]);
  return { slotList, posList: slotList.map(t => prunedByType[t]), dims, noMeldData, score, fixed, fixedBlocked };
}

/* Where pinned pieces (`fixed`, fixedCandidate) sit: {filled: the slot types they wear, rings: how many of them are
   rings, ringCopies: Map {item id: pinned rings of it}, covered: the slot types they cover, coveredBy: Map {slot type:
   the pinned item covering it}}. Throws on pins that cannot be worn together (see buildCandidates). */
function pinnedSlots(fixed: readonly Candidate[]): PinnedSlots {
  const filled = new Set<SlotType>();
  const ringCopies = new Map<string, number>();
  const covered = new Set<SlotType>();
  const coveredBy = new Map<SlotType, PoolItem>();
  let rings = 0;
  for (const cand of fixed) {
    const type = cand.item.type;
    if (type === 'ring') {
      if (++rings > 2) {
        throw new Error('Optimizer: more than two pinned rings');
      }
      // the search's own copy rule: a Unique ring has one copy, so pinning it on both ring rows cannot be worn
      const worn = (ringCopies.get(cand.item.id) || 0) + 1;
      if (worn > cand.copies) {
        throw new Error(`Optimizer: ${worn} pinned copies of a ring with ${cand.copies}`);
      }
      ringCopies.set(cand.item.id, worn);
    } else if (filled.has(type)) {
      throw new Error(`Optimizer: two pinned pieces in the ${type} slot`);
    }
    filled.add(type);
    for (const blocked of cand.blocks) {
      covered.add(blocked);
      coveredBy.set(blocked, cand.item);
    }
  }
  for (const type of covered) {
    if (filled.has(type)) {
      throw new Error(`Optimizer: a pinned piece covers the pinned ${type} slot`);
    }
  }
  return { filled, rings, ringCopies, covered, coveredBy };
}

/* Why pinned pieces (`fixed`, fixedCandidate) cannot be worn together (the message buildCandidates throws), or null when
   they can. A ring's copies are its candidate's (2, or 1 for a Unique ring), the same count the search keeps. */
export function pinProblem(fixed: readonly Candidate[]): string | null {
  try {
    pinnedSlots(fixed);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/* The free candidates `cands` of one slot type that fit beside the pinned pieces (pinnedSlots): not those that would
   cover a slot a pinned piece wears, and for rings the copies the pinned rings leave (a candidate with none left is
   dropped). The inputs are not changed. */
function leftFor(cands: readonly Candidate[], pinned: PinnedSlots): Candidate[] {
  return cands
    .filter(c => !c.blocks.some(t => pinned.filled.has(t)))
    .flatMap(c => {
      const left = c.copies - (pinned.ringCopies.get(c.item.id) || 0);
      return left > 0 ? [left === c.copies ? c : { ...c, copies: left }] : [];
    });
}
