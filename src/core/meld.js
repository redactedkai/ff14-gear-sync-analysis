/* Materia melds: the best stones a piece can take for an objective. Pure; never reads sync state (whether a piece keeps
   its melds is the optimizer's call, itemSyncIlvl). Rules, sources and the exactness argument: docs/mechanics/materia.md.
   - A grade fits gear whose item level is at least its gate (MATERIA.gate). The best "big" stone is the most valuable
     grade the gate allows; the best "small" stone the most valuable grade that is not high (MATERIA.high: VI, VIII, X,
     XII cannot go past the first overmeld slot). Values are not in grade order (VI 16, VII 8).
   - Slots: the guaranteed ones take big stones; with overmelding the piece has 5 in all, the first overmeld slot big and
     the rest small. A piece with no guaranteed slot takes nothing, even if overmelding is flagged (inferred).
   - Each substat on a piece is capped at the piece's own cap (capsFor at its own item level, slot share and stat
     factors); the overflow is lost, and a meld never lowers a stat that is already above the cap.
   - Only combat substats can be melded, never the main stat or Vitality. Every meld succeeds (owner's decision). */
import { MATERIA } from './tables.js';
import { capsFor } from './formulas.js';
import { meldInfo, slotInfo } from './items.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* The best big and small stone for gear of item level `ilvl`: {big, small}, each {grade, value} (grade 1-based) or null
   when no grade fits (below item level 15). */
export function stoneValues(ilvl) {
  let big = null,
    small = null;
  MATERIA.values.forEach((value, i) => {
    const grade = i + 1;
    if (MATERIA.gate[i] > ilvl) return;
    if (!big || value > big.value) big = { grade, value };
    if (!MATERIA.high.includes(grade) && (!small || value > small.value)) small = { grade, value };
  });
  return { big, small };
}

/* How many big and small stones a piece takes: {big, small}. Pieces with no slot data (hand-made, generated) take none. */
export function meldSlots(item) {
  const m = meldInfo(item);
  if (!m?.slots) return { big: 0, small: 0 };
  if (!m.overmeld) return { big: m.slots, small: 0 };
  const big = Math.min(5, m.slots + 1);
  return { big, small: 5 - big };
}

/* The cap of each stat on this piece, at its own item level, slot share and stat factors. Cached per item and job: the
   optimizer asks for every piece on every run. */
const capCache = new WeakMap();
export function meldCaps(job, item) {
  let byJob = capCache.get(item);
  if (!byJob) {
    byJob = new Map();
    capCache.set(item, byJob);
  }
  let c = byJob.get(job);
  if (!c) {
    const s = slotInfo(job, item);
    c = capsFor(job, item.type, item.ilvl, s.pct, s.factors);
    byJob.set(job, c);
  }
  return c;
}

/* Every way to share `n` identical stones among `k` buckets, as count arrays (cached: n <= 5, k <= 4). */
const compCache = new Map();
function compositions(n, k) {
  const key = n * 10 + k;
  let out = compCache.get(key);
  if (out) return out;
  if (k === 1) out = [[n]];
  else {
    out = [];
    for (let first = n; first >= 0; first--) {
      for (const rest of compositions(n - first, k - 1)) out.push([first, ...rest]);
    }
  }
  compCache.set(key, out);
  return out;
}

const memo = new Map();

/* Cache sizes, for the performance scripts (scripts/perf): {memo, compositions}. */
export function meldCacheStats() {
  return { memo: memo.size, compositions: compCache.size };
}

/* Best split of `big` stones of value bv and `small` stones of value sv among the stats with headrooms `heads` (in
   objective order) plus a spare bucket: the gains, compared lexicographically in objective order; among equal gains,
   the split whose spare stones are worth the most (they go to the job's other substats). Greedy filling is not enough: Courtly Lover's Earrings of Healing (Critical Hit
   61 below its cap, 2 big and 3 small stones) gets Determination +90 from XII + XI in Critical Hit, against +54 when
   both XII go into Critical Hit. Returns {big: [n per stat], small: [n per stat], gain: [per stat], spareBig,
   spareSmall}. */
