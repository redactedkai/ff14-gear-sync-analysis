/* Gear optimizer tab view: the best loadout for the chosen stat, searched over every piece the job can wear. The solve
   is core/recipe.js runRecipe; this module turns its set (evaluated by core/set.js evaluateSet) into what the tab shows.
   Every builder takes plain inputs: the job (a JobContext), the sync settings ({cap, sync, level}: ui/settings.js
   syncSettings), the character level, the recipe (the optimizer's settings: ui/settings.js recipeOf) and a solver
   session (core/session.js), never the store.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { EXPANSIONS, GCD_FLOOR_MS } from '../../core/constants.js';
import { allMeals, foodBonus, foodLabel } from '../../core/food.js';
import { categoryOf, equipLevel, expansionOf, searchMatches } from '../../core/items.js';
import { levelParams } from '../../core/level-params.js';
import { emptyGearFrom, gcdRange, pickedMeal, recipePool, runRecipe } from '../../core/recipe.js';
import { evaluateSet } from '../../core/set.js';
import { BASE_GCD_MS, gcdTierAt } from '../../core/speed.js';
import { fmtInt } from '../helpers.js';

/* The GCD step of `spd` speed from gear, in character panel numbers (the level's base speed added; AkhMorning's tables
   use the same): "tier starts at 2238, next at 2324 (+65)" for 1,839 gear speed at level 100; `haste` in percent
   (hasteFor), for the hasted steps. */
export function tierText(spd, level, haste = 0) {
  const t = gcdTierAt(spd, level, BASE_GCD_MS, haste),
    sub = levelParams(level).sub;
  return `tier starts at ${t.start + sub}${t.next != null ? `, next at ${t.next + sub} (+${t.next - spd})` : ''}`;
}

/* {searched, left}: how many pieces of `gear` (a session's gear for `job`) the recipe searches, and how many its
   filters under Gear to search leave out, for its heading. */
export function searchCount(job, recipe, gear) {
  const searched = recipePool(job, recipe, gear).length;
  return { searched, left: gear.length - searched };
}

/* What the Target GCD field shows before any search, from gcdRange ({top, fastest, haste}): its label with the range in
   parentheses ("Target GCD (2.50 to 2.10)", the job's haste after it, or "off: the goal is speed"), whether it is off,
   and the range's parts. */
function gcdControls(recipe, range) {
  const { top, fastest, haste } = range;
  const off = recipe.target === 'spd';
  const span = fastest == null ? '' : `${top.toFixed(2)} to ${fastest.toFixed(2)}`;
  const note = off ? 'off: the goal is speed' : [span, haste ? `with ${haste.name} ${haste.pct}%` : ''].filter(Boolean).join(' ');
  return {
    label: note ? `Target GCD (${note})` : 'Target GCD',
    off,
    top,
    fastest,
    haste,
  };
}

/* What Gear to search shows for the settings as they are now, before the next Optimize: {countText ("searching 1,939 of
   1,999 pieces"), emptyBoxes (the "Gear from" boxes with nothing for the job and the other filters, greyed out),
   gcdLabel (the Target GCD field's label, with the best meal when Food is on: one search for the most speed, kept in
   the session; 20 to 100 ms)}. */
export function gearToSearchView(job, sync, level, recipe, session) {
  const gear = session.gear(job);
  const count = searchCount(job, recipe, gear);
  return {
    countText: `searching ${fmtInt(count.searched)} of ${fmtInt(count.searched + count.left)} pieces`,
    emptyBoxes: emptyGearFrom(job, recipe, gear),
    gcdLabel: gcdControls(recipe, gcdRange(job, sync, level, recipe, session)).label,
  };
}

/* The line under the Target GCD box, short and plain (owner's request): why no set fits, or that the set came out
   faster than asked; null when the set meets the GCD (owner, 2026-10-19: no line giving the speed it needs). The
   fastest GCD the gear reaches is already in the range beside the box. `r`: the search's Target GCD facts
   (runRecipe's found.gcd); `ui`: gcdControls. */
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

