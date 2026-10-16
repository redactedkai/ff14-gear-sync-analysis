/* Gear optimizer tab view: the best loadout for the chosen stat, searched over every piece the job can wear.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { SLOT_LABEL } from '../../core/constants.js';
import { browseItems, filterGear, poolItemFromRow, withoutSources, slotInfo, slotLabel, wearable } from '../../core/items.js';
import { optimize, itemCaps, itemSyncIlvl } from '../../core/optimizer/index.js';
import { fastestGcd, optimizeGcd } from '../../core/target-gcd.js';
import { meldText } from '../../core/meld.js';
import { statTier } from '../../core/tiers.js';
import { bestFood, foodBonus, foodChoices, foodLabel, statBase, withFood } from '../../core/food.js';
import { gcdFor, dotMult, gcdTierAt, hasteFor, speedParams } from '../../core/speed.js';
import { gearFilter, syncSettings } from '../state.js';

export const NODE_LIMIT = 700000;

/* The GCD step of `spd` speed from gear, in character panel numbers (the level's base speed added; AkhMorning's tables
   use the same): "tier starts at 2238, next at 2324 (+65)" for 1,839 gear speed at level 100; `haste` in percent
   (hasteFor), for the hasted steps. */
export function tierText(spd, level, haste = 0) {
  const t = gcdTierAt(spd, level, 2500, haste),
    sub = speedParams(level).sub;
  return `tier starts at ${t.start + sub}${t.next != null ? `, next at ${t.next + sub} (+${t.next - spd})` : ''}`;
}

/* What the character panel adds to a stat: the level's base for a substat (statBase), 0 for the main stat and
   Vitality (their base depends on the job and clan, which the page does not ask for; owner's decision 2026-10-16). */
export function panelBase(job, stat, level) {
  return job.substats.includes(stat) ? statBase(job, stat, level) : 0;
}

/* The meal the result shows, or null with Food off: the chosen pair (opt.foodPair), or with '' the one that raises the
   target, then the tiebreaks, the most (bestFood; the gear set is the same with any meal, core/food.js). */
export function chosenFood(app, totals) {
  const job = app.jobCtx,
    o = app.opt;
  if (!o.food) return null;
  const choices = foodChoices(job);
  if (o.foodPair) return choices.find(c => c.key === o.foodPair) ?? null;
  return bestFood(job, choices, totals, app.level, [o.target, o.tb, o.tb2]);
}

/* Every database piece the job can wear (browseItems leaves out gear above its level cap), as pool items. Built once per
   job and kept while the job stays (~5-10 ms to build): the per-item meld cap cache (core/meld.js) is keyed by these
   objects, so it stays warm from run to run. */
let gearCache = { job: null, gear: null };
export function jobGear(job) {
  if (gearCache.job !== job) gearCache = { job, gear: Object.freeze(browseItems(job, {}).map(r => poolItemFromRow(job, r))) };
  return gearCache.gear;
}

/* The pool the optimizer searches: the gear (every piece the job can wear, unless a test passes its own) that passes the
   filters under Gear to search (expansions, item level range, equip level, gear groups left out: the opt fields), minus
   any piece above the job's level cap (jobGear has none; this guards gear passed in). */
export function searchPool(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(withoutSources(gear, app.opt.exclude || []), gearFilter(app.opt));
  return pool.filter(i => wearable(app.jobCtx, i));
}

/* Sync changes something in this pool: item level sync is on, or some piece is level-synced. */
function poolSynced(pool, sync) {
  return sync.sync || pool.some(i => itemSyncIlvl(i, sync) != null);
}

/* {searched, left}: how many pieces are searched and how many the filters under Gear to search leave out, for its heading. */
export function searchCount(app, gear = jobGear(app.jobCtx)) {
  const searched = searchPool(app, gear).length;
  return { searched, left: gear.length - searched };
}

/* The Target GCD asked for, in seconds, or null for none: the box is empty, or the goal is speed itself (the box is
   disabled then: maximizing speed already gives the fastest GCD). */
export function askedGcd(app) {
  const o = app.opt;
  if (o.target === 'spd' || o.gcd === '' || o.gcd == null) return null;
  const g = Number(o.gcd);
  return Number.isFinite(g) && g > 0 ? Math.round(g * 100) / 100 : null;
}

