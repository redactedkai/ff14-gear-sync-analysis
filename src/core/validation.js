/* Validation of the stat model against external truth. Shared by the page ("Checked against real gear")
   and the unit tests, so both report the same numbers. */
import { RAW_SUBSTAT_IDX, WEAPON_PCT } from './constants.js';
import { IL, ITEMS } from './tables.js';
import { rnd, predictRaw } from './formulas.js';

export const ACCURACY_MIN_ILVL = 110;
export const ACCURACY_BANDS = Object.freeze([
  { label: '110–135', max: 135 },
  { label: '136–300', max: 300 },
  { label: '301–600', max: 600 },
  { label: '601+', max: Infinity },
]);

/* For every row with 2+ substats at item level >= 110: does predictRaw reproduce its stats?
   Returns [{label, n, exact, within1}] (counts) in ACCURACY_BANDS order. */
export function bandAccuracy(items = ITEMS) {
  const out = ACCURACY_BANDS.map(b => ({ label: b.label, n: 0, exact: 0, within1: 0 }));
  for (const r of items) {
    const il = r[2];
    if (il < ACCURACY_MIN_ILVL) continue;
    const st = r[5].split(',').map(Number);
    if (RAW_SUBSTAT_IDX.filter(i => st[i]).length < 2) continue;
    const p = predictRaw(il, r[1], st, r[9]);
    if (!p) continue;
    const b = out[ACCURACY_BANDS.findIndex(x => il <= x.max)];
    const d = Math.max(...p.map((x, i) => Math.abs(x - st[i])));
    b.n++;
    if (d === 0) b.exact++;
    if (d <= 1) b.within1++;
  }
  return out;
}

/* Published substat caps at item level 475 (FFXIV Wiki, Item Level Sync page): [label, slot type, cap, slot share]. */
export const WIKI475 = Object.freeze(
  [
    ['Accessory', 'ear', 88, 67],
    ['Head / hands / feet', 'head', 112, 85],
    ['Body / legs', 'body', 177, 135],
    ['One-handed weapon', 'weapon', 131, 100],
    ['Off-hand (shield)', 'offhand', 53, 40],
  ].map(r => Object.freeze(r)),
);

export function wikiChecks() {
  return WIKI475.map(([label, type, published, share]) => {
    // the off-hand is the two-handed value minus the one-handed value (formulas.js isOffhand)
    const full = pct => rnd((IL.crit[475] * pct) / 1000);
    const computed = type === 'offhand' ? full(WEAPON_PCT['2h']) - full(WEAPON_PCT['1h+oh']) : full(share);
    return { label, type, published, share, computed, match: computed === published };
  });
}
