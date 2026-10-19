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
  itemRoutes,
  poolKey,
  searchMatches,
  withActivities,
  emptyActivities,
  slotInfo,
  slotLabel,
  wearable,
} from '../../core/items.js';
import { optimize, itemCaps, itemSyncIlvl } from '../../core/optimizer/index.js';
import { buildCandidates } from '../../core/optimizer/candidates.js';
import { sameMeals, sameResult } from '../../core/same-result.js';
import { mitigationPct, setDefense } from '../../core/damage-defense.js';
import { fastestGcd, optimizeGcd } from '../../core/target-gcd.js';
import { rankByTier } from '../../core/tier-rank.js';
import { meldText } from '../../core/meld.js';
import { statTier } from '../../core/tiers.js';
import { allMeals, bestFood, foodBonus, foodChoices, foodLabel, statBase, withFood } from '../../core/food.js';
import { BASE_GCD_MS, gcdFor, dotMult, gcdTierAt, hasteFor, speedParams } from '../../core/speed.js';
import { defaultState, gearFilter, syncSettings } from '../state.js';
import { fmtInt } from '../helpers.js';

/* The page's search node budget: a search that visits more nodes stops, keeps the best set found so far and is marked
   truncated (the result's "node limit" note). Lower than the engine's own default (1,500,000), since the search holds
   the page's thread; a synthetic worst-case pool reached it in about 0.5 s, and real pools stay far below it
   (docs/engineering/optimizer.md section 5, Node limit). Each search of a solve has its own budget. */
export const NODE_LIMIT = 700000;

/* The GCD step of `spd` speed from gear, in character panel numbers (the level's base speed added; AkhMorning's tables
   use the same): "tier starts at 2238, next at 2324 (+65)" for 1,839 gear speed at level 100; `haste` in percent
   (hasteFor), for the hasted steps. */
export function tierText(spd, level, haste = 0) {
  const t = gcdTierAt(spd, level, BASE_GCD_MS, haste),
    sub = speedParams(level).sub;
  return `tier starts at ${t.start + sub}${t.next != null ? `, next at ${t.next + sub} (+${t.next - spd})` : ''}`;
}

/* The optimizer's settings: every field of the store's `opt` (state.js defaultState), so a field added there is part of
   optimizerKey without another edit. */
const OPT_KEYS = Object.freeze(Object.keys(defaultState().opt));

/* The settings an optimizer result depends on, as one string: the job and sync settings and every optimizer setting
   (OPT_KEYS). A result is for the current settings exactly when it was solved with the same key. Read synchronously,
   it also makes an effect track every one of them (the optimizer component). */
export function optimizerKey(app) {
  return JSON.stringify([app.job, app.cap, app.sync, app.level, ...OPT_KEYS.map(k => app.opt[k])]);
}

/* The meal the plain search's result uses, or null with Food off: the player's pick from the Food menu (`meal`, an
   allMeals entry, or null), else the one that raises the target, then the tiebreaks, the most (bestFood; the gear set is
   the same with any meal, core/food.js). */
