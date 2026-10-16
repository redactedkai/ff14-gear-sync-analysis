/* Materia melds: the best stones a piece can take for an objective. Pure; never reads sync state (whether a piece keeps
   its melds is the optimizer's call, itemSyncIlvl). Rules, sources and the exactness argument: docs/mechanics/materia.md.
   - A grade fits gear whose item level is at least its gate (MATERIA.gate). The best "big" stone is the most valuable
     grade the gate allows; the best "small" stone the most valuable grade that is not high (MATERIA.high: VI, VIII, X,
     XII cannot go past the first overmeld slot). Values are not in grade order (VI 16, VII 8).
   - Slots: the guaranteed ones and, with overmelding, the first overmeld slot take any grade ("big" slots); with
     overmelding the piece has 5 in all, and overmeld slots 2 to 4 ("small") refuse the high grades. Slots fill in order,
     so empty slots always come last. A piece with no guaranteed slot takes nothing, even if overmelding is flagged
     (inferred).
   - Stones are counted by grade: the best grade ("hi", XII at item level 690) in big slots only, the best grade that is
     not high ("lo": the odd grades V, VII, IX, XI) in any slot. Among melds with the same gains: the fewest stones,
     then the fewest hi stones (odd grades first; stone prices, retrieval and overmeld odds play no part), then the first
     found (owner, 2026-10-16).
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
  // with overmelding: the guaranteed slots and the first overmeld slot take big stones, the rest of the 5 small ones
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
const compositionCache = new Map();
function compositions(n, k) {
  const key = n * 10 + k;
  let out = compositionCache.get(key);
  if (out) return out;
  if (k === 1) out = [[n]];
  else {
    out = [];
    for (let first = n; first >= 0; first--) {
      for (const rest of compositions(n - first, k - 1)) out.push([first, ...rest]);
    }
  }
  compositionCache.set(key, out);
  return out;
}

const bestMemo = new Map();

/* Cache sizes, for the performance scripts (scripts/perf): {memo, versions, compositions}. */
export function meldCacheStats() {
  return { memo: bestMemo.size, versions: versionMemo.size, compositions: compositionCache.size };
}

/* What bestMeld and meldVersions share, or null when the piece takes no stones or no key is a meldable substat:
   nHi, nLo: how many hi and lo stones fit at most (with one grade every slot takes it, and nLo is 0);
   hi, lo: the two stones ({grade, value}); meldable: the keys that are substats, in objective order; headroom: room under
   each one's cap, clamped to what every stone together can add (more changes nothing, and more pieces share a memo). */
function meldSetup(job, item, keys) {
  const { big: nBig, small: nSmall } = meldSlots(item);
  if (!nBig) return null;
  const meldable = [...new Set(keys)].filter(k => job.substats.includes(k));
  if (!meldable.length) return null;
  const { big: hi, small: lo } = stoneValues(item.ilvl);
  if (!hi) return null;

  // below item level 290 the best grade is not a high one, so one grade fills every slot
  const oneGrade = !lo || lo.grade === hi.grade;
  const nHi = oneGrade ? nBig + nSmall : nBig;
  const nLo = oneGrade ? 0 : nBig + nSmall; // lo fits any slot; the slots left after the hi stones bound it per placement

  const most = nHi * hi.value + (oneGrade ? 0 : nSmall * lo.value);
  const caps = meldCaps(job, item);
  const headroom = meldable.map(s => Math.min(most, Math.max(0, caps[s] - (item.stats[s] || 0))));
  return { nBig, nSmall, nHi, nLo, hi, lo: oneGrade ? hi : lo, oneGrade, meldable, headroom };
}

/* Visit every placement of stones for setup `m`: hi stones per stat (at most nHi in all), then lo stones per stat in
   the slots left (any slot takes lo). Each is {hi: [n per stat], lo: [n per stat], gain: [per stat], stones, hiCount};
   a stat gains its stones' value, cut at the room under its cap. Index k of a composition is the stones not placed. */
function forEachPlacement(m, visit) {
  const k = m.headroom.length;
  const slots = m.nBig + m.nSmall;
  for (const hiSplit of compositions(m.nHi, k + 1)) {
    const hiCount = m.nHi - hiSplit[k];
    const loRoom = m.oneGrade ? 0 : slots - hiCount;
    for (const loSplit of compositions(loRoom, k + 1)) {
      const loCount = loRoom - loSplit[k];
      const gain = m.headroom.map((h, j) => Math.min(h, hiSplit[j] * m.hi.value + loSplit[j] * m.lo.value));
      visit({ hi: hiSplit.slice(0, k), lo: loSplit.slice(0, k), gain, stones: hiCount + loCount, hiCount });
    }
  }
}

/* For two placements with the same gains: negative when `a` is the better one to show (fewer stones, then fewer hi). */
const tieOrder = (a, b) => a.stones - b.stones || a.hiCount - b.hiCount;

/* The placement with the highest gains, compared in objective order; ties by tieOrder, then the first found. Greedy
   filling is not enough: Courtly Lover's Earrings of Healing (Critical Hit 61 below its cap, 2 big and 3 small slots)
   gets Determination +90 from XII + XI in Critical Hit, against +54 when both XII go into Critical Hit. */
