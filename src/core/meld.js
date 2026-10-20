/* Materia melds: the best stones a piece can take for an objective (bestMeld, meldVersions, for the optimizer), and what
   a given list of stones does to a piece (applyStones, for a set built by hand). Both go by the same rules, written once
   below (gradeFits, highGrade, meldableStat, roomUnderCap, meldSlots). Whether a piece keeps its melds under sync is
   keepsMelds in piece.js. Rules, sources and the exactness argument: docs/mechanics/materia.md.
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
import { meldInfo } from './items.js';
import { effStats, keepsMelds, meldCaps } from './piece.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* True when a stone of grade `grade` (1-based) fits gear of item level `ilvl`: the item level is at least the grade's
   gate (MATERIA.gate). False for a grade that does not exist. */
function gradeFits(grade, ilvl) {
  return Number.isInteger(grade) && grade >= 1 && grade <= MATERIA.gate.length && MATERIA.gate[grade - 1] <= ilvl;
}

/* True for a high grade (MATERIA.high: VI, VIII, X, XII): only a big slot takes it, never an overmeld slot after the
   first. */
function highGrade(grade) {
  return MATERIA.high.includes(grade);
}

/* True when `stat` (a neutral key) can be melded for the job: a combat substat, never the main stat or Vitality. */
function meldableStat(job, stat) {
  return job.substats.includes(stat);
}

/* How far melds can raise `stat` on `item`: its room under the piece's own cap (`caps`, meldCaps), 0 when the stat is
   already at or above it (a meld never lowers a stat). */
function roomUnderCap(caps, item, stat) {
  return Math.max(0, caps[stat] - (item.stats[stat] || 0));
}

/* The best big and small stone for gear of item level `ilvl`: {big, small}, each {grade, value} (grade 1-based) or null
   when no grade fits (below item level 15). */
