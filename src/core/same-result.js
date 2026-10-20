/* Other pieces with the same result (roadmap A9): for each slot of an optimizer result, the pieces that could take its
   place without changing what the result does. Under sync many pieces reach the same caps, so a player can often wear
   an easier piece instead of the one the search happened to pick.

   "The same result" is the same main stat (it has no tiers: every point counts), the same weapon damage (ranked before
   the goal, owner's decision 2026-10-18: a menu never offers a weapon with less) and every substat at the same tier,
   counted with the result's meal: the points between two tiers do nothing, so they may differ. The tiers are the ones
   tier ranking uses (rankTierOf, roadmap A7): speed by its GCD alone, with the job's haste (its DoT/HoT tick scaling
   may drop a step: the GCD matters far more), and Tenacity by its mitigation step (200) alone (its damage bonus may
   drop a step: tanks take Tenacity for mitigation, and Critical Hit, Determination or Direct Hit do more for damage);
   owner's decisions 2026-10-16, as for tier ranking. When the search maximized the goal stat's raw points (the plain
   optimizer, not tier ranking), those points stay too (ctx.goal), so the result never shows less of it than the search
   found.
   Rows share their spare points: two swaps that are each fine alone can push a tier down together. So every check is
   made against the pieces the other rows show at that moment, never against the optimizer's set alone. */
import { WD_KEY } from './damage-defense.js';
import { foodBonus, withFood } from './food.js';
import { equipLevel, slotInfo } from './items.js';
import { vectorDims } from './optimizer/index.js';
import { rankTierOf } from './tiers.js';

/* What a set does, from gear totals ({neutral stat: points}, and weapon damage under WD_KEY) with the meal's bonus:
   {main, wd, goal, tiers}: its main stat; its weapon damage (null for a job that does not rank it); the goal stat's
   points if asked (else null); each substat's tier in job.substats order (rankTierOf; null for a stat without tiers).
   Two results are the same when sameOutcome says so. ctx = {level, food, haste, goal}: the synced level, the meal (a
   foodChoices entry) or null, the job's always-on haste in percent (hasteFor; 0 for none), and the neutral stat whose
   exact points must stay (the plain optimizer's goal), or null for tiers only (tier ranking). */
export function resultOf(job, gearTotals, { level, food, haste = 0, goal = null }) {
  const totals = withFood(gearTotals, food ? foodBonus(job, food, gearTotals, level) : {});
  return {
    main: totals.main || 0,
    wd: job.damageKey ? totals[WD_KEY] || 0 : null,
    goal: goal ? totals[goal] || 0 : null,
    tiers: job.substats.map(s => rankTierOf(job, s, level, haste)?.(totals[s] || 0) ?? null),
  };
}

/* True when two resultOf results (of the same job and ctx) are the same: equal in every field. */
export function sameOutcome(a, b) {
  return a.main === b.main && a.wd === b.wd && a.goal === b.goal && a.tiers.every((tier, i) => tier === b.tiers[i]);
}

/* The pieces each row can show without changing the result, and the piece it shows.
   picks: the optimizer's picks in panel order ({type, item, eff, meld}; item null for an empty slot).
   cands: {slot type: candidates} of the whole pool for the same goal, unpruned (buildCandidates with prune off): every
     piece with its synced stats and the melds the optimizer would give it, best score first; a piece can have several
     candidates (meld versions under a Target GCD).
   ctx: as for resultOf. chosen: {row index: gameId} of pieces the player picked from a row's menu (database pieces:
     the game's item id, architecture.md "Piece identity"; a piece not from the database cannot be picked).
   Returns one entry per row: {pick, options}. pick is what the row shows ({type, item, eff, meld}); options lists every
   piece that fits there, one candidate per piece (its best-scoring version that fits), the shown one included, or is
   empty for an empty slot.
   Each row shows, in panel order: the player's pick if it still fits, else the piece with the lowest equip level that
   fits (then the lowest item level; the optimizer's own pick on a tie), so the table starts from the easiest gear.
   A piece must leave the same slots empty as the optimizer's pick (a cloak never replaces a plain body), and a Unique
   piece can't be in two rows (rings). */
