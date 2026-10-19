/* Optimizer: an exact search by Pareto fronts, for loadouts with limits whose candidate lists are short (after the
   search's filters: dropShortfalls and reduced-cost fixing in search.js). It builds, from the last slot back, every
   partial loadout of the slots from i on that no other one beats, and at slot 0 takes the best that meets every limit.
   Where branch and bound must prove that nothing beats the best set found (often the hard part: Dark Knight at level
   90, exactly 2.30, Critical Hit > Determination > Direct Hit, ran 450,000 nodes for a set it had from the start), the
   fronts settle it in one pass.

   A partial loadout (an entry) holds its score, its total of each limited stat, the slots it leaves empty and the slots
   its pieces block. Two entries compare only with the same empty and blocked slots and, under a speed band, the
   same speed: then the one with at least the score and at least every other limited total (a total past its minimum
   counts as the minimum, and so does speed past its minimum when it has no maximum: nothing before it can tell them
   apart; for a total with a maximum only, at most) beats the other, since every way to finish the beaten one finishes
   the other with no less score and no broken limit. A regain cut's total (search.js, regain.js) is not compared: any
   way to finish the beaten one into a loadout meeting the real limits finishes the other into one too, and such a
   loadout always meets the cut. Entries that cannot beat `known` even with the most the earlier slots can add, or
   cannot reach a minimum, go too (Morin and Marsten's bounded dynamic programming). The rules for empty slots are the
   search's: a slot is empty when a chosen piece blocks it (checked on the whole loadout), when it has no candidates,
   or, for the second ring, when no ring has a copy left; the two ring slots are filled together, as a pair (the same
   item twice only with 2 copies). */
import { blockableTypes, positionMask, slotPositions } from './slot-index.js';

/* The most entries one slot's front may hold, and the most extensions it may try over all slots (front x choices), before
   frontSearch gives up (the caller then searches as before). */
const FRONT_MOST = 150000;
const FRONT_TRIES = 1000000;
/* The most entry comparisons the fronts' dominance filter may make in all (paretoFilter), about 0.1 to 0.3 s. */
const FRONT_COMPARES = 30000000;

/**
 * @param slotList  slot sequence (search.js), rings twice in a row, blockable slots after every slot that blocks them
 * @param posList   candidate list per slot
 * @param limits    [{stat, min, max}] as branchAndBound's
 * @param known     the score to beat (a set already in hand), or -Infinity
 * @returns {best, entries, sizes} with best in branchAndBound's shape (null when nothing beats `known`) and sizes the
 *          front's size after each stage, last slot first; or null when a front grew too large (FRONT_MOST, FRONT_TRIES,
 *          FRONT_COMPARES) or a limit other than the first band is a band too
 */
