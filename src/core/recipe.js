/* A recipe and its solve (audit 16, R2): what to look for, and the set that answers it. The optimizer tab solves one
   recipe at a time; the planned sheet of sets will keep one per set (roadmap.md, the sheet), so the solve takes the
   recipe and a solver session (session.js) as plain inputs, never the page's store.

   A recipe: the optimizer's settings as the page holds them (ui/state.js defaultState().opt):
     target, tb, tb2   the goal: a neutral stat to maximize, then up to two tiebreaks ('' for none)
     expOff, exclude, market, min, max, lvl
                       the filters under Gear to search: expansions switched off, "Gear from" boxes left out
                       (ACTIVITIES keys), the market board switch, the item level range and the equip level ('' for no
                       limit; gearFilter in items.js)
     melds             give pieces their best materia melds
     food              add the meal for the goal (a picked meal in its place, runRecipe's `choices`)
     gcd, gcdMode      the Target GCD in seconds ('' for any; askedGcd), 'exact' or 'min' (that or faster)
     byTier            rank the goal and tiebreaks by tier first (tier-rank.js)
   Job, sync and level are not part of a recipe: like evaluateSet (set.js), the solve takes them, as a sheet will hold
   them for all its sets. */
import { allMeals, bestFood, foodChoices } from './food.js';
import { allocatedRelic, emptyActivities, filterGear, gearFilter, itemRoutes, wearable, withActivities } from './items.js';
import { buildCandidates, optimize } from './optimizer/index.js';
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

/* `gear` (pool items) through the recipe's filters under Gear to search: Gear from and the market board, then the
   expansions, item level range and equip level. */
function filtered(recipe, gear) {
  return filterGear(withActivities(gear, recipe.exclude || [], recipe.market !== false), gearFilter(recipe));
}

/* The pool a recipe searches, from `gear` (a session's gear for `job`): the pieces that pass its filters, minus any
   piece above the job's level cap (jobGear has none; this guards gear passed in) and the relics whose substats the
   player allocates (allocatedRelic in items.js; relicsLeftOut counts them). */
export function recipePool(job, recipe, gear) {
  return filtered(recipe, gear).filter(i => wearable(job, i) && !allocatedRelic(job, i));
}

/* How many relics with player-allocated substats (allocatedRelic) pass the recipe's filters but are left out of the
   search, for the result's note. */
export function relicsLeftOut(job, recipe, gear) {
  return filtered(recipe, gear).filter(i => wearable(job, i) && allocatedRelic(job, i)).length;
}

/* The "Gear from" boxes with nothing for the job under the recipe's other filters (emptyActivities): the menu greys
   them out. */
export function emptyGearFrom(job, recipe, gear) {
  const pool = filterGear(gear, gearFilter(recipe)).filter(i => wearable(job, i) && !allocatedRelic(job, i));
  return emptyActivities(pool.map(itemRoutes).filter(Boolean));
}

/* The Target GCD asked for, in seconds, or null for none: the box is empty, or the goal is speed itself (the box is
   disabled then: maximizing speed already gives the fastest GCD). */
export function askedGcd(recipe) {
  if (recipe.target === 'spd' || recipe.gcd === '' || recipe.gcd == null) return null;
  const g = Number(recipe.gcd);
  return Number.isFinite(g) && g > 0 ? Math.round(g * 100) / 100 : null;
}

/* The meal the player picked (`mealKey`, an allMeals key, or null) as its allMeals entry, or null: with Food off, or a
   key no meal of the job has, there is none. */
export function pickedMeal(job, recipe, mealKey) {
  return (recipe.food && mealKey && allMeals(job).find(m => m.key === mealKey)) || null;
}

/* The meal Target GCD and tier ranking search with: none with Food off, the player's pick (`picked`, an allMeals
   entry), or every choice ('best'). */
function searchMeal(recipe, picked) {
  if (!recipe.food) return null;
  return picked ?? 'best';
}

/* The recipe fields each kind of session entry depends on (session.js). Every kind depends on the pool: the job, sync,
   level and the filters under Gear to search, with materia on or off (the candidates' melds). */
