/* Other pieces with the same result (roadmap A9): for each slot of an optimizer result, the pieces that could take its
   place without changing what the result does. Under sync many pieces reach the same caps, so a player can often wear
   an easier piece instead of the one the search happened to pick.

   "The same result" is the same main stat (it has no tiers: every point counts) and every substat at the same tier,
   counted with the result's meal: the points between two tiers do nothing, so they may differ. The tiers are the ones
   tier ranking uses (rankTierOf, roadmap A7), and where a substat has a second effect with steps of its own, that one
   holds too: speed's DoT/HoT tick scaling beside its GCD (with the job's haste), and Tenacity's damage step (112)
   beside its mitigation step (200). When the search maximized the goal stat's raw points (the plain optimizer, not tier
   ranking), those points stay too (ctx.goal), so the result never shows less of it than the search found.
   Rows share their spare points: two swaps that are each fine alone can push a tier down together. So every check is
   made against the pieces the other rows show at that moment, never against the optimizer's set alone. */
import { foodBonus, withFood } from './food.js';
import { equipLevel, poolKey, slotInfo } from './items.js';
import { dotMult } from './speed.js';
import { rankTierOf, statTier } from './tiers.js';

/* What a set does, as one comparable string: its main stat, the goal stat's points if asked, then each substat's
   tiers, from gear totals ({neutral stat: points}) with the meal's bonus. ctx = {level, food, haste, goal}: the synced
   level, the meal (a foodChoices entry) or null, the job's always-on haste in percent (hasteFor; 0 for none), and the
   neutral stat whose exact points must stay (the plain optimizer's goal), or null for tiers only (tier ranking). */
export function resultOf(job, gearTotals, { level, food, haste = 0, goal = null }) {
  const t = withFood(gearTotals, food ? foodBonus(job, food, gearTotals, level) : {});
  const tiers = job.substats.map(s => {
    const points = t[s] || 0;
    // the second effect: DoT/HoT tick scaling for speed, the shown effect (Tenacity's damage step) for the others
    const second = s === 'spd' ? dotMult(points, level) : (statTier(job, s, points, level)?.effect ?? '');
    return `${rankTierOf(job, s, level, haste)?.(points) ?? ''}/${second}`;
  });
  return [t.main || 0, goal ? t[goal] || 0 : '', ...tiers].join('|');
}

/* The pieces each row can show without changing the result, and the piece it shows.
   picks: the optimizer's picks in panel order ({type, item, eff, meld}; item null for an empty slot).
   cands: {slot type: candidates} of the whole pool for the same goal, unpruned (buildCandidates with prune off): every
     piece with its synced stats and the melds the optimizer would give it, best score first; a piece can have several
     candidates (meld versions under a Target GCD).
   ctx: as for resultOf. chosen: {row index: pool key} of pieces the player picked from a row's menu.
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
    const mainNeeded = mainOf(target) - rest.main;
    const out = [];
    const seen = new Set();
    for (const c of cands[p.type] || []) {
      if (seen.has(c.item) || (c.eff.main || 0) !== mainNeeded) continue;
      if (blocksKey(c.blocks) !== pickBlocks[i]) continue;
      if ((c.copies || 1) === 1 && others.some(o => o.item === c.item)) continue;
      const totals = { ...rest };
      for (const s of job.stats) totals[s] = (totals[s] || 0) + (c.eff[s] || 0);
      if (resultOf(job, totals, ctx) !== target) continue;
      seen.add(c.item);
      out.push(c);
    }
    return out;
  };
  const easiest = (a, b) => (equipLevel(a.item) ?? 0) - (equipLevel(b.item) ?? 0) || a.item.ilvl - b.item.ilvl;

  // 1. the player's picks, where they still fit
  for (const [i, key] of Object.entries(chosen)) {
    const c = picks[i]?.item && fitting(+i).find(x => poolKey(x.item) === key);
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

/* The main stat of a resultOf string. */
const mainOf = result => Number(result.slice(0, result.indexOf('|')));

/* The gear totals of a list of picks ({eff}; empty slots count nothing). */
function sumOf(job, picks) {
  const t = {};
  for (const s of job.stats) t[s] = 0;
  for (const p of picks) if (p.item) for (const s of job.stats) t[s] += p.eff[s] || 0;
  return t;
}

/* A candidate as a row's pick. */
function asPick(type, c) {
  return { type, item: c.item, eff: c.eff, meld: c.meld ?? null };
}