/* A row's menu of pieces with the same result, or null when the shown piece is the only one: {count, countText,
   title, groups}. countText "1 of 3" is the row's button badge and title its hover text; groups by expansion, oldest
   first, each {label, items: [{key, name, ilvl, lvl, levels, category, on, exp}]} by equip level (key: the piece's
   gameId, what a pick sends back; levels: "640, lvl 90", item level and equip level; category: its gear category,
   {key, label}, or null for a piece not from the database; on: the piece the row shows; exp: its expansion's short
   name, which groups it). */
function sameMenu(options, shown) {
  if (options.length < 2) return null;
  const facts = c => {
    const lvl = equipLevel(c.item) ?? 0;
    return {
      key: c.item.gameId,
      name: c.item.name,
      ilvl: c.item.ilvl,
      lvl,
      levels: `${c.item.ilvl}, lvl ${lvl}`,
      category: categoryOf(c.item),
      on: c.item === shown,
      exp: expansionOf(lvl, c.item.ilvl),
    };
  };
  const items = options.map(facts).sort((a, b) => a.lvl - b.lvl || a.ilvl - b.ilvl);
  const groups = EXPANSIONS.map(({ short, name }) => ({ label: name, items: items.filter(x => x.exp === short) })).filter(
    g => g.items.length,
  );
  const count = options.length;
  return { count, countText: `1 of ${count}`, title: `${count} pieces give the same result here`, groups };
}

/* The Food row's menu (owner's design, 2026-10-18), from runRecipe's found.food (`meals`: {best, tagged, shown}) on the
   set's gear totals (`gearTotals`); `goal`: the recipe's target and tiebreaks, in order, empty ones dropped. Returns
   {count, groups, pills, preset}:
   - count: how many meals have the best's result. groups: every meal the job can use, by expansion, newest first:
     {label, items: [{key, name, ilvl, label, stats, adds, best, on}]}, label "Spell Speed + Direct Hit" (the row's hover
     text; the row shows what the meal adds instead), stats its neutral stats (for the pills), adds what it gives on
     this gear ("SpS +44 DHT +41 VIT +54"), best its result is the best's, on the row shows it. pills: the job's
     substats some meal has, {stat, short, label}.
   - preset: the pills the menu starts with, and goes back to when "Best for goal" is turned on (owner, 2026-10-18): the
     goal's substats in order (target, tiebreak 1, tiebreak 2), only those the newest meal tagged best for goal has, so
     the switch on with them always lists a meal, and two at most (a meal has two stats). From a tagged meal, not the
     one shown: a picked meal need not be tagged. */
function mealMenu(job, level, gearTotals, meals, goal) {
  const all = allMeals(job);
  const tagged = new Set(meals.tagged);
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
      on: m === meals.shown,
    };
  };
  // allMeals is oldest first: reversed, each expansion lists its newest meal first
  const items = all.map(item).reverse();
  const groups = [...EXPANSIONS]
    .reverse()
    .map(({ short, name }) => ({ label: name, items: items.filter(x => expansionOf(1, x.ilvl) === short) }))
    .filter(g => g.items.length);
  const pills = job.substats
    .filter(s => all.some(m => m.stats.some(x => x.stat === s)))
    .map(s => ({ stat: s, short: job.short[s], label: job.label[s] }));
  const bestStats = meals.tagged.at(-1).stats.map(x => x.stat);
  const preset = [...new Set(goal)].filter(k => pills.some(p => p.stat === k) && bestStats.includes(k)).slice(0, 2);
  return { count: tagged.size, groups, pills, preset };
}

/* The table's rows, one per slot in the character panel's order (evaluateSet's rows), with the goal's marks and each
   row's menu of pieces with the same result: an empty slot {label, item: null, blockedBy, emptyText}; a worn one
   {label, item (the search's pool item), meld, category, from, same (sameMenu), cells: [{value, gold, atCap}] in
   job.stats order}. */