export function sameResult(job, picks, cands, ctx, chosen = {}) {
  const target = resultOf(job, sumOf(job, picks), ctx);
  const shown = picks.map(p => (p.item ? { type: p.type, item: p.item, eff: p.eff, meld: p.meld ?? null } : p));
  const blocksKey = blocks => [...blocks].sort().join();
  const pickBlocks = picks.map(p => (p.item ? blocksKey(slotInfo(job, p.item).blocks) : null));

  // the pieces that fit row i while the other rows show what they show now, one candidate per piece
  const fitting = i => {
    const p = picks[i];
    if (!p.item) return [];
    const others = shown.filter((_, j) => j !== i);
    const rest = sumOf(job, others);
    // the main stat has no tiers and food never raises it: a piece must bring exactly what the set is missing (a
    // cheap first check that rules out most of the pool)
    const mainNeeded = target.main - rest.main;
    const out = [];
    const seen = new Set();
    for (const c of cands[p.type] || []) {
      if (seen.has(c.item) || (c.eff.main || 0) !== mainNeeded) continue;
      if (blocksKey(c.blocks) !== pickBlocks[i]) continue;
      if ((c.copies || 1) === 1 && others.some(o => o.item === c.item)) continue;
      const totals = { ...rest };
      for (const s of vectorDims(job)) totals[s] = (totals[s] || 0) + (c.eff[s] || 0);
      if (!sameOutcome(resultOf(job, totals, ctx), target)) continue;
      seen.add(c.item);
      out.push(c);
    }
    return out;
  };
  const easiest = (a, b) => (equipLevel(a.item) ?? 0) - (equipLevel(b.item) ?? 0) || a.item.ilvl - b.item.ilvl;

  // 1. the player's picks, where they still fit
  for (const [i, gameId] of Object.entries(chosen)) {
    const c = picks[i]?.item && gameId != null && fitting(+i).find(x => x.item.gameId === gameId);
    if (c) shown[i] = asPick(picks[i].type, c);
  }
  // 2. every other row: the easiest piece that fits; the optimizer's pick stays on a tie (the sort is stable and the
  // pick is listed first)
  picks.forEach((p, i) => {
    if (!p.item || i in chosen) return;
    const fits = fitting(i);
    const own = fits.find(c => c.item === shown[i].item);
    const best = [own, ...fits.filter(c => c !== own)].filter(Boolean).sort(easiest)[0];
    if (best && best.item !== shown[i].item) shown[i] = asPick(p.type, best);
  });
  // 3. each row's menu, against the rows as now shown
  return shown.map((pick, i) => ({ pick, options: fitting(i) }));
}

/* The meals of `meals` (allMeals entries) that give the same result as `meal` on gear totals `gearTotals`: the same
   resultOf, and the same total with food on each of `keys` (the goal's target and tiebreaks) that has no tiers. Every
   meal adds Vitality, so with Vitality as a key a meal with less of it is not the same, though resultOf leaves it out.
   ctx as for resultOf (its food is ignored). Returns them in `meals` order. For the result's Food menu: the meals it
   tags "best for goal", the one of the highest item level of which the Food row shows. The gear stays as the search found it with `meal`;
   under tier ranking or a Target GCD another meal could make the search choose other gear, which this does not check. */
export function sameMeals(job, gearTotals, meal, meals, ctx, keys) {
  const exact = keys.filter(k => k && !rankTierOf(job, k, ctx.level, ctx.haste ?? 0));
  // the result with meal `m`, and its totals with food on the exact keys
  const resultWith = m => {
    const totals = withFood(gearTotals, foodBonus(job, m, gearTotals, ctx.level));
    return { result: resultOf(job, gearTotals, { ...ctx, food: m }), exact: exact.map(k => totals[k] || 0) };
  };
  const target = resultWith(meal);
  return meals.filter(m => {
    const other = resultWith(m);
    return sameOutcome(other.result, target.result) && other.exact.every((points, i) => points === target.exact[i]);
  });
}

/* The gear totals of a list of picks ({eff}; empty slots count nothing): the job's stats, and weapon damage when the job
   ranks it (vectorDims). */
function sumOf(job, picks) {
  const dims = vectorDims(job);
  const t = {};
  for (const s of dims) t[s] = 0;
  for (const p of picks) if (p.item) for (const s of dims) t[s] += p.eff[s] || 0;
  return t;
}

/* A candidate as a row's pick. */
function asPick(type, c) {
  return { type, item: c.item, eff: c.eff, meld: c.meld ?? null };
}
