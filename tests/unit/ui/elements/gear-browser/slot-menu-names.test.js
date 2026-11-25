/* The Gear browser's Slot menu words (src/ui/elements/gear-browser/slot-menu-names.ts). The element's wiring of the menu's event
   is checked by the smoke steps of the Slot menu (checkSlotMenuPicksAndLayers). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANY_SLOT_KEY,
  ANY_SLOT_LABEL,
  SLOT_MENU_NAME,
  slotButtonName,
} from '../../../../../src/ui/elements/gear-browser/slot-menu-names.ts';

test('the Slot button is named after the chosen slot, and the menu has its own name', () => {
  assert.equal(slotButtonName('Ring'), `${SLOT_MENU_NAME}: Ring`);
  assert.equal(slotButtonName(ANY_SLOT_LABEL), `${SLOT_MENU_NAME}: ${ANY_SLOT_LABEL}`);
  assert.equal(ANY_SLOT_KEY, 'any', 'the key the saved state and the address use for "no slot filter"');
});
