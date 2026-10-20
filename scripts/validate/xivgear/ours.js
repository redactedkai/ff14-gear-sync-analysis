/* Our side of the check against xivgear (run.py). esbuild bundles this file and src/core into one CommonJS file that
   xivgear's own test runner loads (xg_sync_test.ts), so both tools compute every synced stat in the same process:
   theirs through their data manager and gear set (getStatDetail), ours through effStats, the function the optimizer
   uses. Pieces are matched by game id. Exports { jobInfo, startSetting, fixTarget, compareItem, finishSetting }.

   Two known faults on their side are corrected before comparing (fixTarget; their own code then re-syncs the piece),
   and counted per setting (`corrected`):
     X1 level sync item level: they take the level's item level from the highest item level of the job's gear at that
        equip level (their data API's maxIlvlPerLvl), which counts shields: Paladin gets 405 / 535 / 665 at levels
        70 / 80 / 90; the game file ParamGrow.ItemLevelSync gives 400 / 530 / 660, used instead
     X2 gear whose item level scales with the character (Item.SubStatCategory 2): they have no rule for it (synced by
        equip level, or by the cap alone); our rule is used instead (sync-target.js)
   Every remaining difference is tagged with the known cause it matches:
     X3 a piece synced to exactly its own item level (equip level above the synced level, item level equal to the
        level's): they apply the caps (1 lower where the stat factor is below 100%), we leave it as it is
     D1 cap rounding order (±1 where the stat factor is below 100%)
     D2 shield caps (±1)
     X1 / X2: as above, left after the correction (should not happen)
     target: the two tools sync the piece to different item levels, no known cause
     unexplained: none of the above */
import { makeJobContext } from '../../../src/core/job-context.js';
import { kindFactors, parseRow, poolItemFromRow, wearable } from '../../../src/core/items.js';
import { effStats, itemSyncIlvl } from '../../../src/core/piece.js';
import { levelSyncIlvl } from '../../../src/core/sync-target.js';
import { ITEMS } from '../../../src/core/tables.js';
import { ROW } from '../../../src/core/constants.js';

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
      if (!(r[ROW.jobMask] & bit)) continue;
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
    corrected: {},
  };
}

/* Their sync target for one of their pieces with the two corrections above, before it is compared: the new target
   (an item level, or null for not synced) when a correction changes theirs, else undefined. Their rule
   (datamanager_new.ts, loadData): the cap when below the item level, else the level's item level when the equip level
   is above the synced level, else none. Only pieces that are compared (ours, wearable by the job) are corrected. */
export function fixTarget(res, gameId, ilvl, equipLvl, theirTarget) {
  const row = job(res.job).pieces.get(gameId)?.row;
  if (!row) return undefined;
  const { level, cap } = res;
  const lv = levelSyncIlvl(level);
  let target = null,
    fix = null;
  if (row.scales && lv < ilvl) {
    target = cap != null && cap < ilvl ? Math.min(cap, lv) : lv;
    fix = 'X2';
  } else if (cap != null && cap < ilvl) target = cap;
  else if (level < equipLvl) {
    target = lv;
    fix = 'X1';
  }
  if (!fix || target === theirTarget) return undefined;
  res.corrected[fix] = (res.corrected[fix] || 0) + 1;
  return target;
}

function tag(j, p, s, ours, theirs, ourTarget, theirTarget, level) {
  const lowered = t => (t != null && t < p.row.ilvl ? t : null);
  if (lowered(ourTarget) !== lowered(theirTarget)) {
    // both synced by level only, to their level item level vs ours (checked first: scaling gear can hit it too)
    if (ourTarget === levelSyncIlvl(level) && theirTarget != null && p.row.lvl > level) return 'X1';
    if (p.row.scales) return 'X2';
    return 'target';
  }
  if (Math.abs(ours - theirs) === 1) {
    if (theirTarget === p.row.ilvl) return 'X3';
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
