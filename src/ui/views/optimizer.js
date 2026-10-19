/* Gear optimizer tab view: the best loadout for the chosen stat, searched over every piece the job can wear.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { EXPANSIONS, GCD_FLOOR_MS, SLOT_LABEL } from '../../core/constants.js';
import {
  allocatedRelic,
  browseItems,
  categoryOf,
  equipLevel,
  expansionOf,
  filterGear,
  poolItemFromRow,
  poolKey,
  withoutSources,
  slotInfo,
  slotLabel,
  wearable,
} from '../../core/items.js';
import { optimize, itemCaps, itemSyncIlvl } from '../../core/optimizer/index.js';
import { buildCandidates } from '../../core/optimizer/candidates.js';
import { sameResult } from '../../core/same-result.js';
import { WD_KEY, mitigationPct, setDefense } from '../../core/damage-defense.js';
import { fastestGcd, optimizeGcd } from '../../core/target-gcd.js';
import { rankByTier } from '../../core/tier-rank.js';
import { meldText } from '../../core/meld.js';
import { statTier } from '../../core/tiers.js';
import { bestFood, foodBonus, foodChoices, foodLabel, statBase, withFood } from '../../core/food.js';
import { BASE_GCD_MS, gcdFor, dotMult, gcdTierAt, hasteFor, speedParams } from '../../core/speed.js';
import { gearFilter, syncSettings } from '../state.js';

export const NODE_LIMIT = 700000;

/* The GCD step of `spd` speed from gear, in character panel numbers (the level's base speed added; AkhMorning's tables
   use the same): "tier starts at 2238, next at 2324 (+65)" for 1,839 gear speed at level 100; `haste` in percent
   (hasteFor), for the hasted steps. */
export function tierText(spd, level, haste = 0) {
  const t = gcdTierAt(spd, level, BASE_GCD_MS, haste),
    sub = speedParams(level).sub;
  return `tier starts at ${t.start + sub}${t.next != null ? `, next at ${t.next + sub} (+${t.next - spd})` : ''}`;
}

/* The settings an optimizer result depends on, as one string: a result is for the current settings exactly when it
   was solved with the same key. Read synchronously, it also makes an effect track every one of them (the optimizer
   component). How the math works (Substat tiers) fills its values from a result only when its key matches. */
export function optimizerKey(app) {
  const o = app.opt;
  return JSON.stringify([
    app.job,
    app.cap,
    app.sync,
    app.level,
    o.target,
    o.tb,
    o.tb2,
    o.exclude.join(),
    o.expOff.join(),
    o.min,
    o.max,
    o.lvl,
    o.melds,
    o.food,
    o.foodPair,
    o.gcd,
    o.gcdMode,
    o.byTier,
  ]);
}

/* A result's substats as the character panel shows them, {stat: value}: the With food row with Food on, else Total;
   null for a view without a result (`view` from optimizerView). */
export function resultPanel(job, view) {
  if (view?.kind !== 'ok') return null;
  const row = view.food?.totals ?? view.totals;
  return Object.fromEntries(job.substats.map(s => [s, row[job.stats.indexOf(s)]]));
}

/* What the character panel adds to a stat at `level`: the character's base (statBase). For the main stat and Vitality
   that is the job's share of the level's base, without the clan's bonus (-3 to +3; owner's decision 2026-10-18). */
