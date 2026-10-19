/* Validation of the stat model against external truth (real items, the Wiki's item level 475 caps), for the unit
   tests. */
import { RAW_SUBSTAT_IDX, ROW } from './constants.js';
import { IL, ITEMS } from './tables.js';
import { offhandParts, predictRaw, statLine } from './formulas.js';
import { rowStats } from './items.js';

/* The item level range the stat model's patterns were measured on (substat shares, stat factors, the Direct Hit line).
   The database starts lower (item level 15, gen_items.py MIN_ILVL) for gear worn in low-level duties; below this its
   own stats are carried as they are and never predicted. */
export const MODEL_MIN_ILVL = 100;
export const ACCURACY_MIN_ILVL = 110;
export const ACCURACY_BANDS = Object.freeze([
  { label: '110–135', max: 135 },
  { label: '136–300', max: 300 },
  { label: '301–600', max: 600 },
  { label: '601+', max: Infinity },
]);

/* The {name, hq, rarity} of a database row, as predictRaw takes it. */
export function rowItem(r) {
  return { name: r[ROW.name], hq: r[ROW.hq] === 1, rarity: r[ROW.rarity] };
}

/* For every row with 2+ substats at item level >= 110: does predictRaw reproduce its stats?
   Returns [{label, n, exact, within1}] (counts) in ACCURACY_BANDS order. */
export function bandAccuracy(items = ITEMS) {
  const out = ACCURACY_BANDS.map(b => ({ label: b.label, n: 0, exact: 0, within1: 0 }));
  for (const r of items) {
    const il = r[ROW.ilvl];
    if (il < ACCURACY_MIN_ILVL) continue;
    const st = rowStats(r);
    if (RAW_SUBSTAT_IDX.filter(i => st[i]).length < 2) continue;
    const p = predictRaw(il, r[ROW.slotCode], st, r[ROW.kind], rowItem(r));
    if (!p) continue;
    const b = out[ACCURACY_BANDS.findIndex(x => il <= x.max)];
    const d = Math.max(...p.map((x, i) => Math.abs(x - st[i])));
    b.n++;
    if (d === 0) b.exact++;
    if (d <= 1) b.within1++;
  }
  return out;
}

/* Published substat caps at item level 475 (FFXIV Wiki, Item Level Sync page): {label, type (slot type), published
   (the cap), share (slot share, per mille)}. */
export const WIKI475 = Object.freeze(
  [
    { label: 'Accessory', type: 'ear', published: 88, share: 67 },
    { label: 'Head / hands / feet', type: 'head', published: 112, share: 85 },
    { label: 'Body / legs', type: 'body', published: 177, share: 135 },
    { label: 'One-handed weapon', type: 'weapon', published: 131, share: 100 },
    { label: 'Off-hand (shield)', type: 'offhand', published: 53, share: 40 },
  ].map(row => Object.freeze(row)),
);

export function wikiChecks() {
  return WIKI475.map(({ label, type, published, share }) => {
    // the slot's share of Critical Hit's budget (statLine's first step); the off-hand is the two-handed value minus
    // the one-handed value (offhandParts)
    const full = pct => statLine(IL.crit[475], pct).value;
    const computed = type === 'offhand' ? offhandParts(full).value : full(share);
    return { label, type, published, share, computed, match: computed === published };
  });
}
