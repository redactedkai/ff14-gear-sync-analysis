/* Helper for stories: an event handler that appends the event's `detail` to the story's `<output data-testid=name>` as a
   JSON array, so a test reads `toHaveText('[1,2]')` instead of reaching into the page. */

/* Returns a listener that records `event.detail` into the output with data-testid `testId`. */
export function recordEvents(testId: string) {
  const seen: unknown[] = [];
  return (event: { detail: unknown }) => {
    seen.push(event.detail);
    const output = document.querySelector(`[data-testid="${testId}"]`);
    if (output) {
      output.textContent = JSON.stringify(seen);
    }
  };
}
