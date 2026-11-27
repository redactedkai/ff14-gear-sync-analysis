/* Our side of the check against ffxiv-gearing (roadmap A5; run.ts). esbuild bundles this file and src/core into one
   script that run.ts injects into ffxiv-gearing's own page, so both tools compute every synced stat in the same page:
   theirs through the page's store (window.store, which the page exposes on purpose), ours through effStats, the
   function the Gear pool and the optimizer use. Exposes globalThis.OURS = { setup, settings, compare }.

   Every difference is tagged with the known cause it matches (docs/mechanics/validation.md, section 9):
     D1 rounding order of the cap (±1 where the stat factor is below 100%)
     D2 shield caps (their 40% share; ours two-handed minus one-handed)
     (D3, gear whose item level scales with the character, was fixed on our side: both tools now sync it to the
        level's item level, so a difference there shows as 'target' or 'unexplained')
     (D4, Main Attribute on tanks, is corrected on their side before comparing: their tank mainStat is 'VIT', the game
        before patch 5.0; setup sets it to 'STR', the game since 5.0, so their own code runs with today's rule)
     (D6, Crucible and Occult Crescent bonus stats, which they add and we leave out, is taken off their value before
        comparing: theirBonus, counted in `bonus`, not as a difference)
     target: the two tools sync the piece to different item levels (D5, level 100 -> 790 vs 690, is one case)
     unexplained: none of the above */
import { makeJobContext } from '../../../src/core/job-context.ts';
import { kindFactors, parseRow, poolItemFromRow, wearable } from '../../../src/core/items.ts';
import { effStats, itemSyncIlvl } from '../../../src/core/piece.ts';
import { DB_SLOT_PCT, DB_SLOT_TYPE, ROW } from '../../../src/core/constants.ts';
import { capValue } from '../../../src/core/formulas.ts';
import { ITEMS, MAX_REAL } from '../../../src/core/tables.ts';
import type { ParsedRow } from '../../../src/core/items.ts';
import type { JobContext, PoolItem, StatKey } from '../../../src/core/types.ts';

/* The parts of ffxiv-gearing's page that this file reads (its `window.store` and game data). That page has no types here,
   so each shape names only what is used. */
export type TheirGear = {
  data: { jobCategory: number; bonusStats?: Record<string, number>; bonusType?: number };
  jobs: Record<string, unknown>;
  stats: Record<string, number>;
  syncedLevel?: number | null;
  concretizeStat(stat: string): string;
};
export type TheirStore = {
  setMode(mode: string): void;
  setJob(jobId: string): void;
  minLevel: number;
  maxLevel: number;
  loadingStatus: string;
  equippedGears: { clear(): void };
  gears: { clear(): void; put(item: { id: number }): void; get(id: string): TheirGear };
  setSyncLevel(cap: number | undefined, level: number): void;
};
export type TheirGame = {
  jobSchemas: Record<string, { mainStat: string }>;
  jobLevels: number[];
  syncLevels: Record<number, number[]>;
  getCaps(item: { level: number; slot: number; role: number }, level: number): Record<string, number>;
};

/* What setup returns: counts of our pieces, theirs, and those not wearable there with examples per their job category. */
export type SetupCounts = {
  ours: number;
  theirs: number;
  notWearable: number;
  notWearableExamples: Record<string, string[]>;
  mainStatFixed: boolean;
};

/* What capsSweep returns. */
export type CapsResult = {
  compared: number;
  equal: number;
  off1: number;
  more: number;
  levels: number;
  byGroup: Record<string, [number, number]>;
  examples: { ilvl: number; code: number; kind: number; job: string; stat: string; ours: number; theirs: number }[];
};

/* One of our pieces a job can wear, with their gear object for it (null when their data has no such item). */
type Prepared = { row: ParsedRow; item: PoolItem; g: TheirGear | null };

