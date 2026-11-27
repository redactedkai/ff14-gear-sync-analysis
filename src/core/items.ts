/* Pool items and the real-item database (src/data/items.json).
   A pool item: {id, name, type, ilvl, stats (stat keys), copies, src: 'game' | 'generated' | 'custom'}; a database
   piece also has its gameId. `id` is made fresh for each object and means nothing outside this page load.
   Identity: anything that is kept (a set's pieces, saved picks) refers to a database piece by its gameId (the game's
   item id, itemById), with its name stored beside it for a reader; poolKey (name, slot, item level) only groups the same
   piece from several sources, as the menus do. A gameId never changes; a name can, in a patch. */
import { fromKeys, last, mustHave } from './guards.ts';
import {
  SLOT_LABEL,
  ITEM_STAT_ORDER,
  DB_SLOT_TYPE,
  DB_SLOT_PCT,
  DB_SLOT_BLOCKS,
  TWO_HANDED_SLOT_CODE,
  ACTIVITIES,
  ACTIVITY_MARKET_BIT,
  EXPANSIONS,
  ROW,
  GEAR_CATEGORIES,
  DAMAGE_DEFENSE_KEYS,
} from './constants.ts';
import { levelParams } from './level-params.ts';
import { ITEMS, MP } from './tables.ts';
import { buildPiece } from './formulas.ts';
import type { DamageDefenseKey, ItemRow, JobContext, MeldInfo, PoolItem, RawStatKey, SlotType, StatKey, StatMap } from './types.ts';

/* A database row as an object (parseRow). */
export interface ParsedRow {
  name: string;
  slotCode: number;
  type: SlotType;
  /* slot share, thousandths */
  pct: number;
  /* slot types it leaves empty */
  blocks: readonly SlotType[];
  ilvl: number;
  lvl: number;
  mask: number;
  /* the raw stats, in ITEM_STAT_ORDER */
  st: number[];
  unique: boolean;
  hq: boolean;
  routes: readonly number[];
  kind: number;
  meldSlots: number;
  overmeld: boolean;
  gameId: number;
  scales: boolean;
}
/* The item level span of an expansion (expansionBounds). */
export interface ExpansionBound {
  short: string;
  name: string;
  from: number | null;
  to: number | null;
}
/* A gear category of a database piece ({key, label}: GEAR_CATEGORIES). */
export type GearCategory = (typeof GEAR_CATEGORIES)[number];
/* The filters of browseItems: a search text, a slot type ('any' for every one), the expansions to hide (EXPANSIONS short
   names), the item level range and the highest equip level (0 or missing for no limit). */
export interface BrowseFilter {
  q?: string;
  type?: SlotType | 'any' | '';
  expOff?: readonly string[];
  ilvlMin?: number;
  ilvlMax?: number;
  lvlMax?: number;
}
/* The filters browseItems and filterGear take: expansions to hide, the item level range and the highest equip level, 0 for
   no limit (gearFilter). */
export interface GearFilter {
  expOff: readonly string[];
  ilvlMin: number;
  ilvlMax: number;
  lvlMax: number;
}
/* The database facts of a pool item (rowFacts). */
interface ItemFacts {
  routes: readonly number[];
  slotCode: number;
  kind: number;
  lvl: number;
  scales: boolean;
  slots: number;
  overmeld: boolean;
  category: number;
  damageDefense: Record<DamageDefenseKey, number>;
}

let nextId = 1;
function newId(): string {
  return 'i' + nextId++;
}

/* A pool item with defaults (one copy, hand-made); `stats` ({stat key: points}) may leave stats out (0), `extra` overrides any field.
   Frozen, with its stats and any other object field (a hand-made `meld`): pool items are shared by every search, the
   result rows and the caches keyed by them (WeakMaps in this file and piece.ts), on the page's thread and in
   the worker alike, so nothing may change one after it is made. A piece that changes is a new item. */
export function mkItem(name: string, type: SlotType, ilvl: number, stats: StatMap, extra?: Partial<PoolItem>): PoolItem {
  const item = Object.assign({ id: newId(), name, type, ilvl, stats: { ...stats }, copies: 1, src: 'custom' }, extra || {});
  for (const value of Object.values(item)) {
    if (value && typeof value === 'object') {
      Object.freeze(value);
    }
  }
  return Object.freeze(item);
}

