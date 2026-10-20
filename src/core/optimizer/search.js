/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a stat minimum that the remaining slots can no longer reach. With limits on
   stats (a speed minimum or band for Target GCD; minimums on other stats for tier ranking) it also bounds the score by
   what each limited stat still needs (limit tables), tries children in order of that bound, and cuts states it has
   already seen (the memo). Spec, evidence and measurements: docs/engineering/optimizer.md, section 5, and
   docs/engineering/tier-ranking.md, sections 4 and 5.

   In reading order: the bounds and filters that run before the search (suffixBounds to shortListsFirst), the parts the
   search builds from them (combinedLimitBound, childGroups, bandReachTables, makeMemo), the search (prepareSearch,
   newSearch, dfs and its steps) and branchAndBound, which runs them. */
import { frontSearch } from './front.js';
import { addRegainCuts } from './regain.js';
import { blockableTypes, positionMask, slotPositions } from './slot-index.js';

/* dropShortfalls repeats until a round drops nothing, at most this many rounds. Stopping early is safe: the lists left
   still hold every set that meets the minimums; the filter only drops less. */
const SHORTFALL_ROUNDS = 10;

/* improveStart repeats its passes until no swap raises the score, at most this many passes. Stopping early is safe:
   every pass leaves a legal set meeting every limit. */
const IMPROVE_PASSES = 100;

/* lagrangeBound's subgradient descent: at most LAGRANGE_STEPS steps, with the step factor halved after STALE_STEPS
   steps without a lower bound (the usual safeguard). Any multipliers give a valid bound, so stopping early only
   leaves it looser. */
const LAGRANGE_STEPS = 300;
const STALE_STEPS = 15;

/* A search this small is over before a limit table for its blocked slots would pay for itself, so below this many
   nodes the tables for no blocked slot stand in (a looser bound; optimizer.md, section 5). */
const LAZY_TABLES = 2000;

/* With a known set, the search first runs this many nodes at most (the trial search) before it builds Pareto fronts,
   which take far longer to build than most such searches take to finish (tier-ranking.md, section 5). */
const TRIAL_NODES = 20000;

/* The most states one memo key keeps when states compare by dominance (makeMemo); dropping one only cuts less. */
const MEMO_FRONT = 32;

/* With one limit the memo packs a state into one integer (makeMemo): ((first ring's rank + 1) × MEMO_MASKS + blocked
   mask) × MEMO_POSITIONS + position, then × MEMO_TOTALS + the limited total + MEMO_TOTAL_OFFSET. Each field stays
   below its span: at most 12 slots (a mask below 4,096), positions below 32, totals within ±50,000. The fields are
   multiplied, not masked, so the ring rank has no fixed width: the key stays exact below 2^53 while rank + 1 is below
   2^53 / (4,096 × 32 × 100,000), about 687,000, far above a full pool's ring list (about 2,000; front.js). */
const MEMO_MASKS = 4096;
const MEMO_POSITIONS = 32;
const MEMO_TOTALS = 1e5;
const MEMO_TOTAL_OFFSET = 5e4;

/* Most two rings can add together on ringValue(cand) >= 0: the best ring twice only if that item has 2 copies, otherwise
   the best plus the best other item (the best alone when there is no other: the second ring slot stays empty). Any
   legal pair containing the best item is at most this, and any pair without it is too, since its larger member is at
   most the best other item. Candidates of one item share `item`, so a Unique ring is never counted twice. */
function bestPair(list, ringValue) {
  let bestRing = null;
  for (const cand of list) if (!bestRing || ringValue(cand) > ringValue(bestRing)) bestRing = cand;
  if (!bestRing) return 0;
  if (bestRing.copies >= 2) return 2 * ringValue(bestRing);
  let other = 0;
  for (const cand of list) if (cand.item !== bestRing.item) other = Math.max(other, ringValue(cand));
  return ringValue(bestRing) + other;
}

/* A piece's bound in its own slot: `value` (its score or one stat) less the per-slot bounds `bounds` (by position) of
   the later slots it blocks, so a bound summed over the slots never counts both the piece and the slots it leaves
   empty. `pos`: the piece's position; `positions`: slotPositions of the slot list. Used by suffixBounds and, to count a
   piece as suffixBounds does, by dropShortfalls. */
function lessBlockedBounds(cand, value, pos, bounds, positions) {
  let own = value;
  for (const type of cand.blocks || []) {
    const blockedPos = positions.get(type);
    if (blockedPos > pos) own -= bounds[blockedPos];
  }
  return own;
}

/* Returns {remMax, remSc, slotMax, slotSc}: remMax[stat][pos], the most of a stat in `dims` the slots from pos on can
   still add; remSc[pos], the best score they can still add. Each is a sum of per-slot bounds, slotMax[stat][pos] and
   slotSc[pos], which a branch subtracts for a slot a chosen piece leaves empty.
   A piece that leaves later slots empty (legs that cover the feet) is bounded together with them (lessBlockedBounds),
   so the bound never counts both the piece and those slots. Every blocked slot comes after its blocker
   (buildCandidates), so those bounds are known when its slot is reached. At the first of the two ring slots the two
   are bounded together by the best legal pair (bestPair); counting the best ring twice, as a sum of single-slot bounds
   does, overstates the bound whenever that ring is Unique. */
export function suffixBounds(slotList, posList, dims) {
  const nSlots = posList.length;
  const positions = slotPositions(slotList);
  const remMax = {},
    slotMax = {};
  dims.forEach(stat => {
    remMax[stat] = new Array(nSlots + 1).fill(0);
    slotMax[stat] = new Array(nSlots).fill(0);
  });
  const remSc = new Array(nSlots + 1).fill(0);
  const slotSc = new Array(nSlots).fill(0);

  // from the last slot back, so the bound for slots pos.. adds slot pos's to the one for pos + 1..
  for (let pos = nSlots - 1; pos >= 0; pos--) {
    const list = posList[pos];
    if (slotList[pos] === 'ring' && slotList[pos + 1] === 'ring') {
      dims.forEach(stat => {
        remMax[stat][pos] = remMax[stat][pos + 2] + bestPair(list, cand => Math.max(0, cand.eff[stat]));
      });
      remSc[pos] = remSc[pos + 2] + bestPair(list, cand => cand.score);
      continue;
    }

    // the bound of one piece here, less the bounds of the later slots it blocks
    dims.forEach(stat => {
      const own = cand => lessBlockedBounds(cand, cand.eff[stat], pos, slotMax[stat], positions);
      slotMax[stat][pos] = Math.max(0, ...list.map(own));
      remMax[stat][pos] = remMax[stat][pos + 1] + slotMax[stat][pos];
    });
    slotSc[pos] = Math.max(0, ...list.map(cand => lessBlockedBounds(cand, cand.score, pos, slotSc, positions)));
    remSc[pos] = remSc[pos + 1] + slotSc[pos];
  }
  return { remMax, remSc, slotMax, slotSc };
}

