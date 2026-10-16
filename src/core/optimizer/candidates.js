/* Optimizer stage 1: turn a pool into per-slot candidate lists.
   Each candidate carries its effective stat vector (synced where item level or level sync applies) and its scalar score.
   Candidates dominated by another item in the same slot are dropped. */
import { SLOT_TYPES } from '../constants.js';
import { capsFor, syncStats } from '../formulas.js';
import { equipLevel, meldInfo, scalesWithLevel, slotInfo } from '../items.js';
import { bestMeld, meldCaps, meldVersions } from '../meld.js';
import { syncTarget } from '../sync-target.js';

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

/* Lexicographic score [target, tiebreak 1, tiebreak 2] packed into one number, so the search can add and
   bound it like any sum. Fixed weights (1e8 / 1e4 / 1) are only lexicographic while tiebreak totals stay below
   10,000 (docs/history.md), so the weights are derived from the pool instead: with R2 = the range a loadout's
   tiebreak-2 total can span (sum over slots of max - min, 0 included for an empty slot) and R1 likewise,
   W2 = 1, W1 = R2 + 1, W0 = R1 * W1 + R2 + 1. Then a tiebreak difference can never outweigh one unit of a
   higher key, for any totals. Stats are integers, so the scores are exact while they stay within
   Number.MAX_SAFE_INTEGER; that is checked, and a pool too large for it throws instead of ranking wrongly.
   `slotVectors[i]` is the list of stat vectors for slot i of the loadout (the ring list appears twice). */
export function makeScorer(target, tiebreaks, slotVectors) {
  const keys = [target, ...tiebreaks.filter(Boolean)].slice(0, 3);
  const range = k =>
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
  const r = keys.map(range);
  const w = new Array(keys.length).fill(1);
  for (let i = keys.length - 2; i >= 0; i--) {
    // W_i = (span of everything below key i, in score units) + 1
    let below = 0;
    for (let j = i + 1; j < keys.length; j++) below += r[j].span * w[j];
    w[i] = below + 1;
  }
  const maxAbs = r.reduce((a, ri, i) => a + ri.abs * w[i], 0);
  if (!Number.isSafeInteger(maxAbs) || !w.every(Number.isSafeInteger)) {
    throw new Error('Optimizer: stat totals too large to rank exactly (score bound ' + maxAbs + ' exceeds 2^53)');
  }
  return v => {
    let sc = 0;
    for (let i = 0; i < keys.length; i++) sc += (v[keys[i]] || 0) * w[i];
    return sc;
  };
}

/* Dimensions tracked per item: the job's stats. */
export function vectorDims(job) {
  return job.stats.slice();
}

/* A pool item's candidate: its effective stat vector and, when `keys` is given (melds on) and the piece is not synced,
   its best melds for the objective (bestMeld), already added to the vector. One melded version per piece is exact:
   the loadout score is a sum of per-piece terms, and copies and blocked slots depend on the item, not on its melds, so
   giving every worn piece its own best melds never lowers a loadout (docs/engineering/optimizer.md, section 6). A synced piece
   keeps no melds (verified in game by the owner). */
function itemCandidate(job, item, sync, keys) {
  const e = effStats(job, item, sync);
  const meld = keys && itemSyncIlvl(item, sync) == null ? bestMeld(job, item, keys) : null;
  return withMeld(job, item, e, meld);
}

function withMeld(job, item, e, meld) {
  const v = {};
  job.stats.forEach(s => {
    v[s] = (e[s] || 0) + (meld?.gain[s] || 0);
  });
  return { it: item, v, copies: item.copies || 1, blocks: slotInfo(job, item).blocks, meld };
}

/* With a speed rule (Target GCD) and melds: one candidate per meld version of the piece (meldVersions), all sharing the
   item, so copies and Unique rings still count once per piece (pruneDominated counts by `it`, the search by item id). */
