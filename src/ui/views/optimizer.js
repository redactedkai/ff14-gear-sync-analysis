/* Gear optimizer tab view: the best loadout for the chosen stat, searched over every piece the job can wear.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { SLOT_LABEL } from '../../core/constants.js';
import { browseItems, poolItemFromRow, withoutSources, slotInfo, slotLabel, wearable } from '../../core/items.js';
import { optimize, itemSyncIlvl } from '../../core/optimizer/index.js';
import { meldText } from '../../core/meld.js';
import { statTier } from '../../core/tiers.js';
import { gcdFor, dotMult, gcdTierAt } from '../../core/speed.js';
import { syncSettings } from '../state.js';

export const NODE_LIMIT = 700000;

/* "tier starts at 1818, next at 1904 (+65)" */
export function tierText(spd, level) {
  const t = gcdTierAt(spd, level);
  return `tier starts at ${t.start}${t.next != null ? `, next at ${t.next} (+${t.next - spd})` : ''}`;
}

/* Every database piece the job can wear (browseItems leaves out gear above its level cap), as pool items. Built once per
   job and kept while the job stays (~5-10 ms to build): the per-item meld cap cache (core/meld.js) is keyed by these
   objects, so it stays warm from run to run. */
let gearCache = { job: null, gear: null };
export function jobGear(job) {
  if (gearCache.job !== job) gearCache = { job, gear: Object.freeze(browseItems(job, {}).map(r => poolItemFromRow(job, r))) };
  return gearCache.gear;
}

/* The pool the optimizer searches: the gear (every piece the job can wear, unless a test passes its own) minus the gear
   groups left out (opt.exclude) and any piece above the job's level cap (jobGear has none; this guards gear passed in). */
export function searchPool(app, gear = jobGear(app.jobCtx)) {
  return withoutSources(gear, app.opt.exclude || []).filter(i => wearable(app.jobCtx, i));
}

/* Sync changes something in this pool: item level sync is on, or some piece is level-synced. */
function poolSynced(pool, sync) {
  return sync.sync || pool.some(i => itemSyncIlvl(i, sync) != null);
}

/* {searched, left}: how many pieces are searched and how many the left-out groups hold, for the line under them. */
export function searchCount(app, gear = jobGear(app.jobCtx)) {
  const searched = searchPool(app, gear).length;
  return { searched, left: gear.length - searched };
}

/* The optimizer can throw (e.g. stat totals too large to rank exactly); the page shows the message
   instead of keeping a stale result. `gear`: as for searchPool. */
export function optimizerView(app, gear) {
  try {
    return buildOptimizerView(app, gear);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

function buildOptimizerView(app, gear) {
  const job = app.jobCtx,
    o = app.opt;
  const pool = searchPool(app, gear);
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
    // each stat's effect from gear alone, the points above its tier start (spare) and the points to the next tier
    tiers: job.stats.map(s => {
      const tier = statTier(job, s, t[s], app.level);
      if (!tier) return null;
      return { effect: tier.effect, spare: t[s] - tier.start, toNext: tier.next == null ? null : tier.next - t[s], zero: !t[s] };
    }),
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
