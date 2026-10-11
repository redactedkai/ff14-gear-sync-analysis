# Engineering audit

Date: 2026-10-11. Scope: everything in the working tree at commit `8a09811` plus the untracked files (`src/`, `scripts/`, `tests/`, `docs/`, `CLAUDE.md`, `package.json`). Generated data (`src/data.js`, `src/items.js`) was reviewed for format only.

## Status of findings

Re-evaluated on 2026-10-11 against branch `alpine-migration` after the core split and the Alpine UI migration. The detailed findings further down describe the code as originally audited, so their file names refer to the old layout (`core.js`, `ui.js`, `build.py`). `docs/findings.md`, mentioned below, has since been split into `math.md`, `data-pipeline.md`, `validation.md`, `roadmap.md` and `history.md` (see `docs/README.md`).

"Resolved" means fixed on the `alpine-migration` branch, which isn't merged into `main` yet. ❌ covers open, partly resolved and in-progress items.

| ID | Finding | Severity | Resolved? | Status | Notes / next step |
| --- | --- | --- | :---: | --- | --- |
| F1 | Ring pruning drops valid second rings | High | ✅ | **Resolved** | An item is pruned only when the items beating it have enough copies to fill every slot of its type (2 for rings). Real-gear check: 0 of 9,800 runs off the exact optimum (was 360). Regression tests in `tests/unit/optimizer-exhaustive.test.js`. Same change turns pruning off when stat maximums are set, which it also got wrong |
| F6 | Shared mutable globals carry the job context | High | ✅ | **Resolved** | Core functions take a frozen `JobContext` (`src/core/job-context.js`); the Alpine store holds the current one |
| F9 | No check that the optimizer finds the true best | High | ✅ | **Resolved** | Exhaustive-search reference compared with the optimizer on 400 seeded random pools (rings with 1 and 2 copies, tiebreaks, average item level and stat minimums) |
| F2 | Switching jobs in the same role keeps gear the new job can't equip | Medium | ❌ | **Open** | Behaviour kept on purpose during the migration (`setJob` in `src/ui/store.js`). Needs a decision: reset or filter |
| F7 | Modules have too many responsibilities | Medium | ✅ | **Resolved** | Core split into `src/core/*` (optimizer in 3 files); UI split into Alpine components under `src/ui/components/` |
| F8 | The same facts kept in several places | Medium | ✅ | **Resolved** | Single sources: slot percents and substat shares (`src/core/constants.js`), the real-gear accuracy check (`src/core/validation.js`), the item level maximum (`MAX_REAL`), and the data format (job bit order, stat order with sheet columns and BaseParam ids, slot codes) in `src/core/item-format.json`, read by both the page and the Python generators. Regenerating from the same CSVs gives byte-identical `items.js` and the same `item-level.js` values. `tests/unit/data-format.test.js` checks the data against the format |
| F10 | Test structure (one script inside `new Function`) | Medium | ✅ | **Resolved** | `node:test`, one file per module in `tests/unit/` |
| F11 | Uncovered areas (generators, saved state, filters, constraints, data integrity) | Medium | ✅ | **Resolved** | Python generator tests on fixture CSVs (`tests/data/`, 17 tests, `npm run test:py`, part of `npm run check`); `browseItems` filters and pool copies (`items.test.js`), sync edge cases and PLD Wiki caps (`sync.test.js`), optimizer minimums, maximums, average item level, truncation and empty pool against brute force (`optimizer-constraints.test.js`); saved state (`state.test.js`, F4) and data integrity (`data-format.test.js`, F8). Note: an empty pool returns `ok: true` with no picks |
| F12 | Smoke test robustness (fixed sleeps, prints instead of asserts) | Medium | ✅ | **Resolved** | `tests/e2e/smoke.py` waits on concrete conditions (no fixed sleeps) and asserts external values: Wiki 475 caps, ilvl 123 caps per slot for six jobs, the Dreadwyrm hood formula, Dreadwyrm optimizer 171 / 176. Shown to fail on deliberately broken builds |
| F13 | No linting, formatting or pinned engines | Medium | ✅ | **Resolved** | Linting and formatting: Biome (JS/JSON/CSS) and Ruff (Python), `npm run lint` / `format` / `format:check`, run first by `npm run check`; all clean. Engines: Node ≥ 22 enforced (`engine-strict`), `.nvmrc`, `.python-version`, pinned Python dev tools in `requirements-dev.txt`. CI is not a requirement (owner's decision) |
| F15 | Documentation gaps | Medium | ✅ | **Resolved** | `docs/` now has math, optimizer, data pipeline, validation, architecture, testing, glossary, roadmap and history pages with custom diagrams, indexed in `docs/README.md` and following `docs/diagrams/STYLE.md`. `findings.md` was split into them and removed; README and CLAUDE.md link into `docs/`. Function-level JSDoc was not added: the owner chose concept-level docs over code-level ones |
| F3 | Lexicographic score has an implicit size limit | Low | ✅ | **Resolved** | Score weights are derived from the pool (each lower-ranked stat's possible spread + 1), so the ranking is exact for any totals; `optimize()` throws a clear error if a score could exceed 2^53 (largest real score is about 2e11). Regression and 200-pool exhaustive tests added; timing unchanged |
| F4 | Saved state merged without type checks | Low | ✅ | **Resolved** | `restoreState` (`src/ui/state.js`) checks type and range of every saved field and pool item, falling back to the default per field. 14 tests in `tests/unit/state.test.js`, 8 of which fail on the old code. Key and saved shape unchanged |
| F5 | `build.py` could silently ship the Node export line | Low | ✅ | **Resolved** | `build.py` was removed. `scripts/build/build.mjs` uses real imports and fails loudly on missing markers or output |
| F14 | Data provenance not recorded | Low | ✅ | **Resolved** | `npm run regen` records the ffxiv-datamining commit and date in a header of both generated files and as `DATA_SOURCE` in `item-level.js`; the page footer shows it ("Game data: ffxiv-datamining d9582a6, 2026-09-30"). Item data otherwise byte-identical. Tested in `tests/unit/provenance.test.js` |
| O2 | Data stored on a DOM node (`#b-addall._all`) | Low | ✅ | **Resolved** | Browse results live in the Alpine browser component |
| O3 | `esc()` doesn't escape `'` | Low | ✅ | **Resolved** | `esc()` is gone: `x-text` escapes everything. The one `x-html` (chart) contains only numbers |
| O4 | Python `open()` without `with` in the generators | Low | ✅ | **Resolved** | CSVs are read through `read_csv` in `scripts/data/item_format.py`, which closes the file |

## Summary

The project is in good shape for a first version. The domain model is carefully validated against outside sources, the build is simple, and the working notes (`CLAUDE.md`, `docs/findings.md`) are unusually honest about what is verified and what is inferred.

The main problems:

1. **The optimizer gives wrong answers in about 3.7% of real-gear runs.** The cause is a pruning bug with rings (F1). The current tests pass anyway.
2. **The code relies on shared mutable globals.** `setJob()` rewrites module-level arrays and objects that almost every function reads. This is the main obstacle to testing and refactoring.
3. **The tests are a single unstructured script.** There's no check against exhaustive search, and no tests for the Python generators. That is why F1 went unnoticed.

| Area | Rating | Notes |
| --- | --- | --- |
| Correctness | Fair | One high-severity optimizer bug, one medium-severity state bug |
| Architecture | Fair | Clear core/UI split, undermined by mutable globals and duplicated facts |
| Testing | Weak | Good expected values, weak structure and coverage |
| Tooling and process | Weak | No linter, formatter, or engine pins; most files untracked |
| Documentation | Good | Strong domain notes; missing architecture and contributor docs |
| Data pipeline | Good | Simple and reproducible; data provenance not recorded |

## Method

- Read every source, script, test and doc file.
- Ran `npm test` (ALL PASS, 0.2 s) and `python scripts/build.py` (1.51 MB output). I couldn't run `npm run smoke` because Playwright isn't installed on this machine.
- Wrote throwaway probes (not committed). They load `data.js + items.js + core.js` the same way the tests do and:
  - compare `optimize()` with exhaustive search on 300 random small pools;
  - compare `optimize()` with the exact optimum on real-gear pools (all 22 jobs, 40-item-level windows from 100 to 820, sync on and off, every stat as target: 9,800 runs);
  - measure lexicographic score headroom and optimizer timing.

Findings are numbered F1 to F15 and sorted by severity within each section.

---

## 1. Correctness

### F1. High: ring dominance pruning drops valid second rings

`optimize()` in `core.js` removes a candidate when another item in the same slot dominates it (at least as good on every dimension) and has at least as many copies (`if(A.copies < B.copies) continue;`). That reasoning only works for slots that take one item. The ring slot takes two items. If A dominates B and both are Unique (one copy each), B is pruned even though the best pair may be A + B.

Evidence:

| Probe | Optimizer | Correct |
| --- | --- | --- |
| Unique rings with 10 / 9 / 5 Spell Speed | 10 (A + empty) | 19 (A + B) |
| Two identical Unique rings, 10 each | 10 | 20 |
| Random small pools vs exhaustive search | wrong in 40 of 300 | |
| Real-gear pools vs exact optimum | lower in **360 of 9,800** (3.7%) | |
| Same 9,800 runs with ring pruning disabled | lower in 0 | |

Example from the real-gear runs: PLD, items 160 to 200, synced, maximize Critical Hit: 322 reported, 345 possible.

The existing Dreadwyrm test can't catch this, because its pool contains a single ring.

Fix: for the ring slot, treat B as dominated only when the dominators can fill both ring slots. That means either one dominator with 2 copies, or two different dominators. Alternatively, skip dominance pruning for rings, since ring candidate lists are small. Add a regression test using the two probes above, plus an exhaustive-search property test (F9).

### F2. Medium: switching jobs within a role keeps gear the new job can't equip

`changeJob()` in `ui.js` clears the pool only when the role profile or weapon mode changes. Pool items don't record the job mask they came from (`poolItemFromRow` drops `p.mask`). So switching SGE to WHM keeps Sage-only weapons such as Grand Champion's Syrinxi, and the optimizer can pick them for a White Mage.

Fix: store `mask` on pool items and either filter or flag items the current job can't use. Alternatively, always reset the pool on a job change (simpler, but loses the user's work).

### F3. Low: the lexicographic score has an implicit size limit

The score is `target·1e8 + tb1·1e4 + tb2`. It's only lexicographic while each tiebreak total stays below 10,000. The largest totals seen (unsynced, item level 795) are main 6,048 and Vitality 6,063, so there's 40% headroom today. A future expansion could cross the limit without any warning.

Fix: compare scores as tuples, or derive the weights from the pool's maximum possible totals. Add a test with large tiebreak totals.

### F4. Low: saved state is merged without type checks

`loadState()` uses `Object.assign(state[k], s[k])` for nested objects, and then `init()` repairs a hand-picked list of fields. Values with the wrong type pass through. For example, a string `avgMin`, a non-array `gen.subs` (`.filter` would throw before the guard runs), or a pool item with non-numeric stats.

Fix: write a single `sanitizeState(raw) -> state` function that checks every field's type and range, and unit-test it with corrupted inputs.

### F5. Low: build.py can silently ship the Node export line

`build.py` disables the CommonJS export by matching an exact string. If someone reformats that line in `core.js`, `.replace` matches nothing, the browser bundle contains `module.exports`, and nobody is told. It's harmless in a browser today, but it's an example of a silent failure.

Fix: assert that the replacement happened, or remove the need for it (see F6).

---

## 2. Architecture and maintainability

### F6. High: shared mutable globals carry the job context

`setProfile()` / `setJob()` rewrite `STATS`, `SUBSTATS`, `STAT_LABEL`, `SHORT`, `PROFILE`, `PROFILE_ID`, `WEAPON_MODE`, `JOB_ID` and `SLOT_PCT.weapon`. Formulas (`slotBudget`, `capsFor`), the optimizer, the database helpers and the UI all read them implicitly.

What this costs:
- Any function's result depends on whichever `setJob` ran last. Tests must call `setJob` in the right order, and a test that forgets can pass or fail depending on the test before it.
- Two jobs can't be computed side by side, for example to compare jobs or precompute ceilings.
- `SLOT_PCT` looks like a constant but isn't.

Recommendation: create a `JobContext` object once per job (`makeJobContext('SGE') -> {profile, stats, substats, labels, weaponMode, slotPct}`) and pass it explicitly to core functions. The UI keeps one current context. This is the most valuable refactor, and the tests from section 3 should be in place before starting it.

### F7. Medium: modules have too many responsibilities and functions are too long

- `core.js` (321 lines) mixes constants, stat formulas, speed/GCD, the optimizer, generic-item generation, and item database access.
- `optimize()` is 117 lines in one function, with nested closures for preprocessing, bounds and search.
- `ui.js` (509 lines): `init()` is 112 lines that mix state repair with about 40 event bindings. Render functions build long HTML strings inline. Twenty lines are over 200 characters, and the longest is 481.

Recommendation (no bundler needed, since `build.py` already concatenates files in order):

```
src/core/constants.js   slots, stat keys, jobs, profiles
src/core/context.js     makeJobContext (F6)
src/core/formulas.js    slotBudget, pieceValue, buildPiece, capsFor, syncStats, predictRaw
src/core/speed.js       speedParams, gcdFor, dotMult, gcdTiers
src/core/optimizer.js   prepareCandidates, bounds, search  (split optimize)
src/core/items.js       parseRow, dbStats, browseItems, poolItemFromRow, genericItems
src/core/validate.js    band accuracy + WIKI475 check (shared by UI and tests, F8)
src/ui/state.js         defaults, load, save, sanitize (F4)
src/ui/render/*.js      one file per tab
src/ui/events.js        wiring
```

### F8. Medium: the same facts are kept in several places

| Fact | Locations |
| --- | --- |
| Slot percents | `SLOT_PCT` and a literal array in `predictRaw` (core.js) |
| Job order (bitmask meaning) | `JOBS` in core.js, `JOB_ORDER` in gen_items.py |
| Slot codes | `DB_SLOT_TYPE` in core.js, `slot_of` in gen_items.py, docstrings |
| Real-gear accuracy check | `renderValidation` in ui.js and the band loop in core.test.js (different band labels) |
| Max item level 795 | nine `max="795"` attributes in body.html, while JS computes `MAX_REAL` |
| Substat shares 100/70/20 | `SUB_WEIGHTS` and `[1,0.7,0.2]` in `predictRaw` |

Recommendation: keep one source of truth for each fact. Have the generator write `JOB_ORDER` and slot codes into `items.js` (or have core.js check them at load time), set `max` on inputs from `MAX_REAL` in JS, and move the accuracy check into one shared function.

### Code style

Code style is very dense: one-line functions, multiple statements per line, and single-letter names (`g`, `h`, `r`, `b2`). That's fine for a quick prototype, but it hurts diffs and review. Adopting a formatter (F13) fixes most of it automatically.

---

## 3. Testing

### F9. High: no check that the optimizer finds the true best

Every optimizer test uses one fixed expected value. Branch-and-bound with dominance pruning and symmetry breaking is exactly the kind of code where an exhaustive-search comparison pays off. F1 shows up within seconds once you add one.

Add:
- an exhaustive-search reference implementation for small pools (a few items per slot, rings with 1 and 2 copies, Unique items, `minAvgIlvl`, tiebreaks);
- a seeded random property test comparing `optimize()` to it (hundreds of pools, fixed seed);
- the per-slot exact-optimum check on real pools (single target, no average requirement) used in this audit.

### F10. Medium: test structure

`tests/core.test.js` puts the whole suite inside a template string run by `new Function`. As a result:
- there's no isolation: one throw stops all later tests;
- error stack lines point inside the string, not the file;
- you can't run a single test or group;
- the custom `eq` compares with `JSON.stringify`, so key order matters.

Recommendation: use the built-in `node:test` and `node:assert` (Node 18+, no new dependency). Load the source with `vm.runInContext` and a filename, so stack traces point at the real file. Group tests with `describe` by module (formulas, sync, speed, optimizer, items, validation). `npm test` becomes `node --test tests/`.

### F11. Medium: uncovered areas

| Area | Current coverage | Suggested tests |
| --- | --- | --- |
| Python generators | None | `unittest` with tiny CSV fixtures: slot detection (2H, 1H, off-hand, ring, belt excluded), `PARAM_IDX` mapping, HQ bonus only when `CanBeHq`, minimum item level, job-mask bits, sort order |
| Saved-state sanitizing | None | Corrupted and old-version JSON in, valid state out (needs F4) |
| `browseItems` filters | Indirect (one Dreadwyrm query) | Weapon mode per job, main-stat filter, level and item-level bounds |
| `syncStats` edge cases | Indirect | Item at exactly the cap, no-spec jobs, missing keys |
| Optimizer constraints | None for `mins` / `maxs` / truncation | Infeasible average requirement, `nodeLimit` truncation flag |
| Generated data integrity | One check (`MAX_REAL <= MAX_ILVL`) | Row shape, 12 stats per row, slot codes 0 to 11, mask under 2^22, `IL` columns the same length |

Expected values: the Wiki caps and AkhMorning figures are external truth, which is good. The Dreadwyrm totals (171 / 176) look like they came from the code itself. Label them as regression values, or confirm them in game, as `CLAUDE.md` asks.

### F12. Medium: smoke test robustness

`tests/smoke.py`:
- uses fixed `wait_for_timeout` sleeps (flaky on slow machines) instead of waiting for specific selectors or text;
- prints values rather than asserting them, so it would pass even if, say, the optimizer showed the wrong numbers;
- creates `tests/out/` at import time.

Recommendation: wait for specific selectors and text, and assert key values (for example, the Dreadwyrm optimizer readout). Consider `pytest-playwright` for separate cases, which only matters if dependency growth is acceptable.

---

## 4. Tooling and process

### F13. Medium: no linting, no formatting, no pinned engines

- No linter or formatter for JS (for example ESLint and Prettier as dev dependencies, or `node --check` at minimum) or for Python (`ruff` is a single binary).
- `package.json` has no `engines` field. Scripts call `python`, which is `python3` on many macOS and Linux systems.
- Most of the repo is untracked (only `LICENSE` and `README.md` are committed). Commit a baseline before any refactor so changes can be reviewed.

Recommendation: add `engines` and use `python3` (or `py` on Windows). CI was considered and is not a requirement (owner's decision). Formatter and linter adoption needs the owner's sign-off, since `CLAUDE.md` asks before adding dependencies. They would be dev-only and never ship in the page.

### F14. Low: data provenance isn't recorded

The generated files don't record which `ffxiv-datamining` commit or game patch they came from. After a regeneration, there's no way to tell which data a published page uses.

Fix: have `regen.py` write the datamining commit hash and date into a header comment in `data.js` and `items.js`, and show it in the page footer.

---

## 5. Documentation

Strengths: `docs/findings.md` is excellent, with evidence, separation of verified from inferred, and a history of corrections. `CLAUDE.md` is a thorough working brief.

### F15. Medium: gaps

- **No architecture document for people.** `CLAUDE.md` is aimed at an AI assistant and mixes architecture, process rules and artifact-publishing steps. A short `docs/architecture.md` (data flow from CSV to generators to `src/` to `build.py` to `dist/`; module responsibilities; the `JobContext` model after F6) would help people too.
- **No data format reference.** The `items.js` row format and `PG` layout are documented only in generator docstrings. Move them to `docs/data-format.md` and link to it from both places.
- **No doc comments in code.** Core functions have none. Add short JSDoc to the public core API (parameters, units, rounding rules, which formula from `findings.md` each one implements).
- **README:** missing a feature screenshot, a "how it works" summary, the test layout, and a contributing section.
- **No CHANGELOG.** The "History of corrections" section partly fills that role. A CHANGELOG for user-visible changes would help when republishing.

---

## 6. Other observations

- **Performance:** fine. A 224-item pool optimizes in 3 ms. The 14-run ceiling table takes 26 ms. The page is 1.5 MB, almost all of it `items.js`. If a future expansion grows that file, consider a more compact encoding (for example, columnar arrays).
- **O3. Security:** item names are escaped before being inserted as HTML, and the page loads no third-party scripts. `esc()` doesn't escape `'`, which is safe only because every attribute uses double quotes. Worth a comment.
- **O2. DOM as storage:** `$('#b-addall')._all` stores data on a DOM node. Move it into module state.
- **O4. Resource handling in Python:** `open()` is called inside `csv.DictReader(...)` without `with`. It's harmless for a script, but easy to fix.

## 7. What is already done well

- Real-world validation: about 16,600 real items, the Wiki's published caps and AkhMorning's GCD examples serve as test expectations.
- A strict line between pure logic (`core.js`, runs in Node) and DOM code (`ui.js`).
- No runtime dependencies, and a build that's easy to read in full.
- Generated files are marked `linguist-generated` and excluded from diffs.
- Saved state is wrapped in try/catch and versioned by key.
- The project is honest about assumptions, both in the UI and in the docs.

## 8. Recommended order of work

1. **Commit the current tree** as a baseline.
2. **Fix F1** with a regression test, and add the exhaustive-search property test (F9). Small change, high value.
3. **Restructure the tests** on `node:test` (F10), add generator tests and data-integrity tests (F11). This creates the safety net.
4. **Add linting, formatting and engine pins** (F13).
5. **Refactor**: `JobContext` (F6), module split (F7), single sources of truth (F8), `sanitizeState` (F4), F2, F5.
6. **Documentation**: architecture, data format, JSDoc, README (F15); provenance header (F14).
7. Lower priority: F3, F12, formatter and linter.

Decisions for the owner:
- Can source files be split, with `build.py` still concatenating them?
- Are dev-only tools (ESLint, Prettier, ruff, pytest-playwright) acceptable, or should everything stay standard-library?
- For F2: reset the pool on every job change, or keep items and filter by job?
