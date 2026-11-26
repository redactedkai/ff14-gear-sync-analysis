/* What the Expansion and "Gear categories" filter menus (<gsa-expansion-menu>, <gsa-gear-categories>, <gsa-gear-sections>) work out
   from the data, with no DOM: the tabs and their boxes, the closed button's text, the words for a box's number, and the new
   list of left-out boxes after a click. The elements and the Node tests both import it. The page keeps the filter's settings:
   `exclude` is the list of ACTIVITIES keys left out (in ACTIVITIES order), `expOff` the EXPANSIONS short names switched off. */
import { ACTIVITIES, EXPANSIONS } from '../../../core/constants.ts';
import { CURRENT_TOMES, MAX_LEVEL } from '../../../core/tables.ts';
import { DEFAULT_EXCLUDE } from '../../job-sync-panel.js';
import { fmtInt } from '../../text.ts';

/* The events the elements send, `detail` being the patch for the filter's settings: `categories-change` {exclude} or {market}
   from the Gear categories menu, `expansion-change` {expOff}. The Gear browser element listens by these constants; the set page's
   Auto-fill settings write the names in their template (`@categories-change`, `@expansion-change`), which cannot import them. */
export const CATEGORIES_CHANGE_EVENT = 'categories-change';
export const EXPANSION_CHANGE_EVENT = 'expansion-change';

/* The words of the two menus: the labels over their buttons and the market board switch. */
export const EXPANSION_LABEL = 'Expansion';
export const CATEGORIES_LABEL = 'Gear categories';
export const MARKET_SWITCH_LABEL = 'Include market board gear';
/* What the closed Gear categories button says about the market board (its title and the glyph's name). */
export const MARKET_ON_WORDS = 'Market board gear included';
export const MARKET_OFF_WORDS = 'Market board gear not included';

/* One tab of the "Gear categories" menu: `key` is its title in lower case with dashes (it names the tab's element ids), `byRow`
   says its boxes read across, two to a row, rather than down each column, `rows` how many rows the boxes take when they read
   down two columns, and `boxes` its ACTIVITIES entries with their hints filled in. */
export interface GearFromTab {
  key: string;
  title: string;
  byRow: boolean;
  rows: number;
  boxes: readonly { key: string; label: string; hint: string }[];
}

/* The "Gear categories" menu's tabs, in order: each {title, order?}. `title` is the `section` of its boxes in item-format.json;
   `order` (optional) lists the box keys in the order the tab reads row by row, two to a row, instead of ACTIVITIES order (which
   is fixed by the data's route bits): Hard content pairs each fight's Current and Legacy boxes. */
const FROM_SECTIONS: readonly { title: string; order?: readonly string[] }[] = [
  { title: 'Everyday' },
  { title: 'Side content' },
  { title: 'Hard content', order: ['extreme_current', 'extreme_legacy', 'savage_current', 'savage_legacy', 'ultimate'] },
];
/* How many columns a tab's boxes are laid out in (the menu has one width at every window size). */
const FROM_COLUMN_COUNT = 2;
/* The patch series of the level cap ("7.x" at level 100): A Realm Reborn is 2.x, each expansion one more. */
const CAP_PATCH = `${EXPANSIONS.findIndex((expansion: { levelCap: number }) => expansion.levelCap === MAX_LEVEL) + 2}.x`;
/* Up to this many boxes left out, the button says "All but N". */
const ALL_BUT_LIMIT = 5;

/* What a "Gear categories" box covers, shown under its name: its hint with the current tomestones and the level cap's
   patch series filled in. */
export function gearFromHint(activity: { hint: string }): string {
  return activity.hint.replace('{currentTomes}', CURRENT_TOMES.join(' or ')).replace('{capPatch}', CAP_PATCH);
}

