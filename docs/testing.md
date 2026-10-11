# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](validation.md). How the parts fit together is in [architecture.md](architecture.md).

## 1. Test layers

| Layer | Runs on | Checks | Count |
| --- | --- | --- | --- |
| Unit tests (Node) | The core logic, the page's view builders and the saved-state repair, imported directly; the real generated game data | Formulas, sync, speed, item queries, optimizer correctness on real gear, what each tab shows, data format, provenance, saved state | 113 tests in 16 files, plus a shared brute-force helper |
| Generator tests (Python) | The two data generators, run on small test CSV files | Row selection, slot detection, multi-slot exclusion, stat placement, the HQ rule, job mask, sort order, budget table and level data | 18 tests |
| Smoke test (browser) | The built page, opened from disk in headless Chromium | Known numbers on screen, optimizer totals equal to the core's on real gear, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, no sideways scroll at 400 px | one script, about 10 groups of checks |

The unit tests need no browser because the core never touches the page (see [architecture.md, section 1](architecture.md#1-the-system-at-a-glance)), and the page's view builders take plain state objects. They load the full item database, so they check the model against all 17,577 real pieces, not just hand-made examples.

## 2. What each file covers

### Unit tests

| File | Covers |
| --- | --- |
| formulas | Substat and main-stat caps at item level 123 for each slot type (head 29 / 30, body 47 / 48, accessory 23 / 24, two-handed weapon 48 / 50); an item level 130 healer head piece with Spell Speed, Piety and Direct Hit built from the formula gives Mind 33, Vitality 32 and substats 31 / 22 / 6, the stats of a real piece; Paladin's one-handed weapon plus shield |
| sync | The clamp rule at its edges, on a real item level 130 healer head piece chosen by its properties (Spell Speed above the head cap at 123, another substat below it): at the cap and below it the piece is untouched; one item level above, every stat becomes the smaller of its own value and the head cap at 123 (Spell Speed 29, main stat 30), and likewise at cap 129; the caps are derived in the test from `ItemLevel` rows 123 and 129 and the 85 ‰ head share, not from `capsFor`; a missing item level counts as above the cap; a job without a special substat; missing stats count as 0; Paladin weapon and shield caps at item level 475 against the Wiki |
| caps-real-items | The sync caps at item level 123 for every slot, without calling `capsFor`. The game has no gear at item level 123, so the test asserts that, then checks every real piece at item level 120 and 125 (chosen by item level, slot and having a main stat and a substat) against round(`ItemLevel` row × `BaseParam` share) for its main stat and largest substat (one documented exception: the item level 120 shields, 13 instead of 14); derives the 123 caps from row 123 and the slot shares typed into the test and checks the page's caps for Sage, Warrior and Paladin against them; and checks that the ten armor and accessory caps sum to 296, a 2.22 s GCD at level 50, which the generic-piece optimizer reaches for Sage and Warrior |
| speed | GCD tier starts, the value one below each, and DoT scalars at levels 50, 90 and 100, read from AkhMorning's published tier tables (for example level 100: 22 → 2.49 s, 107 → 2.48 s, 193 → 2.47 s; level 50: 150 → 2.35 s, 349 → 2.16 s); 2.50 s with no gear speed; `gcdTiers` lists the level 50 tier starts |
| validation | The formula reproduces the Wiki's item level 475 sync caps; accuracy against every real piece per item level band (at least 95% exact and 96% within ±1 in each band); the highest real item level lies inside the budget table |
| items | Gear filtering per job, with items picked by their properties (slot, job bits, stats), never by name: weapon mode (Paladin sees one-handed weapons and shields only, Warrior two-handed only), job mask (a Warrior never sees healer gear), main-stat filter, item level and equip level bounds, name search (case and surrounding spaces ignored), slot filter; converting a database row to the job's stats for a healer and a tank; copies (a Unique ring once, any other ring twice) |
| optimizer | Seven real-gear pools, one or two jobs per role (section 2.1): for every substat as the target, synced to 123 and unsynced, the optimizer's totals for the target, main stat and Vitality equal the brute force. A Unique-ring pool (item level 130 Sage gear whose only ring is Unique): the ring is worn once, the same ring with two copies is worn twice, and sync lowers the best total. Generic item level 475 gear synced to 123 gives 296 Spell Speed and a 2.22 s GCD at level 50 |
| optimizer-constraints | Warrior real gear at item level 130 to 135, equip level 50 or below (32 items, 98,304 loadouts), every answer against the brute force: no constraint (Skill Speed 87); a binding minimum (best Tenacity 341 falls to 317 with Determination at least 121); a binding maximum (Direct Hit at most 152: Tenacity 319); infeasible cases (Tenacity at least 500, Vitality at most 400); average item level (met at 130 with $1570 / 12 = 130.83$, infeasible at 131); node limit truncation; empty pool |
| optimizer-exhaustive | The optimizer against the brute force on 400 seeded random pools and 200 pools with very large tiebreak values; maximum constraints; regressions for the ring pruning bug and the score weight limit (see [history.md](history.md)); a pool too large to rank exactly raises an error; the two engine policies the brute force copies, each stated on a hand-made pool (section 2.1) |
| views | What each tab shows, computed without the browser: the optimizer view on real Black Mage gear (item level 125 to 135) equals the brute force, synced and unsynced; the average item level is coloured against the requirement, not the cap (Unique-ring pool, average 117.0); empty, infeasible and error views; the per-stat ceiling view on real Warrior gear equals the brute force for every stat; a ceiling search that hits its step limit is marked as a lower bound; the sync caps view at 123 (substat total 296, 2.22 s, per-slot caps); the Piece lab on every real item level 130 Sage head piece with three substats (two in the current data: raw values equal the real stats 33 / 32 / 31 / 22 / 6, synced values equal the head caps at 123); the GCD tier text (level 100, 1,839 speed: tier starts at 1,818, next at 1,904, both tier starts in AkhMorning's level 100 table) and the tier lookup against a step-by-step scan at every level; browse and pool counts |
| piece-subs | Piece lab substat ranks: choosing a substat already used in another rank swaps the two, so no substat ever appears twice; ranks 1 and 2 are never left empty |
| data-format | The page's job order, stat order and slot table equal the shared format definition; the budget table has one equal-length column per stat; every database row has the documented shape |
| provenance | The generated data names the datamining repository, a full commit id and a date; both generated files carry the same commit; the footer text is short, and empty when the source is unknown |
| state | Restoring saved state: missing or non-object input, a full valid save round-trips unchanged, unknown job, wrong types and out-of-range values per field, old tab names, unusable pool items dropped and usable ones repaired, hypothetical and hand-entered pieces from the removed Advanced section dropped, restored item ids reserved, a save from another role |
| store | The page's shared store driven without the browser: switching to another job, even within the same role, clears the pool and the job-specific settings and keeps the sync cap; choosing the current job again changes nothing |

### 2.1 The brute-force reference and the real-gear pools

The optimizer tests share one reference. It tries every legal loadout (one item per slot, two rings, the same ring twice only when it has two copies, a single ring when no pair exists), drops loadouts that miss a minimum, maximum or average item level requirement, and keeps the lexicographically best totals. It does no pruning and no score weighting, so it is independent of the optimizer's search. It does use the optimizer's own rule for a piece's effective (synced) stats, so it does **not** check the clamp itself; the clamp is covered by the sync tests, the Wiki item level 475 caps, the derived caps at 123 in the caps test, and the same caps in the formula, views and smoke tests.

Two engine policies are copied into the reference rather than derived, so on their own the comparisons would confirm them rather than question them:

- **A single ring only when no pair exists.** If any legal ring pair exists, a loadout with one ring is not considered, even when every pair breaks a maximum and one ring alone would not.
- **A slot is never left empty to meet a constraint.** Every slot type that has items gets one; a slot is empty only when all its candidates are used up (in practice the second ring slot with a single Unique ring).

Both are stated directly in `optimizer-exhaustive.test.js` (tests named "policy: ...") on two-item pools, for both the optimizer and the reference ([optimizer.md, section 2](optimizer.md#2-formal-statement)). Changing either is a deliberate change to the engine, the reference and those tests together.

A real-gear pool is every database item the job can equip in a small item level window, with equip level 50 or below, small enough to enumerate. The pools in the optimizer tests (speed totals measured on the current data):

| Job (role) | Item levels | Items | Loadouts | Best speed, synced to 123 / unsynced |
| --- | --- | ---: | ---: | --- |
| White Mage (healer) | 130–135 | 24 | 3,072 | 283 / 294 |
| Sage (healer) | 120–130 | 33 | 147,456 | 247 / 255 |
| Warrior (tank) | 130–135 | 32 | 98,304 | 85 / 87 |
| Paladin (tank) | 128–132 | 31 | 65,536 | 85 / 87 |
| Dragoon (melee) | 130–135 | 32 | 98,304 | 195 / 201 |
| Bard (ranged) | 125–135 | 25 | 3,584 | 254 / 262 |
| Black Mage (caster) | 125–135 | 25 | 3,584 | 273 / 288 |

The tests assert equality with the brute force for every substat, not these totals, so they hold if a patch changes the gear in a window. The Unique-ring pool (17 items, all item level 130) gives 235 Spell Speed synced and 243 unsynced with its ring worn once, and 258 / 267 when the same ring may be worn twice; the test checks the second result is the first plus the ring's Spell Speed.

### Generator tests

One Python file with two groups, run on the CSV files in the test fixtures folder.

- The fixture files use the real sheet headers. The slot category and job category rows are copied from the real sheets; the item rows are made-up test items.
- The item level fixture is synthetic: the value at row $r$, column position $c$ is $1000\,r + c$, so reading the wrong column gives a visibly wrong number. The level data is written by the test with a different value per column.
- Item database: row shape, slot detection (two-handed vs one-handed and every slot), excluded slots (belt, soul crystal), multi-slot gear left out (a body piece that also covers the head), stat placement, the HQ bonus only when the item can be HQ, the item level floor of 100, excluded jobs (base class only, crafter only), job mask bits, the Unique flag, equip level, items with no stats or no name, sort order.
- Item level data: the 12 stat columns, levels 1 to 100, and the errors for a missing level and for item level ids with a gap.

Details of the rules being tested are in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).

### Smoke test

The smoke test opens the built page from a `file://` address in headless Chromium at 1000 × 900 and checks:

- the page title and the defaults: the first job in the game's order (Paladin), level 100 and that level's own sync item level 690, with the average item level requirement off;
- **Piece lab**: an item level 130 head piece with Spell Speed, Piety and Direct Hit for Sage shows the stats of a real item level 130 healer head piece (Mind 33, Vitality 32, Spell Speed 31, Piety 22, Direct Hit 6) and its synced values (Mind 30, Spell Speed 29); the budget chart renders;
- **Real-gear check panel**: every Wiki item level 475 cap row reads "match", and the accuracy table is not empty;
- **Item pool and Optimizer**, for a healer and a tank: the browser is set to a real-gear window (Sage, item level 120 to 130; Warrior, 130 to 135; equip level 50 or below), its match count equals the core's (33 and 32 items), "Add all" adds them, and the page's best Spell or Skill Speed, synced to 123 and unsynced, equals the core's result for the same rows (currently Sage 247 / 255, Warrior 85 / 87). The expected values are computed by running the core optimizer and the brute force in Node, after checking that those two agree; the ceiling table renders;
- **Job switch with a pool**: switching from Warrior to Gunbreaker (same role) shows the warning; Cancel keeps the job and the pool, Switch and clear empties it;
- **Copies**: in a rings-only Sage pool (item level 140 to 150, equip level 60) whose best pair is one non-Unique ring worn twice, setting that ring's Copies to 1 lowers the synced Spell Speed total and setting it back to 2 restores it (currently 46 / 23 / 46; expected values from the core optimizer and the brute force in Node);
- **Reload**: a non-default state (Dragoon, cap 130, level 60, sync off, a real-gear pool with one ring's copies cut to 1, optimizer target and tiebreaks, browse filter, Piece lab slot and item level, Optimizer tab open) is saved (the test waits for the debounced save to reach `localStorage`), and after a reload every input, the open tab, the pool row count, the edited copies and the optimizer total are the same;
- **Corrupted storage**: invalid JSON, a JSON array, wrong-typed fields and a pool of broken items in the saved state each load as the defaults (Paladin, cap 690, level 100, empty pool, Item pool tab) with no JavaScript error and no "undefined" / "NaN" / "null" text;
- **Weapon mode**: Paladin's slot filter offers an off-hand, Warrior's does not;
- **Every tab for six jobs** (Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon), at 400 px width: the sync caps per slot at 123, the off-hand row only for Paladin, no "undefined", "NaN" or "null" text anywhere, and no horizontal page scroll.

Any uncaught page error or console error fails the test. Network errors are ignored, since the web fonts cannot load offline. Every wait is on a concrete condition (an element appears, a text matches); there are no fixed sleeps. Screenshots of the optimizer (one per job), the pool and the phone layout, plus one per failed step, are written to the smoke test's output folder (gitignored). On success it prints `no errors`.

## 3. Commands

Run from the repository root.

| Command | What it runs |
| --- | --- |
| `npm test` | All unit tests (Node's built-in test runner), then the generator tests (Python `unittest`) |
| `npm run smoke` | Browser smoke test; build the page first; needs Node on the path for its expected values |
| `npm run lint` | Biome and Ruff: lint, then report formatting differences without changing files |
| `npm run format` | Rewrite files with Biome and Ruff formatting |
| `npm run check` | Lint (with format check), build, unit and generator tests, smoke test, in that order; stops at the first failure |

`npm run check` is the bar for calling a change done. For UI changes, also open the built page and look at it at desktop width and at about 400 px.

Running a subset:

- one unit test file: `node --test tests/unit/sync.test.js`
- unit tests by name: `node --test --test-name-pattern="brute force" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** Node 22 or later and `npm install`. For the Python parts, Python 3.9 or later and `python -m pip install -r requirements-dev.txt` (pinned Playwright and Ruff), then once `python -m playwright install chromium`.

## 4. Conventions

**Expected values come from outside the code under test.** Prefer, in this order: published numbers (the Wiki's item level 475 sync caps, AkhMorning's GCD tier tables), real items from the game data (the item level 130 healer head piece, real-gear pools), and independent references written in the test (the brute force; caps derived from the raw `ItemLevel` rows and slot shares rather than by the function under test). Cite the source (a URL for a published number) in a comment next to the value. A number copied from the tool's own output only proves the tool still agrees with itself. If a value has no outside source, say so in the test name or a comment.

**Pick real items by their properties, not their names.** A test asks for what it needs (a head piece at item level 130 with Spell Speed above the cap, a Unique ring, every item a job can equip in a window) and finds it in the database. The test then states its requirement, and does not depend on one gear set.

**Reproduce a reported bug before fixing it.** When the owner reports a bug (often from a screenshot), first write a unit test or smoke check that fails on the current code, then fix, and keep the test as a regression check. The F1 ring and F3 tiebreak regressions in the exhaustive tests fail on the code before those fixes, and 8 of the original 14 saved-state tests failed on the old restore code.

**Check the optimizer against exhaustive search.** The optimizer's pruning and bounds are where subtle bugs hide (F1 returned a worse ring pair in 3.7% of real-gear runs while every fixed-value test passed). The shared brute force (section 2.1) tries every legal loadout under the same rules; real-gear, constraint and view tests compare against it rather than pinning totals. Random pools are generated from fixed seeds, so a failure names a pool that can be reproduced. Any change to scoring, pruning or the search must keep these tests green; also re-time a large pool ([optimizer.md, section 7](optimizer.md#7-correctness-and-performance)).

**Keep shared logic job-agnostic in tests too.** Tests of shared logic should either loop over several jobs (the real-gear optimizer tests cover every role) or use the job only as an example of a role (Sage for healers, Warrior for tanks). Do not encode a Sage-only assumption into a test of shared code.

**Assert, don't print.** A check that only prints a value cannot fail. The band accuracy test prints its per-band shares as diagnostics but asserts the thresholds.

## 5. Adding a test

| What changed | Where the test goes |
| --- | --- |
| A formula, sync rule, speed calculation, item query or optimizer behaviour | The matching unit test file, named after the core module. Use `node:test` and strict assertions, and import from the core directly. For the optimizer, compare with the shared brute force. |
| What a tab shows (labels, totals, colouring, empty and error states) | The views unit tests, on a plain state object. |
| Saved state shape or restore rules | The state unit tests. Add both a valid round-trip and a damaged value that must be repaired. |
| A generator rule | The generator tests. Add a row to the fixture CSVs if needed, using the real header, and assert on the generated output. |
| Something only visible on the page (a layout, a binding, an interaction) | A new check function in the smoke test, called from its list of steps. Wait on a concrete condition, never a fixed delay, and record failures with the shared check helper so the run continues. |

Run the whole check afterwards: a new test is only useful if it passes on the fixed code and fails on the broken one, so when possible, also confirm it fails before the fix.

## 6. After a game patch

Refreshing the data can legitimately change some expected values and must not change others. The full table is in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch). In short:

| May move | Must not move |
| --- | --- |
| Row counts and the highest real item level (the page computes it) | The item level 130 healer head piece (Mind 33, Vitality 32, substats 31 / 22 / 6) in the formula, views and smoke tests |
| Per-band accuracy shares, currently 97.1% to 99.6% exact; the thresholds (95% exact, 96% within ±1) should still hold, and a drop below them means the model needs a look, not a lower threshold | The Wiki item level 475 caps and the item level 123 caps |
| Real-gear pool totals (optimizer, constraints, views, smoke). The tests compare with the brute force, so they follow the data. A pool check can fail if a patch adds gear to a window (more than 200,000 loadouts, or a slot left with a single item); choose a new window rather than loosening the check | The generic maximum at cap 123 (296 Spell Speed, 2.22 s GCD), unless budget table rows 123 or 475 change, which needs investigating |
| | Format, row shape, provenance and generator tests: they test the pipeline, not the game data |

## Where this lives

| Concept | File |
| --- | --- |
| Unit tests | `tests/unit/*.test.js` (`formulas`, `sync`, `speed`, `validation`, `items`, `optimizer`, `optimizer-constraints`, `optimizer-exhaustive`, `views`, `piece-subs`, `data-format`, `provenance`, `state`) |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`, `loadoutCount`) |
| View builders tested without the browser | `src/ui/views/` |
| Accuracy check shared by the page and the tests | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| Smoke test and its screenshots | `tests/e2e/smoke.py` (`check_real_gear_optimizer`, `check_piece_lab`), `tests/e2e/out/` (gitignored) |
| Commands | `package.json` (`test`, `smoke`, `lint`, `format`, `check`) |
| Lint and format configuration | `biome.json`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
