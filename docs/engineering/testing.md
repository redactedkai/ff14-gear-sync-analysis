# Testing

How the project is tested: the three test layers, what each file covers, the commands, the conventions every test follows, and which expected numbers are allowed to change after a game patch. The evidence the tests encode (real items, Wiki caps, speed examples) is collected in [validation.md](../mechanics/validation.md). How the parts fit together is in [architecture.md](architecture.md).

## 1. Test layers

| Layer | Runs on | Count |
| --- | --- | --- |
| Unit tests (Node) | core logic, view builders, saved state, real game data | 179 tests in 22 files |
| Generator tests (Python) | the data generators, on small test files | 65 tests |
| Smoke test (browser) | the built page in headless Chromium | one script, 15 groups of checks |

Notes:

- **Unit tests** import the core logic, the page's view builders and the saved-state repair directly, with the real generated game data. They check formulas, sync, speed, item queries, optimizer correctness on real gear, what each tab shows, data format, provenance and saved state. A shared brute-force helper serves the optimizer tests (section 2.1).
- **Generator tests** run the item level, item database and job icon generators and the gear category rules on small test CSV and icon files. They check row selection, slot detection, multi-slot gear (a cloak kept on its own slot code, an unsupported combination left out), stat placement, the HQ rule, job mask, sort order, budget table and level data, stat factor kind and table, gear categories and source flags, schema drift, and job icon embedding and numbering.
- **Smoke test** opens the built page from disk. It checks known numbers on screen, optimizer totals equal to the core's on real gear, no JavaScript errors, no stray "undefined" / "NaN" / "null" text, and no sideways scroll at 400 px. The 15 groups are the defaults check plus 14 steps (section 2, *Smoke test*).