/* The tabs of the "Gear categories" menu, frozen, in order (FROM_SECTIONS). */
export const GEAR_FROM_SECTIONS: readonly GearFromTab[] = Object.freeze(
  FROM_SECTIONS.map(({ title, order }) => {
    const inSection = ACTIVITIES.filter((activity: { section: string }) => activity.section === title);
    const ordered = order ? order.flatMap(key => inSection.filter((activity: { key: string }) => activity.key === key)) : inSection;
    const boxes = ordered.map((activity: { key: string; label: string; hint: string }) =>
      Object.freeze({ key: activity.key, label: activity.label, hint: gearFromHint(activity) }),
    );
    return Object.freeze({
      key: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      byRow: Boolean(order),
      rows: Math.ceil(boxes.length / FROM_COLUMN_COUNT),
      boxes: Object.freeze(boxes),
    });
  }),
);

/* The "Gear categories" button's text: "All", "None", "All but N" (up to 5 left out) or "N of M". The market board switch is not
   in the text: the button always shows the market glyph (see marketWords). `exclude`: the ACTIVITIES keys left out. */
export function gearFromSummary(exclude: readonly string[]): string {
  const on = ACTIVITIES.length - exclude.length;
  if (exclude.length === 0) {
    return 'All';
  }
  if (on === 0) {
    return 'None';
  }
  return exclude.length <= ALL_BUT_LIMIT ? `All but ${exclude.length}` : `${on} of ${ACTIVITIES.length}`;
}

/* The glyph's words (its accessible name and the button's title) for the market board switch: `market` true when market
   board gear is searched. */
export function marketWords(market: boolean): string {
  return market ? MARKET_ON_WORDS : MARKET_OFF_WORDS;
}

/* How many of a tab's boxes are ticked, as the tab shows it: "7/8". `exclude`: the keys left out. */
export function tabCountText(tab: GearFromTab, exclude: readonly string[]): string {
  return `${tab.boxes.filter(box => !exclude.includes(box.key)).length}/${tab.boxes.length}`;
}

/* The number at the end of a "Gear categories" box's name: `count` pieces with thousands separators ("1,380"), or '' before a
   count has landed (null or undefined): no number rather than a 0 that is not known. */
export function gearFromCountText(count: number | null | undefined): string {
  return count == null ? '' : fmtInt(count);
}

/* The sentence a screen reader gets for a box's number (the number itself is hidden from it): "1,380 pieces in this category
   under the current filters.", "1 piece in ...", or "No pieces in this category for this job and filters." for 0; '' before a
   count has landed. `count`: the pieces in the box. */
export function gearFromCountWords(count: number | null | undefined): string {
  if (count == null) {
    return '';
  }
  if (count === 0) {
    return 'No pieces in this category for this job and filters.';
  }
  return `${fmtInt(count)} ${count === 1 ? 'piece' : 'pieces'} in this category under the current filters.`;
}

/* The `exclude` list after the box `key` is ticked (`on` true) or unticked, in ACTIVITIES order. */
export function excludeAfterToggle(exclude: readonly string[], key: string, on: boolean): string[] {
  return ACTIVITIES.map((activity: { key: string }) => activity.key).filter((each: string) =>
    each === key ? !on : exclude.includes(each),
  );
}

/* The `exclude` list after "All" (nothing left out), "None" (everything left out) or "Default" (the data's own defaults; a copy). */
export function excludeAfterAll(which: 'all' | 'none' | 'default'): string[] {
  if (which === 'all') {
    return [];
  }
  return which === 'none' ? ACTIVITIES.map((activity: { key: string }) => activity.key) : [...DEFAULT_EXCLUDE];
}

/* The Expansion button's text: "All expansions", one name, "None", or how many are on. `expOff`: the EXPANSIONS short names off. */
export function expansionSummary(expOff: readonly string[]): string {
  const on = EXPANSIONS.filter((expansion: { short: string }) => !expOff.includes(expansion.short));
  if (on.length === EXPANSIONS.length) {
    return 'All expansions';
  }
  if (on.length === 0) {
    return 'None';
  }
  return on.length === 1 ? on[0].name : `${on.length} expansions`;
}

/* The `expOff` list after the expansion `short` is ticked (`on` true) or unticked, in EXPANSIONS order. */
export function expOffAfterToggle(expOff: readonly string[], short: string, on: boolean): string[] {
  return EXPANSIONS.map((expansion: { short: string }) => expansion.short).filter((each: string) =>
    each === short ? !on : expOff.includes(each),
  );
}
