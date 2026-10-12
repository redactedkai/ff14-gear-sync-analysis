/* Optimizer stage 1: turn a pool into per-slot candidate lists.
   Each candidate carries its effective stat vector (synced if sync is on) and its scalar score.
   Candidates dominated by another item in the same slot are dropped. */
import { SLOT_TYPES } from '../constants.js';
import { syncStats } from '../formulas.js';
import { slotInfo } from '../items.js';

/* sync = {cap, sync}: the cap item level and whether sync is on. A piece is capped by its own slot share. */
export function effStats(job, item, sync) {
  return sync.sync ? syncStats(job, item.stats, item.type, sync.cap, item.ilvl, slotInfo(job, item).pct) : item.stats;
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

function itemVector(job, item, sync) {
  const e = effStats(job, item, sync);
  const v = {};
  job.stats.forEach(s => {
    v[s] = e[s] || 0;
  });
  return v;
}

/* A beats B when A is >= on every dimension and either > on one of them or, for an exact tie, comes first, and A
   leaves no slot empty that B does not (a cloak covering the head never beats a plain body piece).
   B can be dropped only when the items that beat it have enough copies between them to fill every slot of
   this type (`slotsOfType`: 1, or 2 for rings). Then any loadout using B can swap it for one of them without
   losing anything. For rings, a single better Unique ring is not enough: the best pair may be that ring plus B
   (docs/history.md). Dropped items' own beaters also beat B, so the kept set always has enough copies. */
function pruneDominated(arr, dims, slotsOfType) {
  const keep = [];
  for (let i = 0; i < arr.length; i++) {
    const B = arr[i];
    let copies = 0;
    for (let j = 0; j < arr.length && copies < slotsOfType; j++) {
      if (i === j) continue;
      const A = arr[j];
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
      if (ge && (gt || j < i)) copies += A.copies;
    }
    if (copies < slotsOfType) keep.push(B);
  }
  return keep;
}

/* objective = {target, tiebreak}. Returns {slotList, posList, dims}: slotList is the slot sequence to fill (slots that
   have items, 'ring' twice); posList[i] is the candidate list for slotList[i], best score first. Each candidate lists
   the slot types it leaves empty (`blocks`); a slot some candidate can block comes after every other slot, so the
   search knows whether it is blocked when it gets there. The pool holds only gear the job can wear (it is emptied on a
   job change), so an off-hand in it means the job can use one. */
export function buildCandidates(job, pool, sync, { target, tiebreak = [] }, { prune = true } = {}) {
  const dims = vectorDims(job);
  const all = {};
  SLOT_TYPES.forEach(t => {
    all[t] = pool
      .filter(i => i.type === t)
      .map(it => ({ it, v: itemVector(job, it, sync), copies: it.copies || 1, blocks: slotInfo(job, it).blocks }));
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
    const keep = prune ? pruneDominated(arr, dims, slotList.filter(x => x === t).length) : arr;
    keep.sort((a, b) => b.sc - a.sc);
    cand[t] = keep;
  });
  return { slotList, posList: slotList.map(t => cand[t]), dims };
}
