/* Generated game tables plus the limits derived from them. */
import { DATA_SOURCE, IL, PG } from '../data/item-level.js';
import { ITEMS } from '../data/items.js';

/* DATA_SOURCE: {repo, commit, date} of the xivapi/ffxiv-datamining commit the tables were generated from, or null when unknown. */
export { DATA_SOURCE, IL, PG, ITEMS };

/* Short footer text naming the game-data source, or '' when unknown. */
export function dataSourceLabel(src = DATA_SOURCE) {
  if (!src?.commit) return '';
  const date = /^\d{4}-\d{2}-\d{2}/.exec(src.date ?? '')?.[0];
  return `Game data: ffxiv-datamining ${src.commit.slice(0, 7)}` + (date ? `, ${date}` : '');
}

/* Last row of the ItemLevel sheet. */
export const MAX_ILVL = IL.mind.length - 1;
/* Highest item level of any real piece. Rows above it exist in the sheet but carry no gear. */
export const MAX_REAL = ITEMS.reduce((m, r) => Math.max(m, r[2]), 0);