function resultRows(job, recipe, set, found) {
  const scored = [recipe.target, recipe.tb, recipe.tb2].filter(Boolean);
  return set.rows.map((r, i) => {
    const pick = found.picks[i];
    // an empty slot: covered by a piece in another slot, or no copy of a Unique piece left
    if (!r.item) {
      return {
        label: r.label,
        item: null,
        blockedBy: r.blockedBy,
        emptyText: r.blockedBy ? `covered by ${r.blockedBy}` : 'empty (no copy left)',
      };
    }
    return {
      label: r.label,
      item: pick.item,
      meld: r.meldText,
      // where the piece comes from: its gear category ({key, label}), and "HW · lvl 60" (both null for a piece not
      // from the database)
      category: r.category,
      from: r.from,
      // the other pieces with the same result, for the row's menu (null when there are none)
      same: sameMenu(found.options[i], pick.item),
      // atCap: a target or tiebreak stat at the most this piece can have (its sync cap, or its own cap with melds)
      cells: job.stats.map(s => {
        const value = r.stats[s] || 0;
        return { value, gold: s === recipe.target && !!value, atCap: scored.includes(s) && !!value && value >= r.caps[s] };
      }),
    };
  });
}

/* The Effect and Tier rows: per stat (job.stats order) {effect, spare, toNext, text, title, zero, held}, or null for a
   stat with no tiers; held: a key tier ranking holds (it keeps its tier whatever the later keys do). */
function tierCells(job, set, held) {
  const heldStats = new Set(held.map(h => h.stat));
  return set.tiers.map((tier, k) => {
    if (!tier) return null;
    const isHeld = heldStats.has(job.stats[k]);
    return {
      effect: tier.effect,
      spare: tier.spare,
      toNext: tier.toNext,
      // the Tier row's cell ("3 · +16", "0 · –" at the last tier) and its hover text when tier ranking holds it
      text: `${tier.spare} · ${tier.toNext == null ? '–' : `+${tier.toNext}`}`,
      title: isHeld ? 'Held at this tier by Spare points to tiebreaks' : null,
      zero: tier.zero,
      held: isHeld,
    };
  });
}

/* The optimizer's result for `recipe` (see the module comment), with the player's `choices` on the last result
   ({pieces: {row index: gameId}, meal: an allMeals key or null}: runRecipe; not saved). The optimizer can throw (e.g.
   stat totals too large to rank exactly); the page then shows the message ({kind: 'error', message}) instead of
   keeping a stale result. Otherwise {kind: runRecipe's status, gcdUi (gcdControls), ...}: the failure kinds carry
   truncated and, with a Target GCD, gcdLine; 'ok' the whole result (buildOkView). */