function itemVersions(job, item, sync, keys, exactSpd) {
  const e = effStats(job, item, sync);
  if (itemSyncIlvl(item, sync) != null) return [withMeld(job, item, e, null)];
  return meldVersions(job, item, keys, { exactSpd }).map(meld => withMeld(job, item, e, meld));
}

/* A beats B when A is >= on every dimension and either > on one of them or, for an exact tie, comes first, and A
   leaves no slot empty that B does not (a cloak covering the head never beats a plain body piece).
   B can be dropped only when the items that beat it have enough copies between them to fill every slot of
   this type (`slotsOfType`: 1, or 2 for rings). Then any loadout using B can swap it for one of them without
   losing anything. For rings, a single better Unique ring is not enough: the best pair may be that ring plus B
   (docs/history.md). Dropped items' own beaters also beat B, so the kept set always has enough copies.
   Copies are counted once per item: several candidates of one item (`it`) are still one item's copies.
   `sorted`: every beater of a candidate comes before it in arr (buildCandidates sorts by score, then stat sum, ties in
   pool order). Then B is compared with the kept candidates only: since the kept beaters always have enough copies (see
   above), that drops exactly the same candidates, and the kept list is much shorter than arr. */
export function pruneDominated(arr, dims, slotsOfType, sorted = false) {
  const keep = [];
  for (let i = 0; i < arr.length; i++) {
    const B = arr[i];
    let copies = 0;
    const counted = new Set();
    const rivals = sorted ? keep : arr;
    for (let j = 0; j < rivals.length && copies < slotsOfType; j++) {
      const A = rivals[j];
      if (A === B) continue;
      if (counted.has(A.it)) continue;
      if (!A.blocks.every(t => B.blocks.includes(t))) continue;
      let ge = true,
        gt = false;
      for (const d of dims) {
        if (A.v[d] < B.v[d]) {
          ge = false;
          break;
        }
        if (A.v[d] > B.v[d]) gt = true;
      }
      if (ge && (gt || sorted || j < i)) {
        copies += A.copies;
        counted.add(A.it);
      }
    }
    if (copies < slotsOfType) keep.push(B);
  }
  return keep;
}

/* Pruning with a speed rule (Target GCD). The search needs only a candidate's score (target and tiebreaks, packed) and
   its speed, so A beats B when A has at least B's score and at least its speed ('min': a speed minimum, where more speed
   never hurts) or exactly its speed ('exact': a maximum too, where more speed can break it), and leaves no slot empty
   that B does not. Any loadout using B can then swap in A without a lower score or a broken speed rule. The other stats
   play no part, so far more candidates go than with pruneDominated, which compares every stat (they are still shown in
   the result; between loadouts that tie on the score, which one is returned can differ). Copies as in pruneDominated,
   counted once per item. `arr` is sorted by score, then speed, highest first (buildCandidates), so every beater of a
   candidate comes before it and only the kept ones need comparing. In 'exact' mode only equal speeds compare, so it
   runs per speed. */
export function pruneForSpeed(arr, slotsOfType, mode) {
  if (mode === 'exact') {
    const bySpd = new Map();
    for (const a of arr) {
      const s = a.v.spd || 0;
      if (!bySpd.has(s)) bySpd.set(s, []);
      bySpd.get(s).push(a);
    }
    const kept = new Set();
    for (const group of bySpd.values()) for (const a of pruneForSpeed(group, slotsOfType, 'min')) kept.add(a);
    return arr.filter(a => kept.has(a));
  }
  // blocked slots as a bit mask, so the inner loop does no allocation
  const bit = new Map();
  const mask = a =>
    a.blocks.reduce((m, t) => {
      if (!bit.has(t)) bit.set(t, 1 << bit.size);
      return m | bit.get(t);
    }, 0);
  const keep = [],
    kSc = [],
    kSpd = [],
    kMask = [];
  for (const B of arr) {
    const bm = mask(B),
      bs = B.v.spd || 0;
    let copies = 0;
    const counted = new Set();
    for (let j = 0; j < keep.length && copies < slotsOfType; j++) {
      if (kSc[j] < B.sc || kSpd[j] < bs || (kMask[j] & bm) !== kMask[j]) continue;
      const A = keep[j];
      if (counted.has(A.it)) continue;
      copies += A.copies;
      counted.add(A.it);
    }
    if (copies < slotsOfType) {
      keep.push(B);
      kSc.push(B.sc);
      kSpd.push(bs);
      kMask.push(bm);
    }
  }
  return keep;
}

