/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a stat minimum that the remaining slots can no longer reach. With limits on
   stats (a speed minimum or band for Target GCD; minimums on other stats for tier ranking) it also bounds the score by
   what each limited stat still needs (limit tables), tries children in order of that bound, and cuts states it has
   already seen (the memo). */
import { frontSearch } from './front.js';
import { addRegainCuts } from './regain.js';

/* Most two rings can add together on f(a) >= 0: the best ring twice only if that item has 2 copies, otherwise the best
   plus the best other item (the best alone when there is no other: the second ring slot stays empty). Any legal pair
   containing the best item is at most this, and any pair without it is too, since its larger member is at most the
   best other item. Candidates of one item share `item`, so a Unique ring is never counted twice. */
function bestPair(list, f) {
  let top = null;
  for (const a of list) if (!top || f(a) > f(top)) top = a;
  if (!top) return 0;
  if (top.copies >= 2) return 2 * f(top);
  let other = 0;
  for (const a of list) if (a.item !== top.item) other = Math.max(other, f(a));
  return f(top) + other;
}

/* remMax[d][i]: most of dimension d slots i.. can still add; remSc[i]: best score they can still add. Each is a sum of
   per-slot bounds, slotMax[d][i] and slotSc[i], which a branch subtracts for a slot a chosen piece leaves empty.
   A piece that leaves later slots empty (legs that cover the feet) is bounded together with them: its slot's bound is
   its value minus the bounds of the slots it blocks, so the bound never counts both the piece and those slots (counted
   twice, the search hit its node limit below level 50, where every piece syncs to nearly the same item level). Every
   blocked slot comes after its blocker (buildCandidates), so those bounds are known when its slot is reached.
   At the first of the two ring slots the two are bounded together by the best legal pair (bestPair); counting the
   best ring twice, as a sum of single-slot bounds does, overstates the bound whenever that ring is Unique. */
export function suffixBounds(slotList, posList, dims) {
  const n = posList.length;
  const posOf = new Map(slotList.map((t, i) => [t, i]));
  const remMax = {},
    slotMax = {};
  dims.forEach(d => {
    remMax[d] = new Array(n + 1).fill(0);
    slotMax[d] = new Array(n).fill(0);
  });
  const remSc = new Array(n + 1).fill(0);
  const slotSc = new Array(n).fill(0);

  // from the last slot back, so the bound for slots i.. adds slot i's to the one for i + 1..
  for (let i = n - 1; i >= 0; i--) {
    const list = posList[i];
    if (slotList[i] === 'ring' && slotList[i + 1] === 'ring') {
      dims.forEach(d => {
        remMax[d][i] = remMax[d][i + 2] + bestPair(list, a => Math.max(0, a.eff[d]));
      });
      remSc[i] = remSc[i + 2] + bestPair(list, a => a.score);
      continue;
    }

    // the bound of one piece here, less the bounds of the later slots it blocks
    const own = (a, value, bounds) => (a.blocks || []).reduce((x, b) => (posOf.get(b) > i ? x - bounds[posOf.get(b)] : x), value);
    dims.forEach(d => {
      slotMax[d][i] = Math.max(0, ...list.map(a => own(a, a.eff[d], slotMax[d])));
      remMax[d][i] = remMax[d][i + 1] + slotMax[d][i];
    });
    slotSc[i] = Math.max(0, ...list.map(a => own(a, a.score, slotSc)));
    remSc[i] = remSc[i + 1] + slotSc[i];
  }
  return { remMax, remSc, slotMax, slotSc };
}