const POOL_FIELDS = Object.freeze(['exclude', 'market', 'expOff', 'min', 'max', 'lvl', 'melds']);
const KEY_FIELDS = Object.freeze({
  // tier ranking keys its own lists inside by objective, limits and GCD mode, so a new goal or GCD reuses them
  tier: POOL_FIELDS,
  // the fastest GCD: the pool, and the meal (recipeKey's `extra`)
  fast: POOL_FIELDS,
  // Target GCD's candidates: the pool, the goal and the mode, never the GCD itself
  prep: [...POOL_FIELDS, 'target', 'tb', 'tb2', 'gcdMode'],
  // the menus' candidates: the pool and the goal, and the speed mode while a GCD is asked (recipeKey's `extra`)
  same: [...POOL_FIELDS, 'target', 'tb', 'tb2'],
});

/* The one key of a session entry of `kind` (KEY_FIELDS) for a recipe solved for `job` under `sync` at `level`, with
   `extra` for what the recipe alone does not say (the meal, the speed mode in use). Two solves share an entry exactly
   when every field the kind depends on is the same. */
export function recipeKey(kind, job, sync, level, recipe, extra = null) {
  return JSON.stringify([kind, job.jobId, sync, level, KEY_FIELDS[kind].map(f => recipe[f] ?? null), extra]);
}

/* The Target GCD box's range for a recipe: {top (the GCD with no speed from gear, with the job's haste), fastest (the
   shortest the pool reaches with its best melds, and the meal: `meal`, an allMeals entry picked, else the best when
   Food is on; null when no set exists), haste (hasteFor, or null)}. The fastest is one search for the most speed,
   kept in the session (20 to 100 ms). */
export function gcdRange(job, sync, level, recipe, session, meal = null) {
  const haste = hasteFor(job.jobId, level);
  const top = gcdFor(0, level, BASE_GCD_MS, haste?.pct ?? 0);
  const food = searchMeal(recipe, meal);
  const fastest = session.memo('fast', recipeKey('fast', job, sync, level, recipe, food?.key ?? food), () =>
    fastestGcd(job, recipePool(job, recipe, session.gear(job)), sync, {
      melds: !!recipe.melds,
      food,
      nodeLimit: NODE_LIMIT,
      level,
    }),
  );
  return { top, fastest, haste };
}

/* The search part of a Target GCD result, for the line under its box: {ok, reason, asked, mode, faster, gcd}
   (optimizeGcd, rankByTier). */
const gcdFacts = r => ({ ok: r.ok, reason: r.reason, asked: r.asked, mode: r.mode, faster: r.faster, gcd: r.gcd });

/* A recipe's copy, frozen with its lists, for the record. */
const frozenRecipe = recipe =>
  Object.freeze(Object.fromEntries(Object.entries(recipe).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze([...v]) : v])));

/* Solve `recipe` for `job` (a JobContext) under `sync` ({cap, sync, level}, as for itemSyncIlvl) at character level
   `level`, with `session`'s gear and caches. `choices`: what the player picked on the last result, set data, not saved:
   {pieces: {row index: gameId} from the rows' menus of pieces with the same result, meal: an allMeals key from the
   Food row's menu, or null for the best for the goal}. A picked meal is searched with in place of the best (with tier
   ranking or a Target GCD it can change which gear wins).

   Returns {status, set, record, found}:
   - status: 'ok'; 'excluded' (no piece passes the filters); 'noset' (no set at all); 'nogcd' (none at the Target
     GCD); 'infeasible' (the search stopped at its node limit before finding one).
   - set: the set the result shows (set.js makeSet; null unless ok): each row the player's pick where it still gives
     the same result, else the easiest piece that does (sameResult); the meal the Food row shows, the pick, else the
     highest item level meal with the best's result (sameMeals; owner, 2026-10-18), or none with Food off.
   - record: how the set was made, frozen: {job (its id), sync, level, recipe (a copy: the goal as asked, whatever the
     player picks later)}.
   - found: what the search found beyond the set, for the result's display: {truncated, gcd (gcdFacts, or null without
     a Target GCD)} and, when ok, {picks (the rows' pieces as the search's pool items: {type, item, eff, meld}), options
     (per row, every candidate with the same result, sameResult), held (the stats tier ranking holds at their tier,
     [{stat}], or [] without it), synced (sync changes some piece of the pool), relicsLeftOut, food (null with Food
     off, else {searched: the meal the search counted, best: the best meal for the goal on this gear, tagged: the meals
     with the best's result (allMeals order), shown: the meal the set has, picked: true when the player picked it})}. */
