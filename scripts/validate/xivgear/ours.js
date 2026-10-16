/* Our side of the check against xivgear (run.py). esbuild bundles this file and src/core into one CommonJS file that
   xivgear's own test runner loads (xg_sync_test.ts), so both tools compute every synced stat in the same process:
   theirs through their data manager and gear set (getStatDetail), ours through effStats, the function the optimizer
   uses. Pieces are matched by game id. Exports { jobInfo, startSetting, compareItem, finishSetting }.

   Every difference is tagged with the known cause it matches:
     X1 level sync item level: they take the level's item level from their data API (maxIlvlPerLvl), we from the game
        file ParamGrow.ItemLevelSync (e.g. level 90: 665 vs 660)
     X2 gear whose item level scales with the character (Item.SubStatCategory 2): they sync it only by equip level, as
        this project did before its D3 fix (docs/mechanics/validation.md section 9)
     D1 cap rounding order (±1 where the stat factor is below 100%)
     D2 shield caps (±1)
     target: the two tools sync the piece to different item levels, no known cause
     unexplained: none of the above */
import { makeJobContext } from '../../../src/core/job-context.js';
import { kindFactors, parseRow, poolItemFromRow, wearable } from '../../../src/core/items.js';
import { effStats, itemSyncIlvl } from '../../../src/core/optimizer/candidates.js';
import { levelSyncIlvl } from '../../../src/core/sync-target.js';
import { ITEMS } from '../../../src/core/tables.js';

const THEIR_KEY = {
  str: 'strength',
  dex: 'dexterity',
  int: 'intelligence',
  mind: 'mind',
  sks: 'skillspeed',
  sps: 'spellspeed',
  piety: 'piety',
  ten: 'tenacity',
};
const EXAMPLES = 25; // differences kept per tag and setting
const UNEXPLAINED = 200; // unexplained differences kept per setting
const OFF_BUCKETS = [
  [1, '1'],
  [2, '2'],
  [5, '3-5'],
  [10, '6-10'],
  [Infinity, '11+'],
];

const jobs = new Map();

/* The job's level cap, our neutral stat key -> their stat key, and our wearable pieces by game id. */
function job(jobId) {
  let j = jobs.get(jobId);
  if (!j) {
    const ctx = makeJobContext(jobId);
    const p = ctx.profile;
    const map = { main: THEIR_KEY[p.main], vit: 'vitality', crit: 'crit', det: 'determination', dh: 'dhit', spd: THEIR_KEY[p.spd] };
    if (p.spec) map.spec = THEIR_KEY[p.spec];
    const bit = 1 << ctx.jobIndex;
    const pieces = new Map();
    for (const r of ITEMS) {
      if (!(r[4] & bit)) continue;
      const row = parseRow(r);
      const item = poolItemFromRow(ctx, row);
      if (wearable(ctx, item)) pieces.set(row.gameId, { row, item });
    }
    j = { ctx, map, pieces };
    jobs.set(jobId, j);
  }
  return j;
}

/* For their test: the job's level cap and the stat keys to read, in our neutral order. */
export function jobInfo(jobId) {
  const j = job(jobId);
  return { maxLevel: j.ctx.maxLevel, stats: Object.entries(j.map), pieces: j.pieces.size };
}

export function startSetting(jobId, level, cap) {
  return {
    job: jobId,
    level,
    cap,
    pieces: 0,
    stats: 0,
    equal: 0,
    tags: {},
    offBy: {},
    maxOff: {},
    examples: [],
    seen: new Set(),
    theirsOnly: 0,
  };
}

function tag(j, p, s, ours, theirs, ourTarget, theirTarget, level) {
  const lowered = t => (t != null && t < p.row.ilvl ? t : null);
  if (lowered(ourTarget) !== lowered(theirTarget)) {
    if (p.row.scales) return 'X2';
    // both synced by level only, to their level item level vs ours
    if (ourTarget === levelSyncIlvl(level) && theirTarget != null && p.row.lvl > level) return 'X1';
    return 'target';
  }
  if (Math.abs(ours - theirs) === 1) {
    if (p.row.slotCode === 2) return 'D2';
    const factor = kindFactors(j.ctx, p.row.kind)?.[s] ?? 1;
    if (factor < 1) return 'D1';
  }
  return 'unexplained';
}

/* One piece of theirs at the current setting: theirStats {their key: effective amount}, theirTarget their synced item
   level or null. Pieces we do not have (not in our database, or not wearable by the job here) are counted only. */
export function compareItem(res, gameId, theirStats, theirTarget) {
  const j = job(res.job);
  const p = j.pieces.get(gameId);
  if (!p) {
    res.theirsOnly++;
    return;
  }
  res.seen.add(gameId);
  res.pieces++;
  const sync = { cap: res.cap, sync: res.cap != null, level: res.level };
  const ours = effStats(j.ctx, p.item, sync);
  let ourTarget;
  for (const [s, k] of Object.entries(j.map)) {
    res.stats++;
    const o = ours[s] || 0;
    const t = theirStats[k] || 0;
    if (o === t) {
      res.equal++;
      continue;
    }
    if (ourTarget === undefined) ourTarget = itemSyncIlvl(p.item, sync);
    const k2 = tag(j, p, s, o, t, ourTarget, theirTarget, res.level);
    res.tags[k2] = (res.tags[k2] || 0) + 1;
    const gap = Math.abs(o - t);
    const b = OFF_BUCKETS.find(([max]) => gap <= max)[1];
    if (!res.offBy[k2]) res.offBy[k2] = {};
    res.offBy[k2][b] = (res.offBy[k2][b] || 0) + 1;
    res.maxOff[k2] = Math.max(res.maxOff[k2] || 0, gap);
    const kept = res.examples.filter(e => e.tag === k2).length;
    if (kept < (k2 === 'unexplained' || k2 === 'target' ? UNEXPLAINED : EXAMPLES)) {
      const r = p.row;
      res.examples.push({
        tag: k2,
        id: gameId,
        name: r.name,
        slot: r.slotCode,
        ilvl: r.ilvl,
        equipLevel: r.lvl,
        kind: r.kind,
        stat: s,
        raw: p.item.stats[s] || 0,
        ours: o,
        theirs: t,
        ourTarget,
        theirTarget,
      });
    }
  }
}

/* Close a setting: pieces of ours they did not serve, then a plain object for JSON. */
export function finishSetting(res) {
  const j = job(res.job);
  let oursOnly = 0;
  const oursOnlyExamples = [];
  for (const [id, p] of j.pieces) {
    if (res.seen.has(id)) continue;
    oursOnly++;
    if (oursOnlyExamples.length < 5) oursOnlyExamples.push(`${p.row.name} (${id}, item level ${p.row.ilvl})`);
  }
  const { seen, ...out } = res;
  return { ...out, oursOnly, oursOnlyExamples };
}