/* Limit tables for one limited value (speed in the examples; any stat works the same; valueFn(candidate) gives it):
   returns bound(pos, soFar), an upper bound on the score the slots from pos on can still add when the value's total so
   far is soFar, given its minimum `min` and maximum `max`. Each slot on its own: copy limits are ignored (a Unique ring
   may count twice) and a slot some piece can block may stay empty, so the bound never falls below what a legal loadout
   can add, and the search stays exact.
   - Minimum only: need[pos][r] = most score slots pos.. add while adding at least r of the value (r up to the
     minimum), built on each slot's (score, value) frontier: the best score at each value, keeping a value only if no
     higher one scores as much.
   - Maximum too: exact[pos][x] = most score slots pos.. add while adding exactly x (x up to the maximum), from each
     slot's best score at each value. The bound is its best over the values that still land in [min, max], read in O(1)
     from a prefix maximum (when the minimum is already met) or a window maximum the band's width.
   Values below 0 count as 0; candidates above the maximum are left out (they can never be worn). `empty`: a Set of
   the positions of slots a piece already chosen blocks, which add nothing. The returned function has `top(pos)`, its
   most at any total so far. Returns null when the limit has neither a minimum above 0 nor a maximum. `scoreFn`
   (default: the candidate's score) is what the tables add up: the search's band-reach tables add another limited stat
   instead, for the most of it the remaining slots can add while speed lands in its band. */
export function limitTables(slotList, posList, valueFn, min, max, empty = null, scoreFn = cand => cand.score) {
  const nSlots = slotList.length;
  const floor = min > 0 ? min : 0;
  const blockable = blockableTypes(posList);
  const limitedValue = cand => Math.max(0, valueFn(cand) || 0);

  // slots a legal loadout can leave empty: a blockable slot, a slot with no candidates, and a ring slot when the ring
  // list cannot fill both (copies of distinct items below 2: a lone Unique ring is worn once). Counting a piece in such a
  // slot would add points a loadout may not have, which a maximum can then wrongly reject
  const blockedNow = pos => !!empty && empty.has(pos); // blocked by a piece already chosen: only empty
  const canEmpty = pos => {
    const list = posList[pos];
    if (blockable.has(slotList[pos]) || !list.length) return true;
    if (slotList[pos] !== 'ring') return false;
    const copiesOf = new Map();
    for (const cand of list) copiesOf.set(cand.item, cand.copies);
    let total = 0;
    for (const copies of copiesOf.values()) total += copies;
    return total < 2;
  };

  // a maximum no loadout can pass is no limit at all, and the table for it would be needlessly long
  const most = posList.reduce((sum, list, pos) => sum + (blockedNow(pos) ? 0 : Math.max(0, ...list.map(limitedValue))), 0);
  if (max != null && max >= most) max = null;
  if (!floor && max == null) return null;

  if (max == null) {
    // need[pos][r]: the most score slots pos.. add while adding at least r more (r = 0..floor)
    const need = new Array(nSlots + 1);
    need[nSlots] = new Float64Array(floor + 1).fill(-Infinity);
    need[nSlots][0] = 0;
    for (let pos = nSlots - 1; pos >= 0; pos--) {
      const next = need[pos + 1];

      // this slot's choices as {score, value}, highest value first; the frontier keeps one only if it outscores every
      // higher one
      const choices = blockedNow(pos) ? [] : posList[pos].map(cand => ({ score: scoreFn(cand), value: limitedValue(cand) }));
      if (blockedNow(pos) || canEmpty(pos)) choices.push({ score: 0, value: 0 });
      choices.sort((x, y) => y.value - x.value || y.score - x.score);
      const frontier = [];
      let topScore = -Infinity;
      for (const choice of choices) {
        if (choice.score > topScore) {
          frontier.push(choice);
          topScore = choice.score;
        }
      }

      // the most this slot and the ones after it add while adding at least r: the best frontier choice plus what the
      // later slots add for the points still needed after it
      const row = new Float64Array(floor + 1);
      for (let r = 0; r <= floor; r++) {
        let best = -Infinity;
        for (const { score, value } of frontier) {
          const withRest = score + next[r > value ? r - value : 0];
          if (withRest > best) best = withRest;
        }
        row[r] = best;
      }
      need[pos] = row;
    }

    const bound = (pos, soFar) => {
      const stillNeeded = floor - soFar;
      return need[pos][stillNeeded > 0 ? stillNeeded : 0];
    };
    bound.top = pos => need[pos][0]; // the most at any total so far (need is highest with nothing more needed)
    return bound;
  }

  // a band (a maximum too)
  if (max < floor) return Object.assign(() => -Infinity, { top: () => -Infinity });
  const width = max - floor; // the band's width: a total so far of c still lands in it with floor - c to max - c more

  // per slot pos, from exact[pos] (exact[pos][x]: the most score slots pos.. add with exactly x more):
  // prefixMax[pos][x] = the most with at most x more, windowMax[pos][x] = the most with x to x + width more
  const prefixMax = new Array(nSlots + 1),
    windowMax = new Array(nSlots + 1);
  const storeMaxima = (pos, exact) => {
    const prefix = new Float64Array(max + 1);
    let best = -Infinity;
    for (let x = 0; x <= max; x++) prefix[x] = best = exact[x] > best ? exact[x] : best;
    prefixMax[pos] = prefix;

    // window maximum over [x, x + width] in blocks of width + 1: the suffix maximum inside x's block and the prefix
    // maximum inside the block of x + width cover the window between them; a window cut short by max is the maximum
    // over [x, max]
    const block = width + 1,
      blockPrefix = new Float64Array(max + 1),
      blockSuffix = new Float64Array(max + 1),
      windowAt = new Float64Array(max + 1);
    for (let x = 0; x <= max; x++) blockPrefix[x] = x % block === 0 ? exact[x] : Math.max(blockPrefix[x - 1], exact[x]);
    for (let x = max; x >= 0; x--) {
      blockSuffix[x] = x === max || (x + 1) % block === 0 ? exact[x] : Math.max(blockSuffix[x + 1], exact[x]);
    }
    let tail = -Infinity;
    for (let x = max; x >= 0; x--) {
      tail = exact[x] > tail ? exact[x] : tail;
      windowAt[x] = x + width <= max ? Math.max(blockSuffix[x], blockPrefix[x + width]) : tail;
    }
    windowMax[pos] = windowAt;
  };

  // exact rows from the last slot back: slot pos's best score at each value, plus the later slots' row
  let exact = new Float64Array(max + 1).fill(-Infinity);
  exact[0] = 0;
  storeMaxima(nSlots, exact);
  for (let pos = nSlots - 1; pos >= 0; pos--) {
    // this slot's best score at each value it can add
    const bestAt = new Map();
    for (const cand of blockedNow(pos) ? [] : posList[pos]) {
      const value = limitedValue(cand);
      const score = scoreFn(cand);
      if (value <= max && !(bestAt.get(value) >= score)) bestAt.set(value, score);
    }
    if ((blockedNow(pos) || canEmpty(pos)) && !(bestAt.get(0) >= 0)) bestAt.set(0, 0);

    const later = exact;
    exact = new Float64Array(max + 1).fill(-Infinity);
    for (const [value, score] of bestAt) {
      for (let x = value; x <= max; x++) {
        const withRest = score + later[x - value];
        if (withRest > exact[x]) exact[x] = withRest;
      }
    }
    storeMaxima(pos, exact);
  }

  const bound = (pos, soFar) => {
    const roomLeft = max - soFar;
    if (roomLeft < 0) return -Infinity;
    const stillNeeded = floor - soFar;
    return stillNeeded <= 0 ? prefixMax[pos][roomLeft] : windowMax[pos][stillNeeded];
  };
  bound.top = pos => prefixMax[pos][max]; // the most at any total so far
  return bound;
}

