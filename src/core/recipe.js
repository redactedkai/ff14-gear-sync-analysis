/* A recipe and its solve: what to look for, and the set that answers it. Each gear set of a sheet keeps its own Auto-fill
   settings, which make its recipe, so the solve takes the recipe and a solver session (session.js) as plain inputs,
   never the page's store.

   A recipe: a set's Auto-fill settings as one flat object (ui/sheets/fill-settings.js fillRecipe):
     target, tb, tb2   the goal: a stat key to maximize, then up to two tiebreaks ('' for none)
     expOff, exclude, market, min, max, lvl
                       the filters under Gear to search: expansions switched off, "Gear categories" boxes left out
                       (ACTIVITIES keys), the market board switch, the item level range and the equip level ('' for no
                       limit; gearFilter in items.js)
     melds             give pieces their best materia melds
     food              add the meal for the goal (a picked meal in its place, runRecipe's `choices`)
     gcd, gcdMode      the Target GCD in seconds ('' for any; askedGcd), 'exact' or 'min' (that or faster)
     byTier            rank the goal and tiebreaks by tier first (tier-rank.js)
   Job, sync and level are not part of a recipe: like evaluateSet (set.js), the solve takes them, as a sheet will hold
   them for all its sets.

   Pins are no part of a recipe either: they are the set's own pieces and meal that a solve must keep (runRecipe's
   `pins`; pinProblems). A set's pinned rows are pins, the other rows are what the solve fills. */
import { allMeals, bestFood, foodChoices } from './food.js';
import { activityCounts, allocatedRelic, filterGear, gearFilter, itemRoutes, poolItemById, wearable, withActivities } from './items.js';
import { buildCandidates, fixedCandidate, optimize, pinProblem } from './optimizer/index.js';
import { realSlotType } from './optimizer/slot-index.js';
import { itemSyncIlvl } from './piece.js';
import { sameMeals, sameResult } from './same-result.js';
import { evaluateSet, setFromPicks } from './set.js';
import { BASE_GCD_MS, gcdFor, hasteFor } from './speed.js';
import { fastestGcd, optimizeGcd } from './target-gcd.js';
import { rankByTier } from './tier-rank.js';

/* The page's search node budget: a search that visits more nodes stops, keeps the best set found so far and is marked
   truncated (the result's "node limit" note). Lower than the engine's own default (1,500,000), since the search holds
   the page's thread; a synthetic worst-case pool reached it in about 0.5 s, and real pools stay far below it
   (docs/engineering/optimizer.md section 5, Node limit). Each search of a solve has its own budget. */
export const NODE_LIMIT = 700000;

/* `gear` (pool items) through the recipe's filters under Gear to search: Gear categories and the market board, then the
   expansions, item level range and equip level. */
function filtered(recipe, gear) {
  return filterGear(withActivities(gear, recipe.exclude || [], recipe.market !== false), gearFilter(recipe));
}

/* The pool a recipe searches, from `gear` (a session's gear for `job`): the pieces that pass its filters, minus any
   piece above the job's level cap (jobGear has none; this guards gear passed in) and the relics whose substats the
   player allocates (allocatedRelic in items.js). */
export function recipePool(job, recipe, gear) {
  return filtered(recipe, gear).filter(i => wearable(job, i) && !allocatedRelic(job, i));
}

/* How many pieces each "Gear categories" box holds in the pool the recipe searches, {key: count} (activityCounts): the pool
   under the recipe's other filters (expansions, item level range, equip level), wearable by `job`, without the relics whose
   substats the player allocates. The boxes ticked and the market board switch are not applied, so the counts do not change
   when a box is ticked; a piece obtainable in two ways is in both boxes. The menu shows them, a box at 0 has nothing for the job
   and filters. */
export function gearFromCounts(job, recipe, gear) {
  const pool = filterGear(gear, gearFilter(recipe)).filter(i => wearable(job, i) && !allocatedRelic(job, i));
  return activityCounts(pool.map(itemRoutes).filter(Boolean));
}

/* The Target GCD asked for, in seconds, or null for none: the box is empty, or the goal is speed itself (the box is
   disabled then: maximizing speed already gives the fastest GCD). */
function askedGcd(job, recipe) {
  if (recipe.target === job.speedKey || recipe.gcd === '' || recipe.gcd == null) {
    return null;
  }
  const g = Number(recipe.gcd);
  return Number.isFinite(g) && g > 0 ? Math.round(g * 100) / 100 : null;
}

