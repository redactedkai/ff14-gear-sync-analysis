/* The Food row's menu of a set page: every meal the job can use, by expansion, with a search box, stat pills and, while
   a pill is on, a Sort row (elements/set-page/food-menu.ts is its element). Pure view builders over plain data: no store, so Node can test them. */
import { EXPANSIONS } from '../../core/constants.ts';
import { allMeals, foodBonus, foodLabel } from '../../core/food.ts';
import { expansionOf, searchMatches } from '../../core/items.ts';
import type { FoodBonusLine, Meal } from '../../core/food.ts';
import type { JobContext, StatKey, Totals } from '../../core/types.ts';

/* What a meal adds on the gear shown (mealMenu): the stat, its text ("CRT +133") and the points. */
export interface MealAdd {
  stat: StatKey;
  text: string;
  value: number;
}

/* One meal of the Food menu (mealMenu). */
export interface MealItem {
  key: string;
  name: string;
  ilvl: number;
  label: string;
  ilvlText: string;
  stats: StatKey[];
  adds: MealAdd[];
  on: boolean;
  onClass: string;
  best: boolean;
}

/* The Food menu's filters (mealsPassing): the pills picked, the search text and the "Best for goal" switch. */
export interface MealFilters {
  stats: readonly StatKey[];
  query: string;
  bestOnly?: boolean;
}

/* The Food row's menu on gear with the totals `gearTotals` (a stat map: core/set.ts evaluateSet's `gear`), `shown` the
   meal the row shows (an allMeals entry, or null), `bestKeys` the keys of the meals tagged "best for goal" ([] for a set
   the optimizer did not make: mealBestKeys). Returns {groups, pills, hasBest}:
   - groups: every meal the job can use, by expansion, newest first, {label, items}. Each meal is {key, name, ilvl,
     label, stats, adds, on}: label "Spell Speed + Direct Hit" (the row's hover text), stats its stat keys (for the
     pills), adds what it gives on this gear in the meal's own order (its main stat first, Vitality last), [{stat,
     text: "CRT +133", value: 133}], on the row shows it, best the meal is tagged "best for goal".
   - pills: the job's substats some meal has, {stat, short, label}.
   - hasBest: some meal is tagged (the menu offers its "Best for goal" switch). */
export function mealMenu(job: JobContext, level: number, gearTotals: Totals, shown: Meal | null, bestKeys: readonly string[] = []) {
  const all = allMeals(job);
  const item = (m: Meal): MealItem => {
    const bonus = foodBonus(job, m, gearTotals, level);
    const lines: StatKey[] = [...m.stats.map(x => x.stat), ...(m.vit ? (['vit'] as const) : [])];
    return {
      key: m.key,
      name: m.name,
      ilvl: m.ilvl,
      label: foodLabel(job, m),
      // what the template shows of it: the item level text
      ilvlText: `i${m.ilvl}`,
      stats: m.stats.map(x => x.stat),
      adds: lines.map(s => ({
        stat: s,
        text: `${job.short[s]} +${(bonus[s] as FoodBonusLine).bonus}`,
        value: (bonus[s] as FoodBonusLine).bonus,
      })),
      on: m === shown,
      onClass: m === shown ? 'on' : '',
      best: bestKeys.includes(m.key),
    };
  };

  // allMeals is oldest first: reversed, each expansion lists its newest meal first
  const items = all.map(item).reverse();
  const groups = [...EXPANSIONS]
    .reverse()
    .map(({ short, name }) => ({ label: name, items: items.filter(x => expansionOf(1, x.ilvl) === short) }))
    .filter(g => g.items.length);
  const pills = job.substats
    .filter(s => all.some(m => m.stats.some(x => x.stat === s)))
    .map(s => ({ stat: s, short: job.short[s], label: job.label[s] }));
  return { groups, pills, hasBest: items.some(x => x.best) };
}

/* What mealMenu returns: the groups, the pills and whether some meal is tagged. */
export type MealMenu = ReturnType<typeof mealMenu>;

/* A meal of the open list: the menu's meal with its stat line and its row classes (mealList). */
export type ListedMeal = MealItem & { line: ReturnType<typeof mealLine>; rowClass: string };

/* The meals tagged "best for goal" for the set `gearSet` as it is saved: its saved list (`bestMeals`, meal keys in allMeals
   order, written by Apply on an Auto-fill result and dropped by a change of the set's pieces, stones, Auto-fill settings or sheet
   level and sync). It stays when only the meal is changed by hand, so the menu keeps its "Best for goal" switch. A
   damaged value (not a list of keys) counts as none: []. */
export function mealBestKeys(gearSet?: { bestMeals?: unknown } | null): string[] {
  const keys = gearSet?.bestMeals;
  if (!Array.isArray(keys) || !keys.every(key => typeof key === 'string')) {
    return [];
  }
  return keys;
}

/* What the Food row shows beside its meal `mealKey` for the tagged meals `bestKeys`: {note}, "best for goal" when the
   meal is tagged, else ''. */
export function mealBestNote(mealKey: string | null, bestKeys: readonly string[]): { note: string } {
  return { note: mealKey != null && bestKeys.includes(mealKey) ? 'best for goal' : '' };
}

/* The Food menu's meals ({stats, name, best} items of mealMenu's groups) that pass its filters: `filters` is {stats (the
   pills picked, stat keys; a meal must have each), query (its search text; every word must be in the name), bestOnly
   (the "Best for goal" switch is on: only the tagged meals and the meal the set holds, so that meal stays in sight; false
   when missing)}. Returns the passing items, in order. */
