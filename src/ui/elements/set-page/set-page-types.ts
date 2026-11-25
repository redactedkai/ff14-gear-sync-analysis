/* The shape of the view a set page draws (views/set-page.js buildSetPageView and the views it joins: set-rows.js, set-totals.js,
   set-draft.js, set-suggestion.js): only what the page's template reads. The builders are plain JavaScript, so the template reads them
   through these names. */

/* One stat cell of a worn row: `atCap` a substat at the most the piece can hold, `beforeCap` the total before the cap. */
export interface StatCell {
  text: string;
  zero?: boolean;
  atCap?: boolean;
  beforeCap?: string | number;
}

/* A Take box of a result: `locked` when it follows another row (the off-hand follows the weapon). */
export interface TakeBox {
  taken: boolean;
  text: string;
  locked?: boolean;
}

/* One stone chip of a worn piece. */
export interface StoneChip {
  index: number;
  text: string;
  over?: boolean;
  empty?: boolean;
  fit?: string;
  removed?: boolean;
  locked?: boolean;
}

/* One used row of the set (an empty slot has only some of the fields). */
export interface RowView {
  index: number;
  label: string;
  pinned: boolean;
  changed: boolean;
  empty: boolean;
  take: TakeBox | null;
  covered?: boolean;
  shieldNote?: string | null;
  coveredTitle?: string | null;
  emptyText?: string;
  name?: string;
  hq?: boolean;
  ilvlText?: string;
  category?: { key: string; label: string } | null;
  from?: string | null;
  chips?: readonly StoneChip[];
  noChipsText?: string;
  cells?: readonly StatCell[];
}

/* The Food row. */
export interface FoodRowView {
  label: string;
  empty: boolean;
  emptyText: string;
  name: string;
  ilvl: number | null;
  pinned: boolean;
  changed: boolean;
  take: TakeBox | null;
  best: { note: string | null };
  cells: readonly ({ text: string; capped: boolean } | null)[];
}

/* One change of a stat in the stat block. */
export interface FigureChange {
  good: boolean;
  up: boolean;
  text: string;
}

/* The stat block: the figure names and rows (a total, or before and after a draft or result). */
export interface HeadView {
  names: readonly { key: string; label: string }[];
  columns: number;
  rows: readonly {
    label: string;
    after: boolean;
    moved?: boolean;
    figures: readonly { key: string; text: string; shown?: string; change: FigureChange | null }[];
  }[];
}

/* The Total, Tier and Defense rows. */
export interface TotalsView {
  total: {
    label: string;
    emptyText: string;
    ilvl: string | number;
    ilvlLabel?: string;
    cells: readonly { stat: string; value: string | number }[];
  };
  tier: { label: string; caption: string; cells: readonly ({ text: string; zero?: boolean } | null)[] };
  defense: {
    label: string;
    phys: { label: string; valueText: string; pctText: string };
    mag: { label: string; valueText: string; pctText: string };
  };
}

/* What the page draws (views/set-page.js buildSetPageView). */
export interface PageView {
  mode: 'rest' | 'draft' | 'suggestion';
  rows: {
    headers: readonly { stat: string; text: string; rank: number | null }[];
    rows: readonly RowView[];
    consumablesLabel: string;
    food: FoodRowView;
    anyAtCap: boolean;
    capKeyText: string;
  };
  totals: TotalsView;
  head: HeadView;
  plan: { label: string; disabled: boolean; count: number };
  goalLine: string;
  apply: { text: string; disabled: boolean } | null;
  leaveText: string;
  suggest: { total: number; taken: number; appliedNote: string; emptyNote: string } | null;
  bonusNote: string;
}
