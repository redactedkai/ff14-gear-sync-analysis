# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](validation.md). How the parts fit together is in [architecture.md](architecture.md).

## 1. Test layers

| Layer | Runs on | Checks | Count |
| --- | --- | --- | --- |
| Unit tests (Node) | The core logic and the saved-state repair, imported directly; the real generated game data | Formulas, sync, speed, item queries, optimizer correctness, data format, provenance, saved state | 67 tests in 11 files |
| Generator tests (Python) | The two data generators, run on small test CSV files | Row selection, slot detection, stat placement, the HQ rule, job mask, sort order, budget table and level data | 17 tests |
| Smoke test (browser) | The built page, opened from disk in headless Chromium | Known numbers on screen, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, no sideways scroll at 400 px | one script, about 10 groups of checks |

The unit tests need no browser because the core never touches the page (see [architecture.md, section 1](architecture.md#1-the-system-at-a-glance)). They load the full item database, so they check the model against all 17,579 real pieces, not just hand-made examples.

## 2. What each file covers

### Unit tests

| File | Covers |
| --- | --- |
| formulas | Substat and main-stat caps at item level 123 for each slot type (head 29 / 30, body 47 / 48, accessory 23 / 24, two-handed weapon 48 / 50); the item level 130 healer hood rebuilt from the formula; Paladin's one-handed weapon plus shield |
| sync | The clamp rule at its edges: an item exactly at the cap and below it is untouched; one item level above clamps every stat; a missing item level counts as above the cap; a job without a special substat; missing stats count as 0; Paladin weapon and shield caps at item level 475 against the Wiki |
| speed | GCD tier thresholds at level 50 (150, 202, 307, 349); AkhMorning's level-100 examples |
| validation | The formula reproduces the Wiki's item level 475 sync caps; accuracy against every real piece per item level band (at least 95% exact and 96% within ±1 in each band); the highest real item level lies inside the budget table |
| items | Gear filtering per job: weapon mode (Paladin sees one-handed weapons and shields only, Warrior two-handed only), job mask (a Warrior never sees healer gear), main-stat filter, item level and equip level bounds, name search, slot filter; converting a database row to the job's stats; copies (a Unique ring once, any other ring twice) |
| optimizer | Known results on real gear: the Sage Dreadwyrm "of Healing" set gives 171 Spell Speed synced to 123 and 176 unsynced; generic item level 475 gear synced to 123 gives 296 Spell Speed and a 2.22 s GCD at level 50 |
| optimizer-constraints | The Warrior Dreadwyrm pool (14 items, 8 combinations) against an independent brute force: no constraint, minimums, maximums, infeasible cases, average item level (met at 130, infeasible at 131), node limit truncation, empty pool |
| optimizer-exhaustive | The optimizer against a reference that tries every legal loadout, on 400 seeded random pools and 200 pools with very large tiebreak values; regressions for the ring pruning bug (F1) and the score weight limit (F3); a pool too large to rank exactly raises an error |
| data-format | The page's job order, stat order and slot table equal the shared format definition; the budget table has one equal-length column per stat; every database row has the documented shape |
| provenance | The generated data names the datamining repository, a full commit id and a date; both generated files carry the same commit; the footer text is short, and empty when the source is unknown |
| state | Restoring saved state: missing or non-object input, a full valid save round-trips unchanged, unknown job, wrong types and out-of-range values per field, old tab names, unusable pool items dropped and usable ones repaired, restored item ids reserved, a save from another role |

### Generator tests

One Python file with two groups, run on the CSV files in the test fixtures folder.

- The fixture files use the real sheet headers. The slot category and job category rows are copied from the real sheets; the item rows are made-up test items.
- The item level fixture is synthetic: the value at row $r$, column position $c$ is $1000\,r + c$, so reading the wrong column gives a visibly wrong number. The level data is written by the test with a different value per column.
- Item database: row shape, slot detection (two-handed vs one-handed and every slot), excluded slots (belt, soul crystal), stat placement, the HQ bonus only when the item can be HQ, the item level floor of 100, excluded jobs (base class only, crafter only), job mask bits, the Unique flag, equip level, items with no stats or no name, sort order.
- Item level data: the 12 stat columns, levels 1 to 100, and the errors for a missing level and for item level ids with a gap.

Details of the rules being tested are in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).

### Smoke test

The smoke test opens the built page from a `file://` address in headless Chromium at 1000 × 900 and checks:

- the page title and the default cap of 123;
- **Piece lab**: an item level 130 head piece with Spell Speed, Piety and Direct Hit for Sage shows the real Dreadwyrm Hood of Healing (Mind 33, Vitality 32, Spell Speed 31, Piety 22, Direct Hit 6) and its synced values (Mind 30, Spell Speed 29); the budget chart renders;
- **Real-gear check panel**: every Wiki item level 475 cap row reads "match", and the accuracy table is not empty;
- **Item pool and Optimizer**: searching the browser for the Dreadwyrm item level 130 level 50 pieces finds the 9 "of Healing" pieces, "Add all" adds 9, and the optimizer shows 171 Spell Speed synced and 176 unsynced; the ceiling table renders;
- **Weapon mode**: Paladin's slot filter offers an off-hand, Warrior's does not;
- **Every tab for six jobs** (Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon), at 400 px width: the sync caps per slot at 123, the off-hand row only for Paladin, no "undefined", "NaN" or "null" text anywhere, and no horizontal page scroll.

Any uncaught page error or console error fails the test. Network errors are ignored, since the web fonts cannot load offline. Every wait is on a concrete condition (an element appears, a text matches); there are no fixed sleeps. Screenshots of the optimizer, the pool and the phone layout, plus one per failed step, are written to the smoke test's output folder (gitignored). On success it prints `no errors`.

## 3. Commands

Run from the repository root.

| Command | What it runs |
| --- | --- |
| `npm test` | All unit tests (Node's built-in test runner) |
| `npm run test:py` | Generator tests (Python `unittest`) |
| `npm run smoke` | Browser smoke test; build the page first |
| `npm run lint` | Biome lint (JavaScript, JSON, CSS) and Ruff check (Python) |
| `npm run format` | Rewrite files with Biome and Ruff formatting |
| `npm run format:check` | Report formatting differences without changing files |
| `npm run check` | Lint, format check, build, unit tests, generator tests, smoke test, in that order; stops at the first failure |

`npm run check` is the bar for calling a change done. For UI changes, also open the built page and look at it at desktop width and at about 400 px.

Running a subset:

- one unit test file: `node --test tests/unit/sync.test.js`
- unit tests by name: `node --test --test-name-pattern="Dreadwyrm" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** Node 22 or later and `npm install`. For the Python parts, Python 3.9 or later and `python -m pip install -r requirements-dev.txt` (pinned Playwright and Ruff), then once `python -m playwright install chromium`.

## 4. Conventions

**Expected values come from outside the code under test.** Prefer, in this order: published numbers (the Wiki's item level 475 sync caps, AkhMorning's GCD examples), real items from the game data (the Dreadwyrm sets, the Dreadwyrm Hood of Healing), and independent references written in the test (brute force, exhaustive search). A number copied from the tool's own output only proves the tool still agrees with itself. If a value has no outside source, say so in the test name or a comment.

**Reproduce a reported bug before fixing it.** When the owner reports a bug (often from a screenshot), first write a unit test or smoke check that fails on the current code, then fix, and keep the test as a regression check. The F1 ring and F3 tiebreak regressions in the exhaustive tests fail on the code before those fixes, and 8 of the 14 saved-state tests failed on the old restore code.

**Check the optimizer against exhaustive search.** The optimizer's pruning and bounds are where subtle bugs hide (F1 returned a worse ring pair in 3.7% of real-gear runs while every fixed-value test passed). The reference in the exhaustive tests tries every legal loadout under the same rules and keeps the lexicographically best totals. Random pools are generated from fixed seeds, so a failure names a pool that can be reproduced. Any change to scoring, pruning or the search must keep these tests green; also re-time a large pool ([optimizer.md, section 7](optimizer.md#7-correctness-and-performance)).

**Keep shared logic job-agnostic in tests too.** Tests of shared logic should either loop over several jobs or use the job only as an example of a role (Sage for healers, Warrior for tanks). Do not encode a Sage-only assumption into a test of shared code.

**Assert, don't print.** A check that only prints a value cannot fail. The band accuracy test prints its per-band shares as diagnostics but asserts the thresholds.

## 5. Adding a test

| What changed | Where the test goes |
| --- | --- |
| A formula, sync rule, speed calculation, item query or optimizer behaviour | The matching unit test file, named after the core module. Use `node:test` and strict assertions, and import from the core directly. |
| Saved state shape or restore rules | The state unit tests. Add both a valid round-trip and a damaged value that must be repaired. |
| A generator rule | The generator tests. Add a row to the fixture CSVs if needed, using the real header, and assert on the generated output. |
| Something only visible on the page (a label, a layout, a binding) | A new check function in the smoke test, called from its list of steps. Wait on a concrete condition, never a fixed delay, and record failures with the shared check helper so the run continues. |

Run the whole check afterwards: a new test is only useful if it passes on the fixed code and fails on the broken one, so when possible, also confirm it fails before the fix.

## 6. After a game patch

Refreshing the data can legitimately change some expected values and must not change others. The full table is in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch). In short:

| May move | Must not move |
| --- | --- |
| Row counts and the highest real item level (the page computes it) | The Dreadwyrm tests: item lookups and the 171 / 176 Spell Speed totals |
| Per-band accuracy shares, currently 97.1% to 99.6% exact; the thresholds (95% exact, 96% within ±1) should still hold, and a drop below them means the model needs a look, not a lower threshold | The Wiki item level 475 caps and the item level 123 caps |
| | The generic maximum at cap 123 (296 Spell Speed, 2.22 s GCD), unless budget table rows 123 or 475 change, which needs investigating |
| | Format, row shape, provenance and generator tests: they test the pipeline, not the game data |

## Where this lives

| Concept | File |
| --- | --- |
| Unit tests | `tests/unit/*.test.js` (`formulas`, `sync`, `speed`, `validation`, `items`, `optimizer`, `optimizer-constraints`, `optimizer-exhaustive`, `data-format`, `provenance`, `state`) |
| Accuracy check shared by the page and the tests | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| Smoke test and its screenshots | `tests/e2e/smoke.py`, `tests/e2e/out/` (gitignored) |
| Commands | `package.json` (`test`, `test:py`, `smoke`, `lint`, `format`, `format:check`, `check`) |
| Lint and format configuration | `biome.json`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
