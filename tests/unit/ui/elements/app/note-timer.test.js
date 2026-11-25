/* The note's clock (src/ui/elements/app/note-timer.ts): a note after an action clears itself NOTE_MS after it was last said. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_MS, createNoteTimer } from '../../../../../src/ui/elements/app/note-timer.ts';

test('a note expires NOTE_MS after it was last said, and the same note said again restarts the wait', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let expired = 0;
  const timer = createNoteTimer(() => {
    expired += 1;
  });
  timer.restart(true);
  t.mock.timers.tick(NOTE_MS - 1);
  assert.equal(expired, 0);
  t.mock.timers.tick(1);
  assert.equal(expired, 1);
  // owner, 2026-11-20: a second click that says the same thing 3 s later did not restart the 6 s
  timer.restart(true);
  t.mock.timers.tick(NOTE_MS / 2);
  timer.restart(true);
  t.mock.timers.tick(NOTE_MS - 1);
  assert.equal(expired, 1, 'it stays NOTE_MS after the second time');
  t.mock.timers.tick(1);
  assert.equal(expired, 2);
  // an empty note (cleared by hand) waits for nothing
  timer.restart(true);
  timer.restart(false);
  t.mock.timers.tick(NOTE_MS * 2);
  assert.equal(expired, 2);
});
