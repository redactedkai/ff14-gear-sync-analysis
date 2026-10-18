/* How the math works: what sync does to one piece (Piece stats) and to a full set's GCD (GCD), against the same piece
   or set at the cap with its melds. Pure view builder: no Alpine import, so Node can load and test it.
   A "generic piece" here is a piece built from the budget table (buildPiece): the main stat, Vitality and the two
   chosen substats at their 100% / 70% shares, with 2 meld slots (meldInfo). Its melds are the optimizer's for the
   current Goal (bestMeld), so the explainer and the optimizer meld alike (owner, 2026-10-16). */
import { MATERIA, MAX_REAL } from '../../core/tables.js';
import { SLOT_LABEL, SUB_WEIGHTS } from '../../core/constants.js';
import { buildPiece, capsFor, clampIlvl, syncStats } from '../../core/formulas.js';
import { mkItem } from '../../core/items.js';
import { bestMeld } from '../../core/meld.js';
import { BASE_GCD_MS, gcdFor, gcdTierAt, hasteFor } from '../../core/speed.js';
import { shownSync } from '../state.js';
import { OVERGEAR_BANDS, gcdChartSvg, overgearChartSvg } from '../sync-charts.js';

/* The item level range the slider and both charts cover, relative to the cap (item levels). */
export const RANGE_BELOW = 30; // from 30 below the cap
export const DEFAULT_OVER = 60; // the slider starts 60 above it
const RANGE_MIN_OVER = 40; // the range always reaches 40 above it
const RANGE_PAST_LAST = 20; // and 20 past the last item level where a full set's substats still change
const RANGE_MAX_OVER = 150; // but never more than 150 above it
/* Guaranteed meld slots on a generic piece: most combat gear has 2. */
export const GENERIC_MELD_SLOTS = 2;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* The two substats the explainer shows: Piece stats' ranks, rank 2 possibly null. */
function chosenSubs(app) {
  return app.piece.subs.slice(0, 2).map(s => s || null);
}

/* The keys melds go into: the optimizer's Goal (target, tiebreaks) where those are substats; when none is (a main
   stat or Vitality goal, which materia cannot add), the two chosen substats, the 2nd first: the 1st is at the piece's
   own cap already. {keys, fromGoal} */
