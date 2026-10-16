# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](../mechanics/validation.md). How the parts fit together is in [architecture.md](architecture.md).

## 1. Test layers

| Layer | Runs on | Count |
| --- | --- | --- |
| Unit tests (Node) | core logic, view builders, saved state, real game data | 232 tests in 26 files |
| Generator tests (Python) | the data generators, on small test files | 75 tests |
| Smoke test (browser) | the built page in headless Chromium | one script, 16 groups of checks |

Notes:

- **Unit tests** import the core logic, the page's view builders and the saved-state repair directly, with the real generated game data. They check formulas, sync, speed, item queries, optimizer correctness on real gear, what each tab shows, data format, provenance and saved state. A shared brute-force helper serves the optimizer tests (section 2.1).
- **Generator tests** run the item level, item database and job icon generators and the gear category rules on small test CSV and icon files. They check row selection, slot detection, multi-slot gear (a cloak kept on its own slot code, an unsupported combination left out), stat placement, the HQ rule, job mask, sort order, budget table and level data, stat factor kind and table, gear categories and source flags, schema drift, and job icon embedding and numbering.
- **Smoke test** opens the built page from disk. It checks known numbers on screen, optimizer totals equal to the core's on real gear, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, and no sideways scroll at 960 px (half of a 1920 screen; there is no phone layout). Its steps run in 16 groups, each on a fresh page (section 2, *Smoke test*).

