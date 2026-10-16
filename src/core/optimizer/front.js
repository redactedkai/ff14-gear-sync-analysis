/* Optimizer: an exact search by Pareto fronts, for loadouts with limits whose candidate lists are short (after the
   search's filters: dropShortfalls and reduced-cost fixing in search.js). It builds, from the last slot back, every
   partial loadout of the slots from i on that no other one beats, and at slot 0 takes the best that meets every limit.
   Where branch and bound must prove that nothing beats the best set found (often the hard part: Dark Knight at level
   90, exactly 2.30, Critical Hit > Determination > Direct Hit, ran 450,000 nodes for a set it had from the start), the
   fronts settle it in one pass.

   A partial loadout (an entry) holds its score, its total of each limited stat, the slots it leaves empty and the slots
   its pieces block. Two entries compare only with the same empty and blocked slots and, under a speed maximum, the
   same speed: then the one with at least the score and at least every other limited total (a total past its minimum
   counts as the minimum, and so does speed past its minimum when it has no maximum: nothing before it can tell them
   apart) beats the other, since every way to finish the beaten one finishes the other with no less score and no
   broken limit. Entries that cannot beat `known` even with the most the earlier slots can add, or cannot reach a
   minimum, go too (Morin and Marsten's bounded dynamic programming). The rules for empty slots are the search's: a slot
   is empty when a chosen piece blocks it (checked on the whole loadout), when it has no candidates, or, for the second
   ring, when no ring has a copy left; the two ring slots are filled together, as a pair (the same item twice only with
   2 copies). */

/* The most entries one slot's front may hold, and the most extensions it may try over all slots (front x choices), before
   frontSearch gives up (the caller then searches as before). */
const FRONT_MOST = 150000;
const FRONT_TRIES = 1000000;

/**
 * @param slotList  slot sequence (search.js), rings twice in a row, blockable slots after every slot that blocks them
 * @param posList   candidate list per slot
 * @param limits    [{stat, min, max}] as branchAndBound's
 * @param known     the score to beat (a set already in hand), or -Infinity
 * @returns {best, entries, sizes} with best in branchAndBound's shape (null when nothing beats `known`) and sizes the
 *          front's size after each stage, last slot first; or null when a front grew too large (FRONT_MOST, FRONT_TRIES)
 */
export function frontSearch(slotList, posList, limits, known = -Infinity) {
  const n = slotList.length;
  const nL = limits.length;
  const posOf = new Map(slotList.map((t, i) => [t, i]));
  const bitOf = t => (posOf.has(t) ? 1 << posOf.get(t) : 0);
  const blocksOf = new Map();
  for (const list of posList)
    for (const a of list)
      if (!blocksOf.has(a))
        blocksOf.set(
          a,
          a.blocks.reduce((m, b) => m | bitOf(b), 0),
        );
  const blockable = posList.reduce((m, list) => m | list.reduce((x, a) => x | blocksOf.get(a), 0), 0);
  // a limited total as entries compare it: capped at the minimum unless the stat has a maximum
  const capOf = limits.map(l => (l.max == null ? (l.min > 0 ? l.min : 0) : Infinity));
  const exactK = limits.findIndex(l => l.max != null);

  // stages from the last slot back: one per slot, the two ring slots as one; each stage's choices as
  // {score, vals, blocks, slots: [{cand} per position]}
  const stages = [];
  for (let i = n - 1; i >= 0; i--) {
    if (slotList[i] === 'ring' && i > 0 && slotList[i - 1] === 'ring') {
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
    acc.score += Math.max(0, ...st.choices.map(c => c.score));
    for (let k = 0; k < nL; k++) acc.vals[k] += Math.max(0, ...st.choices.map(c => c.vals[k]));
    before[s] = acc;
  }

  let front = [{ score: 0, vals: new Float64Array(nL), empty: 0, blocked: 0, choice: null, next: null }];
  let entries = 0,
    tries = 0;
  const sizes = [];
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
    front = paretoFilter(out, nL, exactK);
    sizes.push(front.length);
    if (front.length > FRONT_MOST) front = null;
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

/* The entries no other one beats: same empty and blocked slots (and the same speed under a maximum, limit `exactK`),
   at least the score and every other limited total. By score, highest first, so a beater is always kept first. */
function paretoFilter(entries, nL, exactK) {
  entries.sort((x, y) => y.score - x.score);
  const groups = new Map();
  const kept = [];
  for (const e of entries) {
    const key = `${e.empty}|${e.blocked}|${exactK >= 0 ? e.vals[exactK] : ''}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    let beaten = false;
    for (const f of g) {
      let all = true;
      for (let k = 0; k < nL; k++) {
        if (k !== exactK && f.vals[k] < e.vals[k]) {
          all = false;
          break;
        }
      }
      if (all) {
        beaten = true;
        break;
      }
    }
    if (beaten) continue;
    g.push(e);
    kept.push(e);
  }
  return kept;
}