function bestPlacement(m) {
  const key = `${m.nBig},${m.nSmall},${m.hi.grade},${m.lo.grade},${m.headroom.join(',')}`;
  const hit = bestMemo.get(key);
  if (hit) return hit;
  let best = null;
  forEachPlacement(m, p => {
    if (best) {
      let cmp = 0;
      for (let j = 0; j < p.gain.length && !cmp; j++) cmp = p.gain[j] - best.gain[j];
      if (cmp < 0 || (cmp === 0 && tieOrder(p, best) >= 0)) return;
    }
    best = p;
  });
  bestMemo.set(key, best);
  return best;
}

/* The best melds of a piece for the objective `keys` (target, tiebreak 1, tiebreak 2; neutral stat keys), or null when
   the piece takes no stones or no key is a meldable substat (a main stat target alone melds nothing). A slot whose
   stone would add nothing to a key is left empty (`free`, owner's decision 2026-10-15): no stones in other substats.
   Returns {gain: {stat: n}, stones: [{stat, grade, n}], free}. The stats a piece ends up with are its own plus `gain`.
   `stones` is in slot order, the order they are melded in: the hi stones (which fit only the guaranteed slots and the
   first overmeld slot) first, then the lo stones. */
export function bestMeld(job, item, keys) {
  const m = meldSetup(job, item, keys);
  if (!m) return null;
  return meldFromPlacement(m, bestPlacement(m));
}

/* Every placement worth keeping when the loadout has a speed rule (Target GCD), as bestMeld results. With a speed
   minimum or maximum, one best placement per piece is no longer exact: the best melds of a piece depend on how much
   speed the rest of the loadout has. So every gain vector that no other beats on the keys is kept (each a version of
   the piece), shown by its tieOrder-best placement. `keys` must include 'spd'. With `exactSpd` (a speed maximum: more
   speed can break it), a vector beats another only at the same speed, so versions with less speed survive too.
   Only gain vectors that the lo stones reach from the later overmeld slots alone are versions: a lo stone in a big slot
   only lowers a gain, so it adds a vector only under a maximum, and there it found no better set in 2,045 Target GCD
   runs while adding about 14% search work (docs/scratchpad/materia/prototype; owner, 2026-10-16: dropped). It can
   still be the placement shown for a vector. A piece that takes no stones has one version, no melds: [null]. */
const versionMemo = new Map();
export function meldVersions(job, item, keys, { exactSpd = false } = {}) {
  const m = meldSetup(job, item, keys);
  if (!m) return [null];
  const spdPos = m.meldable.indexOf('spd');
  const key = `${m.nBig},${m.nSmall},${m.hi.grade},${m.lo.grade},${m.headroom.join(',')},${spdPos},${exactSpd ? 1 : 0}`;
  let kept = versionMemo.get(key);
  if (!kept) {
    // the placement to show for each gain vector, and the vectors reachable with lo stones in the later slots only
    const byGain = new Map();
    const reachable = new Set();
    forEachPlacement(m, p => {
      const g = p.gain.join(',');
      if (p.stones - p.hiCount <= m.nSmall) reachable.add(g);
      const cur = byGain.get(g);
      if (!cur || tieOrder(p, cur) < 0) byGain.set(g, p);
    });

    // keep the gain vectors no other beats on every stat (with exactSpd, only one with the same speed can beat it);
    // by total, highest first, a vector can only be beaten by one already kept (all distinct)
    const all = [...byGain.entries()].filter(([g]) => reachable.has(g)).map(([, p]) => p);
    const total = x => x.gain.reduce((a, b) => a + b, 0);
    all.sort((x, y) => total(y) - total(x));
    kept = [];
    for (const g of all) {
      const beaten = kept.some(
        h => (!exactSpd || spdPos < 0 || h.gain[spdPos] === g.gain[spdPos]) && h.gain.every((x, j) => x >= g.gain[j]),
      );
      if (!beaten) kept.push(g);
    }
    versionMemo.set(key, kept);
  }
  return kept.map(p => meldFromPlacement(m, p));
}

/* A placement as a bestMeld result: {gain, stones, free}. */
function meldFromPlacement(m, p) {
  const gain = {};
  const hiStones = [],
    loStones = [];
  m.meldable.forEach((s, j) => {
    if (p.gain[j]) gain[s] = p.gain[j];
    if (p.hi[j]) hiStones.push({ stat: s, grade: m.hi.grade, n: p.hi[j] });
    if (p.lo[j]) loStones.push({ stat: s, grade: m.lo.grade, n: p.lo[j] });
  });
  // hi stones first: they fit only the first slots
  return { gain, stones: [...hiStones, ...loStones], free: m.nBig + m.nSmall - p.stones };
}

/* "CRT XII, DET XII, CRT XI, DET XI ×2" in slot order (+ ", 3 slots empty" when stones would add nothing). */
export function meldText(job, meld) {
  if (!meld) return '';
  const parts = meld.stones.map(x => `${job.short[x.stat]} ${ROMAN[x.grade - 1]}${x.n > 1 ? ` ×${x.n}` : ''}`);
  if (meld.free) parts.push(`${meld.free} slot${meld.free > 1 ? 's' : ''} empty`);
  return parts.join(', ');
}
