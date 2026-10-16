/* Our side of the check against ffxiv-gearing (roadmap A5; run.py). esbuild bundles this file and src/core into one
   script that run.py injects into ffxiv-gearing's own page, so both tools compute every synced stat in the same page:
   theirs through the page's store (window.store, which the page exposes on purpose), ours through effStats, the
   function the Gear pool and the optimizer use. Exposes globalThis.OURS = { setup, settings, compare }.

   Every difference is tagged with the known cause it matches (plan in docs/scratchpad/gearing-validation/plan.md):
     D1 rounding order of the cap (±1 where the stat factor is below 100%)
     D2 shield caps (their 40% share; ours two-handed minus one-handed)
     (D3, gear whose item level scales with the character, was fixed on our side: both tools now sync it to the
        level's item level, so a difference there shows as 'target' or 'unexplained')
     D4 Main Attribute on tanks (theirs: Vitality, the game before patch 5.0; ours: Strength, the game since 5.0)
     D6 Crucible and Occult Crescent bonus stats (they add them; we leave them out)
     target: the two tools sync the piece to different item levels (D5, level 100 -> 790 vs 690, is one case)
     unexplained: none of the above */
import { makeJobContext } from '../../../src/core/job-context.js';
import { kindFactors, parseRow, poolItemFromRow, wearable } from '../../../src/core/items.js';
import { effStats, itemSyncIlvl } from '../../../src/core/optimizer/candidates.js';
import { DB_SLOT_PCT, DB_SLOT_TYPE } from '../../../src/core/constants.js';
import { capValue } from '../../../src/core/formulas.js';
import { ITEMS, MAX_REAL } from '../../../src/core/tables.js';

const THEIR_KEY = { str: 'STR', dex: 'DEX', int: 'INT', mind: 'MND', sks: 'SKS', sps: 'SPS', piety: 'PIE', ten: 'TEN' };
const EXAMPLES = 25; // differences kept per tag and setting, except unexplained ones (all kept)
// how far apart the two values are: the size buckets of `offBy`
const OFF_BUCKETS = [
  [1, '1'],
  [2, '2'],
  [5, '3-5'],
  [10, '6-10'],
  [Infinity, '11+'],
];

const prepared = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Our neutral stat key -> their stat key, for a job. */
function keyMap(job) {
  const p = job.profile;
  return {
    main: THEIR_KEY[p.main],
    vit: 'VIT',
    crit: 'CRT',
    det: 'DET',
    dh: 'DHT',
    spd: THEIR_KEY[p.spd],
    spec: p.spec ? THEIR_KEY[p.spec] : null,
  };
}

/* Load all of their gear data, switch their page to `jobId` in view mode with every database piece this job can wear,
   and keep our pool items for it. Returns counts: ours (our pieces), theirs (of those, in their data), notWearable
   (in their data but not wearable by the job there) with a few examples per their job category. */
async function setup(store, jobId) {
  const job = makeJobContext(jobId);
  store.setMode('edit');
  store.setJob(jobId);
  store.minLevel = 1; // load every item level group
  store.maxLevel = 9999;
  await sleep(50);
  while (store.loadingStatus !== 'ready') await sleep(100);
  store.setMode('view');
  store.equippedGears.clear();
  store.gears.clear();
  const bit = 1 << job.jobIndex;
  const list = [];
  let notWearable = 0;
  const notWearableExamples = {};
  for (const r of ITEMS) {
    if (!(r[4] & bit)) continue;
    const row = parseRow(r);
    const item = poolItemFromRow(job, row);
    if (!wearable(job, item)) continue;
    store.gears.put({ id: row.gameId });
    const g = store.gears.get(String(row.gameId));
    list.push({ row, item, g });
  }
  await sleep(50);
  let theirs = 0;
  for (const p of list) {
    try {
      p.g.data; // throws when their data has no such item
      theirs++;
      if (!p.g.jobs[jobId]) {
        notWearable++;
        const k = 'category ' + p.g.data.jobCategory;
        if (!notWearableExamples[k]) notWearableExamples[k] = [];
        if (notWearableExamples[k].length < 3) notWearableExamples[k].push(`${p.row.name} (${p.row.gameId})`);
      }
    } catch {
      p.g = null;
    }
  }
  prepared.set(jobId, list);
  return { ours: list.length, theirs, notWearable, notWearableExamples };
}

/* Their sync settings for a job: [level, item level or null] for each job level up to the job's cap, "level only"
   first, then each duty item level they list for that level. */
function settings(game, jobId) {
  const job = makeJobContext(jobId);
  const out = [];
  for (const level of game.jobLevels) {
    if (level > job.maxLevel) continue;
    out.push([level, null]);
    for (const s of game.syncLevels[level]) out.push([level, s]);
  }
  return out;
}

function tag(job, p, s, ours, theirs, ourTarget, theirTarget, level) {
  const data = p.g.data;
  const bare = data.stats;
  if (data.bonusType !== undefined) return 'D6';
  if (job.profileId === 'tank' && ('main' in bare || 'secondary' in bare) && (s === 'main' || s === 'vit')) return 'D4';
  if (p.row.slotCode === 2) return 'D2';
  // a target at or above the piece's own item level lowers nothing (theirs still caps there, which is D1 territory)
  const lowered = t => (t != null && t < p.row.ilvl ? t : null);
  if (lowered(ourTarget) !== lowered(theirTarget)) return level === 100 ? 'D5' : 'target';
  const factor = kindFactors(job, p.row.kind)?.[s] ?? 1;
  if (Math.abs(ours - theirs) === 1 && factor < 1) return 'D1';
  return 'unexplained';
}