/* One difference kept as an example. */
type Example = {
  tag: string;
  id: number;
  name: string;
  slot: number;
  ilvl: number;
  equipLevel: number;
  kind: number;
  stat: string;
  raw: number;
  ours: number;
  theirs: number;
  ourTarget: number | null;
  theirTarget: number | null | undefined;
};

/* What compare returns for one setting. */
export type CompareResult = {
  level: number;
  cap: number | null;
  pieces: number;
  stats: number;
  equal: number;
  bonus: number;
  tags: Record<string, number>;
  onScaling: Record<string, number>;
  offBy: Record<string, Record<string, number>>;
  maxOff: Record<string, number>;
  examples: Example[];
};

declare global {
  /* The object the runner reads from the page once this bundle has run. */
  var OURS: { setup: typeof setup; settings: typeof settings; compare: typeof compare; capsSweep: typeof capsSweep };
}

const THEIR_KEY: Partial<Record<StatKey, string>> = {
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  mind: 'MND',
  sks: 'SKS',
  sps: 'SPS',
  piety: 'PIE',
  ten: 'TEN',
  vit: 'VIT',
  crit: 'CRT',
  det: 'DET',
  dh: 'DHT',
};
const EXAMPLES = 25; // differences kept per tag and setting, except unexplained ones (all kept)
// how far apart the two values are: the size buckets of `offBy`
const OFF_BUCKETS: [number, string][] = [
  [1, '1'],
  [2, '2'],
  [5, '3-5'],
  [10, '6-10'],
  [Infinity, '11+'],
];

const prepared = new Map<string, Prepared[]>();
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/* Our stat key -> their stat key, for a job. */
function keyMap(job: JobContext): Partial<Record<StatKey, string>> {
  return Object.fromEntries(job.stats.map(s => [s, THEIR_KEY[s]]));
}

/* Load all of their gear data, switch their page to `jobId` in view mode with every database piece this job can wear,
   and keep our pool items for it. Returns counts: ours (our pieces), theirs (of those, in their data), notWearable
   (in their data but not wearable by the job there) with a few examples per their job category, and mainStatFixed
   (their tank mainStat corrected from 'VIT' to 'STR', see D4 above). */
async function setup(store: TheirStore, game: TheirGame, jobId: string): Promise<SetupCounts> {
  const job = makeJobContext(jobId);
  // D4: their job table maps a tank's Main Attribute to Vitality, the rule before patch 5.0 (patch notes: "changed from
  // vitality to strength"). Set before the job loads, so none of their cached values saw the old one. Their damage
  // math also reads the field, but it is not compared here.
  const schema = game.jobSchemas[jobId];
  if (!schema) {
    throw new Error(`their data has no job ${jobId}`);
  }
  const mainStatFixed = schema.mainStat === 'VIT';
  if (mainStatFixed) {
    schema.mainStat = 'STR';
  }
  store.setMode('edit');
  store.setJob(jobId);
  store.minLevel = 1; // load every item level group
  store.maxLevel = 9999;
  await sleep(50);
  while (store.loadingStatus !== 'ready') {
    await sleep(100);
  }
  store.setMode('view');
  store.equippedGears.clear();
  store.gears.clear();
  const bit = 1 << job.jobIndex;
  const list: Prepared[] = [];
  let notWearable = 0;
  const notWearableExamples: Record<string, string[]> = {};
  for (const r of ITEMS) {
    if (!(r[ROW.jobMask] & bit)) {
      continue;
    }
    const row = parseRow(r);
    const item = poolItemFromRow(job, row);
    if (!wearable(job, item)) {
      continue;
    }
    store.gears.put({ id: row.gameId });
    const g = store.gears.get(String(row.gameId));
    list.push({ row, item, g });
  }
  await sleep(50);
  let theirs = 0;
  for (const p of list) {
    try {
      const gear = p.g;
      if (!gear) {
        continue;
      }
      gear.data; // throws when their data has no such item
      theirs++;
      if (!gear.jobs[jobId]) {
        notWearable++;
        const k = 'category ' + gear.data.jobCategory;
        const examples = notWearableExamples[k] ?? [];
        notWearableExamples[k] = examples;
        if (examples.length < 3) {
          examples.push(`${p.row.name} (${p.row.gameId})`);
        }
      }
    } catch {
      p.g = null;
    }
  }
  prepared.set(jobId, list);
  return { ours: list.length, theirs, notWearable, notWearableExamples, mainStatFixed };
}

