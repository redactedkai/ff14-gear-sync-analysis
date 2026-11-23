/* The modal dialogs (the Sheets dialogs and the leave question) are native <dialog> elements, drawn by an x-if only while
   one is open. `x-modal="<close expression>"` on the <dialog> does what is the same for both:
   - opens it as a modal (showModal(): the page behind is inert, the box is in the top layer) once it is drawn, and closes it
     (close()) when the page removes it, so a removed dialog never leaves the page inert;
   - keeps Tab and Shift+Tab inside (the last control to the first and back; the browser would otherwise move the focus to
     its own controls);
   - runs the expression when a press and a release both land on the backdrop (a click on it has the dialog itself as its
     target, as a click on the dialog's own padding has, so the position tells them apart), and when the browser closed the
     dialog by itself (an Escape it was not allowed to hand to the page).
   Escape is the dialog's cancel event: each dialog handles it in its own `@cancel.prevent`. */

// what Tab can reach, before the hidden and disabled are left out
const TAB_STOPS = 'button, input, select, textarea, summary, a[href], [tabindex]';

/* The controls of `dialog` that Tab reaches now, in order: shown, not disabled, not hidden, not left out of the Tab order. */
export function tabStops(dialog) {
  return [...dialog.querySelectorAll(TAB_STOPS)].filter(
    el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

/* A Tab keydown in `dialog`: from the last control it goes to the first, with Shift from the first to the last (the stops are
   read now: the form changes as it is used). */
export function wrapTab(event, dialog) {
  if (event.key !== 'Tab') return;
  const stops = tabStops(dialog);
  const at = stops.indexOf(globalThis.document.activeElement);
  if (!stops.length) event.preventDefault();
  else if (event.shiftKey ? at <= 0 : at === stops.length - 1) {
    event.preventDefault();
    stops[event.shiftKey ? stops.length - 1 : 0].focus();
  }
}

/* Whether a mouse event was on the dialog's backdrop: its target is `dialog` and the point lies outside the dialog's box. */
export function onBackdrop(event, dialog) {
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

/* The directive (main.js: Alpine.directive('modal', modalDirective)). */
export function modalDirective(dialog, { expression }, { evaluateLater, cleanup }) {
  const close = evaluateLater(expression);
  let pressedOnBackdrop = false; // a press inside the box released outside it (selecting text) is not a click on the backdrop
  dialog.addEventListener('mousedown', event => {
    pressedOnBackdrop = onBackdrop(event, dialog);
  });
  dialog.addEventListener('click', event => {
    if (pressedOnBackdrop && onBackdrop(event, dialog)) close();
    pressedOnBackdrop = false;
  });
  dialog.addEventListener('keydown', event => wrapTab(event, dialog));
  // the browser closed it itself: a removed (closed by us) dialog is not in the page by the time this event comes
  dialog.addEventListener('close', () => {
    if (dialog.isConnected) close();
  });
  if (!dialog.open) dialog.showModal();
  cleanup(() => {
    if (dialog.open) dialog.close();
  });
}