/* The meal Target GCD searches with: none with Food off, the chosen pair, or every choice ('best'). */
function gcdFood(app) {
  const o = app.opt;
  if (!o.food) return null;
  return o.foodPair ? (foodChoices(app.jobCtx).find(c => c.key === o.foodPair) ?? null) : 'best';
}

/* One-entry caches, so typing a new GCD only reruns the search: the candidate lists Target GCD builds (they depend on
   the pool, sync, goal, melds and mode, never on the GCD), and the fastest GCD the pool reaches (pool, sync, melds and
   food only). Keyed by the settings that shape the pool; gear passed in by a test is never cached. */
let prepCache = { key: null, prep: null };
let fastCache = { key: null, gcd: null };
function poolKey(app, gear) {
  const o = app.opt;
  if (gear && gear !== jobGear(app.jobCtx)) return null;
  return [app.jobCtx.jobId, JSON.stringify(syncSettings(app)), o.exclude.join(), o.expOff.join(), o.min, o.max, o.lvl, !!o.melds].join('|');
}

/* What the Target GCD line shows before any search: the box label, its range hint, whether it is off. */
function gcdControls(app, pool, gear) {
  const job = app.jobCtx,
    o = app.opt;
  const haste = hasteFor(job.jobId, app.level);
  const top = gcdFor(0, app.level, 2500, haste?.pct ?? 0);
  const pk = poolKey(app, gear);
  const key = pk == null ? null : `${pk}|${JSON.stringify(gcdFood(app))}`;
  let fastest;
  if (key != null && fastCache.key === key) fastest = fastCache.gcd;
  else {
    fastest = fastestGcd(job, pool, syncSettings(app), { melds: !!o.melds, food: gcdFood(app), nodeLimit: NODE_LIMIT, level: app.level });
    if (key != null) fastCache = { key, gcd: fastest };
  }
  return {
    label: haste ? `Target GCD (${haste.name} ${haste.pct}%)` : 'Target GCD',
    off: o.target === 'spd',
    hint: o.target === 'spd' ? 'off: the goal is speed' : fastest == null ? '' : `${top.toFixed(2)} to ${fastest.toFixed(2)}`,
    top,
    fastest,
    haste,
  };
}

/* The line under the Target GCD box, short and plain (owner's request): the speed the GCD asks for on the character
   panel, or why no set fits. The fastest GCD the gear reaches is already in the range beside the box. */
