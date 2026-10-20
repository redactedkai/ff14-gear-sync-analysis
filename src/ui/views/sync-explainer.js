/* How the math works, Piece stats: what sync does to one piece, against the same piece at the cap with its melds. Pure view builder: no Alpine import, so Node can load and test it.
   A "generic piece" here is a piece built from the budget table (buildPiece): the main stat, Vitality and the two
   chosen substats at their 100% / 70% shares, with 2 meld slots (meldInfo). Its melds are the optimizer's for the
   current Goal (bestMeld), so the explainer and the optimizer meld alike (owner, 2026-10-16). */
import { MATERIA, MAX_REAL } from '../../core/tables.js';
import { SLOT_LABEL, SUB_WEIGHTS } from '../../core/constants.js';
import { buildPiece, capsFor, clampIlvl, syncStats } from '../../core/formulas.js';
import { mkItem } from '../../core/items.js';
import { bestMeld } from '../../core/meld.js';
import { shownSync } from '../settings.js';
import { OVERGEAR_BANDS, overgearChartSvg } from '../sync-charts.js';

/* The item level range the slider and both charts cover, relative to the cap (item levels). */
export const RANGE_BELOW = 30; // from 30 below the cap
const RANGE_MIN_OVER = 40; // the range always reaches 40 above it
const RANGE_PAST_LAST = 20; // and 20 past the last item level where a full set's substats still change
const RANGE_MAX_OVER = 150; // but never more than 150 above it
/* Guaranteed meld slots on a generic piece: most combat gear has 2. */
export const GENERIC_MELD_SLOTS = 2;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* The two substats the explainer shows: Piece stats' ranks (`subs`, the store's piece.subs), rank 2 possibly null. */
function chosenSubs(subs) {
  return subs.slice(0, 2).map(s => s || null);
}

/* The keys melds go into for `job`: the optimizer's Goal (`goal`: [target, tiebreak 1, tiebreak 2], '' for none) where
   those are substats; when none is (a main stat or Vitality goal, which materia cannot add), the two chosen substats
   (`subs`, Piece stats' ranks), the 2nd first: the 1st is at the piece's own cap already. {keys, fromGoal} */
export function meldKeys(job, goal, subs) {
  const substats = goal.filter(k => k && job.substats.includes(k));
  if (substats.length) return { keys: substats, fromGoal: true };
  const [s1, s2] = chosenSubs(subs);
  return { keys: [s2, s1].filter(Boolean), fromGoal: false };
}

/* One generic piece of slot `type` at item level `il` in a duty synced to `cap`: its stats before and after sync, its
   melds (bestMeld, kept only at or below the cap) and its substat points in the duty (the chosen substats after sync,
   plus every meld it keeps). {il, raw, synced, meld, kept, points, bare} */
const pieceMemo = new Map();
const PIECE_MEMO_MAX = 20000; // a few thousand per setting; dropped whole when full
function pieceAt(job, type, il, cap, subs, keys) {
  // the curves ask for the same pieces on every slider move: remember them per setting
  const key = `${job.jobId}|${type}|${il}|${cap}|${subs.join(',')}|${keys.join(',')}`;
  let hit = pieceMemo.get(key);
  if (!hit) {
    if (pieceMemo.size >= PIECE_MEMO_MAX) pieceMemo.clear();
    hit = buildPieceAt(job, type, il, cap, subs, keys);
    pieceMemo.set(key, hit);
  }
  return hit;
}
function buildPieceAt(job, type, il, cap, subs, keys) {
  const raw = buildPiece(job, il, type, subs);
  const synced = syncStats(job, raw, type, cap, il);
  const item = mkItem('generic', type, il, raw, { meld: { slots: GENERIC_MELD_SLOTS, overmeld: false } });
  const meld = bestMeld(job, item, keys);
  const kept = il <= cap; // a synced piece loses its melds
  const bare = subs.reduce((a, s) => a + (s ? synced[s] : 0), 0);
  const meldPoints = kept && meld ? Object.values(meld.gain).reduce((a, b) => a + b, 0) : 0;
  return { il, raw, synced, meld, kept, bare, points: bare + meldPoints };
}

