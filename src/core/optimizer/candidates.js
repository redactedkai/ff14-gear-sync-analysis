/* Optimizer stage 1: turn a pool into per-slot candidate lists.
   Each candidate carries its effective stat vector (synced where item level or level sync applies) and its scalar score.
   Candidates dominated by another item in the same slot are dropped.

   A candidate (built by withMeld, read by search.js and solve in index.js):
     item    the pool item
     eff     its effective stats: after sync, plus its melds ({neutral stat: points}, the job's stats), and its weapon
             damage after sync under WD_KEY when the job ranks it (damage-defense.js; 0 off the weapon)
     copies  how many of it can be worn (2 for a non-Unique ring), counted per item, not per candidate
     blocks  slot types it leaves empty (a two-handed weapon the off-hand, a cloak the head)
     meld    its melds (bestMeld in meld.js) or null
     score   [weapon damage, target, tiebreak 1, tiebreak 2] packed into one number (makeScorer); set by buildCandidates
     sum     its stat total, the sort tiebreak; set by buildCandidates
     versions every meld version of the piece, this one among them (itemVersions only): a regain cut (regain.js) may
             swap a ring for any of them, including those pruning dropped */
import { SLOT_TYPES } from '../constants.js';
import { WD_KEY, weaponDamage } from '../damage-defense.js';
import { capsFor, syncStats } from '../formulas.js';
import { equipLevel, meldInfo, scalesWithLevel, slotInfo } from '../items.js';
import { bestMeld, meldCaps, meldVersions } from '../meld.js';
import { syncTarget } from '../sync-target.js';
import { blockableTypes, typeMask } from './slot-index.js';

/* The item level a pool item is synced to, or null when it is untouched (syncTarget). sync = {cap, sync, level}: the
   item level cap, whether item level sync is on (with a cap set), and the synced character level (null or missing: no
   level sync). Only database pieces have an equip level (or scale with the level), so only they can be level-synced. */
export function itemSyncIlvl(item, sync) {
  return syncTarget({
    itemLevel: item.ilvl,
    equipLevel: equipLevel(item),
    scales: scalesWithLevel(item),
    syncOn: sync.sync,
    cap: sync.cap,
    syncedLevel: sync.level ?? null,
  });
}

/* A pool item's stats after sync. A piece is capped by its own slot share and stat factors. */
export function effStats(job, item, sync) {
  const target = itemSyncIlvl(item, sync);
  if (target == null) return item.stats;
  const s = slotInfo(job, item);
  return syncStats(job, item.stats, item.type, target, item.ilvl, s.pct, s.factors);
}

/* The most each stat on a pool item can be after sync and melds: the cap at the item level it is synced to, or, when it
   is untouched, its own cap (the meld cap). For the page's "at cap" marks. */
