/* The shape of the view a set page draws: what views/set-page.ts buildSetPageView returns (it joins set-rows.ts, set-totals.ts,
   set-draft.ts and set-suggestion.ts). The template reads these types, so a field the builder renames or drops stops it
   compiling. */
import type { SetPageView } from '../../views/set-page.ts';

/* What the page draws (views/set-page.ts buildSetPageView). */
export type PageView = SetPageView;

/* One used row of the set: a worn piece, or an empty slot (`empty`). */
export type RowView = PageView['rows']['rows'][number];
