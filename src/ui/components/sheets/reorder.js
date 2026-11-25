/* Reordering the rows of the sheet manager and of a sheet's gear sets: drag by the handle, or Up and Down arrow on a focused
   handle (the handle keeps the focus).
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets and afterDraw (frame.js),
   dialog (dialog.js), activeSort (view.js). */

/* Returns the part's members. */
export function reorderPart() {
  return {
    // the row being dragged: {kind: 'sheet' | 'set', from}, and where it would drop: {index, after}
    dragging: null,
    dropAt: null,

    dragStart(kind, index, event) {
      if (this.sheets.busy || this.dialog) {
        return event.preventDefault();
      }
      this.dragging = { kind, from: index };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      const row = event.target.closest('tr');
      if (row) {
        event.dataTransfer.setDragImage(row, 16, 16);
      }
    },
    /* Over a row of the same list: mark the drop above or below it (by the pointer's half of the row). */
    dragOver(kind, index, event) {
      if (this.dragging?.kind !== kind) {
        return;
      }
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      if (this.dropAt?.index !== index || this.dropAt?.after !== after) {
        this.dropAt = { index, after };
      }
    },
    drop(kind, index, event) {
      if (this.dragging?.kind !== kind) {
        return;
      }
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const from = this.dragging.from;
      let to = index + (event.clientY > box.top + box.height / 2 ? 1 : 0);
      if (from < to) {
        to--; // the dragged row leaves its place first
      }
      if (kind === 'sheet') {
        this.sheets.moveSheet(from, to);
      } else {
        this.sheets.moveSet(from, to);
      }
      this.dragEnd();
    },
    dragEnd() {
      this.dragging = null;
      this.dropAt = null;
    },
    /* The drop mark on row `index` of list `kind`: 'before', 'after' or ''. */
    dropMark(kind, index) {
      if (this.dragging?.kind !== kind || this.dropAt?.index !== index) {
        return '';
      }
      return this.dropAt.after ? 'after' : 'before';
    },
    /* Up or Down arrow on a row's handle: the row moves one place, the handle keeps the focus, and the live region says
       where it went. */
    handleKey(kind, index, event) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }
      event.preventDefault();
      if (this.dialog || (kind === 'set' && this.activeSort.key)) {
        return; // a sorted list has no order to move in
      }
      const step = event.key === 'ArrowUp' ? -1 : 1;
      const to = kind === 'sheet' ? this.sheets.stepSheet(index, step) : this.sheets.stepSet(index, step);
      const list = event.target.closest('tbody');
      this.afterDraw(() => list?.querySelectorAll('.draghandle')[to]?.focus());
    },
  };
}