export function itemCaps(job, item, sync) {
  const target = itemSyncIlvl(item, sync);
  if (target == null) return meldCaps(job, item);
  const s = slotInfo(job, item);
  return capsFor(job, item.type, target, s.pct, s.factors);
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
export function makeScorer(keys, slotVectors) {
  const ranked = keys.filter(Boolean);
  if (ranked.length > MAX_KEYS) {
    throw new Error(`Optimizer: at most ${MAX_KEYS} ranked keys fit one score, got ${ranked.length} (${ranked.join(', ')})`);
  }
  const keySpan = k =>
    slotVectors.reduce(
      (acc, vs) => {
        let lo = 0,
          hi = 0;
        vs.forEach(v => {
          const x = v[k] || 0;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
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
    for (let j = i + 1; j < ranked.length; j++) below += spans[j].span * weights[j];
    weights[i] = below + 1;
  }
  const maxAbs = spans.reduce((a, span, i) => a + span.abs * weights[i], 0);
  if (!Number.isSafeInteger(maxAbs) || !weights.every(Number.isSafeInteger)) {
    throw new Error('Optimizer: stat totals too large to rank exactly (score bound ' + maxAbs + ' exceeds 2^53)');
  }
  return v => {
    let score = 0;
    for (let i = 0; i < ranked.length; i++) score += (v[ranked[i]] || 0) * weights[i];
    return score;
  };
}

/* Dimensions tracked per item: the job's stats, and weapon damage (WD_KEY) when the job ranks it (job.damageKey). */
export function vectorDims(job) {
  return job.damageKey ? [...job.stats, WD_KEY] : job.stats.slice();
}

/* The keys a score ranks, in order: weapon damage first when the job ranks it and `weaponFirst` (owner's decision
   2026-10-18: no set gives it up for more of the goal's stats; only the weapon carries it), then the target and
   tiebreaks, each once. fastestGcd turns `weaponFirst` off: it asks for the most speed at any weapon damage. */
export function rankedKeys(job, target, tiebreak, weaponFirst = true) {
  return [...new Set([...(weaponFirst && job.damageKey ? [WD_KEY] : []), target, ...tiebreak.filter(Boolean)])];
}

/* A pool item's candidate: its effective stat vector and, when `keys` is given (melds on) and the piece is not synced,
   its best melds for the objective (bestMeld), already added to the vector. One melded version per piece is exact:
   the loadout score is a sum of per-piece terms, and copies and blocked slots depend on the item, not on its melds, so
   giving every worn piece its own best melds never lowers a loadout (docs/engineering/optimizer.md, section 6). A synced piece
   keeps no melds (verified in game by the owner). */
function itemCandidate(job, item, sync, keys) {
  const target = itemSyncIlvl(item, sync);
  const synced = effStats(job, item, sync);
  const meld = keys && target == null ? bestMeld(job, item, keys) : null;
  return withMeld(job, item, synced, meld, target);
}

/* A candidate for `item`: its synced stats plus the melds' gains, and its weapon damage (WD_KEY) after sync when the job
   ranks it. `target`: the item level it is synced to (itemSyncIlvl), null when untouched. */
function withMeld(job, item, synced, meld, target) {
  const v = {};
  job.stats.forEach(s => {
    v[s] = (synced[s] || 0) + (meld?.gain[s] || 0);
  });
  if (job.damageKey) v[WD_KEY] = weaponDamage(job, item, target);
  return { item, eff: v, copies: item.copies || 1, blocks: slotInfo(job, item).blocks, meld };
}

/* With limits (a speed rule, stat minimums) and melds: one candidate per meld version of the piece (meldVersions) on
   `keys`, the objective's keys and the limited stats, all sharing the item, so copies and Unique rings still count
   once per piece (pruneDominated counts by `item`, the search by item id). Each keeps the whole list as `versions`.
   `versionCache` (optional, a Map): the versions built before for the same item, keys and speed rule, from the same
   job and sync. They depend on nothing else (not on the objective), so tier ranking's stages, one candidate list
   each, build them once; each list gets its own shallow copies, since buildCandidates writes each candidate's score
   and sum. */
function itemVersions(job, item, sync, keys, exactSpd, versionCache) {
  const build = () => {
    const target = itemSyncIlvl(item, sync);
    const synced = effStats(job, item, sync);
    if (target != null) return [withMeld(job, item, synced, null, target)];
    const versions = meldVersions(job, item, keys, { exactSpd }).map(meld => withMeld(job, item, synced, meld, null));
    for (const v of versions) v.versions = versions;
    return versions;
  };
  if (!versionCache) return build();
  const key = `${job.jobId}|${sync.cap}|${sync.sync}|${sync.level}|${keys.join()}|${exactSpd}`;
  let byKey = versionCache.get(item);
  if (!byKey) {
    byKey = new Map();
    versionCache.set(item, byKey);
  }
  if (!byKey.has(key)) byKey.set(key, build());
  return byKey.get(key).map(v => ({ ...v }));
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
export function pruneDominated(arr, dims, slotsOfType, sorted = false) {
  const keep = [];
  for (let i = 0; i < arr.length; i++) {
    const cand = arr[i];
    let copies = 0;
    const counted = new Set();
    const rivals = sorted ? keep : arr;
    for (let j = 0; j < rivals.length && copies < slotsOfType; j++) {
      const rival = rivals[j];
      if (rival === cand) continue;
      if (counted.has(rival.item)) continue;
      if (!rival.blocks.every(t => cand.blocks.includes(t))) continue;
      let allGe = true,
        anyGt = false;
      for (const d of dims) {
        if (rival.eff[d] < cand.eff[d]) {
          allGe = false;
          break;
        }
        if (rival.eff[d] > cand.eff[d]) anyGt = true;
      }
      // an exact tie counts only for the earlier of the two; sorted, every rival is an earlier, kept candidate
      if (allGe && (anyGt || sorted || j < i)) {
        copies += rival.copies;
        counted.add(rival.item);
      }
    }
    if (copies < slotsOfType) keep.push(cand);
  }
  return keep;
}

/* Pruning with limits on stats (Target GCD: a speed minimum or band; tier ranking: minimums on other stats). The search
   needs only a candidate's score (target and tiebreaks, packed) and its limited stats (`stats`), so A (`rival`) beats
   B (`cand`) when A has at least B's score and at least B's value of every limited stat (a minimum: more never hurts),
   exactly B's speed when `exactSpd` (a speed maximum too: more speed can break it), and leaves no slot empty that B
   does not. Any loadout using B can then swap in A without a lower score or a broken limit. The other stats play no
   part, so far more candidates go than with pruneDominated, which compares every stat (they are still shown in the
   result; between loadouts that tie on the score, which one is returned can differ). Copies as in pruneDominated,
   counted once per item. `arr` is sorted by score, then the sum of the limited stats, highest first (buildCandidates),
   so every beater of a candidate comes before it and only the kept ones need comparing. With `exactSpd` only equal
   speeds compare, so it runs per speed. */
export function pruneForLimits(arr, slotsOfType, stats, exactSpd = false) {
  if (exactSpd) {
    const bySpd = new Map();
    for (const a of arr) {
      const s = a.eff.spd || 0;
      if (!bySpd.has(s)) bySpd.set(s, []);
      bySpd.get(s).push(a);
    }
    const kept = new Set();
    for (const group of bySpd.values()) for (const a of pruneForLimits(group, slotsOfType, stats)) kept.add(a);
    return arr.filter(a => kept.has(a));
  }
  // blocked slots as a bit mask (typeMask), so the inner loop does no allocation
  // the kept candidates' score, limited values (keptValues[k][j] for stats[k]) and mask, in arrays for the inner loop
  const keep = [],
    keptScore = [],
    keptValues = stats.map(() => []),
    keptMask = [];
  for (const cand of arr) {
    const candMask = typeMask(cand.blocks),
      candValues = stats.map(s => cand.eff[s] || 0);
    let copies = 0;
    const counted = new Set();
    for (let j = 0; j < keep.length && copies < slotsOfType; j++) {
      // the rival needs at least the score and every limited value, and must leave empty no slot that cand fills
      if (keptScore[j] < cand.score || (keptMask[j] & candMask) !== keptMask[j]) continue;
      let allGe = true;
      for (let k = 0; k < stats.length; k++) {
        if (keptValues[k][j] < candValues[k]) {
          allGe = false;
          break;
        }
      }
      if (!allGe) continue;
      const rival = keep[j];
      if (counted.has(rival.item)) continue;
      copies += rival.copies;
      counted.add(rival.item);
    }
    if (copies < slotsOfType) {
      keep.push(cand);
      keptScore.push(cand.score);
      for (let k = 0; k < stats.length; k++) keptValues[k].push(candValues[k]);
      keptMask.push(candMask);
    }
  }
  return keep;
}

/* objective = {target, tiebreak}, ranked after weapon damage (rankedKeys; `weaponFirst` false: the objective alone).
   Returns {slotList, posList, dims, noMeldData, score}: slotList is the slot sequence to fill (slots that
   have items, 'ring' twice); posList[i] is the candidate list for slotList[i], best score first. Each candidate lists
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
   `versionCache` (itemVersions), so they build each piece's versions once. */
export function buildCandidates(
  job,
  pool,
  sync,
  { target, tiebreak = [] },
  { prune = true, melds = false, speed = null, minStats = [], versionKeys = [], versionCache = null, weaponFirst = true } = {},
) {
  const dims = vectorDims(job);
  const ranked = rankedKeys(job, target, tiebreak, weaponFirst);
  // the stats the search may hold to a minimum or band, speed first
  const limitStats = [...new Set([...(speed ? ['spd'] : []), ...minStats])];
  // melds are chosen per piece from the objective's keys (meld.js keeps the substats among them; weapon damage is no
  // meld's), before the score weights are derived from the vectors
  const keys = melds ? [target, ...tiebreak.filter(Boolean)].slice(0, MAX_GOAL_KEYS) : null;
  const candsByType = {};
  SLOT_TYPES.forEach(t => {
    const items = pool.filter(i => i.type === t);
    candsByType[t] =
      melds && limitStats.length
        ? items.flatMap(item =>
            itemVersions(job, item, sync, [...new Set([...versionKeys, ...keys, ...limitStats])], speed === 'exact', versionCache),
          )
        : items.map(item => itemCandidate(job, item, sync, keys));
  });
  const blockable = blockableTypes(SLOT_TYPES.map(t => candsByType[t]));
  // slots some candidate can leave empty go last, so the search knows whether a chosen piece blocks them
  const order = [...SLOT_TYPES.filter(t => !blockable.has(t)), ...SLOT_TYPES.filter(t => blockable.has(t))];
  const slotList = [];
  order.forEach(t => {
    if (!candsByType[t].length) return;
    slotList.push(t);
    if (t === 'ring') slotList.push('ring');
  });
  const score = makeScorer(
    ranked,
    slotList.map(t => candsByType[t].map(a => a.eff)),
  );
  const prunedByType = {};
  slotList.forEach(t => {
    if (prunedByType[t]) return;
    const arr = candsByType[t];
    arr.forEach(a => {
      a.score = score(a.eff);
    });
    // beaters first (pruneDominated, sorted): a beater has at least the score and, unless it is an exact tie, a larger
    // stat sum; the sort is stable, so exact ties keep pool order, which is what the tie rule goes by
    const sum = a => dims.reduce((x, d) => x + a.eff[d], 0);
    arr.forEach(a => {
      a.sum = sum(a);
    });
    const slotsOfType = slotList.filter(x => x === t).length;
    let keep = arr;
    if (limitStats.length) {
      // a beater has at least the score and every limited value, so at least their sum
      const limitedSum = a => limitStats.reduce((x, s) => x + (a.eff[s] || 0), 0);
      arr.sort((a, b) => b.score - a.score || limitedSum(b) - limitedSum(a) || b.sum - a.sum);
      if (prune) keep = pruneForLimits(arr, slotsOfType, limitStats, speed === 'exact');
    } else {
      arr.sort((a, b) => b.score - a.score || b.sum - a.sum);
      if (prune) keep = pruneDominated(arr, dims, slotsOfType, true);
    }
    prunedByType[t] = keep;
  });
  // for the page's note: pieces with no slot data (hand-made, generated) never take melds
  const noMeldData = melds ? pool.filter(i => !meldInfo(i)).length : 0;
  return { slotList, posList: slotList.map(t => prunedByType[t]), dims, noMeldData, score };
}
