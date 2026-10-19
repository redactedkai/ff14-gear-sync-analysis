/* Target GCD: the best loadout whose GCD is exactly a given value ('exact', as xivgear's meld solver) or that value or
   faster ('min'), counted with food and with the job's always-on haste (hasteFor: Monk, Ninja, Samurai, Viper; short
   buffs are not counted, owner's decision 2026-10-15). Within that, loadouts rank by target and tiebreaks as usual.
   - The GCD target becomes a speed minimum, or a band, on total speed (speedForGcd).
   - Food raises speed by min(max, floor(pct x (base + gear) / 100)), which never falls as gear speed rises, so each meal
     turns that into a minimum (or band) on gear speed (gearNeeded). Food is no longer picked after the search: the meal
     changes which gear fits. Every meal that asks for the same gear speed shares one search, on candidates built once
     (prepare), so only the search repeats.
   - Among meals the winner has the highest totals with food on weapon damage (ranked first, rankedKeys), the target and
     tiebreaks, then the most food points, then the first in the job's food choices (pickMeal in food.js, as bestFood). */
import { gearNeeded, mealsFor, mealTotals, pickMeal } from './food.js';
import { prepare, solve } from './optimizer/index.js';
import { rankedKeys } from './optimizer/candidates.js';
import { BASE_GCD_MS, gcdFor, hasteFor, speedForGcd } from './speed.js';

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync, level} as for optimize
 * @param opts  {target='main', tiebreak=[], melds=false, nodeLimit, gcd (seconds), mode: 'exact' | 'min',
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
  // meals rank by the totals with food in the search's order, weapon damage first (keys): meals give different speed
  // bands, so their best sets can differ in it
  const { level, haste, hastePct: pct, target, tiebreak, keys } = goalSettings(job, sync, opts);
  const mode = opts.mode === 'min' ? 'min' : 'exact';
  const base = { asked: opts.gcd, mode, haste, level };
  const band = speedForGcd(opts.gcd, level, mode, pct);
  if (!band) return { ok: false, reason: 'unreachable', ...base, fastest: fastestGcd(job, pool, sync, { ...opts, level }) };

  const meals = mealsFor(job, opts.food);
  prep = prep || prepare(job, pool, sync, { target, tiebreak, melds: opts.melds, speed: mode });
  const runs = new Map(); // "gear min,gear max" -> solve result
  const entries = []; // {meal, totals, r, band} per meal with a loadout, for pickMeal
  for (const meal of meals) {
    const gear = gearBand(job, meal, band, level);
    if (!gear) continue;
    const { gearMin, gearMax } = gear;
    const key = `${gearMin},${gearMax}`;
    if (!runs.has(key)) runs.set(key, solve(prep, { spdMin: gearMin, spdMax: gearMax, nodeLimit: opts.nodeLimit }));
    const r = runs.get(key);
    if (r.ok) entries.push({ meal, totals: r.totals, r, band: { gearMin, gearMax } });
  }
  const best = pickMeal(job, entries, keys, level);
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
  const food = foodFields(best, level, pct);
  return {
    ...best.entry.r,
    ok: true,
    ...base,
    truncated,
    nodes,
    ...food,
    faster: food.gcd < opts.gcd,
    band: { min: band.min, max: band.max, ...best.entry.band },
    searches: runs.size,
    prep,
  };
}

/* The settings Target GCD and tier ranking read from their `opts` ({level, target, tiebreak}, as for optimizeGcd), with
   the same defaults: {level, haste, hastePct, target, tiebreak, keys}. level: opts.level, else the synced level, else
   the job's level cap; haste: the job's always-on haste there (hasteFor, null for none), hastePct its percent (0 for
   none); target: the goal ('main' when unset); tiebreak: the tiebreaks set; keys: the keys a search ranks, weapon
   damage first when the job ranks it (rankedKeys). */
export function goalSettings(job, sync, opts) {
  const level = opts.level ?? sync.level ?? job.maxLevel;
  const haste = hasteFor(job.jobId, level);
  const target = opts.target || 'main';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  return { level, haste, hastePct: haste ? haste.pct : 0, target, tiebreak, keys: rankedKeys(job, target, tiebreak) };
}

/* The food part of a Target GCD or tier ranking result, from the meal pickMeal chose (`best`, its entry's meal null for
   none): {food, bonus, withFood, gcd}, gcd the GCD with food and the haste `hastePct` at `level`. */
export function foodFields(best, level, hastePct) {
  const gcd = gcdFor(best.withFood.spd || 0, level, BASE_GCD_MS, hastePct);
  return { food: best.entry.meal, bonus: best.bonus, withFood: best.withFood, gcd };
}

/* A band on total speed ({min, max}; max null for none, speedForGcd) as a band on gear speed with `meal` (null for
   none) at `level`: {gearMin, gearMax}, or null when the meal jumps over the band (no gear speed lands in it). The most
   gear speed is one below the fewest whose total reaches band.max + 1. Shared by Target GCD and tier ranking. */
export function gearBand(job, meal, band, level) {
  const gearMin = gearNeeded(job, meal, 'spd', band.min, level);
  const gearMax = band.max == null ? null : gearNeeded(job, meal, 'spd', band.max + 1, level) - 1;
  if (gearMax != null && gearMax < gearMin) return null;
  return { gearMin, gearMax };
}

/* The shortest GCD the pool can reach: the most speed, with the meal that adds the most speed when food is on (the
   loadout with the most gear speed also has the most with any speed meal, since gear + food rises with gear), with the
   job's haste. The most speed at any weapon damage (weaponFirst off): a search for a faster GCD may take a weapon with
   less. opts = {melds, food, nodeLimit, level} as for optimizeGcd. Null when the pool has no loadout. */
export function fastestGcd(job, pool, sync, opts) {
  const { level, hastePct: pct } = goalSettings(job, sync, opts);
  const r = solve(prepare(job, pool, sync, { target: 'spd', melds: opts.melds, weaponFirst: false }), { nodeLimit: opts.nodeLimit });
  if (!r.ok) return null;
  const meals = mealsFor(job, opts.food);
  let spd = r.totals.spd || 0;
  for (const meal of meals) spd = Math.max(spd, mealTotals(job, meal, r.totals, level).withFood.spd || 0);
  return gcdFor(spd, level, BASE_GCD_MS, pct);
}