/* Generic pieces: every ordered pair (A, B) of allowed substats per slot type. */
export function genericItems(job: JobContext, ilvl: number, subsAllowed: readonly StatKey[], types: readonly SlotType[]): PoolItem[] {
  const items: PoolItem[] = [];
  types.forEach(t => {
    subsAllowed.forEach(a => {
      subsAllowed.forEach(b => {
        if (a === b) {
          return;
        }
        const st = buildPiece(job, ilvl, t, [a, b]);
        const nm = SLOT_LABEL[t] + ' ilvl ' + ilvl + ' · ' + job.short[a] + '/' + job.short[b];
        items.push(mkItem(nm, t, ilvl, st, { src: 'generated', copies: 2 }));
      });
    });
  });
  return items;
}

/* The position of a raw stat key ('crit', 'sps', 'mainAttr', ...) in a row's stats (ITEM_STAT_ORDER). */
function statIdx(key: RawStatKey): number {
  return ITEM_STAT_ORDER.indexOf(key);
}

/* A database row's raw stats as numbers, in ITEM_STAT_ORDER (the row stores them comma-joined). */
export function rowStats(row: ItemRow): number[] {
  return row[ROW.stats].split(',').map(Number);
}

/* A database row's raw stats as this job's stat keys (job.stats; the keys are the game's own, so a stat the job has
   is read as it is). The game's generic Main Attribute adds to the job's main stat; Secondary Attribute adds to its
   secondary stat: Piety or Tenacity where the job has one (specKey), Direct Hit otherwise (xivgear's mapping, with
   in-game values for a healer and a Ninja). A tank's main stat here is Strength (verified: patch 5.0 notes changed it
   from Vitality; ClassJob.PrimaryStat); its Tenacity from Secondary Attribute is inferred. */
export function dbStats(job: JobContext, raw: readonly number[]): StatMap {
  const rawOf = (k: RawStatKey) => raw[statIdx(k)] || 0;
  const secondaryKey = job.specKey ?? 'dh'; // where Secondary Attribute goes
  return Object.fromEntries(
    job.stats.map(s => [s, rawOf(s) + (s === job.mainKey ? rawOf('mainAttr') : 0) + (s === secondaryKey ? rawOf('secAttr') : 0)]),
  );
}

const kindCache = new Map<string, StatMap>();
/* The stat factors of a database item kind (a row's statFactor) by the job's stat keys: MP[stat][kind] / 100
   (Vitality 0.9 on Int/Mind gear; every main stat 0.9 on pieces that carry all four). Null for an unknown kind, which
   means the job's own factors (jobFactor in formulas.ts). Frozen and cached per job and kind. A piece whose main stat is
   the generic Main Attribute still takes its kind's factor for the job's main stat under sync: Azeyma's Earrings
   (kind 0) synced to item level 430 show main 71 in game (xivgear's test notes), the 0.9 cap, not the full 78. */
export function kindFactors(job: JobContext, kind: number | null | undefined): StatMap | null {
  if (kind == null || MP.vit[kind] == null) {
    return null;
  }
  const key = job.jobId + '|' + kind;
  let factors = kindCache.get(key);
  if (!factors) {
    // MP holds percents, the factors here are fractions
    factors = Object.freeze(Object.fromEntries(job.stats.map(s => [s, MP[s][kind] / 100])));
    kindCache.set(key, factors);
  }
  return factors;
}

/* A database row as an object, named as below (the fields of ROW, plus the slot code's type, share and blocks). */
export function parseRow(r: ItemRow): ParsedRow {
  return {
    name: r[ROW.name],
    slotCode: r[ROW.slotCode],
    type: DB_SLOT_TYPE[r[ROW.slotCode]],
    pct: DB_SLOT_PCT[r[ROW.slotCode]], // slot share, thousandths
    blocks: DB_SLOT_BLOCKS[r[ROW.slotCode]], // slot types it leaves empty
    ilvl: r[ROW.ilvl],
    lvl: r[ROW.equipLevel],
    mask: r[ROW.jobMask],
    st: rowStats(r),
    unique: Boolean(r[ROW.unique]),
    hq: Boolean(r[ROW.hq]), // can be high quality: the stats are the HQ ones
    routes: r[ROW.routes], // ways to get it: bit masks over ACTIVITIES (routesAllow)
    kind: r[ROW.kind], // item kind: the column of the stat factor table MP (kindFactors)
    meldSlots: r[ROW.meldSlots], // guaranteed materia slots
    overmeld: Boolean(r[ROW.overmeld]), // overmelding allowed
    gameId: r[ROW.gameId], // the game's item id (Item.csv row), for links to and checks against other tools
    scales: Boolean(r[ROW.scales]), // item level follows the wearer's level (Item.SubStatCategory 2; syncTarget)
  };
}

