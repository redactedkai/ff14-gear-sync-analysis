/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a speed minimum that the remaining
   slots can no longer reach. With a speed rule it also bounds the score by the speed still needed (speed tables), tries
   children in order of that bound, and cuts states it has already seen (the memo). */

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

/* Speed tables: bound(i, c) = an upper bound on the score slots i.. can still add when the speed so far is c, given the
   speed rule. Each slot on its own: copy limits are ignored (a Unique ring may count twice) and a slot some piece can
   block may stay empty, so the bound never falls below what a legal loadout can add, and the search stays exact.
   - Minimum only: need[i][r] = most score slots i.. add while adding at least r speed (r up to the minimum), built on
     each slot's (score, speed) frontier: the best score at each speed, keeping a speed only if no faster one scores as
     much.
   - Maximum too: exact[i][s] = most score slots i.. add while adding exactly s speed (s up to the maximum), from each
     slot's best score at each speed. The bound is its best over the speeds that still land in [min, max], read in O(1)
     from a prefix maximum (when the minimum is already met) or a window maximum the band's width.
   Speeds below 0 count as 0; candidates faster than the maximum are left out (they can never be worn). `empty`: the
   positions of slots a piece already chosen blocks, which add nothing. Each returned function has `top(i)`, its most
   at any speed so far. Returns null when the rule has neither a minimum above 0 nor a maximum. */
