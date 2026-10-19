/* Generated game tables plus the limits derived from them. */
import ITEM_LEVEL_FILE from '../data/item-level.json' with { type: 'json' };
import ITEMS_FILE from '../data/items.json' with { type: 'json' };
import FOOD_FILE from '../data/food.json' with { type: 'json' };
import { ROW } from './constants.js';

/* {repo, commit, date} of the xivapi/ffxiv-datamining commit the tables were generated from, or null when unknown. */
export const DATA_SOURCE = ITEM_LEVEL_FILE.source ?? null;
/* IL: per-stat budget by item level (ItemLevel sheet). PG: [BaseSpeed, LevelModifier, ItemLevelSync] per level 1..100. */
export const IL = ITEM_LEVEL_FILE.IL;
export const PG = ITEM_LEVEL_FILE.PG;
/* MP: the per-item stat factor table (BaseParam MeldParam), {raw stat key: [percent per item kind]}. An item row's kind
   field (row[ROW.kind], its BaseParamModifier) picks the kind: on that item a stat's full-share value is multiplied by the percent. */
export const MP = ITEM_LEVEL_FILE.MP;
/* SHARES: slot shares in thousandths per slot code for weapon damage and defense, {key: [share]} (BaseParam; the stats'
   shares are the slot percents of item-format.json, these differ: weapon damage only on weapons, defense only on armor). */
export const SHARES = ITEM_LEVEL_FILE.SHARES;
/* JOB_MODS: each job's attribute modifiers in percent, {job: {str, dex, int, mind, vit}} (ClassJob; job-context.js). */
export const JOB_MODS = ITEM_LEVEL_FILE.JOBS;
/* ITEMS: the real-gear database rows (format in constants.js). */
export const ITEMS = ITEMS_FILE.items;
/* CURRENT_TOMES: the short names of the two current tomestones (e.g. ['Mathematics', 'Mnemonics']), for the
   "Tomestones (Current)" box's hint. */
export const CURRENT_TOMES = Object.freeze([...(ITEMS_FILE.currentTomes ?? [])]);
/* FOODS: the meals that raise combat substats, [name, ilvl, [[raw stat key, HQ percent, HQ max], ...], [Vitality HQ
   percent, HQ max] or null] (food.js). */
export const FOODS = FOOD_FILE.foods;
/* MATERIA: the materia table, one entry per grade I to XII. values: what a grade adds to a combat substat; gate: the
   lowest gear item level that takes it; high: the grades (1-based) that cannot go past the first overmeld slot. */
export const MATERIA = Object.freeze({
  values: Object.freeze([...ITEMS_FILE.materia.values]),
  gate: Object.freeze([...ITEMS_FILE.materia.gate]),
  high: Object.freeze([...ITEMS_FILE.materia.high]),
});

/* Short footer text naming the game-data source, or '' when unknown. */
export function dataSourceLabel(src = DATA_SOURCE) {
  if (!src?.commit) return '';
  const date = /^\d{4}-\d{2}-\d{2}/.exec(src.date ?? '')?.[0];
  return `Game data: ffxiv-datamining ${src.commit.slice(0, 7)}` + (date ? `, ${date}` : '');
}

/* Last row of the ItemLevel sheet. */
export const MAX_ILVL = IL.mind.length - 1;
/* Highest item level of any real piece. Rows above it exist in the sheet but carry no gear. */
export const MAX_REAL = ITEMS.reduce((m, r) => Math.max(m, r[ROW.ilvl]), 0);
/* Highest equip level of any real piece (the level cap). A synced level below it can level-sync gear. */
export const MAX_LEVEL = ITEMS.reduce((m, r) => Math.max(m, r[ROW.equipLevel]), 0);