/* Their sync settings for a job: [level, item level or null] for each job level up to the job's cap, "level only"
   first, then each duty item level they list for that level. */
function settings(game: TheirGame, jobId: string): [number, number | null][] {
  const job = makeJobContext(jobId);
  const out: [number, number | null][] = [];
  for (const level of game.jobLevels) {
    if (level > job.maxLevel) {
      continue;
    }
    out.push([level, null]);
    for (const s of game.syncLevels[level] ?? []) {
      out.push([level, s]);
    }
  }
  return out;
}

function tag(
  job: JobContext,
  p: Prepared,
  s: StatKey,
  ours: number,
  theirs: number,
  ourTarget: number | null,
  theirTarget: number | null | undefined,
  level: number,
): string {
  if (p.row.slotCode === 2) {
    return 'D2';
  }
  // a target at or above the piece's own item level lowers nothing (theirs still caps there, which is D1 territory)
  const lowered = (t: number | null | undefined): number | null => (t != null && t < p.row.ilvl ? t : null);
  if (lowered(ourTarget) !== lowered(theirTarget)) {
    return level === 100 ? 'D5' : 'target';
  }
  const factor = kindFactors(job, p.row.kind)?.[s] ?? 1;
  if (Math.abs(ours - theirs) === 1 && factor < 1) {
    return 'D1';
  }
  return 'unexplained';
}

/* The bonus stats ffxiv-gearing adds to a piece at its current sync, by their stat key: their Gear.stats adds
   data.bonusStats, uncapped, always for Crucible pieces (bonusType 11) and for Occult Crescent pieces (9) only when
   synced to item level 700. This project leaves both out on purpose (D6), so the check takes them off their value. */
function theirBonus(g: TheirGear): Record<string, number> {
  const d = g.data;
  const out: Record<string, number> = {};
  if (!d.bonusStats || !(d.bonusType === 11 || (d.bonusType === 9 && g.syncedLevel === 700))) {
    return out;
  }
  for (const [stat, value] of Object.entries(d.bonusStats)) {
    const k = g.concretizeStat(stat);
    out[k] = (out[k] || 0) + value;
  }
  return out;
}

/* Compare every prepared piece of `jobId` at one setting. Returns {level, cap, pieces, stats, equal, bonus, tags,
   onScaling, offBy, maxOff, examples}; bonus counts the stats their bonus was taken off (theirBonus); onScaling counts the differences per tag on gear whose item level scales with the level
   (parseRow scales); offBy counts them per tag and size of the gap (OFF_BUCKETS), maxOff is the largest gap per tag. */
