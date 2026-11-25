/* The words, the event names and the data shapes of the piece picker (<gsa-piece-picker>), with no DOM and no Lit, so the element, its
   story and the Node tests import one copy. */

/* The events the element sends (the page's template listens with the same names, which it cannot import: a unit test asserts it does):
   - `picker-shown`: the menu is drawn and placed (`detail`: its box, which the page scrolls into the window);
   - `picker-close`: the menu closed, by itself or by its own buttons;
   - `piece-pick`: a piece was picked (`detail`: its gameId) or the slot was emptied (`detail`: null);
   - `picker-query`: the search text changed (`detail`: the text, '' for Clear search). */
export const PICKER_SHOWN_EVENT = 'picker-shown';
export const PICKER_CLOSE_EVENT = 'picker-close';
export const PIECE_PICK_EVENT = 'piece-pick';
export const PICKER_QUERY_EVENT = 'picker-query';

/* The menu's name for a screen reader (the panel has no visible label). */
export const PICKER_MENU_NAME = 'Choose a piece';
/* The search box's name (its placeholder says which slot). */
export const PICKER_SEARCH_LABEL = 'Search pieces';
/* The name of the button that empties the slot. */
export const PICKER_EMPTY_LABEL = 'Empty this slot';

/* One piece of the picker (views/piece-menu.js piecePickerView; its comment names every field): `key` (the gameId), `name`, `hq`,
   `unique` with its note `uniqueText`, `taken` (a Unique ring worn in the other ring row: shown, not pickable), `onClass` ('on' for
   the piece the row holds), the lines `pillClass` and `pillLabel` (the gear category), `line` (the stats) and `levels`. */
export interface PickerPiece {
  key: number;
  name: string;
  hq: boolean;
  unique: boolean;
  uniqueText: string;
  taken: boolean;
  onClass: string;
  pillClass: string;
  pillLabel: string;
  line: string;
  levels: string;
}

/* The picker the page gives (views/piece-menu.js piecePickerView, cut to the rows drawn so far by views/limit-rows.js): `groups` (the
   pieces by expansion), `placeholder` (the search box's, naming the slot), `canEmpty` (the row holds a piece, so "Empty" is offered),
   `emptyText` (why no piece shows, or ''), `footText` ("412 pieces"). */
export interface PiecePicker {
  groups: { label: string; items: PickerPiece[] }[];
  placeholder: string;
  canEmpty: boolean;
  emptyText: string;
  footText: string;
}

/* What a click inside the picker's list picks: the gameId of the piece row `target` is in, or undefined for a click that picks
   nothing (off any row, on a disabled row, such as a Unique ring worn in the other ring row, or on a row with no gameId). */
export function pieceKeyOfClick(target: Element | null): number | undefined {
  const row = target?.closest<HTMLButtonElement>('.same-item');
  if (!row || row.disabled || row.dataset.gameId === undefined) {
    return undefined;
  }
  return Number(row.dataset.gameId);
}
