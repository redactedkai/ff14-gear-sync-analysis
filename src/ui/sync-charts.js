/* The sync explainer's two charts, as SVG markup built only from numbers (safe for x-html):
   - overgearChartSvg: one piece's substat points in the duty by its item level, with the piece at the cap (melded);
   - gcdChartSvg: a full set's GCD by its item level, with the set at the cap.
   Each is drawn at its container's width (`width`, px), so its text stays at the page's size. */

const DEFAULT_WIDTH = 760;
const MIN_WIDTH = 420;

/* A round step for about five grid lines between 0 and `span`. */
function niceStep(span) {
  const raw = span / 5,
    mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
}

/* x ticks every 20 item levels (10 for a short range), and the axis caption. */
function xAxis(x0, x1, X, H, B, caption) {
  const every = x1 - x0 > 80 ? 20 : 10;
  let g = '';
  for (let v = Math.ceil(x0 / every) * every; v <= x1; v += every)
    g += `<text x="${X(v)}" y="${H - B + 16}" text-anchor="middle">${v}</text>`;
  return g + `<text x="${(X(x0) + X(x1)) / 2}" y="${H - 4}" text-anchor="middle">${caption}</text>`;
}

/* The cap line (unlabelled: the legend names it), the item level marker of the chosen piece or set, and the shaded range `more` (item levels, in order). */
function marks({ x0, x1, X, T, H, B, W, cap, il, more, markerY }) {
  let g = '';
  if (more.length)
    g += `<rect data-shade="${more[0]}-${more[more.length - 1]}" x="${X(more[0])}" y="${T}" width="${Math.max(1, X(more[more.length - 1]) - X(more[0]))}" height="${H - T - B}" fill="var(--fg)" opacity=".07"/>`;
  if (cap >= x0 && cap <= x1)
    g += `<line x1="${X(cap)}" x2="${X(cap)}" y1="${T}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="4 3"/>`; // named in the page's legend
  const right = X(il) > W * 0.75;
  g += `<line x1="${X(il)}" x2="${X(il)}" y1="${T}" y2="${H - B}" stroke="var(--fg)" opacity=".5"/>`;
  g += `<circle cx="${X(il)}" cy="${markerY}" r="6" fill="none" stroke="var(--fg)" stroke-width="2"/>`;
  g += `<text class="lbl" x="${X(il) + (right ? -9 : 9)}" text-anchor="${right ? 'end' : 'start'}" y="${H - B - 8}">Item level ${il}</text>`;
  return g;
}

/* The overgeared chart's bands, bottom up: the 1st substat, the 2nd, then the melds (the legend uses them too). */
export const OVERGEAR_BANDS = Object.freeze([
  { fill: 'var(--accent)', opacity: 0.55 },
  { fill: 'var(--gold)', opacity: 0.5 },
  { fill: 'var(--fg)', opacity: 0.22 },
]);

/* curve: [{il, points, parts, melds}] in item level order (parts: each chosen substat's points after sync, melds: the
   points the piece's melds add); ref: the piece at the cap's points (with its melds); labels and ceilings: each chosen
   substat's name and its cap at the synced item level. Drawn as stacked bands (the substats, then the melds), so the top
   edge is the piece's points and each band shows where its substat reaches its ceiling. */
