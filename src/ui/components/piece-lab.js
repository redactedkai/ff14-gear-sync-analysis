/* Piece lab: how one piece's stats come from its item level, line by line, and what sync does to them. */
import Alpine from 'alpinejs';
import { SUB_WEIGHTS } from '../../core/constants.js';
import { clampIlvl, capsFor, statDerivation } from '../../core/formulas.js';
import { budgetChartSvg } from '../chart.js';

/* "base × pct ÷ 1000 = 26.4 → 26; × 70% = 18.2 → 18" */
function formulaText(steps) {
  return steps.map(s => {
    if (s.kind === 'slot') return `${s.base} × ${s.pct} ÷ 1000 = ${s.exact.toFixed(1)} → ${s.value}`;
    if (s.kind === 'vit') return `× ${s.factor} = ${s.exact.toFixed(1)} → ${s.value}`;
    return `× ${s.weight}% = ${s.exact.toFixed(1)} → ${s.value}`;
  }).join('; ');
}

export function pieceView(app) {
  const job = app.jobCtx, p = app.piece, il = clampIlvl(p.ilvl), t = p.slot;
  const caps = capsFor(job, t, app.cap);
  const clampOn = app.sync && il > app.cap;
  const lines = [{ stat: 'main', w: 100 }, { stat: 'vit', w: 100 }];
  p.subs.forEach((s, i) => { if (s && (s !== 'spec' || job.profile.spec)) lines.push({ stat: s, w: SUB_WEIGHTS[i] }); });
  const rows = lines.map(({ stat, w }) => {
    const d = statDerivation(job, stat, il, t, w);
    const raw = d.value, syn = clampOn ? Math.min(raw, caps[stat]) : raw;
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

export function pieceLab() {
  return {
    view: null,
    init() {
      Alpine.effect(() => { this.view = pieceView(this.$store.app); });
    },
    setSub(i, value) { this.$store.app.piece.subs[i] = value || null; },
    setFromRange(value) { this.$store.app.piece.ilvl = +value; },
  };
}