/* Limit tables for one limited value (speed in the examples; any stat, or the combined minimum of branchAndBound, works
   the same; valueFn(candidate) gives it): bound(i, c) = an upper bound on the score slots i.. can still add when the
   total so far is c, given its minimum and maximum. Each slot on its own: copy limits are ignored (a Unique ring may count twice) and a slot some piece can block may stay empty, so the
   bound never falls below what a legal loadout can add, and the search stays exact.
   - Minimum only: need[i][r] = most score slots i.. add while adding at least r of the stat (r up to the minimum),
     built on each slot's (score, value) frontier: the best score at each value, keeping a value only if no higher one
     scores as much.
   - Maximum too: exact[i][s] = most score slots i.. add while adding exactly s (s up to the maximum), from each slot's
     best score at each value. The bound is its best over the values that still land in [min, max], read in O(1) from a
     prefix maximum (when the minimum is already met) or a window maximum the band's width.
   Values below 0 count as 0; candidates above the maximum are left out (they can never be worn). `empty`: the
   positions of slots a piece already chosen blocks, which add nothing. Each returned function has `top(i)`, its most
   at any total so far. Returns null when the limit has neither a minimum above 0 nor a maximum. `scoreFn` (default:
   the candidate's score) is what the tables add up: the search's band-reach tables add another limited stat instead,
   for the most of it the remaining slots can add while speed lands in its band. */