/* The Lagrangian bound (branchAndBound uses it with a known set): every limit as a priced term. For a set meeting every
   limit, score <= score + sum over terms of coef x (value - rhs), each term being >= 0 (a minimum: coef >= 0 on
   value - min; a maximum: coef <= 0 on value - max). The right side splits per slot, so its most is the sum of each
   slot's most of score + sum of coef x value (`slotAug`, at least 0: an empty slot adds 0), minus sum of coef x rhs.
   The coefficients come from a subgradient descent on that most at the root (the Lagrangian dual of the limits), with
   Polyak's step toward `floor` (a score some set reaches, or 0); see tier-ranking.md, section 4.2.
   Returns {terms: [{stat, coef, rhs}], slotAug} or null when no limit has a minimum or maximum. */
export function lagrangeBound(posList, limits, floor = 0, steps = LAGRANGE_STEPS) {
  const terms = [];
  for (const limit of limits) {
    if (limit.min > 0) terms.push({ stat: limit.stat, sign: 1, rhs: limit.min });
    if (limit.max != null) terms.push({ stat: limit.stat, sign: -1, rhs: limit.max });
  }
  if (!terms.length) return null;
  const nSlots = posList.length;
  const values = posList.map(list => list.map(cand => terms.map(term => cand.eff[term.stat] || 0)));

  // the dual function at `multipliers` (>= 0, one per term): its value, a subgradient and each slot's most
  const dual = multipliers => {
    let total = 0;
    const grad = terms.map(term => -term.sign * term.rhs);
    const slotAug = new Float64Array(nSlots);
    for (let pos = 0; pos < nSlots; pos++) {
      let best = 0,
        bestIndex = -1;
      posList[pos].forEach((cand, index) => {
        let priced = cand.score;
        for (let j = 0; j < terms.length; j++) priced += multipliers[j] * terms[j].sign * values[pos][index][j];
        if (priced > best) {
          best = priced;
          bestIndex = index;
        }
      });
      slotAug[pos] = best;
      total += best;
      if (bestIndex >= 0) for (let j = 0; j < terms.length; j++) grad[j] += terms[j].sign * values[pos][bestIndex][j];
    }
    for (let j = 0; j < terms.length; j++) total -= multipliers[j] * terms[j].sign * terms[j].rhs;
    return { total, grad, slotAug };
  };

  // Polyak steps toward `floor`: step = factor x (dual - floor) / |subgradient|^2, the factor halved after STALE_STEPS
  // steps without a better dual
  let multipliers = terms.map(() => 0);
  let current = dual(multipliers),
    best = current,
    bestMultipliers = multipliers,
    factor = 1,
    stale = 0;
  for (let step = 0; step < steps; step++) {
    const norm2 = current.grad.reduce((sum, g) => sum + g * g, 0);
    if (!norm2) break; // a zero subgradient: the minimum
    const length = (factor * (current.total - floor)) / norm2;
    multipliers = multipliers.map((m, j) => Math.max(0, m - length * current.grad[j]));
    current = dual(multipliers);
    if (current.total < best.total) {
      best = current;
      bestMultipliers = multipliers;
      stale = 0;
    } else if (++stale >= STALE_STEPS) {
      factor /= 2;
      stale = 0;
    }
  }
  return {
    terms: terms.map((term, j) => ({ stat: term.stat, coef: term.sign * bestMultipliers[j], rhs: term.rhs })),
    slotAug: best.slotAug,
  };
}

/* Drop every candidate that no set holding it can lift to a minimum; returns the new posList. The most a set with
   candidate `cand` has of a stat is its own value plus the bounds of the other slots (suffixBounds; for a piece that
   blocks later slots, its own value less their bounds, as there), and for a ring, its value plus the most of any ring
   (the pair partner). When that is below a minimum, `cand` goes (a "deficit budget": a piece short of its slot's best
   by more than the total room above the minimum). Dropping pieces lowers the bounds, so it repeats until nothing more
   goes. Exact: every set meeting the minimum keeps all its pieces. The two ring slots share one list and keep sharing
   it. */
export function dropShortfalls(slotList, posList, dims, limits) {
  const mins = limits.filter(limit => limit.min > 0);
  const positions = slotPositions(slotList);
  for (let round = 0; round < SHORTFALL_ROUNDS; round++) {
    const { remMax, slotMax } = suffixBounds(slotList, posList, dims);
    let dropped = false;
    const filtered = new Map();
    posList = posList.map((list, pos) => {
      if (filtered.has(list)) return filtered.get(list);
      const isRing = slotList[pos] === 'ring';

      // the most a set holding `cand` has of a stat with a minimum
      const mostWith = (cand, stat) => {
        const total = remMax[stat][0];
        if (isRing) {
          const bestRing = Math.max(0, ...list.map(other => other.eff[stat] || 0));
          const pair = remMax[stat][pos] - remMax[stat][pos + 2];
          return total - pair + (cand.eff[stat] || 0) + bestRing;
        }
        return total - slotMax[stat][pos] + lessBlockedBounds(cand, cand.eff[stat] || 0, pos, slotMax[stat], positions);
      };

      const kept = list.filter(cand => mins.every(limit => mostWith(cand, limit.stat) >= limit.min));
      if (kept.length < list.length) dropped = true;
      filtered.set(list, kept);
      return kept;
    });
    if (!dropped) break;
  }
  return posList;
}

/* A known set (`start`: {best, score}, branchAndBound's shape) made better by swapping one piece at a time: at each
   position, any candidate of its list that keeps every limit, the copies and the blocked slots, and raises the score.
   The best such swap is made, and the passes repeat until none raises the score. Returns the better {best, score}, or
   `start` itself when no swap helps or `start` breaks a limit. Why: tier ranking's seed is the stage before's best for
   another key, which can be far from this stage's best (tier-ranking.md, section 4.3).
   Exact: the result is a legal loadout meeting every limit, and the search after it still finds any strictly better
   one. A swap never fills or empties a slot: the new piece blocks the same slots as the old (none for an empty slot,
   which stays empty), and a slot a piece blocks is left alone. */