The unit tests need no browser because the core never touches the page (see [architecture.md, section 1](architecture.md#1-the-system-at-a-glance)), and the page's view builders take plain state objects. They load the full item database, so they check the model against all 17,281 real pieces, not just hand-made examples.

## 2. What each file covers

### Unit tests

| File | Covers |
| --- | --- |
| formulas | caps at 123, a piece built from the formula |
| sync | the clamp rule at its edges |
| sync-cap-order | rounding order of sync caps |
| caps-real-items | caps at 123 from real pieces |
| level-sync | level sync and its triggers |
| speed | GCD tiers and DoT scalars |
| tiers | substat tiers |
| validation | Wiki caps, accuracy per band, special lines |
| items | gear filtering, row conversion, item fields |
| multi-slot | cloaks and White Mage shields |
| stat-factor | per-item stat factors |
| meld | materia melds on real items |
| optimizer | real-gear pools, Unique rings, ring-pair bound |
| optimizer-constraints | speed minimum, maximum and range |
| optimizer-exhaustive | random pools, regressions, policies |
| views | what each tab shows |
| sync-caps-view | the special substat column of Sync limits |
| piece-subs | Piece stats substat ranks |
| data-format | generated data shape |
| provenance | source record and footer |
| state | restoring saved state |
| store | job switch and reset |

Notes on the files:

- **formulas.** Substat and main-stat caps at item level 123 for each slot type, as listed in [math.md, caps at item level 123](../mechanics/math.md#caps-at-item-level-123). An item level 130 healer head piece with Spell Speed, Piety and Direct Hit built from the formula gives Mind 33, Vitality 32 and substats 31 / 22 / 6, the stats of a real piece. Paladin's one-handed weapon plus shield.
- **sync.** The clamp rule on a real item level 130 healer head piece chosen by its properties (Spell Speed above the head cap at 123, another substat below it). At the cap and below it the piece is untouched. One item level above, every stat becomes the smaller of its own value and the head cap at 123 (Spell Speed 29, main stat 30), and likewise at cap 129. The caps are derived in the test from `ItemLevel` rows 123 and 129 and the 85 ‰ head share, not by the function under test (healer Vitality with the 90% factor first: 31 at 129, where the item order gives 32). Also: a missing item level counts as above the cap; a job without a special substat; missing stats count as 0; Paladin weapon and shield caps at item level 475 against the Wiki.
- **sync-cap-order.** The rounding order of sync caps (factor first, floors, one rounding) against every second-hand in-game value from xivgear's tests listed in [validation.md, section 8](../mechanics/validation.md#8-open-question-in-game-captures) (a Blue Mage and a Red Mage head, Azeyma's Earrings for Ninja and Sage, Menphina's Earring for Sage), on the real items where the note names one. With a factor of 100 the cap equals the item-stat value at every item level 1 to 795 for every slot share and the off-hand, for one job per role. Off-hand caps are the two-handed minus the one-handed cap.
- **caps-real-items.** The sync caps at item level 123 for every slot, without calling the cap function. The game has no gear at item level 123, so the test asserts that. It then checks every real piece at item level 120 and 125 (chosen by item level, slot and having a main stat and a substat) against round(`ItemLevel` row × `BaseParam` share) for its main stat and largest substat; one documented exception, the item level 120 shields, 13 instead of 14. It derives the 123 caps from row 123 and the slot shares typed into the test and checks the page's caps for Sage, Warrior and Paladin against them. Finally, the ten armor and accessory caps sum to 296, a 2.22 s GCD at level 50, which the generic-piece optimizer reaches for Sage and Warrior.
- **level-sync.** `ParamGrow.ItemLevelSync` at each level cap (50 → 130, ..., 90 → 660, 100 → 690) and levels 1 to 49 mapped to themselves. The sync target for each trigger, both (the item level cap wins, as in a player's Aloalo Island report), neither, and no equip level. No real piece is level-synced at level 100. At level 50 with cap 123, exactly 71 pieces get a new target (130), and a direct clamp to the 130 caps lowers none of their stats for any job. A level 90 roulette caps every level 100 head piece at item level 780 or more at the item level 660 head values, derived from `ItemLevel` row 660 and the 85 ‰ share (Mind 248, Vitality 249, substats 184). The optimizer equals the brute force at level 90 on real gear at item level 663 to 666 (Sage, Warrior, Paladin), with and without an item level cap. The Sync limits, Piece stats, gear browser and optimizer views at level 90 with item level sync off.
- **speed.** GCD tier starts, the value one below each, and DoT scalars at levels 50, 90 and 100, read from AkhMorning's published tier tables (for example level 100: 22 → 2.49 s, 107 → 2.48 s, 193 → 2.47 s; level 50: 150 → 2.35 s, 349 → 2.16 s); 2.50 s with no gear speed; the list of level 50 tier starts.
- **tiers.** Effects worked by hand from AkhMorning's formulas and `ParamGrow` (Critical Hit 2,000 at level 100: 19.3%, tier 1,988 to 2,002; Direct Hit 1,000: 19.7%; Determination 1,000: +5.0%; Tenacity and Piety; level 50: Critical Hit 344 gives 25.1%; speed 86: 2.49 s from 22 to 107). No tiers for the main stat and Vitality. The start and next of every step checked by stepping at levels 50 to 100.
- **validation.** The formula reproduces the Wiki's item level 475 sync caps. Accuracy against every real piece per item level band: at least 98.5% exact and 98.5% within ±1 in each band. The highest real item level lies inside the budget table. Also the special cases of the model: relic weapons with two full substats, two main stats, and off-hands; the fixed 20% Direct Hit line on Mind-only gear; the 25% line on green, HQ-able healer pieces with three substats; Atma and Animus weapons; all-jobs accessories.
- **items.** Gear filtering per job, with items picked by their properties (slot, job bits, stats), never by name: weapon mode (Paladin sees one-handed weapons and shields only, Warrior two-handed only), job mask (a Warrior never sees healer gear), main-stat filter, Main Attribute and Secondary Attribute, item level and equip level bounds, name search (case and surrounding spaces ignored), slot filter. Converting a database row to the job's stats for a healer and a tank. Copies (a Unique ring once, any other ring twice). The HQ flag, source flags, expansion, meld slots and overmelding of real pieces, and the materia table.
- **multi-slot.** The Vermilion Cloaks and the White Mage wand and shields: real stats equal the formula at their own slot share. White Mage can browse its wand and shield, Sage has no off-hand. Optimizer equals the brute force on pools with them, synced and unsynced. A cloak in a full pool keeps the search small.
- **stat-factor.** The per-item stat factor read from the game files. For all 22 jobs, every piece of the job's own kind has the job's factors (main stat 1, Vitality 0.9 for Intelligence and Mind). The only pieces that differ are kind 0: the 13 four-main-stat pieces and the Main Attribute pieces, and they are reproduced. Occult "of Magic" / "of Blood" accessories (Vitality 307 / 341) and Alexandrian Earrings of Casting reproduced. A synced Field Commander's Coat is capped at its own factors (main stat 43, Vitality 45 at 123) in the optimizer and the gear browser, a hand-made copy at the job's (48).
- **meld.** The best stones at each item level gate (159/160 to 689/690). Slot layouts (Kirin's Osode of Fending 5, Courtly Lover's Pendulums 2 + overmeld, Courtly Lover's Earrings of Healing 1 + overmeld, a 0-slot shield, a hand-made piece). Kirin's Osode caps 110 and Determination 77 → 110 with three VI. The greedy counterexample (Courtly Lover's Earrings, Crit > Det: +61 / +90, greedy +54). A main stat target melds nothing. Melds are kept at the cap and lost above it or under level sync. Melds with a speed range throw. Every meld line of every meldable Sage, Warrior and Black Mage piece is a legal melding order.
- **optimizer.** Seven real-gear pools, one or two jobs per role (section 2.1): for every substat as the target, synced to 123 and unsynced, the optimizer's totals for the target, main stat and Vitality equal the brute force. A Unique-ring pool (item level 130 Sage gear whose only ring is Unique): the ring is worn once, the same ring with two copies is worn twice, and sync lowers the best total. Generic item level 475 gear synced to 123 gives 296 Spell Speed and a 2.22 s GCD at level 50. The ring-pair bound, its effect on a full Sage pool at cap 660, and copies counted once per item in pruning.
- **optimizer-constraints.** Warrior real gear at item level 130 to 135, equip level 50 or below (32 items, 98,304 loadouts), every answer against the brute force: no constraint (Skill Speed 87); a binding speed minimum (best Tenacity 341, with Skill Speed 17, falls to 317 with Skill Speed at least 27); a binding speed maximum (Skill Speed at most 16: Tenacity 317); three speed ranges (67 to 77: Tenacity 262; 47 to 57: 293; 82 to 87: 238); infeasible cases (Skill Speed above the most any loadout reaches, or at most -1); node limit truncation; empty pool.
- **optimizer-exhaustive.** The optimizer against the brute force on 400 seeded random pools and 200 pools with very large tiebreak values; with melds, 40 random pools of real pieces against the reference's own enumeration of every stone placement. A speed maximum. Regressions for the ring pruning bug and the score weight limit (see [history.md](../history.md)). A pool too large to rank exactly raises an error. The two engine policies the brute force copies, each stated on a hand-made pool (section 2.1).
- **views.** What each tab shows, computed without the browser: the optimizer view on real Black Mage gear (item level 125 to 135) equals the brute force, synced and unsynced; a single Unique ring fills the first ring slot and leaves the second empty; empty and error views; excluded gear groups leave both gear lists and the search, and the pool line counts them; the sync caps view at 123 (substat total 296, 2.22 s, per-slot caps); the Piece stats on every real item level 130 Sage head piece with three substats (two in the current data: raw values equal the real stats 33 / 32 / 31 / 22 / 6, synced values equal the head caps at 123); with sync off, Piece stats leaves stats as they are; the GCD tier text (level 100, 1,839 speed: tier starts at 1,818, next at 1,904, both tier starts in AkhMorning's level 100 table) and the tier lookup against a step-by-step scan at every level; browse and pool counts.
- **sync-caps-view.** For each job with a special substat, at cap 540 the Sync limits table shows that substat's cap from its own `ItemLevel` column; at cap 123 there is no extra column; a job without a special substat never shows it.
- **piece-subs.** Choosing a substat already used in another rank swaps the two, so no substat ever appears twice. Rank 2 can be cleared; a swap never empties rank 1. An older three-rank list is cut to two.
- **data-format.** The page's job order, stat order and slot table equal the shared format definition. The budget table has one equal-length column per stat. Every database row has the documented shape; the meld fields sit where the format says, and the materia table has one entry per grade. The stat factor table has one row of percents per stat and one column per item kind. The page's slot shares equal the format's. Every job has an item for each active slot. The job picker has every job once, with its icon. Details in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).
- **provenance.** The generated data names the datamining repository, a full commit id and a date; both generated files carry the same commit; the footer text is short, and empty when the source is unknown.
- **state.** Missing or non-object input, a full valid save round-trips unchanged, unknown job (no job chosen), wrong types and out-of-range values per field, old tab names, unusable pool items dropped and usable ones repaired, hypothetical and hand-entered pieces from the removed Advanced section dropped, restored item ids reserved, a save from another role.
- **store.** The page's shared store driven without the browser: switching to another job, even within the same role, clears the pool and the job-specific settings and keeps the sync cap; choosing the current job again changes nothing; reset to defaults restores every saved setting, chooses no job and empties the pool, but keeps the open tab.

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

The tests assert equality with the brute force for every substat, not these totals, so they hold if a patch changes the gear in a window. The Unique-ring pool has 17 items, all item level 130; the test checks that the result with two copies allowed is the result with the ring worn once plus the ring's Spell Speed. The totals of that pool, and what all these comparisons show alongside the probes outside the tests, are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

### Generator tests

One Python file with five groups: the item database, the item level data, the job icons, the gear categories, and schema drift. They run on the CSV files in the test fixtures folder: real sheet headers, real slot and job category rows, made-up item rows, and a synthetic item level sheet in which reading the wrong column gives a visibly wrong number.

- **Item database**: row shape, slot detection (two-handed vs one-handed and every slot), excluded slots (belt, soul crystal), multi-slot gear (a body piece that also covers the head gets slot code 12; legs that also cover the feet are left out and listed), stat placement, the HQ bonus only when the item can be HQ, the item level floor of 100, excluded jobs (base class only, crafter only), job mask bits, the Unique flag, equip level, items with no stats or no name, sort order, stat factor kind, meld fields, rarity, source flags.
- **Item level data**: every stat column, levels 1 to 100, the stat factor table, and the errors for a missing level and for item level ids with a gap.
- **Job icons**: icon numbering, embedding, and the errors for a missing or wrong-sized icon.
- **Gear categories**: the code rules, the source masks, Savage limited to the current expansion, shared shop currencies, overrides, and the errors for an unknown code or a changed override id.
- **Schema drift**: renamed or missing columns, changed values, and the command-line exit status.

The fixtures and the full list of rules tested are in [data-pipeline.md, section 10](data-pipeline.md#10-how-the-pipeline-is-tested).

### Smoke test

The smoke test opens the built page from a `file://` address in headless Chromium at 1000 × 900 and checks:

- the page title and the defaults: no job chosen (the tabs ask for one), level 100, sync off with an empty and disabled cap field; with sync on, the cap field asks for a cap and rejects an item level out of range;
- **Piece stats**: an item level 130 head piece with Spell Speed and Piety for Sage shows the stats of a real item level 130 healer head piece (Mind 33, Vitality 32, Spell Speed 31, Piety 22) and its synced values (Mind 30, Spell Speed 29); there is no third substat picker; the budget chart renders;
- **Excluded groups**: in a real-gear window, ticking Crafted in the Gear pool tab lowers the optimizer total to the core's without crafted gear and the pool line counts the excluded pieces; nothing is excluded by default; the choice is saved;
- **Materia**: Sage, item level 300 to 345, no sync, Critical Hit: the Materia switch is on by default and the total equals the core's with melds (each melded pick shows its stones, and the tier rows show the effects); switched off, the total equals the core's without melds and the meld lines disappear; the choice is saved;
- **Real-gear check panel**: every Wiki item level 475 cap row reads "match", and the accuracy table is not empty;
- **Gear pool and Gear optimizer**, for a healer and a tank: the browser is set to a real-gear window (Sage, item level 120 to 130; Warrior, 130 to 135; equip level 50 or below), its match count equals the core's (33 and 32 items), "Add all" adds them, and the page's best Spell or Skill Speed, synced to 123 and unsynced, equals the core's result for the same rows (currently Sage 247 / 255, Warrior 85 / 87). The expected values are computed by running the core optimizer and the brute force in Node, after checking that those two agree;
- **Job switch with a pool**: switching from Warrior to Gunbreaker (same role) shows the warning; Cancel keeps the job and the pool, Switch and clear empties it;
- **Ring copies**: in a rings-only Sage pool (item level 140 to 150, equip level 60) whose best pair is one non-Unique ring worn twice, that ring is marked ×2 and the synced Spell Speed total equals the core optimizer's and the brute force's (currently 46);
- **Expansion filter**: every expansion is ticked by default; with only Endwalker ticked, the browser keeps gear of its equip level band (81 to 90) and the button names it; the choice is saved; the dropdown is hidden in the My pool view;
- **Reload**: a non-default state (Dragoon, cap 130, level 60, sync off, a real-gear pool, optimizer target and tiebreaks, browse filter, Piece stats slot and item level, Gear optimizer tab open) is saved (the test waits for the debounced save to reach `localStorage`), and after a reload every input, the open tab, the pool row count and the optimizer total are the same;
- **Corrupted storage**: invalid JSON, a JSON array, wrong-typed fields and a pool of broken items in the saved state each load as the defaults (no job, sync off, empty cap, level 100; a saved valid job with a broken pool keeps the job with an empty pool) with no JavaScript error and no "undefined" / "NaN" / "null" text;
- **Reset to defaults**: with gear in the pool it asks first; Cancel keeps everything, confirming restores every default and empties the pool;
- **Weapon mode**: Paladin's slot filter offers an off-hand, Warrior's does not;
- **Level sync**: Sage at synced level 90 with item level sync off, at 400 px: level 100 head pieces in the browser show Mind capped at 248 (the item level 660 head value), the optimizer total is marked synced, Sync limits shows the item level 660 caps (head substat 184); no bad text and no horizontal scroll on any tab;
- **Every tab for six jobs** (Sage, Warrior, Paladin, Black Mage, Ninja, Dragoon), at 400 px width: the sync caps per slot at 123, the off-hand row only for Paladin, no "undefined", "NaN" or "null" text anywhere, and no horizontal page scroll.

Any uncaught page error or console error fails the test. Network errors are ignored, since the web fonts cannot load offline. Every wait is on a concrete condition (an element appears, a text matches); there are no fixed sleeps. Screenshots of the optimizer (one per job), the pool, the level sync check and the phone layout, plus one per failed step, are written to the smoke test's output folder (gitignored). On success it prints `no errors`.

## 3. Commands

Run from the repository root.

| Command | What it runs |
| --- | --- |
| `npm test` | Unit tests, then generator tests |
| `npm run smoke` | Browser smoke test |
| `npm run lint` | Biome and Ruff, no file changes |
| `npm run format` | Rewrite files with Biome and Ruff |
| `npm run check` | Lint, build, tests, smoke test |

Notes:

- **`npm test`** runs the unit tests with Node's built-in test runner, then the generator tests with Python `unittest`.
- **`npm run smoke`** needs the page built first, and Node on the path for its expected values.
- **`npm run lint`** lints, then reports formatting differences without changing files.
- **`npm run check`** runs lint (with format check), build, unit and generator tests and the smoke test, in that order, and stops at the first failure. It is the bar for calling a change done. For UI changes, also open the built page and look at it at desktop width and at about 400 px.

Running a subset:

- one unit test file: `node --test tests/unit/sync.test.js`
- unit tests by name: `node --test --test-name-pattern="brute force" "tests/unit/*.test.js"`
- generator tests by name: `python -m unittest discover -s tests/data -p "test_*.py" -k hq`

**Setup.** Node 22 or later and `npm install`. For the Python parts, Python 3.9 or later and `python -m pip install -r requirements-dev.txt` (pinned Playwright and Ruff), then once `python -m playwright install chromium`.

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
| View builders tested without the browser | `src/ui/views/` |
| Accuracy check shared by the page and the tests | `src/core/validation.js` (`bandAccuracy`, `wikiChecks`) |
| Generator tests and fixtures | `tests/data/test_generators.py`, `tests/data/fixtures/` |
| Smoke test, its steps and its screenshots | `tests/e2e/smoke.py` (`main` and its `steps` list, `check_real_gear_optimizer`, `check_piece_lab`), `tests/e2e/out/` (gitignored) |
| Commands | `package.json` (`test`, `smoke`, `lint`, `format`, `check`) |
| Lint and format configuration | `biome.json`, `pyproject.toml` |
| Pinned Python tools | `requirements-dev.txt` |
