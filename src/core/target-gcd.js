/* Target GCD: the best loadout whose GCD is exactly a given value ('exact', as xivgear's meld solver) or that value or
   faster ('min'), counted with food and with the job's always-on haste (hasteFor: Monk, Ninja, Samurai, Viper; short
   buffs are not counted, owner's decision 2026-10-15). Within that, loadouts rank by target and tiebreaks as usual.
   - The GCD target becomes a speed minimum, or a band, on total speed (speedForGcd).
   - Food raises speed by min(max, floor(pct x (base + gear) / 100)), which never falls as gear speed rises, so each meal
     turns that into a minimum (or band) on gear speed (gearNeeded). Food is no longer picked after the search: the meal
     changes which gear fits. Every meal that asks for the same gear speed shares one search, on candidates built once
     (prepare), so only the search repeats.
   - Among meals the winner has the highest totals with food on the target and tiebreaks, then the most food points,
     then the first in the job's food choices (bestFood's order). */
import { betterRank, foodBonus, gearNeeded, mealRank, mealsFor, withFood } from './food.js';
import { prepare, solve } from './optimizer/index.js';
import { BASE_GCD_MS, gcdFor, hasteFor, speedForGcd } from './speed.js';

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level} as for optimize
 * @param opts  {target, tiebreak=[], melds=false, nodeLimit, gcd (seconds), mode: 'exact' | 'min',
 *              food: null (no food) | a foodChoices entry | 'best' (every choice of the job), level (for haste, food and
 *              the GCD; default sync.level, else the job's level cap)}
 * @param prep  optional candidates from an earlier call with the same pool, sync, objective, melds and mode (returned
 *              as `prep`), so a new GCD or meal only reruns the search
 * @returns {ok, reason?, ...solve result, food, bonus, withFood, gcd, asked, mode, haste, band, faster, nodes, searches, prep}:
 *          nodes counts every meal band's search (searches of them), not only the winner's;
 *          gcd is the result's GCD (with food and haste), faster is true when it beats the asked value ('min' mode only);
 *          band = {min, max} on total speed; reason 'unreachable' when no speed gives the asked GCD at all ('exact' mode, slower
 *          than the GCD with no speed), 'none' when no loadout meets it; fastest is then the
 *          shortest GCD the pool can reach (with the best speed meal when food is on)
 */
export function optimizeGcd(job, pool, sync, opts, prep = null) {
  const level = opts.level ?? sync.level ?? job.maxLevel;
  const mode = opts.mode === 'min' ? 'min' : 'exact';
  const haste = hasteFor(job.jobId, level);
  const pct = haste ? haste.pct : 0;
  const target = opts.target || 'spd';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  const keys = [target, ...tiebreak];
  const base = { asked: opts.gcd, mode, haste, level };
  const band = speedForGcd(opts.gcd, level, mode, pct);
  if (!band) return { ok: false, reason: 'unreachable', ...base, fastest: fastestGcd(job, pool, sync, { ...opts, level }) };

  const meals = mealsFor(job, opts.food);
  prep = prep || prepare(job, pool, sync, { target, tiebreak, melds: opts.melds, speed: mode });
  const runs = new Map(); // "gear min,gear max" -> solve result
  let best = null,
    bestRank = null;
  for (const meal of meals) {
    // the band on total speed as a band on gear speed with this meal; the most gear speed is one below the fewest
    // whose total reaches band.max + 1
    const gearMin = gearNeeded(job, meal, 'spd', band.min, level);
    const gearMax = band.max == null ? null : gearNeeded(job, meal, 'spd', band.max + 1, level) - 1;
    if (gearMax != null && gearMax < gearMin) continue; // the meal jumps over the band: no gear speed lands in it
    const key = `${gearMin},${gearMax}`;
    if (!runs.has(key)) runs.set(key, solve(prep, { spdMin: gearMin, spdMax: gearMax, nodeLimit: opts.nodeLimit }));
    const r = runs.get(key);
    if (!r.ok) continue;
    const bonus = meal ? foodBonus(job, meal, r.totals, level) : {};
    const t = withFood(r.totals, bonus);
    const rank = mealRank(keys, t, bonus);
    if (betterRank(rank, bestRank)) {
      best = { r, meal, bonus, t, band: { gearMin, gearMax } };
      bestRank = rank;
    }
  }
  const truncated = [...runs.values()].some(r => r.truncated);
  // every meal band's search, not only the winner's
  const nodes = [...runs.values()].reduce((n, r) => n + (r.nodes || 0), 0);
  if (!best) {
    return {
      ok: false,
      reason: 'none',
      ...base,
      truncated,
      nodes,
      searches: runs.size,
      prep,
      fastest: fastestGcd(job, pool, sync, { ...opts, level }),
    };
  }
  const gcd = gcdFor(best.t.spd || 0, level, BASE_GCD_MS, pct);
  return {
    ...best.r,
    ok: true,
    ...base,
    truncated,
    nodes,
    food: best.meal,
    bonus: best.bonus,
    withFood: best.t,
    gcd,
    faster: gcd < opts.gcd,
    band: { min: band.min, max: band.max, ...best.band },
    searches: runs.size,
    prep,
  };
}

/* The shortest GCD the pool can reach: the most speed, with the meal that adds the most speed when food is on (the
   loadout with the most gear speed also has the most with any speed meal, since gear + food rises with gear), with the
   job's haste. opts = {melds, food, nodeLimit, level} as for optimizeGcd. Null when the pool has no loadout. */
export function fastestGcd(job, pool, sync, opts) {
  const level = opts.level ?? sync.level ?? job.maxLevel;
  const pct = hasteFor(job.jobId, level)?.pct ?? 0;
  const r = solve(prepare(job, pool, sync, { target: 'spd', melds: opts.melds }), { nodeLimit: opts.nodeLimit });
  if (!r.ok) return null;
  const meals = mealsFor(job, opts.food);
  let spd = r.totals.spd || 0;
  for (const m of meals) if (m) spd = Math.max(spd, withFood(r.totals, foodBonus(job, m, r.totals, level)).spd || 0);
  return gcdFor(spd, level, BASE_GCD_MS, pct);
}
