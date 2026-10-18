/* Optimizer: regain cuts, from the maxima that earlier searches proved (tier ranking's stages; docs/engineering/
   tier-ranking.md, section 4).

   A proven maximum {stat, most, minStats, speed} says: every legal loadout meeting an earlier search's limits (its
   speed rule, `speed`, and its minimums, on the stats in `minStats`) has at most `most` gear points of `stat`. That
   search finished (it did not stop at its node limit), so `most` is its best, not a guess. A later search whose limits
   include those (the same speed rule, minimums no lower on the same stats) can use it as follows.

   Take any loadout S the later search could return. In each slot, swap S's piece a for a piece b of the same slot that
   leaves the same slots empty, has the same speed under a band (at least as much under a minimum only) and at least a's
   value of every stat in minStats. The new loadout S' is legal (rings: see swapsFor) and meets the earlier limits, so
   its `stat` is at most `most`. Its `stat` is S's plus each swap's gain, so with regain(a) = the most any such swap
   gains (0 or more):
     stat(S) + sum of regain(a) <= most, and with stat(S) >= held (the later search's minimum on it):
     sum of regain(a) <= most - held.
   That sum becomes a limit on a synthetic stat (a maximum only, marked `cut`). Every loadout the later search can
   return meets it, so it removes none of them (a valid inequality). What it removes are partial loadouts whose pieces
   put stones, or a whole piece, against the held keys: the room (most - held) is usually less than one stone.
   Dark Knight at level 90, item level 660, exactly 2.30, Critical Hit > Determination > Direct Hit, the Direct Hit
   stage: rooms of 5 Critical Hit and 11 Determination keep 68 of 117 candidates, and the search needs 2,648 nodes
   instead of 4,800 (2026-10-17). From Perplexity's solver review (2026-10-17). */

/* The most `proof.stat` piece `piece` gains by a swap for one of `swaps` that keeps every stat in proof.minStats and,
   under a speed minimum only, its speed (swapsFor already keeps the same speed under a band). 0 when no swap gains. */
function regainOf(piece, proof, swaps) {
  const speedMinimum = proof.speed === 'min';
  const own = piece.eff[proof.stat] || 0;
  let regain = 0;
  for (const other of swaps) {
    if (other === piece) continue;
    if (speedMinimum && (other.eff.spd || 0) < (piece.eff.spd || 0)) continue;
    if (proof.minStats.some(s => (other.eff[s] || 0) < (piece.eff[s] || 0))) continue;
    const gain = (other.eff[proof.stat] || 0) - own;
    if (gain > regain) regain = gain;
  }
  return regain;
}

/* The pieces `piece` may be swapped for in a regain cut: those of its slot's full list (`fullList`, before the search's
   filters) that leave the same slots empty, and with `sameSpeed` (a band) the same speed. `buckets` caches them per
   (blocked slots, speed) for one list.
   Rings: the two ring slots must not end up holding one Unique ring twice, so a ring may only become another meld
   version of itself (piece.versions, which also holds the versions pruning dropped) or a ring with 2 copies. Any two
   such swaps together stay legal. Other slots each hold a different item, so any piece of the list will do. */
function swapsFor(piece, fullList, isRing, buckets, sameSpeed) {
  const speed = piece.eff.spd || 0;
  const blocks = piece.blocks.join();
  const key = `${blocks}|${sameSpeed ? speed : ''}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = fullList.filter(b => b.blocks.join() === blocks && (!sameSpeed || (b.eff.spd || 0) === speed));
    if (isRing) bucket = bucket.filter(b => b.copies >= 2);
    buckets.set(key, bucket);
  }
  if (!isRing) return bucket;
  const ownVersions = (piece.versions || [piece]).filter(b => !sameSpeed || (b.eff.spd || 0) === speed);
  return [...ownVersions, ...bucket.filter(b => b.item !== piece.item)];
}

/**
 * Adds a regain cut for each proven maximum that applies (see the top of this file).
 * @param slotList  the search's slot sequence
 * @param posList   the candidate list per position, after the search's filters (ring slots share one list)
 * @param fullLists the candidate list per position before them: the pieces a swap may bring in
 * @param dims      the stats the search tracks
 * @param limits    the search's limits ([{stat, min, max}], branchAndBound's); a proven stat's minimum here is `held`
 * @param proven    [{stat, most, minStats, speed: 'band' | 'min' | null}], as described above
 * @returns {posList, dims, limits}: every candidate copied with its regain per cut as a synthetic stat (`regain0`, ...)
 *          and `original` (the candidate it copies, which the search returns in its place); candidates whose own regain
 *          is past a cut's room dropped; dims and limits with the synthetic stats and their maxima ({stat, min: null,
 *          max: most - held, cut: true}) added. The inputs unchanged when no proof applies.
 */
export function addRegainCuts({ slotList, posList, fullLists, dims, limits, proven }) {
  // the room each proof leaves; a proof whose most is below this search's minimum on it (no loadout then) is not used
  const cuts = [];
  proven.forEach((proof, j) => {
    const held = limits.find(l => l.stat === proof.stat)?.min || 0;
    if (proof.most - held >= 0) cuts.push({ ...proof, key: `regain${j}`, room: proof.most - held });
  });
  if (!cuts.length) return { posList, dims, limits };
  const sameSpeed = cuts.some(c => c.speed === 'band');

  // each list once (the ring slots share theirs): every candidate with its regain per cut, those past a room dropped
  const done = new Map();
  const cutLists = posList.map((list, i) => {
    if (done.has(list)) return done.get(list);
    const isRing = slotList[i] === 'ring';
    const buckets = new Map();
    const kept = [];
    for (const piece of list) {
      const swaps = swapsFor(piece, fullLists[i], isRing, buckets, sameSpeed);
      const eff = { ...piece.eff };
      let fits = true;
      for (const cut of cuts) {
        eff[cut.key] = regainOf(piece, cut, swaps);
        if (eff[cut.key] > cut.room) {
          fits = false;
          break;
        }
      }
      if (fits) kept.push({ ...piece, eff, original: piece });
    }
    done.set(list, kept);
    return kept;
  });

  return {
    posList: cutLists,
    dims: [...dims, ...cuts.map(c => c.key)],
    limits: [...limits, ...cuts.map(c => ({ stat: c.key, min: null, max: c.room, cut: true }))],
  };
}
