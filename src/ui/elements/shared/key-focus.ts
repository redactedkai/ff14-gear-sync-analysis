/* Two small rules that a Zag button-and-list element (the Slot menu, the selects) shares, so each is written once:
   - `trackLastInput`: the element's `data-input` attribute says what the last input of the page was, so that the CSS decides
     whether the button shows its focus ring (Z3);
   - `closeOnTab`: a Tab closes the open list and the focus moves on (Z1), where Zag's machines would hold it in the list. */

/* The attribute on the element that says what the last input of the page was: `key` (a key press anywhere on the page), `press`
   (a mouse or touch press inside the element) or `move` (the pointer moved over the element). The browser decides whether the
   button shows its focus ring from the input before the focus is given back to it by script, and its answer depends on timing
   and on the engine, so the CSS does not leave it to the browser where the element knows: after `press` the ring is hidden
   (a press on a row, which Zag cancels, does not count as one for the browser), after `key` it is always drawn. The lit row's
   ring (for the keys) is hidden while the pointer lights rows (`press`, `move`). */
export const INPUT_ATTRIBUTE = 'data-input';
const INPUT_KEY = 'key';
const INPUT_PRESS = 'press';
const INPUT_MOVE = 'move';

/* What `trackLastInput` needs of its element: a Lit element has all of it. */
export interface InputHost extends HTMLElement {
  addController(controller: { hostConnected?(): void; hostDisconnected?(): void }): void;
}

/* Keeps the `data-input` attribute of `host` current: a key press anywhere on the page sets `key` (a listener on the document
   while the element is connected), a press inside the element `press`, and a move of the pointer over it `move` (unless a press
   is the last input, which says more; a move event that moved nothing, which the browser sends after the layout changed under
   a resting pointer, is not an input). */
export function trackLastInput(host: InputHost): void {
  const onDocumentKeyDown = (): void => host.setAttribute(INPUT_ATTRIBUTE, INPUT_KEY);
  host.addEventListener('pointerdown', () => host.setAttribute(INPUT_ATTRIBUTE, INPUT_PRESS), { capture: true });
  host.addEventListener(
    'pointermove',
    event => {
      const moved = event.movementX !== 0 || event.movementY !== 0;
      if (moved && host.getAttribute(INPUT_ATTRIBUTE) !== INPUT_PRESS) {
        host.setAttribute(INPUT_ATTRIBUTE, INPUT_MOVE);
      }
    },
    { capture: true },
  );
  host.addController({
    hostConnected: () => document.addEventListener('keydown', onDocumentKeyDown, { capture: true }),
    hostDisconnected: () => document.removeEventListener('keydown', onDocumentKeyDown, { capture: true }),
  });
}

/* What `closeOnTab` needs of the element's Zag controller. */
export interface TabClosable {
  readonly api: { readonly open: boolean };
  closeWithoutFocus(): void;
}

/* Makes a Tab close the open list of `host` and lets the focus move on from where it is, as it does out of the page's other menus.
   Zag's menu and select would stop the Tab (they hold the focus in the list), so the key is handled in the capture phase, before
   Zag sees it. Shift+Tab from the list first puts the focus on the button (`triggerSelector`), so that it goes on to the control
   before the button and not just to the button. Nothing happens to a Tab while the list is closed. */
export function closeOnTab(host: HTMLElement, zag: TabClosable, triggerSelector = '[data-zag-part="trigger"]'): void {
  host.addEventListener(
    'keydown',
    event => {
      if (event.key !== 'Tab' || !zag.api.open) {
        return;
      }
      event.stopPropagation();
      if (event.shiftKey) {
        host.querySelector<HTMLElement>(triggerSelector)?.focus({ preventScroll: true });
      }
      zag.closeWithoutFocus();
    },
    { capture: true },
  );
}
