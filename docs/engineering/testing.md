# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](../mechanics/validation.md). How the parts fit together is in [architecture.md](architecture.md).

Related pages: [validation.md](../mechanics/validation.md) (the evidence behind expected values), [optimizer.md](optimizer.md) (the search the exhaustive tests check), [data-pipeline.md](data-pipeline.md) (the generators the Python tests check), [architecture.md](architecture.md), [glossary.md](../glossary.md).

**The testing problem in one paragraph.** The tool computes numbers nobody can check by eye. One is the stats of a gear piece (an item worn in one body slot) after the game lowers it to a fixed strength. The other is the best combination of pieces out of thousands. A test is only as good as its **oracle**, the source of its expected value. This suite uses four kinds of oracle, in order of preference:

| Oracle | Example | Where |
| --- | --- | --- |
| Published numbers | the Wiki's sync caps at item level 475 | unit tests (section 2) |
| Real game data | a real item level 130 healer head piece | unit and smoke tests |
| An independent reference | a brute force that tries every gear set | section 2.1 |
| A regression that failed before a fix | the ring pruning bug | section 4 |

A number copied from the tool's own output is not an oracle: it only proves the tool still agrees with itself (section 4). Game terms used below (item level, sync cap, GCD, melds, Unique) are defined in [glossary.md](../glossary.md).

## 1. Test layers

What runs, on what, and how much of it?

| Layer | Runs on | Count |
| --- | --- | --- |
| Unit tests (Node) | core logic, view builders, saved state, real game data | about 675 tests in 83 files, about 25 s |
| Long sweep (Node) | tier ranking against its reference on 360 random cases (`tests/full/`) | 6 tests in 5 files, about 36 s with the unit tests (2026-11-09) |
| Generator tests (Python) | the data generators, on small test files | 110 tests in 2 files (2026-10-19) |
| Smoke test (browser) | the built page in headless Chromium | one script, 32 groups of steps |

Notes:

- **Unit tests** import the core logic, the page's view builders and the saved-state repair directly, with the real generated game data. They check formulas, sync, speed, item queries, optimizer correctness on real gear, what each tab shows, the components' logic that runs without a page, data format, provenance and saved state. A shared brute-force helper serves the optimizer tests (section 2.1).
- **Generator tests** run the item level, item database and job icon generators and the gear category rules on small test CSV and icon files. They check row selection, slot detection and multi-slot gear (a cloak kept on its own slot code, an unsupported combination left out). They also check stat placement, the HQ rule, job mask, sort order, budget table and level data, stat factor kind and table, gear categories and source flags, schema drift, and job icon embedding and numbering.
- **Smoke test** opens the built page from disk. It checks known numbers on screen, optimizer totals equal to the core's on real gear, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, and no sideways scroll at 960 px (half of a 1920 screen; there is no phone layout). Its steps run in 32 groups, each on a fresh page, from a shared setup it checks between steps (section 2, *Smoke test*).

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
| core-gear-groups | the gear groups Copy sheet offers, from the item data |
| core-item-format | generated data shape; `ROW` against the format's row fields |
| core-items | gear filtering, row conversion, item fields; rows sharing a pool key agree |
| core-items.identity | a piece by its game id: one row per id, the pool item of an id |
| core-items.multi-slot | cloaks, tank multi-slot gear, White Mage shields |
| core-job-context.keys | the stat keys of all 23 jobs; the labels and short names by key (note 1) |
| core-meld | materia melds on real items |
| core-meld.apply-stones | a given list of stones on real items; the optimizer's melds give their gains back (note 2) |
| core-optimizer | real-gear pools, ring-pair bound |
| core-optimizer-regain | regain cuts from a proven maximum against the brute force |
| core-optimizer-search | the search's parts on their own against brute force (note 3) |
| core-optimizer-slot-index | slot positions and blocked-slot masks |
| core-optimizer.exhaustive | random pools, regressions, policies |
| core-optimizer.pinned | pinned pieces in the search: kept with their stones, counted in totals and tiers |
| core-optimizer.speed-limits | speed minimum, maximum and range |
| core-optimizer.stat-minimums | minimums on any stat against the brute force (note 4) |
| core-recipe | a recipe's solve (note 5) |
| core-recipe.pins | a solve's pins: kept pieces and meal, the problems a pin cannot be kept for |
| core-recipe.real-gear | a set's Fill on real gear against the core and the brute force (note 6) |
| core-same-result | other pieces with the same result: shared spare points, Unique rings, cloaks, the owner's level 50 case |
| core-session | the solver session: the last four entries per kind, least recently used dropped first; a job's gear built once |
| core-set | a gear set and what it adds up to (note 7) |
| core-stat-keys | old position keys read as a job's own, a key moved to another job, and a guard on hard-coded keys (note 8) |
| core-speed | GCD tiers, DoT scalars, the cast and recast multiplier, haste, tier lookup |
| core-sync-target | level sync, its triggers, the optimizer under it |
| core-tables.provenance | source record and footer |
| core-target-gcd | Target GCD: GCD reached, modes, meals |
| core-target-gcd.exhaustive | Target GCD against the brute force |
| core-tier-rank | tier ranking against its own reference (note 9) |
| core-tiers | substat tiers; the Substat tiers sub-tab's ladder and tier sizes |
| core-validation | Wiki caps, accuracy per band, special lines |
| scripts-build | the build script and the optimizer's worker bundle (note 10) |
| ui-components-gcd | How the math works, GCD's controls: the level and speed boxes, the slider, the chart and step clicks |
| ui-components-gear | the Gear browser: its view built once per change and only while its tab is open, sorting, Reset filters, the / key |
| ui-components-meal-menu | the Food menu: pills, pinned meals, sort, a pick (note 11) |
| ui-components-page | the job picker, the cap field's error and lowered note, Reset asking first |
| ui-components-set-page-draft | a set page bound as Alpine binds it: edits by hand kept in a draft until Apply, pins saved at once |
| ui-components-set-page-fill | a set page's Fill: a real search and its suggestion, Take boxes, the edit lock, Cancel, a failing solver, late replies |
| ui-components-set-page-leave | the question before leaving for a draft, a running Fill and a waiting result |
| ui-components-set-page-settings | the Fill settings dialog: a change dropping a waiting result, the Gear to search line, the goal menus |
| ui-components-set-page-view | a set page's view built once per change; the Food menu built only when read |
| ui-components-sheets | the Sheets tab with a real sheets' store (note 12) |
| ui-components-sync-explainer | Piece stats: its views built once per change, the item level box, the substat menus, the chart's width |
| ui-components-tiers | Substat tiers: typed and clicked values and when they drop, the Level box |
| ui-helpers | number boxes (their min and max, the Target GCD's range), the view cache, en-US counts, the "Gear from" and Expansion menus |
| ui-hq-font | the HQ glyph font and its fallback |
| ui-ranks | the ranked stat menus (Goal, tiebreaks, Piece stats substats): one rank per stat, swaps |
| ui-sheet-storage | the saved sheets (index and one record per sheet) through a storage stand-in (note 13) |
| ui-sheet-storage.stat-keys | a v1 record read with the game's keys, and a record with the game's keys read as it is (note 14) |
| ui-sheet-store | the sheets' store over a storage stand-in (note 15) |
| ui-sheet-ops | sheets and gear sets as plain data (note 16) |
| ui-sheet-ops.stat-keys | Copy sheet moving the goal and the stones to the new job by position |
| ui-solver | the optimizer's solver (note 17) |
| ui-state | restoring saved state, including a save with position keys in `piece.subs` and `browse.sort`; loading and saving with a storage that throws |
| ui-state.panels | each reference tab's own Job and sync panel on restore; an old save's optimizer settings dropped |
| ui-state.split-panel | the saved settings with the Job and sync panel split between the Gear browser and the math tab and the old `opt` dropped |
| ui-store | job switch and reset |
| ui-store.panels | the two reference tabs' panels in the store: switching, persisting, job resets |
| ui-store.sheets-tab | the Sheets tab has no panel (note 18) |
| styles.theme-tokens | colors only through the CSS tokens (note 19) |
| tests-e2e-smoke-visual | the smoke test's contrast arithmetic and token reader against the WCAG's published values (21:1, #767676 and #777777 on white), large text, translucent layers |
| ui-sync-charts | the math tab's SVG charts: escaping, bands, shading, widths, bars |
| ui-views-fill | Fill plan and pins, the answer put on the open rows, bad pin messages |
| ui-views-fill-settings | a set's Fill settings: the defaults, a stat the job lacks, the recipe (every setting reaches the request) and the goal line |
| ui-views-gcd | How the math works, GCD (note 20) |
| ui-views-gear | Gear browser: rows and synced stats, slot pills, sorting, search, Reset filters |
| ui-views-meal-menu | the Food menu: what each meal adds on the set's gear, pills, search, sort, the empty list |
| ui-views-piece | Piece stats' step by step: each stat against its ceiling, the off-hand rule, the substat ranks |
| ui-views-piece-menu | a set page's piece picker: the pieces of a slot by expansion, the search, the empty text |
| ui-views-piece-menu.limit | the picker drawn in steps: the first rows of the full list, the whole count, the set's part not cached |
| ui-views-saved-set | the rows a job uses, ring labels, sameRow; the draft count and a Fill suggestion agree |
| ui-views-set-draft | a manual draft: changed rows, the Now and After figures, Apply and leave texts |
| ui-views-set-edits | edits by hand: a piece placed, a Unique ring in one ring row, stones in order, the meal, pins |
| ui-views-set-rows | a set's rows: pieces, stones, missing items, pins |
| ui-views-set-suggestion | a Fill suggestion on real Sage pieces (note 21) |
| ui-views-set-totals | a set's totals, tiers and defense |
| ui-views-sheet-forms | the Sheets tab's dialogs (note 22) |
| ui-views-sheet-manager | the sheet manager: rows, unreadable records, the empty state, text helpers |
| ui-views-solve | the solver's answers: solveView by kind, an error as an answer, Gear to search |
| ui-views-stone-menu | a set page's materia menu: the grades an item level takes, the room under the cap, overmeld odds |
| ui-views-sync-explainer | How the math works, Piece stats: a piece against the melded cap, the item level range, melds from the Goal, the special substat caps |
| ui-views-tiers | Substat tiers: the ladder's columns, rows (no empty ones at the base) and wording; typed values; the sub-tab's own level |
| ui-views.level-sync | level sync across the views, and a cap far above the synced level |

Notes on the longer rows:

1. `core-job-context.keys`: the keys checked are the main, speed and special key, `stats` and `substats` in order, and six keys without a special substat.
2. `core-meld.apply-stones`: the list is checked for gates, high grades past the big slots, caps, and sync removing them.
3. `core-optimizer-search`: limit tables and their smallest over two or three bands, the Lagrangian bound and reduced-cost fixing, the slot order, the memo's dominance and its full key.
4. `core-optimizer.stat-minimums`: seeds; the filters, trial search and fronts on tight cases against the plain search; the fronts alone, also on empty, blockable and ringless slots.
5. `core-recipe`: the session keys each recipe field belongs to, the gear set by gameId and its record, a piece picked by gameId, a warm session against a fresh one and what it keeps between solves.
6. `core-recipe.real-gear`: the pool and filters, totals, Target GCD, food, rank by tier and relics.
7. `core-set`: 14 real optimizer results recorded from the page before it used `evaluateSet`, number for number; the optimizer's own totals; custom pieces, removed stones, a game id no row has.
8. `core-stat-keys`: `currentStatKey` reads old position keys as a job's own, and `remapStatKey` moves a key to another job by position. The guard is that `src/core` and `src/ui/views` hard-code no job-specific stat key outside the allow-listed tables.
9. `core-tier-rank`: the reference tries every gear set and meal, with the stage rule written out. The cases are 20 of three keys and a Target GCD, a stage stopped at its node limit, an infeasible Target GCD, and 360 more random cases in `tests/full/`.
10. `scripts-build`: the DEV badge outside `main`, the page template and its partials, the licence notices found in the bundled code, two builds of one tree giving the same page, the page's 4 MB ceiling, the data as `JSON.parse`. The optimizer's worker bundle is run in Node: it loads from the posted data texts (the item database in the script once) and answers like the page thread.
11. `ui-components-meal-menu`: no pill at first, the pinned meals, pills kept across results while they list a meal, the sort and its fallback to ILVL, a pick.
12. `ui-components-sheets`: the screens, New sheet's default name, refused names put back, Copy and Delete through their dialogs, set notes, Escape, nothing opening while a Fill runs, keyboard and drag reordering, the note that clears itself.
13. `ui-sheet-storage`: round trip, order, new sheet on top, a save touching only its own record, unreadable records listed with a cause and left alone, delete, a full storage (the edit stays), missing or throwing storage.
14. `ui-sheet-storage.stat-keys`: the v1 record has position keys (`main`, `spd`, `spec`) per stat profile.
15. `ui-sheet-store`: making, editing, copying (the White Mage cane cleared after the question), deleting and reordering sheets and gear sets. Also the screen each action leaves open, the level and cap held to their ranges, the edit lock while a Fill runs, a full storage keeping the edit, no storage, unreadable records deleted, and a second store reading back what was saved.
16. `ui-sheet-ops`: names and descriptions as stored, default and copy names, a new sheet and set read back by the storage, Copy sheet clearing the pieces the new job cannot wear, moving a row.
17. `ui-solver`: the request handler as a plain function (the worker's), requests and replies through a structured clone (the solve reply carries the plain gear set and the recipe), the worker solver's ids. Also one request per kind in the worker with the newest waiting, and the fallback to the page thread when the worker cannot start or fails.
18. `ui-store.sheets-tab`: going there and back keeps every tab's panel, the save holds none for it, a save made there opens there.
19. `styles.theme-tokens`: no literal #hex, rgb(), hsl() or color name in a rule of `src/styles.css`, an inline style or color attribute of the page's HTML (the Sheets markup included) or a quoted color in the UI scripts, apart from the listed exception (the `.backdrop` scrim). The scan is run on made-up CSS first. The light and the two dark token lists name the same tokens, and the dark ones are equal.
20. `ui-views-gcd`: the facts for a speed (checked against the optimizer's 2.10 s and +11 at level 50), the step table's window, the level box's correction, the haste menu and chart marks; the stored most speed per level against the searches.
21. `ui-views-set-suggestion`: the rows it changes with their Take boxes, the set as taken, Now and After, Apply's text, pinned rows kept, an empty set, the table rows with Take boxes; bad pins dropped and named, no set.
22. `ui-views-sheet-forms`: New sheet's default name and ranges, Copy sheet's jobs by gear group and its list of pieces to clear, Name and description, the Delete questions.

Notes:

- **The long sweep** in `tests/full/` follows the same rule: `core-tier-rank.gcd-1` to `.gcd-4` and `core-tier-rank.no-gcd`. The helpers in `tests/unit/helpers/` are not tests and are named for what they hold.
- **The components** are unit tested (the `ui-components-*` files): no component imports Alpine, so each test binds one to a plain store. The smoke test checks how they are wired into the page.
- **What each file checks** is in its header comment and test names, and where each expected value comes from is in a comment next to it. They are not repeated here, so they cannot drift apart.
- **Shared helpers** are in `tests/unit/helpers/`:
  - the brute-force reference and real-gear pools (`exhaustive.js`, section 2.1);
  - seeded random numbers, item lookup by name, store-shaped state, and values typed in from outside sources such as the `BaseParam` slot shares and AkhMorning's level table (`common.js`);
  - the tier ranking reference with its random cases, shared with the long sweep in `tests/full/` (`tier-reference.js`);
  - the view tests' store-shaped state with sync at 123 and a set's recipe, their small real-gear pools and a Fill's solve (`views.js`);
  - saved sheets of real items for the Sheets tests (`sheet-fixtures.js`);
  - a set page's component bound to a real store with solver stand-ins (`set-page-bind.js`);
  - pin lists for the pinned search tests (`pins.js`);
  - 14 optimizer results as the page showed them before `evaluateSet` (`optimizer-view-sets.json`, for `core-set`).
- **The kind of evidence** each test uses (published numbers, game data, a derivation, the brute force) is in [validation.md, section 7](../mechanics/validation.md#7-which-tests-assert-what).

### 2.1 The brute-force reference and the real-gear pools

**The question.** The optimizer is a branch and bound search with pruning and bounds ([optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound)); a wrong bound silently returns a worse gear set (one item per gear slot). How do we know its answer is the true best? By comparing it with a search that is too simple to be wrong: try everything. This is differential testing against a reference implementation.

![Differential testing. Real-gear pools (7 jobs, every role, 24 to 33 items, 3,072 to 147,456 gear sets) and random pools drawn from fixed seeds each go to both the optimizer (branch and bound with pruning and bounds, where a wrong bound silently returns a worse gear set) and the brute-force reference (every legal gear set, drop those outside the speed range, keep the best by goal, tiebreak 1, tiebreak 2; no pruning, no score weighting). The results are compared on every substat, not pinned totals: equal passes, any difference fails and names a reproducible pool. Shared by both sides and so not checked by the comparison: a piece's effective (synced) stats, covered by the sync tests and the caps at item level 475 and 123; and policies 1 and 2, covered by the "policy: ..." tests on two-item pools.](../diagrams/testing-differential.svg)

**What the reference does.** A legal gear set has:

- one item per slot, and two rings;
- the same ring twice only when it has two copies (a Unique ring can be worn once);
- a single ring when no pair exists.

"Best" is lexicographic: compare the target stat first, then tiebreak 1, then tiebreak 2, like words in a dictionary. With no pruning and no score weighting, the reference is independent of the optimizer's search. It tries each distinct total once. Two choices for one slot with the same stats and the same blocked slots give the same gear set totals, so the best cannot depend on which is tried. An example is two ring pairs whose melds add up alike (7 in 8 on a pool with overmelded rings). This exact shortcut made the unit tests about 2.5 times faster (2026-10-19).

**Toy example** (made-up, to show the count). A pool with 3 heads, 2 bodies and 3 different rings, nothing else, has $3 \times 2 \times \binom{3}{2} = 18$ gear sets if each ring has one copy. It has $3 \times 2 \times 6 = 36$ if each has two (the 3 pairs of different rings plus 3 doubles). In general the count is the product, over slots, of the number of choices in that slot, which is why a pool must stay small.

**What it does not check.** Both sides share three rules, so the comparison would confirm them rather than question them:

- The rule for a piece's effective (synced) stats. The comparison does **not** check the clamp (the cut of each stat to the sync cap). The sync tests, the Wiki item level 475 caps, the derived caps at 123 in the caps test, and the same caps in the formula, views and smoke tests do check it.
- Two engine policies copied into the reference rather than derived, stated in [optimizer.md, section 2](optimizer.md#2-formal-statement): (1) a single ring only when no ring pair exists; (2) a slot never left empty to meet a constraint. Both are tested directly on two-item pools, for both the optimizer and the reference (the "policy: ..." tests in the exhaustive test file). Changing either is a deliberate change to the engine, the reference and those tests together.

**Real-gear pools.** A real-gear pool is every database item the job can equip in a small item level window, with equip level 50 or below, small enough to enumerate. The pools in the optimizer tests (speed totals measured on the current data):

| Job (role) | Item levels | Items | Gear sets | Best speed, synced to 123 / unsynced |
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
| Fill | a Sage Fill, the Fill settings dialog, Cancel, the edit lock, a Fill without a worker (note a) |
| Gear browser | ×2 ring marks, search and Reset filters, a filter's range, the expansion filter's equip level band, Off-hand only for one-handed jobs |
| How the math works | Piece stats (the item level 130 healer head piece, caps at 123 per slot), Substat tiers, GCD |
| Saved state | reload keeps the settings, damaged storage is repaired, Reset to defaults asks first |
| Across the tabs | level 90 values on each tab at 960 px; every tab for eight jobs (note b) |
| Sheets | at 960 px, no Job and sync panel: the empty state, New sheet, Copy sheet, Delete, set notes, reordering (note c) |
| Sheets in two browser tabs, both color schemes and five windows | `checkTwoTabs`, `checkThemes` and `checkViewports` (note d) |

Notes on the longer rows:

- **Note a, Fill.**
  - A Sage Fill on every piece it can wear has the Mind the core finds.
  - The Fill settings dialog, in three steps:
    - the goal (Maximize, tiebreaks, Spare points to tiebreaks, Materia, Target GCD with its two modes, a change dropping a waiting result, everything kept across a reload);
    - Food (every Total cell with the meal, the Take boxes agreeing with Apply, a meal declined, food with a Target GCD);
    - Gear to search (Expansion, item level, equip level, Gear from, the market switch, the count line, the browser's boxes left alone).
  - Each control saves into the set's `fillSettings` and changes what Fill finds by what the core finds.
  - Cancel (clicked in the same task as Fill, so no machine speed matters) ends the worker and leaves the set as it was, and the next Fill is answered.
  - Also checked: the edit lock while a Fill runs (a worker held by a stand-in that never answers), focus on a set page, the same-result piece menu at 960 x 700, the overmeld odds row.
  - With no `Worker`, or a worker that fails to load (two groups of their own), a Fill runs on the page's thread with the core's numbers. A changed goal is searched again, Cancel right after Fill drops the search, no worker is left, and the next Fill works.
- **Note b, Across the tabs.** Every tab for eight jobs: caps at 123, no bad text, no sideways scroll at 960 px. A set page of each is also checked: its rows, the special substat column, the Gear to search count, a Fill with food against the core, the Food and Defense rows.
- **Note c, Sheets.**
  - At 960 px, with no Job and sync panel: the empty state, New sheet, Edit name and description (an empty name refused), the level and cap fields. Also New set and the set page's settings line, set notes, reordering by keyboard (the live region) and by drag. Also Copy sheet (and its list of pieces to clear, from a seeded White Mage cane), Delete, a reload keeping it all.
  - The dialogs' blank names and focus, the switch menu.
  - An unreadable record and its Delete question, the level range of Blue Mage and Beastmaster, Copy and Delete from a set page.
  - The widths where a rule switches (1099 and 1100 px, 1299 and 1301 px); no sideways scroll.
- **Note d, two browser tabs, both color schemes and five windows.**
  - `checkTwoTabs` uses two pages of one context sharing storage:
    - the second tab reads the first's sheet and set when it opens;
    - its open pages do not change under it (no live sync);
    - a rename in one is read by the other on its next open;
    - two edits of one sheet leave the last saved record whole;
    - a reorder is the order the other reads;
    - a sheet deleted in one that the other lists leads it to the manager;
    - a sheet the other has open and edits is written back (last write wins);
    - an index without a record, a record without an index entry and an unreadable record.
  - `checkThemes` visits the manager, the New sheet dialog, a sheet's page, a set page with a Fill suggestion and its materia menu with the odds row. Each is checked with the system setting dark and light and with `data-theme` forced to each: the tokens against `src/styles.css`, the body and surfaces painted with them, every probed text at WCAG AA 4.5:1 or 3:1 large.
  - `checkViewports` runs the five windows of section 3.1 on the manager with 3 sheets, a sheet's page with 5 sets, a filled set page, and its piece and materia menus. It checks no sideways scroll, the container at min(1280, page less 24 px a side) and centered, menus inside the window and below the sticky header, the header and column names on top after scrolling to the bottom, and Tab reaching Fill, Apply and Discard.

**Groups and the shared setup.** `GROUPS`, at the end of the file, lists the steps. Each group runs on a fresh page (its own saved state), in parallel with the others; its steps run one after the other. Every group but the defaults starts from the shared setup (`SHARED_SETUP`: Sage, sync to 123, level 50). Before each step that uses it (all but the job walks), the runner checks the setup; a step that left it changed fails by name, and the setup is made again, so the next step does not fail for it.

Notes:

- **What fails it.** Any uncaught page error or console error. Network errors are ignored, since the web fonts cannot load offline.
- **Waits.** Almost every wait is on a concrete condition (an element appears, a text matches). Five calls wait a fixed time, in three checks, and each checks that something does *not* happen, so a busy machine can make them pass wrongly but not fail:
  - the cap check (`checkCapValidation`): 60 ms between up-arrow presses, then 400 ms, to show the "Lowered to" note stays put;
  - the level cap check (`checkJobLevelCap`): 400 ms, longer than the save debounce, to show a level above the job's cap is not saved;
  - the sheet's cap check (`checkSheetCap`): the same up-arrow presses and 400 ms on the sheet page's cap field.

  A Fill that must still be running (the edit lock, focus after Cancel) runs on a worker stand-in that never answers (`HOLD_SOLVE`); Cancel clicks Fill and Cancel in one task, so the search cannot have answered between them. The "cancelled search never ran" checks wait for the frames a Fill on the page's thread waits for (`afterFrames`), not for a time.

  A search runs only on Fill: the smoke test presses it (`runFill`) and waits for that search's `fill` timing mark.
- **Screenshots.** Taken of:
  - the gear browser, the Substat tiers sub-tab, the level sync check, the 960 px walk and its last job's set page, a sheet's page, the Copy sheet dialog, a set page after a Fill, and the Fill settings dialog;
  - in `checkThemes`, the five screens in dark and light (`theme-<screen>-<scheme>.png`);
  - in `checkViewports`, each screen at each window (`viewport-<width>x<height>-<screen>.png`, geometry asserted, no pixel baselines);
  - a Fill with food, the edit lock, the piece menu and the overmeld odds;
  - one per failed step.

  All are written to the smoke test's output folder (gitignored).
- **Known failures.** A finding the look checks make that the page has not fixed yet is a named line printed before `no errors` (`KNOWN FAILURE (contrast, ...)`, `KNOWN FAILURE (layout, ...)`), from `KNOWN_LOW_CONTRAST` and `KNOWN_MENU_OVERFLOW` in `smoke.mjs`. It does not fail the run, and the run fails when a listed finding stops happening, so the list is emptied as the page is fixed. Today: none.
- **Success** prints `no errors`.

## 3. Commands

Which command runs which check? Run from the repository root.

![npm run check runs lint (Biome, with a format check), build (the one HTML page), test (unit tests in Node) and smoke (the built page in Chromium), in that order; it needs no Python and is the bar for calling a change done. npm run check:all runs check, then lint:py (Ruff) and test:py (generator tests in Python); run it when touching scripts/data/ or after data:update. Both stop at the first failure. The perf commands, the Target GCD sweep, the checks against ffxiv-gearing and xivgear and the screenshot scripts are run by hand and are never part of check.](../diagrams/testing-commands.svg)

Every command, with what it runs and how long it takes, is listed once, in [README, Develop](../../README.md#develop). `npm run check` took about 45 s on a 12-thread machine on 2026-10-19 (about 1 min when the machine is busy): lint 4 s, build 2 s, unit tests 19 s, smoke 20 to 40 s. The notes below say what the test commands check.

Notes on the pass/fail commands:

- **`npm test`** runs the unit tests with Node's built-in test runner, which runs files in parallel, so the slowest file sets the time.
- **`npm run test:full`** adds `tests/full/`: 360 random cases of tier ranking against its reference, split in five files so they run at the same time. They take about 22 s on their own, most of it one case (case 92 of seed 33818, a Paladin pool whose reference tries millions of gear sets). `npm test` keeps the first 20 of the Target GCD cases, so every case runs in `test:full` and the first 20 in both.
- **`npm run test:py`** runs the generator tests with Python `unittest`. The Python npm scripts (`test:py`, `lint:py`, `format:py`, `data:update`) start Python through `scripts/py.mjs`, which runs `python3` or `python`, whichever exists, so they work on Windows, macOS and Linux.
- **`npm run test:smoke`** needs the page built first; it is a Node script (Playwright) that takes its expected values from `src/core` directly (computed in a worker thread, `tests/e2e/smoke-core.mjs`). Its steps run in groups, in parallel, each group on a fresh page with its own saved state (about 20 s on a 12-thread machine on 2026-10-19, up to about 55 s when the machine is busy). Options: `SMOKE_TRACE=1` prints each step's time, `SMOKE_PAGE` tests another page file, `SMOKE_ONLY=<pattern>` runs only the groups with a step whose name matches.
- **`npm run lint`** lints, then reports formatting differences without changing files; a lint warning fails it, as an error does. `scripts/validate/xivgear/xg_sync_test.ts` is left out of the lint (it runs inside xivgear's own test runner against their types; the reason is in `biome.jsonc`) but is still format-checked. `lint:py` does the same with Ruff.
- **`npm run check`** and **`npm run check:all`** run the steps in the diagram above; `check` is the bar for calling a change done. For UI changes, also open the built page and look at it at the viewports in section 3.1 below (five, from the 960 px floor to 2560 x 1440).

Notes on the measurements and checks run by hand (none is part of `npm run check`):

- **The `perf` commands** are performance measurements, not pass/fail tests. They write one JSON row per run to `scripts/perf/out/` (gitignored) and print a summary against the budgets. The results are in the [performance log](perf-log.md), and the current timings in [optimizer.md, section 8](optimizer.md#current-timings).
  - `db-parse.mjs` times how long Chromium takes to read and run the inlined item database at page open (results in [perf-log.md, section 3.2](perf-log.md#32-the-inlined-database-at-page-open)).
  - Two more scripts there are run by hand. `split.mjs` times each step of one run. `compare.mjs` checks that a faster version gives exactly the results of a fresh copy of `src/` from the old commit. You make that copy yourself, outside the repo or under the gitignored `scripts/perf/out/`. How to run it, the budgets and what to do when one fails are in [optimizer.md, section 8](optimizer.md#what-the-perf-scripts-measure).
  - Every perf script takes its options the same way, `--name value` or a bare `--flag` (`scripts/perf/args.mjs`).
- **`target-gcd-sweep.mjs`** runs Target GCD (a wanted global cooldown, which the optimizer turns into a speed range) over a large grid:
  - every job;
  - every sync setting of the other scripts but cap 795 (it syncs nothing, so it repeats no sync);
  - the page's default "Gear from" boxes;
  - every goal and tiebreak order;
  - six GCDs, from the no-speed one to the fastest the gear reaches;
  - both modes;
  - food off and "Best for the goal".

  It checks itself two ways. On every fourth run with food off, it searches the same candidates with the plain search (no speed tables, groups or memo) and compares. For each job and sync setting, it also checks four small pools against the brute force. A difference is counted as a mismatch, and the results are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).
- **The check against ffxiv-gearing** (`scripts/validate/gearing/`): `fetch.py` clones and builds that tool at a pinned commit. `run.mjs` (Node, Playwright) compares every synced stat with it in a browser (about 6 minutes; `--site live` against its published page) and fails on a difference with no known cause. Results in [validation.md, section 9](../mechanics/validation.md#9-against-another-tool-ffxiv-gearing).
- **The check against xivgear** (`scripts/validate/xivgear/`), run the same way: `fetch.py` clones xivgear at a pinned commit and installs its dependencies (with install scripts off). `run.py` runs our bundled core inside xivgear's own test runner and compares every synced stat, job and sync setting (about 30 minutes, one process per job and level). Their item data is cached in `data/xivgear-cache`, so later runs are offline. Their two known sync faults are corrected on their side before comparing, and the run fails on any other difference with no known cause. Results in [validation.md, section 10](../mechanics/validation.md#10-against-another-tool-xivgear).
- **Screenshots before and after a change** (`scripts/shots/`):
  - *What it takes:* `npm run shots -- --out <dir>` takes a full-page PNG of every view of the page, at 1440 and 960 px, light and dark: 104 shots in about 80 s. The 26 views are the optimizer empty, with a result, its menus, a picked piece and meal, a stale result, Blue Mage; the browser filtered, sorted and with its menus; each How the math works sub-tab.
  - *Which page:* it builds its own copy of the page from `src/` into `<dir>/page.html`, as the live page looks (no DEV badge or footer branch line to differ between branches), and leaves `dist/index.html` alone. Run it on the base and on the change, into two folders. `--page` shoots another page file instead, `--only` takes a pattern on view names.
  - *Comparing:* `npm run shots:compare -- <dirA> <dirB>` compares same-named PNGs pixel by pixel and lists each differing one with its pixel count, bounding box and largest channel difference; it exits 1 when a pixel differs by more than `--threshold` (default 2 of 255).
  - *Noise:* two runs of the same page gave identical bytes for 94 of 104 shots and differed by at most 1/255 on a few antialiased edges in the rest (2026-10-19), so the default threshold reports no difference.
  - *Failure:* `shots` itself exits 1 on a page error or a sideways scroll.

Running a subset:

- one unit test file: `node --test tests/unit/core-formulas.sync-clamp.test.js`
- unit tests by name: `node --test --test-name-pattern="brute force" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** The requirements (Node, Playwright's Chromium, Python for the generator tests, Ruff and the data pipeline, and the Python versions CI runs) are in the [root README](../../README.md#requirements); Playwright's Chromium serves the smoke test and `perf:browser`.

### 3.1 Viewports to look at for UI changes

Name a test window by the **CSS screen** it stands for (the physical resolution divided by the operating system's display scaling), the numbers a display setting shows. The page gets less than the screen: about 15 px less width (the vertical scrollbar) and about 155 px less height. The height is the taskbar (40 px, from `screen.height - screen.availHeight` on the owner's Windows 10 machine) and the browser tabs, address bar and bookmarks bar (115 px, from `outerHeight - innerHeight`, one maximised browser window, 2026-11-07). The 15 px of width is an estimate. The heights are one machine's measurement, not a survey.

| # | CSS screen | Test viewport (width x height) | What it covers |
| --- | --- | --- | --- |
| 1 | 960 floor | 960 x 700 | The minimum width. Not a real screen; the layout is tightest here (item names wrap to two lines) |
| 2 | 1280 x 720 | about 1265 x 565 | The shortest realistic window. A 1080p laptop at 150%, a 1440p panel at 200%, a 4K panel at 300% |
| 3 | 1536 x 864 | about 1521 x 709 | A 1080p laptop at 125% (Windows' recommended scale for 15.6 inch), a 4K laptop at 250% |
| 4 | 1920 x 1080 | about 1905 x 925 | A 1080p monitor at 100% (about half of Steam users in October 2026), a 4K laptop at 200% |
| 5 | 2560 x 1440 | about 2545 x 1285 | A 1440p monitor at 100%, a 4K monitor at 150%: the margins of a capped container |

Why these: the layouts measured so far do not change between about 1100 px and 2545 px except for the margins. The measurements were two prototype layouts of the planned gear sheet page, 14 views and the piece and food menus, 15 window widths from 960 to 2545 px (2026-11-06). Item names wrap only below about 1100 px. So the widths above 1100 px differ mainly in height, and the short window (1265 x 565) is the stress case for a sticky header and tall menus.

Automated and manual. `checkViewports` (smoke test) visits all five windows and asserts the geometry, with a screenshot per window and screen:

- no sideways scroll;
- the container at the 1280 px cap (and the page's width less the 16 px gutter per side, the body's padding, below it) and centered;
- menus inside the window and below the sticky header;
- the header and column names on top after scrolling to the bottom;
- Tab reaching Fill, Apply and Discard.

`checkThemes` covers contrast in both color schemes. Still by looking:

- that a screen reads well (spacing, wrapping, a menu's look, the light scheme beyond contrast);
- a rule that switches at a width (`checkBreakpoints` covers 1099, 1100, 1299 and 1301);
- real devices and display scaling.

Not settled:

- the shares of Windows scales above 150% and of 4K laptops are unknown (no public data was found);
- the heights above rest on the estimate in the first paragraph;
- a window narrower than 960 px is not supported, and only needs a check that content stays reachable by scrolling.

A rule that switches at a width, such as the `@media (min-width: 1300px)` rule on `.twopanel` in `src/styles.css`, needs its own pair of windows one pixel either side (1299 and 1301, with the scrollbar counted). A container that stops growing at a maximum width does not.

## 4. Conventions

What makes a test here worth having? Six rules, each with the reason behind it.

**Expected values come from outside the code under test.** Prefer, in this order:

1. published numbers (the Wiki's item level 475 sync caps, AkhMorning's GCD tier tables);
2. real items from the game data (the item level 130 healer head piece, real-gear pools);
3. independent references written in the test (the brute force; caps derived from the raw `ItemLevel` rows and slot shares rather than by the function under test).

Cite the source (a URL for a published number) in a comment next to the value. A number copied from the tool's own output only proves the tool still agrees with itself. If a value has no outside source, say so in the test name or a comment.

**Pick real items by their properties, not their names.** A test asks for what it needs and finds it in the database. Examples are a head piece at item level 130 with Spell Speed above the cap, a Unique ring, and every item a job can equip in a window. The test then states its requirement, and does not depend on one gear set.

**Reproduce a reported bug before fixing it.** When the owner reports a bug (often from a screenshot), first write a unit test or smoke check that fails on the current code, then fix, and keep the test as a regression check. This is the hand-made counterpart of mutation testing: the buggy code is a known mutant, and the test must kill it. The ring pruning and tiebreak weight regressions in the exhaustive tests fail on the code before those fixes ([history.md](../history.md)), and 8 of the original 14 saved-state tests failed on the old restore code.

**Check the optimizer against exhaustive search.** The optimizer's pruning and bounds are where subtle bugs hide: the ring pruning bug returned a worse ring pair on real gear while every fixed-value test passed ([history.md](../history.md#results-of-the-tool)). So:

- The shared brute force (section 2.1) tries every legal gear set under the same rules; real-gear, constraint and view tests compare against it rather than pinning totals, and random pools come from fixed seeds so a failure can be reproduced.
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
- **Real-gear pool totals** (optimizer, constraints, views, smoke) follow the data, because the tests compare with the brute force. A pool check can fail if a patch adds gear to a window (more than 200,000 gear sets, or a slot left with a single item); choose a new window rather than loosening the check.
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
| View test state, small real-gear pools and a Fill's solve | `tests/unit/helpers/views.js` (`makeApp`, `solveOf`, `windowPool`) |
| Saved sheets of real items | `tests/unit/helpers/sheet-fixtures.js` (`sageSet`, `warSet`, `sheetOf`, `fakeStorage`) |
| View builders tested without the browser | `src/ui/views/` |
| Accuracy check against real items and the Wiki | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| View test setup | `tests/unit/helpers/views.js` (`makeApp`, `WINDOW`, `windowPool`, `uniqueRingPool`) |
| Smoke test, its steps and its screenshots | `tests/e2e/smoke.mjs` (a section per tab, `GROUPS`, `SHARED_SETUP`, `runGroup`, `main`), `tests/e2e/out/` (gitignored) |
| The smoke test's look checks | `tests/e2e/smoke-visual.mjs` (the helpers, the contrast arithmetic, the token reader and the in-page probes) |
| Before-and-after screenshots | `scripts/shots/shots.mjs` (`VIEWS`), `scripts/shots/compare.mjs` |
| Commands | `package.json` (`test`, `test:py`, `test:smoke`, `lint`, `lint:py`, `format`, `check`, `check:all`) |
| Lint and format configuration | `biome.jsonc`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