/* objective = {target, tiebreak}. Returns {slotList, posList, dims}: slotList is the slot sequence to fill (slots that
   have items, 'ring' twice); posList[i] is the candidate list for slotList[i], best score first. Each candidate lists
   the slot types it leaves empty (`blocks`); a slot some candidate can block comes after every other slot, so the
   search knows whether it is blocked when it gets there. The pool holds only gear the job can wear (it is emptied on a
   job change), so an off-hand in it means the job can use one. `melds`: give every piece that is not synced its best
   melds for the objective (itemCandidate). `speed`: the loadout has a speed rule, 'min' (a minimum) or 'exact' (a
   maximum too): with melds every piece brings each of its meld versions (itemVersions), and pruning compares score and
   speed only (pruneForSpeed). */
export function buildCandidates(job, pool, sync, { target, tiebreak = [] }, { prune = true, melds = false, speed = null } = {}) {
  const dims = vectorDims(job);
  // melds are chosen per piece from the objective's keys, before the score weights are derived from the vectors
  const keys = melds ? [target, ...tiebreak.filter(Boolean)].slice(0, 3) : null;
  const all = {};
  SLOT_TYPES.forEach(t => {
    const items = pool.filter(i => i.type === t);
    all[t] =
      melds && speed
        ? items.flatMap(it => itemVersions(job, it, sync, [...keys, 'spd'], speed === 'exact'))
        : items.map(it => itemCandidate(job, it, sync, keys));
  });
  const blockable = new Set(SLOT_TYPES.flatMap(t => all[t].flatMap(a => a.blocks)));
  const order = [...SLOT_TYPES.filter(t => !blockable.has(t)), ...SLOT_TYPES.filter(t => blockable.has(t))];
  const slotList = [];
  order.forEach(t => {
    if (!all[t].length) return;
    slotList.push(t);
    if (t === 'ring') slotList.push('ring');
  });
  const score = makeScorer(
    target,
    tiebreak,
    slotList.map(t => all[t].map(a => a.v)),
  );
  const cand = {};
  slotList.forEach(t => {
    if (cand[t]) return;
    const arr = all[t];
    arr.forEach(a => {
      a.sc = score(a.v);
    });
    // beaters first (pruneDominated, sorted): a beater has at least the score and, unless it is an exact tie, a larger
    // stat sum; the sort is stable, so exact ties keep pool order, which is what the tie rule goes by
    const sum = a => dims.reduce((x, d) => x + a.v[d], 0);
    arr.forEach(a => {
      a.sum = sum(a);
    });
    const n = slotList.filter(x => x === t).length;
    let keep = arr;
    if (speed) {
      arr.sort((a, b) => b.sc - a.sc || (b.v.spd || 0) - (a.v.spd || 0) || b.sum - a.sum);
      if (prune) keep = pruneForSpeed(arr, n, speed);
    } else {
      arr.sort((a, b) => b.sc - a.sc || b.sum - a.sum);
      if (prune) keep = pruneDominated(arr, dims, n, true);
    }
    cand[t] = keep;
  });
  // for the page's note: pieces with no slot data (hand-made, generated) never take melds
  const noMeldData = melds ? pool.filter(i => !meldInfo(i)).length : 0;
  return { slotList, posList: slotList.map(t => cand[t]), dims, noMeldData };
}
