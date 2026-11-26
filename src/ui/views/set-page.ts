/* What a set page draws, built from the saved set, its manual draft and the Auto-fill result waiting: the view of the whole page
   (the stat block, the table, the totals, the Auto-fill and Apply buttons), the Auto-fill button, the chip for an empty pool and the
   goal line. Pure builders: no DOM, no store; the page's element (elements/set-page/set-page.ts) calls them once per change. */
import { makeJobContext } from '../../core/job-context.ts';
import { fillPlan } from '../sheets/fill.ts';
import { fillSettingsOf, goalText } from '../sheets/fill-settings.ts';
import { holdsPiece } from '../sheets/saved-set.ts';
import { deepFreeze, viewCache } from '../view-cache.ts';
import { draftView, samePieces } from './set-draft.ts';
import { mealBestKeys } from './meal-menu.ts';
import { setMealMenuView } from './set-meal-menu.ts';
import { setRowsView } from './set-rows.ts';
import { suggestionView } from './set-suggestion.ts';
import { bonusNote, evaluateInSheet, figureColumns, setFigures, setTotalsView } from './set-totals.ts';
import type { PageSuggestion } from '../elements/set-page/session-types.ts';
import type { SavedGearSet, SavedSheet } from '../sheets/saved-types.ts';
import type { HeaderRow } from './set-draft.ts';

/* The line shown after a click on the table while an Auto-fill result waits. */
export const LOCKED_TABLE_TEXT = 'Pieces and stones can be changed after Apply or Discard.';

/* The note shown after an Auto-fill is cancelled while it runs (Cancel, or Leave on the leave question). */
export const FILL_CANCELLED_TEXT = 'Auto-fill cancelled.';

/* The note shown after an Auto-fill result is discarded (the Discard button, Escape, or Leave on the leave question). */
export const RESULT_DISCARDED_TEXT = 'Discarded: Auto-fill result.';

/* The Auto-fill button's title while Gear to search leaves no piece in the pool; also the chip's tooltip and spoken text. */
export const NO_PIECES_TEXT = 'No piece matches Gear to search.';

/* The chip beside the gear button while Gear to search leaves no piece in the pool. */
export const NO_PIECES_SHORT = 'No pieces to search';

/* A number per object, for a cache key that names a draft or a suggestion without serializing it (0 for none). Both are
   replaced on every change, never changed in place (the edits in sheets/set-edits.ts and setTake return new objects),
   so the same object always holds the same set. */
const objectNumbers = new WeakMap<object, number>();
let nextObjectNumber = 1;
function objectNumber(value: object | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (!objectNumbers.has(value)) {
    objectNumbers.set(value, nextObjectNumber++);
  }
  return objectNumbers.get(value) as number;
}

/* The set page view's cache key: the sheet store's change counter, the saved set's id, the draft and the suggestion.
   The view is read by about 70 bindings of the page on each change, so the key is made without serializing. */
function viewKey(rev: number, saved: Pick<SavedGearSet, 'id'>, draft: object | null, suggestion: object | null): string {
  return `${rev}|${saved.id}|${objectNumber(draft)}|${objectNumber(suggestion)}`;
}

/* What the page draws for `sheet`, its gear set `saved`, the manual `draft` and the Auto-fill `suggestion` (the last two null for
   none): {view, mealSource}. `view` is {mode ('rest', 'draft', 'suggestion'), rows (setRowsView of the set shown), totals
   (setTotalsView), head: the stat block {names, columns, rows} ([] rows while a set at rest holds no piece), plan (fillPlan of the
   saved set: {label, disabled, count}), goalLine ("MND › CRT", '' while the set has no goal), apply {text, disabled} in a draft or a
   suggestion (null at rest), leaveText, draft ({count} in a draft), suggest ({total, taken, appliedNote, emptyNote} with a
   suggestion), bonusNote}. `mealSource` is what the Food menu is built from (setMealMenuView): {context, shown, bestKeys}. */
