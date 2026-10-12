/* Pool items and the real-item database (src/data/items.json).
   A pool item: {id, name, type, ilvl, stats (neutral keys), copies, src: 'game' | 'generated' | 'custom'}. */
import { SLOT_LABEL, ITEM_STAT_ORDER, DB_SLOT_TYPE, DB_SLOT_PCT, DB_SLOT_BLOCKS, SOURCES, EXPANSIONS } from './constants.js';
import { expansionBounds } from './speed.js';
import { ITEMS } from './tables.js';
import { blankStats, buildPiece } from './formulas.js';

let nextId = 1;
export function newId() {
  return 'i' + nextId++;
}
/* After restoring saved items, make sure new ids never collide with theirs. */
export function reserveIds(ids) {
  let m = 0;
  ids.forEach(id => {
    const n = parseInt(String(id).slice(1), 10);
    if (n > m) m = n;
  });
  nextId = Math.max(nextId, m + 1);
}

export function mkItem(name, type, ilvl, stats, extra) {
  return Object.assign({ id: newId(), name, type, ilvl, stats: Object.assign(blankStats(), stats), copies: 1, src: 'custom' }, extra || {});
}

/* Generic pieces: every ordered pair (A, B) of allowed substats per slot type, with an optional
   Direct Hit third substat (healer-style gear). */
export function genericItems(job, ilvl, subsAllowed, third, types) {
  const items = [];
  types.forEach(t => {
    subsAllowed.forEach(a => {
      subsAllowed.forEach(b => {
        if (a === b) return;
        const subs = [a, b];
        if (third && a !== 'dh' && b !== 'dh') subs.push('dh');
        const st = buildPiece(job, ilvl, t, subs);
        const nm = SLOT_LABEL[t] + ' ilvl ' + ilvl + ' · ' + job.short[a] + '/' + job.short[b] + (subs.length > 2 ? '/DH' : '');
        items.push(mkItem(nm, t, ilvl, st, { src: 'generated', copies: 2 }));
      });
    });
  });
  return items;
}

export function statIdx(key) {
  return ITEM_STAT_ORDER.indexOf(key);
}

/* A database row's 12 raw stats as this job's neutral keys. */
export function dbStats(job, st12) {
  const g = k => st12[statIdx(k)] || 0;
  const p = job.profile;
  return { main: g(p.main), vit: g('vit'), crit: g('crit'), det: g('det'), dh: g('dh'), spd: g(p.spd), spec: p.spec ? g(p.spec) : 0 };
}

export function parseRow(r) {
  return {
    name: r[0],
    slotCode: r[1],
    type: DB_SLOT_TYPE[r[1]],
    pct: DB_SLOT_PCT[r[1]], // slot share, thousandths
    blocks: DB_SLOT_BLOCKS[r[1]], // slot types it leaves empty
    ilvl: r[2],
    lvl: r[3],
    mask: r[4],
    st: r[5].split(',').map(Number),
    unique: !!r[6],
    hq: !!r[7], // can be high quality: the stats are the HQ ones
    sources: r[8] | 0, // bit mask over SOURCES
  };
}

/* The expansion a database piece belongs to (an EXPANSIONS short name), from its equip level: each expansion raised the
   level cap (50, 60, ... 100), so the band its equip level falls in names it. Inferred, not a game column (items have
   no expansion or patch field); checked against item ids, which run roughly in release order: late ids in an old band
   are new jobs' weapons added to old content, which belong with it. Level-1 pieces (gift earrings and rings released
   later) use the item level band of expansionBounds instead. */
export function expansionOf(lvl, ilvl) {
  if (lvl > 1) return (EXPANSIONS.find(e => lvl <= e[2]) || EXPANSIONS[EXPANSIONS.length - 1])[0];
  const b = expansionBounds().find(x => (x.from == null || ilvl > x.from) && (x.to == null || ilvl <= x.to));
  return b.short;
}