export function optimizerView(job, sync, level, recipe, session, choices = {}) {
  try {
    return buildOptimizerView(job, sync, level, recipe, session, choices);
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}

function buildOptimizerView(job, sync, level, recipe, session, choices) {
  // 1. the solve (core/recipe.js), then the Target GCD box's state for the meal it searched with
  const run = runRecipe(job, sync, level, recipe, session, choices);
  if (run.status === 'excluded') return { kind: 'excluded' };
  const ui = gcdControls(recipe, gcdRange(job, sync, level, recipe, session, pickedMeal(job, recipe, choices.meal)));
  const line = run.found.gcd ? gcdLine(job, run.found.gcd, ui) : undefined;
  if (run.status !== 'ok') {
    return { kind: run.status, gcdUi: ui, ...(line !== undefined ? { gcdLine: line } : {}), truncated: run.found.truncated };
  }
  // 2. the set, evaluated, and everything the template shows
  return buildOkView(job, level, recipe, run, evaluateSet(job, run.set, sync, level), ui, line);
}

/* An 'ok' result: the readout, the rows, the Food row and the totals with it, the Effect, Tier and Defense rows and
   the notes. `run`: runRecipe's result; `set`: its set evaluated; `ui`: gcdControls; `line`: gcdLine, or undefined
   without a Target GCD. */
function buildOkView(job, level, recipe, run, set, ui, line) {
  const { found } = run;
  const pct = ui.haste?.pct ?? 0;
  const bonus = set.bonus,
    gearTotals = set.gear,
    spd = set.gcd.spd;
  const meals = found.food;

  // 1. the character panel's numbers: every stat with the character's base added (set.base)
  const base = s => set.base[s],
    panel = s => set.withFood[s] + base(s);

  // 2. the set's defense after sync and the share of damage it removes at this level (shown, never ranked)
  const { phys, mag, physPct, magPct } = set.defense;
  const defense = {
    phys,
    mag,
    physPct,
    magPct,
    physText: fmtInt(phys),
    magText: fmtInt(mag),
    takenText: `−${physPct}% / −${magPct}% damage taken`,
  };

  // 3. the readout's texts
  const rows = resultRows(job, recipe, set, found);
  const gcd = set.gcd.gcd.toFixed(2),
    dot = set.gcd.dot.toFixed(1);
  // hasted jobs: the haste and the GCD without it (owner's decision 2026-10-16: both, labelled)
  const hasteText = ui.haste ? ` (${ui.haste.name} ${pct}%; ${set.gcd.unhasted.toFixed(2)} without)` : '';
  const spdText = `${panel('spd')} ${job.label.spd} (${base('spd')} base, ${gearTotals.spd} gear${bonus.spd ? `, ${bonus.spd.bonus} food` : ''})`;
  const speedTier = tierText(spd, level, pct);
  const byTier = recipe.byTier !== false;
  return {
    kind: 'ok',
    gcdUi: ui,
    gcdLine: line ?? null,
    headers: job.stats.map(s => job.short[s]),
    // each column's stat key (job.stats order): the cells' data-col, which the column highlight reads
    cols: [...job.stats],
    target: recipe.target,
    targetLabel: job.label[recipe.target],
    spdLabel: job.label.spd,
    total: panel(recipe.target),
    totalLabel: `${job.label[recipe.target]} (${[base(recipe.target) && 'base', 'gear', bonus[recipe.target] && 'food'].filter(Boolean).join(' + ')}${found.synced ? ', synced' : ''})`,
    totals: job.stats.map(s => gearTotals[s] + base(s)),
    // some cell has the cap bar: the key above the table shows
    anyAtCap: rows.some(r => (r.cells || []).some(c => c.atCap)),
    // the Food row and the totals with it; null with Food off. best: the meal has the best's result; picked: the player
    // picked it from the menu ({count, groups, pills, preset}: mealMenu)
    food: meals && {
      name: meals.shown.name,
      ilvl: meals.shown.ilvl,
      label: foodLabel(job, meals.shown),
      best: meals.tagged.includes(meals.shown),
      picked: meals.picked,
      menu: mealMenu(job, level, gearTotals, meals, [recipe.target, recipe.tb, recipe.tb2].filter(Boolean)),
      // the line under the meal's name
      note: meals.tagged.includes(meals.shown) ? 'HQ, best for goal' : 'HQ, picked',
      cells: job.stats.map(s => (bonus[s] ? { value: bonus[s].bonus, capped: bonus[s].capped } : null)),
      totals: job.stats.map(panel),
    },
    tiers: tierCells(job, set, found.held),
    // what the Effect and Tier rows count
    effectNote: meals ? 'gear and food' : 'gear only, no food',
    // true when the goal and tiebreaks were ranked by tier first (the "Spare points to tiebreaks" switch)
    byTier,
    synced: found.synced,
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
    truncated: found.truncated,
    melded: set.melded,
    // {phys, mag, physPct, magPct, physText, magText, takenText}: the Defense row
    defense,
    // the note under the table: the clan's bonus is left out of the main stat and Vitality (statBase)
    clanNote: `Clan bonuses can affect ${job.short.main} and ${job.short.vit}.`,
    // the note that weapon damage is ranked first; false for a job that does not rank it (Blue Mage)
    weaponFirst: !!job.damageKey,
    // relics with player-allocated substats left out of the search (recipePool), for the note; 0 hides it
    relicsLeftOut: found.relicsLeftOut,
  };
}

/* The Food menu's meals ({stats, name, best} items of mealMenu's groups) that pass its filters: `filters` is {stats
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

/* The line a same-result menu shows when its search (`query`) leaves no piece. */
export function sameEmptyText(query) {
  return `No piece matches "${query.trim()}".`;
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