export function frontSearch(slotList, posList, limits, known = -Infinity) {
  const n = slotList.length;
  const nL = limits.length;
  // each candidate's blocked slots, and every slot some candidate can block, as position masks
  const positions = slotPositions(slotList);
  const blocksOf = new Map();
  for (const list of posList) for (const cand of list) if (!blocksOf.has(cand)) blocksOf.set(cand, positionMask(cand.blocks, positions));
  const blockable = positionMask([...blockableTypes(posList)], positions);
  // a limited total as entries compare it: capped at the minimum unless the stat has a maximum
  const capOf = limits.map(l => (l.max == null ? (l.min > 0 ? l.min : 0) : Infinity));
  // how entries compare on each limit: a band (speed's, exactK) only between equal totals; a maximum only, less is
  // better; a regain cut not at all (entries past its maximum go, and no loadout meeting the real limits breaks it:
  // regain.js), the rest more is better. A second band is not supported: the caller then searches
  const isBand = limits.map(l => l.max != null && l.min > 0);
  const exactK = isBand.indexOf(true);
  if (isBand.lastIndexOf(true) !== exactK) return null;
  const compare = limits.map((l, k) => (k === exactK || l.cut ? 0 : l.max != null ? -1 : 1));

  // stages from the last slot back: one per slot, the two ring slots as one; each stage's choices as
  // {score, vals, blocks, slots: [{cand} per position]}
  const stages = [];
  for (let i = n - 1; i >= 0; i--) {
    if (slotList[i] === 'ring' && i > 0 && slotList[i - 1] === 'ring') {
      // the pairs alone would pass FRONT_TRIES (and building millions of them overflowed the stack below: Scholar at
      // level 100, a Target GCD, about 2,000 ring candidates): give up before building them
      const rings = posList[i - 1].length;
      if ((rings * (rings + 1)) / 2 > FRONT_TRIES) return null;
      stages.push({ from: i - 1, choices: ringChoices(posList[i - 1]) });
      i--;
      continue;
    }
    const list = posList[i];
    const choices = list.map(a => ({ cands: [a] }));
    if (!list.length) choices.push({ cands: [null], unfilled: true });
    if (blockable & (1 << i)) choices.push({ cands: [null], emptyBit: 1 << i });
    stages.push({ from: i, choices });
  }
  for (const st of stages) {
    for (const c of st.choices) {
      c.score = 0;
      c.vals = new Float64Array(nL);
      c.blocks = 0;
      for (const a of c.cands) {
        if (!a) continue;
        c.score += a.score;
        for (let k = 0; k < nL; k++) c.vals[k] += a.eff[limits[k].stat] || 0;
        c.blocks |= blocksOf.get(a);
      }
    }
  }

  // the most the slots before stage s (in slot order) can add: score, and each limited stat
  const before = stages.map(() => ({ score: 0, vals: new Float64Array(nL) }));
  for (let s = stages.length - 2; s >= 0; s--) {
    const st = stages[s + 1];
    const acc = { score: before[s + 1].score, vals: Float64Array.from(before[s + 1].vals) };
    // loops, not Math.max(...list): a long list as arguments overflows the stack
    let top = 0;
    for (const c of st.choices) if (c.score > top) top = c.score;
    acc.score += top;
    for (let k = 0; k < nL; k++) {
      let most = 0;
      for (const c of st.choices) if (c.vals[k] > most) most = c.vals[k];
      acc.vals[k] += most;
    }
    before[s] = acc;
  }

  let front = [{ score: 0, vals: new Float64Array(nL), empty: 0, blocked: 0, choice: null, next: null }];
  let entries = 0,
    tries = 0;
  const sizes = [];
  const work = { compares: 0 }; // entry comparisons in paretoFilter, over all stages
  stages.forEach((st, s) => {
    if (!front) return;
    tries += front.length * st.choices.length;
    if (tries > FRONT_TRIES) {
      front = null;
      return;
    }
    const room = before[s];
    const out = [];
    for (const e of front) {
      for (const c of st.choices) {
        const score = e.score + c.score;
        if (score + room.score <= known) continue;
        const vals = new Float64Array(nL);
        let ok = true;
        for (let k = 0; k < nL && ok; k++) {
          const total = e.vals[k] + c.vals[k];
          const l = limits[k];
          if (l.max != null && total > l.max) ok = false;
          else if (l.min > 0 && total + room.vals[k] < l.min) ok = false;
          vals[k] = Math.min(capOf[k], total);
        }
        if (!ok) continue;
        out.push({ score, vals, empty: e.empty | (c.emptyBit || 0), blocked: e.blocked | c.blocks, choice: c, next: e });
      }
    }
    entries += out.length;
    front = paretoFilter(out, exactK, compare, work);
    if (front) sizes.push(front.length);
  });
  if (!front) return null;

  // the best full loadout: empty slots exactly the blocked ones, every minimum met
  let best = null;
  for (const e of front) {
    if (e.empty !== (e.blocked & blockable)) continue;
    if (limits.some((l, k) => l.min > 0 && e.vals[k] < Math.min(capOf[k], l.min))) continue;
    if (e.score > known && (!best || e.score > best.score)) best = e;
  }
  if (!best) return { best: null, entries, sizes };

  // back to slots: follow the entries, each stage's choice filling its positions
  const slots = new Array(n).fill(null);
  const chosen = [];
  for (let e = best, s = stages.length - 1; e && e.choice; e = e.next, s--) {
    const st = stages[s];
    e.choice.cands.forEach((a, j) => {
      slots[st.from + j] = a ? { cand: a, rank: -1 } : { cand: null, rank: -1 };
      if (a) chosen.push(a);
    });
  }
  // the piece that blocks each empty slot
  slots.forEach((slot, i) => {
    if (slot.cand) return;
    const by = chosen.find(a => blocksOf.get(a) & (1 << i));
    if (by) slot.blockedBy = by;
  });
  return { best: { slots, score: best.score }, entries, sizes };
}