export function stoneValues(ilvl) {
  let big = null,
    small = null;
  MATERIA.values.forEach((value, i) => {
    const grade = i + 1;
    if (!gradeFits(grade, ilvl)) return;
    if (!big || value > big.value) big = { grade, value };
    if (!highGrade(grade) && (!small || value > small.value)) small = { grade, value };
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
  const meldable = [...new Set(keys)].filter(k => meldableStat(job, k));
  if (!meldable.length) return null;
  const { big: hi, small: lo } = stoneValues(item.ilvl);
  if (!hi) return null;

  // below item level 290 the best grade is not a high one, so one grade fills every slot
  const oneGrade = !lo || lo.grade === hi.grade;
  const nHi = oneGrade ? nBig + nSmall : nBig;
  const nLo = oneGrade ? 0 : nBig + nSmall; // lo fits any slot; the slots left after the hi stones bound it per placement

  const most = nHi * hi.value + (oneGrade ? 0 : nSmall * lo.value);
  const caps = meldCaps(job, item);
  const headroom = meldable.map(s => Math.min(most, roomUnderCap(caps, item, s)));
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

/* Every placement worth keeping when the loadout has limits (a speed rule for Target GCD, stat minimums for tier
   ranking), as bestMeld results. With a minimum or maximum, one best placement per piece is no longer exact: the best
   melds of a piece depend on how much of the limited stat the rest of the loadout has. So every gain vector that no
   other beats on the keys is kept (each a version of the piece), shown by its tieOrder-best placement. `keys`: the
   objective's keys and the limited stats ('spd' with a speed rule). With `exactSpd` (a speed maximum: more
   speed can break it), a vector beats another only at the same speed, so versions with less speed survive too.
   Only gain vectors that the lo stones reach from the later overmeld slots alone are versions: a lo stone in a big slot
   only lowers a gain, so it adds a vector only under a maximum, and there it found no better set in 2,045 Target GCD
   runs while adding about 14% search work (docs/mechanics/materia.md, "Which stones are shown"; owner, 2026-10-16: dropped). It can
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

/* A bestMeld result as one entry per meld slot of `item`, in slot order: {stat, grade} for a stone, null for an empty
   slot; [] for no melds (meld null), as a set's pieces keep them (set.js). applyStones of the list gives the meld back. */
export function meldStones(item, meld) {
  if (!meld) return [];
  const { big, small } = meldSlots(item);
  const out = meld.stones.flatMap(x => Array.from({ length: x.n }, () => ({ stat: x.stat, grade: x.grade })));
  while (out.length < big + small) out.push(null);
  return out;
}

/* What a list of stones does to a pool item under sync, by the rules the optimizer melds by.
   `stones`: one entry per meld slot, in slot order: {stat (neutral key), grade (1-12)} or null for an empty slot; [] for
   a piece without melds. sync: {cap, sync, level}, as for itemSyncIlvl.
   Returns {stats, gain, lost, removed, meld}:
   - stats: {stat: points} for each of the job's stats, after sync and the stones that stay;
   - gain: {stat: points} the stones add; lost: {stat: points} of their value past the piece's cap (only stats that
     lose some);
   - removed: [{slot, stone, reason}] for each stone that does not stay. reason: 'sync' (a synced piece keeps no melds),
     'slot' (the piece has no such slot), 'stat' (not a meldable substat), 'gate' (no such grade, or the item level is
     below its gate), 'high' (a high grade past the big slots), 'order' (after an empty slot: slots fill in order);
   - meld: the stones that stay in bestMeld's shape ({gain, stones: [{stat, grade, n}], free}; meldText shows it), or
     null with no melds: an empty list, a piece that takes no stones, or a synced piece.
   Every stone that stays adds its full value, cut once per stat at the room under the cap (roomUnderCap): the cap
   applies to the sum, so the order of the stones changes nothing. */
export function applyStones(job, item, stones, sync) {
  const synced = effStats(job, item, sync);
  const keeps = keepsMelds(item, sync);
  const { big, small } = meldSlots(item);

  // 1. each stone stays or is removed, slot by slot
  const kept = [];
  const removed = [];
  let gap = false;
  stones.forEach((stone, slot) => {
    if (!stone) {
      gap = true;
      return;
    }
    let reason = null;
    if (!keeps) reason = 'sync';
    else if (slot >= big + small) reason = 'slot';
    else if (!meldableStat(job, stone.stat)) reason = 'stat';
    else if (!gradeFits(stone.grade, item.ilvl)) reason = 'gate';
    else if (highGrade(stone.grade) && slot >= big) reason = 'high';
    else if (gap) reason = 'order';
    if (reason) {
      removed.push({ slot, stone, reason });
      gap = true;
    } else kept.push(stone);
  });

  // 2. each stat gains its stones' value, cut at its room under the piece's cap
  const added = {};
  for (const x of kept) added[x.stat] = (added[x.stat] || 0) + MATERIA.values[x.grade - 1];
  const caps = meldCaps(job, item);
  const gain = {},
    lost = {};
  for (const [stat, value] of Object.entries(added)) {
    const room = roomUnderCap(caps, item, stat);
    if (Math.min(room, value)) gain[stat] = Math.min(room, value);
    if (value > room) lost[stat] = value - room;
  }
  const stats = Object.fromEntries(job.stats.map(s => [s, (synced[s] || 0) + (gain[s] || 0)]));

  // 3. the stones that stay, grouped as bestMeld groups them (a run of one stat and grade), for meldText
  let meld = null;
  if (keeps && big + small && stones.length) {
    const groups = [];
    for (const x of kept) {
      const last = groups.at(-1);
      if (last && last.stat === x.stat && last.grade === x.grade) last.n++;
      else groups.push({ stat: x.stat, grade: x.grade, n: 1 });
    }
    meld = { gain, stones: groups, free: big + small - kept.length };
  }
  return { stats, gain, lost, removed, meld };
}

/* "CRT XII, DET XII, CRT XI, DET XI ×2" in slot order (+ ", 3 slots empty" when stones would add nothing). */
export function meldText(job, meld) {
  if (!meld) return '';
  const parts = meld.stones.map(x => `${job.short[x.stat]} ${ROMAN[x.grade - 1]}${x.n > 1 ? ` ×${x.n}` : ''}`);
  if (meld.free) parts.push(`${meld.free} slot${meld.free > 1 ? 's' : ''} empty`);
  return parts.join(', ');
}