export function chosenFood(app, totals, meal = null) {
  const o = app.opt;
  if (!o.food) return null;
  return meal ?? bestFood(app.jobCtx, foodChoices(app.jobCtx), totals, app.level, [o.target, o.tb, o.tb2]);
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
   filters under Gear to search (expansions, equip level, item level range, Gear from and the market board: the opt fields), minus
   any piece above the job's level cap (jobGear has none; this guards gear passed in) and the relics whose substats the
   player allocates (allocatedRelic in items.js; relicsLeftOut counts them). */
export function searchPool(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(withActivities(gear, app.opt.exclude || [], app.opt.market !== false), gearFilter(app.opt));
  return pool.filter(i => wearable(app.jobCtx, i) && !allocatedRelic(app.jobCtx, i));
}

/* How many relics with player-allocated substats (allocatedRelic) pass the filters under Gear to search but are left out
   of the search, for the result's note. */
export function relicsLeftOut(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(withActivities(gear, app.opt.exclude || [], app.opt.market !== false), gearFilter(app.opt));
  return pool.filter(i => wearable(app.jobCtx, i) && allocatedRelic(app.jobCtx, i)).length;
}

/* The "Gear from" boxes with nothing for the job and the other filters under Gear to search (emptyActivities): the
   menu greys them out. */
export function emptyGearFrom(app, gear = jobGear(app.jobCtx)) {
  const pool = filterGear(gear, gearFilter(app.opt)).filter(i => wearable(app.jobCtx, i) && !allocatedRelic(app.jobCtx, i));
  return emptyActivities(pool.map(itemRoutes).filter(Boolean));
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

/* The meal Target GCD and tier ranking search with: none with Food off, the player's pick from the Food menu (`meal`),
   or every choice ('best'). */
function gcdFood(app, meal) {
  if (!app.opt.food) return null;
  return meal ?? 'best';
}

/* One-entry caches, so typing a new GCD only reruns the search: the candidate lists Target GCD builds (they depend on
   the pool, sync, goal, melds and mode, never on the GCD), and the fastest GCD the pool reaches (pool, sync, melds and
   food only). Keyed by the settings that shape the pool; gear passed in by a test is never cached. */
let prepCache = { key: null, prep: null };
let fastCache = { key: null, gcd: null };
function poolSettingsKey(app, gear) {
  const o = app.opt;
  if (gear && gear !== jobGear(app.jobCtx)) return null;
  return [
    app.jobCtx.jobId,
    JSON.stringify(syncSettings(app)),
    o.exclude.join(),
    o.market,
    o.expOff.join(),
    o.min,
    o.max,
    o.lvl,
    !!o.melds,
  ].join('|');
}

/* What the Target GCD field shows before any search: its label with the range in parentheses ("Target GCD (2.50 to
   2.10)", the job's haste after it, or "off: the goal is speed"), whether it is off. */
function gcdControls(app, pool, gear, meal) {
  const job = app.jobCtx,
    o = app.opt;
  const haste = hasteFor(job.jobId, app.level);
  const top = gcdFor(0, app.level, BASE_GCD_MS, haste?.pct ?? 0);
  const settingsKey = poolSettingsKey(app, gear);
  const key = settingsKey == null ? null : `${settingsKey}|${JSON.stringify(gcdFood(app, meal))}`;
  let fastest;
  if (key != null && fastCache.key === key) fastest = fastCache.gcd;
  else {
    fastest = fastestGcd(job, pool, syncSettings(app), {
      melds: !!o.melds,
      food: gcdFood(app, meal),
      nodeLimit: NODE_LIMIT,
      level: app.level,
    });
    if (key != null) fastCache = { key, gcd: fastest };
  }
  const off = o.target === 'spd';
  const range = fastest == null ? '' : `${top.toFixed(2)} to ${fastest.toFixed(2)}`;
  const note = off ? 'off: the goal is speed' : [range, haste ? `with ${haste.name} ${haste.pct}%` : ''].filter(Boolean).join(' ');
  return {
    label: note ? `Target GCD (${note})` : 'Target GCD',
    off,
    top,
    fastest,
    haste,
  };
}

/* The Target GCD field's label for the settings as they are now, with the best meal when Food is on: shown while there
   is no result or the result is out of date, so the range follows the settings before the next Optimize (it is one
   search for the most speed, cached; 20 to 100 ms). `gear`: as for searchPool. */
export function gcdLabel(app, gear = jobGear(app.jobCtx)) {
  return gcdControls(app, searchPool(app, gear), gear, null).label;
}

/* The line under the Target GCD box, short and plain (owner's request): why no set fits, or that the set came out
   faster than asked; null when the set meets the GCD (owner, 2026-10-19: no line giving the speed it needs). The
   fastest GCD the gear reaches is already in the range beside the box. */
function gcdLine(job, r, ui) {
  if (r.reason === 'unreachable' && r.asked < GCD_FLOOR_MS / 1000) {
    return { bad: true, text: `The GCD can't go below ${(GCD_FLOOR_MS / 1000).toFixed(2)}` };
  }
  if (r.reason === 'unreachable') {
    const why = ui.haste ? `${ui.haste.name} ${ui.haste.pct}%` : 'no speed';
    return { bad: true, text: `${job.jobName}'s GCD is ${ui.top.toFixed(2)} at most (${why})` };
  }
  if (!r.ok) return { bad: true, text: `No set at ${r.mode === 'exact' ? 'exactly ' : ''}${r.asked.toFixed(2)}` };
  if (r.faster) return { bad: false, text: `${r.gcd.toFixed(2)}, faster than asked` };
  return null;
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

/* The Food row of a result with food: the meal it shows and its menu (owner's design, 2026-10-18). `food`: the meal the
   search used; `picked`: the meal the player picked from the menu, or null; `haste`: the job's always-on haste in
   percent. Returns {meal, best, menu}:
   - meal: the allMeals entry the row shows, the pick or else the highest item level meal with the best's result
     (sameMeals; owner, 2026-10-18); best: it has the best's result
   - menu: {count, groups, pills}. count: how many meals have the best's result. groups: every meal the job can use, by
     expansion, newest first: {label, items: [{key, name, ilvl, label, stats, adds, best, on}]}, label "Spell Speed +
     Direct Hit" (the row's hover text; the row shows what the meal adds instead), stats its neutral stats (for the pills), adds what it gives on this gear ("SpS +44 DHT +41 VIT +54"),
     best its result is the best's, on the row shows it. pills: the job's substats some meal has, {stat, short, label}.
     preset: the pills the menu starts with, and goes back to when "Best for goal" is turned on (owner, 2026-10-18): the
     goal's substats in order (target, tiebreak 1, tiebreak 2), only those the newest meal tagged best for goal has, so
     the switch on with them always lists a meal, and two at most (a meal has two stats). From a tagged meal, not the
     one shown: a picked meal need not be tagged. */
function foodRow(app, gearTotals, food, picked, haste) {
  const job = app.jobCtx,
    o = app.opt,
    level = app.level;
  const keys = [o.target, o.tb, o.tb2].filter(Boolean);
  const meals = allMeals(job);
  // the best meal for the goal on this gear: the search's own, or with a pick the one the search would have taken
  const best = picked ? bestFood(job, foodChoices(job), gearTotals, level, keys) : food;
  const tagged = new Set(sameMeals(job, gearTotals, best, meals, { level, haste, goal: o.target }, keys));
  // allMeals is oldest first, so the last tagged meal has the highest item level
  const meal = picked ?? meals.findLast(m => tagged.has(m));
  const item = m => {
    const bonus = foodBonus(job, m, gearTotals, level);
    const lines = [...m.stats.map(x => x.stat), ...(m.vit ? ['vit'] : [])];
    return {
      key: m.key,
      name: m.name,
      ilvl: m.ilvl,
      label: foodLabel(job, m),
      stats: m.stats.map(x => x.stat),
      adds: lines.map(s => `${job.short[s]} +${bonus[s].bonus}`).join(' '),
      best: tagged.has(m),
      on: m === meal,
    };
  };
  // allMeals is oldest first: reversed, each expansion lists its newest meal first
  const items = meals.map(item).reverse();
  const groups = [...EXPANSIONS]
    .reverse()
    .map(([short, name]) => ({ label: name, items: items.filter(x => expansionOf(1, x.ilvl) === short) }))
    .filter(g => g.items.length);
  const pills = job.substats
    .filter(s => meals.some(m => m.stats.some(x => x.stat === s)))
    .map(s => ({ stat: s, short: job.short[s], label: job.label[s] }));
  const bestStats = meals.findLast(m => tagged.has(m)).stats.map(x => x.stat);
  const preset = [...new Set(keys)].filter(k => pills.some(p => p.stat === k) && bestStats.includes(k)).slice(0, 2);
  return { meal, best: tagged.has(meal), menu: { count: tagged.size, groups, pills, preset } };
}

/* The Food menu's meals ({stats, name, best} items of foodRow's groups) that pass its filters: `filters` is {stats
   (the pills picked, neutral keys; a meal must have each), query (its search text; every word must be in the name),
   bestOnly (the "Best for goal" switch: tagged meals only)}. Returns the passing items, in order. */
export function mealsPassing(items, { stats, query, bestOnly }) {
  return items.filter(x => (!bestOnly || x.best) && stats.every(s => x.stats.includes(s)) && searchMatches(x.name, query));
}

/* A same-result menu's groups ({label, items}, sameMenu) after its search: a piece passes on its name or its gear
   category ("raid", "crafted"); empty groups are dropped. */
export function samePassing(groups, query) {
  return groups
    .map(g => ({ label: g.label, items: g.items.filter(x => searchMatches(`${x.name} ${x.category?.label ?? ''}`, query)) }))
    .filter(g => g.items.length);
}

/* Whether a stat pill is greyed out (owner, 2026-10-18): one already picked never is; otherwise when two are picked
   (a meal has two stats at most) or when picking it would leave no meal under the other filters. `filters` as for
   mealsPassing. */
export function mealPillOff(items, stat, filters) {
  if (filters.stats.includes(stat)) return false;
  if (filters.stats.length >= 2) return true;
  return mealsPassing(items, { ...filters, stats: [...filters.stats, stat] }).length === 0;
}

/* Why the Food menu lists no meal, or null while some meal passes: {text, action}, action 'query' (clear the search)
   or null (nothing to offer). Only a search can empty the menu: the pills and switch always leave a meal with no
   search, since a pill is picked only while some meal passes with it (mealPillOff), turning the switch on resets the
   pills to the preset, which a tagged meal has, and turning it off or removing a pill only adds meals (a test walks
   every state the menu can reach). */
export function mealEmptyReason(items, filters) {
  if (mealsPassing(items, filters).length) return null;
  const query = filters.query.trim();
  if (query && mealsPassing(items, { ...filters, query: '' }).length) return { text: `No meal matches "${query}".`, action: 'query' };
  return { text: 'No meals match.', action: null };
}

/* The optimizer can throw (e.g. stat totals too large to rank exactly); the page shows the message
   instead of keeping a stale result. `gear`: as for searchPool. `chosen`: {row index: pool key}, the pieces the player
   picked from the rows' menus of pieces with the same result (sameResult; not saved). `mealKey`: the meal the player
   picked from the Food row's menu (an allMeals key), or null for the best for the goal (not saved either). */
export function optimizerView(app, gear, chosen = {}, mealKey = null) {
  try {
    return buildOptimizerView(app, gear, chosen, mealKey);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

function buildOptimizerView(app, gear, chosen, mealKey) {
  const job = app.jobCtx,
    o = app.opt;
  // 1. the gear to search, the meal the player picked (searched with in place of the best) and the Target GCD box's state
  const pool = searchPool(app, gear);
  if (!pool.length) return { kind: 'excluded' };
  const sync = syncSettings(app);
  const picked = (o.food && mealKey && allMeals(job).find(m => m.key === mealKey)) || null;
  const ui = gcdControls(app, pool, gear, picked);
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
        food: gcdFood(app, picked),
        nodeLimit: NODE_LIMIT,
        level: app.level,
        gcd: asked ?? undefined,
        mode: o.gcdMode,
      },
      tierLists(app, gear),
    );
    if (asked != null) line = gcdLine(job, r, ui);
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
    const r = optimizeGcd(
      job,
      pool,
      sync,
      { ...goal, gcd: asked, food: gcdFood(app, picked), nodeLimit: NODE_LIMIT, level: app.level },
      prep,
    );
    if (key != null && r.prep) prepCache = { key, prep: r.prep };
    line = gcdLine(job, r, ui);
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
    food = chosenFood(app, res.totals, picked);
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

  // 4. the meal the Food row shows (the pick, else the highest item level one with the best's result) and its menu
  const meal = food ? foodRow(app, gearTotals, food, picked, pct) : null;
  if (meal) bonus = foodBonus(job, meal.meal, gearTotals, app.level);

  // 5. totals: gear only, with food, and as the character panel shows them
  // totals with food (the gear totals when Food is off): what the effects, tiers and GCD are counted from
  const foodTotals = withFood(gearTotals, bonus),
    spd = foodTotals.spd;
  // the character panel's numbers: every stat with the character's base added (statBase: for the main stat and
  // Vitality the job's share of the level's base, without the clan's bonus of -3 to +3; owner's decision 2026-10-18)
  const base = s => statBase(job, s, app.level),
    panel = s => foodTotals[s] + base(s);
  // 6. one row per slot, in the character panel's order; rings are numbered
  const scored = [o.target, o.tb, o.tb2].filter(Boolean);
  let ringN = 0;
  const rows = picks.map((p, i) => {
    let label = SLOT_LABEL[p.type];
    if (p.type === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    // an empty slot: covered by a piece in another slot, or no copy of a Unique piece left
    if (!p.item) {
      const blockedBy = p.blockedBy?.name ?? '';
      return { label, item: null, blockedBy, emptyText: blockedBy ? `covered by ${blockedBy}` : 'empty (no copy left)' };
    }
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
  // 7. each stat's effect (from gear, plus food when on), the points above its tier start (spare) and to the next tier;
  // held: a key tier ranking holds (it keeps its tier whatever the later keys do)
  const heldStats = new Set(byTier ? res.held.map(h => h.stat) : []);
  const tiers = job.stats.map(s => {
    // speed with the job's haste: its GCD and steps are the hasted ones, as in the GCD card
    const value = foodTotals[s];
    const g = s === 'spd' && pct ? gcdTierAt(value || 0, app.level, BASE_GCD_MS, pct) : null;
    const tier = g ? { effect: `${g.gcd.toFixed(2)}s`, start: g.start, next: g.next } : statTier(job, s, value, app.level);
    if (!tier) return null;
    const spare = value - tier.start,
      toNext = tier.next == null ? null : tier.next - value,
      held = heldStats.has(s);
    return {
      effect: tier.effect,
      spare,
      toNext,
      // the Tier row's cell ("3 · +16", "0 · –" at the last tier) and its hover text when tier ranking holds it
      text: `${spare} · ${toNext == null ? '–' : `+${toNext}`}`,
      title: held ? 'Held at this tier by Spare points to tiebreaks' : null,
      zero: !value,
      held,
    };
  });
  // the set's defense after sync and the share of damage it removes at this level (shown, never ranked)
  const def = setDefense(picks.filter(p => p.item).map(p => ({ item: p.item, target: itemSyncIlvl(p.item, sync) })));
  const physPct = mitigationPct(def.phys, app.level),
    magPct = mitigationPct(def.mag, app.level);
  const defense = {
    phys: def.phys,
    mag: def.mag,
    physPct,
    magPct,
    physText: fmtInt(def.phys),
    magText: fmtInt(def.mag),
    takenText: `−${physPct}% / −${magPct}% damage taken`,
  };

  // 8. everything the template shows
  const gcd = gcdFor(spd, app.level, BASE_GCD_MS, pct).toFixed(2),
    dot = ((dotMult(spd, app.level) - 1) * 100).toFixed(1);
  // hasted jobs: the haste and the GCD without it (owner's decision 2026-10-16: both, labelled)
  const hasteText = ui.haste ? ` (${ui.haste.name} ${pct}%; ${gcdFor(spd, app.level).toFixed(2)} without)` : '';
  const spdText = `${panel('spd')} ${job.label.spd} (${base('spd')} base, ${gearTotals.spd} gear${bonus.spd ? `, ${bonus.spd.bonus} food` : ''})`;
  const speedTier = tierText(spd, app.level, pct);
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
    // some cell has the cap bar: the key above the table shows
    anyAtCap: rows.some(r => (r.cells || []).some(c => c.atCap)),
    // the Food row and the totals with it; null with Food off. best: the meal has the best's result; picked: the player
    // picked it from the menu ({count, groups, pills}: foodRow)
    food: meal && {
      name: meal.meal.name,
      ilvl: meal.meal.ilvl,
      label: foodLabel(job, meal.meal),
      best: meal.best,
      picked: !!picked,
      menu: meal.menu,
      // the line under the meal's name
      note: meal.best ? 'HQ, best for goal' : 'HQ, picked',
      cells: job.stats.map(s => (bonus[s] ? { value: bonus[s].bonus, capped: bonus[s].capped } : null)),
      totals: job.stats.map(panel),
    },
    tiers,
    // what the Effect and Tier rows count
    effectNote: meal ? 'gear and food' : 'gear only, no food',
    // true when the goal and tiebreaks were ranked by tier first (the "Spare points to tiebreaks" switch)
    byTier,
    synced: poolSynced(pool, sync),
    // the readout's GCD and DoT/HoT boxes: "2.49s" over "GCD with 443 Spell Speed (...) · tier starts at 442, ...",
    // and "+0.1%"
    gcd,
    gcdText: `${gcd}s`,
    hasteText,
    spd,
    spdText,
    tierText: speedTier,
    gcdNote: `GCD${hasteText} with ${spdText} · ${speedTier}`,
    dot,
    dotText: `+${dot}%`,
    rows,
    truncated: res.truncated,
    melded: picks.filter(p => p.meld).length,
    // {phys, mag, physPct, magPct, physText, magText, takenText}: the Defense row
    defense,
    // the note under the table: the clan's bonus is left out of the main stat and Vitality (statBase)
    clanNote: `Clan bonuses can affect ${job.short.main} and ${job.short.vit}.`,
    // the note that weapon damage is ranked first; false for a job that does not rank it (Blue Mage)
    weaponFirst: !!job.damageKey,
    // relics with player-allocated substats left out of the search (searchPool), for the note; 0 hides it
    relicsLeftOut: relicsLeftOut(app, gear),
  };
}