/* Item level span of each expansion: from the previous expansion's level-cap sync item level to its own (the last
   one is open-ended). [{short, name, from, to}], `from` of the first and `to` of the last are null. */
export function expansionBounds(): ExpansionBound[] {
  // the item level gear is synced to at each expansion's level cap
  const capSync = EXPANSIONS.map(e => levelParams(e.levelCap).sync);
  return EXPANSIONS.map(({ short, name }, i) => ({
    short,
    name,
    from: i ? capSync[i - 1] : null,
    to: i < EXPANSIONS.length - 1 ? capSync[i] : null,
  }));
}

/* The expansion a database piece belongs to (an EXPANSIONS short name), from its equip level: each expansion raised the
   level cap (50, 60, ... 100), so the band its equip level falls in names it. Inferred, not a game column (items have
   no expansion or patch field); checked against item ids, which run roughly in release order: late ids in an old band
   are new jobs' weapons added to old content, which belong with it. Level-1 pieces (gift earrings and rings released
   later) use the item level band of expansionBounds instead. */
export function expansionOf(lvl: number, ilvl: number): string {
  if (lvl > 1) {
    return (EXPANSIONS.find(e => lvl <= e.levelCap) ?? last(EXPANSIONS, 'expansions')).short;
  }
  const b = expansionBounds().find(x => (x.from == null || ilvl > x.from) && (x.to == null || ilvl <= x.to));
  return mustHave(b, `expansion band for item level ${ilvl}`).short;
}

/* Whether `text` passes a search box: every word of `query` is in it, ignoring case; an empty search passes
   everything. The rule of every search on the page (the gear browser, the Food menu, pieces with the same result). */
export function searchMatches(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(w => lower.includes(w));
}

/* Database rows this job can equip, matching the filter {q, type, expOff, ilvlMin, ilvlMax, lvlMax} (expOff: the
   EXPANSIONS short names to hide). Returns parsed rows. Rows above the job's level cap (job.maxLevel) are left out
   whatever lvlMax says: the job can never wear them.
   The job mask alone decides the weapon kind: Paladin has only one-handed weapons and shields, and White Mage also has
   an A Realm Reborn wand and shield (Tidal Wave, item level 100) besides its two-handed weapons. */
export function browseItems(job: JobContext, f: BrowseFilter): ParsedRow[] {
  const bit = 1 << job.jobIndex,
    out: ParsedRow[] = [];
  const q = (f.q || '').trim();
  const mainIdx = statIdx(job.mainKey),
    attrIdx = statIdx('mainAttr');
  for (let k = 0; k < ITEMS.length; k++) {
    const r = ITEMS[k];
    // cheap checks on the raw row first; parseRow (which splits the stats) runs only for rows that pass
    if (!(r[ROW.jobMask] & bit)) {
      continue;
    }
    if (f.type && f.type !== 'any' && DB_SLOT_TYPE[r[ROW.slotCode]] !== f.type) {
      continue;
    }
    if (f.expOff?.length && f.expOff.includes(expansionOf(r[ROW.equipLevel], r[ROW.ilvl]))) {
      continue;
    }
    if (f.ilvlMin && r[ROW.ilvl] < f.ilvlMin) {
      continue;
    }
    if (f.ilvlMax && r[ROW.ilvl] > f.ilvlMax) {
      continue;
    }
    if (r[ROW.equipLevel] > job.maxLevel || (f.lvlMax && r[ROW.equipLevel] > f.lvlMax)) {
      continue;
    }
    if (q && !searchMatches(r[ROW.name], q)) {
      continue;
    }
    const p = parseRow(r);
    if (!p.st[mainIdx] && !p.st[attrIdx]) {
      continue; // must carry this job's main stat, or Main Attribute
    }
    out.push(p);
  }
  return out;
}

/* The same piece in the pool: the same name, slot and item level, from whichever source (menus group by it). Not an
   identity to keep: several rows could share it, and a name can change in a patch; keep the gameId (itemById). */
