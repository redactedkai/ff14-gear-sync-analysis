/* Piece stats: how one piece's stats come from its item level, line by line, and what sync does to them.
   Pure view builder: no Alpine import, so Node can load and test it. */
import { SUB_WEIGHTS } from '../../core/constants.js';
import { clampIlvl, capsFor, statDerivation } from '../../core/formulas.js';
import { budgetChartSvg } from '../chart.js';
import { MAX_REAL } from '../../core/tables.js';
import { shownSync } from '../state.js';

/* "base × 8.5% = 26.4 → 26; × 70% = 18.2 → 18". The slot share is per mille in the game files; one decimal of a
   percent shows it exactly (85 ‰ = 8.5%), the unit Sync limits uses too. */
function formulaText(steps) {
  return steps
    .map(s => {
      if (s.kind === 'offhand') return `two-handed ${s.two} − one-handed ${s.one} = ${s.value}`;
      if (s.kind === 'slot') return `${s.base} × ${s.pct / 10}% = ${s.exact.toFixed(1)} → ${s.value}`;
      if (s.kind === 'factor') return `× ${s.factor} = ${s.exact.toFixed(1)} → ${s.value}`;
      return `× ${s.weight}% = ${s.exact.toFixed(1)} → ${s.value}`;
    })
    .join('; ');
}

/* The step-by-step table and budget chart for Piece stats' piece at item level `ilvl` (the explainer's chosen one,
   explainerItemLevel). */
export function pieceView(app, ilvl) {
  const job = app.jobCtx,
    p = app.piece,
    il = clampIlvl(ilvl ?? p.ilvl ?? MAX_REAL),
    t = p.slot;
  const sync = shownSync(app),
    cap = sync?.cap ?? null;
  const caps = sync ? capsFor(job, t, cap) : null;
  const clampOn = !!sync && il > cap;
  const lines = [
    { stat: 'main', w: 100 },
    { stat: 'vit', w: 100 },
  ];
  p.subs.forEach((s, i) => {
    if (s && (s !== 'spec' || job.profile.spec)) lines.push({ stat: s, w: SUB_WEIGHTS[i] });
  });
  const rows = lines.map(({ stat, w }) => {
    const d = statDerivation(job, stat, il, t, w);
    const raw = d.value,
      syn = clampOn ? Math.min(raw, caps[stat]) : raw;
    return { stat, w, label: job.label[stat], base: d.base, formula: formulaText(d.steps), raw, syn };
  });
  return {
    il,
    rows,
    lost: rows.reduce((a, r) => a + (r.raw - r.syn), 0),
    cap,
    byLevel: !!sync?.byLevel,
    level: sync?.level ?? null,
    status: !sync ? 'off' : il <= cap ? 'below' : 'above',
    chartSvg: budgetChartSvg(job, il, cap),
    // sync cuts the 70% line to the full-share cap, so it ends up level with the first (math.md section 5)
    evenSubs: clampOn && rows.some(r => r.w === SUB_WEIGHTS[1] && r.syn === caps[r.stat]),
    // the fixed Direct Hit line exists only on older Mind gear
    healerNote: job.profile.main === 'mind',
  };
}

/* Piece stats substat ranks after choosing `value` (or '' for none) at rank `i`. A substat can hold only one rank:
   choosing one already used elsewhere swaps the two. Rank 1 is never empty; rank 2 may be. */
export function withSub(subs, i, value, substats) {
  const out = subs.slice(0, 2);
  while (out.length < 2) out.push(null);
  const v = value || null;
  const j = v == null ? -1 : out.indexOf(v);
  if (j >= 0 && j !== i) out[j] = out[i];
  out[i] = v;
  if (out[0] == null) out[0] = substats.find(s => !out.includes(s)) ?? null;
  return out;
}
