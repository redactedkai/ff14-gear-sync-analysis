/* The clock of the note after an action (the note the `<gsa-notes>` element shows): a note clears itself NOTE_MS after it was
   last said. Kept apart from the element so that Node tests can drive it with mocked timers. */

/* How long a note after an action stays (ms). A failed save's message is not timed: it stays until a save succeeds. */
export const NOTE_MS = 6000;

/* A timer for one note at a time. `restart(hasNote)` is called each time the page says a note (also an identical one, which
   restarts the wait): with a note it waits NOTE_MS and then calls `expire`; with an empty note it only stops the wait.
   `stop()` drops a wait that is still running (the element left the page). */
export function createNoteTimer(expire: () => void): { restart(hasNote: boolean): void; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  return {
    restart(hasNote) {
      stop();
      if (hasNote) {
        timer = setTimeout(expire, NOTE_MS);
      }
    },
    stop,
  };
}