export function mealsPassing<Item extends Pick<MealItem, 'name' | 'stats' | 'best' | 'on'>>(
  items: readonly Item[],
  { stats, query, bestOnly = false }: MealFilters,
): Item[] {
  return items.filter(x => (!bestOnly || x.best || x.on) && stats.every(s => x.stats.includes(s)) && searchMatches(x.name, query));
}

/* A meal's stat line for the Food menu: its `adds` ([{stat, text, value}], mealMenu) in the meal's own order, each with
   hit: the stat is on a picked pill (`stats`), drawn as a tinted chip, and cls its chip's classes. No pill picked: no
   hit. */
export function mealLine(adds: readonly MealAdd[], stats: readonly StatKey[]) {
  return adds.map(a => {
    const hit = stats.includes(a.stat);
    return { ...a, hit, cls: hit ? 'meal-stat hit' : 'meal-stat' };
  });
}

/* The Food menu's list in the order `by` asks: 'ilvl' keeps the items as given (newest first); a stat key sorts by the
   points the meal adds of it on this gear (`adds` value, after the meal's percent and cap), highest first, then by the
   other picked stat (`stats`), then newest first. A stat that is not picked sorts as 'ilvl' (its pill was turned off).
   Returns a new array. */
export function sortMeals<Item extends Pick<MealItem, 'adds'>>(
  items: readonly Item[],
  by: StatKey | 'ilvl',
  stats: readonly StatKey[],
): Item[] {
  if (by === 'ilvl' || !stats.includes(by)) {
    return [...items];
  }
  const points = (x: Item, stat: StatKey) => x.adds.find(a => a.stat === stat)?.value ?? 0;
  const keys = [by, ...stats.filter(s => s !== by)];
  // Array.prototype.sort is stable: ties keep the newest first
  return [...items].sort((a, b) => keys.reduce((d, s) => d || points(b, s) - points(a, s), 0));
}

/* What the open Food menu shows under its tools, from mealMenu's `menu` and the menu's state {stats (pills picked),
   query (search text), sortBy ('ilvl' or a stat key), bestOnly (the "Best for goal" switch)}: {sorts, groups, empty}.
   - sorts: the Sort row's options while a pill is on, [{key, label}]: "ILVL", then each picked stat in the pills'
     order; [] with no pill (the row is hidden).
   - groups: [{key, label, items}], the meals after the pills and search: by expansion (empty groups dropped), or,
     sorted by a stat, one group {key 'sorted', label null}. The shown meal, when it passes the filters, leads alone in a
     group {key 'pick', label "Your pick"}, switch on or off. Every meal carries line (mealLine) and rowClass (its
     classes: "on" for the shown meal, "best" for a tagged one while the switch is off, which draws the pill).
   - empty: mealEmptyReason for the list. */
export function mealList(menu: MealMenu, { stats, query, sortBy, bestOnly = false }: MealFilters & { sortBy: StatKey | 'ilvl' }) {
  const withLine = (x: MealItem) => ({
    ...x,
    line: mealLine(x.adds, stats),
    rowClass: [x.on ? 'on' : '', x.best && !bestOnly ? 'best' : ''].filter(Boolean).join(' '),
  });
  const all = menu.groups.flatMap(g => g.items);
  const filters = { stats, query, bestOnly };
  const passing = new Set(mealsPassing(all, filters));
  const sorted = sortBy !== 'ilvl' && stats.includes(sortBy);
  // the shown meal, when it passes the filters, is listed apart, first, whether the switch is on or off
  const pick = all.find(x => x.on && passing.has(x)) ?? null;
  const groups: { key: string; label: string | null; items: ListedMeal[] }[] = sorted
    ? [
        {
          key: 'sorted',
          label: null,
          items: sortMeals(
            [...passing].filter(x => x !== pick),
            sortBy,
            stats,
          ).map(withLine),
        },
      ]
    : menu.groups.map(g => ({ key: g.label, label: g.label, items: g.items.filter(x => passing.has(x) && x !== pick).map(withLine) }));
  if (pick) {
    groups.unshift({ key: 'pick', label: 'Your pick', items: [withLine(pick)] });
  }
  const pickedPills = menu.pills.filter(p => stats.includes(p.stat));
  return {
    sorts: pickedPills.length
      ? [{ key: 'ilvl' as const, label: 'ILVL' }, ...pickedPills.map(p => ({ key: p.stat, label: p.short }))]
      : ([] as { key: StatKey | 'ilvl'; label: string }[]),
    groups: groups.filter(g => g.items.length),
    empty: mealEmptyReason(all, filters),
  };
}

/* Whether a stat pill is greyed out: one already picked never is; otherwise when two are picked (a meal has two stats at
   most) or when picking it would leave the list (`items`) empty under the other filters (the switch's included).
   `filters` as for mealsPassing. */
export function mealPillOff(items: readonly MealItem[], stat: StatKey, filters: MealFilters): boolean {
  if (filters.stats.includes(stat)) {
    return false;
  }
  if (filters.stats.length >= 2) {
    return true;
  }
  return mealsPassing(items, { ...filters, stats: [...filters.stats, stat] }).length === 0;
}

/* Why the list (`items`) is empty, or null: {text, action: 'query'}, with Clear search as the way back. Only a search
   can empty it: the pills start empty and a pill is picked only while some meal passes with it (mealPillOff), and
   removing a pill only adds meals (a test walks every state the menu can reach). Null also when nothing would come
   back without the search (no meal at all): there is nothing to offer. */
export function mealEmptyReason(items: readonly MealItem[], filters: MealFilters): { text: string; action: 'query' } | null {
  if (mealsPassing(items, filters).length) {
    return null;
  }
  const query = filters.query.trim();
  if (query && mealsPassing(items, { ...filters, query: '' }).length) {
    return { text: `No meal matches "${query}".`, action: 'query' };
  }
  return null;
}