export function improveStart(slotList, posList, limits, start) {
  const nSlots = slotList.length;
  const positions = slotPositions(slotList);
  const best = start.best.slice();
  let score = start.score;
  const totals = limits.map(limit => best.reduce((sum, slot) => sum + (slot?.cand?.eff[limit.stat] || 0), 0));
  const fits = values =>
    limits.every((limit, k) => !(limit.min > 0 && values[k] < limit.min) && !(limit.max != null && values[k] > limit.max));
  if (!fits(totals)) return start;

  // the slots each position's piece blocks: an empty position names its blocker (blockedBy, the candidate or {item})
  const blockMask = pos => {
    const item = best[pos]?.cand?.item;
    if (!item) return 0;
    let mask = 0;
    for (let other = 0; other < nSlots; other++) if (best[other]?.blockedBy && best[other].blockedBy.item === item) mask |= 1 << other;
    return mask;
  };

  let improved = false;
  for (let pass = 0; pass < IMPROVE_PASSES; pass++) {
    // the best swap: the one that raises the score most
    let move = null;
    for (let pos = 0; pos < nSlots; pos++) {
      const old = best[pos]?.cand;
      if (!old) continue; // an empty slot stays empty
      const oldMask = blockMask(pos);
      for (const cand of posList[pos]) {
        if (cand.score <= old.score + (move ? move.gain : 0)) continue;
        if (positionMask(cand.blocks, positions) !== oldMask) continue;
        let worn = 0;
        for (let other = 0; other < nSlots; other++) if (other !== pos && best[other]?.cand?.item.id === cand.item.id) worn++;
        if (worn >= cand.copies) continue;
        const values = limits.map((limit, k) => totals[k] - (old.eff[limit.stat] || 0) + (cand.eff[limit.stat] || 0));
        if (!fits(values)) continue;
        move = { pos, cand, gain: cand.score - old.score, values };
      }
    }
    if (!move) break;

    // make it; the blocked slots name the new piece as their blocker
    const oldItem = best[move.pos].cand.item;
    for (let other = 0; other < nSlots; other++) {
      if (best[other]?.blockedBy && best[other].blockedBy.item === oldItem) best[other] = { ...best[other], blockedBy: move.cand };
    }
    best[move.pos] = { cand: move.cand, rank: -1 };
    move.values.forEach((value, k) => {
      totals[k] = value;
    });
    score += move.gain;
    improved = true;
  }
  return improved ? { best, score } : start;
}

/* The coefficients are fractions, so the Lagrangian bound is a float: a margin far above its rounding error (scores
   stay below 2^53, a relative error near 1e-16 per step) keeps every cut on the safe side. */
const lagrSlack = bound => 1 + Math.abs(bound) * 1e-9;

/* A candidate's priced value under the Lagrangian bound `lagr` (lagrangeBound): its score plus each term's coefficient
   times its value of the term's stat. */
function pricedValue(cand, lagr) {
  let priced = cand.score;
  for (const term of lagr.terms) priced += term.coef * (cand.eff[term.stat] || 0);
  return priced;
}

/* Reduced-cost fixing: the candidates of `list` (slot `pos`) worth searching against a known set scoring `known`.
   Forcing a candidate into its slot lowers the Lagrangian bound (lagrangeBound) by the slot's most minus the
   candidate's own priced value; when that leaves the bound at or below `known`, no set holding the candidate beats the
   known set, and the candidate goes. Exact: the bound is an upper bound for every set meeting the limits. */
export function fixByReducedCost(list, lagr, pos, known) {
  const root = lagr.slotAug.reduce((sum, most) => sum + most, 0) - lagr.terms.reduce((sum, term) => sum + term.coef * term.rhs, 0);
  const gap = root - known + lagrSlack(root);
  return list.filter(cand => lagr.slotAug[pos] - pricedValue(cand, lagr) < gap);
}

/* The order branchAndBound searches the slots in, after its filters: the slots no piece can block, shortest list first
   (the ring list counts twice: it fills two slots), then the slots a piece can block, in their order (still after
   every slot that blocks them; the two ring slots stay side by side). Returns perm, with perm[new position] = old
   position, or null when the order is the same.
   Exact: the search fills every slot whatever the order. Short lists first keep the top of the tree narrow and leave
   the long lists for the depths where the bounds and the memo are tightest. The order must come from the filtered
   lists (tier-ranking.md, section 6). */
export function shortListsFirst(slotList, posList) {
  const blockable = blockableTypes(posList);
  const types = [...new Set(slotList)];
  const size = type => posList[slotList.indexOf(type)].length * (type === 'ring' ? 2 : 1);
  const free = types.filter(type => !blockable.has(type)).sort((x, y) => size(x) - size(y));
  const order = [];
  for (const type of [...free, ...types.filter(type => blockable.has(type))]) {
    order.push(type);
    if (type === 'ring') order.push('ring');
  }

  // each type's positions in the old order (the two ring slots keep theirs)
  const taken = new Set();
  const perm = order.map(type => {
    const old = slotList.findIndex((other, pos) => other === type && !taken.has(pos));
    taken.add(old);
    return old;
  });
  return perm.some((old, pos) => old !== pos) ? perm : null;
}

/* The limit tables for one set of blocked slots (`empty`, a Set of positions, or null), as one bound: {at(pos, add),
   top(pos)}. at is the smallest over the limits' tables (limitTables) of each one's bound for the slots from pos on
   when `add` (per limit, values to add to the totals so far, or null) joins `limitTotals` (the search's limited totals
   so far, by limit, read at each call); top the smallest of their `top`s. Each table is an upper bound with the other
   limits dropped, so the smallest is one too. Null when no limit has a table. */
export function combinedLimitBound(slotList, posList, limits, limitTotals, empty) {
  const tables = [];
  limits.forEach((limit, k) => {
    const table = limitTables(slotList, posList, cand => cand.eff[limit.stat], limit.min, limit.max, empty);
    if (table) tables.push({ at: (pos, add) => table(pos, limitTotals[k] + (add ? add[k] : 0)), top: table.top });
  });
  if (!tables.length) return null;
  if (tables.length === 1) return tables[0];
  return {
    at: (pos, add) => {
      let least = Infinity;
      for (const table of tables) {
        const bound = table.at(pos, add);
        if (bound < least) least = bound;
      }
      return least;
    },
    top: pos => Math.min(...tables.map(table => table.top(pos))),
  };
}

/* Each slot's candidates split into groups by (the first limit's value, the slots they block, and the value of any
   other band): per position, a list of {values, mask, members, firstSeen}, by best score, highest first. members:
   [{rank, cand, values}] by score, highest first, with rank the candidate's place in its slot's list and values its own
   limited values; firstSeen: the group's place in first-seen order, for ties. A group's `values` are, per limit, a value
   whose table bound is at least every member's: exact for the first limit (speed's band, when there is one, comes
   first) and for any other band (both in the key), the most any member adds for a minimum only (its table only rises
   with the total so far) and the least for a maximum only (a regain cut: its table only falls). Grouping by every
   limited value made nearly every candidate its own group (optimizer.md, section 5). `blockMaskOf`: each candidate's
   blocked slots as a position mask. */
