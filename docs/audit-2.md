# Engineering audit 2

- **Date:** 2026-10-11
- **Commit audited:** `ee59287` (branch `alpine-migration`), checked out as a detached, read-only worktree so that doc edits happening in the main tree at the same time could not affect it.
- **Method:** I read every source, script, test and doc file. I ran the full check, regenerated the data from the local CSVs (datamining `d9582a6`), and wrote throwaway Node and Python probes in a temp directory, none of them in the repo. The probes covered: the store and saved state driven from Node; an optimizer fuzz against my own brute force; timings; and generator runs on edited fixtures. Accessibility and CI were out of scope.
- **Command results** (in the snapshot, after `npm ci`):

| Command | Result |
| --- | --- |
| `npm ci` | OK, 0 vulnerabilities |
| `npm run lint` | Biome: 40 files, no issues. Ruff: all checks passed |
| `npm run format:check` | clean (Biome 40 files, Ruff 16 files) |
| `npm run build` | `dist/index.html` 1,568,405 bytes |
| `npm test` | 67 / 67 pass (~0.7 s) |
| `npm run test:py` | 17 / 17 OK |
| `npm run smoke` | `no errors` |
| Regenerate `items.js` and `item-level.js` from the CSVs into a temp dir | byte-identical to the committed files |

## Summary

Resolution columns updated 2026-10-11 after fixes on `alpine-migration` (✅ fixed and tested, ❌ open, ➡️ merged into another finding). The rest of this report describes commit `ee59287` as audited.

