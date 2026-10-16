/* Optimizer stage 2: depth-first branch-and-bound over the slot sequence.
   Prunes on the score upper bound and on a speed minimum that the remaining
   slots can no longer reach. With a speed rule it also bounds the score by the speed still needed (speed tables), tries
   children in order of that bound, and cuts states it has already seen (the memo). */

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

/* Speed tables: rest(i, c) = an upper bound on the score slots i.. can still add when the speed so far is c, given the
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
  const blockable = new Set(posList.flatMap(l => l.flatMap(a => a.blocks)));
  const spdOf = a => Math.max(0, a.v.spd || 0);
  // slots a legal loadout can leave empty: a blockable slot, a slot with no candidates, and a ring slot when the ring
  // list cannot fill both (copies of distinct items below 2: a lone Unique ring is worn once). Counting a piece in such a
  // slot would add speed a loadout may not have, which a maximum can then wrongly reject
  const off = i => !!empty && empty.has(i); // blocked by a piece already chosen: only empty
  const canEmpty = i => {
    const l = posList[i];
    if (blockable.has(slotList[i]) || !l.length) return true;
    if (slotList[i] !== 'ring') return false;
    const copies = new Map();
    for (const a of l) copies.set(a.it, a.copies);
    let n = 0;
    for (const c of copies.values()) n += c;
    return n < 2;
  };
  // a maximum no loadout can pass is no rule at all, and the table for it would be needlessly long
  const most = posList.reduce((s, l, i) => s + (off(i) ? 0 : Math.max(0, ...l.map(spdOf))), 0);
  if (spdMax != null && spdMax >= most) spdMax = null;
  if (!lo && spdMax == null) return null;
  if (spdMax == null) {
    const R = lo;
    const need = new Array(n + 1);
    need[n] = new Float64Array(R + 1).fill(-Infinity);
    need[n][0] = 0;
    for (let i = n - 1; i >= 0; i--) {
      const next = need[i + 1];
      const raw = off(i) ? [] : posList[i].map(a => [a.sc, spdOf(a)]);
      if (off(i) || canEmpty(i)) raw.push([0, 0]);
      raw.sort((x, y) => y[1] - x[1] || y[0] - x[0]);
      const opts = [];
      let top = -Infinity;
      for (const o of raw) {
        if (o[0] > top) {
          opts.push(o);
          top = o[0];
        }
      }
      const row = new Float64Array(R + 1);
      for (let r = 0; r <= R; r++) {
        let m = -Infinity;
        for (const [sc, sp] of opts) {
          const v = sc + next[r > sp ? r - sp : 0];
          if (v > m) m = v;
        }
        row[r] = m;
      }
      need[i] = row;
    }
    const f = (i, c) => {
      const r = R - c;
      return need[i][r > 0 ? r : 0];
    };
    f.top = i => need[i][0]; // the most at any speed so far (need is highest with nothing more needed)
    return f;
  }
  const M = spdMax;
  if (M < lo) return Object.assign(() => -Infinity, { top: () => -Infinity });
  const B = M - lo;
  const pre = new Array(n + 1),
    win = new Array(n + 1);
  const fill = (i, f) => {
    const p = new Float64Array(M + 1);
    let m = -Infinity;
    for (let x = 0; x <= M; x++) p[x] = m = f[x] > m ? f[x] : m;
    pre[i] = p;
    // window maximum over [x, x + B] in blocks of B + 1: the suffix maximum inside x's block and the prefix maximum
    // inside the block of x + B cover the window between them; a window cut short by M is the maximum over [x, M]
    const k = B + 1,
      L = new Float64Array(M + 1),
      S = new Float64Array(M + 1),
      w = new Float64Array(M + 1);
    for (let x = 0; x <= M; x++) L[x] = x % k === 0 ? f[x] : Math.max(L[x - 1], f[x]);
    for (let x = M; x >= 0; x--) S[x] = x === M || (x + 1) % k === 0 ? f[x] : Math.max(S[x + 1], f[x]);
    let tail = -Infinity;
    for (let x = M; x >= 0; x--) {
      tail = f[x] > tail ? f[x] : tail;
      w[x] = x + B <= M ? Math.max(S[x], L[x + B]) : tail;
    }
    win[i] = w;
  };
  let f = new Float64Array(M + 1).fill(-Infinity);
  f[0] = 0;
  fill(n, f);
  for (let i = n - 1; i >= 0; i--) {
    const bestAt = new Map();
    for (const a of off(i) ? [] : posList[i]) {
      const sp = spdOf(a);
      if (sp <= M && !(bestAt.get(sp) >= a.sc)) bestAt.set(sp, a.sc);
    }
    if ((off(i) || canEmpty(i)) && !(bestAt.get(0) >= 0)) bestAt.set(0, 0);
    const g = new Float64Array(M + 1).fill(-Infinity);
    for (const [sp, sc] of bestAt) {
      for (let x = sp; x <= M; x++) {
        const v = sc + f[x - sp];
        if (v > g[x]) g[x] = v;
      }
    }
    f = g;
    fill(i, f);
  }
  const look = (i, c) => {
    const hi = M - c;
    if (hi < 0) return -Infinity;
    const l = lo - c;
    return l <= 0 ? pre[i][hi] : win[i][l];
  };
  look.top = i => pre[i][M]; // the most at any speed so far
  return look;
}

/* spdMin, spdMax: optional bounds on the speed total (null for none).
   Returns {best, nodes, truncated}; best[i] = {a: candidate | null, rank, blockedBy?} or best = null if nothing is
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
/* A search this small is over before a speed table for its blocked slots would pay for itself (one table takes 1 to
   50 ms; WHM at level 100 with sync off needs a few hundred nodes, synced searches 100,000 and more without them). */
