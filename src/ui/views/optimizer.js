/* Optimizer tab views: the best loadout for the chosen stat, and the per-stat ceiling of the pool.
   Pure view builders: no Alpine import, so Node can load and test them (docs/audit-2.md A4). */
import { SLOT_LABEL } from '../../core/constants.js';
import { optimize } from '../../core/optimizer/index.js';
import { gcdFor, dotMult, gcdTierAt } from '../../core/speed.js';

export const NODE_LIMIT = 700000;
export const CEILING_NODE_LIMIT = 150000;

/* "tier starts at 1818, next at 1904 (+65)" */
export function tierText(spd, level) {
  const t = gcdTierAt(spd, level);
  return `tier starts at ${t.start}${t.next != null ? `, next at ${t.next} (+${t.next - spd})` : ''}`;
}

/* The optimizer can throw (e.g. stat totals too large to rank exactly); the page shows the message
   instead of keeping a stale result (docs/audit-2.md A5). */
export function optimizerView(app) {
  try {
    return buildOptimizerView(app);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

/* The required average item level, or null when the requirement is off. */
function avgRequired(o) {
  const v = +o.avgMin || 0;
  return o.avg && v > 0 ? v : null;
}

function buildOptimizerView(app) {
  const job = app.jobCtx,
    o = app.opt;
  if (!app.pool.length) return { kind: 'empty' };
  const res = optimize(
    job,
    app.pool,
    { cap: app.cap, sync: app.sync },
    {
      target: o.target,
      tiebreak: [o.tb, o.tb2],
      minAvgIlvl: avgRequired(o) ?? 0,
      nodeLimit: NODE_LIMIT,
    },
  );
  if (!res.ok) return { kind: 'infeasible', truncated: res.truncated };

  const t = res.totals,
    spd = t.spd;
  let ringN = 0;
  const rows = res.picks.map(p => {
    let label = SLOT_LABEL[p.type];
    if (p.type === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    if (!p.item) return { label, item: null };
    return {
      label,
      item: p.item,
      cells: job.stats.map(s => ({ value: p.eff[s] || 0, gold: s === o.target && !!p.eff[s] })),
    };
  });
  return {
    kind: 'ok',
    headers: job.stats.map(s => job.short[s]),
    targetLabel: job.label[o.target],
    spdLabel: job.label.spd,
    total: t[o.target],
    totals: job.stats.map(s => t[s]),
    synced: app.sync,
    gcd: gcdFor(spd, app.level).toFixed(2),
    spd,
    tierText: tierText(spd, app.level),
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
    avg: res.avgIlvl.toFixed(1),
    // coloured against the user's own requirement; no colour when the requirement is off (docs/audit-2.md A6)
    avgClass: avgRequired(o) == null ? '' : res.avgIlvl >= avgRequired(o) ? 'ok' : 'bad',
    avgText: `Average item level over ${res.denom} slot-weights` + (avgRequired(o) == null ? '' : ` (required ≥ ${avgRequired(o)})`),
    rows,
    truncated: res.truncated,
  };
}

/* Per-stat ceiling, synced and unsynced. Returns null for an empty pool, {error} if the optimizer throws. */
export function ceilingView(app) {
  const job = app.jobCtx;
  if (!app.pool.length) return null;
  try {
    // A search that hits its node limit only gives a lower bound: shown as "≥ value" (docs/audit-2.md A7).
    let truncated = false;
    const best = (sync, s) => {
      const r = optimize(job, app.pool, { cap: app.cap, sync }, { target: s, nodeLimit: CEILING_NODE_LIMIT });
      const value = r.ok ? r.totals[s] : 0;
      if (r.truncated) truncated = true;
      return { value, text: (r.truncated ? '≥ ' : '') + value };
    };
    const synced = job.stats.map(s => best(true, s));
    const unsynced = job.stats.map(s => best(false, s));
    const spdIdx = job.stats.indexOf('spd');
    const spd = synced[spdIdx]?.value;
    return {
      cap: app.cap,
      headers: job.stats.map(s => job.short[s]),
      spdIdx,
      synced: synced.map(c => c.text),
      unsynced: unsynced.map(c => c.text),
      truncated,
      gcd: spd ? gcdFor(spd, app.level).toFixed(2) + 's' : '—',
    };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}