export function panelBase(job, stat, level) {
  return statBase(job, stat, level);
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
   any piece above the job's level cap (jobGear has none; this guards gear passed in) and the relics whose substats the
   player allocates (allocatedRelic in items.js; relicsLeftOut counts them). */
export function searchPool(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(withoutSources(gear, app.opt.exclude || []), gearFilter(app.opt));
  return pool.filter(i => wearable(app.jobCtx, i) && !allocatedRelic(app.jobCtx, i));
}

/* How many relics with player-allocated substats (allocatedRelic) pass the filters under Gear to search but are left out
   of the search, for the result's note. */
export function relicsLeftOut(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(withoutSources(gear, app.opt.exclude || []), gearFilter(app.opt));
  return pool.filter(i => wearable(app.jobCtx, i) && allocatedRelic(app.jobCtx, i)).length;
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

/* The meal Target GCD and tier ranking search with: none with Food off, the chosen pair, or every choice ('best'). */
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
function poolSettingsKey(app, gear) {
  const o = app.opt;
  if (gear && gear !== jobGear(app.jobCtx)) return null;
  return [app.jobCtx.jobId, JSON.stringify(syncSettings(app)), o.exclude.join(), o.expOff.join(), o.min, o.max, o.lvl, !!o.melds].join('|');
}

/* What the Target GCD line shows before any search: the box label, its range hint, whether it is off. */
function gcdControls(app, pool, gear) {
  const job = app.jobCtx,
    o = app.opt;
  const haste = hasteFor(job.jobId, app.level);
  const top = gcdFor(0, app.level, BASE_GCD_MS, haste?.pct ?? 0);
  const settingsKey = poolSettingsKey(app, gear);
  const key = settingsKey == null ? null : `${settingsKey}|${JSON.stringify(gcdFood(app))}`;
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
  if (r.reason === 'unreachable' && r.asked < GCD_FLOOR_MS / 1000) {
    return { bad: true, text: `The GCD can't go below ${(GCD_FLOOR_MS / 1000).toFixed(2)}` };
  }
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

/* Every piece of the pool as a candidate for the goal, unpruned, by slot type: what sameResult checks each row's
   other pieces against, with the melds the optimizer would give them (meld versions under a Target GCD). Cached like
   the Target GCD candidates: they depend on the pool settings, the goal and the GCD mode only. */
let sameCache = { key: null, cands: null };

/* Tier ranking's candidate lists (rankByTier's cache, keyed inside by objective, limits and GCD mode), kept while the
   pool settings stay, so a new tiebreak, meal or GCD only reruns the searches. */
let tierCache = { key: null, map: null };
function tierLists(app, gear) {
  const key = poolSettingsKey(app, gear);
  if (key == null) return new Map();
  if (tierCache.key !== key) tierCache = { key, map: new Map() };
  return tierCache.map;
}
function sameCandidates(app, pool, gear, sync, gcdOn) {
  const o = app.opt;
  const settingsKey = poolSettingsKey(app, gear);
  const key = settingsKey == null ? null : `${settingsKey}|${o.target},${o.tb},${o.tb2}|${gcdOn ? o.gcdMode : ''}`;
  if (key != null && sameCache.key === key) return sameCache.cands;
  const { slotList, posList } = buildCandidates(
    app.jobCtx,
    pool,
    sync,
    { target: o.target, tiebreak: [o.tb, o.tb2].filter(Boolean) },
    { prune: false, melds: !!o.melds, speed: gcdOn ? o.gcdMode : null },
  );
  const cands = {};
  slotList.forEach((t, i) => {
    cands[t] = posList[i];
  });
  if (key != null) sameCache = { key, cands };
  return cands;
}

/* A row's menu of pieces with the same result, or null when the shown piece is the only one: {count, groups}, groups by
   expansion, oldest first, each [{key, name, ilvl, lvl, category, on}] by equip level (category: its gear category,
   {key, label}, or null for a piece not from the database; on: the piece the row shows). */
function sameMenu(options, shown) {
  if (options.length < 2) return null;
  const facts = c => ({
    key: poolKey(c.item),
    name: c.item.name,
    ilvl: c.item.ilvl,
    lvl: equipLevel(c.item) ?? 0,
    category: categoryOf(c.item),
    on: c.item === shown,
    exp: expansionOf(equipLevel(c.item) ?? 0, c.item.ilvl),
  });
  const items = options.map(facts).sort((a, b) => a.lvl - b.lvl || a.ilvl - b.ilvl);
  const groups = EXPANSIONS.map(([short, name]) => ({ label: name, items: items.filter(x => x.exp === short) })).filter(
    g => g.items.length,
  );
  return { count: options.length, groups };
}

/* The optimizer can throw (e.g. stat totals too large to rank exactly); the page shows the message
   instead of keeping a stale result. `gear`: as for searchPool. `chosen`: {row index: pool key}, the pieces the player
   picked from the rows' menus of pieces with the same result (sameResult; not saved). */
export function optimizerView(app, gear, chosen = {}) {
  try {
    return buildOptimizerView(app, gear, chosen);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

function buildOptimizerView(app, gear, chosen) {
  const job = app.jobCtx,
    o = app.opt;
  // 1. the gear to search and the Target GCD box's state
  const pool = searchPool(app, gear);
  if (!pool.length) return { kind: 'excluded' };
  const sync = syncSettings(app);
  const ui = gcdControls(app, pool, gear);
  const pct = ui.haste?.pct ?? 0;
  const asked = askedGcd(app);
  // 2. the search. By tier: the tiers of the goal and tiebreaks first, counted with food, so meal and gear are chosen
  // together (rankByTier). Otherwise, with a Target GCD, gear and meal are chosen together (optimizeGcd); without
  // one, the gear first and the meal after (it never changes which gear wins)
  let res, food, bonus, line;
  const byTier = o.byTier !== false;
  if (byTier) {
    const r = rankByTier(
      job,
      pool,
      sync,
      {
        target: o.target,
        tiebreak: [o.tb, o.tb2],
        melds: !!o.melds,
        food: gcdFood(app),
        nodeLimit: NODE_LIMIT,
        level: app.level,
        gcd: asked ?? undefined,
        mode: o.gcdMode,
      },
      tierLists(app, gear),
    );
    if (asked != null) line = gcdLine(job, r, ui, app.level);
    if (!r.ok) {
      if (asked != null) return { kind: r.truncated ? 'infeasible' : 'nogcd', gcdUi: ui, gcdLine: line, truncated: r.truncated };
      return { kind: r.truncated ? 'infeasible' : 'noset', gcdUi: ui, truncated: r.truncated };
    }
    res = r;
    food = r.food;
    bonus = r.bonus;
  } else if (asked != null) {
    const goal = { target: o.target, tiebreak: [o.tb, o.tb2], melds: !!o.melds, mode: o.gcdMode };
    // the candidates depend on the pool settings, the goal and the mode, not on the GCD: reuse them while only it changes
    const settingsKey = poolSettingsKey(app, gear);
    const key = settingsKey == null ? null : `${settingsKey}|${goal.target},${goal.tiebreak.join()},${goal.mode}`;
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
    if (!res.ok) return { kind: res.truncated ? 'infeasible' : 'noset', gcdUi: ui, truncated: res.truncated };
    food = chosenFood(app, res.totals);
    bonus = food ? foodBonus(job, food, res.totals, app.level) : {};
  }

  // 3. the set each row shows: the easiest piece with the same result, or the player's pick (core/same-result.js)
  const same = sameResult(
    job,
    res.picks,
    sameCandidates(app, pool, gear, sync, asked != null),
    // the goal's points stay in both rankings: by tier, the points left over go to the goal (order A, owner's decision
    // 2026-10-16), so a swap that kept its tier with fewer points would show less than the search found
    { level: app.level, food, haste: pct, goal: o.target },
    chosen,
  );
  const picks = same.map(r => r.pick);
  const gearTotals = Object.fromEntries(job.stats.map(s => [s, picks.reduce((sum, p) => sum + (p.item ? p.eff[s] || 0 : 0), 0)]));
  if (food) bonus = foodBonus(job, food, gearTotals, app.level);

  // 4. totals: gear only, with food, and as the character panel shows them
  // totals with food (the gear totals when Food is off): what the effects, tiers and GCD are counted from
  const t = withFood(gearTotals, bonus),
    spd = t.spd;
  // the character panel's numbers: every stat with the character's base added (clan bonus aside)
  const panel = s => t[s] + panelBase(job, s, app.level),
    base = s => panelBase(job, s, app.level);
  // 5. one row per slot, in the character panel's order; rings are numbered
  const scored = [o.target, o.tb, o.tb2].filter(Boolean);
  let ringN = 0;
  const rows = picks.map((p, i) => {
    let label = SLOT_LABEL[p.type];
    if (p.type === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    if (!p.item) return { label, item: null, blockedBy: p.blockedBy?.name ?? '' };
    // a piece covering more than one slot says so ("Body + Head")
    if (p.type !== 'ring') label = slotLabel(p.type, slotInfo(job, p.item).blocks);
    const caps = itemCaps(job, p.item, sync);
    const lvl = equipLevel(p.item);
    return {
      label,
      item: p.item,
      meld: meldText(job, p.meld),
      // where the piece comes from: its gear category ({key, label}), and "HW · lvl 60" (both null for a piece not
      // from the database)
      category: categoryOf(p.item),
      from: lvl == null ? null : `${expansionOf(lvl, p.item.ilvl)} · lvl ${lvl}`,
      // the other pieces with the same result, for the row's menu (null when there are none)
      same: sameMenu(same[i].options, p.item),
      // atCap: a target or tiebreak stat at the most this piece can have (its sync cap, or its own cap with melds)
      cells: job.stats.map(s => {
        const value = p.eff[s] || 0;
        return { value, gold: s === o.target && !!value, atCap: scored.includes(s) && !!value && value >= caps[s] };
      }),
    };
  });
  // 6. each stat's effect (from gear, plus food when on), the points above its tier start (spare) and to the next tier;
  // held: a key tier ranking holds (it keeps its tier whatever the later keys do)
  const heldStats = new Set(byTier ? res.held.map(h => h.stat) : []);
  const tiers = job.stats.map(s => {
    // speed with the job's haste: its GCD and steps are the hasted ones, as in the GCD card
    const g = s === 'spd' && pct ? gcdTierAt(t[s] || 0, app.level, BASE_GCD_MS, pct) : null;
    const tier = g ? { effect: `${g.gcd.toFixed(2)}s`, start: g.start, next: g.next } : statTier(job, s, t[s], app.level);
    if (!tier) return null;
    return {
      effect: tier.effect,
      spare: t[s] - tier.start,
      toNext: tier.next == null ? null : tier.next - t[s],
      zero: !t[s],
      held: heldStats.has(s),
    };
  });
  // tier ranking's readout: each key in order, with the effect it holds (its points for a stat without tiers)
  // (Tenacity is ranked by its mitigation step, rankTierOf, not the damage step the Effect row shows)
  const heldEffect = h => {
    if (h.tier == null) return '(every point counts)';
    if (h.stat === 'spec' && job.profile.spec === 'ten') return `−${(h.tier / 10).toFixed(1)}% damage taken`;
    return tiers[job.stats.indexOf(h.stat)]?.effect ?? '';
  };
  // weapon damage, ranked first, is left out of the readout (owner's decision 2026-10-18)
  const heldText = byTier
    ? res.held
        .filter(h => h.stat !== WD_KEY)
        .map(h => `${job.label[h.stat]} ${heldEffect(h)}`.trim())
        .join(', then ')
    : null;
  // the set's defense after sync and the share of damage it removes at this level (shown, never ranked)
  const def = setDefense(picks.filter(p => p.item).map(p => ({ item: p.item, target: itemSyncIlvl(p.item, sync) })));
  const defense = { phys: def.phys, mag: def.mag, physPct: mitigationPct(def.phys, app.level), magPct: mitigationPct(def.mag, app.level) };

  // 7. everything the template shows
  return {
    kind: 'ok',
    gcdUi: ui,
    gcdLine: line ?? null,
    headers: job.stats.map(s => job.short[s]),
    target: o.target,
    targetLabel: job.label[o.target],
    spdLabel: job.label.spd,
    total: panel(o.target),
    totalLabel: `${job.label[o.target]} (${[base(o.target) && 'base', 'gear', bonus[o.target] && 'food'].filter(Boolean).join(' + ')}${poolSynced(pool, sync) ? ', synced' : ''})`,
    totals: job.stats.map(s => gearTotals[s] + base(s)),
    // the Food row and the totals with it; null with Food off
    food: food && {
      name: food.name,
      ilvl: food.ilvl,
      label: foodLabel(job, food),
      best: !o.foodPair,
      cells: job.stats.map(s => (bonus[s] ? { value: bonus[s].bonus, capped: bonus[s].capped } : null)),
      totals: job.stats.map(panel),
    },
    tiers,
    // by tier: "Critical Hit 29.3%, then Determination +9.4%, then Direct Hit +0.0%"; null for the plain ranking
    byTier,
    heldText,
    synced: poolSynced(pool, sync),
    gcd: gcdFor(spd, app.level, BASE_GCD_MS, pct).toFixed(2),
    // hasted jobs: the haste and the GCD without it (owner's decision 2026-10-16: both, labelled)
    hasteText: ui.haste ? ` (${ui.haste.name} ${pct}%; ${gcdFor(spd, app.level).toFixed(2)} without)` : '',
    spd,
    spdText: `${panel('spd')} ${job.label.spd} (${base('spd')} base, ${gearTotals.spd} gear${bonus.spd ? `, ${bonus.spd.bonus} food` : ''})`,
    tierText: tierText(spd, app.level, pct),
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
    rows,
    truncated: res.truncated,
    melded: picks.filter(p => p.meld).length,
    // {phys, mag, physPct, magPct}: the Defense row
    defense,
    // the note that weapon damage is ranked first; false for a job that does not rank it (Blue Mage)
    weaponFirst: !!job.damageKey,
    // relics with player-allocated substats left out of the search (searchPool), for the note; 0 hides it
    relicsLeftOut: relicsLeftOut(app, gear),
  };
}