const LAZY_TABLES = 2000;

export function branchAndBound({ slotList, posList, dims, spdMin, spdMax, nodeLimit, plain = false, lazyTables = LAZY_TABLES }) {
  const nSlots = slotList.length;
  const { remMax, remSc, slotMax, slotSc } = suffixBounds(slotList, posList, dims);
  // `plain` (tests and perf scripts only): none of the speed-rule extras, to check them against the plain search
  const rest = !plain && dims.includes('spd') ? speedTables(slotList, posList, spdMin, spdMax) : null;
  const posOf = new Map(slotList.map((t, i) => [t, i])); // blockable slots appear once (rings are never blocked)
  // the slots a candidate blocks, as a bit mask of positions
  const maskOf = blocks => blocks.reduce((m, b) => (posOf.has(b) ? m | (1 << posOf.get(b)) : m), 0);
  const bmOf = new Map(posList.flatMap(l => l.map(a => [a, maskOf(a.blocks)])));
  // speed tables for each set of blocked slots (rest is the one for none), built when first needed: once a chosen
  // piece blocks a slot (a two-handed weapon the off-hand, a cloak the head) that slot adds nothing, while the table
  // for none still counts its best piece. Below LAZY_TABLES nodes the table for none stands in (a looser bound)
  const tables = new Map([[0, rest]]);
  const restFor = m => {
    let f = tables.get(m);
    if (f === undefined) {
      if (nodes < lazyTables) return rest;
      const empty = new Set();
      for (let i = 0; i < slotList.length; i++) if (m & (1 << i)) empty.add(i);
      f = speedTables(slotList, posList, spdMin, spdMax, empty) || rest;
      tables.set(m, f);
    }
    return f;
  };
  let bm = 0; // blocked slots now, as a mask
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
  // per-slot bounds (suffixBounds) of the slots a chosen piece blocks come off the remaining bound
  const maxSc = slotSc;
  const maxSpd = dims.includes('spd') ? slotMax.spd : new Array(nSlots).fill(0);
  let blockedSc = 0, // bounds of the later slots currently blocked
    blockedSpd = 0;

  // groups[pos]: the slot's candidates of one speed, [rank, candidate] by score, highest first
  const groups = rest
    ? posList.map(list => {
        const m = new Map();
        list.forEach((a, k) => {
          const sp = Math.max(0, a.v.spd || 0);
          const mk = bmOf.get(a);
          const key = `${sp}|${mk}`;
          if (!m.has(key)) m.set(key, { spd: sp, mask: mk, list: [] });
          m.get(key).list.push([k, a]);
        });
        const gs = [...m.values()].map((g, i) => ({ ...g, i, list: g.list.sort((x, y) => y[1].sc - x[1].sc) }));
        return gs.sort((x, y) => y.list[0][1].sc - x.list[0][1].sc);
      })
    : null;
  const seen = rest ? new Map() : null;
  const memoSpd = spdMax == null && spdMin > 0 ? s => (s < spdMin ? s : spdMin) : s => s;

  // put candidate a (rank k) in slot pos and search on; false when it is not allowed there
  function tryChild(pos, k, a, isRing2, sc) {
    const u = used.get(a.it.id) || 0;
    if (u >= a.copies) return false;
    if (isRing2) {
      const prev = chosen[pos - 1];
      if (prev && prev.rank > k) return false;
    }
    if (spdMax != null && cur.spd + a.v.spd > spdMax) return false;
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
    const bm0 = bm;
    bm |= bmOf.get(a);
    chosen[pos] = { a, rank: k };
    dfs(pos + 1, sc + a.sc);
    chosen[pos] = null;
    bm = bm0;
    for (const p of later) {
      blockedSc -= maxSc[p];
      blockedSpd -= maxSpd[p];
    }
    for (const b of a.blocks) blockedBy.delete(b);
    used.set(a.it.id, u);
    dims.forEach(d => {
      cur[d] -= a.v[d];
    });
    return true;
  }

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
    if (rest && sc + restFor(bm)(pos, cur.spd) <= bestSc) return;
    if (seen && pos > 0) {
      const prev = slotList[pos] === 'ring' && slotList[pos - 1] === 'ring' ? chosen[pos - 1] : null;
      const key = (((prev ? prev.rank + 1 : 0) * 4096 + bm) * 32 + pos) * 1e5 + memoSpd(cur.spd) + 5e4; // exact below 2^53: rank < 256, 12 slots, |speed| < 50,000
      const was = seen.get(key);
      if (was !== undefined && was >= sc) return;
      seen.set(key, sc);
    }

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
    if (groups) {
      const gs = groups[pos];
      // only the groups that can still beat the best so far (the loop below skips the others anyway); groups come by
      // top score, highest first, so once even the table's most at any speed cannot lift one past it, none can
      const order = [];
      const top = rest.top(pos + 1);
      for (let i = 0; i < gs.length; i++) {
        const head = sc + gs[i].list[0][1].sc;
        if (head + top <= bestSc) break;
        const e = restFor(bm | gs[i].mask)(pos + 1, cur.spd + gs[i].spd);
        if (head + e > bestSc) order.push([i, e]);
      }
      // by bound, ties in the groups' first-seen order (as the stable sort over that order did)
      order.sort((x, y) => y[1] + gs[y[0]].list[0][1].sc - (x[1] + gs[x[0]].list[0][1].sc) || gs[x[0]].i - gs[y[0]].i);
      for (const [g, extra] of order) {
        const gl = gs[g].list;
        if (sc + gl[0][1].sc + extra <= bestSc) continue;
        for (const [k, a] of gl) {
          if (sc + a.sc + extra <= bestSc) break;
          tryChild(pos, k, a, isRing2, sc);
          if (truncated) return;
        }
      }
      // empty only when no candidate has a copy left (the cuts above say nothing about copies)
      if (!list.some(a => (used.get(a.it.id) || 0) < a.copies)) {
        chosen[pos] = { a: null, rank: -1 };
        dfs(pos + 1, sc);
        chosen[pos] = null;
      }
      return;
    }
    let avail = 0;
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      if ((used.get(a.it.id) || 0) >= a.copies) continue;
      avail++;
      tryChild(pos, k, a, isRing2, sc);
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
