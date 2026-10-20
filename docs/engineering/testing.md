# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](../mechanics/validation.md). How the parts fit together is in [architecture.md](architecture.md).

Related pages: [validation.md](../mechanics/validation.md) (the evidence behind expected values), [optimizer.md](optimizer.md) (the search the exhaustive tests check), [data-pipeline.md](data-pipeline.md) (the generators the Python tests check), [architecture.md](architecture.md), [glossary.md](../glossary.md).

**The testing problem in one paragraph.** The tool computes numbers nobody can check by eye: the stats of a gear piece (an item worn in one body slot) after the game lowers it to a fixed strength, and the best combination of pieces out of thousands. A test is only as good as its **oracle**, the source of its expected value. This suite uses four kinds of oracle, in order of preference:

| Oracle | Example | Where |
| --- | --- | --- |
| Published numbers | the Wiki's sync caps at item level 475 | unit tests (section 2) |
| Real game data | a real item level 130 healer head piece | unit and smoke tests |
| An independent reference | a brute force that tries every loadout | section 2.1 |
| A regression that failed before a fix | the ring pruning bug | section 4 |

A number copied from the tool's own output is not an oracle: it only proves the tool still agrees with itself (section 4). Game terms used below (item level, sync cap, GCD, melds, Unique) are defined in [glossary.md](../glossary.md).

## 1. Test layers

What runs, on what, and how much of it?

| Layer | Runs on | Count |
| --- | --- | --- |
| Unit tests (Node) | core logic, view builders, saved state, real game data | 437 tests in 54 files, about 18 s (2026-10-19) |
| Long sweep (Node) | tier ranking against its reference on 360 random cases (`tests/full/`) | 6 tests in 5 files, about 33 s with the unit tests (2026-10-19) |
| Generator tests (Python) | the data generators, on small test files | 110 tests in 2 files (2026-10-19) |
| Smoke test (browser) | the built page in headless Chromium | one script, 18 groups of steps |

Notes:

- **Unit tests** import the core logic, the page's view builders and the saved-state repair directly, with the real generated game data. They check formulas, sync, speed, item queries, optimizer correctness on real gear, what each tab shows, the components' logic that runs without a page, data format, provenance and saved state. A shared brute-force helper serves the optimizer tests (section 2.1).
- **Generator tests** run the item level, item database and job icon generators and the gear category rules on small test CSV and icon files. They check row selection, slot detection, multi-slot gear (a cloak kept on its own slot code, an unsupported combination left out), stat placement, the HQ rule, job mask, sort order, budget table and level data, stat factor kind and table, gear categories and source flags, schema drift, and job icon embedding and numbering.
- **Smoke test** opens the built page from disk. It checks known numbers on screen, optimizer totals equal to the core's on real gear, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, and no sideways scroll at 960 px (half of a 1920 screen; there is no phone layout). Its steps run in 18 groups, each on a fresh page, from a shared setup it checks between steps (section 2, *Smoke test*).