/* The meal the player picked (`mealKey`, an allMeals key, or null) as its allMeals entry, or null: with Food off, or a
   key no meal of the job has, there is none. */
function pickedMeal(job, recipe, mealKey) {
  return (recipe.food && mealKey && allMeals(job).find(m => m.key === mealKey)) || null;
}

/* Each game id's piece in `gear` (a session's gear for the job), kept per gear list. */
const gearIndexes = new WeakMap();
function gearById(gear) {
  if (!gearIndexes.has(gear)) {
    gearIndexes.set(gear, new Map(gear.map(item => [item.gameId, item])));
  }
  return gearIndexes.get(gear);
}

/* The pins a solve keeps, resolved for `job` under `sync`, with pieces taken from `gear` (the session's gear for the
   job, so a pinned piece is the very pool item the search would pick: its copies and Unique rings count alike).
   `pins` = {pieces, meal} or null:
     pieces  the set's pinned pieces as it saves them, [{slot, gameId, stones}] (set.js; a ring pinned in either ring row
             is one entry, the order does not matter)
     meal    the pinned meal's allMeals key, or null
   Returns {fixed (fixedCandidate per usable piece, for the optimizer's `fixed`), meal (the allMeals entry, or null),
   problems}. problems lists what a solve cannot keep, [{index (of the piece, or null for the meal), reason}]: 'missing'
   (no database piece has that game id), 'slot' (the piece does not go in that slot), 'wearable' (the job cannot wear
   it: not in `gear`), 'relic' (its substats are the player's to allocate, which the model leaves out), 'conflict' (pinned pieces that
   cannot be worn together: more than two rings, a Unique piece twice, or one covering another's slot), 'meal' (no such meal for the job). A
   piece with a problem is not in `fixed`. */
export function resolvePins(job, sync, pins, gear) {
  const fixed = [];
  const problems = [];
  const byId = gearById(gear);
  (pins?.pieces ?? []).forEach((piece, index) => {
    const item = byId.get(piece.gameId) ?? null;
    let reason = null;
    if (!item) {
      reason = poolItemById(job, piece.gameId) ? 'wearable' : 'missing';
    } else if (item.type !== piece.slot) {
      reason = 'slot';
    } else if (allocatedRelic(job, item)) {
      reason = 'relic';
    }
    if (reason) {
      problems.push({ index, reason });
    } else {
      fixed.push(fixedCandidate(job, item, piece.stones ?? [], sync));
    }
  });
  if (!problems.length && pinProblem(fixed)) {
    problems.push({ index: null, reason: 'conflict' });
  }
  const meal = pins?.meal ? (allMeals(job).find(m => m.key === pins.meal) ?? null) : null;
  if (pins?.meal && !meal) {
    problems.push({ index: null, reason: 'meal' });
  }
  return { fixed, meal, problems };
}

/* Whether `pins` (runRecipe's) keep anything: a piece or a meal. */
export function hasPins(pins) {
  return Boolean(pins?.pieces?.length || pins?.meal);
}

/* Whether a solve counts a meal: Food is on in the recipe, or a meal is pinned (`pinnedMeal`, resolvePins' meal: a
   pinned meal is the meal even with Food off). */
function usesFood(recipe, pinnedMeal) {
  return Boolean(recipe.food) || Boolean(pinnedMeal);
}

/* The meal Target GCD and tier ranking search with: none with Food off (`foodOn` false), the player's pick (`picked`, an
   allMeals entry), or every choice ('best'). */
function searchMeal(foodOn, picked) {
  if (!foodOn) {
    return null;
  }
  return picked ?? 'best';
}

/* The Target GCD box's range for a recipe: {top (the GCD with no speed from gear, with the job's haste), fastest (the
   shortest the pool reaches with its best melds, and the meal: `meal`, an allMeals entry picked, else the best when
   Food is on; null when no set exists), haste (hasteFor, or null)}. The fastest is one search for the most speed,
   run every time (20 to 100 ms). `pins` (as for runRecipe): the pinned pieces count, with their speed, and a
   pinned meal is the meal. */
export function gcdRange(job, sync, level, recipe, session, meal = null, pins = null) {
  const haste = hasteFor(job.jobId, level);
  const top = gcdFor(0, level, BASE_GCD_MS, haste?.pct ?? 0);
  const pinned = resolvePins(job, sync, pins, session.gear(job));
  const pinnedMeal = pinned.meal ?? meal;
  const food = searchMeal(usesFood(recipe, pinned.meal), pinnedMeal);
  const fastest = fastestGcd(job, recipePool(job, recipe, session.gear(job)), sync, {
    melds: Boolean(recipe.melds),
    food,
    nodeLimit: NODE_LIMIT,
    level,
    fixed: pinned.fixed,
  });
  return { top, fastest, haste };
}