export function buildSetPageView(
  sheet: SavedSheet,
  saved: SavedGearSet,
  draft: Readonly<SavedGearSet> | null,
  suggestion: PageSuggestion | null,
) {
  const job = makeJobContext(sheet.job);
  const plan = fillPlan(job, saved);
  // the goal Auto-fill would use: the set's own Auto-fill settings, or the defaults while it has none (the goal line and the
  // rank badges show from the start)
  const goal = fillSettingsOf(job, saved).goal;

  // 1. the set shown and how it differs from the saved one
  let mode: 'rest' | 'draft' | 'suggestion' = 'rest';
  let shown: SavedGearSet = saved;
  // the meals tagged "best for goal": the saved list; a draft that changes only the meal or the pins keeps it, one that
  // changes a piece or a stone does not (nor does a suggestion)
  let bestKeys = mealBestKeys(saved);
  let options: Parameters<typeof setRowsView>[2] = { goal, bestKeys };
  let headRows: HeaderRow[] | undefined;
  let apply: { text: string; disabled: boolean } | null = null;
  let leaveText = '';
  let suggest: ReturnType<typeof suggestionView> | null = null;
  let draftView_: ReturnType<typeof draftView> | null = null;
  if (suggestion) {
    mode = 'suggestion';
    suggest = suggestionView(sheet, saved, suggestion.suggested, suggestion.declined);
    shown = suggest.shown;
    bestKeys = [];
    options = {
      goal,
      changedRows: suggest.changedRows,
      mealChanged: suggest.mealChanged,
      takes: suggest.takes,
      mealTake: suggest.mealTake,
    };
    headRows = suggest.header;
    apply = { text: suggest.applyText, disabled: suggest.applyDisabled };
    leaveText = suggest.leaveText;
  } else if (draft) {
    mode = 'draft';
    draftView_ = draftView(sheet, saved, draft);
    shown = draft;
    if (!samePieces(saved, draft)) {
      bestKeys = [];
    }
    options = { goal, bestKeys, changedRows: draftView_.changedRows, mealChanged: draftView_.mealChanged };
    headRows = draftView_.header;
    apply = { text: draftView_.applyText, disabled: draftView_.applyDisabled };
    leaveText = draftView_.leaveText;
  }

  // 2. the table and the stat block of the set shown
  const context = evaluateInSheet(sheet, shown);
  const rows = setRowsView(context, shown, options);
  const totals = setTotalsView(context);
  const figures = setFigures(context);
  if (!headRows) {
    headRows = holdsPiece(job, shown) ? [{ label: 'Total', after: false, figures: figures.map(f => ({ ...f, change: null })) }] : [];
  }
  const view = {
    mode,
    rows,
    totals,
    head: { names: figures.map(f => ({ key: f.key, label: f.label })), columns: figureColumns(figures), rows: headRows },
    plan: { label: plan.label, disabled: plan.disabled, count: plan.count },
    goalLine: goal ? goalText(job, goal) : '',
    apply,
    leaveText,
    draft: draftView_ && { count: draftView_.changes.count },
    suggest: suggest && { total: suggest.total, taken: suggest.taken, appliedNote: suggest.appliedNote, emptyNote: suggest.emptyNote },
    // what the totals count when the sheet sets a clan or a party bonus; else that they leave the clan out
    bonusNote: bonusNote(sheet),
  };
  return { view, mealSource: { context, shown, bestKeys } };
}

/* What buildSetPageView returns: the page's view, and what the Food menu is built from. */
export type SetPageView = ReturnType<typeof buildSetPageView>['view'];
type MealSource = ReturnType<typeof buildSetPageView>['mealSource'];

/* The views of one set page, each kept until its inputs change (the page reads them at every draw; the Food menu only while it is
   open). Returns {view(rev, sheet, saved, draft, suggestion): the page's frozen view, mealMenu(): the Food menu of the set the last
   view shows (setMealMenuView), built when read and kept until the view changes}. Built once per change of the sheets' revision
   `rev`, the saved set, the draft or the suggestion. */
export function setPageViews() {
  const pageCache = viewCache<SetPageView>();
  const mealCache = viewCache<ReturnType<typeof setMealMenuView>, SetPageView | null>();
  let mealSource: MealSource | null = null;
  let viewNow: SetPageView | null = null;
  return {
    view(
      rev: number,
      sheet: SavedSheet,
      saved: SavedGearSet,
      draft: Readonly<SavedGearSet> | null,
      suggestion: PageSuggestion | null,
    ): SetPageView {
      viewNow = pageCache.get(viewKey(rev, saved, draft, suggestion), () => {
        const built = buildSetPageView(sheet, saved, draft, suggestion);
        mealSource = built.mealSource;
        return deepFreeze(built.view);
      });
      return viewNow;
    },
    mealMenu() {
      return mealCache.get(viewNow, () =>
        deepFreeze(
          setMealMenuView((mealSource as MealSource).context, (mealSource as MealSource).shown, (mealSource as MealSource).bestKeys),
        ),
      );
    },
  };
}

/* The Auto-fill button: {text, disabled, title}. `view` is the page's view, `inputs`: {draft (a manual draft is open), busy (an
   Auto-fill runs anywhere on the Sheets tab), searchedCount (how many pieces Gear to search leaves, null until counted)}. Off in a
   draft, while an Auto-fill runs, with every slot pinned, and when Gear to search leaves no piece in the pool (the title then says so;
   null otherwise). */
export function fillButtonView(
  view: Pick<SetPageView, 'plan'>,
  { draft, busy, searchedCount }: { draft: unknown; busy: boolean; searchedCount: number | null },
) {
  const noPieces = searchedCount === 0;
  return {
    text: view.plan.label,
    disabled: view.plan.disabled || Boolean(draft) || busy || noPieces,
    title: noPieces ? NO_PIECES_TEXT : null,
  };
}

/* The chip beside the gear button, {short, full}: its few words and its sentence (tooltip, spoken text); null while the pool holds a
   piece or its count has not landed. The same condition as the Auto-fill button's title. */
export function noPiecesFlag(searchedCount: number | null): { short: string; full: string } | null {
  return searchedCount === 0 ? { short: NO_PIECES_SHORT, full: NO_PIECES_TEXT } : null;
}
