/* The Gear browser's Slot menu words and the page's wiring of its event (src/ui/elements/gear-browser/slot-menu-names.ts,
   src/partials/gear-page.html). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANY_SLOT_KEY,
  ANY_SLOT_LABEL,
  SLOT_CHANGE_EVENT,
  SLOT_MENU_NAME,
  slotButtonName,
} from '../../../../../src/ui/elements/gear-browser/slot-menu-names.ts';

const GEAR_PAGE = readFileSync(new URL('../../../../../src/partials/gear-page.html', import.meta.url), 'utf-8');

/* The page's template cannot import the event's name, so it writes it out. If the event is renamed, change the template's
   `@<name>=` attribute on the island to match: the Slot menu would otherwise stop changing the browser's slot. */
test('the Gear browser page listens for the Slot menu event under the event name and sets the slot from its detail', () => {
  const listener = GEAR_PAGE.match(new RegExp(`@${SLOT_CHANGE_EVENT}="([^"]*)"`));
  assert.ok(listener, `the page has no @${SLOT_CHANGE_EVENT} listener`);
  assert.match(listener[1], /editBrowse\(\{ type: \$event\.detail \}\)/);
});

test('the Slot button is named after the chosen slot, and the menu has its own name', () => {
  assert.equal(slotButtonName('Ring'), `${SLOT_MENU_NAME}: Ring`);
  assert.equal(slotButtonName(ANY_SLOT_LABEL), `${SLOT_MENU_NAME}: ${ANY_SLOT_LABEL}`);
  assert.equal(ANY_SLOT_KEY, 'any', 'the key the saved state and the address use for "no slot filter"');
});