export function runRecipe(job, sync, level, recipe, session, choices = {}) {
  const record = Object.freeze({ job: job.jobId, sync: Object.freeze({ ...sync }), level, recipe: frozenRecipe(recipe) });
  const fail = (status, r = null, asked = null) =>
    Object.freeze({ status, set: null, record, found: { truncated: r?.truncated, gcd: r && asked != null ? gcdFacts(r) : null } });

  // 1. the gear to search, the meal the player picked and the Target GCD asked for
  const gear = session.gear(job);
  const pool = recipePool(job, recipe, gear);
  if (!pool.length) return fail('excluded');
  const picked = pickedMeal(job, recipe, choices.meal);
  const hastePct = hasteFor(job.jobId, level)?.pct ?? 0;
  const asked = askedGcd(recipe);
  const goal = { target: recipe.target, tiebreak: [recipe.tb, recipe.tb2], melds: !!recipe.melds };
  const failed = r => fail(r.truncated ? 'infeasible' : asked != null ? 'nogcd' : 'noset', r, asked);

  // 2. the search. By tier: the tiers of the goal and tiebreaks first, counted with food, so meal and gear are chosen
  // together (rankByTier). Otherwise, with a Target GCD, gear and meal are chosen together (optimizeGcd); without
  // one, the gear first and the meal after (it never changes which gear wins)
  let res, food;
  const byTier = recipe.byTier !== false;
  if (byTier) {
    const lists = session.memo('tier', recipeKey('tier', job, sync, level, recipe), () => new Map());
    res = rankByTier(
      job,
      pool,
      sync,
      { ...goal, food: searchMeal(recipe, picked), nodeLimit: NODE_LIMIT, level, gcd: asked ?? undefined, mode: recipe.gcdMode },
      lists,
    );
    if (!res.ok) return failed(res);
    food = res.food;
  } else if (asked != null) {
    // the candidates depend on the pool, the goal and the mode, not on the GCD: reused while only it changes
    const key = recipeKey('prep', job, sync, level, recipe);
    res = optimizeGcd(
      job,
      pool,
      sync,
      { ...goal, mode: recipe.gcdMode, gcd: asked, food: searchMeal(recipe, picked), nodeLimit: NODE_LIMIT, level },
      session.get('prep', key) ?? null,
    );
    if (res.prep) session.set('prep', key, res.prep);
    if (!res.ok) return failed(res);
    food = res.food;
  } else {
    res = optimize(job, pool, sync, { ...goal, nodeLimit: NODE_LIMIT });
    if (!res.ok) return failed(res);
    food = recipe.food ? (picked ?? bestFood(job, foodChoices(job), res.totals, level, [recipe.target, recipe.tb, recipe.tb2])) : null;
  }

  // 3. the piece each row shows: the easiest piece with the same result, or the player's pick (same-result.js),
  // checked against every piece of the pool as a candidate for the goal, unpruned, with the melds the optimizer would
  // give it (meld versions under a Target GCD)
  const speedMode = asked != null ? recipe.gcdMode : '';
  const cands = session.memo('same', recipeKey('same', job, sync, level, recipe, speedMode), () => {
    const { slotList, posList } = buildCandidates(
      job,
      pool,
      sync,
      { target: recipe.target, tiebreak: [recipe.tb, recipe.tb2].filter(Boolean) },
      { prune: false, melds: !!recipe.melds, speed: speedMode || null },
    );
    return Object.fromEntries(slotList.map((t, i) => [t, posList[i]]));
  });
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
    meals = { searched: food, best, tagged, shown: picked ?? tagged.at(-1), picked: !!picked };
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
      relicsLeftOut: relicsLeftOut(job, recipe, gear),
      food: meals,
    },
  });
}