export function meldKeys(app) {
  const job = app.jobCtx,
    o = app.opt;
  const goal = [o.target, o.tb, o.tb2].filter(k => k && job.substats.includes(k));
  if (goal.length) return { keys: goal, fromGoal: true };
  const [s1, s2] = chosenSubs(app);
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
   item level (null: DEFAULT_OVER above the cap); without one, every real item level (null: the highest). `note`
   says where the range comes from (the slider's tooltip). */
export function explainerItemLevel(app) {
  const sync = shownSync(app);
  const clampTo = ([lo, hi], v) => Math.max(lo, Math.min(hi, clampIlvl(v)));
  if (!sync) {
    const range = [1, MAX_REAL];
    return { range, il: clampTo(range, app.piece.ilvl ?? MAX_REAL), note: 'Every real item level' };
  }
  const cap = sync.cap;
  const range = explainerRange(app.jobCtx, cap, chosenSubs(app));
  const note =
    range[1] === MAX_REAL
      ? `From ${RANGE_BELOW} below the synced item level (${cap}) to the highest real item level, ${MAX_REAL}`
      : `From ${RANGE_BELOW} below the synced item level (${cap}) to ${range[1] - cap} above it, past which a full set's substats no longer change`;
  return { range, il: clampTo(range, app.piece.ilvl ?? cap + DEFAULT_OVER), note };
}

/* "2 × Grade X Skill Speed (+54 each)"; with stones cut by the piece's cap, the points they add after it. */
function meldSummary(job, meld) {
  if (!meld?.stones.length) return 'none';
  const parts = meld.stones.map(s => `${s.n} × Grade ${ROMAN[s.grade - 1]} ${job.label[s.stat]} (+${MATERIA.values[s.grade - 1]} each)`);
  const full = meld.stones.reduce((a, s) => a + s.n * MATERIA.values[s.grade - 1], 0);
  const gain = Object.values(meld.gain).reduce((a, b) => a + b, 0);
  return parts.join(', ') + (gain < full ? `, +${gain} after the cap` : '');
}

/* Everything the two sub-tabs show, or null while no sync applies. `widths`: the chart containers' widths in px
   ({piece, gcd}), so the charts are drawn at their own size and their text stays at the page's size. */
export function explainerView(app, widths = {}) {
  const sync = shownSync(app);
  if (!sync) return null;
  const job = app.jobCtx,
    cap = sync.cap,
    level = sync.level ?? app.level,
    type = app.piece.slot,
    slotName = SLOT_LABEL[type].toLowerCase();
  const subs = chosenSubs(app);
  const { keys, fromGoal } = meldKeys(app);

  // the range and the chosen item level
  const {
    range: [lo, hi],
    il,
  } = explainerItemLevel(app);
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
  const scale = Math.max(...lines.map(l => Math.max(piece.raw[l.stat], caps[l.stat]))) * 1.05;
  const pct = v => `${((100 * v) / scale).toFixed(2)}%`;
  const bars = lines.map(l => {
    const raw = piece.raw[l.stat],
      kept = piece.synced[l.stat],
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
      capAt: pct(caps[l.stat]),
    };
  });
  const lost = lines.reduce((a, l) => a + piece.raw[l.stat] - piece.synced[l.stat], 0);
  const stoneChips = (piece.meld?.stones || []).flatMap(s => Array.from({ length: s.n }, () => `+${MATERIA.values[s.grade - 1]}`));
  const meldStats = [...new Set((piece.meld?.stones || []).map(s => job.label[s.stat]))].join(', ');
  const meldNote = !piece.meld
    ? 'no materia fits this item level'
    : `${[...new Set(piece.meld.stones.map(s => `Grade ${ROMAN[s.grade - 1]}`))].join(', ')} ${meldStats}, ${synced ? 'ignored while synced' : 'kept'}`;
  const goalNote = fromGoal
    ? ''
    : `The Goal (${job.label[app.opt.target] || app.opt.target}) takes no materia, so melds go into the substats above.`;

  // the table under the bars: the piece, then the piece at the cap (or the one row when they are the same)
  const tag = p => (synced ? (p.il > cap ? 'overgeared' : 'melded') : '');
  const vsRows = (il === cap ? [atCap] : [piece, atCap]).map(p => ({
    il: p.il,
    tag: tag(p),
    materia: p.kept ? meldSummary(job, p.meld) : 'none (synced)',
    points: p.points,
  }));
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
  const more = over.filter(p => p.points > atCap.points);
  const peak = over.length ? Math.max(...over.map(p => p.points)) : null;
  const atCapText = `an item level ${cap} ${slotName} with ${meldSummary(job, atCap.meld)}`;
  const curveNote = !over.length
    ? ''
    : more.length
      ? `Synced to ${cap}, a ${slotName} from item level ${more[0].il} (+${more[0].il - cap}) has more than ${atCapText}: at most ${peak} points vs ${atCap.points}.`
      : `Synced to ${cap}, no ${slotName} above item level ${cap} has more than ${atCapText}: at most ${peak} points vs ${atCap.points}.`;

  // ---------- GCD: a full set (every slot the job wears, rings twice) at `il` and at the cap
  const spdShown = subs.includes('spd') || keys.includes('spd');
  const haste = hasteFor(job.jobId, level)?.pct ?? 0;
  const setSpeed = x =>
    job.activeSlotTypes.reduce((a, t) => {
      const p = pieceAt(job, t, x, cap, subs, keys);
      const spd = p.synced.spd + (p.kept && p.meld ? p.meld.gain.spd || 0 : 0);
      return a + spd * (t === 'ring' ? 2 : 1);
    }, 0);
  let gcd = null;
  if (spdShown) {
    const setAt = x => {
      const spd = setSpeed(x),
        tier = gcdTierAt(spd, level, BASE_GCD_MS, haste);
      return { il: x, spd, gcd: tier.gcd, past: spd - tier.start, next: tier.next != null ? tier.next - spd : null, tag: tag({ il: x }) };
    };
    const setCurve = [];
    for (let x = lo; x <= hi; x++) setCurve.push({ il: x, gcd: gcdFor(setSpeed(x), level, BASE_GCD_MS, haste) });
    const mine = setAt(il),
      capSet = setAt(cap);
    const step = gcdTierAt(capSet.spd, level, BASE_GCD_MS, haste);
    const dg = Math.round((capSet.gcd - mine.gcd) * 100) / 100;
    gcd = {
      rows: il === cap ? [capSet] : [mine, capSet],
      step: step.next != null ? step.next - step.start : null,
      verdict:
        il === cap
          ? ''
          : !dg
            ? 'Both sets have the same GCD.'
            : synced
              ? `The ${dg > 0 ? 'overgeared' : 'melded'} set (item level ${dg > 0 ? il : cap}) has a GCD ${Math.abs(dg).toFixed(2)} s shorter.`
              : `The item level ${dg > 0 ? il : cap} set has a GCD ${Math.abs(dg).toFixed(2)} s shorter.`,
      haste: haste ? hasteFor(job.jobId, level).name : '',
      chartSvg: gcdChartSvg({ curve: setCurve, cap, il, ref: capSet.gcd, width: widths.gcd }),
    };
  }

  return {
    cap,
    level,
    byLevel: sync.byLevel,
    range: [lo, hi],
    il,
    synced,
    slotName,
    subLabels: subs.map(s => (s ? job.label[s] : '')),
    // Piece stats
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
    curveLead: `${subs
      .filter(Boolean)
      .map(s => job.label[s])
      .join(
        ' + ',
      )} of a ${slotName} in a duty synced to ${cap}, by the ${slotName}’s item level. Up to item level ${cap} it keeps its melds: ${meldSummary(job, atCap.meld)}.`,
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
    // the chart's legend: its bands, bottom up (OVERGEAR_BANDS)
    curveBands: [...subs.filter(Boolean).map((s, i) => `${job.label[s]} (${SUB_WEIGHTS[i]}%)`), 'Melds'].map((label, k, all) => ({
      label,
      ...OVERGEAR_BANDS[k === all.length - 1 ? 2 : k],
    })),
    // GCD (null when neither chosen substat nor any meld is speed)
    gcd,
    spdLabel: job.label.spd,
  };
}
