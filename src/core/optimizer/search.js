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

/* limits: [{stat, min, max}], each a minimum (null or 0 for none) and a maximum (null for none) on a stat's total; the
   stat must be in dims. Target GCD sets one on speed, tier ranking minimums on other stats. The regain cuts add their
   own inside (a maximum on a synthetic stat, marked `cut: true`; regain.js).
   start: {best, score}, a loadout known to meet every limit (in the shape of `best` below) and its score; the search
   then looks only for a strictly better one and returns `start` when there is none, or when it stops early.
   proven: maxima earlier searches proved under limits these include, [{stat, most, minStats, speed}] (regain.js;
   tier ranking passes its finished stages').
   Returns {best, nodes, truncated, method, kept, frontSizes}; method is 'trial' (the short trial search settled it),
   'fronts' or 'search', kept the candidates left after the filters (summed over slot lists, rings once), frontSizes
   the fronts' sizes when they settled it; best[i] = {cand: candidate | null, rank, blockedBy?}, in the caller's slot
   order, or best = null if nothing is feasible. A slot is left empty when a chosen piece blocks it (blockedBy: that
   candidate; buildCandidates puts blockable slots last) or when every candidate's copies are used up. A blocked slot
   adds 0, so while a chosen piece blocks a later slot, that slot's best score and limited stats come off the bounds
   (without this a cloak's branch, whose bound still counted a head, was almost never pruned under sync).
   Before the search, all exact (docs/engineering/tier-ranking.md, section 4):
   - with limits, candidates that cannot reach a minimum go (dropShortfalls);
   - with a known set (`start`, which tier ranking always has after its first stage) and limits: the set is first made
     better by one-piece swaps (improveStart), then the candidates the Lagrangian bound shows cannot beat it go
     (fixByReducedCost), and the shortfall filter runs again on what is left;
   - with proven maxima, the regain cuts (regain.js) drop more and add a limit each;
   - the slots are put in the order that suits the lists left (shortListsFirst).
   Then, with a known set and limits, a search of TRIAL_NODES nodes at most; only when it does not finish, Pareto fronts
   (front.js) try to settle the search in one pass, and only when a front grows too large does the full search run.
   In the search, with limits, four more things, all exact:
   - the limit tables (limitTables) bound the score by what each limited stat still needs; with several limits the
     bound is the smallest of their tables (each is an upper bound with the other limits dropped, so the smallest is
     one too). One set of tables per set of blocked slots, where those slots add nothing (with one set for all, a
     White Mage search with a two-handed weapon still counted the best shield and ran 110,000 to 420,000 nodes at item
     level 400 instead of under 120);
   - under a speed band, each other minimum is checked against what the remaining slots can add with speed in the band
     (band reach, below);
   - children are grouped by the first limit's value and the slots they block, groups tried best bound first, and each
     group scanned by score down to the first candidate that cannot beat the best loadout so far;
   - the memo: two partial loadouts at the same slot with the same limited totals (a total past a minimum with no
     maximum counts as the minimum: nothing after it can tell them apart), the same blocked slots and, at the second
     ring slot, the same first ring have the same completions, so the later one is cut unless it scores more; with
     several limits, a later one with no more score and no more of any minimum-only total is cut too (dominance). */
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
  const nSlots = slotList.length;
  limits = limits.filter(l => dims.includes(l.stat) && (l.min > 0 || l.max != null));
  const hasMinimum = limits.some(l => l.min > 0);
  const keptCount = () => [...new Set(posList)].reduce((n, list) => n + list.length, 0);
  const fullLists = posList; // before the filters: the pieces a regain cut's swaps may bring in

  // 1. drop the candidates that cannot reach a minimum
  if (!plain && hasMinimum) posList = dropShortfalls(slotList, posList, dims, limits);

  // 2. with a known set: first make it better one swap at a time (a better known set fixes more below and leaves the
  // search less to find), then drop the candidates that cannot beat it (each slot's list filtered once; the two ring slots
  // share one list, so they share the filtered one too), and the shortfalls that leaves
  if (!plain && start && limits.length) start = improveStart(slotList, posList, limits, start);
  const known = start ? start.score : -Infinity; // the score to beat
  let lagr = !plain && start && limits.length ? lagrangeBound(posList, limits, start.score) : null;
  if (lagr) {
    const filtered = new Map();
    posList = posList.map((list, i) => {
      if (!filtered.has(list)) filtered.set(list, fixByReducedCost(list, lagr, i, known));
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

  // 4. the slots in the order that suits the filtered lists (shortListsFirst); every list by position follows, and the
  // result goes back to the caller's order (restore, below)
  const callerSlotList = slotList;
  const perm = plain ? null : shortListsFirst(slotList, posList);
  if (perm) {
    slotList = perm.map(old => callerSlotList[old]);
    const lists = posList;
    posList = perm.map(old => lists[old]);
    if (lagr) {
      const slotAug = lagr.slotAug;
      lagr = { ...lagr, slotAug: Float64Array.from(perm, old => slotAug[old]) };
    }
    if (start) start = { ...start, best: perm.map(old => start.best[old]) };
  }
  // a loadout in this search's order and candidates as the caller's: the caller's order, and each candidate a regain cut
  // copied as its original (a blocked slot's blockedBy may stay a copy: only its item is read)
  const restore = loadout => {
    if (!loadout) return loadout;
    const asCaller = slot => (slot?.cand?.original ? { ...slot, cand: slot.cand.original } : slot);
    if (!perm) return loadout.map(asCaller);
    const out = new Array(nSlots);
    perm.forEach((old, i) => {
      out[old] = asCaller(loadout[i]);
    });
    return out;
  };

  const { remMax, remSc, slotMax, slotSc } = suffixBounds(slotList, posList, dims);
  const nLimits = limits.length;
  const limitStats = limits.map(l => l.stat);

  const posOf = slotPositions(slotList); // blockable slots appear once (rings are never blocked)
  // the slots a candidate blocks, as a bit mask of positions
  const blockMaskOf = new Map(posList.flatMap(list => list.map(a => [a, positionMask(a.blocks, posOf)])));

  // the limited totals so far, in `limits` order (the stats are also kept in `totals`; this copy is what the tables
  // read)
  const limitTotals = new Float64Array(nLimits);

  // the tables for one set of blocked slots, as one bound: the smallest over the tables of each one's bound when `add`
  // (a group's limited values, or null) joins the totals so far; null when no limit has a table
  const tablesFor = empty => {
    const tables = [];
    limits.forEach((l, k) => {
      const t = limitTables(slotList, posList, a => a.eff[l.stat], l.min, l.max, empty);
      if (t) tables.push({ at: (i, add) => t(i, limitTotals[k] + (add ? add[k] : 0)), top: t.top });
    });
    if (!tables.length) return null;
    if (tables.length === 1) return tables[0];
    return {
      at: (i, add) => {
        let least = Infinity;
        for (const t of tables) {
          const b = t.at(i, add);
          if (b < least) least = b;
        }
        return least;
      },
      top: i => Math.min(...tables.map(t => t.top(i))),
    };
  };
  const limitBound = !plain && nLimits ? tablesFor(null) : null;

  // the Lagrangian bound in the search: its per-slot most summed from each position on, and each candidate's priced
  // value (score + sum of coef x value), for the check per node and per child below
  const sufAug = new Float64Array(nSlots + 1);
  const augOf = new Map();
  if (lagr) {
    for (let i = nSlots - 1; i >= 0; i--) sufAug[i] = sufAug[i + 1] + lagr.slotAug[i];
    for (const list of posList) for (const a of list) augOf.set(a, pricedValue(a, lagr));
  }
  let blockedAug = 0; // slotAug of the later slots currently blocked
  const lagrRest = pos => {
    let rest = sufAug[pos] - blockedAug;
    for (const t of lagr.terms) rest += t.coef * ((totals[t.stat] || 0) - t.rhs);
    return rest;
  };

  // tables for each set of blocked slots (limitBound is the one for none), built when first needed: once a chosen
  // piece blocks a slot (a two-handed weapon the off-hand, a cloak the head) that slot adds nothing, while the tables
  // for none still count its best piece. Below LAZY_TABLES nodes the ones for none stand in (a looser bound)
  let nodes = 0; // search nodes so far (also read by limitBoundFor)
  const tables = new Map([[0, limitBound]]);
  const limitBoundFor = mask => {
    let bound = tables.get(mask);
    if (bound === undefined) {
      if (nodes < lazyTables) return limitBound;
      const empty = new Set();
      for (let i = 0; i < slotList.length; i++) if (mask & (1 << i)) empty.add(i);
      bound = tablesFor(empty) || limitBound;
      tables.set(mask, bound);
    }
    return bound;
  };

  // search state, changed by tryChild and restored when it returns
  let blockedMask = 0; // blocked slots now, as a mask
  let best = start ? start.best : null,
    bestScore = known,
    truncated = false;
  const totals = {};
  dims.forEach(d => {
    totals[d] = 0;
  });
  const chosen = new Array(nSlots).fill(null);
  const used = new Map();
  const blockedBy = new Map(); // slot type -> the chosen candidate that leaves it empty

  // per-slot bounds (suffixBounds) of the slots a chosen piece blocks come off the remaining bound
  const slotLimitMax = limitStats.map(s => slotMax[s]);
  let blockedSc = 0; // bounds of the later slots currently blocked
  const blockedLimit = new Float64Array(nLimits); // the same per limited stat
  const block = (p, sign) => {
    blockedSc += sign * slotSc[p];
    if (lagr) blockedAug += sign * lagr.slotAug[p];
    for (let k = 0; k < nLimits; k++) blockedLimit[k] += sign * slotLimitMax[k][p];
  };

  // groups[pos]: the slot's candidates split by (the first limit's value, blocked slots), each group's [rank, candidate]
  // list by score, highest first, and the groups by their best score, highest first; `i` keeps a group's first-seen
  // order for ties. A group's `values` are, per limit, a value whose table bound is at least every member's: exact for
  // the first limit (speed's band, when there is one, comes first) and for any other band (both in the key), the most
  // any member adds for a minimum only (its table only rises with the total so far) and the least for a maximum only
  // (a regain cut: its table only falls). Grouping by every limited value instead made nearly every candidate its own
  // group, and scoring each group at every node cost more than it saved (Sage at level 100, three limits: 9 s)
  const isBand = limits.map(l => l.max != null && l.min > 0);
  const groups = limitBound
    ? posList.map(list => {
        const byKey = new Map();
        list.forEach((a, rank) => {
          const values = limitStats.map(s => Math.max(0, a.eff[s] || 0));
          const mask = blockMaskOf.get(a);
          let key = `${values[0]}|${mask}`;
          for (let k = 1; k < nLimits; k++) if (isBand[k]) key += `|${values[k]}`;
          const group = byKey.get(key);
          // each entry keeps the candidate's own values, for its own bound (several limits)
          if (!group) byKey.set(key, { values: [...values], mask, list: [[rank, a, values]] });
          else {
            for (let k = 1; k < nLimits; k++) {
              if (limits[k].max == null ? values[k] > group.values[k] : values[k] < group.values[k]) group.values[k] = values[k];
            }
            group.list.push([rank, a, values]);
          }
        });
        const slotGroups = [...byKey.values()].map((g, i) => ({ ...g, i, list: g.list.sort((x, y) => y[1].score - x[1].score) }));
        return slotGroups.sort((x, y) => y.list[0][1].score - x.list[0][1].score);
      })
    : null;

  // the memo (see "the memo" above): best score seen per state. A limited total past a minimum with no maximum is
  // stored as the minimum
  const seen = limitBound ? new Map() : null;
  const memoValue = limits.map(l => (l.max == null && l.min > 0 ? s => (s < l.min ? s : l.min) : s => s));
  const memoKey = (pos, coarse) => {
    const prev = slotList[pos] === 'ring' && slotList[pos - 1] === 'ring' ? chosen[pos - 1] : null;
    // one limit: the state packed into one integer, exact below 2^53: the first ring's rank + 1 at the second ring
    // slot, else 0; the blocked-slot mask (12 slots, < 4096); the position (< 32); the total so far plus 50,000
    // (< 1e5). The fields are multiplied, not masked, so the ring rank has no fixed width: the key stays exact while
    // rank + 1 < 2^53 / (4096 × 32 × 1e5), about 687,000, far above a full pool's ring list (about 2,000; front.js).
    // Several limits: the same numbers in a string
    const head = ((prev ? prev.rank + 1 : 0) * 4096 + blockedMask) * 32 + pos;
    if (nLimits === 1) return head * 1e5 + memoValue[0](limitTotals[0]) + 5e4;
    // a regain cut's total stays out: two states with the same real totals have the same completions that meet the real
    // limits, and every such loadout meets the cut too (regain.js), so the earlier state's search has covered them
    let key = `${head}`;
    for (let k = 0; k < nLimits; k++) if (!limits[k].cut && !(coarse && dominanceLimit[k])) key += `,${memoValue[k](limitTotals[k])}`;
    return key;
  };

  // with several limits, the minimum-only ones compare by dominance instead of equality: a state with at least the
  // score and at least every such total (capped at its minimum) of an earlier state at the same key has every
  // completion of the later one with no lower score and no broken limit, so the later one is cut. The key keeps the
  // rest (position, blocked slots, first ring, and each total with a maximum, exactly). Equality alone missed the
  // states that differ in a held total: White Mage at level 100, exactly 2.31, Piety > Determination > Direct Hit,
  // food off, took 11.8 million nodes to prove Direct Hit 0. Each key keeps its states no other one beats, at most
  // MEMO_FRONT of them (dropping one only cuts less)
  const dominanceLimit = limits.map(l => nLimits > 1 && l.max == null && l.min > 0);
  const domIdx = dominanceLimit.flatMap((d, k) => (d ? [k] : []));
  const seenFronts = domIdx.length ? new Map() : null;
  const memoCut = (pos, scoreSoFar) => {
    // equal states first (every one kept), then dominance among the kept few
    const exactKey = memoKey(pos, false);
    const was = seen.get(exactKey);
    if (was !== undefined && was >= scoreSoFar) return true;
    seen.set(exactKey, scoreSoFar);
    if (!seenFronts) return false;
    const key = memoKey(pos, true);
    const values = domIdx.map(k => memoValue[k](limitTotals[k]));
    let states = seenFronts.get(key);
    if (!states) {
      states = [];
      seenFronts.set(key, states);
    }
    for (const s of states) {
      if (s.score < scoreSoFar) continue;
      let all = true;
      for (let j = 0; j < values.length; j++) {
        if (s.values[j] < values[j]) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
    // keep the new state; drop the ones it beats
    for (let i = states.length - 1; i >= 0; i--) {
      const s = states[i];
      if (s.score > scoreSoFar) continue;
      if (values.every((v, j) => s.values[j] <= v)) states.splice(i, 1);
    }
    if (states.length >= MEMO_FRONT) states.shift();
    states.push({ score: scoreSoFar, values });
    return false;
  };

  // put candidate a (at `rank` in its slot's list) in slot pos and search on; false when it is not allowed there
  function tryChild(pos, rank, a, isRing2, scoreSoFar) {
    const usedCount = used.get(a.item.id) || 0;
    if (usedCount >= a.copies) return false;
    if (isRing2) {
      const prev = chosen[pos - 1];
      if (prev && prev.rank > rank) return false;
    }
    for (let k = 0; k < nLimits; k++) {
      if (limits[k].max != null && limitTotals[k] + a.eff[limitStats[k]] > limits[k].max) return false;
    }

    // wear it
    dims.forEach(d => {
      totals[d] += a.eff[d];
    });
    for (let k = 0; k < nLimits; k++) limitTotals[k] += a.eff[limitStats[k]];
    used.set(a.item.id, usedCount + 1);
    const laterBlocked = a.blocks.map(b => posOf.get(b)).filter(p => p > pos);
    for (const b of a.blocks) blockedBy.set(b, a);
    for (const p of laterBlocked) block(p, 1);
    const prevMask = blockedMask;
    blockedMask |= blockMaskOf.get(a);
    chosen[pos] = { cand: a, rank };

    dfs(pos + 1, scoreSoFar + a.score);

    // take it off again
    chosen[pos] = null;
    blockedMask = prevMask;
    for (const p of laterBlocked) block(p, -1);
    for (const b of a.blocks) blockedBy.delete(b);
    used.set(a.item.id, usedCount);
    for (let k = 0; k < nLimits; k++) limitTotals[k] -= a.eff[limitStats[k]];
    dims.forEach(d => {
      totals[d] -= a.eff[d];
    });
    return true;
  }

  // band reach: under a speed band (the first limit), for each other minimum, the most of its stat the slots from i on
  // can add while speed still lands in the band (limitTables with that stat as the score), as [k, table]. The check
  // above it, each slot's most of the stat, ignores speed. Copies and blocking are relaxed as in every limit table, so a
  // loadout that meets the limits is never cut. White Mage at level 100, item level 690, Piety > Critical Hit >
  // Determination: 6.0 to 4.1 s (Perplexity's measurement, 2026-10-17)
  const bandReach = [];
  if (!plain && nLimits > 1 && isBand[0]) {
    const speed = limits[0];
    for (let k = 1; k < nLimits; k++) {
      if (!(limits[k].min > 0)) continue;
      const stat = limits[k].stat;
      const table = limitTables(
        slotList,
        posList,
        a => a.eff[speed.stat],
        speed.min,
        speed.max,
        null,
        a => a.eff[stat] || 0,
      );
      if (table) bandReach.push([k, table]);
    }
  }

  let searchLimit = nodeLimit; // the trial search below runs with a lower one
  function dfs(pos, scoreSoFar) {
    if (truncated) return;
    if (++nodes > searchLimit) {
      truncated = true;
      return;
    }
    if (pos === nSlots) {
      for (let k = 0; k < nLimits; k++) if (limits[k].min > 0 && limitTotals[k] < limits[k].min) return;
      if (scoreSoFar > bestScore) {
        bestScore = scoreSoFar;
        best = chosen.slice();
      }
      return;
    }

    // cut: even the best the remaining slots can add does not beat the best loadout so far, or cannot reach a minimum
    if (scoreSoFar + remSc[pos] - blockedSc <= bestScore) return;
    for (let k = 0; k < nLimits; k++) {
      const min = limits[k].min;
      if (min > 0 && limitTotals[k] + remMax[limitStats[k]][pos] - blockedLimit[k] < min) return;
    }
    for (const [k, table] of bandReach) if (limitTotals[k] + table(pos, limitTotals[0]) < limits[k].min) return;
    if (limitBound && scoreSoFar + limitBoundFor(blockedMask).at(pos, null) <= bestScore) return;
    // the Lagrangian bound here; a child gives up its slot's most minus its own priced value from it
    let nodeLagr = Infinity;
    if (lagr) {
      nodeLagr = scoreSoFar + lagrRest(pos);
      if (nodeLagr + lagrSlack(nodeLagr) <= bestScore) return;
    }
    const lagrCuts = a => {
      if (!lagr) return false;
      const bound = nodeLagr - (lagr.slotAug[pos] - augOf.get(a));
      return bound + lagrSlack(bound) <= bestScore;
    };
    if (seen && pos > 0 && memoCut(pos, scoreSoFar)) return;

    // a slot a chosen piece blocks stays empty
    const slotType = slotList[pos];
    if (blockedBy.has(slotType)) {
      block(pos, -1);
      chosen[pos] = { cand: null, rank: -1, blockedBy: blockedBy.get(slotType) };
      dfs(pos + 1, scoreSoFar);
      chosen[pos] = null;
      block(pos, 1);
      return;
    }

    const list = posList[pos];
    // the two ring slots share one list; the 2nd ring never ranks before the 1st, so each pair is tried once
    const isRing2 = slotType === 'ring' && pos > 0 && slotList[pos - 1] === 'ring';

    // with limits: try the groups (same value of the first limit, same blocked slots) best bound first
    if (groups) {
      const slotGroups = groups[pos];
      // only the groups that can still beat the best so far (the loop below skips the others anyway); groups come by
      // top score, highest first, so once even the tables' most at any total cannot lift one past it, none can
      const order = [];
      const top = limitBound.top(pos + 1);
      for (let i = 0; i < slotGroups.length; i++) {
        const head = scoreSoFar + slotGroups[i].list[0][1].score;
        if (head + top <= bestScore) break;
        const restBound = limitBoundFor(blockedMask | slotGroups[i].mask).at(pos + 1, slotGroups[i].values);
        if (head + restBound > bestScore) order.push([i, restBound]);
      }

      // by bound, ties in the groups' first-seen order (as the stable sort over that order did)
      order.sort(
        (x, y) =>
          y[1] + slotGroups[y[0]].list[0][1].score - (x[1] + slotGroups[x[0]].list[0][1].score) || slotGroups[x[0]].i - slotGroups[y[0]].i,
      );
      for (const [g, restBound] of order) {
        const groupList = slotGroups[g].list;
        if (scoreSoFar + groupList[0][1].score + restBound <= bestScore) continue;
        const bound = nLimits > 1 ? limitBoundFor(blockedMask | slotGroups[g].mask) : null;
        for (const [rank, a, values] of groupList) {
          if (scoreSoFar + a.score + restBound <= bestScore) break;
          // several limits: the group's bound uses its most of each, so check the candidate's own too
          if (bound && scoreSoFar + a.score + bound.at(pos + 1, values) <= bestScore) continue;
          if (lagrCuts(a)) continue;
          tryChild(pos, rank, a, isRing2, scoreSoFar);
          if (truncated) return;
        }
      }

      leaveEmptyIfNoCopies(pos, scoreSoFar);
      return;
    }

    // without them: every candidate in score order
    for (let rank = 0; rank < list.length; rank++) {
      const a = list[rank];
      if (!hasCopyLeft(a)) continue;
      if (lagrCuts(a)) continue;
      tryChild(pos, rank, a, isRing2, scoreSoFar);
      if (truncated) return;
    }
    leaveEmptyIfNoCopies(pos, scoreSoFar);
  }

  // a slot is left empty only when no candidate has a copy left (the cuts in dfs say nothing about copies)
  const hasCopyLeft = a => (used.get(a.item.id) || 0) < a.copies;
  function leaveEmptyIfNoCopies(pos, scoreSoFar) {
    if (posList[pos].some(hasCopyLeft)) return;
    chosen[pos] = { cand: null, rank: -1 };
    dfs(pos + 1, scoreSoFar);
    chosen[pos] = null;
  }

  // 5. with a known set, a short trial search first (TRIAL_NODES); only when it does not finish, Pareto fronts
  // from its best set (front.js: with lists this short they often settle it in one pass); only when a front grows too
  // large, the full search, from the top with the memo cleared (a run cut short leaves states in it it never finished)
  if (lagr) {
    searchLimit = Math.min(TRIAL_NODES, nodeLimit);
    dfs(0, 0);
    if (!truncated) return { best: restore(best), nodes, truncated, method: 'trial', kept: keptCount() };
    const fronts = frontSearch(slotList, posList, limits, bestScore);
    if (fronts) {
      const frontsBest = fronts.best ? fronts.best.slots : best;
      return {
        best: restore(frontsBest),
        nodes: nodes + fronts.entries,
        truncated: false,
        method: 'fronts',
        kept: keptCount(),
        frontSizes: fronts.sizes,
      };
    }
    if (nodeLimit <= TRIAL_NODES) return { best: restore(best), nodes, truncated, method: 'search', kept: keptCount() };
    truncated = false;
    seen?.clear();
    seenFronts?.clear();
    searchLimit = nodeLimit;
  }
  dfs(0, 0);
  return { best: restore(best), nodes, truncated, method: 'search', kept: keptCount() };
}