/* The search part of a Target GCD result, for the line under its box: {ok, reason, asked, mode, faster, gcd}
   (optimizeGcd, rankByTier). */
const gcdFacts = r => ({ ok: r.ok, reason: r.reason, asked: r.asked, mode: r.mode, faster: r.faster, gcd: r.gcd });

/* A recipe's copy, frozen with its lists, for the record. */
const frozenRecipe = recipe =>
  Object.freeze(Object.fromEntries(Object.entries(recipe).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze([...v]) : v])));

/* Solve `recipe` for `job` (a JobContext) under `sync` ({cap, sync, level}, as for itemSyncIlvl) at character level
   `level`, with `session`'s gear. `choices`: what the player picked on the last result, set data, not saved:
   {pieces: {row index: gameId} from the rows' menus of pieces with the same result, meal: an allMeals key from the
   Food row's menu, or null for the best for the goal}. A picked meal is searched with in place of the best (with tier
   ranking or a Target GCD it can change which gear wins).
   `pins`: what the solve keeps, {pieces: [{slot, gameId, stones}] (the set's pinned pieces), meal: an allMeals key or
   null}, or null for none (resolvePins). A pinned piece is worn with exactly its stones, whatever the recipe's melds, and
   the search fills the other slots around it: its points count in the totals, the tiers and a Target GCD. Its row shows
   it and offers no other piece. It need not pass the recipe's filters. A pinned meal is the meal, searched with even
   when Food is off, and the Food row's menu does not change it. A pin the solve cannot keep (resolvePins' problems)
   gives status 'badpin' and nothing else.

   Returns {status, set, record, found}:
   - status: 'ok'; 'excluded' (no piece passes the filters); 'noset' (no set at all); 'nogcd' (none at the Target
     GCD); 'infeasible' (the search stopped at its node limit before finding one); 'badpin' (a pin cannot be kept:
     found.badPins).
   - set: the set the result shows (set.js makeSet; null unless ok): each row the player's pick where it still gives
     the same result, else the easiest piece that does (sameResult); the meal the Food row shows, the pick, else the
     highest item level meal with the best's result (sameMeals; owner), or none with Food off.
   - record: how the set was made, frozen: {job (its id), sync, level, recipe (a copy: the goal as asked, whatever the
     player picks later)} and, with pins, `pins` (a copy of them).
   - found: what the search found beyond the set, for the result's display: {truncated, gcd (gcdFacts, or null without
     a Target GCD), badPins (resolvePins' problems, [] unless status 'badpin')} and, when ok, {picks (the rows' pieces as
     the search's pool items: {type, item, eff, meld, pinned (true for a pinned piece; a pinned ring comes before the
     other)}), options
     (per row, every candidate with the same result, sameResult), held (the stats tier ranking holds at their tier,
     [{stat}], or [] without it), synced (sync changes some piece of the pool), food (null with Food
     off, else {searched: the meal the search counted, best: the best meal for the goal on this gear, tagged: the meals
     with the best's result (allMeals order), shown: the meal the set has, picked: true when the player picked it})}. */
