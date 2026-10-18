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

/* The cap line, the item level marker of the chosen piece or set, and the shaded range where it has more. */
function marks({ x0, x1, X, T, H, B, W, cap, il, more, markerY }) {
  let g = '';
  if (more.length)
    g += `<rect x="${X(more[0])}" y="${T}" width="${Math.max(1, X(more[more.length - 1]) - X(more[0]))}" height="${H - T - B}" fill="var(--fg)" opacity=".07"/>`;
  if (cap >= x0 && cap <= x1)
    g += `<line x1="${X(cap)}" x2="${X(cap)}" y1="${T}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="4 3"/><text class="lbl" x="${X(cap) + 5}" y="${T + 12}">Synced item level ${cap}</text>`;
  const right = X(il) > W * 0.75;
  g += `<line x1="${X(il)}" x2="${X(il)}" y1="${T}" y2="${H - B}" stroke="var(--fg)" opacity=".5"/>`;
  g += `<circle cx="${X(il)}" cy="${markerY}" r="6" fill="none" stroke="var(--fg)" stroke-width="2"/>`;
  g += `<text class="lbl" x="${X(il) + (right ? -9 : 9)}" text-anchor="${right ? 'end' : 'start'}" y="${H - B - 8}">Item level ${il}</text>`;
  return g;
}

/* "31 + 22 + 8 melds = 61": a curve point's points by part, the chosen substats in their order (the chart's subtitle
   names them). */
function partsText(p) {
  const parts = p.parts.map(String);
  if (p.melds) parts.push(`${p.melds} melds`);
  return `${parts.join(' + ')} = ${p.points}`;
}

/* About how wide a chart label is, in px (12px sans-serif), to keep it inside the chart. */
const labelWidth = text => text.length * 6.6;

/* curve: [{il, points, bare, parts, melds, s2full}] in item level order (parts: each chosen substat's points); ref: the
   piece at the cap's points (with its melds). */
export function overgearChartSvg({ curve, cap, il, ref, slotName, width }) {
  if (!curve.length) return '';
  const W = Math.max(MIN_WIDTH, Math.round(width || DEFAULT_WIDTH)),
    H = 300,
    L = 46,
    R = 16,
    T = 18,
    B = 34;
  const x0 = curve[0].il,
    x1 = curve[curve.length - 1].il;
  const lo = Math.min(...curve.map(p => p.bare)),
    hi = Math.max(ref, ...curve.map(p => p.points));
  const step = niceStep(hi - lo || 10),
    ymin = Math.max(0, Math.floor((lo - step / 2) / step) * step),
    ymax = hi + step * 0.6;
  const X = v => L + ((v - x0) / Math.max(1, x1 - x0)) * (W - L - R),
    Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  const path = f => curve.map((p, i) => `${i ? 'L' : 'M'}${X(p.il).toFixed(1)},${Y(f(p)).toFixed(1)}`).join('');

  let g = '';
  for (let v = ymin; v <= ymax; v += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  g += xAxis(x0, x1, X, H, B, `Item level of the ${slotName}`);
  const more = curve.filter(p => p.il > cap && p.points > ref).map(p => p.il);
  const at = curve.find(p => p.il === il) || curve[curve.length - 1];
  g += marks({ x0, x1, X, T, H, B, W, cap, il, more, markerY: Y(at.points) });
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--gold)" stroke-width="2"/><text x="${L + 6}" y="${Y(ref) + 16}" style="fill:var(--gold)">${ref}: item level ${cap} with its melds</text>`;
  g += `<path d="${path(p => p.bare)}" fill="none" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
  g += `<path d="${path(p => p.points)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  // annotations, each with the points by part: the piece at the cap with its melds, the melds lost one item level over
  // the cap, and where the 2nd substat reaches the cap
  // to the left of the point when it fits, else to the right
  const label = (x, y, text) => {
    const left = x - 8 - labelWidth(text) > L;
    return `<text class="lbl" x="${x + (left ? -8 : 8)}" text-anchor="${left ? 'end' : 'start'}" y="${y}">${text}</text>`;
  };
  const before = curve.find(p => p.il === cap),
    after = curve.find(p => p.il === cap + 1);
  if (before && before.melds) {
    g += `<circle cx="${X(cap)}" cy="${Y(before.points)}" r="4" fill="var(--accent)"/>`;
    g += label(X(cap), Y(before.points) - 10, partsText(before));
  }
  if (after && before && before.points > after.points)
    g += `<circle cx="${X(after.il)}" cy="${Y(after.points)}" r="4" fill="var(--accent)"/><text class="lbl" x="${X(after.il) + 8}" y="${Y(after.points) + 20}">melds lost: ${partsText(after)}</text>`;
  const full = curve.find(p => p.s2full);
  if (full) {
    // under the flat line to its right (the points stay level from there), kept inside the chart
    const text = `${partsText(full)}: both at the cap`;
    const x = Math.min(X(full.il) + 8, W - R - labelWidth(text));
    g += `<circle cx="${X(full.il)}" cy="${Y(full.points)}" r="4" fill="var(--accent)"/><text class="lbl" x="${x}" y="${Y(full.points) + 20}">${text}</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Substat points in the duty by item level">${g}</svg>`;
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