| ID | Finding | Severity | Area | Evidence | Resolved? | Resolution |
| --- | --- | --- | --- | --- | :---: | --- |
| A1 | Job changes handle the pool crudely: within a role, gear the new job can't wear is kept and the optimizer picks it; across roles, the whole pool is deleted with no undo (merged with A11) | High | Correctness | MNK→DRG: 6 of the 11 recommended pieces can't be worn by DRG | ✅ | Fixed (owner's choice): switching to any other job clears the pool and job-specific settings, after a warning with Switch and clear / Cancel when the pool is not empty. Tested in `tests/unit/store.test.js` and the smoke test |
| A2 | Hand-entered pieces with item level blank, 0 or 796–920 are accepted, then silently deleted on reload | Medium | Correctness / state | Added at ilvl 0, 0, 850, 920 → after restore: `[]` | ✅ | Resolved by removing the feature: the Advanced section (hypothetical and hand-entered pieces) is gone; old saves drop such pieces on reload |
| A3 | GCD tier text is wrong above 1,200 gear speed | Medium | Correctness | Lv100 unsynced, 1839 SpS: "tier starts at 1134" (real: 1818, next 1904) | ✅ | Fixed: current and next tier computed by binary search at any speed (`gcdTierAt`); tested at level 100 / 1,839 and against a step-by-step scan at all levels |
| A4 | Pure view builders can't be loaded in Node, so none of the page's computed output is unit-tested | Medium | Testing / architecture | Importing `ui/components/*.js` throws `MutationObserver is not defined` | ✅ | Fixed: view builders moved to `src/ui/views/` (no Alpine import); `tests/unit/views.test.js` covers every tab |
| A5 | Optimizer errors are not caught in the UI; the old result stays on screen | Low | Correctness / UI | `makeScorer` throws; `optimizerView` and `debouncedEffect` have no try/catch | ✅ | Fixed: optimizer and ceiling views catch errors and show them (hand entry, the only way to reach the error, has since been removed) |
| A6 | Average item level is coloured good/bad against the sync cap, not the requirement the user set | Low | Correctness / UI | `avgOk: res.avgIlvl >= app.cap` | ✅ | Fixed: coloured against the user's requirement, uncoloured when it is off; the requirement is shown next to the value |
| A7 | Ceiling table can be truncated without saying so | Low | Correctness / UI | `ceilingView` ignores `r.truncated` | ✅ | Fixed: truncated ceiling cells show "≥ value" with a footnote; tested on the 191,023-node NIN case |
| A8 | Gear that occupies two slots is treated as one slot | Low | Data / model | 2 items: Vermilion Cloak of Casting/Healing (Body, blocks Head); BaseParam `ChestHeadPercent` = 220 | ✅ | Fixed: multi-slot gear is left out by the generator and listed when regenerating (2 Vermilion Cloaks); generator test added |
| A9 | Duplicate substat choices are allowed in Piece lab (hand-entry "Fill" has since been removed) | Low | UI | `setSub` stores without a check; `fill()` with s1 = s2 overwrites the 100% value with the 70% one | ✅ | Fixed: choosing a substat already used in another Piece lab rank swaps the two, so none repeats (`withSub`, `tests/unit/piece-subs.test.js`); the hand-entry half went away with the Advanced section |
| A10 | Sync caps view uses the Critical Hit column for every substat, but Piety/Tenacity differ at 6 rows | Low | Correctness (display) | Cap 540, ring: Piety cap 102, shown 101 | ✅ | Fixed: the view adds a Piety/Tenacity cap column (and uses the larger total in the readout) only when that cap differs; tested in `sync-caps-view.test.js` |
| A11 | Role change empties the pool with no warning or undo (merged into A1) | Low | UX / data loss | `resetForJob` sets `s.pool = []` | ✅ | Fixed with A1: the pool is never cleared without a warning |
| A12 | Weak or self-referential test expectations in a few places | Low | Testing | Lv100 test asserts 2.49 twice; the item level 129 real-item test's expected value comes from `capsFor` | ✅ | Fixed: speed tests assert AkhMorning's published tier tables at levels 50, 90 and 100 (level-50 thresholds now sourced); sync caps derived in the test from `ItemLevel` rows and the 85 ‰ share; the oracle's two policies documented and tested directly |
| A13 | Smoke test gaps: reload persistence, same-role job switch with a pool, hand entry, generator | Low | Testing | `tests/e2e/smoke.py` has no reload and no `#b-add` / `#b-gen` | ✅ | Fixed: smoke test now checks reload persistence (every setting, pool, copies, open tab, optimizer total), copies editing changing the optimizer total, and corrupted saved state loading as defaults; same-role switch and multi-job optimizer were already covered, hand entry and the generator were removed |
| A14 | Generators don't fail when a job column is renamed or missing; BaseParam is fetched but never checked | Low | Data pipeline | Fixture with `SGE`→`SAGE`: exit 0, 0 rows with the SGE bit | ✅ | Fixed: generators check every column they read and exit 1 naming sheet and column; slot shares moved to `item-format.json` and checked against BaseParam; drift and per-job coverage tests added |
| A15 | Stale or wrong statements in docs and comments | Low | Documentation | README `check` row; `findings.md` "tests/core.test.js"; `regen.py` "fetch_data.py"; `data-pipeline.md` "no external references" | ✅ | Fixed: README, CLAUDE.md, regen.py and data-pipeline.md corrected; findings.md replaced by the new docs |
| A16 | Page loads Google Fonts: one third-party request from a "self-contained" `file://` page | Low | Security / privacy | `dist/index.html` has one `https://fonts.googleapis.com/css2` link | ✅ | Resolved by owner decision: Google Fonts stays as an intentional exception, documented in README, CLAUDE.md, architecture.md and data-pipeline.md; the page still works offline |

## Detailed findings

### A1. High: same-role job switch keeps unwearable gear, and the optimizer recommends it

**Where:** `src/ui/store.js:35-44` (`setJob` resets only on a role or weapon-mode change). `src/core/items.js:92-94` (`poolItemFromRow` drops `mask`).

**Evidence** (probe: build a store, add every item at ilvl ≥ 790, switch job, run `optimize`):

```
SGE->WHM: 5 of 23 pool items not wearable by WHM; picks: weapon Grand Champion's Syrinxi
MNK->DRG: 15 of 23 not wearable; picks: weapon Baghnakhs + head/body/hands/legs/feet "of Striking"
NIN->BRD: 15 of 23 not wearable; picks: weapon Knives + head/body/hands/legs/feet "of Scouting"
WAR->GNB: 5 of 23 not wearable; picks: weapon War Axe
```

**Impact:** It is not only a weapon problem. For the Strength-melee and Dexterity profiles it is much larger. MNK/SAM wear Striking armor and DRG/RPR wear Maiming; NIN/VPR wear Scouting and BRD/MCH/DNC wear Aiming. In those cases most of the "best loadout" can't be equipped. Saved pools are also never checked against the restored job.

**Recommendation:** Store `mask` on `game` pool items, persist it, and repair it in `restoreState` for old saves by looking the item up by name. Then either filter non-wearable items out of the optimizer input (and show them dimmed in the pool), or reset the pool on every job change. Filtering keeps the user's work and also fixes restored pools. Add a unit test: MNK→DRG, then no pick lacks the DRG bit.

### A2. Medium: hand-entered items outside 1..795 vanish on reload

**Where:** `src/ui/components/advanced.js:58` uses `clampIlvl(this.ilvl)`, which allows 0..920 (`MAX_ILVL`). The input `#c-ilvl` uses plain `x-model`, so `min`/`max` are not enforced. `src/ui/state.js:70` (`restoreItem`) rejects `ilvl < 1 || ilvl > MAX_REAL` (795).

**Evidence:**

```
added ilvls  [0, 0, 850, 920]     ('' and '0' become 0)
after reload []                   MAX_REAL 795
```

`copies` has the same problem: `+this.copies` is not rounded, so 1.5 is accepted. The search then allows two copies (`u < 1.5`), and the value is reset to 1 on reload.

**Impact:** The pool silently changes between sessions. The item is used while the page is open and is gone after a refresh.

**Recommendation:** Validate hand entry with the same rules as `restoreItem`: clamp or reject item level to 1..`MAX_REAL` using `$num`, and round copies to 1 or 2. Ideally share one validator between `add()` and `restoreItem`. Add a state test in which every item the UI can create survives `restoreState(JSON(persisted()))`.

### A3. Medium: GCD tier text wrong above 1,200 gear speed

**Where:** `src/core/speed.js:30-41` (`gcdTiers` scans 0..1200). It is used in `src/ui/components/optimizer.js:36-38` (`cur` = last tier ≤ speed, `nxt` = first tier above).

**Evidence:** SGE, level 100, sync off, pool of every item at ilvl ≥ 760:

```
spd 1839  gcd 2.28 | "tier starts at 1134" | real tier start 1818, next 1904
```

At level 100 the last tier the scan finds is 1134 (2.36 s), so any build above it shows a tier start that is hundreds of points off and no "next" hint. At level 90 (div 1900) the 1,200 window ends around 2.39 s.

**Impact:** The optimizer shows a wrong number for every level 80 to 100 build, unsynced or synced to a high cap. The GCD value itself is right.

**Recommendation:** Compute the current and next tier straight from the formula (the smallest g where `floor(130g/div)` reaches the needed step) instead of scanning. Or scan up to the actual speed plus a margin. Add a test at level 100 with 1839 speed.

### A4. Medium: the page's computed output has no unit tests, because view builders import Alpine

**Where:** `optimizerView`, `ceilingView`, `syncView`, `pieceView`, `browseView` and `poolView` are pure functions of the store. But they live in `src/ui/components/*.js`, which `import Alpine from 'alpinejs'` at module top. Alpine's CJS build touches `MutationObserver`, `window.Element` and `document.createElement` on load, so Node can't import these modules without DOM shims. I needed four shims to run my probes.

**Impact:** Everything between the core and the screen (tier text, average colour, ceiling, Sync caps totals) is checked only by the smoke test, which checks a few cells. A3, A6, A7 and A10 are all in this layer.

**Recommendation:** Move the view builders into `src/ui/views/*.js` with no Alpine import, keep the `Alpine.data` wrappers thin, and add `tests/unit/views.test.js`. This also fits the brief's "templates only display it" rule.

### A5. Low: optimizer exceptions are swallowed and the stale result stays

**Where:** `src/core/optimizer/candidates.js:39-41` throws when a score could exceed 2^53 (added to keep scores exact). `src/ui/components/optimizer.js:110-111` and `src/ui/helpers.js:36-41` run it in a `setTimeout` with no try/catch.

**Evidence:** The unit test `a pool too large to score exactly throws` confirms the throw (stats around 1e6 with two tiebreaks). It is reachable from hand entry, which has no upper bound on stats. In the UI the exception escapes the timer, and `this.view` keeps the previous pool's loadout.

**Impact:** Unlikely with real data. But when it happens, the page shows a result for a different pool with no message.

**Recommendation:** Wrap `optimizerView`/`ceilingView` and return `{kind: 'error', message}`, rendered like the "infeasible" panel. Bound hand-entered stats (for example ≤ 100,000).

### A6. Low: average item level colour ignores the user's requirement

**Where:** `src/ui/components/optimizer.js:67` (`avgOk: res.avgIlvl >= app.cap`). `optimizer.md` §8 documents this.

**Impact:** The control is labelled "Require average item level ≥ N". With N = 120 and cap 123, a result that meets the requirement can show red. With the requirement off and sync off, the colour still compares against the cap.

**Recommendation:** Compare with `opt.avgMin` when `opt.avg` is on. Otherwise use no colour, or say in the label what it is compared against.

### A7. Low: ceiling table truncation is silent

**Where:** `src/ui/components/optimizer.js:84-87` returns `r.totals[s]` and discards `r.truncated`. `optimizer.md` §7–8 documents a real 191,023-node case above the 150,000 limit.

**Recommendation:** Mark truncated cells (for example "≥ 993*" with a footnote), or raise the ceiling node limit. Single-target runs without constraints are cheap.

### A8. Low: two-slot gear treated as one slot

**Where:** `scripts/data/gen_items.py:44-55` (`slot_of` takes the first column equal to 1 and ignores `-1` blocked slots).

**Evidence:** In the current CSVs, the only combat items (ilvl ≥ 100, with stats) whose category blocks another slot are the 2 Vermilion Cloaks (category 15: Body = 1, Head = −1, ilvl 300). BaseParam has `ChestHeadPercent = 220` for all 12 stats. The page itself quotes the Wiki: "for gear occupying several slots the cap is the sum of those slots" (`src/index.html:153`).

**Impact:** Small today. Under sync these pieces get the body cap (135) instead of 220, and the optimizer can add a head piece next to them. Future gear could be affected.

**Recommendation:** Either emit a "blocks" list and give the item the summed slot share, or exclude these items and assert in the generator that no other multi-slot combat gear appears.

### A9. Low: duplicate substat choices

**Where:** `src/ui/components/piece-lab.js:56` (`setSub`). `src/ui/components/advanced.js:46-50` (`fill`).

**Impact:** Piece lab can show "Spell Speed 100%" and "Spell Speed 70%" as two lines, and `restorePieceSubs` silently rewrites the choice on reload. In hand entry, `fill()` with 1st = 2nd = Spell Speed writes the 70% value into Spell Speed, because the second assignment wins.

**Recommendation:** When a substat already chosen in another box is picked, clear it there (or swap the two), in both places.

### A10. Low: Sync caps view uses the Critical Hit column for "substat cap"

**Where:** `src/ui/components/sync-caps.js:14-15` (`pieceValue(job, 'crit', ...)`).

**Evidence:** The Piety/Tenacity budget columns differ from Critical Hit at rows 540, 565, 570, 590, 595 and 596. The resulting caps differ by 1, for example SGE cap 540, ring: Piety 102 vs shown 101. The optimizer uses the correct column (`statColumn`), so only this table and its "most you can get" total are off.

**Recommendation:** Label the column "Critical Hit / Determination / Direct Hit / speed cap", or add a spec column for tanks and healers.

### A11. Low: role change clears the pool with no undo (merged into A1)

This has the same cause as A1, so it is tracked and fixed there: pool items keep only stats already mapped to the current job, so a job change can either keep them all (A1) or delete them all (this finding).

**Where:** `src/ui/state.js:46`. Persisted 150 ms later by `src/main.js:31-36`.

**Impact:** One mis-click in the job select (for example SGE to SCH is safe, but SGE to WAR is not) loses a hand-built pool for good.

**Recommendation:** Confirm when the pool is not empty, or keep the previous pool per role in the saved state. If A1 is fixed by filtering, role changes could filter too and never delete.

### A12. Low: a few test expectations are weak or come from the code under test

- `tests/unit/speed.test.js:17-19`: `gcdFor(22, 100)` and `gcdFor(80, 100)` both 2.49. Any function returning 2.49 at level 100 passes. Add a value that lands on a different tier (for example a published level-90/100 tier from AkhMorning).
- The level-50 tier thresholds have no recorded source (`math.md` §6 says so).
- `tests/unit/sync.test.js:37-41` computes the expected values with `capsFor`, the function under test. It only checks that `syncStats` equals `min(stat, capsFor)`.
- The optimizer exhaustive oracle copies two engine policies ("single ring only when no pair exists", "a slot is never left empty to satisfy a maximum"). That is fine, but the tests then confirm those policies rather than question them. I checked the engine independently: 3,000 random pools over SGE/PLD/BLM with random sync, tiebreaks, minimums, maximums and average item level gave 0 mismatches against my own brute force.

**Resolution:** `tests/unit/speed.test.js` now asserts tier starts (and the value one below each) plus DoT scalars read from AkhMorning's published tier tables (https://www.akhmorning.com/allagan-studies/stats/speed/, "2.5s Tiers" at levels 50, 90 and 100, read 2026-10-11): level 100 22 / 107 / 193 / 1,219 / 1,818 / 1,904 / 2,845, level 90 15 / 74 / 834 / 1,594, level 50 3 / 14 / 150 / 202 / 286 / 297 / 307 / 349. The level-50 thresholds match AkhMorning row for row, so they are external truth now, as is the views test's 1,818 / 1,904. `tests/unit/sync.test.js` no longer takes expected values from `capsFor`: the head caps at 123 and 129 are derived in the test from the raw `ItemLevel` rows and the 85 ‰ head share. The brute-force helper documents the two policies it copies, `docs/optimizer.md` section 2 and `docs/testing.md` section 2.1 state them, and two "policy:" tests in `optimizer-exhaustive.test.js` pin them on hand-made pools. Still regression values: the caps at 123 in the formula, views and smoke tests, and the 296 generic maximum (no published source for either).

### A13. Low: smoke test gaps

The smoke test is solid for what it covers, but it never:
- reloads the page to check that state persists and restores (the A2 class of bug);
- switches between two jobs of the same role with a non-empty pool (A1);
- uses hand entry (`#b-add`), the generator (`#b-gen`) or copies editing;
- runs the optimizer with a pool for any job other than SGE (the PLD switch empties the pool before `walk_jobs`).

**Recommendation:** Add a reload step (`pg.reload()`, then compare pool count and the optimizer total) and one same-role switch.

### A14. Low: generator silently tolerates schema drift

**Where:** `scripts/data/gen_items.py:35-39` (`r.get(j) == 'True'`).

**Evidence:** I copied the fixtures and renamed the `SGE` column to `SAGE`. The generator exited 0 with 21 rows, and 0 of them had the SGE bit. The same applies if a patch renames a column. BaseParam is fetched but not read, so a change to slot shares would also go unnoticed (`data-pipeline.md` §1 already says this).

**Recommendation:** Assert that every job in `item-format.json` is a column of `ClassJobCategory.csv`, and that every stat column exists in `ItemLevel.csv`. Read the 12 BaseParam rows and assert they equal `BASE_SLOT_PCT` (or generate them). Also add a unit test that every job has at least one item per active slot type.

**Resolution:** `read_csv` in `scripts/data/item_format.py` takes the required columns and raises `SchemaError` naming the sheet and every missing column. Both generators pass the columns they read (jobs, `ItemLevel` stat columns, `EquipSlotCategory` slot columns plus `MainHand`/`OffHand`, the `Item` columns, `ParamGrow`) and exit with status 1 and a one-line message without writing a file. `gen_items.py` also fails when a job ends up with no item. The slot shares now live in `src/core/item-format.json` (`percent` and `baseParamColumn` per slot); `constants.js` derives `WEAPON_PCT`, `BASE_SLOT_PCT` and `DB_SLOT_PCT` from it, and `gen_item_level.py` checks all 12 stats' `BaseParam` rows against it (all match today). Tests: `SchemaDriftTest` in `tests/data/test_generators.py` (new `BaseParam.csv` fixture), and in `tests/unit/data-format.test.js` slot shares equal the format file and every job has an item for each active slot (Blue Mage weapons are a listed exception: they carry no stats in `Item.csv`). Regenerated data is byte-identical.

### A15. Low: stale or wrong statements

| Where | Says | Actually |
| --- | --- | --- |
| `README.md:30` | `npm run check`: "build, test, smoke" | lint, format check, build, test, test:py, smoke |
| `docs/findings.md:23` | "tests/core.test.js" | `tests/unit/validation.test.js` |
| `scripts/data/regen.py:2` | "see fetch_data.py" | `fetch.py` |
| `docs/data-pipeline.md` §8 | page has "no external references" | loads a Google Fonts stylesheet (A16) |
| `CLAUDE.md` Optimizer notes | "A 1,283-item Sage pool solves in about 0.2 s" | the full Sage pool is now 2,033 items, 136 nodes, ~20–35 ms (my probe and `optimizer.md`) |

I spot-checked the rest of `math.md`, `optimizer.md` and `data-pipeline.md` against the code and data: the ParamGrow table, caps at 123 including the PLD 1H/shield rows, tiers 286/297, the 118 candidates / 136 nodes / 344 result, row counts and band accuracy. All matched.

### A16. Low: third-party font request

**Where:** `src/index.html:7`.

**Impact:** Every open of the page, including from `file://`, sends a request to Google, which conflicts with "self-contained". The page works offline (the smoke test filters `ERR_` console errors for this reason). This is no XSS or script risk. Other security checks came back clean: the only `x-html` is the chart (numbers only), all names go through `x-text`, `restoreState` rebuilds objects from known keys, localStorage access is in try/catch, dependencies are pinned and `npm audit` reports 0.

**Recommendation:** Drop the link and use a system font stack, or say in the docs that it is an intentional exception.

## What is done well

- The core is pure and job-context-driven, imports cleanly in Node, and is easy to probe. It reads no global state.
- The optimizer's correctness argument is written down (`optimizer.md`) and backed by exhaustive tests. My independent fuzz, which added maximums, PLD and BLM, found no mismatch. Performance is ample: the full Sage, Paladin and Warrior pools (2,000 to 2,700 items) solve in 30 to 65 ms, and the 14-run ceiling takes 250 to 480 ms.
- The data pipeline is reproducible (byte-identical regeneration), records its provenance, shares one format file between Python and JS, and has fixture tests.
- `restoreState` validates every field and is well tested.
- The docs separate verified, inferred and assumed claims carefully, and the numbers I checked in them were right.
- The tooling is tidy: pinned dependencies, `engine-strict`, Biome and Ruff clean, and one `npm run check` command.
