/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a speed minimum that the remaining
   slots can no longer reach. */

/* remMax[d][i]: most of dimension d slots i.. can still add; remSc[i]: best score they can still add. */
export function suffixBounds(posList, dims) {
  const n = posList.length;
  const remMax = {};
  dims.forEach(d => {
    remMax[d] = new Array(n + 1).fill(0);
  });
  const remSc = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    dims.forEach(d => {
      remMax[d][i] = remMax[d][i + 1] + Math.max(0, ...posList[i].map(a => a.v[d]));
    });
    remSc[i] = remSc[i + 1] + Math.max(...posList[i].map(a => a.sc));
  }
  return { remMax, remSc };
}

/* spdMin, spdMax: optional bounds on the speed total (null for none).
   Returns {best, nodes, truncated}; best[i] = {a: candidate | null, rank, blockedBy?} or best = null if nothing is
   feasible. A slot is left empty when a chosen piece blocks it (blockedBy: that candidate; buildCandidates puts
   blockable slots last) or when every candidate's copies are used up. A blocked slot adds 0, so while a chosen piece
   blocks a later slot, that slot's best score and speed come off the bounds (without this a cloak's branch, whose
   bound still counted a head, was almost never pruned under sync). */
export function branchAndBound({ slotList, posList, dims, spdMin, spdMax, nodeLimit }) {
  const nSlots = slotList.length;
  const { remMax, remSc } = suffixBounds(posList, dims);
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
  const maxSc = posList.map(list => Math.max(...list.map(a => a.sc)));
  const maxSpd = posList.map(list => (dims.includes('spd') ? Math.max(0, ...list.map(a => a.v.spd)) : 0));
  let blockedSc = 0, // best score and speed of the later slots currently blocked
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
