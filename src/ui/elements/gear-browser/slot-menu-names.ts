/* The words and keys of the Gear browser's Slot menu that the element, the page's view, the state and the tests all use: each
   is written here once. A `.ts` module with no import, so the element, the view and Node tests can all read it. */

/* The key of the choice that means "no slot filter" (the state's `browse.type`). */
export const ANY_SLOT_KEY = 'any';
/* The words of that choice, and of the button before the page has given the list. */
export const ANY_SLOT_LABEL = 'Any slot';
/* The name of the menu: its `aria-label`, and the start of the button's (`Slot: Ring`). */
export const SLOT_MENU_NAME = 'Slot';

/* The `slot-change` event: `detail` is the key of the slot picked ('any', 'weapon', 'ring', ...). */
export const SLOT_CHANGE_EVENT = 'slot-change';

/* The accessible name of the Slot button for the chosen slot's words: "Slot: Ring". */
export function slotButtonName(label: string): string {
  return `${SLOT_MENU_NAME}: ${label}`;
}