function childGroups(posList, limits, blockMaskOf) {
  const nLimits = limits.length;
  const limitStats = limits.map(limit => limit.stat);
  const isBand = limits.map(limit => limit.max != null && limit.min > 0);
  return posList.map(list => {
    const byKey = new Map();
    list.forEach((cand, rank) => {
      const values = limitStats.map(stat => Math.max(0, cand.eff[stat] || 0));
      const mask = blockMaskOf.get(cand);
      let key = `${values[0]}|${mask}`;
      for (let k = 1; k < nLimits; k++) if (isBand[k]) key += `|${values[k]}`;
      const member = { rank, cand, values };
      const group = byKey.get(key);
      if (!group) {
        byKey.set(key, { values: [...values], mask, members: [member] });
        return;
      }
      for (let k = 1; k < nLimits; k++) {
        const raises = limits[k].max == null ? values[k] > group.values[k] : values[k] < group.values[k];
        if (raises) group.values[k] = values[k];
      }
      group.members.push(member);
    });
    const groups = [...byKey.values()].map((group, firstSeen) => ({
      ...group,
      firstSeen,
      members: group.members.sort((x, y) => y.cand.score - x.cand.score),
    }));
    return groups.sort((x, y) => y.members[0].cand.score - x.members[0].cand.score);
  });
}

/* Band reach: under a speed band (the first limit), for each other limit with a minimum, the most of its stat the
   slots from pos on can add while speed still lands in the band (limitTables with that stat as the score), as
   [{limitIndex, table}]. The minimum check in the search takes each slot's most of the stat and ignores speed. Copies
   and blocking are relaxed as in every limit table, so a loadout that meets the limits is never cut. */
function bandReachTables(slotList, posList, limits) {
  const speed = limits[0];
  const reach = [];
  for (let k = 1; k < limits.length; k++) {
    if (!(limits[k].min > 0)) continue;
    const stat = limits[k].stat;
    const speedOf = cand => cand.eff[speed.stat];
    const table = limitTables(slotList, posList, speedOf, speed.min, speed.max, null, cand => cand.eff[stat] || 0);
    if (table) reach.push({ limitIndex: k, table });
  }
  return reach;
}

/* The search's memo for `limits` on `slotList`: {cut(state, pos, scoreSoFar), clear()}. cut is true when a partial
   loadout at `pos` can be cut because an earlier one had the same completions with no less score; otherwise it
   records this one. `state` is the search's (newSearch): cut reads its chosen, blockedMask and limitTotals.
   - Equal states: two partial loadouts at the same slot with the same limited totals (a total past a minimum with no
     maximum counts as the minimum: nothing after it can tell them apart), the same blocked slots and, at the second
     ring slot, the same first ring have the same completions, so the later one is cut unless it scores more. A regain
     cut's total stays out: two states with the same real totals have the same completions that meet the real limits,
     and every such loadout meets the cut too (regain.js).
   - Dominance, with several limits: the minimum-only totals compare by dominance instead. A state with at least the
     score and at least every such total (capped at its minimum) of an earlier state at the same key (position,
     blocked slots, first ring, and each total with a maximum, exactly) has every completion of the later one with no
     lower score and no broken limit, so the later one is cut. Each key keeps the states no other one beats, at most
     `memoFront` of them, the oldest dropped first (dropping one only cuts less). */
export function makeMemo(slotList, limits, memoFront = MEMO_FRONT) {
  const nLimits = limits.length;
  const memoValue = limits.map(limit =>
    limit.max == null && limit.min > 0 ? total => (total < limit.min ? total : limit.min) : total => total,
  );
  const byDominance = limits.map(limit => nLimits > 1 && limit.max == null && limit.min > 0);
  const dominanceIndexes = byDominance.flatMap((dominance, k) => (dominance ? [k] : []));
  const seen = new Map(); // equal states: the best score per key
  const seenFronts = dominanceIndexes.length ? new Map() : null; // dominance: the states kept per coarse key

  // the state's key; `coarse` leaves out the totals compared by dominance
  const keyOf = (state, pos, coarse) => {
    const firstRing = slotList[pos] === 'ring' && slotList[pos - 1] === 'ring' ? state.chosen[pos - 1] : null;
    const head = ((firstRing ? firstRing.rank + 1 : 0) * MEMO_MASKS + state.blockedMask) * MEMO_POSITIONS + pos;
    if (nLimits === 1) return head * MEMO_TOTALS + memoValue[0](state.limitTotals[0]) + MEMO_TOTAL_OFFSET;
    let key = `${head}`;
    for (let k = 0; k < nLimits; k++) {
      if (!limits[k].cut && !(coarse && byDominance[k])) key += `,${memoValue[k](state.limitTotals[k])}`;
    }
    return key;
  };

  const cut = (state, pos, scoreSoFar) => {
    // equal states first (every one kept)
    const exactKey = keyOf(state, pos, false);
    const was = seen.get(exactKey);
    if (was !== undefined && was >= scoreSoFar) return true;
    seen.set(exactKey, scoreSoFar);
    if (!seenFronts) return false;

    // then dominance among the kept few
    const key = keyOf(state, pos, true);
    const values = dominanceIndexes.map(k => memoValue[k](state.limitTotals[k]));
    let kept = seenFronts.get(key);
    if (!kept) {
      kept = [];
      seenFronts.set(key, kept);
    }
    for (const earlier of kept) {
      if (earlier.score < scoreSoFar) continue;
      let beatsEvery = true;
      for (let j = 0; j < values.length; j++) {
        if (earlier.values[j] < values[j]) {
          beatsEvery = false;
          break;
        }
      }
      if (beatsEvery) return true;
    }

    // keep the new state; drop the ones it beats, and the oldest when the key is full
    for (let index = kept.length - 1; index >= 0; index--) {
      const earlier = kept[index];
      if (earlier.score > scoreSoFar) continue;
      if (values.every((value, j) => earlier.values[j] <= value)) kept.splice(index, 1);
    }
    if (kept.length >= memoFront) kept.shift();
    kept.push({ score: scoreSoFar, values });
    return false;
  };

  const clear = () => {
    seen.clear();
    seenFronts?.clear();
  };
  return { cut, clear };
}

/* Steps 1 to 4 of branchAndBound (its comment), before the search: returns {slotList, posList, dims, limits, start,
   known, lagr, perm} for the search, in its slot order (perm, from shortListsFirst: perm[search position] = caller
   position, or null for the caller's order). `limits` and `dims` include the regain cuts' synthetic stats; `known` is
   the score to beat (start's, or -Infinity); `lagr` the Lagrangian bound (lagrangeBound) when there is a known set and
   a limit, else null. */
