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
  return { memo: memo.size, versions: versionMemo.size, compositions: compCache.size };
}

/* Best split of `big` stones of value bv and `small` stones of value sv among the stats with headrooms `heads` (in
   objective order) plus a spare bucket (slots left empty): the gains, compared lexicographically in objective order;
   among equal gains, the split that leaves the most slots empty, then the one whose stones are worth the least (no
   stone that adds nothing to the objective). Greedy filling is not enough: Courtly Lover's Earrings of Healing
   (Critical Hit 61 below its cap, 2 big and 3 small stones) gets Determination +90 from XII + XI in Critical Hit,
   against +54 when both XII go into Critical Hit. Returns {big: [n per stat], small: [n per stat], gain: [per stat],
   spareBig, spareSmall}. */
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
      const empty = b[k] + s[k],
        spare = b[k] * bv + s[k] * sv;
      if (best) {
        let cmp = 0;
        for (let j = 0; j < k && !cmp; j++) cmp = gain[j] - best.gain[j];
        if (!cmp) cmp = empty - best.empty;
        if (cmp < 0 || (cmp === 0 && spare <= best.spare)) continue;
      }
      best = { big: b.slice(0, k), small: s.slice(0, k), gain, empty, spare, spareBig: b[k], spareSmall: s[k] };
    }
  }
  memo.set(key, best);
  return best;
}

/* The best melds of a piece for the objective `keys` (target, tiebreak 1, tiebreak 2; neutral stat keys), or null when
   the piece takes no stones or no key is a meldable substat (a main stat target alone melds nothing). A slot whose
   stone would add nothing to a key is left empty (`free`, owner's decision 2026-10-15): no stones in other substats.
   Returns {gain: {stat: n}, stones: [{stat, grade, n}], free}. The stats a piece ends up with are its own plus `gain`.
   `stones` is in slot order, the order they are melded in: the stones for the guaranteed slots and the first overmeld
   slot first, then those for the later overmeld slots, which refuse VI, VIII, X and XII. */
export function bestMeld(job, item, keys) {
  const m = meldSetup(job, item, keys);
  if (!m) return null;
  return meldFromSplit(m, bestSplit(m.nBig, m.nSmall, m.bv, m.sv, m.heads));
}

/* What bestMeld and meldVersions share: the piece's stones and the room under each cap, or null when it takes none or
   no key is a meldable substat. */
function meldSetup(job, item, keys) {
  const { big: nBig, small: nSmall } = meldSlots(item);
  if (!nBig) return null;
  const meldable = [...new Set(keys)].filter(k => job.substats.includes(k));
  if (!meldable.length) return null;
  const { big, small } = stoneValues(item.ilvl);
  if (!big) return null;
  const bv = big.value,
    sv = nSmall ? small.value : 0;
  const caps = meldCaps(job, item);
  const heads = meldable.map(s => Math.max(0, caps[s] - (item.stats[s] || 0)));
  return { nBig, nSmall, big, small, bv, sv, meldable, heads };
}

/* Every split worth keeping when the loadout has a speed rule (Target GCD), as bestMeld results. With a speed minimum or
   maximum, one best split per piece is no longer exact: the best melds of a piece depend on how much speed the rest of
   the loadout has. So every split that no other split beats on the keys is kept (each a version of the piece). `keys`
   must include 'spd'. With `exactSpd` (a speed maximum: more speed can break it), a split beats another only at the same
   speed, so splits with less speed survive too. Among splits with the same gains, the one that leaves the most slots
   empty, then whose stones are worth the least, as in bestMeld. A piece that takes no stones has one version, no melds:
   [null]. Cached by stones and room under the caps; room beyond what all stones can add changes nothing, so it is
   clamped first and more pieces share one list. */
const versionMemo = new Map();
export function meldVersions(job, item, keys, { exactSpd = false } = {}) {
  const m = meldSetup(job, item, keys);
  if (!m) return [null];
  const most = m.nBig * m.bv + m.nSmall * m.sv;
  const heads = m.heads.map(h => Math.min(h, most));
  const si = m.meldable.indexOf('spd');
  const key = `${m.nBig},${m.nSmall},${m.bv},${m.sv},${heads.join(',')},${si},${exactSpd ? 1 : 0}`;
  let splits = versionMemo.get(key);
  if (!splits) {
    const k = heads.length;
    // the best split for each gain vector (same tie rule as bestSplit)
    const byGain = new Map();
    for (const b of compositions(m.nBig, k + 1)) {
      for (const s of compositions(m.nSmall, k + 1)) {
        const gain = heads.map((h, j) => Math.min(h, b[j] * m.bv + s[j] * m.sv));
        const g = gain.join(',');
        const empty = b[k] + s[k],
          spare = b[k] * m.bv + s[k] * m.sv;
        const cur = byGain.get(g);
        if (cur && (empty < cur.empty || (empty === cur.empty && spare >= cur.spare))) continue;
        byGain.set(g, { big: b.slice(0, k), small: s.slice(0, k), gain, empty, spare, spareBig: b[k], spareSmall: s[k] });
      }
    }
    // unbeaten gain vectors: by total, highest first, a split can only be beaten by one already kept (all distinct)
    const all = [...byGain.values()];
    const total = x => x.gain.reduce((a, b) => a + b, 0);
    all.sort((x, y) => total(y) - total(x));
    splits = [];
    for (const g of all) {
      const beaten = splits.some(h => (!exactSpd || si < 0 || h.gain[si] === g.gain[si]) && h.gain.every((x, j) => x >= g.gain[j]));
      if (!beaten) splits.push(g);
    }
    versionMemo.set(key, splits);
  }
  return splits.map(split => meldFromSplit(m, split));
}

/* A split as a bestMeld result: {gain, stones, free}. */
function meldFromSplit({ big, small, meldable }, split) {
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
  const stones = smallStones === bigStones ? bigStones : [...bigStones, ...smallStones];
  return { gain, stones, free: split.spareBig + split.spareSmall };
}

/* "CRT XII, DET XII, CRT XI, DET XI ×2" in slot order (+ ", 3 slots empty" when stones would add nothing). */
export function meldText(job, meld) {
  if (!meld) return '';
  const parts = meld.stones.map(x => `${job.short[x.stat]} ${ROMAN[x.grade - 1]}${x.n > 1 ? ` ×${x.n}` : ''}`);
  if (meld.free) parts.push(`${meld.free} slot${meld.free > 1 ? 's' : ''} empty`);
  return parts.join(', ');
}
