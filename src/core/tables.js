/* Generated game tables plus the limits derived from them. */
import { IL, PG } from '../data/item-level.js';
import { ITEMS } from '../data/items.js';

export { IL, PG, ITEMS };

/* Last row of the ItemLevel sheet. */
export const MAX_ILVL = IL.mind.length - 1;
/* Highest item level of any real piece. Rows above it exist in the sheet but carry no gear. */
export const MAX_REAL = ITEMS.reduce((m, r) => Math.max(m, r[2]), 0);