export function limitTables(slotList, posList, valueFn, min, max, empty = null, scoreFn = a => a.score) {
  const n = slotList.length;
  const lo = min > 0 ? min : 0;
  const blockable = new Set(posList.flatMap(list => list.flatMap(a => a.blocks)));
  const statOf = a => Math.max(0, valueFn(a) || 0);

  // slots a legal loadout can leave empty: a blockable slot, a slot with no candidates, and a ring slot when the ring
  // list cannot fill both (copies of distinct items below 2: a lone Unique ring is worn once). Counting a piece in such a
  // slot would add points a loadout may not have, which a maximum can then wrongly reject
  const blockedNow = i => !!empty && empty.has(i); // blocked by a piece already chosen: only empty
  const canEmpty = i => {
    const list = posList[i];
    if (blockable.has(slotList[i]) || !list.length) return true;
    if (slotList[i] !== 'ring') return false;
    const copies = new Map();
    for (const a of list) copies.set(a.item, a.copies);
    let total = 0;
    for (const c of copies.values()) total += c;
    return total < 2;
  };

  // a maximum no loadout can pass is no limit at all, and the table for it would be needlessly long
  const most = posList.reduce((sum, list, i) => sum + (blockedNow(i) ? 0 : Math.max(0, ...list.map(statOf))), 0);
  if (max != null && max >= most) max = null;
  if (!lo && max == null) return null;

  if (max == null) {
    // need[i][r]: the most score slots i.. add while adding at least r more (r = 0..lo)
    const need = new Array(n + 1);
    need[n] = new Float64Array(lo + 1).fill(-Infinity);
    need[n][0] = 0;
    for (let i = n - 1; i >= 0; i--) {
      const next = need[i + 1];

      // this slot's choices as [score, value], highest value first; the frontier keeps one only if it outscores every
      // higher one
      const choices = blockedNow(i) ? [] : posList[i].map(a => [scoreFn(a), statOf(a)]);
      if (blockedNow(i) || canEmpty(i)) choices.push([0, 0]);
      choices.sort((x, y) => y[1] - x[1] || y[0] - x[0]);
      const frontier = [];
      let topScore = -Infinity;
      for (const c of choices) {
        if (c[0] > topScore) {
          frontier.push(c);
          topScore = c[0];
        }
      }

      // the most this slot and the ones after it add while adding at least r: the best frontier choice plus what the
      // later slots add for the points still needed after it
      const row = new Float64Array(lo + 1);
      for (let r = 0; r <= lo; r++) {
        let best = -Infinity;
        for (const [score, value] of frontier) {
          const v = score + next[r > value ? r - value : 0];
          if (v > best) best = v;
        }
        row[r] = best;
      }
      need[i] = row;
    }

    const bound = (i, soFar) => {
      const r = lo - soFar;
      return need[i][r > 0 ? r : 0];
    };
    bound.top = i => need[i][0]; // the most at any total so far (need is highest with nothing more needed)
    return bound;
  }

  // a band (a maximum too)
  if (max < lo) return Object.assign(() => -Infinity, { top: () => -Infinity });
  const width = max - lo; // the band's width: a total so far of c still lands in it with lo - c to max - c more

  // per slot i, from exact[i] (exact[i][x]: the most score slots i.. add with exactly x more):
  // prefixMax[i][x] = the most with at most x more, windowMax[i][x] = the most with x to x + width more
  const prefixMax = new Array(n + 1),
    windowMax = new Array(n + 1);
  const storeMaxima = (i, exact) => {
    const prefix = new Float64Array(max + 1);
    let best = -Infinity;
    for (let x = 0; x <= max; x++) prefix[x] = best = exact[x] > best ? exact[x] : best;
    prefixMax[i] = prefix;

    // window maximum over [x, x + width] in blocks of width + 1: the suffix maximum inside x's block and the prefix
    // maximum inside the block of x + width cover the window between them; a window cut short by max is the maximum
    // over [x, max]
    const block = width + 1,
      blockPrefix = new Float64Array(max + 1),
      blockSuffix = new Float64Array(max + 1),
      win = new Float64Array(max + 1);
    for (let x = 0; x <= max; x++) blockPrefix[x] = x % block === 0 ? exact[x] : Math.max(blockPrefix[x - 1], exact[x]);
    for (let x = max; x >= 0; x--) {
      blockSuffix[x] = x === max || (x + 1) % block === 0 ? exact[x] : Math.max(blockSuffix[x + 1], exact[x]);
    }
    let tail = -Infinity;
    for (let x = max; x >= 0; x--) {
      tail = exact[x] > tail ? exact[x] : tail;
      win[x] = x + width <= max ? Math.max(blockSuffix[x], blockPrefix[x + width]) : tail;
    }
    windowMax[i] = win;
  };

  // exact rows from the last slot back: slot i's best score at each value, plus the later slots' row
  let exact = new Float64Array(max + 1).fill(-Infinity);
  exact[0] = 0;
  storeMaxima(n, exact);
  for (let i = n - 1; i >= 0; i--) {
    // this slot's best score at each value it can add
    const bestAt = new Map();
    for (const a of blockedNow(i) ? [] : posList[i]) {
      const value = statOf(a);
      const score = scoreFn(a);
      if (value <= max && !(bestAt.get(value) >= score)) bestAt.set(value, score);
    }
    if ((blockedNow(i) || canEmpty(i)) && !(bestAt.get(0) >= 0)) bestAt.set(0, 0);

    const prev = exact;
    exact = new Float64Array(max + 1).fill(-Infinity);
    for (const [value, score] of bestAt) {
      for (let x = value; x <= max; x++) {
        const v = score + prev[x - value];
        if (v > exact[x]) exact[x] = v;
      }
    }
    storeMaxima(i, exact);
  }

  const bound = (i, soFar) => {
    const roomLeft = max - soFar;
    if (roomLeft < 0) return -Infinity;
    const stillNeeded = lo - soFar;
    return stillNeeded <= 0 ? prefixMax[i][roomLeft] : windowMax[i][stillNeeded];
  };
  bound.top = i => prefixMax[i][max]; // the most at any total so far
  return bound;
}

/* The Lagrangian bound (branchAndBound uses it with a known set, `start`): every limit as a priced term. For a set meeting
   every limit, score <= score + sum over terms of coef x (value - rhs), each term being >= 0 (a minimum: coef >= 0 on
   value - min; a maximum: coef <= 0 on value - max). The right side splits per slot, so its most is the sum of each
   slot's most of score + sum of coef x value (`slotAug`, at least 0: an empty slot adds 0), minus sum of coef x rhs.
   The coefficients come from a subgradient descent on that most at the root (the Lagrangian dual of the limits).
   Returns {terms: [{stat, coef, rhs}], slotAug} or null when no limit has a minimum or maximum. */
