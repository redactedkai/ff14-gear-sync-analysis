/* Findings the page has not fixed yet. A listed finding is printed as `KNOWN FAILURE (...)` and does not fail the run;
   the run fails when a listed finding stops happening, so the list is emptied as the page is fixed (the same mechanism as
   KNOWN_LOW_CONTRAST and KNOWN_MENU_OVERFLOW in tests/e2e/smoke.ts).

   An entry is {rule, screen, view?, setup?, browser?, note} and matches a finding with that rule on that screen, and on
   that view, setup and browser when the entry names them. `note` says what the finding is, for the line. */
export const KNOWN_FAILURES = Object.freeze([]);

/* The key of a finding: its rule, screen, view, setup and browser, with no window or width (a known failure covers every window it appears in). */
function matches(entry, finding) {
  return (
    entry.rule === finding.rule &&
    entry.screen === finding.screen &&
    (entry.view === undefined || entry.view === finding.view) &&
    (entry.setup === undefined || entry.setup === finding.setup) &&
    (entry.browser === undefined || entry.browser === finding.browser)
  );
}

/* Splits `findings` (each {rule, severity, screen, view, setup, browser, ...}) by the known failures `known`.
   Returns:
   - `fresh`: the findings no entry lists;
   - `knownLines`: one `KNOWN FAILURE (rule, screen ...): note` text per entry that matched, with the number of findings;
   - `stale`: the entries that matched nothing (a listed finding stopped happening: the run fails). */
export function applyKnownFailures(findings, known = KNOWN_FAILURES) {
  const counts = known.map(() => 0);
  const fresh = [];
  for (const finding of findings) {
    const at = known.findIndex(entry => matches(entry, finding));
    if (at < 0) {
      fresh.push(finding);
    } else {
      counts[at]++;
    }
  }
  const knownLines = known
    .map((entry, at) => ({ entry, count: counts[at] }))
    .filter(item => item.count > 0)
    .map(
      ({ entry, count }) =>
        `KNOWN FAILURE (${entry.rule}, ${entry.screen}${entry.view ? `/${entry.view}` : ''}): ${entry.note} [${count} finding(s)]`,
    );
  const stale = known.filter((_entry, at) => counts[at] === 0);
  return { fresh, knownLines, stale };
}
