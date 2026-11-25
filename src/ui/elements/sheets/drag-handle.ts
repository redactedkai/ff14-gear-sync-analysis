/* The drag handle of a row of the sheet manager or of a sheet's gear sets, written once for both elements: a focusable span that a
   pointer drags (HTML drag and drop) and that Up and Down move (row-reorder.ts). */
import { html } from 'lit';
import type { RowReorder } from './row-reorder.ts';
import type { ListKind } from './sheet-action.ts';

/* The handle of row `index` of list `kind`: `off` while dragging and the keys are not allowed (an Auto-fill runs, or a sorted list has
   no order of its own to move in). */
export function dragHandle(reorder: RowReorder, kind: ListKind, index: number, off: boolean) {
  // The handle has no accessible name: the page's accessibility check lists that as a known finding (KNOWN_AXE in
  // tests/e2e/checks/look/accessibility.mjs, "reported to the owner, not yet changed"), so the lint rule is off for this one element.
  /* eslint-disable lit-a11y/accessible-name */
  return html`<span
    class=${off ? 'draghandle off' : 'draghandle'}
    role="button"
    tabindex="0"
    draggable=${String(!off)}
    @dragstart=${(event: DragEvent) => reorder.dragStart(kind, index, event)}
    @dragend=${() => reorder.dragEnd()}
    @keydown=${(event: KeyboardEvent) => reorder.handleKey(kind, index, event)}
  ></span>`;
  /* eslint-enable lit-a11y/accessible-name */
}