export const poolKey = (x: { name: string; type: SlotType; ilvl: number }): string => [x.name, x.type, x.ilvl].join('|');

// the database rows of each pool key, in database order, built once on first use; and the facts of each key looked up
// so far. The index holds only rows, so building it is cheap: the page's thread builds it when it shows its first game
// piece (an Auto-fill's first result), and building every key's facts there blocked the page for about 25 ms (150 ms at 4x
// CPU throttle)
let rowsByKey: Map<string, ItemRow[]> | null = null;
const factsByKey = new Map<string, ItemFacts | null>();

/* The database facts about a pool item ({routes, slotCode, kind, lvl, scales, slots, overmeld, category,
   damageDefense}), looked up by its pool key, so saved pools need no repair when a fact is added. The same object for
   the same key. Null for items not from the database (hand-made, generated) and for a key no row has. */
function rowFacts(item: PoolItem): ItemFacts | null {
  if (item.src !== 'game') {
    return null;
  }
  if (!rowsByKey) {
    rowsByKey = new Map();
    for (const r of ITEMS) {
      const key = poolKey({ name: r[ROW.name], type: DB_SLOT_TYPE[r[ROW.slotCode]], ilvl: r[ROW.ilvl] });
      const rows = rowsByKey.get(key);
      if (rows) {
        rows.push(r);
      } else {
        rowsByKey.set(key, [r]);
      }
    }
  }
  const key = poolKey(item);
  if (!factsByKey.has(key)) {
    factsByKey.set(key, factsOfRows(rowsByKey.get(key)));
  }
  return factsByKey.get(key) ?? null;
}

/* The facts (rowFacts) of the database rows `rows` that share a pool key, or null for none. Several rows could share a
   key (the same piece from two sources): their routes are joined (any one gets it) and every other fact comes from the
   first row, so rows sharing a key must agree on those facts (tests/unit/core/items.identity.test.js checks it; today no two rows share a
   key). */
function factsOfRows(rows: readonly ItemRow[] | undefined): ItemFacts | null {
  if (!rows) {
    return null;
  }
  const first = rows[0];
  return {
    routes: rows.length > 1 ? [...new Set(rows.flatMap(r => r[ROW.routes]))] : first[ROW.routes],
    slotCode: first[ROW.slotCode],
    kind: first[ROW.kind],
    lvl: first[ROW.equipLevel],
    scales: Boolean(first[ROW.scales]),
    slots: first[ROW.meldSlots],
    overmeld: Boolean(first[ROW.overmeld]),
    category: first[ROW.category],
    damageDefense: fromKeys(DAMAGE_DEFENSE_KEYS, k => first[ROW[k]]),
  };
}

let idIndex: Map<number, ItemRow> | null = null;
/* The database row (an ITEMS entry, read through ROW) of the game's item id `gameId`, or null when no row has it (a piece
   the data no longer keeps, or not a number). The index is built once, on first use, like rowsByKey; every row has its
   own gameId (tests/unit/core/items.identity.test.js checks it). */
export function itemById(gameId: number): ItemRow | null {
  if (!idIndex) {
    idIndex = new Map();
    for (const r of ITEMS) {
      idIndex.set(r[ROW.gameId], r);
    }
  }
  return idIndex.get(gameId) ?? null;
}

const poolItemCache = new WeakMap<JobContext, Map<number, PoolItem | null>>();
/* The pool item of the game's item id `gameId` for `job` (a JobContext): poolItemFromRow of its row, or null when no row
   has it (itemById). The same object for the same job and id, so caches keyed by pool items (meldCaps) stay warm. It
   does not check that the job can wear it. */
export function poolItemById(job: JobContext, gameId: number): PoolItem | null {
  let byId = poolItemCache.get(job);
  if (!byId) {
    byId = new Map();
    poolItemCache.set(job, byId);
  }
  if (!byId.has(gameId)) {
    const row = itemById(gameId);
    byId.set(gameId, row ? poolItemFromRow(job, parseRow(row)) : null);
  }
  return byId.get(gameId) ?? null;
}

/* A pool item's weapon damage and defense facts: {slotCode, kind, values: {damagePhys, damageMag, defensePhys,
   defenseMag}} (with the HQ bonus when it can be HQ), or null for items not from the database. */
export function damageDefenseFacts(item: PoolItem): { slotCode: number; kind: number; values: Record<DamageDefenseKey, number> } | null {
  const f = rowFacts(item);
  return f ? { slotCode: f.slotCode, kind: f.kind, values: f.damageDefense } : null;
}