function prepareSearch({ slotList, posList, dims, limits, plain, start, proven }) {
  limits = limits.filter(limit => dims.includes(limit.stat) && (limit.min > 0 || limit.max != null));
  const hasMinimum = limits.some(limit => limit.min > 0);
  const fullLists = posList; // before the filters: the pieces a regain cut's swaps may bring in

  // 1. drop the candidates that cannot reach a minimum
  if (!plain && hasMinimum) posList = dropShortfalls(slotList, posList, dims, limits);

  // 2. with a known set: first make it better one swap at a time (a better known set fixes more below and leaves the
  // search less to find), then drop the candidates that cannot beat it (each slot's list filtered once; the two ring
  // slots share one list, so they share the filtered one too), and the shortfalls that leaves
  if (!plain && start && limits.length) start = improveStart(slotList, posList, limits, start);
  const known = start ? start.score : -Infinity;
  let lagr = !plain && start && limits.length ? lagrangeBound(posList, limits, start.score) : null;
  if (lagr) {
    const filtered = new Map();
    posList = posList.map((list, pos) => {
      if (!filtered.has(list)) filtered.set(list, fixByReducedCost(list, lagr, pos, known));
      return filtered.get(list);
    });
    if (hasMinimum) posList = dropShortfalls(slotList, posList, dims, limits);
  }

  // 3. the regain cuts from earlier searches' proven maxima (regain.js), on the few candidates the filters left, then
  // the shortfalls that leaves. From here on `limits` and `dims` hold the cuts' synthetic stats too
  if (!plain && proven?.length) {
    ({ posList, dims, limits } = addRegainCuts({ slotList, posList, fullLists, dims, limits, proven }));
    if (hasMinimum) posList = dropShortfalls(slotList, posList, dims, limits);
  }

  // 4. the slots in the order that suits the filtered lists; every list by position follows
  const perm = plain ? null : shortListsFirst(slotList, posList);
  if (perm) {
    const callerSlots = slotList,
      callerLists = posList;
    slotList = perm.map(old => callerSlots[old]);
    posList = perm.map(old => callerLists[old]);
    if (lagr) {
      const slotAug = lagr.slotAug;
      lagr = { ...lagr, slotAug: Float64Array.from(perm, old => slotAug[old]) };
    }
    if (start) {
      const callerBest = start.best;
      start = { ...start, best: perm.map(old => callerBest[old]) };
    }
  }
  return { slotList, posList, dims, limits, start, known, lagr, perm };
}

/* A loadout in the search's order (`perm`, prepareSearch) and candidates, as the caller's: the caller's slot order,
   and each candidate a regain cut copied as its original (a blocked slot's blockedBy may stay a copy: only its item is
   read). Null stays null. */
function toCallerOrder(loadout, perm) {
  if (!loadout) return loadout;
  const asCaller = slot => (slot?.cand?.original ? { ...slot, cand: slot.cand.original } : slot);
  if (!perm) return loadout.map(asCaller);
  const out = new Array(perm.length);
  perm.forEach((old, pos) => {
    out[old] = asCaller(loadout[pos]);
  });
  return out;
}

/* The search's one state object, for the prepared search `prep` (prepareSearch) with options {plain, lazyTables,
   nodeLimit} (branchAndBound's). Fixed for the search: the lists, limits and every bound built from them. Changed as
   it runs: the counters, the best loadout so far, and the partial loadout (chosen, used, blockedBy, blockedMask, the
   totals and the blocked slots' bounds), which tryChild changes and restores. */
function newSearch(prep, { plain, lazyTables, nodeLimit }) {
  const { slotList, posList, dims, limits, start, known, lagr } = prep;
  const nSlots = slotList.length;
  const nLimits = limits.length;
  const limitStats = limits.map(limit => limit.stat);
  const positions = slotPositions(slotList); // blockable slots appear once (rings are never blocked)
  const blockMaskOf = new Map(posList.flatMap(list => list.map(cand => [cand, positionMask(cand.blocks, positions)])));

  // the separable bounds (suffixBounds), and the limit tables for no blocked slot; the limited totals so far, by limit,
  // are what the tables read
  const { remMax, remSc, slotMax, slotSc } = suffixBounds(slotList, posList, dims);
  const limitTotals = new Float64Array(nLimits);
  const limitBound = !plain && nLimits ? combinedLimitBound(slotList, posList, limits, limitTotals, null) : null;

  // the Lagrangian bound in the search: its per-slot most summed from each position on, and each candidate's priced
  // value, for the check per node and per child
  const sufAug = new Float64Array(nSlots + 1);
  const augOf = new Map();
  if (lagr) {
    for (let pos = nSlots - 1; pos >= 0; pos--) sufAug[pos] = sufAug[pos + 1] + lagr.slotAug[pos];
    for (const list of posList) for (const cand of list) augOf.set(cand, pricedValue(cand, lagr));
  }

  const totals = {};
  dims.forEach(stat => {
    totals[stat] = 0;
  });
  const bandFirst = nLimits > 1 && limits[0].max != null && limits[0].min > 0;
  return {
    // fixed for the search
    slotList,
    posList,
    dims,
    limits,
    nSlots,
    nLimits,
    limitStats,
    positions,
    blockMaskOf,
    remMax,
    remSc,
    slotSc,
    slotLimitMax: limitStats.map(stat => slotMax[stat]),
    lagr,
    sufAug,
    augOf,
    limitBound,
    tablesByMask: new Map([[0, limitBound]]), // limit tables per set of blocked slots (limitBoundFor)
    lazyTables,
    groups: limitBound ? childGroups(posList, limits, blockMaskOf) : null,
    bandReach: !plain && bandFirst ? bandReachTables(slotList, posList, limits) : [],
    memo: limitBound ? makeMemo(slotList, limits) : null,

    // the run: nodes so far, the node limit of this run, whether it stopped there, the best loadout so far
    nodes: 0,
    nodeLimit,
    truncated: false,
    best: start ? start.best : null,
    bestScore: known,

    // the partial loadout: chosen[pos] = {cand, rank, blockedBy?}; used: item id -> copies worn; blockedBy: slot type
    // -> the chosen candidate that leaves it empty; blockedMask: those slots as a position mask; totals: by stat in
    // dims; limitTotals: by limit; blockedSc, blockedAug, blockedLimit: the per-slot bounds of the later slots now
    // blocked (score, Lagrangian, each limited stat), which come off the remaining bounds
    chosen: new Array(nSlots).fill(null),
    used: new Map(),
    blockedBy: new Map(),
    blockedMask: 0,
    totals,
    limitTotals,
    blockedSc: 0,
    blockedAug: 0,
    blockedLimit: new Float64Array(nLimits),
  };
}

/* Blocks (sign 1) or unblocks (sign -1) the later slot at `pos`: its per-slot bounds come off (or back onto) the
   remaining bounds. */
function blockSlot(search, pos, sign) {
  search.blockedSc += sign * search.slotSc[pos];
  if (search.lagr) search.blockedAug += sign * search.lagr.slotAug[pos];
  for (let k = 0; k < search.nLimits; k++) search.blockedLimit[k] += sign * search.slotLimitMax[k][pos];
}

/* The limit tables for the blocked slots `mask` (a position mask), as combinedLimitBound's bound, built when first
   needed: once a chosen piece blocks a slot (a two-handed weapon the off-hand, a cloak the head) that slot adds
   nothing, while the tables for none still count its best piece. Below `lazyTables` nodes the ones for none stand in
   (a looser bound) and nothing is built. */
function limitBoundFor(search, mask) {
  let bound = search.tablesByMask.get(mask);
  if (bound === undefined) {
    if (search.nodes < search.lazyTables) return search.limitBound;
    const empty = new Set();
    for (let pos = 0; pos < search.nSlots; pos++) if (mask & (1 << pos)) empty.add(pos);
    bound = combinedLimitBound(search.slotList, search.posList, search.limits, search.limitTotals, empty) || search.limitBound;
    search.tablesByMask.set(mask, bound);
  }
  return bound;
}

/* The Lagrangian bound's rest at `pos`: the most the slots from pos on add to the priced score, less the blocked
   slots', plus each term's coefficient times its total so far less its right side. */
