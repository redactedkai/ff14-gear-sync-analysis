/* The notes (src/ui/messages.js): a note after an action clears itself NOTE_MS after it was last said, and the component shows the
   store's note and failed-save message. The component is bound to a real sheet store, as Alpine binds it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_MS, notes } from '../../../src/ui/messages.js';
import { fakeStorage } from '../helpers/sheet-fixtures.js';
import { createStores } from '../helpers/stores.js';

/* The component with a store and the watchers it asked Alpine for. */
function bind() {
  const { store, sheets } = createStores(undefined, { storage: fakeStorage() });
  const watchers = {};
  const c = Object.assign(notes(), {
    $store: { sheets },
    $watch: (path, fn) => {
      watchers[path] = fn;
    },
  });
  c.init();
  return { c, store, sheets, watchers };
}

test('a note after an action clears itself, and the same note said again stays NOTE_MS from the second time', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { c, sheets, watchers } = bind();
  const say = noteText => {
    sheets.setNote(noteText);
    watchers['$store.sheets.noteSeq']();
  };
  const text = 'Deleted “X”.';
  say(text);
  assert.equal(c.text, text);
  t.mock.timers.tick(NOTE_MS - 1);
  assert.equal(sheets.note, text);
  t.mock.timers.tick(1);
  assert.equal(c.text, '');
  // owner, 2026-11-20: a second click that says the same thing 3 s later did not restart the 6 s
  say(text);
  t.mock.timers.tick(NOTE_MS / 2);
  say(text);
  t.mock.timers.tick(NOTE_MS - 1);
  assert.equal(sheets.note, text, 'it stays NOTE_MS after the second time');
  t.mock.timers.tick(1);
  assert.equal(sheets.note, '');
});

test("a failed save's message is shown as the store holds it, and is not timed", t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { c, store } = bind();
  assert.equal(c.saveMessage, '');
  // what a failed save leaves in the state (sheets-actions.ts noteSaveIn)
  store.update('sheets/commitSheet', state => {
    state.sheets.saveMessage = 'Could not save.';
  });
  t.mock.timers.tick(NOTE_MS * 3);
  assert.equal(c.saveMessage, 'Could not save.');
});