/* A pool item's routes (bit masks over ACTIVITIES, see routesAllow), or null for items not from the database. */
export function itemRoutes(item: PoolItem): readonly number[] | null {
  return rowFacts(item)?.routes ?? null;
}

/* A pool item's gear category ({key, label} of GEAR_CATEGORIES: where it comes from), or null for items not from the
   database. */
export function categoryOf(item: PoolItem): GearCategory | null {
  const f = rowFacts(item);
  return f ? GEAR_CATEGORIES[f.category] : null;
}

/* True for a relic whose substats the player allocates in game (Zodiac Zeta, Anima, Eureka, Resistance, Manderville,
   Phantom Occultum, ...): a database piece of the Relic category with no substat and no materia slot, as the game files
   list them. The optimizer cannot model the allocation, so its search leaves them out (owner's decision;
   docs/engineering/optimizer.md section 7): as listed, with main stat only, they would win on main stat or
   weapon damage while giving up every substat. */
export function allocatedRelic(job: JobContext, item: PoolItem): boolean {
  return categoryOf(item)?.key === 'relic' && meldInfo(item)?.slots === 0 && job.substats.every(s => !item.stats[s]);
}

/* A pool item's equip level (the level a character needs to wear it), or null for items not from the database. */
export function equipLevel(item: PoolItem): number | null {
  return rowFacts(item)?.lvl ?? null;
}

/* True when a pool item's item level follows the wearer's level (Item.SubStatCategory 2: level 89 and 99 boost gear,
   gift earrings and rings), so level sync lowers it whatever its equip level (syncTarget). False for items not from
   the database. */
export function scalesWithLevel(item: PoolItem): boolean {
  return rowFacts(item)?.scales ?? false;
}

/* The job can wear the pool item: its equip level is at most the job's level cap. Items not from the database (no
   equip level) count as wearable. */
export function wearable(job: JobContext, item: PoolItem): boolean {
  return (equipLevel(item) ?? 0) <= job.maxLevel;
}

/* A pool item's materia slots: {slots, overmeld} (guaranteed slots; whether overmelding is allowed), or null for items
   not from the database (hand-made, generated) and saved items no database row matches any more. A hand-made piece
   may carry its own `meld` ({slots, overmeld}): the sync explainer's generic pieces take 2 slots, as most gear does. */
export function meldInfo(item: PoolItem): MeldInfo | null {
  if (item.meld) {
    return item.meld;
  }
  const f = rowFacts(item);
  return f ? { slots: f.slots, overmeld: f.overmeld } : null;
}

/* A pool item's slot share (pct, thousandths), the slot types it leaves empty (blocks) and its stat factors (factors,
   kindFactors). A database piece has those of its slot code and item kind; any other piece those of the job: a weapon
   on a two-handed job (weaponMode '2h') blocks the off-hand, and factors null means the job's own (jobFactor in formulas.ts). */
export function slotInfo(job: JobContext, item: PoolItem): { pct: number; blocks: readonly SlotType[]; factors: StatMap | null } {
  const f = rowFacts(item);
  if (f) {
    return { pct: DB_SLOT_PCT[f.slotCode], blocks: DB_SLOT_BLOCKS[f.slotCode], factors: kindFactors(job, f.kind) };
  }
  return {
    pct: job.slotPct[item.type],
    // a hand-made weapon on a two-handed job is a two-handed weapon, which blocks the off-hand; on a 'mixed' job it is
    // the one-handed one (job.slotPct.weapon), as on Paladin
    blocks: item.type === 'weapon' && job.weaponMode === '2h' ? DB_SLOT_BLOCKS[TWO_HANDED_SLOT_CODE] : [],
    factors: null,
  };
}

/* "Body + Head" for a piece that also covers the head; the off-hand a two-handed weapon blocks is not named. */
export function slotLabel(type: SlotType, blocks: readonly SlotType[]): string {
  return [SLOT_LABEL[type], ...blocks.filter(t => t !== 'offhand').map(t => SLOT_LABEL[t])].join(' + ');
}

/* The route bits the "Gear categories" filter allows: every ACTIVITIES box not in `off` (a list of keys), plus the market
   board when `market` is on. */
