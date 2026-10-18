/* Rank by tier (roadmap A7): the best loadout by the tiers of the target and tiebreaks, in that order, then by their
   raw totals (order A, owner 2026-10-16: leftover points go to the target). Tiers and totals count food; speed's tier is
   its GCD with the job's haste, Tenacity's its mitigation step, main stat and Vitality have none (every point counts;
   tiers.js rankTierOf). Spec: docs/scratchpad/a7-tier-ranking/spec.md.
   - One search per key, in order: maximize the key under the minimums so far, note the tier it reaches, then hold the
     key there through a minimum on its gear points (gearNeeded) for every later search. A key is held one point above
     its tier start (HOLD_MARGIN, owner 2026-10-16: a one-point model error should not drop the tier), or at the most
     reached when that is less. Every tier rises with points, so each search's best lands in the best tier left.
   - A last search maximizes the keys' raw totals under every minimum.
   - Meals: each meal runs the stages on its own; after each stage only the meals reaching the best tier go on (the
     others lose on that tier whatever follows), and meals asking for the same search share it. Among the meals left,
     the totals with food decide, then the most food points, then the first in the job's food choices (as bestFood).
   - With a Target GCD the meal's speed band holds in every search (gearBand, as optimizeGcd).
   - Each stage that finishes proves the most of its key under its limits; every later search of the meal gets that
     proof (solve's `proven`) and cuts by it (optimizer/regain.js). */
import { betterRank, foodBonus, gearNeeded, mealRank, mealsFor, withFood } from './food.js';
import { prepare, solve } from './optimizer/index.js';
import { BASE_GCD_MS, gcdFor, hasteFor, speedForGcd } from './speed.js';
import { fastestGcd, gearBand } from './target-gcd.js';
import { rankTierOf, tierStart } from './tiers.js';

/* Points a held key keeps above its tier start, when the loadouts reach that many. */
const HOLD_MARGIN = 1;

/* What a finished stage search `result` proves for a meal's `state` (rankByTier's): {stat, most, minStats, speed}, the
   most gear points of `stat` under the state's minimums and speed band (optimizer/regain.js). */