The unit tests need no browser because the core never touches the page (see [architecture.md, section 1](architecture.md#1-the-system-at-a-glance)), and the page's view builders take plain state objects. They load the full item database, so they check the model against all 17,316 real pieces, not just hand-made examples.

## 2. What each file covers

### Unit tests

| File | Covers |
| --- | --- |
| formulas | a piece built from the formula, level caps |
| sync | the clamp rule at its edges |
| sync-cap-order | rounding order of sync caps |
| caps-real-items | caps at 123 from real pieces, the 296 maximum |
| level-sync | level sync, its triggers, the optimizer under it |
| speed | GCD tiers, DoT scalars, haste, tier lookup |
| same-result | other pieces with the same result (A9): shared spare points, Unique rings, cloaks, the owner's level 50 case |
| tiers | substat tiers |
| food | food bonus, meal choices, best meal |
| validation | Wiki caps, accuracy per band, special lines |
| items | gear filtering, row conversion, item fields |
| multi-slot | cloaks, tank multi-slot gear, White Mage shields |
| stat-factor | per-item stat factors |
| meld | materia melds on real items |
| optimizer | real-gear pools, ring-pair bound |
| optimizer-constraints | speed minimum, maximum and range |
| optimizer-exhaustive | random pools, regressions, policies |
| target-gcd | Target GCD: GCD reached, modes, meals |
| target-gcd-exhaustive | Target GCD against the brute force |
| views | what each tab shows |
| sync-caps-view | the special substat column of Sync limits |
| piece-subs | Piece stats substat ranks |
| data-format | generated data shape |
| provenance | source record and footer |
| state | restoring saved state |
| store | job switch and reset |
| build | the DEV badge outside `main` |

Notes:

- **What each file checks** is in its header comment and test names, and where each expected value comes from is in a comment next to it. They are not repeated here, so they cannot drift apart.
- **Shared helpers** are in `tests/unit/helpers/`: the brute-force reference and real-gear pools (`exhaustive.js`, section 2.1), and seeded random numbers, item lookup by name, store-shaped state, and values typed in from outside sources such as the `BaseParam` slot shares and AkhMorning's level table (`common.js`).
- **The kind of evidence** each test uses (published numbers, game data, a derivation, the brute force) is in [validation.md, section 7](../mechanics/validation.md#7-which-tests-assert-what).

### 2.1 The brute-force reference and the real-gear pools

The optimizer tests share one reference. It tries every legal loadout (one item per slot, two rings, the same ring twice only when it has two copies, a single ring when no pair exists), drops loadouts outside the speed range, and keeps the lexicographically best totals. It does no pruning and no score weighting, so it is independent of the optimizer's search.

It does use the optimizer's own rule for a piece's effective (synced) stats, so it does **not** check the clamp itself. The clamp is covered by the sync tests, the Wiki item level 475 caps, the derived caps at 123 in the caps test, and the same caps in the formula, views and smoke tests.

Two engine policies are copied into the reference rather than derived: a single ring only when no ring pair exists, and a slot never left empty to meet a constraint. They are stated in [optimizer.md, section 2](optimizer.md#2-formal-statement). On their own, the comparisons with the reference would confirm these policies rather than question them. So both are also tested directly on two-item pools, for both the optimizer and the reference (the "policy: ..." tests in the exhaustive test file). Changing either is a deliberate change to the engine, the reference and those tests together.

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

The tests assert equality with the brute force for every substat, not these totals, so they hold if a patch changes the gear in a window. What these comparisons show alongside the probes outside the tests, are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

### Generator tests

Two Python files: `test_generators.py` (the item database, the item level data, the job icons, the gear categories, and schema drift) and `test_food.py` (the food table). They run on the CSV files in the test fixtures folder: real sheet headers, real slot and job category rows, made-up item rows, and a synthetic item level sheet in which reading the wrong column gives a visibly wrong number. The fixtures and the full list of rules tested are in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).

### Smoke test

The smoke test opens the built page from a `file://` address in headless Chromium at 1000 × 900. Its numbers come from `src/core` in Node at test time (`smoke-core.mjs`), so it checks how the page is wired to the core, not the math again.

| Step | Checks |
| --- | --- |
| Defaults | title, no job, level 100, sync off, cap field rules |
| Piece stats | the item level 130 healer head piece |
| Gear to search, optimizer filters | totals and counts equal the core's |
| Materia, Food, Target GCD | on by default or not, totals equal the core's, saved |
| Real-gear check panel | Wiki 475 rows read "match" |
| Gear optimizer | Sage and Warrior totals equal the core's |
| Typing | one optimizer run per typed cap |
| Job switch, level cap, weapon mode | applied at once, clamped, Off-hand only for Paladin |
| Ring copies, expansion filter | ×2 marks, the equip level band |
| Reload, corrupted storage, reset | state kept, repaired, reset after a question |
| Level sync | level 90 values on each tab, at 960 px |
| Same result | a row's menu at 960 px, a pick shown with the result unchanged, cleared by a setting change |
| Every tab for eight jobs | caps at 123, no bad text, no sideways scroll at 960 px |

Any uncaught page error or console error fails the test. Network errors are ignored, since the web fonts cannot load offline. Every wait is on a concrete condition (an element appears, a text matches), except a few fixed waits of 600 ms that let the optimizer's debounce settle (the typing and same-result steps). Screenshots of the optimizer (one per job), the gear browser, the level sync check and the 960 px walk, plus one per failed step, are written to the smoke test's output folder (gitignored). On success it prints `no errors`.

## 3. Commands

Run from the repository root.

| Command | What it runs |
| --- | --- |
| `npm test` | Unit tests |
| `npm run test:data` | Generator tests (Python) |
| `npm run smoke` | Browser smoke test |
| `npm run lint` | Biome, no file changes |
| `npm run lint:py` | Ruff, no file changes |
| `npm run format`, `npm run format:py` | Rewrite files with Biome, or with Ruff |
| `npm run check` | Lint, build, unit tests, smoke test (no Python) |
| `npm run check:all` | `check`, then `lint:py` and `test:data` |
| `npm run perf` | Optimizer timing, 6 jobs' full pools (about 4 min) |
| `npm run perf:full` | Optimizer timing, every job's full pool (about 25 min) |
| `npm run perf:adversarial` | Hostile pools and a forced 700,000-node search (about 15 s) |
| `npm run perf:browser` | Build, then time the page in Chromium at normal speed and 4× and 6× slower (about 10 min) |
| `node scripts/perf/target-gcd-sweep.mjs [workers] [jobs]` | Target GCD on every job's pool and sync setting, with checks (about an hour with 5 workers) |

Notes:

- **`npm test`** runs the unit tests with Node's built-in test runner. **`npm run test:data`** runs the generator tests with Python `unittest`.
- **`npm run smoke`** needs the page built first; it is a Node script (Playwright) that takes its expected values from `src/core` directly (computed in a worker thread, `tests/e2e/smoke-core.mjs`). Its steps run in groups, in parallel, each group on a fresh page with its own saved state (about 12 s; `SMOKE_TRACE=1` prints each step's time, `SMOKE_PAGE` tests another page file).
- **`npm run lint`** lints, then reports formatting differences without changing files; `lint:py` does the same with Ruff.
- **`npm run check`** runs lint (with format check), build, unit tests and the smoke test, in that order, and stops at the first failure. It needs no Python. It is the bar for calling a change done. **`npm run check:all`** adds `lint:py` and `test:data`; run it when touching `scripts/data/` or after `update-data`. For UI changes, also open the built page and look at it at desktop width and at 960 px.

- **The `perf` commands** are performance measurements, not pass/fail tests, and are not part of `npm run check`. They write one JSON row per run to `scripts/perf/out/` (gitignored) and print a summary against the budgets; the results are in [optimizer.md, section 8](optimizer.md#stress-test-2026-10-14). More scripts there are run by hand: `split.mjs` times each step of one run, and `compare.mjs` checks that a faster version gives exactly the results of a saved copy of `src/`. `target-gcd-sweep.mjs` runs Target GCD on every job, every sync setting of the other scripts but cap 795 (it syncs nothing, so it repeats no sync), the page's default gear groups, every goal and tiebreak order, six GCDs from the no-speed one to the fastest the gear reaches, both modes, and food off and "Best for the goal". On every fourth run with food off, it searches the same candidates with the plain search (no speed tables, groups or memo) and compares. For each job and sync setting, it also checks four small pools against the brute force. A difference is counted as a mismatch, and the results are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).
- **The check against ffxiv-gearing** (`scripts/validate/gearing/`) is also run by hand: `fetch.py` clones and builds that tool at a pinned commit, `run.mjs` (Node, Playwright) compares every synced stat with it in a browser (about 6 minutes; `--site live` against its published page) and fails on a difference with no known cause. Results in [validation.md, section 9](../mechanics/validation.md#9-against-another-tool-ffxiv-gearing).
- **The check against xivgear** (`scripts/validate/xivgear/`) is run by hand the same way: `fetch.py` clones xivgear at a pinned commit and installs its dependencies (with install scripts off), `run.py` runs our bundled core inside xivgear's own test runner and compares every synced stat, job and sync setting (about 30 minutes, one process per job and level; their item data is cached in `data/xivgear-cache`, so later runs are offline). Their two known sync faults are corrected on their side before comparing, and the run fails on any other difference with no known cause. Results in [validation.md, section 10](../mechanics/validation.md#10-against-another-tool-xivgear).

Running a subset:

- one unit test file: `node --test tests/unit/sync.test.js`
- unit tests by name: `node --test --test-name-pattern="brute force" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** Node 22 or later, `npm install`, then once `npx playwright install chromium` (for the smoke test and `perf:browser`). For the Python parts (generator tests, Ruff, data pipeline), Python 3.9 or later and `python -m pip install -r requirements-dev.txt`.

## 4. Conventions

**Expected values come from outside the code under test.** Prefer, in this order: published numbers (the Wiki's item level 475 sync caps, AkhMorning's GCD tier tables), real items from the game data (the item level 130 healer head piece, real-gear pools), and independent references written in the test (the brute force; caps derived from the raw `ItemLevel` rows and slot shares rather than by the function under test). Cite the source (a URL for a published number) in a comment next to the value. A number copied from the tool's own output only proves the tool still agrees with itself. If a value has no outside source, say so in the test name or a comment.

**Pick real items by their properties, not their names.** A test asks for what it needs (a head piece at item level 130 with Spell Speed above the cap, a Unique ring, every item a job can equip in a window) and finds it in the database. The test then states its requirement, and does not depend on one gear set.

**Reproduce a reported bug before fixing it.** When the owner reports a bug (often from a screenshot), first write a unit test or smoke check that fails on the current code, then fix, and keep the test as a regression check. The ring pruning and tiebreak weight regressions in the exhaustive tests fail on the code before those fixes ([history.md](../history.md)), and 8 of the original 14 saved-state tests failed on the old restore code.

**Check the optimizer against exhaustive search.** The optimizer's pruning and bounds are where subtle bugs hide: the ring pruning bug returned a worse ring pair on real gear while every fixed-value test passed ([history.md](../history.md#results-of-the-tool)). The shared brute force (section 2.1) tries every legal loadout under the same rules; real-gear, constraint and view tests compare against it rather than pinning totals. Random pools are generated from fixed seeds, so a failure names a pool that can be reproduced. Any change to scoring, pruning or the search must keep these tests green; also re-time a large pool ([optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

**Keep shared logic job-agnostic in tests too.** Tests of shared logic should either loop over several jobs (the real-gear optimizer tests cover every role) or use the job only as an example of a role (Sage for healers, Warrior for tanks). Do not encode a Sage-only assumption into a test of shared code.

**Assert, don't print.** A check that only prints a value cannot fail. The band accuracy test prints its per-band shares as diagnostics but asserts the thresholds.

## 5. Adding a test

| What changed | Where the test goes |
| --- | --- |
| Formula, sync, speed, item query, optimizer | The matching unit test file |
| What a tab shows | The views unit tests |
| Saved state shape or restore rules | The state unit tests |
| A generator rule | The generator tests |
| Something only visible on the page | A new smoke test step |

Notes:

- **Unit test file.** Named after the core module. Use `node:test` and strict assertions, and import from the core directly. For the optimizer, compare with the shared brute force.
- **Views.** Labels, totals, colouring, empty and error states, on a plain state object.
- **State.** Add both a valid round-trip and a damaged value that must be repaired.
- **Generator.** Add a row to the fixture CSVs if needed, using the real header, and assert on the generated output.
- **Smoke test.** For a layout, a binding or an interaction: a new check function, called from the smoke test's list of steps. Wait on a concrete condition, never a fixed delay, and record failures with the shared check helper so the run continues.

Run the whole check afterwards: a new test is only useful if it passes on the fixed code and fails on the broken one, so when possible, also confirm it fails before the fix.

## 6. After a game patch

Refreshing the data can legitimately change some expected values and must not change others. The refresh steps are in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

| Expectation | After a patch |
| --- | --- |
| Row counts, highest real item level | may move |
| Accuracy share per item level band | may move; thresholds hold |
| Real-gear pool totals | may move |
| Values of specific old items | must not move |
| Wiki caps at 475, caps at 123 | must not move |
| Generic maximum at cap 123 | must not move |
| Format, row shape, provenance, generator tests | must not move |

Notes:

- **Row counts and the highest real item level** move when new gear is added. The page computes the highest item level itself.
- **Accuracy shares** are currently 99.7% to 100.0% exact. They can move as new gear arrives, but the thresholds (98.5% exact and within ±1) should still hold. A drop below them means the model needs a look, not a lower threshold.
- **Real-gear pool totals** (optimizer, constraints, views, smoke) follow the data, because the tests compare with the brute force. A pool check can fail if a patch adds gear to a window (more than 200,000 loadouts, or a slot left with a single item); choose a new window rather than loosening the check.
- **Specific old items** do not change: the item level 130 healer head piece (Mind 33, Vitality 32, substats 31 / 22 / 6) in the formula, views and smoke tests, and other item lookups and optimizer totals tied to named old items.
- **The Wiki caps at item level 475** are published numbers; a change means the game changed old `ItemLevel` rows. The same holds for the item level 123 caps.
- **The generic maximum at cap 123** (296 Spell Speed, 2.22 s GCD) depends only on `ItemLevel` rows 123 and 475. Investigate if it moves.
- **Format, row shape, provenance and generator tests** test the pipeline, not the game data.

## Where this lives

| Concept | File |
| --- | --- |
| Unit tests | `tests/unit/<name>.test.js`, one file per name in section 2 |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`, `loadoutCount`) |
| Shared test helpers and typed-in outside values | `tests/unit/helpers/common.js` (`rng`, `itemRow`, `appState`, `SLOT_PERMILLE`, `AKH_LEVEL`) |
| View builders tested without the browser | `src/ui/views/` |
| Accuracy check shared by the page and the tests | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| Smoke test, its steps and its screenshots | `tests/e2e/smoke.mjs` (`main` and its `steps` list, `checkRealGearOptimizer`, `checkPieceLab`), `tests/e2e/out/` (gitignored) |
| Commands | `package.json` (`test`, `test:data`, `smoke`, `lint`, `lint:py`, `format`, `check`, `check:all`) |
| Lint and format configuration | `biome.json`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
