/* Reordering the rows of a list of the Sheets screens (the sheet manager's, a sheet's gear sets), as a Lit reactive controller:
   drag a row by its handle and drop it above or below the row under the pointer, or press Up or Down on a focused handle (the
   handle keeps the focus). The controller keeps the drag state (the row dragged and where it would drop), draws nothing and
   changes no data: the element tells it what is locked and takes the moves. */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { ListKind } from './sheet-action.ts';

/* What the controller asks of its element. */
export interface RowReorderOptions {
  /* Whether dragging is off (an Auto-fill runs or a dialog is open). */
  dragLocked(): boolean;
  /* Whether the keyboard cannot move the rows of `kind` (a dialog is open, or the list is sorted: it has no order to move in). */
  stepLocked(kind: ListKind): boolean;
  /* A row dragged from index `from` to index `to` (after the row left its place). */
  move(kind: ListKind, from: number, to: number): void;
  /* A step of one place from `index` (`step` -1 or +1); returns the index the row is at now. */
  step(kind: ListKind, index: number, step: number): number;
  /* Puts the focus on the drag handle of row `index` of list `kind`. */
  focusHandle(kind: ListKind, index: number): void;
}

/* The row being dragged: its list and index. */
interface Dragging {
  kind: ListKind;
  from: number;
}

/* Where the dragged row would drop: beside row `index`, below it when `after`. */
interface DropAt {
  index: number;
  after: boolean;
}

/* The element a controller works for: a Lit element (it draws again on request and says when it has drawn). */
type RowReorderHost = ReactiveControllerHost & HTMLElement;

/* The `row-reorder` controller; one per element, for both of its lists. */
export class RowReorder implements ReactiveController {
  dragging: Dragging | null = null;
  dropAt: DropAt | null = null;
  private readonly host: RowReorderHost;
  private readonly options: RowReorderOptions;

  constructor(host: RowReorderHost, options: RowReorderOptions) {
    this.host = host;
    this.options = options;
    host.addController(this);
  }

  hostDisconnected(): void {
    this.dragging = null;
    this.dropAt = null;
  }

  /* A drag starts on row `index` of list `kind` (the handle's `dragstart`): refused while the list is locked. */
  dragStart(kind: ListKind, index: number, event: DragEvent): void {
    if (this.options.dragLocked()) {
      event.preventDefault();
      return;
    }
    this.dragging = { kind, from: index };
    const transfer = event.dataTransfer;
    if (transfer) {
      transfer.effectAllowed = 'move';
      transfer.setData('text/plain', String(index));
      const row = (event.target as Element).closest('tr');
      if (row) {
        transfer.setDragImage(row, 16, 16);
      }
    }
    this.host.requestUpdate();
  }

  /* Over row `index` of the same list: marks the drop above or below it (by the pointer's half of the row). */
  dragOver(kind: ListKind, index: number, event: DragEvent): void {
    if (this.dragging?.kind !== kind) {
      return;
    }
    event.preventDefault();
    const after = this.isLowerHalf(event);
    if (this.dropAt?.index !== index || this.dropAt?.after !== after) {
      this.dropAt = { index, after };
      this.host.requestUpdate();
    }
  }

  /* A drop on row `index` of the same list: the dragged row moves to the half of the row the pointer is in. */
  drop(kind: ListKind, index: number, event: DragEvent): void {
    if (this.dragging?.kind !== kind) {
      return;
    }
    event.preventDefault();
    const from = this.dragging.from;
    let to = index + (this.isLowerHalf(event) ? 1 : 0);
    if (from < to) {
      to--; // the dragged row leaves its place first
    }
    this.options.move(kind, from, to);
    this.dragEnd();
  }

  /* The drag ended (dropped, or cancelled by Escape or a drop elsewhere). */
  dragEnd(): void {
    this.dragging = null;
    this.dropAt = null;
    this.host.requestUpdate();
  }

  /* The drop mark on row `index` of list `kind`: 'before', 'after' or ''. */
  dropMark(kind: ListKind, index: number): '' | 'before' | 'after' {
    if (this.dragging?.kind !== kind || this.dropAt?.index !== index) {
      return '';
    }
    return this.dropAt.after ? 'after' : 'before';
  }

  /* Whether row `index` of list `kind` is the one being dragged. */
  isDragged(kind: ListKind, index: number): boolean {
    return this.dragging?.kind === kind && this.dragging.from === index;
  }

  /* Up or Down arrow on the handle of row `index`: the row moves one place and the handle keeps the focus. */
  handleKey(kind: ListKind, index: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    if (this.options.stepLocked(kind)) {
      return;
    }
    const to = this.options.step(kind, index, event.key === 'ArrowUp' ? -1 : 1);
    // the page draws the new order a moment later: the focus follows the row once it has
    requestAnimationFrame(() => {
      if (this.host.isConnected) {
        void this.host.updateComplete.then(() => this.options.focusHandle(kind, to));
      }
    });
  }

  /* Whether the pointer of `event` is in the lower half of the row it is over. */
  private isLowerHalf(event: DragEvent): boolean {
    const box = (event.currentTarget as Element).getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  }
}