**Why most tests need no browser.** The core never touches the page (see [architecture.md, section 1](architecture.md#1-the-system-at-a-glance)), and the page's view builders take plain state objects, so both run in plain Node. The unit tests load the full item database, so they check the model against all 20,031 real pieces, not just hand-made examples. The smoke test is left with only what needs a real page: wiring, layout and interaction.

## 2. What each file covers

Which file tests what? One line per file; the file itself says the rest.

### Unit tests

**Naming rule.** A test file is named for the module it tests: the module's path under `src/` (or the repository root, for `scripts/`), folders joined with `-`, no extension, then `.test.js`. A folder counts as a module (`src/core/optimizer/` is `core-optimizer`). A file on one concern of a module adds the concern after a dot. So the test for `src/ui/views/gcd.js` is `ui-views-gcd.test.js`, and the sync clamp of `src/core/formulas.js` is in `core-formulas.sync-clamp.test.js`. A test that crosses modules goes in the file of the module whose rule it checks. Sorted by name, a module's files sit together.

| File | Covers |
| --- | --- |
| core-constants.level-tables | every table keyed by level reaches the level cap |
| core-damage-defense | weapon damage and defense on real items; weapon damage ranked first |
| core-food | food bonus, meal choices, best meal; the character panel base against AkhMorning |
| core-formulas | a piece built from the formula, level caps |
| core-formulas.caps-at-123 | caps at 123 from real pieces, the 296 maximum |
| core-formulas.stat-factor | per-item stat factors |
| core-formulas.sync-cap-order | rounding order of sync caps |
| core-formulas.sync-clamp | the clamp rule at its edges |
| core-item-format | generated data shape; `ROW` against the format's row fields |
| core-items | gear filtering, row conversion, item fields; rows sharing a pool key agree |
| core-items.identity | a piece by its game id: one row per id, the pool item of an id |
| core-items.multi-slot | cloaks, tank multi-slot gear, White Mage shields |
| core-meld | materia melds on real items |
| core-meld.apply-stones | a given list of stones on real items: gates, high grades past the big slots, caps, sync removing them; the optimizer's melds give their gains back |
| core-optimizer | real-gear pools, ring-pair bound |
| core-optimizer-regain | regain cuts from a proven maximum against the brute force |
| core-optimizer-search | the search's parts on their own against brute force: limit tables and their smallest over two or three bands, the Lagrangian bound and reduced-cost fixing, the slot order, the memo's dominance and its full key |
| core-optimizer-slot-index | slot positions and blocked-slot masks |
| core-optimizer.exhaustive | random pools, regressions, policies |
| core-optimizer.speed-limits | speed minimum, maximum and range |
| core-optimizer.stat-minimums | minimums on any stat against the brute force; seeds; the filters, trial search and fronts on tight cases against the plain search; the fronts alone, also on empty, blockable and ringless slots |
| core-recipe | a recipe's solve: the session keys each recipe field belongs to, the set by gameId and its record, a piece picked by gameId, a warm session against a fresh one and what it keeps between solves |
| core-same-result | other pieces with the same result: shared spare points, Unique rings, cloaks, the owner's level 50 case |
| core-set | a set and what it adds up to: 14 real optimizer results recorded from the page before it used `evaluateSet`, number for number; the optimizer's own totals; custom pieces, removed stones, a game id no row has |
| core-session | the solver session: the last four entries per kind, least recently used dropped first; a job's gear built once |
| core-speed | GCD tiers, DoT scalars, the cast and recast multiplier, haste, tier lookup |
| core-sync-target | level sync, its triggers, the optimizer under it |
| core-tables.provenance | source record and footer |
| core-target-gcd | Target GCD: GCD reached, modes, meals |
| core-target-gcd.exhaustive | Target GCD against the brute force |
| core-tier-rank | tier ranking against its own reference (every set and meal, the stage rule written out), with 20 cases of three keys and a Target GCD; a stage stopped at its node limit; an infeasible Target GCD; 360 more random cases in `tests/full/` |
| core-tiers | substat tiers; the Substat tiers sub-tab's ladder and tier sizes |
| core-validation | Wiki caps, accuracy per band, special lines |
| scripts-build | the DEV badge outside `main`, the page template and its partials, the licence notices |
| ui-components-gear | the Gear browser: its view built once per change and only while its tab is open, sorting, Reset filters, the / key |
| ui-components-gcd | How the math works, GCD's controls: the level and speed boxes, the slider, the chart and step clicks |
| ui-components-meal-menu | the Food menu: pills preset once per result, the switch, the list, a pick |
| ui-components-optimizer | the optimizer: Gear to search following the settings, Optimize after the progress bar, out of date after a change, picks by gameId and the meal pick, one session for every solve; no component imports Alpine |
| ui-components-page | the job picker, the cap field's error and lowered note, Reset asking first |
| ui-components-sync-explainer | Piece stats: its views built once per change, the item level box, the substat menus, the chart's width |
| ui-components-tiers | Substat tiers: typed and clicked values and when they drop, the Level box |
| ui-helpers | number boxes, the view cache, the debounced effect, en-US counts, the "Gear from" and Expansion menus |
| ui-ranks | the ranked stat menus (Goal, tiebreaks, Piece stats substats): one rank per stat, swaps |
| ui-state | restoring saved state |
| ui-store | job switch and reset |
| ui-sync-charts | the math tab's SVG charts: escaping, bands, shading, widths, bars |
| ui-views-gcd | How the math works, GCD: the facts for a speed (checked against the optimizer's 2.10 s and +11 at level 50), the step table's window, the level box's correction, the haste menu and chart marks; the stored most speed per level against the searches |
| ui-views-gear | Gear browser: rows and synced stats, slot pills, sorting, search, Reset filters |
| ui-views-optimizer | Gear optimizer: totals against the core and the brute force, rows, Food row and menu, Target GCD, Rank by tier, the gear searched, the key that marks a result out of date |
| ui-views-optimizer.covered-by | an empty row names the piece the table shows as covering it |
| ui-views-piece | Piece stats' step by step: each stat against its ceiling, the off-hand rule, the substat ranks |
| ui-views-sync-explainer | How the math works, Piece stats: a piece against the melded cap, the item level range, melds from the Goal, the special substat caps |
| ui-views-tiers | Substat tiers: the ladder's columns, rows (no empty ones at the base) and wording; typed values; the sub-tab's own level |
| ui-views.level-sync | level sync across the views, and a cap far above the synced level |

Notes:

- **The long sweep** in `tests/full/` follows the same rule: `core-tier-rank.gcd-1` to `.gcd-4` and `core-tier-rank.no-gcd`. The helpers in `tests/unit/helpers/` are not tests and are named for what they hold.
- **The components** that import Alpine (`gear`, `optimizer`, `sync-explainer` in `src/ui/components/`) need a page to load, so only the smoke test reaches them.
- **What each file checks** is in its header comment and test names, and where each expected value comes from is in a comment next to it. They are not repeated here, so they cannot drift apart.
- **Shared helpers** are in `tests/unit/helpers/`: the brute-force reference and real-gear pools (`exhaustive.js`, section 2.1), seeded random numbers, item lookup by name, store-shaped state, and values typed in from outside sources such as the `BaseParam` slot shares and AkhMorning's level table (`common.js`), the tier ranking reference with its random cases (`tier-reference.js`), shared with the long sweep in `tests/full/`, the view tests' store-shaped state with sync at 123 and their small real-gear pools (`views.js`), and 14 optimizer results as the page showed them before `evaluateSet` (`optimizer-view-sets.json`, for `core-set`).
- **The kind of evidence** each test uses (published numbers, game data, a derivation, the brute force) is in [validation.md, section 7](../mechanics/validation.md#7-which-tests-assert-what).

### 2.1 The brute-force reference and the real-gear pools

**The question.** The optimizer is a branch and bound search with pruning and bounds ([optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound)); a wrong bound silently returns a worse loadout (one item per gear slot). How do we know its answer is the true best? By comparing it with a search that is too simple to be wrong: try everything. This is differential testing against a reference implementation.

![Differential testing. Real-gear pools (7 jobs, every role, 24 to 33 items, 3,072 to 147,456 loadouts) and random pools drawn from fixed seeds each go to both the optimizer (branch and bound with pruning and bounds, where a wrong bound silently returns a worse loadout) and the brute-force reference (every legal loadout, drop those outside the speed range, keep the best by goal, tiebreak 1, tiebreak 2; no pruning, no score weighting). The results are compared on every substat, not pinned totals: equal passes, any difference fails and names a reproducible pool. Shared by both sides and so not checked by the comparison: a piece's effective (synced) stats, covered by the sync tests and the caps at item level 475 and 123; and policies 1 and 2, covered by the "policy: ..." tests on two-item pools.](../diagrams/testing-differential.svg)

**What the reference does.** A legal loadout has:

- one item per slot, and two rings;
- the same ring twice only when it has two copies (a Unique ring can be worn once);
- a single ring when no pair exists.

"Best" is lexicographic: compare the target stat first, then tiebreak 1, then tiebreak 2, like words in a dictionary. With no pruning and no score weighting, the reference is independent of the optimizer's search. It tries each distinct total once: two choices for one slot with the same stats and the same blocked slots (two ring pairs whose melds add up alike, 7 in 8 on a pool with overmelded rings) give the same loadout totals, so the best cannot depend on which is tried. This exact shortcut made the unit tests about 2.5 times faster (2026-10-19).

**Toy example** (made-up, to show the count). A pool with 3 heads, 2 bodies and 3 different rings, nothing else, has $3 \times 2 \times \binom{3}{2} = 18$ loadouts if each ring has one copy, and $3 \times 2 \times 6 = 36$ if each has two (the 3 pairs of different rings plus 3 doubles). In general the count is the product, over slots, of the number of choices in that slot, which is why a pool must stay small.

**What it does not check.** Both sides share three rules, so the comparison would confirm them rather than question them:

- The rule for a piece's effective (synced) stats. The comparison does **not** check the clamp (the cut of each stat to the sync cap); the sync tests, the Wiki item level 475 caps, the derived caps at 123 in the caps test, and the same caps in the formula, views and smoke tests do.
- Two engine policies copied into the reference rather than derived, stated in [optimizer.md, section 2](optimizer.md#2-formal-statement): (1) a single ring only when no ring pair exists; (2) a slot never left empty to meet a constraint. Both are tested directly on two-item pools, for both the optimizer and the reference (the "policy: ..." tests in the exhaustive test file). Changing either is a deliberate change to the engine, the reference and those tests together.

**Real-gear pools.** A real-gear pool is every database item the job can equip in a small item level window, with equip level 50 or below, small enough to enumerate. The pools in the optimizer tests (speed totals measured on the current data):

| Job (role) | Item levels | Items | Loadouts | Best speed, synced to 123 / unsynced |
| --- | --- | ---: | ---: | --- |
| White Mage (healer) | 130–135 | 24 | 3,072 | 283 / 294 |
| Sage (healer) | 120–130 | 33 | 147,456 | 247 / 255 |
| Warrior (tank) | 130–135 | 32 | 98,304 | 85 / 87 |
| Paladin (tank) | 128–132 | 31 | 65,536 | 85 / 87 |
| Dragoon (melee) | 130–135 | 32 | 98,304 | 195 / 201 |
| Bard (ranged) | 125–135 | 25 | 3,584 | 254 / 262 |
| Black Mage (caster) | 125–135 | 25 | 3,584 | 273 / 288 |

The tests assert equality with the brute force for every substat, not these totals, so they hold if a patch changes the gear in a window. What these comparisons show, alongside the probes outside the tests, is in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

**Randomized pools.** The exhaustive tests also draw random pools from fixed seeds, so a failure names a pool that can be reproduced (section 4).

### Generator tests

Two Python files: `test_generators.py` (the item database, the item level data, the job icons, the gear categories, and schema drift) and `test_food.py` (the food table). They run on the CSV files in the test fixtures folder: real sheet headers, real slot and job category rows, made-up item rows, and a synthetic item level sheet in which reading the wrong column gives a visibly wrong number. The fixtures and the full list of rules tested are in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).

### Smoke test

**The question.** The unit tests prove the core and the view builders right; does the built page actually show what they compute? The smoke test opens the built page from a `file://` address in headless Chromium at 1000 × 900. Its numbers come from `src/core` in Node at test time (`smoke-core.mjs`), so it checks how the page is wired to the core, not the math again.

The checks sit in one section of the file per tab, in this order:

| Section | Checks |
| --- | --- |
| Settings panel | defaults (title, no job, level 100, sync off), the cap field's rules and "Lowered to" note, job switch, level caps of limited jobs |
| Gear optimizer | Sage and Warrior totals equal the core's; typing a cap runs no search; Gear from, the optimizer's filters, materia, Food, Rank by tier, Target GCD; the same-result menus at 960 px |
| Gear browser | ×2 ring marks, search and Reset filters, a filter's range, the expansion filter's equip level band, Off-hand only for one-handed jobs |
| How the math works | Piece stats (the item level 130 healer head piece, caps at 123 per slot), Substat tiers, GCD |
| Saved state | reload keeps the settings, damaged storage is repaired, Reset to defaults asks first |
| Across the tabs | level 90 values on each tab at 960 px; every tab for eight jobs: caps at 123, no bad text, no sideways scroll at 960 px |

**Groups and the shared setup.** `GROUPS`, at the end of the file, lists the steps. Each group runs on a fresh page (its own saved state), in parallel with the others; its steps run one after the other. Every group but the defaults starts from the shared setup (`SHARED_SETUP`: Sage, sync to 123, level 50). Before each step that uses it (all but the job walks), the runner checks the setup; a step that left it changed fails by name, and the setup is made again, so the next step does not fail for it.

Notes:

- **What fails it.** Any uncaught page error or console error. Network errors are ignored, since the web fonts cannot load offline.
- **Waits.** Almost every wait is on a concrete condition (an element appears, a text matches). Five are fixed, and each checks that something does *not* happen, so a busy machine can make them pass wrongly but not fail:
  - the typing step (`checkTypingDebounce`): two waits of 600 ms, before and after typing a cap, to show typing runs no search;
  - the cap check (`checkCapValidation`): 60 ms between up-arrow presses, then 400 ms, to show the "Lowered to" note stays put;
  - the level cap check (`checkJobLevelCap`): 400 ms, longer than the save debounce, to show a level above the job's cap is not saved.

  The optimizer runs only on Optimize: the smoke test presses it (`waitOptimizer`) and waits for that search's timing mark.
- **Screenshots.** Of the optimizer (one per job), the gear browser, the level sync check and the 960 px walk, plus one per failed step, written to the smoke test's output folder (gitignored).
- **Success** prints `no errors`.

## 3. Commands

Which command runs which check? Run from the repository root.

![npm run check runs lint (Biome, with a format check), build (the one HTML page), test (unit tests in Node) and smoke (the built page in Chromium), in that order; it needs no Python and is the bar for calling a change done. npm run check:all runs check, then lint:py (Ruff) and test:data (generator tests in Python); run it when touching scripts/data/ or after update-data. Both stop at the first failure. The perf commands, the Target GCD sweep and the checks against ffxiv-gearing and xivgear are run by hand and are never part of check.](../diagrams/testing-commands.svg)

Every command, with what it runs and how long it takes, is listed once, in [README, Develop](../../README.md#develop). `npm run check` took about 45 s on a 12-thread machine on 2026-10-19 (about 1 min when the machine is busy): lint 4 s, build 2 s, unit tests 17 s, smoke 20 to 40 s. The notes below say what the test commands check.

Notes on the pass/fail commands:

- **`npm test`** runs the unit tests with Node's built-in test runner, which runs files in parallel, so the slowest file sets the time. **`npm run test:full`** adds `tests/full/`: 360 random cases of tier ranking against its reference, split in five files so they run at the same time; they take about 22 s on their own, most of it one case (case 92 of seed 33818, a Paladin pool whose reference tries millions of loadouts). `npm test` keeps the first 20 of the Target GCD cases, so every case runs in `test:full` and the first 20 in both. **`npm run test:data`** runs the generator tests with Python `unittest`. The Python npm scripts (`test:data`, `lint:py`, `format:py`, `update-data`) start Python through `scripts/py.mjs`, which runs `python3` or `python`, whichever exists, so they work on Windows, macOS and Linux.
- **`npm run smoke`** needs the page built first; it is a Node script (Playwright) that takes its expected values from `src/core` directly (computed in a worker thread, `tests/e2e/smoke-core.mjs`). Its steps run in groups, in parallel, each group on a fresh page with its own saved state (about 20 s on a 12-thread machine on 2026-10-19, up to about 55 s when the machine is busy; `SMOKE_TRACE=1` prints each step's time, `SMOKE_PAGE` tests another page file).
- **`npm run lint`** lints, then reports formatting differences without changing files; a lint warning fails it, as an error does. `scripts/validate/xivgear/xg_sync_test.ts` is left out of the lint (it runs inside xivgear's own test runner against their types; the reason is in `biome.jsonc`) but is still format-checked. `lint:py` does the same with Ruff.
- **`npm run check`** and **`npm run check:all`** run the steps in the diagram above; `check` is the bar for calling a change done. For UI changes, also open the built page and look at it at desktop width and at 960 px.

Notes on the measurements and checks run by hand (none is part of `npm run check`):

- **The `perf` commands** are performance measurements, not pass/fail tests. They write one JSON row per run to `scripts/perf/out/` (gitignored) and print a summary against the budgets; the results are in [optimizer.md, section 8](optimizer.md#stress-test-2026-10-14). `db-parse.mjs` times how long Chromium takes to read and run the inlined item database at page open (results in [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)). Two more scripts there are run by hand: `split.mjs` times each step of one run, and `compare.mjs` checks that a faster version gives exactly the results of a fresh copy of `src/` from the old commit that you make yourself, outside the repo or under the gitignored `scripts/perf/out/` (how to run it, the budgets and what to do when one fails are in [optimizer.md, section 8](optimizer.md#stress-test-2026-10-14)). Every perf script takes its options the same way, `--name value` or a bare `--flag` (`scripts/perf/args.mjs`).
- **`target-gcd-sweep.mjs`** runs Target GCD (a wanted global cooldown, which the optimizer turns into a speed range) over a large grid:
  - every job;
  - every sync setting of the other scripts but cap 795 (it syncs nothing, so it repeats no sync);
  - the page's default "Gear from" boxes;
  - every goal and tiebreak order;
  - six GCDs, from the no-speed one to the fastest the gear reaches;
  - both modes;
  - food off and "Best for the goal".

  It checks itself two ways. On every fourth run with food off, it searches the same candidates with the plain search (no speed tables, groups or memo) and compares. For each job and sync setting, it also checks four small pools against the brute force. A difference is counted as a mismatch, and the results are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).
- **The check against ffxiv-gearing** (`scripts/validate/gearing/`): `fetch.py` clones and builds that tool at a pinned commit, `run.mjs` (Node, Playwright) compares every synced stat with it in a browser (about 6 minutes; `--site live` against its published page) and fails on a difference with no known cause. Results in [validation.md, section 9](../mechanics/validation.md#9-against-another-tool-ffxiv-gearing).
- **The check against xivgear** (`scripts/validate/xivgear/`), run the same way: `fetch.py` clones xivgear at a pinned commit and installs its dependencies (with install scripts off), `run.py` runs our bundled core inside xivgear's own test runner and compares every synced stat, job and sync setting (about 30 minutes, one process per job and level; their item data is cached in `data/xivgear-cache`, so later runs are offline). Their two known sync faults are corrected on their side before comparing, and the run fails on any other difference with no known cause. Results in [validation.md, section 10](../mechanics/validation.md#10-against-another-tool-xivgear).

Running a subset:

- one unit test file: `node --test tests/unit/core-formulas.sync-clamp.test.js`
- unit tests by name: `node --test --test-name-pattern="brute force" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** Node 22 or later, `npm install` (or `npm ci` for a clean install that matches `package-lock.json` exactly, as CI does), then once `npx playwright install chromium` (for the smoke test and `perf:browser`). For the Python parts (generator tests, Ruff, data pipeline), Python 3 and `python -m pip install -r requirements-dev.txt`: CI uses 3.13 (`.python-version`); the code keeps to 3.9 syntax, but nothing tests 3.9.

## 4. Conventions

What makes a test here worth having? Five rules, each with the reason behind it.

**Expected values come from outside the code under test.** Prefer, in this order:

1. published numbers (the Wiki's item level 475 sync caps, AkhMorning's GCD tier tables);
2. real items from the game data (the item level 130 healer head piece, real-gear pools);
3. independent references written in the test (the brute force; caps derived from the raw `ItemLevel` rows and slot shares rather than by the function under test).

Cite the source (a URL for a published number) in a comment next to the value. A number copied from the tool's own output only proves the tool still agrees with itself. If a value has no outside source, say so in the test name or a comment.

**Pick real items by their properties, not their names.** A test asks for what it needs (a head piece at item level 130 with Spell Speed above the cap, a Unique ring, every item a job can equip in a window) and finds it in the database. The test then states its requirement, and does not depend on one gear set.

**Reproduce a reported bug before fixing it.** When the owner reports a bug (often from a screenshot), first write a unit test or smoke check that fails on the current code, then fix, and keep the test as a regression check. This is the hand-made counterpart of mutation testing: the buggy code is a known mutant, and the test must kill it. The ring pruning and tiebreak weight regressions in the exhaustive tests fail on the code before those fixes ([history.md](../history.md)), and 8 of the original 14 saved-state tests failed on the old restore code.

**Check the optimizer against exhaustive search.** The optimizer's pruning and bounds are where subtle bugs hide: the ring pruning bug returned a worse ring pair on real gear while every fixed-value test passed ([history.md](../history.md#results-of-the-tool)). So:

- The shared brute force (section 2.1) tries every legal loadout under the same rules; real-gear, constraint and view tests compare against it rather than pinning totals, and random pools come from fixed seeds so a failure can be reproduced.
- Any change to scoring, pruning or the search must keep these tests green; also re-time a large pool ([optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

**Keep shared logic job-agnostic in tests too.** The tool supports all 23 combat jobs. Tests of shared logic should either loop over several jobs (the real-gear optimizer tests cover every role) or use the job only as an example of a role (Sage for healers, Warrior for tanks). Do not encode a Sage-only assumption into a test of shared code.

**Assert, don't print.** A check that only prints a value cannot fail. The band accuracy test prints its per-band shares as diagnostics but asserts the thresholds.

## 5. Adding a test

Where does a new test go?

| What changed | Where the test goes |
| --- | --- |
| Formula, sync, speed, item query, optimizer | The module's unit test file (`core-<module>`) |
| What a tab shows | Its view's unit test file (`ui-views-<view>`) |
| A component's own logic (no page needed) | `ui-components-<component>` |
| Saved state shape or restore rules | `ui-state` |
| A generator rule | The generator tests |
| Something only visible on the page | A new smoke test step |

Notes:

- **Unit test file.** Named for the module under the naming rule (section 2): add to the module's file, or start one under that name, with a header comment on line 1 saying what it covers. A test name says the behaviour checked, not a roadmap code (keep the code in the comment). Use `node:test` and strict assertions, and import from the core directly. For the optimizer, compare with the shared brute force.
- **Views.** Labels, totals, colouring, empty and error states, on a plain state object (`makeApp` in `tests/unit/helpers/views.js`).
- **State.** Add both a valid round-trip and a damaged value that must be repaired.
- **Generator.** Add a row to the fixture CSVs if needed, using the real header, and assert on the generated output.
- **Smoke test.** For a layout, a binding or an interaction: a new check function in its tab's section of `smoke.mjs`, added to a group in `GROUPS`. A step that changes the job, cap, sync or level sets the shared setup back at its end (`setUpShared`). Wait on a concrete condition, never a fixed delay, and record failures with the shared check helper so the run continues.

Run the whole check afterwards. A new test is only useful if it passes on the fixed code and fails on the broken one, so when possible, also confirm it fails before the fix.

## 6. After a game patch

**The question.** A game patch adds gear, and the data is refreshed from the new game files. Which failing tests then mean "the data moved, update the expectation" and which mean "something is wrong"? Refreshing the data can legitimately change some expected values and must not change others. The refresh steps are in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

| Expectation | After a patch |
| --- | --- |
| Row counts, highest real item level | may move |
| Accuracy share per item level band | may move; thresholds hold |
| Real-gear pool totals | may move |
| Values of specific old items | must not move |
| Wiki caps at 475, caps at 123 | must not move |
| Generic maximum at cap 123 | must not move |
| Format, row shape, provenance, generator tests | must not move |
| Level tables | fail when the level cap rises, until extended |

The rule behind the table: a value that depends on what gear exists may move; a value that depends only on old, unchanged game rows must not.

- **Row counts and the highest real item level** move when new gear is added. The page computes the highest item level itself.
- **Accuracy shares** are currently 99.7% to 100.0% exact. They can move as new gear arrives, but the thresholds (98.5% exact and within ±1) should still hold. A drop below them means the model needs a look, not a lower threshold.
- **Real-gear pool totals** (optimizer, constraints, views, smoke) follow the data, because the tests compare with the brute force. A pool check can fail if a patch adds gear to a window (more than 200,000 loadouts, or a slot left with a single item); choose a new window rather than loosening the check.
- **Specific old items** do not change: the item level 130 healer head piece (Mind 33, Vitality 32, substats 31 / 22 / 6) in the formula, views and smoke tests, and other item lookups and optimizer totals tied to named old items.
- **The Wiki caps at item level 475** are published numbers; a change means the game changed old `ItemLevel` rows. The same holds for the item level 123 caps.
- **The generic maximum at cap 123** (296 Spell Speed, 2.22 s GCD) depends only on `ItemLevel` rows 123 and 475. Investigate if it moves.
- **Format, row shape, provenance and generator tests** test the pipeline, not the game data.
- **Level tables** fail when a patch raises the level cap, naming each hand-kept table that stops short (the main stat base per level, the expansion list, the haste steps). Extend those tables; see [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

## Where this lives

| Concept | File |
| --- | --- |
| Unit tests | `tests/unit/<module>.test.js`, named by the rule in section 2 |
| Brute-force reference and real-gear pools | `tests/unit/helpers/exhaustive.js` (`exhaustive`, `gamePool`, `loadoutCount`) |
| Shared test helpers and typed-in outside values | `tests/unit/helpers/common.js` (`rng`, `itemRow`, `appState`, `SLOT_PERMILLE`, `AKH_LEVEL`) |
| Tier ranking reference and its random cases | `tests/unit/helpers/tier-reference.js` (`tierLex`, `checkNoGcd`, `checkGcd`); the long sweep in `tests/full/` |
| View builders tested without the browser | `src/ui/views/` |
| Accuracy check against real items and the Wiki | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| View test setup | `tests/unit/helpers/views.js` (`makeApp`, `WINDOW`, `windowPool`, `uniqueRingPool`) |
| Smoke test, its steps and its screenshots | `tests/e2e/smoke.mjs` (a section per tab, `GROUPS`, `SHARED_SETUP`, `runGroup`, `main`), `tests/e2e/out/` (gitignored) |
| Commands | `package.json` (`test`, `test:data`, `smoke`, `lint`, `lint:py`, `format`, `check`, `check:all`) |
| Lint and format configuration | `biome.jsonc`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
