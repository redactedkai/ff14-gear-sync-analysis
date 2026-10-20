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
/* The lowest item level bandAccuracy checks: the first band's start. */
const ACCURACY_MIN_ILVL = 110;
/* bandAccuracy's item level bands, in order: {label, max} with max the band's highest item level (each starts one
   above the band before it, the first at ACCURACY_MIN_ILVL). */
const ACCURACY_BANDS = Object.freeze([
  { label: '110–135', max: 135 },
  { label: '136–300', max: 300 },
  { label: '301–600', max: 600 },
  { label: '601+', max: Infinity },
]);

/* The {name, hq, rarity} of a database row, as predictRaw takes it. */
export function rowItem(row) {
  return { name: row[ROW.name], hq: row[ROW.hq] === 1, rarity: row[ROW.rarity] };
}

/* For every database row (`items`, the whole database by default) with 2+ substats at item level ACCURACY_MIN_ILVL or
   more: does predictRaw reproduce its stats? Returns [{label, n, exact, within1}] in ACCURACY_BANDS order: the rows
   checked, those it reproduces exactly and those with every stat within 1 point. */
export function bandAccuracy(items = ITEMS) {
  const out = ACCURACY_BANDS.map(band => ({ label: band.label, n: 0, exact: 0, within1: 0 }));
  for (const row of items) {
    const il = row[ROW.ilvl];
    if (il < ACCURACY_MIN_ILVL) continue;
    const stats = rowStats(row);
    if (RAW_SUBSTAT_IDX.filter(i => stats[i]).length < 2) continue;
    const predicted = predictRaw(il, row[ROW.slotCode], stats, row[ROW.kind], rowItem(row));
    if (!predicted) continue;
    const counts = out[ACCURACY_BANDS.findIndex(band => il <= band.max)];
    // the largest difference between a predicted and a stored stat
    const worst = Math.max(...predicted.map((value, i) => Math.abs(value - stats[i])));
    counts.n++;
    if (worst === 0) counts.exact++;
    if (worst <= 1) counts.within1++;
  }
  return out;
}

/* Published substat caps at item level 475 (FFXIV Wiki, Item Level Sync page): {label, type (slot type), published
   (the cap), share (slot share, per mille)}. */
const WIKI475 = Object.freeze(
  [
    { label: 'Accessory', type: 'ear', published: 88, share: 67 },
    { label: 'Head / hands / feet', type: 'head', published: 112, share: 85 },
    { label: 'Body / legs', type: 'body', published: 177, share: 135 },
    { label: 'One-handed weapon', type: 'weapon', published: 131, share: 100 },
    { label: 'Two-handed weapon', type: 'weapon', published: 184, share: 140 },
    { label: 'Off-hand (shield)', type: 'offhand', published: 53, share: 40 },
  ].map(row => Object.freeze(row)),
);

/* The Wiki's item level 475 caps against the model: [{label, type, published, share, computed, match}] in WIKI475
   order. computed: the slot's share of Critical Hit's item level 475 budget (statLine's first step; an off-hand by
   offhandParts); match: true when it equals the published cap. */
export function wikiChecks() {
  return WIKI475.map(({ label, type, published, share }) => {
    // the slot's share of Critical Hit's budget (statLine's first step); the off-hand is the two-handed value minus
    // the one-handed value (offhandParts)
    const full = pct => statLine(IL.crit[475], pct).value;
    const computed = type === 'offhand' ? offhandParts(full).value : full(share);
    return { label, type, published, share, computed, match: computed === published };
  });
}
