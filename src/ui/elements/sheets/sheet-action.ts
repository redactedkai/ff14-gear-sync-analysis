/* What the Sheets screens' elements (<gsa-sheet-manager>, <gsa-sheet-page>) tell the page: one `sheet-action` event whose `detail` is
   a SheetAction. The element never reads a store; the page's wrapper listens and calls the store (components/sheets/actions.js).
   An action the page answers with a result (a step, a settings edit) has a `result` field the wrapper fills in before the event
   returns; the element reads it right after `dispatchEvent`. */

/* The event's name. */
export const SHEET_ACTION_EVENT = 'sheet-action';

/* The two lists whose rows can be reordered: the manager's sheets and a sheet's gear sets. */
export type ListKind = 'sheet' | 'set';

/* What an edit of the open sheet's settings gives back (the store's {ok, lowered}): `ok` false for a refused edit (an Auto-fill
   runs); `lowered` {from, to, level} when the edit lowered the item level cap. */
export interface EditResult {
  ok?: boolean;
  lowered?: { from: number; to: number; level: number | null } | null;
}

/* Every action, by `action`. `opener` is the button that asked, which a dialog gives the focus back to. */
export type SheetAction =
  | { action: 'new'; kind: ListKind; opener: HTMLElement }
  | { action: 'open'; kind: ListKind; id: string }
  | { action: 'edit'; kind: ListKind; id: string; opener: HTMLElement }
  | { action: 'copy'; kind: ListKind; id: string; opener: HTMLElement }
  | { action: 'delete'; kind: ListKind | 'unreadable'; id: string; opener: HTMLElement }
  | { action: 'move'; kind: ListKind; from: number; to: number }
  | { action: 'step'; kind: ListKind; index: number; step: number; result: number }
  | { action: 'to-manager' }
  | { action: 'leave-missing' }
  | { action: 'figures'; mode: 'effects' | 'points' }
  | { action: 'level'; value: unknown; result: EditResult | null }
  | { action: 'cap'; value: unknown; result: EditResult | null }
  | { action: 'sync'; on: boolean; result: EditResult | null }
  | { action: 'clan'; name: string }
  | { action: 'party'; value: string };

/* Sends `detail` from `host` as a `sheet-action` event and returns it (the page may have filled in its `result`). */
export function sendSheetAction<T extends SheetAction>(host: HTMLElement, detail: T): T {
  host.dispatchEvent(new CustomEvent(SHEET_ACTION_EVENT, { detail, bubbles: true, composed: true }));
  return detail;
}
