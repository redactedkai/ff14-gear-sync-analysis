/* A manual draft of a gear set: what differs between the set as saved and the set as edited (the rows and the meal), the
   header's Now and After figures with their delta lines, the Apply button's text and the notes. Nothing proposed is saved
   until Apply (docs/engineering/sheets.md, "Drafts and suggestions"), so the draft is a second GearSet in memory; these
   builders take both (sheets.md, "Saved data") and return plain view objects. Pure: no store. */
import { allMeals } from '../../core/food.ts';
import { ROMAN } from '../../core/meld.ts';
import { pieceName } from './set-rows.ts';
import { figuresAgainst, evaluateInSheet, setFigures } from './set-totals.ts';
import { plural } from '../text.ts';
import { rowLabel, sameRow, usedRows } from '../sheets/saved-set.ts';
import type { JobContext } from '../../core/types.ts';
import type { SavedGearSet, SavedRow, SavedSheet, SavedStone } from '../sheets/saved-types.ts';
import type { FigureAgainst } from './set-totals.ts';

/* One row of the stat block (draftView, suggestionView): its label, whether it is the After row, whether some figure of it has a
   delta line (`moved`), and its figures. */
export interface HeaderRow {
  label: string;
  after: boolean;
  moved?: boolean;
  figures: readonly FigureAgainst[];
}

/* The part of a gear set a draft compares: its rows and its meal. */
type SetPart = Pick<SavedGearSet, 'pieces' | 'meal'>;

/* A piece's stones with equal ones grouped, "CRT XII ×2, DET XI" ("none" without stones). */
function stonesText(job: JobContext, piece: SavedRow): string {
  const stones = (piece.stones ?? []).filter(Boolean) as SavedStone[];
  if (!stones.length) {
    return 'none';
  }
  const groups: { text: string; count: number }[] = [];
  for (const stone of stones) {
    const text = `${job.short[stone.stat]} ${ROMAN[stone.grade - 1]}`;
    const last = groups.at(-1);
    if (last?.text === text) {
      last.count++;
    } else {
      groups.push({ text, count: 1 });
    }
  }
  return groups.map(group => (group.count > 1 ? `${group.text} ×${group.count}` : group.text)).join(', ');
}

/* "2 slots and meal", "the meal", "3 slots": what changes, from the number of rows and whether the meal. */
export function changeText(slots: number, meal: boolean): string {
  if (!meal) {
    return plural(slots, 'slot');
  }
  return slots ? `${plural(slots, 'slot')} and meal` : 'the meal';
}

/* The name of a saved meal key, "none" for no meal; a key no meal has any more is named by its key. */
function mealName(job: JobContext, key: string | null): string {
  if (key == null) {
    return 'none';
  }
  return allMeals(job).find(meal => meal.key === key)?.name ?? `missing meal ${key}`;
}

/* The differences of the draft from the saved set, for the rows the sheet's job uses. Returns {rows, meal, count,
   countText}:
   - rows: [{index (the saved row's number), label, before, after (piece names, "empty" for none), meldsOnly: the same
     piece with other stones, beforeStones, afterStones ("CRT XII, DET XI")}], in row order;
   - meal: null when the meal is the same, else {before, after} (names, "none" for no meal);
   - count: rows plus the meal when it changed; countText: changeText ("2 slots and meal"; '' for no change). */
export function draftChanges(job: JobContext, saved: SetPart, draft: SetPart) {
  const rows: {
    index: number;
    slot: SavedRow['slot'];
    label: string;
    before: string;
    after: string;
    meldsOnly: boolean;
    beforeStones: string;
    afterStones: string;
  }[] = [];
  for (const { index, row: piece } of usedRows(job, draft)) {
    const before = saved.pieces[index];
    if (sameRow(before, piece)) {
      continue;
    }
    rows.push({
      index,
      slot: piece.slot,
      label: rowLabel(draft, index),
      before: pieceName(job, before) ?? 'empty',
      after: pieceName(job, piece) ?? 'empty',
      meldsOnly: before.gameId != null && before.gameId === piece.gameId,
      beforeStones: stonesText(job, before),
      afterStones: stonesText(job, piece),
    });
  }
  const mealChanged = (saved.meal ?? null) !== (draft.meal ?? null);
  const count = rows.length + (mealChanged ? 1 : 0);
  return {
    rows,
    meal: mealChanged ? { before: mealName(job, saved.meal ?? null), after: mealName(job, draft.meal ?? null) } : null,
    count,
    countText: count ? changeText(rows.length, mealChanged) : '',
  };
}

/* What draftChanges returns. */
export type DraftChanges = ReturnType<typeof draftChanges>;

/* Whether `draft` holds the same pieces and stones as the saved set `saved` (only the meal or the pins differ): the meals
   tagged "best for goal" for the saved set still hold. */
export function samePieces(saved: Pick<SavedGearSet, 'pieces'>, draft: Pick<SavedGearSet, 'pieces'>): boolean {
  return JSON.stringify(saved.pieces) === JSON.stringify(draft.pieces);
}

/* The draft of `draft` against the set as saved, `saved` (both GearSets of `sheet`). Returns:
   - changes: draftChanges; changedRows: the saved row numbers that differ, mealChanged (setRowsView's highlight);
   - header: the Now and After rows of the stat block, [{label, after, moved, figures}] (moved: some After figure has a delta
     line, so the row needs room for it): Now is the saved set ("Now · before your
     changes"), After the draft ("After · 2 changes", "After · no changes") with figures {key, label, text, change}: change
     {text ("+1.7%"), up, good} is the delta line over the After figure (null where the figure is the same; good is the
     colour: green when better, red when worse, the GCD better lower);
   - applyText ("Apply 2 changes", "No changes"), applyDisabled (no change), discardText;
   - leaveText: the question when the page is left with the draft open ("You have 2 unapplied changes."). */
export function draftView(sheet: SavedSheet, saved: SavedGearSet, draft: SavedGearSet) {
  const now = evaluateInSheet(sheet, saved);
  const after = evaluateInSheet(sheet, draft);
  const changes = draftChanges(now.job, saved, draft);
  const nowFigures = setFigures(now);
  const afterFigures = figuresAgainst(nowFigures, setFigures(after));
  return {
    changes,
    changedRows: changes.rows.map(row => row.index),
    mealChanged: Boolean(changes.meal),
    header: [
      { label: 'Now · before your changes', after: false, figures: nowFigures.map(figure => ({ ...figure, change: null })) },
      {
        label: `After · ${changes.count ? plural(changes.count, 'change') : 'no changes'}`,
        after: true,
        moved: afterFigures.some(figure => figure.change),
        figures: afterFigures,
      },
    ],
    applyText: changes.count ? `Apply ${plural(changes.count, 'change')}` : 'No changes',
    applyDisabled: !changes.count,
    discardText: 'Discard',
    leaveText: `You have ${plural(changes.count, 'unapplied change')}.`,
  };
}

/* The plain note after a draft ends, `verb` 'Applied' or 'Discarded', `changes` draftChanges': "Applied: 2 slots and
   meal changed.", "Discarded: 1 slot reverted.", "Discarded: no changes." (Apply is never asked for a draft with no changes: the
   draft closes with no note) */
export function draftNote(verb: 'Applied' | 'Discarded', changes: Pick<DraftChanges, 'count' | 'rows' | 'meal'>): string {
  if (!changes.count) {
    return `${verb}: no changes.`;
  }
  const what = changeText(changes.rows.length, Boolean(changes.meal));
  return verb === 'Applied' ? `Applied: ${what} changed.` : `Discarded: ${what} reverted.`;
}