function provenMost(state, stat, result) {
  const speed = !state.gear ? null : state.gear.gearMax != null ? 'band' : 'min';
  return { stat, most: result.totals[stat] || 0, minStats: Object.keys(state.mins), speed };
}

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level} as for optimize
 * @param opts  {target, tiebreak=[], melds=false, nodeLimit, food: null | a foodChoices entry | 'best', level (default
 *              sync.level, else the job's level cap), gcd (seconds, optional: a Target GCD), mode: 'exact' | 'min'}
 * @param cache optional Map for candidate lists (prepare) from earlier calls with the same pool, sync, keys, melds and
 *              GCD mode; filled as it goes, so a new GCD or meal only reruns the searches
 * @returns {ok:false, reason: 'unreachable' (no speed gives the GCD) | 'none' (no loadout meets it), truncated, nodes,
 *          searches, fastest?} or {ok:true, ...solve result (picks, totals = gear points), food, bonus, withFood,
 *          held: [{stat, tier, hold}], gcd, faster, band, haste, truncated, nodes, searches}: held lists each key with its
 *          tier (rankTierOf's number, null for a key without tiers) and the total with food it is held at; gcd is the
 *          result's GCD with food and haste, faster is true when it beats the asked GCD ('min' mode only); band = {min,
 *          max} on total speed with a Target GCD (speedForGcd), else null
 */
export function rankByTier(job, pool, sync, opts, cache = new Map()) {
  const level = opts.level ?? sync.level ?? job.maxLevel;
  const haste = hasteFor(job.jobId, level);
  const pct = haste ? haste.pct : 0;
  const keys = [...new Set([opts.target || 'spd', ...(opts.tiebreak || [])].filter(Boolean))];
  const gcdMode = opts.gcd != null ? (opts.mode === 'min' ? 'min' : 'exact') : null;
  const base = { haste, level, asked: opts.gcd ?? null, mode: gcdMode };

  // 1. the Target GCD's band on total speed, if one is set
  let band = null;
  if (gcdMode) {
    band = speedForGcd(opts.gcd, level, gcdMode, pct);
    if (!band) return { ok: false, reason: 'unreachable', ...base, fastest: fastestGcd(job, pool, sync, { ...opts, level }) };
    base.band = band;
  }

  // 2. one state per meal: its gear speed band, the minimums (gear points) held so far and the maxima its stages proved
  let meals = [];
  for (const meal of mealsFor(job, opts.food)) {
    const gear = band ? gearBand(job, meal, band, level) : null;
    if (band && !gear) continue; // the meal jumps over the band
    meals.push({ meal, gear, mins: {}, held: [], last: null, proven: [] });
  }

  // every stage's meld versions on all the keys (and speed with a Target GCD), in one order: the stages share the meld
  // memo (prepare's versionKeys) and build each piece's versions once (versionCache)
  const versionKeys = gcdMode ? [...keys, 'spd'] : keys;
  const versionCache = new Map();

  // searches shared by meals asking the same, and candidate lists per objective and limited stats. Each search after
  // the first starts from the meal's last result (`seed`), which meets every limit so far: it only looks for a better
  // set, and when it stops early it still has one (White Mage at level 100, exactly 2.40, Piety > Determination >
  // Direct Hit: 700,000 nodes and no set found without it)
  const runs = new Map();
  let truncated = false,
    nodes = 0;
  const search = (state, target, tiebreak) => {
    const minStats = Object.keys(state.mins);
    const prepKey = `${target}|${tiebreak.join()}|${minStats.join()}|${gcdMode}|${!!opts.melds}`;
    if (!cache.has(prepKey)) {
      const prepOpts = { target, tiebreak, melds: opts.melds, speed: gcdMode, minStats, versionKeys, versionCache };
      cache.set(prepKey, prepare(job, pool, sync, prepOpts));
    }
    const limits = { spdMin: state.gear?.gearMin, spdMax: state.gear?.gearMax, mins: state.mins };
    const runKey = `${prepKey}|${JSON.stringify(limits)}|${JSON.stringify(state.proven)}`;
    if (!runs.has(runKey)) {
      const r = solve(cache.get(prepKey), { ...limits, seed: state.last?.picks, nodeLimit: opts.nodeLimit, proven: state.proven });
      truncated ||= !!r.truncated;
      nodes += r.nodes || 0;
      runs.set(runKey, r);
    }
    return runs.get(runKey);
  };
  // a search result's totals with the meal's food
  const withMeal = (state, r) => {
    const bonus = state.meal ? foodBonus(job, state.meal, r.totals, level) : {};
    return { bonus, totals: withFood(r.totals, bonus) };
  };
  const none = () => ({
    ok: false,
    reason: 'none',
    ...base,
    truncated,
    nodes,
    searches: runs.size,
    fastest: band ? fastestGcd(job, pool, sync, { ...opts, level }) : null,
  });

  // 3. one stage per key: the best tier each meal reaches, only the meals at the best one go on, each holding the key
  for (const stat of keys) {
    const tierOf = rankTierOf(job, stat, level, pct);
    const reached = [];
    for (const state of meals) {
      // the keys already held break ties: the most of `stat` is the same either way, but the search then tries the
      // sets strong in the held keys first and finds one meeting their minimums early (with Direct Hit alone the
      // order said nothing about the minimums: White Mage at level 100 ran 700,000 nodes and found none)
      const r = search(state, stat, keys.slice(0, keys.indexOf(stat)));
      if (!r.ok) continue;
      const most = withMeal(state, r).totals[stat] || 0;
      // a search that finished proves the most gear points of `stat` under its limits (its score ranks `stat` first):
      // a regain cut for every later search, whose limits include these (the same band, minimums that only rise). One
      // that stopped at its node limit proves nothing, and a wrong maximum would cut good loadouts
      const proven = r.truncated ? state.proven : [...state.proven, provenMost(state, stat, r)];
      reached.push({ state: { ...state, last: r, proven }, most, tier: tierOf ? tierOf(most) : most });
    }
    if (!reached.length) return none();
    const bestTier = Math.max(...reached.map(x => x.tier));
    meals = reached
      .filter(x => x.tier === bestTier)
      .map(({ state, most, tier }) => {
        // a key without tiers is held at the most reached: every point counts
        const hold = tierOf ? Math.min(tierStart(tierOf, most) + HOLD_MARGIN, most) : most;
        const gearMin = gearNeeded(job, state.meal, stat, hold, level);
        return {
          ...state,
          mins: { ...state.mins, [stat]: Math.max(state.mins[stat] || 0, gearMin) },
          held: [...state.held, { stat, tier: tierOf ? tier : null, hold }],
        };
      });
  }

  // 4. the raw totals under every minimum, per meal; the best meal by its totals with food, then its food points
  let best = null,
    bestRank = null;
  for (const state of meals) {
    const r = search(state, keys[0], keys.slice(1));
    if (!r.ok) continue;
    const { bonus, totals } = withMeal(state, r);
    const rank = mealRank(keys, totals, bonus);
    if (betterRank(rank, bestRank)) {
      best = { r, state, bonus, totals };
      bestRank = rank;
    }
  }
  if (!best) return none();
  const gcd = gcdFor(best.totals.spd || 0, level, BASE_GCD_MS, pct);
  return {
    ...best.r,
    ok: true,
    ...base,
    truncated,
    nodes,
    searches: runs.size,
    food: best.state.meal,
    bonus: best.bonus,
    withFood: best.totals,
    held: best.state.held,
    gcd,
    faster: gcdMode != null && gcd < opts.gcd,
    band,
  };
}
