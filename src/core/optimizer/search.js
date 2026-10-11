/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on constraints (stat minimums, average item level) that the
   remaining slots can no longer satisfy. */

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

/* need: {stat: minimum total}; ilNeed: minimum summed `ilw` (0 = none); maxs: {stat: maximum total}.
   Returns {best, nodes, truncated}; best[i] = {a: candidate | null, rank} or best = null if nothing is feasible.
   A slot is left empty only when every candidate's copies are used up. */
export function branchAndBound({ slotList, posList, dims, need, ilNeed, maxs, nodeLimit }) {
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

  function dfs(pos, sc) {
    if (truncated) return;
    if (++nodes > nodeLimit) {
      truncated = true;
      return;
    }
    if (pos === nSlots) {
      for (const s in need) if (cur[s] < need[s]) return;
      if (ilNeed && cur.ilw < ilNeed) return;
      if (sc > bestSc) {
        bestSc = sc;
        best = chosen.slice();
      }
      return;
    }
    if (sc + remSc[pos] <= bestSc) return;
    for (const s in need) if (cur[s] + remMax[s][pos] < need[s]) return;
    if (ilNeed && cur.ilw + remMax.ilw[pos] < ilNeed) return;

    const t = slotList[pos];
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
      let ok = true;
      for (const s in maxs) {
        if (maxs[s] != null && cur[s] + a.v[s] > maxs[s]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      dims.forEach(d => {
        cur[d] += a.v[d];
      });
      used.set(a.it.id, u + 1);
      chosen[pos] = { a, rank: k };
      dfs(pos + 1, sc + a.sc);
      chosen[pos] = null;
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
