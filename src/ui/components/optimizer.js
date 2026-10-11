/* Optimizer tab: the best loadout for the chosen stat, and the per-stat ceiling of the pool. Both recompute
   (debounced) only while the tab is open. */
import Alpine from 'alpinejs';
import { SLOT_LABEL } from '../../core/constants.js';
import { optimize } from '../../core/optimizer/index.js';
import { gcdFor, dotMult, gcdTiers } from '../../core/speed.js';
import { debouncedEffect } from '../helpers.js';

export const NODE_LIMIT = 700000;
export const CEILING_NODE_LIMIT = 150000;
const DEBOUNCE_MS = 120;

export function optimizerView(app) {
  const job = app.jobCtx, o = app.opt;
  if (!app.pool.length) return { kind: 'empty' };
  const res = optimize(job, app.pool, { cap: app.cap, sync: app.sync }, {
    target: o.target, tiebreak: [o.tb, o.tb2], minAvgIlvl: o.avg ? +o.avgMin || 0 : 0, nodeLimit: NODE_LIMIT,
  });
  if (!res.ok) return { kind: 'infeasible', truncated: res.truncated };

  const t = res.totals, spd = t.spd;
  const tiers = gcdTiers(app.level);
  const cur = tiers.filter(x => x.spd <= spd).pop();
  const nxt = tiers.find(x => x.spd > spd);
  let ringN = 0;
  const rows = res.picks.map(p => {
    let label = SLOT_LABEL[p.type];
    if (p.type === 'ring') { ringN++; label = 'Ring ' + ringN; }
    if (!p.item) return { label, item: null };
    return {
      label, item: p.item,
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
    tierText: `tier starts at ${cur.spd}${nxt ? `, next at ${nxt.spd} (+${nxt.spd - spd})` : ''}`,
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
    avg: res.avgIlvl.toFixed(1),
    avgOk: res.avgIlvl >= app.cap,
    denom: res.denom,
    rows,
    truncated: res.truncated,
  };
}

export function ceilingView(app) {
  const job = app.jobCtx;
  if (!app.pool.length) return null;
  const best = (sync, s) => {
    const r = optimize(job, app.pool, { cap: app.cap, sync }, { target: s, nodeLimit: CEILING_NODE_LIMIT });
    return r.ok ? r.totals[s] : 0;
  };
  const synced = job.stats.map(s => best(true, s));
  const unsynced = job.stats.map(s => best(false, s));
  const spdIdx = job.stats.indexOf('spd');
  return {
    cap: app.cap, headers: job.stats.map(s => job.short[s]), spdIdx, synced, unsynced,
    gcd: synced[spdIdx] ? gcdFor(synced[spdIdx], app.level).toFixed(2) + 's' : '—',
  };
}

export function optimizer() {
  return {
    view: null,
    init() {
      debouncedEffect(Alpine, () => {
        const app = this.$store.app;
        // read every input synchronously so the effect tracks it
        const deps = [app.tab, app.poolVersion, app.cap, app.sync, app.level, app.jobCtx, app.opt.target, app.opt.tb, app.opt.tb2, app.opt.avg, app.opt.avgMin];
        return () => { if (deps[0] === 'opt') this.view = Object.freeze(optimizerView(app)); };
      }, DEBOUNCE_MS);
    },
    get statOptions() { return this.job.stats.map(s => [s, this.job.label[s]]); },
    get tiebreakOptions() { return [['', 'none']].concat(this.statOptions); },
  };
}

export function ceiling() {
  return {
    view: null,
    init() {
      debouncedEffect(Alpine, () => {
        const app = this.$store.app;
        const deps = [app.tab, app.poolVersion, app.cap, app.sync, app.level, app.jobCtx];
        return () => { if (deps[0] === 'opt') this.view = ceilingView(app); };
      }, DEBOUNCE_MS);
    },
  };
}