function lagrangeRest(search, pos) {
  let rest = search.sufAug[pos] - search.blockedAug;
  for (const term of search.lagr.terms) rest += term.coef * ((search.totals[term.stat] || 0) - term.rhs);
  return rest;
}

/* True when the node at `pos` can be cut: even the most the remaining slots can add does not beat the best loadout so
   far (separable bound, limit tables), or cannot reach a minimum (each slot's most; band reach). */
function boundsCut(search, pos, scoreSoFar) {
  const { limits, limitTotals } = search;
  if (scoreSoFar + search.remSc[pos] - search.blockedSc <= search.bestScore) return true;
  for (let k = 0; k < search.nLimits; k++) {
    const min = limits[k].min;
    if (min > 0 && limitTotals[k] + search.remMax[search.limitStats[k]][pos] - search.blockedLimit[k] < min) return true;
  }
  for (const { limitIndex, table } of search.bandReach) {
    if (limitTotals[limitIndex] + table(pos, limitTotals[0]) < limits[limitIndex].min) return true;
  }
  return !!search.limitBound && scoreSoFar + limitBoundFor(search, search.blockedMask).at(pos, null) <= search.bestScore;
}

/* True when the Lagrangian bound cuts candidate `cand` at `pos`: a child gives up its slot's most minus its own priced
   value from the node's bound `nodeLagr`. False without the bound. */
function lagrangeCutsChild(search, pos, nodeLagr, cand) {
  if (!search.lagr) return false;
  const bound = nodeLagr - (search.lagr.slotAug[pos] - search.augOf.get(cand));
  return bound + lagrSlack(bound) <= search.bestScore;
}

/* True while some candidate of `cand`'s item has a copy left to wear. */
function hasCopyLeft(search, cand) {
  return (search.used.get(cand.item.id) || 0) < cand.copies;
}

/* Leaves slot `pos` empty (`slot`: its entry in chosen, {cand: null, rank: -1, blockedBy?}) and searches on. */
function searchEmpty(search, pos, scoreSoFar, slot) {
  search.chosen[pos] = slot;
  dfs(search, pos + 1, scoreSoFar);
  search.chosen[pos] = null;
}

/* Puts candidate `cand` (at `rank` in its slot's list) in slot `pos` and searches on; does nothing when it is not
   allowed there (no copy left, the second ring ranked before the first, or a maximum passed). Everything it changes in
   the state it restores, in reverse order. */
function tryChild(search, pos, rank, cand, isRing2, scoreSoFar) {
  const { dims, totals, limits, limitStats, limitTotals, nLimits, used, blockedBy } = search;

  // allowed here?
  const usedCount = used.get(cand.item.id) || 0;
  if (usedCount >= cand.copies) return;
  if (isRing2) {
    const firstRing = search.chosen[pos - 1];
    if (firstRing && firstRing.rank > rank) return;
  }
  for (let k = 0; k < nLimits; k++) {
    if (limits[k].max != null && limitTotals[k] + cand.eff[limitStats[k]] > limits[k].max) return;
  }

  // wear it: its stats, a copy, the slots it blocks (the later ones come off the bounds)
  dims.forEach(stat => {
    totals[stat] += cand.eff[stat];
  });
  for (let k = 0; k < nLimits; k++) limitTotals[k] += cand.eff[limitStats[k]];
  used.set(cand.item.id, usedCount + 1);
  const laterBlocked = cand.blocks.map(type => search.positions.get(type)).filter(blockedPos => blockedPos > pos);
  for (const type of cand.blocks) blockedBy.set(type, cand);
  for (const blockedPos of laterBlocked) blockSlot(search, blockedPos, 1);
  const prevMask = search.blockedMask;
  search.blockedMask |= search.blockMaskOf.get(cand);
  search.chosen[pos] = { cand, rank };

  dfs(search, pos + 1, scoreSoFar + cand.score);

  // take it off again
  search.chosen[pos] = null;
  search.blockedMask = prevMask;
  for (const blockedPos of laterBlocked) blockSlot(search, blockedPos, -1);
  for (const type of cand.blocks) blockedBy.delete(type);
  used.set(cand.item.id, usedCount);
  for (let k = 0; k < nLimits; k++) limitTotals[k] -= cand.eff[limitStats[k]];
  dims.forEach(stat => {
    totals[stat] -= cand.eff[stat];
  });
}

/* With limits: the children of the node at `pos` by group (childGroups), best bound first, each group scanned by
   score down to the first candidate that cannot beat the best loadout so far. Stops when the search does. */
function tryGroups(search, pos, scoreSoFar, isRing2, nodeLagr) {
  // the groups that can still beat the best so far, with their bound for the slots after this one; groups come by
  // best score, highest first, so once even the tables' most at any total cannot lift one past it, none can
  const order = [];
  const top = search.limitBound.top(pos + 1);
  for (const group of search.groups[pos]) {
    const withBest = scoreSoFar + group.members[0].cand.score;
    if (withBest + top <= search.bestScore) break;
    const restBound = limitBoundFor(search, search.blockedMask | group.mask).at(pos + 1, group.values);
    if (withBest + restBound > search.bestScore) order.push({ group, restBound });
  }

  // by bound, ties in the groups' first-seen order
  order.sort(
    (x, y) =>
      y.restBound + y.group.members[0].cand.score - (x.restBound + x.group.members[0].cand.score) || x.group.firstSeen - y.group.firstSeen,
  );

  // each group's members down to the first that cannot beat the best so far; with several limits the group's bound
  // uses its most of each, so each candidate's own is checked too
  for (const { group, restBound } of order) {
    if (scoreSoFar + group.members[0].cand.score + restBound <= search.bestScore) continue;
    const bound = search.nLimits > 1 ? limitBoundFor(search, search.blockedMask | group.mask) : null;
    for (const { rank, cand, values } of group.members) {
      if (scoreSoFar + cand.score + restBound <= search.bestScore) break;
      if (bound && scoreSoFar + cand.score + bound.at(pos + 1, values) <= search.bestScore) continue;
      if (lagrangeCutsChild(search, pos, nodeLagr, cand)) continue;
      tryChild(search, pos, rank, cand, isRing2, scoreSoFar);
      if (search.truncated) return;
    }
  }
}

/* Without limits: the children of the node at `pos` in score order (each slot's list is). Stops when the search does. */
function tryInOrder(search, pos, scoreSoFar, isRing2, nodeLagr) {
  const list = search.posList[pos];
  for (let rank = 0; rank < list.length; rank++) {
    const cand = list[rank];
    if (!hasCopyLeft(search, cand)) continue;
    if (lagrangeCutsChild(search, pos, nodeLagr, cand)) continue;
    tryChild(search, pos, rank, cand, isRing2, scoreSoFar);
    if (search.truncated) return;
  }
}

/* The depth-first search from slot `pos` with the partial loadout in `search` scoring `scoreSoFar`: updates
   search.best and bestScore when a full loadout meets every minimum and beats the best so far, and stops (truncated)
   past search.nodeLimit nodes. */