function bestSplit(big, small, bv, sv, heads) {
  const key = `${big},${small},${bv},${sv},${heads.join(',')}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const k = heads.length;
  const bigSplits = compositions(big, k + 1);
  const smallSplits = compositions(small, k + 1);
  let best = null;
  for (const b of bigSplits) {
    for (const s of smallSplits) {
      const gain = heads.map((h, j) => Math.min(h, b[j] * bv + s[j] * sv));
      const spare = b[k] * bv + s[k] * sv;
      if (best) {
        let cmp = 0;
        for (let j = 0; j < k && !cmp; j++) cmp = gain[j] - best.gain[j];
        if (cmp < 0 || (cmp === 0 && spare <= best.spare)) continue;
      }
      best = { big: b.slice(0, k), small: s.slice(0, k), gain, spare, spareBig: b[k], spareSmall: s[k] };
    }
  }
  memo.set(key, best);
  return best;
}

/* The best melds of a piece for the objective `keys` (target, tiebreak 1, tiebreak 2; neutral stat keys), or null when
   the piece takes no stones or no key is a meldable substat (a main stat target alone melds nothing). Spare stones go
   into the job's other substats in order, each up to its headroom; any left over are `free`.
   Returns {gain: {stat: n}, stones: [{stat, grade, n}], free}. The stats a piece ends up with are its own plus `gain`.
   `stones` is in slot order, the order they are melded in: the stones for the guaranteed slots and the first overmeld
   slot first, then those for the later overmeld slots, which refuse VI, VIII, X and XII. */
export function bestMeld(job, item, keys) {
  const { big: nBig, small: nSmall } = meldSlots(item);
  if (!nBig) return null;
  const meldable = [...new Set(keys)].filter(k => job.substats.includes(k));
  if (!meldable.length) return null;
  const { big, small } = stoneValues(item.ilvl);
  if (!big) return null;
  const bv = big.value,
    sv = nSmall ? small.value : 0;
  const caps = meldCaps(job, item);
  const head = s => Math.max(0, caps[s] - (item.stats[s] || 0));
  const split = bestSplit(nBig, nSmall, bv, sv, meldable.map(head));

  const gain = {};
  // two lists, one per kind of slot; below item level 290 both kinds take the same grade, so they form one list
  const bigStones = [];
  const smallStones = small && small.grade === big.grade ? bigStones : [];
  const add = (list, stat, grade, n) => {
    if (!n) return;
    const last = list.find(x => x.stat === stat);
    if (last) last.n += n;
    else list.push({ stat, grade, n });
  };
  meldable.forEach((s, j) => {
    if (split.gain[j]) gain[s] = split.gain[j];
    add(bigStones, s, big.grade, split.big[j]);
    add(smallStones, s, small?.grade, split.small[j]);
  });
  // spare stones: the job's other substats in order, big stones first, each stat up to its headroom
  let spareBig = split.spareBig,
    spareSmall = split.spareSmall;
  for (const s of job.substats) {
    if (meldable.includes(s)) continue;
    let h = head(s),
      g = 0;
    while (h > 0 && (spareBig || spareSmall)) {
      const useBig = spareBig > 0;
      const v = useBig ? bv : sv;
      if (useBig) spareBig--;
      else spareSmall--;
      if (useBig) add(bigStones, s, big.grade, 1);
      else add(smallStones, s, small.grade, 1);
      g += Math.min(h, v);
      h -= v;
    }
    if (g) gain[s] = g;
  }
  const stones = smallStones === bigStones ? bigStones : [...bigStones, ...smallStones];
  return { gain, stones, free: spareBig + spareSmall };
}

/* "CRT XII, DET XII, CRT XI, DET XI ×2" in slot order (+ ", 1 free" when stones are left over). */
export function meldText(job, meld) {
  if (!meld) return '';
  const parts = meld.stones.map(x => `${job.short[x.stat]} ${ROMAN[x.grade - 1]}${x.n > 1 ? ` ×${x.n}` : ''}`);
  if (meld.free) parts.push(`${meld.free} free`);
  return parts.join(', ');
}