/* The legal ring pairs from one list, as the search makes them: two candidates, the second not before the first in the
   list, the same item twice only with 2 copies; a lone ring with the second slot empty only when no pair exists; both
   empty only when the list is. */
function ringChoices(list) {
  const pairs = [];
  for (let x = 0; x < list.length; x++) {
    for (let y = x; y < list.length; y++) {
      const a = list[x],
        b = list[y];
      if (a.item === b.item && a.copies < 2) continue;
      pairs.push({ cands: [a, b] });
    }
  }
  if (pairs.length) return pairs;
  if (list.length) return list.map(a => ({ cands: [a, null] }));
  return [{ cands: [null, null] }];
}

/* The entries no other one beats: same empty and blocked slots (and the same speed under a band, limit `exactK`), at
   least the score and at least every compared total (compare[k]: 1 more is better, -1 less is better, 0 not compared;
   frontSearch). By score, highest first, so a beater is always kept first.
   With at most two compared totals (the common case) a group's kept entries reduce to a staircase (beatenOnStairs):
   one binary search per entry. With more, each entry is compared with every kept one of its group, so a large front
   costs its size squared: null as soon as those comparisons (work.compares, summed over the stages) pass
   FRONT_COMPARES (Black Mage at level 90, item level 660, 2.32 or faster, Critical Hit > Determination > Direct Hit,
   food off: 21 s in this loop before the front gave up on its size, then a 25,000-node search). Null too as soon as
   more than FRONT_MOST are kept. */
function paretoFilter(entries, exactK, compare, work) {
  entries.sort((x, y) => y.score - x.score);
  // the compared totals of an entry, each turned so that more is better
  const compared = compare.flatMap((sign, k) => (sign ? [k] : []));
  const comparedValue = (e, j) => (j < compared.length ? compare[compared[j]] * e.vals[compared[j]] : 0);
  const groups = new Map();
  const kept = [];
  for (const e of entries) {
    const key = `${e.empty}|${e.blocked}|${exactK >= 0 ? e.vals[exactK] : ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { stairs: [], values: [] };
      groups.set(key, group);
    }
    if (compared.length <= 2) {
      work.compares++;
      if (beatenOnStairs(group.stairs, comparedValue(e, 0), comparedValue(e, 1))) continue;
    } else {
      work.compares += group.values.length;
      if (work.compares > FRONT_COMPARES) return null;
      const values = compared.map((_, j) => comparedValue(e, j));
      if (group.values.some(other => other.every((v, j) => v >= values[j]))) continue;
      group.values.push(values);
    }
    kept.push(e);
    if (kept.length > FRONT_MOST) return null;
  }
  return kept;
}

/* Dominance in two totals (x, y) by a staircase: `stairs` holds the kept points by x falling, y rising, so the points
   with x >= a new point's x are a prefix, and the last of them has the most y. Returns true when that one has
   y >= the new y (some kept point beats it); otherwise puts the new point in, dropping the points after it that it
   beats (x below it and y <= its y: a run from where it goes), and returns false. One total: y is 0 for every point;
   none: x and y are 0, and the first point beats every later one. */
function beatenOnStairs(stairs, x, y) {
  // first index with a smaller x
  let lo = 0,
    hi = stairs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stairs[mid].x >= x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && stairs[lo - 1].y >= y) return true;
  let end = lo;
  while (end < stairs.length && stairs[end].y <= y) end++;
  stairs.splice(lo, end - lo, { x, y });
  return false;
}
