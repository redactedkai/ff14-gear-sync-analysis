/* SVG line chart of the main-stat and substat budget columns by item level, with expansion dividers and the sync
   cap marked.
   Returns markup built only from numbers, so it is safe to insert with x-html. */
import { statColumn } from '../core/job-context.js';
import { IL, MAX_REAL } from '../core/tables.js';
import { clampIlvl } from '../core/formulas.js';
import { expansionBounds } from '../core/speed.js';

const EXP = expansionBounds();

function niceStep(max, n) {
  const raw = max / n,
    mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * mag;
}

export function budgetChartSvg(job, ilvl, cap) {
  const il = clampIlvl(ilvl);
  const mainCol = statColumn(job, 'main'),
    subCol = IL.crit;
  const x0 = 80,
    x1 = Math.min(MAX_REAL, Math.max(500, il + 30));
  // drawn about as wide as the panel, so its text stays near the page's text size (the SVG scales to the width)
  const W = 960,
    H = 300,
    L = 52,
    R = 14,
    T = 12,
    B = 30;
  let ymax = 0;
  for (let i = x0; i <= x1; i++) ymax = Math.max(ymax, subCol[i], mainCol[i]);
  const step = niceStep(ymax, 5);
  ymax = Math.ceil(ymax / step) * step;
  const X = v => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => H - B - (v / ymax) * (H - B - T);
  const line = arr => {
    let d = '';
    for (let i = x0; i <= x1; i++) d += (i === x0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(arr[i]).toFixed(1);
    return d;
  };

  let g = '';
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  // x-axis numbers at the expansion breakpoints
  for (const e of EXP) {
    const v = e.to;
    if (v == null || v <= x0 || v >= x1) continue;
    g += `<line x1="${X(v)}" x2="${X(v)}" y1="${H - B}" y2="${H - B + 4}" stroke="var(--muted)"/><text x="${X(v)}" y="${H - B + 16}" text-anchor="middle">${v}</text>`;
  }
  for (const e of EXP) {
    const a = Math.max(x0, e.from ?? x0),
      b = Math.min(x1, e.to ?? x1);
    if (a >= b) continue;
    if (e.to != null && e.to < x1)
      g += `<line x1="${X(e.to)}" x2="${X(e.to)}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="1 3" stroke-width="1"/>`;
    g += `<text x="${(X(a) + X(b)) / 2}" y="${T + 8}" text-anchor="middle" class="exp"><title>${e.name}</title>${e.short}</text>`;
  }
  if (cap != null && cap >= x0 && cap <= x1) {
    g += `<line x1="${X(cap)}" x2="${X(cap)}" y1="${T + 12}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${X(cap) + 4}" y="${T + 24}" style="fill:var(--bad)">cap ${cap}</text>`;
  }
  g += `<path d="${line(mainCol)}" fill="none" stroke="var(--gold)" stroke-width="2"/><path d="${line(subCol)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  if (il >= x0 && il <= x1) {
    g += `<circle cx="${X(il)}" cy="${Y(subCol[il])}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(il)}" cy="${Y(mainCol[il])}" r="5" fill="var(--gold)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stat budget by item level">${g}</svg>`;
}