export function allowedActivities(off: readonly string[], market: boolean): number {
  const boxes = ACTIVITIES.filter(a => !off.includes(a.key)).reduce((m, a) => m | a.bit, 0);
  return market ? boxes | ACTIVITY_MARKET_BIT : boxes;
}

/* True when one of the routes needs only allowed bits (allowedActivities): that way of getting the piece is open. */
export function routesAllow(routes: readonly number[], allowed: number): boolean {
  return routes.some(m => (m & ~allowed) === 0);
}

/* How many pieces each "Gear categories" box holds: {key: count} for every ACTIVITIES key, in menu order, 0 for a box with
   nothing. `routeLists`: one list of routes (bit masks over ACTIVITIES) per piece. A piece counts once in every box that one
   of its routes goes through, so a piece with two routes (or one route through two boxes) is in each of those boxes and the
   counts can add up to more than the number of pieces. The menu shows the counts; a box at 0 has nothing for the current
   job and filters. */
export function activityCounts(routeLists: readonly (readonly number[])[]): Record<string, number> {
  const counts = Object.fromEntries(ACTIVITIES.map(a => [a.key, 0]));
  for (const routes of routeLists) {
    let reached = 0;
    for (const route of routes) {
      reached |= route;
    }
    for (const a of ACTIVITIES) {
      if (reached & a.bit) {
        counts[a.key]++;
      }
    }
  }
  return counts;
}

/* The gear filters as the page's settings hold them, {expOff, min, max, lvl} (the browser's or a recipe's; '' for no
   limit), as browseItems and filterGear take them: {expOff, ilvlMin, ilvlMax, lvlMax}, 0 for no limit. */
export function gearFilter(f: { expOff: readonly string[]; min: unknown; max: unknown; lvl: unknown }): GearFilter {
  return { expOff: f.expOff, ilvlMin: Number(f.min) || 0, ilvlMax: Number(f.max) || 0, lvlMax: Number(f.lvl) || 0 };
}

/* Pool items matching the gear filters {expOff, ilvlMin, ilvlMax, lvlMax}: browseItems' filters, for pool items (the
   optimizer's Gear to search). An item with no equip level (not from the database) passes the equip level filter and
   takes its expansion from its item level. */
export function filterGear(pool: readonly PoolItem[], f: GearFilter): readonly PoolItem[] {
  const expOff = f.expOff?.length ? f.expOff : null;
  if (!expOff && !f.ilvlMin && !f.ilvlMax && !f.lvlMax) {
    return pool;
  }
  return pool.filter(i => {
    if ((f.ilvlMin && i.ilvl < f.ilvlMin) || (f.ilvlMax && i.ilvl > f.ilvlMax)) {
      return false;
    }
    const lvl = equipLevel(i);
    if (f.lvlMax && lvl != null && lvl > f.lvlMax) {
      return false;
    }
    return !expOff?.includes(expansionOf(lvl ?? 0, i.ilvl));
  });
}

/* The pool items the "Gear categories" filter lets through: `off` is the list of ACTIVITIES keys left out, `market` the market
   board switch. Items not from the database (hand-made, generated) always pass. */
export function withActivities(pool: readonly PoolItem[], off: readonly string[], market: boolean): readonly PoolItem[] {
  const allowed = allowedActivities(off, market);
  return pool.filter(i => {
    const routes = itemRoutes(i);
    return routes === null || routesAllow(routes, allowed);
  });
}

/* How many of a piece can be worn at once: a ring that is not Unique twice, anything else once. */
export function copiesOf(type: SlotType, unique: boolean): number {
  return type === 'ring' && !unique ? 2 : 1;
}

/* Every database piece `job` (a JobContext) can wear, as frozen pool items (browseItems leaves out gear above the job's
   level cap): what the optimizer searches before its filters (~5-10 ms to build; a solver session keeps it, session.ts). */
export function jobGear(job: JobContext): readonly PoolItem[] {
  return Object.freeze(browseItems(job, {}).map(r => poolItemFromRow(job, r)));
}

/* A parsed database row (parseRow) as a pool item, with its stats as this job's stat keys and its gameId. */
export function poolItemFromRow(job: JobContext, row: ParsedRow): PoolItem {
  return mkItem(row.name, row.type, row.ilvl, dbStats(job, row.st), {
    src: 'game',
    hq: Boolean(row.hq),
    copies: copiesOf(row.type, row.unique),
    gameId: row.gameId,
  });
}