export function runRecipe(job, sync, level, recipe, session, choices = {}, pins = null) {
  const pinned = resolvePins(job, sync, pins, session.gear(job));
  const record = Object.freeze({
    job: job.jobId,
    sync: Object.freeze({ ...sync }),
    level,
    recipe: frozenRecipe(recipe),
    ...(hasPins(pins)
      ? { pins: Object.freeze({ pieces: Object.freeze(pins.pieces.map(p => Object.freeze({ ...p }))), meal: pins.meal ?? null }) }
      : {}),
  });
  const fail = (status, r = null, askedValue = null) =>
    Object.freeze({
      status,
      set: null,
      record,
      found: {
        truncated: r?.truncated,
        gcd: r && askedValue != null ? gcdFacts(r) : null,
        badPins: status === 'badpin' ? pinned.problems : [],
      },
    });
  if (pinned.problems.length) {
    return fail('badpin');
  }

  // 1. the gear to search, the meal (pinned, else the player's pick) and the Target GCD asked for
  const gear = session.gear(job);
  const pool = recipePool(job, recipe, gear);
  if (!pool.length && !pinned.fixed.length) {
    return fail('excluded');
  }
  const picked = pinned.meal ?? pickedMeal(job, recipe, choices.meal);
  const foodOn = usesFood(recipe, pinned.meal);
  const fixed = pinned.fixed;
  const hastePct = hasteFor(job.jobId, level)?.pct ?? 0;
  const asked = askedGcd(job, recipe);
  const goal = { target: recipe.target, tiebreak: [recipe.tb, recipe.tb2], melds: Boolean(recipe.melds), fixed };
  const failed = r => {
    let status = 'noset';
    if (r.truncated) {
      status = 'infeasible';
    } else if (asked != null) {
      status = 'nogcd';
    }
    return fail(status, r, asked);
  };

  // 2. the search. By tier: the tiers of the goal and tiebreaks first, counted with food, so meal and gear are chosen
  // together (rankByTier). Otherwise, with a Target GCD, gear and meal are chosen together (optimizeGcd); without
  // one, the gear first and the meal after (it never changes which gear wins)
  let res, food;
  const byTier = recipe.byTier !== false;
  if (byTier) {
    res = rankByTier(job, pool, sync, {
      ...goal,
      food: searchMeal(foodOn, picked),
      nodeLimit: NODE_LIMIT,
      level,
      gcd: asked ?? undefined,
      mode: recipe.gcdMode,
    });
    if (!res.ok) {
      return failed(res);
    }
    food = res.food;
  } else if (asked != null) {
    res = optimizeGcd(job, pool, sync, {
      ...goal,
      mode: recipe.gcdMode,
      gcd: asked,
      food: searchMeal(foodOn, picked),
      nodeLimit: NODE_LIMIT,
      level,
    });
    if (!res.ok) {
      return failed(res);
    }
    food = res.food;
  } else {
    res = optimize(job, pool, sync, { ...goal, nodeLimit: NODE_LIMIT });
    if (!res.ok) {
      return failed(res);
    }
    food = foodOn ? (picked ?? bestFood(job, foodChoices(job), res.totals, level, [recipe.target, recipe.tb, recipe.tb2])) : null;
  }

  // 3. the piece each row shows: the easiest piece with the same result, or the player's pick (same-result.js),
  // checked against every piece of the pool as a candidate for the goal, unpruned, with the melds the optimizer would
  // give it (meld versions under a Target GCD)
  const speedMode = asked != null ? recipe.gcdMode : '';
  const { slotList, posList } = buildCandidates(
    job,
    pool,
    sync,
    { target: recipe.target, tiebreak: [recipe.tb, recipe.tb2].filter(Boolean) },
    {
      prune: false,
      melds: Boolean(recipe.melds),
      speed: speedMode || null,
      fixed,
    },
  );
  const cands = Object.fromEntries(slotList.map((t, i) => [realSlotType(t), posList[i]]));
  // the goal's points stay in both rankings: by tier, the points left over go to the goal (order A, owner's decision
  // 2026-10-16), so a swap that kept its tier with fewer points would show less than the search found
  const same = sameResult(job, res.picks, cands, { level, food, haste: hastePct, goal: recipe.target }, choices.pieces ?? {});
  const picks = same.map(r => r.pick);

  // 4. the meal the Food row shows, chosen on the gear's totals: the best for the goal on this gear (the search's own,
  // or with a pick the one the search would have taken), the meals with its result, and the pick or else the last of
  // those (allMeals is oldest first: the highest item level)
  let meals = null;
  if (food) {
    const gearTotals = evaluateSet(job, setFromPicks(picks), sync, level).gear;
    const keys = [recipe.target, recipe.tb, recipe.tb2].filter(Boolean);
    const all = allMeals(job);
    const best = picked ? bestFood(job, foodChoices(job), gearTotals, level, keys) : food;
    const tagged = sameMeals(job, gearTotals, best, all, { level, haste: hastePct, goal: recipe.target }, keys);
    meals = { searched: food, best, tagged, shown: picked ?? tagged.at(-1), picked: Boolean(picked) };
  }

  return Object.freeze({
    status: 'ok',
    set: setFromPicks(picks, meals ? meals.shown.key : null),
    record,
    found: {
      truncated: res.truncated,
      gcd: asked != null ? gcdFacts(res) : null,
      picks,
      options: same.map(r => r.options),
      held: byTier ? res.held : [],
      synced: sync.sync || pool.some(i => itemSyncIlvl(i, sync) != null),
      food: meals,
    },
  });
}