/* The item level range for a cap: [lo, hi], from RANGE_BELOW under the cap to RANGE_PAST_LAST past the last item level
   where a full set's chosen substats still change after sync (the 2nd substat reaching the cap in the slowest slot),
   at least RANGE_MIN_OVER and at most RANGE_MAX_OVER above the cap, never past the highest real item level. */
const rangeMemo = new Map();
/* explainerRange(job, cap, subs): that range, memoized by job, cap and substats. */
export function explainerRange(job, cap, subs) {
  const key = `${job.jobId}|${cap}|${subs.join(',')}`;
  if (!rangeMemo.has(key)) rangeMemo.set(key, computeRange(job, cap, subs));
  return rangeMemo.get(key);
}
function computeRange(job, cap, subs) {
  const lo = Math.max(1, cap - RANGE_BELOW);
  const top = Math.min(MAX_REAL, cap + RANGE_MAX_OVER);
  let last = cap,
    prev = null;
  for (let il = cap + 1; il <= top; il++) {
    let sum = 0;
    for (const t of job.activeSlotTypes) {
      const s = syncStats(job, buildPiece(job, il, t, subs), t, cap, il);
      sum += subs.reduce((a, k) => a + (k ? s[k] : 0), 0);
    }
    if (prev != null && sum !== prev) last = il;
    prev = sum;
  }
  const hi = Math.min(top, Math.max(cap + RANGE_MIN_OVER, last + RANGE_PAST_LAST));
  return [lo, Math.max(lo, hi)];
}

/* The slider's range and the chosen item level: {range: [lo, hi], il, note}. With a sync, explainerRange and the saved
   item level (null: the cap, where Reset puts it; owner's decision, 2026-10-18); without one, every real item level (null: the highest). `note`
   says where the range comes from (the slider's tooltip). For `job` under `sync` (syncSettings), and Piece stats'
   `piece` ({ilvl, slot, subs}). */
export function explainerItemLevel(job, sync, piece) {
  const shown = shownSync(job, sync);
  const clampTo = ([lo, hi], v) => Math.max(lo, Math.min(hi, clampIlvl(v)));
  if (!shown) {
    const range = [1, MAX_REAL];
    return { range, il: clampTo(range, piece.ilvl ?? MAX_REAL), note: 'Every real item level' };
  }
  const cap = shown.cap;
  const range = explainerRange(job, cap, chosenSubs(piece.subs));
  const note =
    range[1] === MAX_REAL
      ? `From ${RANGE_BELOW} below the synced item level (${cap}) to the highest real item level, ${MAX_REAL}`
      : `From ${RANGE_BELOW} below the synced item level (${cap}) to ${range[1] - cap} above it, past which a full set's substats no longer change`;
  return { range, il: clampTo(range, piece.ilvl ?? cap), note };
}

/* A piece's melds in words, in two parts: {stones: "2 × Grade X Skill Speed (+54 each)", afterCap: "+90 after the cap"
   when the piece's cap cuts the stones, else ''}. */
function meldParts(job, meld) {
  if (!meld?.stones.length) return { stones: 'none', afterCap: '' };
  const parts = meld.stones.map(s => `${s.n} × Grade ${ROMAN[s.grade - 1]} ${job.label[s.stat]} (+${MATERIA.values[s.grade - 1]} each)`);
  const full = meld.stones.reduce((a, s) => a + s.n * MATERIA.values[s.grade - 1], 0);
  const gain = Object.values(meld.gain).reduce((a, b) => a + b, 0);
  return { stones: parts.join(', '), afterCap: gain < full ? `+${gain} after the cap` : '' };
}

/* What Piece stats says while no sync applies (explainerView is null): with item level sync switched on (`syncSwitch`,
   the store's `sync`), that a cap is missing; off, why nothing is synced and how to see it. */
export function explainerOffText(syncSwitch) {
  return syncSwitch
    ? 'Enter a sync cap (item level) at the top to see what sync does.'
    : 'No sync applies: item level sync is off and the synced level is the job’s level cap. Turn item level sync on and enter a cap, or lower the synced level, to see what sync does.';
}

