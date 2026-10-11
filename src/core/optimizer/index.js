/* Gear optimizer: pick one item per slot (two rings) from a pool to maximize a target stat,
   with up to two tiebreak stats and optional constraints. */
import { ilWeight } from '../job-context.js';
import { buildCandidates } from './candidates.js';
import { branchAndBound } from './search.js';

export { effStats } from './candidates.js';

/**
 * @param job   JobContext
 * @param pool  pool items
 * @param sync  {cap, sync}
 * @param opts  {target='spd', tiebreak=[], mins={}, maxs={}, minAvgIlvl=0, nodeLimit=1.5e6}
 * @returns {ok:false, truncated, nodes} when nothing is feasible, otherwise
 *          {ok:true, picks:[{type, item, eff}], totals, truncated, nodes, denom, avgIlvl}
 */
export function optimize(job, pool, sync, opts) {
  opts = opts || {};
  const target = opts.target || 'spd';
  const tiebreak = (opts.tiebreak || []).filter(Boolean);
  const mins = opts.mins || {},
    maxs = opts.maxs || {};
  const minAvg = opts.minAvgIlvl || 0;
  const nodeLimit = opts.nodeLimit || 1500000;

  // Dominance assumes more of a stat never hurts, which a maximum breaks, so pruning is off when maxs are set.
  const prune = !Object.values(maxs).some(m => m != null);
  const { slotList, posList, dims } = buildCandidates(job, pool, sync, { target, tiebreak }, { prune });
  const denom = slotList.reduce((a, t) => a + ilWeight(job, t), 0);
  const need = {};
  job.stats.forEach(s => {
    if (mins[s] > 0) need[s] = mins[s];
  });
  const ilNeed = minAvg > 0 ? minAvg * denom : 0;

  const { best, nodes, truncated } = branchAndBound({ slotList, posList, dims, need, ilNeed, maxs, nodeLimit });
  if (!best) return { ok: false, truncated, nodes };

  const picks = [];
  const totals = {};
  dims.forEach(d => {
    totals[d] = 0;
  });
  best.forEach((c, i) => {
    if (!c?.a) {
      picks.push({ type: slotList[i], item: null });
      return;
    }
    picks.push({ type: slotList[i], item: c.a.it, eff: c.a.v });
    dims.forEach(d => {
      totals[d] += c.a.v[d];
    });
  });
  return { ok: true, picks, totals, truncated, nodes, denom, avgIlvl: denom ? totals.ilw / denom : 0 };
}
