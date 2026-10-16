/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a speed minimum that the remaining
   slots can no longer reach. */

/* Most two rings can add together on f(a) >= 0: the best ring twice only if that item has 2 copies, otherwise the best
   plus the best other item (the best alone when there is no other: the second ring slot stays empty). Any legal pair
   containing the best item is at most this, and any pair without it is too, since its larger member is at most the
   best other item. Candidates of one item share `it`, so a Unique ring is never counted twice. */
function bestPair(list, f) {
  let top = null;
  for (const a of list) if (!top || f(a) > f(top)) top = a;
  if (!top) return 0;
  if (top.copies >= 2) return 2 * f(top);
  let other = 0;
  for (const a of list) if (a.it !== top.it) other = Math.max(other, f(a));
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
  for (let i = n - 1; i >= 0; i--) {
    const list = posList[i];
    if (slotList[i] === 'ring' && slotList[i + 1] === 'ring') {
      dims.forEach(d => {
        remMax[d][i] = remMax[d][i + 2] + bestPair(list, a => Math.max(0, a.v[d]));
      });
      remSc[i] = remSc[i + 2] + bestPair(list, a => a.sc);
      continue;
    }
    // the bound of one piece here, less the bounds of the later slots it blocks
    const own = (a, value, bounds) => (a.blocks || []).reduce((x, b) => (posOf.get(b) > i ? x - bounds[posOf.get(b)] : x), value);
    dims.forEach(d => {
      slotMax[d][i] = Math.max(0, ...list.map(a => own(a, a.v[d], slotMax[d])));
      remMax[d][i] = remMax[d][i + 1] + slotMax[d][i];
    });
    slotSc[i] = Math.max(0, ...list.map(a => own(a, a.sc, slotSc)));
    remSc[i] = remSc[i + 1] + slotSc[i];
  }
  return { remMax, remSc, slotMax, slotSc };
}

/* spdMin, spdMax: optional bounds on the speed total (null for none).
   Returns {best, nodes, truncated}; best[i] = {a: candidate | null, rank, blockedBy?} or best = null if nothing is
   feasible. A slot is left empty when a chosen piece blocks it (blockedBy: that candidate; buildCandidates puts
   blockable slots last) or when every candidate's copies are used up. A blocked slot adds 0, so while a chosen piece
   blocks a later slot, that slot's best score and speed come off the bounds (without this a cloak's branch, whose
   bound still counted a head, was almost never pruned under sync). */
export function branchAndBound({ slotList, posList, dims, spdMin, spdMax, nodeLimit }) {
  const nSlots = slotList.length;
  const { remMax, remSc, slotMax, slotSc } = suffixBounds(slotList, posList, dims);
  let best = null,
    bestSc = -Infinity,
    nodes = 0,
    truncated = false;
  const cur = {};
  dims.forEach(d => {
    cur[d] = 0;
  });
  const chosen = new Array(nSlots).fill(null);
  const used = new Map();
  const blockedBy = new Map(); // slot type -> the chosen candidate that leaves it empty
  const posOf = new Map(slotList.map((t, i) => [t, i])); // blockable slots appear once (rings are never blocked)
  // per-slot bounds (suffixBounds) of the slots a chosen piece blocks come off the remaining bound
  const maxSc = slotSc;
  const maxSpd = dims.includes('spd') ? slotMax.spd : new Array(nSlots).fill(0);
  let blockedSc = 0, // bounds of the later slots currently blocked
    blockedSpd = 0;

  function dfs(pos, sc) {
    if (truncated) return;
    if (++nodes > nodeLimit) {
      truncated = true;
      return;
    }
    if (pos === nSlots) {
      if (spdMin != null && cur.spd < spdMin) return;
      if (sc > bestSc) {
        bestSc = sc;
        best = chosen.slice();
      }
      return;
    }
    if (sc + remSc[pos] - blockedSc <= bestSc) return;
    if (spdMin != null && cur.spd + remMax.spd[pos] - blockedSpd < spdMin) return;

    const t = slotList[pos];
    if (blockedBy.has(t)) {
      blockedSc -= maxSc[pos];
      blockedSpd -= maxSpd[pos];
      chosen[pos] = { a: null, rank: -1, blockedBy: blockedBy.get(t) };
      dfs(pos + 1, sc);
      chosen[pos] = null;
      blockedSc += maxSc[pos];
      blockedSpd += maxSpd[pos];
      return;
    }
    const list = posList[pos];
    // the two ring slots share one list; the 2nd ring never ranks before the 1st, so each pair is tried once
    const isRing2 = t === 'ring' && pos > 0 && slotList[pos - 1] === 'ring';
    let avail = 0;
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      const u = used.get(a.it.id) || 0;
      if (u >= a.copies) continue;
      avail++;
      if (isRing2) {
        const prev = chosen[pos - 1];
        if (prev && prev.rank > k) continue;
      }
      if (spdMax != null && cur.spd + a.v.spd > spdMax) continue;
      dims.forEach(d => {
        cur[d] += a.v[d];
      });
      used.set(a.it.id, u + 1);
      const later = a.blocks.map(b => posOf.get(b)).filter(p => p > pos);
      for (const b of a.blocks) blockedBy.set(b, a);
      for (const p of later) {
        blockedSc += maxSc[p];
        blockedSpd += maxSpd[p];
      }
      chosen[pos] = { a, rank: k };
      dfs(pos + 1, sc + a.sc);
      chosen[pos] = null;
      for (const p of later) {
        blockedSc -= maxSc[p];
        blockedSpd -= maxSpd[p];
      }
      for (const b of a.blocks) blockedBy.delete(b);
      used.set(a.it.id, u);
      dims.forEach(d => {
        cur[d] -= a.v[d];
      });
      if (truncated) return;
    }
    if (avail === 0) {
      chosen[pos] = { a: null, rank: -1 };
      dfs(pos + 1, sc);
      chosen[pos] = null;
    }
  }

  dfs(0, 0);
  return { best, nodes, truncated };
}
