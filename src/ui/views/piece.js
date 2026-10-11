/* Piece lab: how one piece's stats come from its item level, line by line, and what sync does to them. */
/* Pure view builder: no Alpine import, so Node can load and test it (docs/audit-2.md A4). */
import { SUB_WEIGHTS } from '../../core/constants.js';
import { clampIlvl, capsFor, statDerivation } from '../../core/formulas.js';
import { budgetChartSvg } from '../chart.js';

/* "base × pct ÷ 1000 = 26.4 → 26; × 70% = 18.2 → 18" */
function formulaText(steps) {
  return steps
    .map(s => {
      if (s.kind === 'slot') return `${s.base} × ${s.pct} ÷ 1000 = ${s.exact.toFixed(1)} → ${s.value}`;
      if (s.kind === 'vit') return `× ${s.factor} = ${s.exact.toFixed(1)} → ${s.value}`;
      return `× ${s.weight}% = ${s.exact.toFixed(1)} → ${s.value}`;
    })
    .join('; ');
}

export function pieceView(app) {
  const job = app.jobCtx,
    p = app.piece,
    il = clampIlvl(p.ilvl),
    t = p.slot;
  const caps = capsFor(job, t, app.cap);
  const clampOn = app.sync && il > app.cap;
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
    status: !app.sync ? 'off' : il <= app.cap ? 'below' : 'above',
    rangeValue: Math.max(1, Math.min(app.maxReal, il)),
    chartSvg: budgetChartSvg(job, il, app.cap),
  };
}

/* Piece lab substat ranks after choosing `value` (or '' for none) at rank `i`. A substat can hold only one rank:
   choosing one already used elsewhere swaps the two (docs/audit-2.md A9). Ranks 1 and 2 are never empty; if a swap
   would empty one, it gets the first of the job's substats not used by the other ranks. */
export function withSub(subs, i, value, substats) {
  const out = subs.slice(0, 3);
  while (out.length < 3) out.push(null);
  const v = value || null;
  const j = v == null ? -1 : out.indexOf(v);
  if (j >= 0 && j !== i) out[j] = out[i];
  out[i] = v;
  for (const k of [0, 1]) {
    if (out[k] == null) out[k] = substats.find(s => !out.includes(s)) ?? null;
  }
  return out;
}
