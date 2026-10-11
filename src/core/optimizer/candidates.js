/* Optimizer stage 1: turn a pool into per-slot candidate lists.
   Each candidate carries its effective stat vector (synced if sync is on) and its scalar score.
   Candidates dominated by another item in the same slot are dropped. */
import { SLOT_TYPES } from '../constants.js';
import { syncStats } from '../formulas.js';
import { slotActive, ilWeight } from '../job-context.js';

/* Lexicographic score: target, tiebreak 1, tiebreak 2. Only lexicographic while each tiebreak total stays
   below 10,000 (see docs/audit.md F3). */
export const SCORE_WEIGHTS = Object.freeze([1e8, 1e4, 1]);

/* sync = {cap, sync}: the cap item level and whether sync is on */
export function effStats(job, item, sync) {
  return sync.sync ? syncStats(job, item.stats, item.type, sync.cap, item.ilvl) : item.stats;
}

export function makeScorer(target, tiebreaks) {
  const [tb1, tb2] = tiebreaks;
  return v => {
    let sc = (v[target] || 0) * SCORE_WEIGHTS[0];
    if (tb1) sc += (v[tb1] || 0) * SCORE_WEIGHTS[1];
    if (tb2) sc += (v[tb2] || 0) * SCORE_WEIGHTS[2];
    return sc;
  };
}

/* Dimensions tracked per item: the job's stats plus `ilw` (item level x slot weight, for the average). */
export function vectorDims(job) {
  return job.stats.concat(['ilw']);
}

function itemVector(job, item, sync) {
  const e = effStats(job, item, sync);
  const v = {};
  job.stats.forEach(s => {
    v[s] = e[s] || 0;
  });
  v.ilw = item.ilvl * ilWeight(job, item.type);
  return v;
}

/* A is dominated by B when B is >= on every dimension and has at least as many copies; among exact ties the
   earlier item is kept. NOTE: unsafe for the two ring slots (docs/audit.md F1), kept as-is for now. */
function pruneDominated(arr, dims) {
  const keep = [];
  for (let i = 0; i < arr.length; i++) {
    let dom = false;
    for (let j = 0; j < arr.length && !dom; j++) {
      if (i === j) continue;
      const A = arr[j],
        B = arr[i];
      if (A.copies < B.copies) continue;
      let ge = true,
        gt = false;
      for (const d of dims) {
        if (A.v[d] < B.v[d]) {
          ge = false;
          break;
        }
        if (A.v[d] > B.v[d]) gt = true;
      }
      if (ge && (gt || j < i)) dom = true;
    }
    if (!dom) keep.push(arr[i]);
  }
  return keep;
}

/* Returns {slotList, posList, dims}: slotList is the slot sequence to fill (active slots that have items,
   'ring' twice); posList[i] is the candidate list for slotList[i], best score first. */
export function buildCandidates(job, pool, sync, score) {
  const dims = vectorDims(job);
  const present = {};
  SLOT_TYPES.forEach(t => {
    present[t] = slotActive(job, t) ? pool.filter(i => i.type === t) : [];
  });
  const slotList = [];
  SLOT_TYPES.forEach(t => {
    if (!present[t].length) return;
    slotList.push(t);
    if (t === 'ring') slotList.push('ring');
  });
  const cand = {};
  slotList.forEach(t => {
    if (cand[t]) return;
    const arr = present[t].map(it => ({ it, v: itemVector(job, it, sync), copies: it.copies || 1 }));
    arr.forEach(a => {
      a.sc = score(a.v);
    });
    const keep = pruneDominated(arr, dims);
    keep.sort((a, b) => b.sc - a.sc);
    cand[t] = keep;
  });
  return { slotList, posList: slotList.map(t => cand[t]), dims };
}