export function overgearChartSvg({ curve, cap, il, ref, slotName, labels = [], ceilings = [], width }) {
  if (!curve.length) return '';
  const W = Math.max(MIN_WIDTH, Math.round(width || DEFAULT_WIDTH)),
    H = 300,
    L = 46,
    R = 16,
    T = 18,
    B = 34;
  const x0 = curve[0].il,
    x1 = curve[curve.length - 1].il;
  // the bands stack from 0
  const hi = Math.max(ref, ...curve.map(p => p.points));
  const step = niceStep(hi || 10),
    ymax = hi + step * 0.6;
  const X = v => L + ((v - x0) / Math.max(1, x1 - x0)) * (W - L - R),
    Y = v => T + (1 - v / ymax) * (H - T - B);

  let g = '';
  for (let v = 0; v <= ymax; v += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  g += xAxis(x0, x1, X, H, B, `Item level of the ${slotName}`);

  // the bands: each substat on the ones below it, then the melds; a band is the area between two running totals
  const layers = [...curve[0].parts.map((_, i) => p => p.parts[i]), p => p.melds];
  const below = (p, k) => layers.slice(0, k).reduce((a, f) => a + f(p), 0);
  layers.forEach((f, k) => {
    const band = OVERGEAR_BANDS[Math.min(k === layers.length - 1 ? 2 : k, 2)];
    const top = curve.map(p => `${X(p.il).toFixed(1)},${Y(below(p, k) + f(p)).toFixed(1)}`);
    const bottom = curve.map(p => `${X(p.il).toFixed(1)},${Y(below(p, k)).toFixed(1)}`).reverse();
    g += `<polygon points="${top.join(' ')} ${bottom.join(' ')}" fill="${band.fill}" opacity="${band.opacity}"/>`;
  });
  g += `<path d="${curve.map((p, i) => `${i ? 'L' : 'M'}${X(p.il).toFixed(1)},${Y(p.points).toFixed(1)}`).join('')}" fill="none" stroke="var(--fg)" stroke-width="2"/>`;

  // the shading where overgeared has as much as the melded piece or more, the cap line, the chosen item level, and the
  // piece at the cap
  const more = curve.filter(p => p.il > cap && p.points >= ref).map(p => p.il);
  const at = curve.find(p => p.il === il) || curve[curve.length - 1];
  g += marks({ x0, x1, X, T, H, B, W, cap, il, more, markerY: Y(at.points) });
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="6 3"/><text x="${L + 6}" y="${Y(ref) - 6}" style="fill:var(--gold)">${ref}: item level ${cap} with its melds</text>`;

  // band labels: each substat's name at the left, inside its band; where it reaches its ceiling at the right
  const first = curve[Math.min(2, curve.length - 1)],
    last = curve[curve.length - 1];
  labels.forEach((name, i) => {
    const mid = p => Y(below(p, i) + p.parts[i] / 2) + 4;
    if (Y(below(first, i)) - Y(below(first, i) + first.parts[i]) >= 16)
      g += `<text class="lbl" x="${X(first.il) + 4}" y="${mid(first)}">${name}</text>`;
    const capped = curve.find(p => p.il > cap && p.parts[i] >= ceilings[i]);
    if (capped && Y(below(last, i)) - Y(below(last, i) + last.parts[i]) >= 16)
      g += `<text class="lbl" x="${X(x1) - 4}" text-anchor="end" y="${mid(last)}">${ceilings[i]}: at the cap from ${capped.il}</text>`;
  });
  // the melds' label like the substats', inside its band at the left, or over the line when the band is thin
  const melds = layers.length - 1;
  if (first.melds)
    g += `<text class="lbl" x="${X(first.il) + 4}" y="${Y(below(first, melds)) - Y(first.points) >= 16 ? Y(below(first, melds) + first.melds / 2) + 4 : Y(first.points) - 6}">Melds</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Substat points in the duty by item level, by substat and melds">${g}</svg>`;
}

/* curve: [{il, gcd}] (seconds) in item level order; ref: the set at the cap's GCD. A longer GCD sits lower, so losing
   the melds is a drop, as in overgearChartSvg. */
export function gcdChartSvg({ curve, cap, il, ref, width }) {
  if (!curve.length) return '';
  const W = Math.max(MIN_WIDTH, Math.round(width || DEFAULT_WIDTH)),
    H = 270,
    L = 50,
    R = 16,
    T = 28,
    B = 34;
  const x0 = curve[0].il,
    x1 = curve[curve.length - 1].il;
  const gs = curve.map(p => p.gcd);
  const g0 = Math.floor(Math.min(ref, ...gs) * 100 - 1) / 100,
    g1 = Math.ceil(Math.max(ref, ...gs) * 100 + 1) / 100;
  const X = v => L + ((v - x0) / Math.max(1, x1 - x0)) * (W - L - R),
    Y = v => T + ((v - g0) / (g1 - g0)) * (H - T - B);

  let g = '';
  // one grid line per 0.01 s step, labelled every few
  const every = Math.max(1, Math.ceil(((g1 - g0) * 100) / 8));
  for (let c = Math.round(g0 * 100); c <= Math.round(g1 * 100); c++) {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(c / 100)}" y2="${Y(c / 100)}" stroke="var(--line)" opacity="${c % every ? 0.35 : 1}"/>`;
    if (!(c % every)) g += `<text x="${L - 6}" y="${Y(c / 100) + 4}" text-anchor="end">${(c / 100).toFixed(2)}</text>`;
  }
  g += `<text x="4" y="12">GCD (s)</text>`;
  g += xAxis(x0, x1, X, H, B, 'Item level of every piece in the set');
  const more = curve.filter(p => p.il > cap && p.gcd < ref).map(p => p.il);
  const at = curve.find(p => p.il === il) || curve[curve.length - 1];
  g += marks({ x0, x1, X, T, H, B, W, cap, il, more, markerY: Y(at.gcd) });
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--gold)" stroke-width="2"/><text x="${L + 6}" y="${Y(ref) - 6}" style="fill:var(--gold)">${ref.toFixed(2)}s: item level ${cap} with its melds</text>`;
  // the GCD moves in steps: a step line
  const d = curve
    .map((p, i) => (i ? `H${X(p.il).toFixed(1)}V${Y(p.gcd).toFixed(1)}` : `M${X(p.il).toFixed(1)},${Y(p.gcd).toFixed(1)}`))
    .join('');
  g += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  const after = curve.find(p => p.il === cap + 1),
    before = curve.find(p => p.il === cap);
  if (after && before && after.gcd > before.gcd) g += `<text class="lbl" x="${X(cap) + 8}" y="${Y(after.gcd) + 16}">↓ melds lost</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="GCD of a full set by item level">${g}</svg>`;
}