/* Everything Piece stats shows for `job` under `sync` (syncSettings), or null while no sync applies: Piece stats'
   `settings` ({ilvl, slot, subs}: the store's `piece`) against the same piece at the cap, melded for the optimizer's
   `goal` ([target, tiebreak 1, tiebreak 2]; meldKeys). `widths`: the chart container's width in px ({piece}), so the
   chart is drawn at its own size and its text stays at the page's size. */
export function explainerView(job, sync, settings, goal, widths = {}) {
  const shown = shownSync(job, sync);
  if (!shown) return null;
  const cap = shown.cap,
    level = shown.level ?? sync.level,
    type = settings.slot,
    slotName = SLOT_LABEL[type].toLowerCase();
  const subs = chosenSubs(settings.subs);
  const { keys, fromGoal } = meldKeys(job, goal, settings.subs);

  // the range and the chosen item level
  const {
    range: [lo, hi],
    il,
  } = explainerItemLevel(job, sync, settings);
  const synced = il > cap;

  // ---------- Piece stats: one piece at `il` against the same slot at the cap, both melded where they keep melds
  const piece = pieceAt(job, type, il, cap, subs, keys);
  const atCap = pieceAt(job, type, cap, cap, subs, keys);
  const caps = capsFor(job, type, cap);
  const lines = [
    { stat: 'main', label: job.label.main, w: null },
    { stat: 'vit', label: job.label.vit, w: null },
    ...subs.map((s, i) => (s ? { stat: s, label: job.label[s], w: SUB_WEIGHTS[i] } : null)).filter(Boolean),
  ];
  // the melds a piece keeps (at or below the cap) add to its stats
  const meldOf = stat => (piece.kept && piece.meld ? piece.meld.gain[stat] || 0 : 0);
  const scale = Math.max(...lines.map(l => Math.max(piece.raw[l.stat] + meldOf(l.stat), caps[l.stat]))) * 1.05;
  const pct = v => `${((100 * v) / scale).toFixed(2)}%`;
  const bars = lines.map(l => {
    const raw = piece.raw[l.stat],
      kept = piece.synced[l.stat],
      melds = meldOf(l.stat),
      // a substat's value on the piece at the cap: the part above it is what overgearing adds (gold)
      native = l.w ? atCap.raw[l.stat] : null;
    const base = native != null ? Math.min(native, kept) : kept;
    return {
      label: l.w ? `${l.label} · ${l.w}%` : l.label,
      raw,
      kept,
      extra: native != null && kept > native ? kept - native : 0,
      keep: pct(base),
      riseLeft: pct(base),
      rise: native != null && kept > native ? pct(kept - native) : '0%',
      cutLeft: pct(kept),
      cut: raw > kept ? pct(raw - kept) : '0%',
      // the melds, after the stat's own points; total is what the piece has in the duty
      melds,
      total: kept + melds,
      meldLeft: pct(kept),
      meldWidth: pct(melds),
      capAt: pct(caps[l.stat]),
    };
  });
  const lost = lines.reduce((a, l) => a + piece.raw[l.stat] - piece.synced[l.stat], 0);
  // the materia row: only the stones the piece has in the duty, so none above the cap (a synced piece loses its melds)
  const keptStones = synced ? [] : piece.meld?.stones || [];
  const stoneChips = keptStones.flatMap(s => Array.from({ length: s.n }, () => `+${MATERIA.values[s.grade - 1]}`));
  const meldNote = synced
    ? 'None: a synced piece loses its melds.'
    : !keptStones.length
      ? 'No materia fits this item level.'
      : `${keptStones.map(s => `${s.n} × Grade ${ROMAN[s.grade - 1]} ${job.label[s.stat]}`).join(', ')}, kept`;
  const goalNote = fromGoal ? '' : `The Goal (${job.label[goal[0]] || goal[0]}) takes no materia, so melds go into the substats above.`;

  // the table under the bars: the piece, then the piece at the cap (or the one row when they are the same; the page
  // keeps the second row's space so the panel does not jump as the slider passes the cap)
  const tag = p => (synced ? (p.il > cap ? 'overgeared' : 'melded') : '');
  // each row's second line: overgeared against melded above the cap, else where the piece is against the cap
  const rowTag = p => tag(p) || (p.il === cap ? 'at the cap' : 'below the cap');
  const vsRows = (il === cap ? [atCap] : [piece, atCap]).map(p => {
    const parts = p.kept ? meldParts(job, p.meld) : { stones: 'none', afterCap: 'ignored while synced' };
    return { il: p.il, tag: rowTag(p), materia: parts.stones, materiaNote: parts.afterCap, points: p.points };
  });
  const diff = piece.points - atCap.points;
  const verdict =
    il === cap
      ? ''
      : !diff
        ? 'Both have the same.'
        : synced
          ? `The ${diff > 0 ? 'overgeared' : 'melded'} ${slotName} (item level ${diff > 0 ? il : cap}) has ${Math.abs(diff)} more.`
          : `The item level ${diff > 0 ? il : cap} ${slotName} has ${Math.abs(diff)} more.`;

  // ---------- the curve: the same slot at every item level of the range
  const curve = [];
  for (let x = lo; x <= hi; x++) {
    const p = pieceAt(job, type, x, cap, subs, keys);
    curve.push({
      il: x,
      points: p.points,
      // the points by part, for the chart's bands: each chosen substat after sync, then the melds the piece keeps
      parts: subs.filter(Boolean).map(s => p.synced[s]),
      melds: p.points - p.bare,
    });
  }
  const over = curve.filter(p => p.il > cap);
  // the note: from which item level an overgeared piece has as much as the melded one, and from which it has more
  const asMuch = over.find(p => p.points >= atCap.points),
    more = over.find(p => p.points > atCap.points);
  const peak = over.length ? Math.max(...over.map(p => p.points)) : null,
    ref = atCap.points;
  const at = p => `item level ${p.il} (+${p.il - cap})`,
    melded = `the melded ${slotName} (${ref})`;
  let curveNote = ''; // empty when no item level of the range is above the cap
  if (over.length && !asMuch) curveNote = `Overgeared never reaches ${melded}: at most ${peak}.`;
  else if (asMuch && !more) curveNote = `Overgeared matches ${melded} at ${at(asMuch)}, never more.`;
  else if (more && more === asMuch) curveNote = `Overgeared passes ${melded} at ${at(more)}, up to ${peak}.`;
  else if (more) curveNote = `Overgeared matches ${melded} at ${at(asMuch)} and passes it at ${at(more)}, up to ${peak}.`;

  return {
    cap,
    level,
    byLevel: shown.byLevel,
    range: [lo, hi],
    il,
    synced,
    slotName,
    subLabels: subs.map(s => (s ? job.label[s] : '')),
    // Piece stats. example: the line that says the piece is not a real one (audit 11 #3)
    example: `A made-up ${slotName} at item level ${il}, with the substats chosen in the bar.`,
    lead: synced
      ? `Synced to ${cap}: each stat is cut to its cap, ${lost} points in all.`
      : `At or below ${cap}: sync leaves every stat as it is.`,
    lost,
    bars,
    stoneChips,
    meldNote,
    goalNote,
    vsRows,
    verdict,
    curveNote,
    curveChartSvg: overgearChartSvg({
      curve,
      cap,
      il,
      ref: atCap.points,
      slotName,
      labels: subs.filter(Boolean).map(s => job.label[s]),
      ceilings: subs.filter(Boolean).map(s => caps[s]),
      width: widths.piece,
    }),
    // the chart's legend: its bands, bottom up (OVERGEAR_BANDS); the melds band names the stones of the piece at the cap
    curveBands: [
      ...subs.filter(Boolean).map((s, i) => `${job.label[s]} (${SUB_WEIGHTS[i]}%)`),
      `Melds: ${meldParts(job, atCap.meld).stones}`,
    ].map((label, k, all) => ({
      label,
      ...OVERGEAR_BANDS[k === all.length - 1 ? 2 : k],
    })),
  };
}
