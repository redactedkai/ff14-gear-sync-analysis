# Roadmap: feature ideas

Feature ideas only; each needs the owner's go-ahead. An ID (A1, A2, ...) names an idea; IDs are never reused (A23 and A30 are retired, replaced by A90). A new feature should replace or simplify controls where it can: the page has felt "overwhelming" before. Findings and open questions belong on the page they concern (in-game captures still needed: [validation.md, section 8](mechanics/validation.md#8-in-game-captures-still-missing)).

## To build

Grouped by area. Within an area the rows are in build order (the owner's order); "after A4", "before A17" and the like name the order between areas.

### Saved data and sharing

| ID | Idea | In one line |
| --- | --- | --- |
| A3 | Save and share | Settings, gear sets and picks in a JSON file or a URL; after A4 |
| A12 | Import from xivgear | Bring in an xivgear link or JSON as gear sets; after A4 |
| A17 | Harden the saved gear sheet format | Version 1 and migrations, before the first public release |
| A20 | Saved sheets: say what changed | Tell the user when a saved piece is missing from the database and when Copy sheet changes a setting; before A17 |
| A27 | Several tabs, one saved state | Two tabs of the page share saved data and the solver; every write and every solve with its menu is atomic, so one tab cannot undo another's change |

- **A3.** A JSON file or a URL, holding the settings, the gear sets and the pieces picked from the same-result menus. After A4.
- **A12.** Bring a gear set or an xivgear sheet in from an xivgear link or its exported JSON, as gear sets in a gear sheet: pieces, materia and meal by game id, with the job, level and cap; relic substats and custom items are listed as not mapped. After A4.
- **A17.** Not public yet, so while A4 is built the saved shapes may change with no migration (`v` stays 1; an unreadable record is skipped and listed with a Delete button). Before the first public release:
  - freeze the format as version 1;
  - write the migration strategy (a chain of tested functions, one per `v` step, run when a record is read);
  - keep fixture records of every shipped shape in a unit test;
  - decide what a build does with a record saved by a newer version (listed as "saved by a newer version", never deleted or rewritten);
  - freeze the sheet's `clan` (a clan name or null) and `partyRoles` (a whole number 0 to 5) with the rest; a missing field reads as none, and an unknown clan name reads as none
  - settle the rule for dev and main builds that share saved data (an older build cannot read a newer saved format; see also A27 for several tabs);
  - turn the tolerant reader of old stat keys (`withCurrentStatKeys` in `src/ui/sheets/storage.js`, which reads the position keys `main`, `spd`, `spec` of a record saved before the keys were the game's own) into the first migration step;
  - replace the quiet repair on read (`repairSheet` in `src/ui/sheets/ops.js`: it holds a sheet's level and item level cap to what the job and level allow, and drops a damaged `bestMeals`) with migrations. It only exists to mend saved sheets from earlier builds and hand edits, so once the format is frozen a record that fails a check should be listed as unreadable, not changed.
- **A20.** Three cases where a saved sheet shows or changes something without telling the user:
  - A saved piece whose id is not in the database shows as "missing item 12345", with no name. A data update, or a rule that leaves an item out (item level 15 and up only, the `LEFT_OUT` codes, crafter and gatherer gear), can cause it; comparing the item ids of two data updates would confirm it. Copy sheet copies such an id as it is.
  - Copy sheet to another job resets an Auto-fill setting that job cannot use, for example a stat it lacks.
  - Copy sheet cuts the equip level to the new job's cap.
  Show a one-line note in the two Copy cases. What to show for a missing piece is still open.
- **A27.** The page's saved data (sheets, gear sets, settings) lives in `localStorage`, which every open tab of the page shares, and each tab keeps its own copy in memory. Today the last write wins:
  - tab A deletes a sheet that tab B has open, and B's next edit writes it back to the top of the list;
  - two result-menu sessions can list tied pieces differently, since a solve and the build of its menu are not one step.
  Settle what the page does when another tab changes the data (listen for the `storage` event, or re-read before every write), how a write is made atomic (a version counter checked before the write, a write per sheet rather than the whole list, or a lock), whether a tab that finds its sheet gone says so, and an atomic lock around a solve and its menu build if tied pieces must list the same everywhere. Check with two pages open in the smoke test. The dev and main builds sharing one origin is the same question across builds: A17 settles that one.

### Optimizer and build goal

| ID | Idea | In one line |
| --- | --- | --- |
| A11 | Relics with player-set substats | Hand-entered substats first, then optimizer-chosen ones; after A4 |
| A90 | Build goal | The player states an outcome: a damage index and a healing index (no simulator), a Damage-Healing slider for healers and tanks, optional floors (GCD, MP per tick, extra mitigation), "Maximize one stat" in place of the ranked stats, and an Index tab in the Gear sets table |
| A102 | Auto-fill failure messages | Rework how an Auto-fill that ends with no suggestion tells the player: what each line says, what it offers next, and where it sits |

- **A11.** Relics whose substats the player sets are left out of the optimizer today, since the game files hold no substats for them ([optimizer.md, section 7](engineering/optimizer.md#7-the-pages-pool-and-its-filters)); the page shows no note about them. Some such relics let the player choose the substats and some give them at random (how many of each is not yet counted). Part 1: the player enters a relic's substats by hand, so a relic in a gear set counts them in the Total, Tier row and header (a hand-set relic counts as having none today, with no word on the page). Part 2: for relics with chosen substats, the optimizer picks the allocation; random ones stay hand-entered. After A4.
- **A90.** The Build goal: the player states an outcome and the tool picks the stats.
  - Indexes: a damage index (main stat, weapon damage, CRT, DET, DHT, and TNC for tanks) and a healing index (the same without DHT). Each is a product of the game's own stat formulas with no rotation; speed counts through the GCD floor only. Healers and tanks get a Damage-Healing slider (the weights add to 1, each index as a percent of its own best); DPS get Damage only.
  - Floors, all optional and hard: Target GCD, Min MP per tick (healers), and Extra mitigation from TNC over the max-damage set (tanks). A floor no set can meet is dropped, lowest priority first (GCD, then MP or mitigation), and the page says which.
  - Search: each meldable piece enters as its non-dominated meld versions, meals are an outer loop, a bound from stat prices prunes, and the tie-break order is fixed.
  - "Maximize one stat" replaces the ranked stats, the spare-points switch and tier ranking once the index matches xivgear's damage ratio and the search runs within the performance budget.
  - The Gear sets table gets an Index tab (beside Effects and Stat points) that compares sets against a reference set, the best one by default.
  - Clan and party bonuses (A28, A29) are added to the result's totals and never enter the search.
  - Attack power comes from one replaceable lookup that marks estimated levels (A98); at those levels the page flags a near tie.
  - A set's saved Auto-fill settings change shape with no migration (not public yet, see A17); update the test data if it holds them.
  - Jobs where the index fits poorly (guaranteed crits or direct hits, DoT-heavy jobs) get a short note next to the number.
- **A102.** An Auto-fill that ends with no suggestion shows one line (`#sh-fill-line`, `role="alert"`) under the totals. It has no timer and stays until the next Auto-fill or until the player leaves the page. The lines today: a pin that cannot be kept (the rows are unpinned, and it says to run Auto-fill again), pins that cannot be worn together, no set that fits the Target GCD, a failed search (an error, or the 60 s solver timeout) and the step limit (700,000 nodes). They differ in whether they say what to do next: only the unpinned-rows line does. The wording was shortened one line at a time, with no common rule. Settle one: how a failure is named, what each failure offers (for example, which setting to change), where the line sits and how it is announced, and whether the lines that cannot be reached from the page keep a text. The line's text is one constant or builder per kind (`src/ui/views/set-suggestion.js`, `src/ui/sheets/fill.js`); tests import them.

### Page and navigation

| ID | Idea | In one line |
| --- | --- | --- |
| A14 | Final viewport, width and stress review | Before the merge to `main`; a layout stress tool in `scripts/` |
| A101 | Storage messages stay in view | When a save fails or storage is off, the message shows in the set page's sticky header, so it is seen while editing a long set |

- **A14.** Before the merge to `main`:
  - the container cap is settled at 1280 px (every tab, the Sheets tab included);
  - decide the `@media (min-width: 1300px)` rule on `.twopanel` (Piece stats, Sage, measured: at 1299 the panels are stacked and the page is 1739 px tall, at 1301 side by side and 1303 px; a trial rule at 1200 px keeps the left panel 474 px wide and clean, at 1100 px its materia cell wraps, at 1000 px its bars are stubs and its title wraps; nothing breaks either way);
  - re-check the viewport list in [testing.md, section 3.1](engineering/testing.md#31-viewports-to-look-at-for-ui-changes), in particular whether the short 1280 x 720 screen (about 1265 x 565 window, 4.4% of desktop screens in StatCounter, October 2026) stays;
  - a layout stress tool in `scripts/` (`npm run stress:layout`, not part of `npm run check`, run before the merge to `main`), built from two scratchpad tools and pointed at the real page (Sheets, the set page, the Gear browser, the three math sub-tabs): the viewport matrix (6 physical screens x 8 Windows scales, about 30 windows, 13 rules, and a width sweep that finds each layout change to the pixel; its draft of `testing.md` section 3.1 replaces the five-window table) and the Stat Allocation bar stress test (width sweep up and down, content states, all 23 jobs, open menus, sub-tab switching, resized against fresh load). It checks:
    - widths: a sweep from 960 to 2560 px per screen with a table of the widths where the layout changes; widening never adds rows; a resized window lays out like a fresh load;
    - text and fonts: the page fonts, Google Fonts blocked, a wide font (Verdana), 125%, 150% and 200% text;
    - content extremes: all 23 jobs and the longest names, a test-only build with level 888 and item level 8888, many sets, long sheet and set names, empty and error states (A101);
    - short windows and open menus: heights from about 565 to 900 px, the pinned header's share of the window, every menu and popover inside the window, focus rings not clipped, tall dialogs scrolling;
    - layout rules: no control outside its container, no overlap, labels on one line, equal box heights in a row, a divider only between two sections on one line;
    - browsers: Chromium, Firefox and WebKit (`npx playwright install firefox webkit`; Playwright is already a dependency); customizable selects exist in Chromium only, the others show their own list;
    - output: an HTML report, and `KNOWN FAILURE` lines as in the smoke test; the five-window `checkViewports` stays in the smoke test.
  - Built: all of the above in `scripts/layout-stress/` (the three math sub-tabs included), run in Chromium, and quickly in Firefox and WebKit; the rules and run times are in [testing.md, section 3.1](engineering/testing.md#31-viewports-to-look-at-for-ui-changes). Not done: the page fixes for what it finds, a full run in Firefox and WebKit, and the `CLAUDE.md` pointer to the tool.
- **A101.** Built for the failed save: `#sh-save-error` is in the notes element at the window's bottom (`src/ui/elements/app/notes.ts`), outside the tabs, until a save succeeds. Not done: `#sh-unavailable` (storage disabled or turned off: gear sets are wiped when the page closes) is still a bar at the top of the Sheets tab, in the normal flow, with the same problem the save error had: on a long set page scrolled down it sits above the window, so a player editing low on the page does not see it (the save error sat 883 px above the top edge at 960 px, measured; the other bar's position is inferred, not measured). Both are states, not events (later saves fail too and a good save clears the first; the second never clears), which is why neither is a timed toast: the notes element holds the first until it clears. The unavailable-storage bar can go in the same element. A smoke step with a storage that rejects writes should check that the save message stays in view after scrolling (none yet).

### Code and release health

| ID | Idea | In one line |
| --- | --- | --- |
| A22 | Type checking | Built: `tsc --noEmit` over `.ts` files; `.js` files convert one by one |
| A99 | Take the test data out of the build | The test data button, `test-data.js` and `test-sheets.json` ship in the page with no build condition; decide before any release whether they stay |

- **A22.** Built: `tsconfig.json` (strict, `noEmit`, `erasableSyntaxOnly`, `allowJs` with `checkJs` off), `npm run typecheck` inside `npm run check`, and Node 22.18+ (type stripping runs `.ts` unit tests). `src/ui/text.ts` and `src/ui/view-cache.ts` are the first `.ts` modules, imported with their `.ts` extension; esbuild strips their types. Not done: the other files stay `.js` and unchecked; each converts when it is touched. The state of the typing:
  - `tsconfig.json` is strict with `checkJs` off, so a `.js` file is not checked; a `.ts` file that imports one reads its inferred types. It includes `src/**/*.ts` and `tests/**/*.ts`; `scripts/validate/xivgear/xg_sync_test.ts` is left out (it runs inside xivgear's checkout against their types).
  - The `.ts` files are `src/ui/text.ts`, `src/ui/view-cache.ts`, the Lit element `src/ui/elements/app/gsa-counter.ts`, the new store `src/ui/store/*.ts` (not used by the page yet), the story specs and fixtures in `tests/stories/` and the unit tests `tests/unit/ui/text.test.ts`, `view-cache.test.ts` and `tests/unit/ui/store/*.test.ts` (some are `.js`: the old stores' tests run against the new actions).
  - `tsc --noEmit` is `npm run typecheck`, the second step of `npm run check` (after lint). esbuild strips types and checks none; Node's type stripping runs the `.ts` unit tests (no enums, imports with the `.ts` extension, `erasableSyntaxOnly`).
  - Lit properties are declared with `static properties` and constructor defaults, not decorators; `useDefineForClassFields` is off.
  - A `.js` file is renamed to `.ts` when it is touched.
- **A99.** `src/ui/test-data.js` (marked TEMPORARY) and the 60 KB `src/ui/test-sheets.json` are imported by `components/page.js` with no build condition, and `build.mjs` adds the test data button, so the data is in the `dev` page and probably in the `main` build too (inferred; `main` was not built). The generator its comment names is in the gitignored scratchpad, so the JSON cannot be rebuilt from the repo. Kept on purpose for now; settle it before a release: build it only for `dev`, or remove the button, the module and the JSON.

### Game accuracy (in-game recordings)

| ID | Idea | In one line |
| --- | --- | --- |
| A31 | Record the all-jobs earrings and rings under sync | One in-game recording left for the sync clamp: Azeyma's or Menphina's Earring in a level 50 duty; optional |
| A33 | Synced shield recordings | No recording of a synced shield exists; the Defense under sync rule for shields is a guess, and 24 other Paladin shield pieces miss the formula |
| A98 | Main stat multiplier by level | The damage and healing indexes (A90) need the game's attack power modifier per level and role; only some levels are sourced, so A90 marks the others as estimates until it is |

- **A31.** The main stat and Vitality clamp under sync is verified (108 recorded values and xivgear agree) except for the all-jobs earrings and rings (item kind 0, 84 pieces in the database). xivgear's note (Azeyma's Earring at item level 430: main stat 71, fits the 90% factor) and a player's report (Azeyma's at level 50: Str 26, fits 100%) disagree by 3 points at item level 130. Record Azeyma's or Menphina's Earring in a level 50 duty (the owner's in-game recording; the session file format is in [READING-SESSIONS.md](READING-SESSIONS.md)). Optional: nothing in the tool depends on it, and the page marks no guess for it.
- **A33.** Defense under sync is checked for item kinds 2, 4 and 6 only. No in-game recording of a synced shield exists (verified), so the shield rule is a guess. Paladin's 24 other shield pieces miss the formula and are unstudied. Record a shield in a synced duty (the session file format is in [READING-SESSIONS.md](READING-SESSIONS.md)), then compare the misses against it.
- **A98.** The main stat multiplier is `(trunc(AP x (main - base) / base) + 100) / 100`, where AP is the level's attack power modifier (tanks have their own). Sourced: other jobs at levels 1 to 80 (published formulas: 75 up to level 50, `floor((level - 50) x 2.5 + 75)` to level 70, `floor((level - 70) x 4 + 125)` to level 80) and at 90 and 100 (195, 237); tanks at 70, 80, 90 and 100 (105, 115, 156, 190). Unsourced or disputed: other jobs at 81 to 89 and 91 to 99; tanks below level 70 and between the tens; level 60 (100 or 114) and the tank values at 50 and 60 differ between xivgear and ffxiv-gearing. The game files and AkhMorning's tables hold no such column, and the values come from community in-game testing. Until the missing levels are measured or sourced, a ranking that uses it cannot be exact there, so A90 runs on an estimate and flags near ties (verified; the effect of a wrong value is about 10% on the main stat's weight against the substats at synced stats, small at high stats, inferred). Lead: Tank Mastery takes 20% off the damage tanks deal, so tank AP may be 0.8 times the level's other-job value: 237 x 0.8 = 189.6 matches the tank's 190 at level 100 and 195 x 0.8 = 156 matches level 90, but 125 x 0.8 = 100 against 105 at level 70, 165 x 0.8 = 132 against 115 at level 80 and 100 x 0.8 = 80 against 78 or 91 at level 60 do not (inferred; one of the tank values at 70 or 80, or the other-job value at 80, may be wrong). Needs: a source for the game client's constant, or recorded damage at two main stat values per level.

## Built

On `dev` at least; live once on `main`. Grouped by area.

### Optimizer and Auto-fill

| ID | Idea | Details |
| --- | --- | --- |
| A1 | Target GCD | [optimizer.md, section 2](engineering/optimizer.md#target-gcd-from-a-gcd-to-a-speed-range) |
| A2 | Food | [math.md, section 6](mechanics/math.md#food) |
| A7 | Rank by tier | [tier-ranking.md](engineering/tier-ranking.md) |
| A8 | Substat tiers (breakpoints) | [math.md, section 6](mechanics/math.md#substat-tiers-breakpoints) |
| A9 | Other pieces with the same result | [ui.md, "Which piece an Auto-fill suggests"](engineering/ui.md#which-piece-an-auto-fill-suggests) |

### Gear browser and filters

| ID | Idea | Details |
| --- | --- | --- |
| A10 | Gear categories filter | [data-pipeline.md, section 4.6](engineering/data-pipeline.md#46-sources) |
| A25 | Gear categories menu that fits the window | [ui.md, section 2](engineering/ui.md#2-auto-fill-the-search-on-a-set-page) (floating menus), [ui.md, section 3](engineering/ui.md#3-the-gear-browser-tab) (the Gear categories control) |
| A32 | Market board glyph on the Gear categories field | [ui.md, section 3](engineering/ui.md#3-the-gear-browser-tab) (the Gear categories control) |

### Gear sheets and totals

| ID | Idea | Details |
| --- | --- | --- |
| A4 | Gear sets and comparison (Sheets tab) | [sheets.md](engineering/sheets.md), [ui.md, section 2](engineering/ui.md#2-auto-fill-the-search-on-a-set-page) |
| A18 | Off-hand row for White Mage and Black Mage | [math.md, section 3](mechanics/math.md#3-slot-shares), [sheets.md](engineering/sheets.md) |
| A19 | Haste labels on the set page | [ui.md, section 2](engineering/ui.md#2-auto-fill-the-search-on-a-set-page) |
| A28 | Clan bonus in the sheet's totals | [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers) (Totals as on the character panel), [ui.md](engineering/ui.md) |
| A29 | Party bonus in the sheet's totals | [math.md, section 6](mechanics/math.md#6-speed-and-substat-tiers) (Totals as on the character panel), [ui.md](engineering/ui.md) |

### Code structure

| ID | Idea | Details |
| --- | --- | --- |
| A13 | The page template split into partials | [architecture.md, section 5](engineering/architecture.md#5-build) |
| A16 | Stat keys that are the game's own stats | [architecture.md, section 2](engineering/architecture.md#2-the-job-context) |
| A24 | A character's base stats in their own module | [architecture.md, "Where this lives"](engineering/architecture.md#where-this-lives) |

### Page and navigation

| ID | Idea | Details |
| --- | --- | --- |
| A100 | Routing: every screen has an address (`#/sheets`, a sheet, a set, `#/gear`, `#/math/...`), so Back, Forward, reload and bookmarks work | [ui.md, section 1](engineering/ui.md#1-the-tabs) (Addresses), [architecture.md, "Where this lives"](engineering/architecture.md#where-this-lives) |
| A103 | Settings in the address: the Gear browser's filters, the math fields and each tab's job, level and item level sync are in the address | [ui.md, section 1](engineering/ui.md#1-the-tabs) (Settings in the address) |

### Checks against other tools

| ID | Idea | Details |
| --- | --- | --- |
| A5 | Check sync caps against ffxiv-gearing | [validation.md, section 9](mechanics/validation.md#9-against-another-tool-ffxiv-gearing) |
