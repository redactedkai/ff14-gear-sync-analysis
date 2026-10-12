/* Generated game tables plus the limits derived from them. */
import ITEM_LEVEL_FILE from '../data/item-level.json' with { type: 'json' };
import ITEMS_FILE from '../data/items.json' with { type: 'json' };

/* {repo, commit, date} of the xivapi/ffxiv-datamining commit the tables were generated from, or null when unknown. */
export const DATA_SOURCE = ITEM_LEVEL_FILE.source ?? null;
/* IL: per-stat budget by item level (ItemLevel sheet). PG: [BaseSpeed, LevelModifier, ItemLevelSync] per level 1..100. */
export const IL = ITEM_LEVEL_FILE.IL;
export const PG = ITEM_LEVEL_FILE.PG;
/* MP: the per-item stat factor table (BaseParam MeldParam), {raw stat key: [percent per item kind]}. An item row's last
   field (its BaseParamModifier) picks the kind: on that item a stat's full-share value is multiplied by the percent. */
export const MP = ITEM_LEVEL_FILE.MP;
/* ITEMS: the real-gear database rows (format in constants.js). */
export const ITEMS = ITEMS_FILE.items;

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