/* Compare every prepared piece of `jobId` at one setting. Returns {level, cap, pieces, stats, equal, tags, onScaling,
   offBy, maxOff, examples}; onScaling counts the differences per tag on gear whose item level scales with the level
   (parseRow scales); offBy counts them per tag and size of the gap (OFF_BUCKETS), maxOff is the largest gap per tag. */
function compare(store, jobId, level, cap) {
  const job = makeJobContext(jobId);
  const map = keyMap(job);
  store.setSyncLevel(cap ?? undefined, level);
  const sync = { cap, sync: cap != null, level };
  const res = { level, cap, pieces: 0, stats: 0, equal: 0, tags: {}, onScaling: {}, offBy: {}, maxOff: {}, examples: [] };
  const kept = {};
  for (const p of prepared.get(jobId)) {
    if (!p.g) continue;
    res.pieces++;
    const theirs = p.g.stats;
    const ours = effStats(job, p.item, sync);
    let ourTarget = null;
    let theirTarget;
    for (const s of job.stats) {
      if (!map[s]) continue;
      res.stats++;
      const o = ours[s] || 0;
      const t = theirs[map[s]] || 0;
      if (o === t) {
        res.equal++;
        continue;
      }
      if (theirTarget === undefined) {
        ourTarget = itemSyncIlvl(p.item, sync);
        theirTarget = p.g.syncedLevel ?? null;
      }
      const k = tag(job, p, s, o, t, ourTarget, theirTarget, level);
      res.tags[k] = (res.tags[k] || 0) + 1;
      if (p.row.scales) res.onScaling[k] = (res.onScaling[k] || 0) + 1;
      const gap = Math.abs(o - t);
      const b = OFF_BUCKETS.find(([max]) => gap <= max)[1];
      if (!res.offBy[k]) res.offBy[k] = {};
      res.offBy[k][b] = (res.offBy[k][b] || 0) + 1;
      res.maxOff[k] = Math.max(res.maxOff[k] || 0, gap);
      kept[k] = (kept[k] || 0) + 1;
      if (k === 'unexplained' || k === 'target' || kept[k] <= EXAMPLES) {
        res.examples.push({
          tag: k,
          id: p.row.gameId,
          name: p.row.name,
          slot: p.row.slotCode,
          ilvl: p.row.ilvl,
          equipLevel: p.row.lvl,
          kind: p.row.kind,
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
  return res;
}

// our slot code -> their slot (EquipSlotCategory row: 13 two-handed, 1 one-handed, 2 off-hand, ..., 15 body + head)
const THEIR_SLOT = [13, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 15];
// one job per main stat, so every stat key of theirs is covered: [job, our stats to check]
const CAP_JOBS = [
  ['SGE', ['main', 'vit', 'crit', 'det', 'dh', 'spd', 'spec']],
  ['PLD', ['main', 'spd', 'spec']],
  ['NIN', ['main']],
  ['BLM', ['main']],
];

/* Caps alone: their getCaps against our capValue at every item level 1 to MAX_REAL their data defines (theirs keeps
   only the item levels of real items and duty syncs), every slot code and stat factor kind 0 to 12. Returns counts
   {compared, equal, off1, more, byGroup: {'factor<100'|'factor 100' x 'off-hand'|'other': [compared, differing]},
   examples}. */
function capsSweep(game) {
  const res = { compared: 0, equal: 0, off1: 0, more: 0, levels: 0, byGroup: {}, examples: [] };
  const seen = new Set();
  for (let ilvl = 1; ilvl <= MAX_REAL; ilvl++) {
    for (let code = 0; code < THEIR_SLOT.length; code++) {
      for (let kind = 0; kind < 13; kind++) {
        const caps = game.getCaps({ level: ilvl, slot: THEIR_SLOT[code], role: kind }, ilvl);
        if (Number.isNaN(caps.VIT)) continue; // an item level their data does not define
        seen.add(ilvl);
        for (const [jobId, stats] of CAP_JOBS) {
          const job = makeJobContext(jobId);
          const map = keyMap(job);
          const f = kindFactors(job, kind);
          for (const st of stats) {
            const ours = capValue(job, st, ilvl, DB_SLOT_TYPE[code], DB_SLOT_PCT[code], f[st]);
            const theirs = caps[map[st]];
            const g = `${f[st] < 1 ? 'factor<100' : 'factor 100'}, ${code === 2 ? 'off-hand' : 'other'}`;
            if (!res.byGroup[g]) res.byGroup[g] = [0, 0];
            const b = res.byGroup[g];
            b[0]++;
            res.compared++;
            if (ours === theirs) {
              res.equal++;
              continue;
            }
            b[1]++;
            if (Math.abs(ours - theirs) === 1) res.off1++;
            else res.more++;
            if (res.examples.length < 40 && (code !== 2 || Math.abs(ours - theirs) > 1))
              res.examples.push({ ilvl, code, kind, job: jobId, stat: st, ours, theirs });
          }
        }
      }
    }
  }
  res.levels = seen.size;
  return res;
}

globalThis.OURS = { setup, settings, compare, capsSweep };
