/* Pool items and the real-item database (src/data/items.js).
   A pool item: {id, name, type, ilvl, stats (neutral keys), copies, src: 'game' | 'generated' | 'custom'}. */
import { SLOT_LABEL, ITEM_STAT_ORDER, DB_SLOT_TYPE } from './constants.js';
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
    subsAllowed.forEach(a =>
      subsAllowed.forEach(b => {
        if (a === b) return;
        const subs = [a, b];
        if (third && a !== 'dh' && b !== 'dh') subs.push('dh');
        const st = buildPiece(job, ilvl, t, subs);
        const nm = SLOT_LABEL[t] + ' ilvl ' + ilvl + ' · ' + job.short[a] + '/' + job.short[b] + (subs.length > 2 ? '/DH' : '');
        items.push(mkItem(nm, t, ilvl, st, { src: 'generated', copies: 2 }));
      }),
    );
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
    ilvl: r[2],
    lvl: r[3],
    mask: r[4],
    st: r[5].split(',').map(Number),
    unique: !!r[6],
  };
}

/* Database rows this job can equip, matching the filter {q, type, ilvlMin, ilvlMax, lvlMax}. Returns parsed rows. */
export function browseItems(job, f) {
  const bit = 1 << job.jobIndex,
    out = [];
  const q = (f.q || '').trim().toLowerCase();
  const mainIdx = statIdx(job.profile.main);
  for (let k = 0; k < ITEMS.length; k++) {
    const r = ITEMS[k];
    if (!(r[4] & bit)) continue;
    if (r[1] === 0 && job.weaponMode !== '2h') continue;
    if (r[1] === 1 && job.weaponMode === '2h') continue;
    if (r[1] === 2 && job.weaponMode !== '1h+oh') continue;
    if (f.type && f.type !== 'any' && DB_SLOT_TYPE[r[1]] !== f.type) continue;
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
export function poolItemFromRow(job, p) {
  return mkItem(p.name, p.type, p.ilvl, dbStats(job, p.st), { src: 'game', copies: p.type === 'ring' && !p.unique ? 2 : 1 });
}