function gcdLine(job, r, ui, level) {
  const base = statBase(job, 'spd', level);
  if (r.reason === 'unreachable') {
    const why = ui.haste ? `${ui.haste.name} ${ui.haste.pct}%` : 'no speed';
    return { bad: true, text: `${job.jobName}'s GCD is ${ui.top.toFixed(2)} at most (${why})` };
  }
  if (!r.ok) return { bad: true, text: `No set at ${r.mode === 'exact' ? 'exactly ' : ''}${r.asked.toFixed(2)}` };
  if (r.faster) return { bad: false, text: `${r.gcd.toFixed(2)}, faster than asked` };
  const lo = base + r.band.min;
  const need = r.band.max == null ? `${lo} or more` : `${lo} to ${base + r.band.max}`;
  return { bad: false, text: `${job.label.spd} ${need} (character panel)` };
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
  const ui = gcdControls(app, pool, gear);
  const pct = ui.haste?.pct ?? 0;
  const asked = askedGcd(app);
  let res, food, bonus, line;
  if (asked != null) {
    const goal = { target: o.target, tiebreak: [o.tb, o.tb2], melds: !!o.melds, mode: o.gcdMode };
    const pk = poolKey(app, gear);
    const key = pk == null ? null : `${pk}|${goal.target},${goal.tiebreak.join()},${goal.mode}`;
    const prep = key != null && prepCache.key === key ? prepCache.prep : null;
    const r = optimizeGcd(job, pool, sync, { ...goal, gcd: asked, food: gcdFood(app), nodeLimit: NODE_LIMIT, level: app.level }, prep);
    if (key != null && r.prep) prepCache = { key, prep: r.prep };
    line = gcdLine(job, r, ui, app.level);
    if (!r.ok) return { kind: r.truncated ? 'infeasible' : 'nogcd', gcdUi: ui, gcdLine: line, truncated: r.truncated };
    res = r;
    food = r.food;
    bonus = r.bonus;
  } else {
    res = optimize(job, pool, sync, {
      target: o.target,
      tiebreak: [o.tb, o.tb2],
      nodeLimit: NODE_LIMIT,
      melds: !!o.melds,
    });
    if (!res.ok) return { kind: 'infeasible', gcdUi: ui, truncated: res.truncated };
    food = chosenFood(app, res.totals);
    bonus = food ? foodBonus(job, food, res.totals, app.level) : {};
  }

  const gearT = res.totals;
  // totals with food (the gear totals when Food is off): what the effects, tiers and GCD are counted from
  const t = withFood(gearT, bonus),
    spd = t.spd;
  // the character panel's numbers: substats with the level's base added, main stat and Vitality as gear points
  const panel = s => t[s] + panelBase(job, s, app.level),
    base = s => panelBase(job, s, app.level);
  const scored = [o.target, o.tb, o.tb2].filter(Boolean);
  let ringN = 0;
  const rows = res.picks.map(p => {
    let label = SLOT_LABEL[p.type];
    if (p.type === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    if (!p.item) return { label, item: null, blockedBy: p.blockedBy?.name ?? '' };
    if (p.type !== 'ring') label = slotLabel(p.type, slotInfo(job, p.item).blocks);
    const caps = itemCaps(job, p.item, sync);
    return {
      label,
      item: p.item,
      meld: meldText(job, p.meld),
      // atCap: a target or tiebreak stat at the most this piece can have (its sync cap, or its own cap with melds)
      cells: job.stats.map(s => {
        const value = p.eff[s] || 0;
        return { value, gold: s === o.target && !!value, atCap: scored.includes(s) && !!value && value >= caps[s] };
      }),
    };
  });
  return {
    kind: 'ok',
    gcdUi: ui,
    gcdLine: line ?? null,
    headers: job.stats.map(s => job.short[s]),
    target: o.target,
    targetLabel: job.label[o.target],
    spdLabel: job.label.spd,
    total: panel(o.target),
    totalLabel: `${job.label[o.target]} (${[base(o.target) && 'base', 'gear', food && 'food'].filter(Boolean).join(' + ')}${poolSynced(pool, sync) ? ', synced' : ''})`,
    totals: job.stats.map(s => gearT[s] + base(s)),
    // the Food row and the totals with it; null with Food off
    food: food && {
      name: food.name,
      ilvl: food.ilvl,
      label: foodLabel(job, food),
      best: !o.foodPair,
      cells: job.stats.map(s => (bonus[s] ? { value: bonus[s].bonus, capped: bonus[s].capped } : null)),
      totals: job.stats.map(panel),
    },
    // a GCD target changes which gear fits a meal, so "the same gear with any meal" no longer holds
    gcdOn: asked != null,
    // each stat's effect (from gear, plus food when on), the points above its tier start (spare) and to the next tier
    tiers: job.stats.map(s => {
      // speed with the job's haste: its GCD and steps are the hasted ones, as in the GCD card
      const g = s === 'spd' && pct ? gcdTierAt(t[s] || 0, app.level, 2500, pct) : null;
      const tier = g ? { effect: `${g.gcd.toFixed(2)}s`, start: g.start, next: g.next } : statTier(job, s, t[s], app.level);
      if (!tier) return null;
      return { effect: tier.effect, spare: t[s] - tier.start, toNext: tier.next == null ? null : tier.next - t[s], zero: !t[s] };
    }),
    synced: poolSynced(pool, sync),
    gcd: gcdFor(spd, app.level, 2500, pct).toFixed(2),
    // hasted jobs: the haste and the GCD without it (owner's decision 2026-10-16: both, labelled)
    hasteText: ui.haste ? ` (${ui.haste.name} ${pct}%; ${gcdFor(spd, app.level).toFixed(2)} without)` : '',
    spd,
    spdText: `${panel('spd')} ${job.label.spd} (${base('spd')} base, ${gearT.spd} gear${bonus.spd ? `, ${bonus.spd.bonus} food` : ''})`,
    tierText: tierText(spd, app.level, pct),
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
    rows,
    truncated: res.truncated,
    melds: !!o.melds,
    anyAtCap: rows.some(r => r.cells?.some(c => c.atCap)),
    melded: res.picks.filter(p => p.meld).length,
    noMeldData: res.noMeldData,
  };
}