function compare(store: TheirStore, jobId: string, level: number, cap: number | null): CompareResult {
  const job = makeJobContext(jobId);
  const map = keyMap(job);
  store.setSyncLevel(cap ?? undefined, level);
  const sync = { cap, sync: cap != null, level };
  const res: CompareResult = {
    level,
    cap,
    pieces: 0,
    stats: 0,
    equal: 0,
    bonus: 0,
    tags: {},
    onScaling: {},
    offBy: {},
    maxOff: {},
    examples: [],
  };
  const kept: Record<string, number> = {};
  for (const p of prepared.get(jobId) ?? []) {
    const gear = p.g;
    if (!gear) {
      continue;
    }
    res.pieces++;
    const theirs = gear.stats;
    const extra = theirBonus(gear);
    const ours = effStats(job, p.item, sync);
    let ourTarget: number | null = null;
    let theirTarget: number | null | undefined;
    for (const s of job.stats) {
      const theirKey = map[s];
      if (!theirKey) {
        continue;
      }
      res.stats++;
      const o = ours[s] || 0;
      if (extra[theirKey]) {
        res.bonus++;
      }
      const t = (theirs[theirKey] || 0) - (extra[theirKey] || 0);
      if (o === t) {
        res.equal++;
        continue;
      }
      if (theirTarget === undefined) {
        ourTarget = itemSyncIlvl(p.item, sync);
        theirTarget = gear.syncedLevel ?? null;
      }
      const k = tag(job, p, s, o, t, ourTarget, theirTarget, level);
      res.tags[k] = (res.tags[k] || 0) + 1;
      if (p.row.scales) {
        res.onScaling[k] = (res.onScaling[k] || 0) + 1;
      }
      const gap = Math.abs(o - t);
      const b = OFF_BUCKETS.find(([max]) => gap <= max)?.[1] ?? '11+';
      const buckets = res.offBy[k] ?? {};
      res.offBy[k] = buckets;
      buckets[b] = (buckets[b] || 0) + 1;
      res.maxOff[k] = Math.max(res.maxOff[k] || 0, gap);
      kept[k] = (kept[k] || 0) + 1;
      if (k === 'unexplained' || k === 'target' || (kept[k] ?? 0) <= EXAMPLES) {
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
const CAP_JOBS: [string, StatKey[]][] = [
  ['SGE', ['mind', 'vit', 'crit', 'det', 'dh', 'sps', 'piety']],
  ['PLD', ['str', 'sks', 'ten']],
  ['NIN', ['dex']],
  ['BLM', ['int']],
];

/* Caps alone: their getCaps against our capValue at every item level 1 to MAX_REAL their data defines (theirs keeps
   only the item levels of real items and duty syncs), every slot code and stat factor kind 0 to 12. Returns counts
   {compared, equal, off1, more, byGroup: {'factor<100'|'factor 100' x 'off-hand'|'other': [compared, differing]},
   examples}. */
function capsSweep(game: TheirGame): CapsResult {
  const res: CapsResult = { compared: 0, equal: 0, off1: 0, more: 0, levels: 0, byGroup: {}, examples: [] };
  const seen = new Set<number>();
  for (let ilvl = 1; ilvl <= MAX_REAL; ilvl++) {
    for (let code = 0; code < THEIR_SLOT.length; code++) {
      for (let kind = 0; kind < 13; kind++) {
        const caps = game.getCaps({ level: ilvl, slot: THEIR_SLOT[code], role: kind }, ilvl);
        if (Number.isNaN(caps.VIT)) {
          continue; // an item level their data does not define
        }
        seen.add(ilvl);
        for (const [jobId, stats] of CAP_JOBS) {
          const job = makeJobContext(jobId);
          const map = keyMap(job);
          const f = kindFactors(job, kind);
          if (!f) {
            throw new Error(`no stat factors for kind ${kind}`);
          }
          for (const st of stats) {
            const ours = capValue(job, st, ilvl, DB_SLOT_TYPE[code], DB_SLOT_PCT[code], f[st]);
            const theirs = caps[map[st] ?? ''] ?? Number.NaN;
            const g = `${(f[st] ?? 1) < 1 ? 'factor<100' : 'factor 100'}, ${code === 2 ? 'off-hand' : 'other'}`;
            if (!res.byGroup[g]) {
              res.byGroup[g] = [0, 0];
            }
            const b = res.byGroup[g];
            b[0]++;
            res.compared++;
            if (ours === theirs) {
              res.equal++;
              continue;
            }
            b[1]++;
            if (Math.abs(ours - theirs) === 1) {
              res.off1++;
            } else {
              res.more++;
            }
            if (res.examples.length < 40 && (code !== 2 || Math.abs(ours - theirs) > 1)) {
              res.examples.push({ ilvl, code, kind, job: jobId, stat: st, ours, theirs });
            }
          }
        }
      }
    }
  }
  res.levels = seen.size;
  return res;
}

globalThis.OURS = { setup, settings, compare, capsSweep };