/* Database rows this job can equip, matching the filter {q, type, expOff, ilvlMin, ilvlMax, lvlMax} (expOff: the
   EXPANSIONS short names to hide). Returns parsed rows.
   The job mask alone decides the weapon kind: Paladin has only one-handed weapons and shields, and White Mage also has
   an A Realm Reborn wand and shield (Tidal Wave, item level 100) besides its two-handed weapons. */
export function browseItems(job, f) {
  const bit = 1 << job.jobIndex,
    out = [];
  const q = (f.q || '').trim().toLowerCase();
  const mainIdx = statIdx(job.profile.main);
  for (let k = 0; k < ITEMS.length; k++) {
    const r = ITEMS[k];
    if (!(r[4] & bit)) continue;
    if (f.type && f.type !== 'any' && DB_SLOT_TYPE[r[1]] !== f.type) continue;
    if (f.expOff?.length && f.expOff.includes(expansionOf(r[3], r[2]))) continue;
    if (f.ilvlMin && r[2] < f.ilvlMin) continue;
    if (f.ilvlMax && r[2] > f.ilvlMax) continue;
    if (f.lvlMax && r[3] > f.lvlMax) continue;
    if (q && r[0].toLowerCase().indexOf(q) < 0) continue;
    const p = parseRow(r);
    if (!p.st[mainIdx]) continue; // must carry this job's main stat
    out.push(p);
  }
  return out;
}

/* Non-unique rings can be worn twice. */
/* Identity of a piece in the pool: the same name, slot and item level is the same piece. */
export const poolKey = x => [x.name, x.type, x.ilvl].join('|');

let rowIndex = null;
/* The database facts about a pool item ({sources, slotCode}), looked up by its pool key, so saved pools need no
   repair when a fact is added. Null for items not from the database (hand-made, generated). */
function rowFacts(item) {
  if (item.src !== 'game') return null;
  if (!rowIndex) {
    rowIndex = new Map();
    for (const r of ITEMS) {
      const k = poolKey({ name: r[0], type: DB_SLOT_TYPE[r[1]], ilvl: r[2] });
      const f = rowIndex.get(k);
      rowIndex.set(k, { sources: (f?.sources || 0) | (r[8] | 0), slotCode: f ? f.slotCode : r[1] });
    }
  }
  return rowIndex.get(poolKey(item)) || null;
}

/* The source bit mask (SOURCES) of a pool item. Items not from the database have none. */
export function sourceMask(item) {
  return rowFacts(item)?.sources || 0;
}

/* A pool item's slot share (pct, thousandths) and the slot types it leaves empty (blocks). A database piece has those
   of its slot code; any other piece those of the job: a weapon on a two-handed job blocks the off-hand. */
export function slotInfo(job, item) {
  const f = rowFacts(item);
  if (f) return { pct: DB_SLOT_PCT[f.slotCode], blocks: DB_SLOT_BLOCKS[f.slotCode] };
  return { pct: job.slotPct[item.type], blocks: item.type === 'weapon' && job.weaponMode === '2h' ? DB_SLOT_BLOCKS[0] : [] };
}

/* "Body + Head" for a piece that also covers the head; the off-hand a two-handed weapon blocks is not named. */
export function slotLabel(type, blocks) {
  return [SLOT_LABEL[type], ...blocks.filter(t => t !== 'offhand').map(t => SLOT_LABEL[t])].join(' + ');
}

/* The pool without items from any excluded source (a list of SOURCES keys). */
export function withoutSources(pool, exclude) {
  const mask = SOURCES.filter(s => exclude.includes(s.key)).reduce((m, s) => m | s.bit, 0);
  return mask ? pool.filter(i => !(sourceMask(i) & mask)) : pool;
}

export function poolItemFromRow(job, p) {
  return mkItem(p.name, p.type, p.ilvl, dbStats(job, p.st), { src: 'game', hq: !!p.hq, copies: p.type === 'ring' && !p.unique ? 2 : 1 });
}