export function lagrangeBound(posList, limits, floor = 0, iterations = 300) {
  const terms = [];
  for (const l of limits) {
    if (l.min > 0) terms.push({ stat: l.stat, sign: 1, rhs: l.min });
    if (l.max != null) terms.push({ stat: l.stat, sign: -1, rhs: l.max });
  }
  if (!terms.length) return null;
  const n = posList.length;
  const values = posList.map(list => list.map(a => terms.map(t => a.eff[t.stat] || 0)));
  // the dual function at multipliers `lam` (>= 0, one per term): its value and a subgradient
  const dual = lam => {
    let total = 0;
    const grad = terms.map(t => -t.sign * t.rhs);
    const slotAug = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0,
        arg = -1;
      posList[i].forEach((a, c) => {
        let v = a.score;
        for (let j = 0; j < terms.length; j++) v += lam[j] * terms[j].sign * values[i][c][j];
        if (v > best) {
          best = v;
          arg = c;
        }
      });
      slotAug[i] = best;
      total += best;
      if (arg >= 0) for (let j = 0; j < terms.length; j++) grad[j] += terms[j].sign * values[i][arg][j];
    }
    for (let j = 0; j < terms.length; j++) total -= lam[j] * terms[j].sign * terms[j].rhs;
    return { total, grad, slotAug };
  };
  // Polyak steps toward `floor` (a score some set reaches, or 0): step = factor x (dual - floor) / |subgradient|^2, the
  // factor halved after 15 steps without a better dual
  let lam = terms.map(() => 0);
  let cur = dual(lam),
    best = cur,
    bestLam = lam,
    factor = 1,
    stale = 0;
  for (let it = 0; it < iterations; it++) {
    const norm2 = cur.grad.reduce((x, g) => x + g * g, 0);
    if (!norm2) break; // a zero subgradient: the minimum
    const step = (factor * (cur.total - floor)) / norm2;
    lam = lam.map((x, j) => Math.max(0, x - step * cur.grad[j]));
    cur = dual(lam);
    if (cur.total < best.total) {
      best = cur;
      bestLam = lam;
      stale = 0;
    } else if (++stale >= 15) {
      factor /= 2;
      stale = 0;
    }
  }
  return {
    terms: terms.map((t, j) => ({ stat: t.stat, coef: t.sign * bestLam[j], rhs: t.rhs })),
    slotAug: best.slotAug,
  };
}

/* Drop every candidate that no set holding it can lift to a minimum: the most a set with candidate `a` has of a stat
   is its own value plus the bounds of the other slots (suffixBounds; for a piece that blocks later slots, its own value
   less their bounds, as there), and for a ring, its value plus the most of any ring (the pair partner). When that is
   below a minimum, `a` goes (a "deficit budget": a piece short of its slot's best by more than the total room above
   the minimum). Dropping pieces lowers the bounds, so it repeats until nothing more goes. Exact: every set meeting the
   minimum keeps all its pieces. The two ring slots share one list and keep sharing it. */