function dfs(search, pos, scoreSoFar) {
  // count the node; stop at the node limit
  if (search.truncated) return;
  if (++search.nodes > search.nodeLimit) {
    search.truncated = true;
    return;
  }

  // a full loadout: the best so far if it meets every minimum and scores more
  if (pos === search.nSlots) {
    const { limits, limitTotals } = search;
    for (let k = 0; k < search.nLimits; k++) if (limits[k].min > 0 && limitTotals[k] < limits[k].min) return;
    if (scoreSoFar > search.bestScore) {
      search.bestScore = scoreSoFar;
      search.best = search.chosen.slice();
    }
    return;
  }

  // cut: the bounds, then the Lagrangian bound here, then the memo
  if (boundsCut(search, pos, scoreSoFar)) return;
  const nodeLagr = search.lagr ? scoreSoFar + lagrangeRest(search, pos) : Infinity;
  if (search.lagr && nodeLagr + lagrSlack(nodeLagr) <= search.bestScore) return;
  if (search.memo && pos > 0 && search.memo.cut(search, pos, scoreSoFar)) return;

  // a slot a chosen piece blocks stays empty
  const slotType = search.slotList[pos];
  if (search.blockedBy.has(slotType)) {
    blockSlot(search, pos, -1);
    searchEmpty(search, pos, scoreSoFar, { cand: null, rank: -1, blockedBy: search.blockedBy.get(slotType) });
    blockSlot(search, pos, 1);
    return;
  }

  // the candidates; the two ring slots share one list, and the 2nd ring never ranks before the 1st, so each pair is
  // tried once
  const isRing2 = slotType === 'ring' && pos > 0 && search.slotList[pos - 1] === 'ring';
  if (search.groups) tryGroups(search, pos, scoreSoFar, isRing2, nodeLagr);
  else tryInOrder(search, pos, scoreSoFar, isRing2, nodeLagr);
  if (search.truncated) return;

  // empty only when no candidate has a copy left (the cuts above say nothing about copies)
  if (!search.posList[pos].some(cand => hasCopyLeft(search, cand))) searchEmpty(search, pos, scoreSoFar, { cand: null, rank: -1 });
}

/* The best loadout for a score under limits on stat totals.
   - slotList, posList, dims: the slot sequence, each position's candidate list (by score, highest first) and the stats
     the candidates carry, from buildCandidates (candidates.js).
   - limits: [{stat, min, max}], each a minimum (null or 0 for none) and a maximum (null for none) on a stat's total;
     the stat must be in dims. Target GCD sets one on speed, tier ranking minimums on other stats. The regain cuts add
     their own inside (a maximum on a synthetic stat, marked `cut: true`; regain.js).
   - nodeLimit: the most search nodes before the search stops and reports `truncated`.
   - plain: turns off every extra (the filters, the Lagrangian bound, regain cuts, slot order, trial search, fronts,
     limit tables, groups, memo), for checking them.
   - lazyTables (tests only): the node count after which the tables for blocked slots are built (LAZY_TABLES).
   - start: {best, score}, a loadout known to meet every limit (in the shape of `best` below) and its score; the search
     then looks only for a strictly better one and returns `start` when there is none, or when it stops early.
   - proven: maxima earlier searches proved under limits these include, [{stat, most, minStats, speed}] (regain.js;
     tier ranking passes its finished stages').
   Returns {best, nodes, truncated, method, kept, frontSizes}; method is 'trial' (the short trial search settled it),
   'fronts' or 'search', kept the candidates left after the filters (summed over slot lists, rings once), frontSizes
   the fronts' sizes when they settled it; best[pos] = {cand: candidate | null, rank, blockedBy?}, in the caller's slot
   order, or best = null if nothing is feasible. A slot is left empty when a chosen piece blocks it (blockedBy: that
   candidate; buildCandidates puts blockable slots last) or when every candidate's copies are used up. A blocked slot
   adds 0, so while a chosen piece blocks a later slot, that slot's best score and limited stats come off the bounds.
   Before the search, all exact (prepareSearch; tier-ranking.md, section 4):
   1. with limits, candidates that cannot reach a minimum go (dropShortfalls);
   2. with a known set (`start`, which tier ranking always has after its first stage) and limits: the set is first made
      better by one-piece swaps (improveStart), then the candidates the Lagrangian bound shows cannot beat it go
      (fixByReducedCost), and the shortfall filter runs again on what is left;
   3. with proven maxima, the regain cuts (regain.js) drop more and add a limit each;
   4. the slots are put in the order that suits the lists left (shortListsFirst).
   5. Then, with a known set and limits, a search of TRIAL_NODES nodes at most; only when it does not finish, Pareto
      fronts (front.js) try to settle the search in one pass, and only when a front grows too large does the full
      search run.
   In the search (dfs), with limits, four more things, all exact:
   - the limit tables (limitTables) bound the score by what each limited stat still needs; with several limits the
     bound is the smallest of their tables (combinedLimitBound). One set of tables per set of blocked slots, where
     those slots add nothing (limitBoundFor);
   - under a speed band, each other minimum is checked against what the remaining slots can add with speed in the band
     (bandReachTables);
   - children are grouped by the first limit's value and the slots they block (childGroups), groups tried best bound
     first, and each group scanned by score down to the first candidate that cannot beat the best loadout so far;
   - the memo (makeMemo) cuts a partial loadout an earlier one with the same completions and no less score covers. */
export function branchAndBound({
  slotList,
  posList,
  dims,
  limits = [],
  nodeLimit,
  plain = false,
  lazyTables = LAZY_TABLES,
  start = null,
  proven = null,
}) {
  // 1 to 4: the filters and the slot order
  const prep = prepareSearch({ slotList, posList, dims, limits, plain, start, proven });
  const search = newSearch(prep, { plain, lazyTables, nodeLimit });
  const kept = [...new Set(prep.posList)].reduce((sum, list) => sum + list.length, 0);
  const result = (best, method) => ({
    best: toCallerOrder(best, prep.perm),
    nodes: search.nodes,
    truncated: search.truncated,
    method,
    kept,
  });

  // 5. with a known set, a short trial search first (TRIAL_NODES); only when it does not finish, Pareto fronts from
  // its best set (front.js: with lists this short they often settle it in one pass); only when a front grows too
  // large, the full search, from the top with the memo cleared (a run cut short leaves states in it it never finished)
  if (search.lagr) {
    search.nodeLimit = Math.min(TRIAL_NODES, nodeLimit);
    dfs(search, 0, 0);
    if (!search.truncated) return result(search.best, 'trial');
    const fronts = frontSearch(prep.slotList, prep.posList, prep.limits, search.bestScore);
    if (fronts) {
      const frontsBest = fronts.best ? fronts.best.slots : search.best;
      return { ...result(frontsBest, 'fronts'), nodes: search.nodes + fronts.entries, truncated: false, frontSizes: fronts.sizes };
    }
    if (nodeLimit <= TRIAL_NODES) return result(search.best, 'search');
    search.truncated = false;
    search.memo?.clear();
    search.nodeLimit = nodeLimit;
  }

  // the full search
  dfs(search, 0, 0);
  return result(search.best, 'search');
}
