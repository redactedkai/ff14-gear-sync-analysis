/* Gear optimizer tab views: the best loadout for the chosen stat, and the per-stat ceiling of the pool.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { SLOT_LABEL } from '../../core/constants.js';
import { withoutSources, slotInfo, slotLabel } from '../../core/items.js';
import { optimize, itemSyncIlvl } from '../../core/optimizer/index.js';
import { meldText } from '../../core/meld.js';
import { gcdFor, dotMult, gcdTierAt } from '../../core/speed.js';
import { syncSettings, syncLabel } from '../state.js';

export const NODE_LIMIT = 700000;
export const CEILING_NODE_LIMIT = 150000;

/* "tier starts at 1818, next at 1904 (+65)" */
export function tierText(spd, level) {
  const t = gcdTierAt(spd, level);
  return `tier starts at ${t.start}${t.next != null ? `, next at ${t.next} (+${t.next - spd})` : ''}`;
}

/* The pool the optimizer searches: the gear pool minus the excluded sources. */
export function searchPool(app) {
  return withoutSources(app.pool, app.opt.exclude || []);
}

/* Sync changes something in this pool: item level sync is on, or some piece is level-synced. */
function poolSynced(pool, sync) {
  return sync.sync || pool.some(i => itemSyncIlvl(i, sync) != null);
}

/* The optimizer can throw (e.g. stat totals too large to rank exactly); the page shows the message
   instead of keeping a stale result. */
export function optimizerView(app) {
  try {
    return buildOptimizerView(app);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

function buildOptimizerView(app) {
  const job = app.jobCtx,
    o = app.opt;
  if (!app.pool.length) return { kind: 'empty' };
  const pool = searchPool(app);
  if (!pool.length) return { kind: 'excluded' };
  const sync = syncSettings(app);
  const res = optimize(job, pool, sync, {
    target: o.target,
    tiebreak: [o.tb, o.tb2],
    nodeLimit: NODE_LIMIT,
    melds: !!o.melds,
  });
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
    if (!p.item) return { label, item: null, blockedBy: p.blockedBy?.name ?? '' };
    if (p.type !== 'ring') label = slotLabel(p.type, slotInfo(job, p.item).blocks);
    return {
      label,
      item: p.item,
      meld: meldText(job, p.meld),
      cells: job.stats.map(s => ({ value: p.eff[s] || 0, gold: s === o.target && !!p.eff[s] })),
    };
  });
  return {
    kind: 'ok',
    headers: job.stats.map(s => job.short[s]),
    target: o.target,
    targetLabel: job.label[o.target],
    spdLabel: job.label.spd,
    total: t[o.target],
    totals: job.stats.map(s => t[s]),
    synced: poolSynced(pool, sync),
    gcd: gcdFor(spd, app.level).toFixed(2),
    spd,
    tierText: tierText(spd, app.level),
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
    rows,
    truncated: res.truncated,
    melds: !!o.melds,
    melded: res.picks.filter(p => p.meld).length,
    noMeldData: res.noMeldData,
  };
}

/* Per-stat ceiling of the searched pool, synced (only while sync changes something in it) and unsynced. Returns null for an empty pool, {error} if the
   optimizer throws. */
/* nodeLimit: per-run search limit (tests lower it to force a truncated, lower-bound result). */
export function ceilingView(app, nodeLimit = CEILING_NODE_LIMIT) {
  const job = app.jobCtx;
  const pool = searchPool(app);
  if (!pool.length) return null;
  try {
    // A search that hits its node limit only gives a lower bound: shown as "≥ value".
    let truncated = false;
    const sync = syncSettings(app);
    const none = { cap: null, sync: false, level: null };
    const best = (sy, s) => {
      const r = optimize(job, pool, sy, { target: s, nodeLimit, melds: !!app.opt.melds });
      const value = r.ok ? r.totals[s] : 0;
      if (r.truncated) truncated = true;
      return { value, text: (r.truncated ? '≥ ' : '') + value };
    };
    const synced = poolSynced(pool, sync) ? job.stats.map(s => best(sync, s)) : null;
    const unsynced = job.stats.map(s => best(none, s));
    const spdIdx = job.stats.indexOf('spd');
    const spd = (synced ?? unsynced)[spdIdx]?.value;
    return {
      label: syncLabel(app),
      headers: job.stats.map(s => job.short[s]),
      spdIdx,
      synced: synced ? synced.map(c => c.text) : null,
      unsynced: unsynced.map(c => c.text),
      truncated,
      melds: !!app.opt.melds,
      gcd: spd ? gcdFor(spd, app.level).toFixed(2) + 's' : '—',
    };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}