export function dropShortfalls(slotList, posList, dims, limits) {
  const mins = limits.filter(l => l.min > 0);
  const posOf = new Map(slotList.map((t, i) => [t, i]));
  for (let round = 0; round < 10; round++) {
    const { remMax, slotMax } = suffixBounds(slotList, posList, dims);
    let dropped = false;
    const filtered = new Map();
    posList = posList.map((list, i) => {
      if (filtered.has(list)) return filtered.get(list);
      const isRing = slotList[i] === 'ring';
      const kept = list.filter(a =>
        mins.every(l => {
          const d = l.stat;
          const total = remMax[d][0];
          let most;
          if (isRing) {
            const top = Math.max(0, ...list.map(x => x.eff[d] || 0));
            const pair = remMax[d][i] - remMax[d][i + 2];
            most = total - pair + (a.eff[d] || 0) + top;
          } else {
            // own value less the bounds of the later slots it blocks, as suffixBounds counts it
            let own = a.eff[d] || 0;
            for (const b of a.blocks) if (posOf.get(b) > i) own -= slotMax[d][posOf.get(b)];
            most = total - slotMax[d][i] + own;
          }
          return most >= l.min;
        }),
      );
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
   `start` itself when no swap helps.
   Why: tier ranking's seed is the stage before's best for another key, which can be far from this stage's best: White
   Mage at level 100, exactly 2.32, Piety > Direct Hit > Determination, seeded its Determination search with 188 where
   710 was possible by changing the body and both rings, and the search ran 700,000 nodes without finding a better set.
   Exact: the result is a legal loadout meeting every limit, and the search after it still finds any strictly better
   one. A swap never fills or empties a slot: the new piece blocks the same slots as the old (none for an empty slot,
   which stays empty), and a slot a piece blocks is left alone. */
export function improveStart(slotList, posList, limits, start) {
  const n = slotList.length;
  const posOf = new Map(slotList.map((t, i) => [t, i]));
  const maskOf = blocks => blocks.reduce((m, b) => (posOf.has(b) ? m | (1 << posOf.get(b)) : m), 0);
  const best = start.best.slice();
  let score = start.score;
  const totals = limits.map(l => best.reduce((x, s) => x + (s?.cand?.eff[l.stat] || 0), 0));
  const fits = values => limits.every((l, k) => !(l.min > 0 && values[k] < l.min) && !(l.max != null && values[k] > l.max));
  if (!fits(totals)) return start;

  // the slots each position's piece blocks: an empty position names its blocker (blockedBy, the candidate or {item})
  const blockMask = i => {
    const item = best[i]?.cand?.item;
    if (!item) return 0;
    let mask = 0;
    for (let j = 0; j < n; j++) if (best[j]?.blockedBy && best[j].blockedBy.item === item) mask |= 1 << j;
    return mask;
  };
  let improved = false;
  for (let pass = 0; pass < 100; pass++) {
    let move = null;
    for (let i = 0; i < n; i++) {
      const old = best[i]?.cand;
      if (!old) continue; // an empty slot stays empty
      const oldMask = blockMask(i);
      for (const a of posList[i]) {
        if (a.score <= old.score + (move ? move.gain : 0)) continue;
        if (maskOf(a.blocks) !== oldMask) continue;
        let worn = 0;
        for (let j = 0; j < n; j++) if (j !== i && best[j]?.cand?.item.id === a.item.id) worn++;
        if (worn >= a.copies) continue;
        const values = limits.map((l, k) => totals[k] - (old.eff[l.stat] || 0) + (a.eff[l.stat] || 0));
        if (!fits(values)) continue;
        move = { i, a, gain: a.score - old.score, values };
      }
    }
    if (!move) break;
    // the blocked slots name the new piece as their blocker
    const oldItem = best[move.i].cand.item;
    for (let j = 0; j < n; j++) if (best[j]?.blockedBy && best[j].blockedBy.item === oldItem) best[j] = { ...best[j], blockedBy: move.a };
    best[move.i] = { cand: move.a, rank: -1 };
    move.values.forEach((v, k) => {
      totals[k] = v;
    });
    score += move.gain;
    improved = true;
  }
  return improved ? { best, score } : start;
}

/* The coefficients are fractions, so the Lagrangian bound is a float: a margin far above its rounding error (scores
   stay below 2^53, a relative error near 1e-16 per step) keeps every cut on the safe side. */
const lagrSlack = bound => 1 + Math.abs(bound) * 1e-9;

/* Reduced-cost fixing: the candidates of slot `i` worth searching against a known set scoring `known`. Forcing a
   candidate into its slot lowers the Lagrangian bound (lagrangeBound) by the slot's most minus the candidate's own
   priced value; when that leaves the bound at or below `known`, no set holding the candidate beats the known set, and
   the candidate goes. Exact: the bound is an upper bound for every set meeting the limits. */
export function fixByReducedCost(list, lagr, i, known) {
  const root = lagr.slotAug.reduce((a, b) => a + b, 0) - lagr.terms.reduce((a, t) => a + t.coef * t.rhs, 0);
  const gap = root - known + lagrSlack(root);
  return list.filter(a => {
    let aug = a.score;
    for (const t of lagr.terms) aug += t.coef * (a.eff[t.stat] || 0);
    return lagr.slotAug[i] - aug < gap;
  });
}

/* The order branchAndBound searches the slots in, after its filters: the slots no piece can block, shortest list first
   (the ring list counts twice: it fills two slots), then the slots a piece can block, in their order (still after
   every slot that blocks them; the two ring slots stay side by side). Returns perm, with perm[new position] = old
   position, or null when the order is the same.
   Exact: the search fills every slot whatever the order. Short lists first keep the top of the tree narrow and leave
   the long lists for the depths where the bounds and the memo are tightest. The order must come from the filtered
   lists: ordering by the lists before the filters (in buildCandidates) was slower than the order there (Perplexity's
   measurement, 2026-10-17). */
export function shortListsFirst(slotList, posList) {
  const blockable = new Set(posList.flatMap(list => list.flatMap(a => a.blocks)));
  const types = [...new Set(slotList)];
  const size = type => posList[slotList.indexOf(type)].length * (type === 'ring' ? 2 : 1);
  const free = types.filter(t => !blockable.has(t)).sort((x, y) => size(x) - size(y));
  const order = [];
  for (const type of [...free, ...types.filter(t => blockable.has(t))]) {
    order.push(type);
    if (type === 'ring') order.push('ring');
  }
  // each type's positions in the old order (the two ring slots keep theirs)
  const taken = new Set();
  const perm = order.map(type => {
    const old = slotList.findIndex((t, i) => t === type && !taken.has(i));
    taken.add(old);
    return old;
  });
  return perm.some((old, i) => old !== i) ? perm : null;
}

/* A search this small is over before a limit table for its blocked slots would pay for itself (one table takes 1 to
   50 ms; WHM at level 100 with sync off needs a few hundred nodes, synced searches 100,000 and more without them). */
const LAZY_TABLES = 2000;

/* With a known set, the search first runs this many nodes at most (the trial search) before it builds Pareto fronts:
   fronts take 0.1 to 1.4 s to build, often for a search the trial search settles in a few dozen nodes (Perplexity's
   measurements, 2026-10-17: 25 to 40% of the time on hard stages went to fronts built and then given up). */
const TRIAL_NODES = 20000;

/* The most states one memo key keeps when states compare by dominance (branchAndBound's memo). */
const MEMO_FRONT = 32;

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

  const posOf = new Map(slotList.map((slotType, i) => [slotType, i])); // blockable slots appear once (rings are never blocked)
  // the slots a candidate blocks, as a bit mask of positions
  const maskOf = blocks => blocks.reduce((mask, b) => (posOf.has(b) ? mask | (1 << posOf.get(b)) : mask), 0);
  const blockMaskOf = new Map(posList.flatMap(list => list.map(a => [a, maskOf(a.blocks)])));

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
    for (const list of posList) {
      for (const a of list) {
        let aug = a.score;
        for (const t of lagr.terms) aug += t.coef * (a.eff[t.stat] || 0);
        augOf.set(a, aug);
      }
    }
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

      // empty only when no candidate has a copy left (the cuts above say nothing about copies)
      if (!list.some(a => (used.get(a.item.id) || 0) < a.copies)) {
        chosen[pos] = { cand: null, rank: -1 };
        dfs(pos + 1, scoreSoFar);
        chosen[pos] = null;
      }
      return;
    }

    // without them: every candidate in score order
    let avail = 0;
    for (let rank = 0; rank < list.length; rank++) {
      const a = list[rank];
      if ((used.get(a.item.id) || 0) >= a.copies) continue;
      avail++;
      if (lagrCuts(a)) continue;
      tryChild(pos, rank, a, isRing2, scoreSoFar);
      if (truncated) return;
    }
    // empty only when no candidate has a copy left
    if (avail === 0) {
      chosen[pos] = { cand: null, rank: -1 };
      dfs(pos + 1, scoreSoFar);
      chosen[pos] = null;
    }
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