export function speedTables(slotList, posList, spdMin, spdMax, empty = null) {
  const n = slotList.length;
  const lo = spdMin > 0 ? spdMin : 0;
  const blockable = new Set(posList.flatMap(list => list.flatMap(a => a.blocks)));
  const spdOf = a => Math.max(0, a.eff.spd || 0);

  // slots a legal loadout can leave empty: a blockable slot, a slot with no candidates, and a ring slot when the ring
  // list cannot fill both (copies of distinct items below 2: a lone Unique ring is worn once). Counting a piece in such a
  // slot would add speed a loadout may not have, which a maximum can then wrongly reject
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

  // a maximum no loadout can pass is no rule at all, and the table for it would be needlessly long
  const mostSpd = posList.reduce((sum, list, i) => sum + (blockedNow(i) ? 0 : Math.max(0, ...list.map(spdOf))), 0);
  if (spdMax != null && spdMax >= mostSpd) spdMax = null;
  if (!lo && spdMax == null) return null;

  if (spdMax == null) {
    // need[i][r]: the most score slots i.. add while adding at least r more speed (r = 0..lo)
    const need = new Array(n + 1);
    need[n] = new Float64Array(lo + 1).fill(-Infinity);
    need[n][0] = 0;
    for (let i = n - 1; i >= 0; i--) {
      const next = need[i + 1];

      // this slot's choices as [score, speed], fastest first; the frontier keeps one only if it outscores every faster one
      const choices = blockedNow(i) ? [] : posList[i].map(a => [a.score, spdOf(a)]);
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
      // later slots add for the speed still needed after it
      const row = new Float64Array(lo + 1);
      for (let r = 0; r <= lo; r++) {
        let most = -Infinity;
        for (const [score, spd] of frontier) {
          const v = score + next[r > spd ? r - spd : 0];
          if (v > most) most = v;
        }
        row[r] = most;
      }
      need[i] = row;
    }

    const bound = (i, spdSoFar) => {
      const r = lo - spdSoFar;
      return need[i][r > 0 ? r : 0];
    };
    bound.top = i => need[i][0]; // the most at any speed so far (need is highest with nothing more needed)
    return bound;
  }

  // a band (a maximum too)
  const max = spdMax;
  if (max < lo) return Object.assign(() => -Infinity, { top: () => -Infinity });
  const width = max - lo; // the band's width: a speed so far of c still lands in it with lo - c to max - c more

  // per slot i, from exact[i] (exact[i][x]: the most score slots i.. add with exactly x more speed):
  // prefixMax[i][x] = the most with at most x more, windowMax[i][x] = the most with x to x + width more
  const prefixMax = new Array(n + 1),
    windowMax = new Array(n + 1);
  const storeMaxima = (i, exact) => {
    const prefix = new Float64Array(max + 1);
    let most = -Infinity;
    for (let x = 0; x <= max; x++) prefix[x] = most = exact[x] > most ? exact[x] : most;
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

  // exact rows from the last slot back: slot i's best score at each speed, plus the later slots' row
  let exact = new Float64Array(max + 1).fill(-Infinity);
  exact[0] = 0;
  storeMaxima(n, exact);
  for (let i = n - 1; i >= 0; i--) {
    // this slot's best score at each speed it can add
    const bestAt = new Map();
    for (const a of blockedNow(i) ? [] : posList[i]) {
      const spd = spdOf(a);
      if (spd <= max && !(bestAt.get(spd) >= a.score)) bestAt.set(spd, a.score);
    }
    if ((blockedNow(i) || canEmpty(i)) && !(bestAt.get(0) >= 0)) bestAt.set(0, 0);

    const prev = exact;
    exact = new Float64Array(max + 1).fill(-Infinity);
    for (const [spd, score] of bestAt) {
      for (let x = spd; x <= max; x++) {
        const v = score + prev[x - spd];
        if (v > exact[x]) exact[x] = v;
      }
    }
    storeMaxima(i, exact);
  }

  const bound = (i, spdSoFar) => {
    const roomLeft = max - spdSoFar;
    if (roomLeft < 0) return -Infinity;
    const stillNeeded = lo - spdSoFar;
    return stillNeeded <= 0 ? prefixMax[i][roomLeft] : windowMax[i][stillNeeded];
  };
  bound.top = i => prefixMax[i][max]; // the most at any speed so far
  return bound;
}

/* A search this small is over before a speed table for its blocked slots would pay for itself (one table takes 1 to
   50 ms; WHM at level 100 with sync off needs a few hundred nodes, synced searches 100,000 and more without them). */
const LAZY_TABLES = 2000;

/* spdMin, spdMax: optional bounds on the speed total (null for none).
   Returns {best, nodes, truncated}; best[i] = {cand: candidate | null, rank, blockedBy?} or best = null if nothing is
   feasible. A slot is left empty when a chosen piece blocks it (blockedBy: that candidate; buildCandidates puts
   blockable slots last) or when every candidate's copies are used up. A blocked slot adds 0, so while a chosen piece
   blocks a later slot, that slot's best score and speed come off the bounds (without this a cloak's branch, whose
   bound still counted a head, was almost never pruned under sync).
   With a speed rule (and `spd` among dims) three more things, all exact:
   - the speed tables (speedTables) bound the score by the speed still needed, one table per set of blocked slots,
     where those slots add nothing (with one table for all, a White Mage search with a two-handed weapon still counted
     the best shield and ran 110,000 to 420,000 nodes at item level 400 instead of under 120);
   - children are grouped by speed and the slots they block, groups tried best bound first, and each group scanned by
     score down to the first candidate that cannot beat the best loadout so far (within a group the speed term of the
     bound is the same);
   - the memo: two partial loadouts at the same slot with the same speed total (a total past a minimum with no maximum
     counts as the minimum: nothing after it can tell them apart), the same blocked slots and, at the second ring slot,
     the same first ring have the same completions, so the later one is cut unless it scores more. */
export function branchAndBound({ slotList, posList, dims, spdMin, spdMax, nodeLimit, plain = false, lazyTables = LAZY_TABLES }) {
  const nSlots = slotList.length;
  const { remMax, remSc, slotMax, slotSc } = suffixBounds(slotList, posList, dims);

  // `plain` (tests and perf scripts only): none of the speed-rule extras, to check them against the plain search
  const speedBound = !plain && dims.includes('spd') ? speedTables(slotList, posList, spdMin, spdMax) : null;
  const posOf = new Map(slotList.map((slotType, i) => [slotType, i])); // blockable slots appear once (rings are never blocked)
  // the slots a candidate blocks, as a bit mask of positions
  const maskOf = blocks => blocks.reduce((mask, b) => (posOf.has(b) ? mask | (1 << posOf.get(b)) : mask), 0);
  const blockMaskOf = new Map(posList.flatMap(list => list.map(a => [a, maskOf(a.blocks)])));

  // speed tables for each set of blocked slots (speedBound is the one for none), built when first needed: once a chosen
  // piece blocks a slot (a two-handed weapon the off-hand, a cloak the head) that slot adds nothing, while the table
  // for none still counts its best piece. Below LAZY_TABLES nodes the table for none stands in (a looser bound)
  let nodes = 0; // search nodes so far (also read by speedBoundFor)
  const tables = new Map([[0, speedBound]]);
  const speedBoundFor = mask => {
    let table = tables.get(mask);
    if (table === undefined) {
      if (nodes < lazyTables) return speedBound;
      const empty = new Set();
      for (let i = 0; i < slotList.length; i++) if (mask & (1 << i)) empty.add(i);
      table = speedTables(slotList, posList, spdMin, spdMax, empty) || speedBound;
      tables.set(mask, table);
    }
    return table;
  };

  // search state, changed by tryChild and restored when it returns
  let blockedMask = 0; // blocked slots now, as a mask
  let best = null,
    bestScore = -Infinity,
    truncated = false;
  const totals = {};
  dims.forEach(d => {
    totals[d] = 0;
  });
  const chosen = new Array(nSlots).fill(null);
  const used = new Map();
  const blockedBy = new Map(); // slot type -> the chosen candidate that leaves it empty

  // per-slot bounds (suffixBounds) of the slots a chosen piece blocks come off the remaining bound
  const slotSpd = dims.includes('spd') ? slotMax.spd : new Array(nSlots).fill(0);
  let blockedSc = 0, // bounds of the later slots currently blocked
    blockedSpd = 0;

  // groups[pos]: the slot's candidates split by (speed, blocked slots), each group's [rank, candidate] list by score,
  // highest first, and the groups by their best score, highest first; `i` keeps a group's first-seen order for ties
  const groups = speedBound
    ? posList.map(list => {
        const byKey = new Map();
        list.forEach((a, rank) => {
          const spd = Math.max(0, a.eff.spd || 0);
          const mask = blockMaskOf.get(a);
          const key = `${spd}|${mask}`;
          if (!byKey.has(key)) byKey.set(key, { spd, mask, list: [] });
          byKey.get(key).list.push([rank, a]);
        });
        const slotGroups = [...byKey.values()].map((g, i) => ({ ...g, i, list: g.list.sort((x, y) => y[1].score - x[1].score) }));
        return slotGroups.sort((x, y) => y.list[0][1].score - x.list[0][1].score);
      })
    : null;

  // the memo (see "the memo" above): best score seen per state
  const seen = speedBound ? new Map() : null;
  const memoSpd = spdMax == null && spdMin > 0 ? s => (s < spdMin ? s : spdMin) : s => s;

  // put candidate a (at `rank` in its slot's list) in slot pos and search on; false when it is not allowed there
  function tryChild(pos, rank, a, isRing2, scoreSoFar) {
    const usedCount = used.get(a.item.id) || 0;
    if (usedCount >= a.copies) return false;
    if (isRing2) {
      const prev = chosen[pos - 1];
      if (prev && prev.rank > rank) return false;
    }
    if (spdMax != null && totals.spd + a.eff.spd > spdMax) return false;

    // wear it
    dims.forEach(d => {
      totals[d] += a.eff[d];
    });
    used.set(a.item.id, usedCount + 1);
    const laterBlocked = a.blocks.map(b => posOf.get(b)).filter(p => p > pos);
    for (const b of a.blocks) blockedBy.set(b, a);
    for (const p of laterBlocked) {
      blockedSc += slotSc[p];
      blockedSpd += slotSpd[p];
    }
    const prevMask = blockedMask;
    blockedMask |= blockMaskOf.get(a);
    chosen[pos] = { cand: a, rank };

    dfs(pos + 1, scoreSoFar + a.score);

    // take it off again
    chosen[pos] = null;
    blockedMask = prevMask;
    for (const p of laterBlocked) {
      blockedSc -= slotSc[p];
      blockedSpd -= slotSpd[p];
    }
    for (const b of a.blocks) blockedBy.delete(b);
    used.set(a.item.id, usedCount);
    dims.forEach(d => {
      totals[d] -= a.eff[d];
    });
    return true;
  }

  function dfs(pos, scoreSoFar) {
    if (truncated) return;
    if (++nodes > nodeLimit) {
      truncated = true;
      return;
    }
    if (pos === nSlots) {
      if (spdMin != null && totals.spd < spdMin) return;
      if (scoreSoFar > bestScore) {
        bestScore = scoreSoFar;
        best = chosen.slice();
      }
      return;
    }

    // cut: even the best the remaining slots can add does not beat the best loadout so far, or cannot reach the minimum
    if (scoreSoFar + remSc[pos] - blockedSc <= bestScore) return;
    if (spdMin != null && totals.spd + remMax.spd[pos] - blockedSpd < spdMin) return;
    if (speedBound && scoreSoFar + speedBoundFor(blockedMask)(pos, totals.spd) <= bestScore) return;
    if (seen && pos > 0) {
      const prev = slotList[pos] === 'ring' && slotList[pos - 1] === 'ring' ? chosen[pos - 1] : null;
      // the state packed into one integer, exact below 2^53: the first ring's rank + 1 at the second ring slot, else 0
      // (< 256); the blocked-slot mask (12 slots, < 4096); the position (< 32); the speed so far plus 50,000 (< 1e5)
      const key = (((prev ? prev.rank + 1 : 0) * 4096 + blockedMask) * 32 + pos) * 1e5 + memoSpd(totals.spd) + 5e4;
      const was = seen.get(key);
      if (was !== undefined && was >= scoreSoFar) return;
      seen.set(key, scoreSoFar);
    }

    // a slot a chosen piece blocks stays empty
    const slotType = slotList[pos];
    if (blockedBy.has(slotType)) {
      blockedSc -= slotSc[pos];
      blockedSpd -= slotSpd[pos];
      chosen[pos] = { cand: null, rank: -1, blockedBy: blockedBy.get(slotType) };
      dfs(pos + 1, scoreSoFar);
      chosen[pos] = null;
      blockedSc += slotSc[pos];
      blockedSpd += slotSpd[pos];
      return;
    }

    const list = posList[pos];
    // the two ring slots share one list; the 2nd ring never ranks before the 1st, so each pair is tried once
    const isRing2 = slotType === 'ring' && pos > 0 && slotList[pos - 1] === 'ring';

    // with a speed rule: try the groups (same speed, same blocked slots) best bound first
    if (groups) {
      const slotGroups = groups[pos];
      // only the groups that can still beat the best so far (the loop below skips the others anyway); groups come by
      // top score, highest first, so once even the table's most at any speed cannot lift one past it, none can
      const order = [];
      const top = speedBound.top(pos + 1);
      for (let i = 0; i < slotGroups.length; i++) {
        const head = scoreSoFar + slotGroups[i].list[0][1].score;
        if (head + top <= bestScore) break;
        const restBound = speedBoundFor(blockedMask | slotGroups[i].mask)(pos + 1, totals.spd + slotGroups[i].spd);
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
        for (const [rank, a] of groupList) {
          if (scoreSoFar + a.score + restBound <= bestScore) break;
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

    // without one: every candidate in score order
    let avail = 0;
    for (let rank = 0; rank < list.length; rank++) {
      const a = list[rank];
      if ((used.get(a.item.id) || 0) >= a.copies) continue;
      avail++;
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

  dfs(0, 0);
  return { best, nodes, truncated };
}
