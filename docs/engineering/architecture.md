# Architecture

How the page is put together: its layers, how job-dependent behaviour is passed around, how the UI keeps itself up to date, what is saved in the browser, and how everything becomes one HTML file. It is written for a reader who knows JavaScript and basic software design but not this code base or the game. The math itself is in [math.md](../mechanics/math.md), the gear search in [optimizer.md](optimizer.md), and where the game data comes from in [data-pipeline.md](data-pipeline.md).

Related pages: [math.md](../mechanics/math.md), [optimizer.md](optimizer.md), [data-pipeline.md](data-pipeline.md), [testing.md](testing.md), [glossary.md](../glossary.md) (game terms such as job, slot and sync cap).

## 1. The system at a glance

**The question:** what runs where? The answer is short: the tool is a single web page with no server. Everything it needs, including the game data, is inside one HTML file that a browser opens straight from disk.

![Four layers stacked top to bottom: generated game data, core logic, UI state, and components with the page template; each is used by the one below. A bundler joins all layers into one HTML file that a browser opens from disk. Generator tests check the data layer, unit tests check the core logic and UI state, and a smoke test checks the finished HTML file in a real browser.](../diagrams/architecture-layers.svg)

The code is split into four layers. Each layer depends only on the layers above it, so the dependency graph has no cycles and each layer can be tested without the ones below:

| Layer | What it holds | Depends on |
| --- | --- | --- |
| 1. Generated game data | Budget tables, level data, item database, food table, job icons | nothing |
| 2. Core logic | Formulas, sync, speed, item queries, pieces and sets, recipes and the solver session, optimizer, accuracy checks | data |
| 3. UI state | Saved state, the shared store, and the settings as plain inputs | core |
| 4. Components and template | One component per page area | UI state, core |

Notes:

- **Data.** The item level budget table, per-level speed data, stat factor table, materia table, item database, food table and job icons. Produced by the data pipeline and never edited by hand. Row counts are in [data-pipeline.md, section 7](data-pipeline.md#7-facts-about-the-current-data).
- **Core.** Plain functions with no page and no browser storage. The only shared mutable state is the counter that numbers new pool items and a few lookup caches keyed by their pure inputs. The work kept between solves is not module state: it lives in a solver session object that the caller creates and passes in ([section 8](#8-recipes-and-the-solver-session)). Because nothing in it touches the browser, the core runs unchanged in Node, which is how the unit tests use it.
- **UI state.** It holds:
  - the saved state (defaults, repair on load, browser storage);
  - one shared store, with the current settings, the current job context, and the actions that change them;
  - two small pure modules the rest of the UI builds on. `settings.js` turns the store's fields into the plain inputs the core and the views take (each tab's panel, the sync settings). `ranks.js` holds the rule of the ranked stat menus.

  Neither module imports another UI module, so no import goes back up the layers: `state.js` and `helpers.js` use them, and nothing below the views imports a view.
- **Components.** Each assembles the plain inputs of its area from the store, hands them to a pure view builder (`src/ui/views/`) and keeps the ready-to-display "view" it returns. The HTML template binds to those views and to store actions.
- **The optimizer's worker.** One part runs off the page's thread. A set page's Fill and its Gear to search line go to a Web Worker with its own copy of the core logic, which parses the data texts the page hands it (`src/ui/solver.js`, `src/ui/solver-worker.js`; [section 9](#9-the-optimizers-worker)). If the browser will not run it, they run on the page's thread instead.

The page uses one runtime library, Alpine.js, for reactivity and templating. The build uses one tool, esbuild. Adding any other dependency is a decision for the owner (see `CLAUDE.md`).

## 2. The job context

**The question:** how does shared code know which job it is working for, without a global "current job" variable?

Almost everything depends on the selected [job](../glossary.md) (a character's combat class, such as Sage or Paladin). It decides:

- which stat is the main stat, and which speed stat applies;
- whether there is a special substat (Piety, Tenacity or none);
- whether the weapon is two-handed or a one-handed weapon plus shield;
- which gear slots exist, and how Vitality is scaled.

The 23 combat jobs fall into five role profiles that decide most of this (table in [math.md, section 1](../mechanics/math.md#1-terms)).

**An example.** Three jobs, as their contexts describe them (from running the code, 2026-10-16):

| | Sage | Paladin | Blue Mage |
| --- | --- | --- | --- |
| "main stat" means | Mind | Strength | Intelligence |
| "speed" means | Spell Speed | Skill Speed | Spell Speed |
| special substat | Piety | Tenacity | none |
| stats it has | 7 | 7 | 6 |
| weapon | two-handed | one-handed + shield | two-handed |
| weapon share (per mille) | 140 | 100 | 140 |
| active slot types | 10 | 11 | 10 |
| Vitality factor | 0.9 | 1 | 0.9 |
| level cap | 100 | 100 | 80 |

The tool computes all of this **once per job** into a *job context*: a small, frozen description of the job. Every core function that needs job information takes the context as its first argument. Nothing in the core reads "the current job" from anywhere else.

What a job context contains:

- **Stat keys and their meaning for this job.** Shared code always uses the same seven stat keys: `main` (main stat), `vit` (Vitality), `crit` (Critical Hit), `det` (Determination), `dh` (Direct Hit), `spd` (speed), `spec` (special substat). The context says that, for example, "main stat" means Mind for a healer and Strength for a tank, and "speed" means Spell Speed or Skill Speed. It also lists which of these the job actually has (six or seven stats) and their display names.
- **Weapon mode and slots.** Two-handed weapon, or one-handed weapon plus off-hand (Paladin, Beastmaster). This fixes the list of active slots for Piece stats and the slot filter, and the weapon's [slot share](../glossary.md) (140 or 100 per mille). Real pieces carry their own slot code, so a White Mage wand and shield, or a cloak that covers the head, use their own share and blocked slots in the browser and the optimizer.
- **Vitality factor.** 0.9 for Intelligence and Mind jobs, 1 otherwise. This is the factor the job's own gear carries. It is used only where no real item is involved (How the math works). A real piece uses its own stat factors, read from the game files for its kind ([math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item)).
- **Level cap.** 100, or the limited job's own: Blue Mage 80, Beastmaster 50 (a constant from the Lodestone patch notes; the game files have none, [math.md, section 1](../mechanics/math.md#1-terms)). The synced level and the equip level filter stop there, and gear above it is left out of the gear list and the search.
- **Position in the item database's job mask**, used to filter gear the job can equip ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)).

Three properties make contexts safe to pass around:

- **Cached:** asking for the same job twice returns the same object.
- **Frozen** (deeply): no caller can change one by accident.
- **Total:** an unknown job id gets the default job's context (Paladin).

**Why it is built this way.** Keeping the current job's stat mapping in shared mutable variables that every function read would let code that forgot to update them, or ran between two updates, see a mix of two jobs. An explicit, frozen context makes each function's job dependence visible in its arguments and lets the tests run any job side by side. The stat keys matter for the same reason: shared code that uses a job-specific stat name where a stat key belongs shows "undefined" (a Piece stats label did).

**From raw rows to stat keys.** The game database stores stats in a fixed raw order of 14 stats: all four main stats (Strength, Dexterity, Intelligence, Mind), Vitality, Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed. After them come the game's generic Main Attribute and Secondary Attribute.

One function in the item module turns a raw row into the job's stat keys, using the context; nothing else reads raw stat positions.

## 3. The UI pattern

**The question:** when the user changes one setting, how does every affected part of the page update, without recomputing expensive results more often than needed?

The answer is a one-way data flow: one store, one derived view per page area, and a template that only displays views.

![At page load the saved state is read from browser storage, repaired, and becomes the shared store. A change in the store re-runs each component effect that read it; the effect calls the core logic and derives a frozen view, which the template displays. User input calls store actions, which change the store again. The store is saved back to browser storage 150 ms after the last change.](../diagrams/architecture-ui-flow.svg)

### One shared store

All state that matters lives in one shared store: the saved settings, plus a few values that are not saved. The **current job context** is replaced whenever the job changes; until the user picks a job, the default job's context stands in. The **highest real item level** bounds the item level boxes. The GCD and Substat tiers sub-tabs keep **their own boxes** (a level, and for GCD a haste and a speed), each empty until typed in, so they follow the synced level until the user sets one. A Fill's result is not in the store: the set page keeps it as a suggestion until Apply or Discard.

There is no gear pool to keep: a Fill searches every piece the job can wear that passes the set's filters ([optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters) says why no pool is built), so the store holds only settings. Searching everything costs nothing in speed (building a job's gear takes about 5 to 10 ms; a whole search takes about 20 ms, see [optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

Changes go through store actions: set job, reset everything, switch tab or math sub-tab.

**The sheets' store.** The Sheets tab has a second store, `Alpine.store('sheets')` (`createSheetStore` in `src/ui/sheet-store.js`). It holds:

- the saved sheets;
- the open screen (`screen`: the manager, a sheet or a set, with `sheetId` and `setId`);
- the actions that make, edit, copy, delete and reorder sheets and gear sets, change a sheet's level and item level sync, and save a set (`updateSet`, for the set page).

The sheets are user data, not settings, so they stay out of reactive state: the store keeps them as plain data in its closure and counts its changes in `rev`. Every reader (`list`, `sheet`, `currentSheet`, `currentSet`) reads `rev` first, so a binding that shows a sheet tracks it, and every action bumps it.

The operations on the plain data (a new sheet or set, Copy sheet with the pieces the new job cannot wear cleared, names) are pure functions in `src/ui/sheet-ops.js`; what the open dialog's main button does with its fields is `src/ui/sheet-dialogs.js` (`submitDialog`). While `busy` is set (a Fill runs) every edit action is refused. The component (`components/sheets.js`) builds its views from the store with `viewCache`, keyed by `rev`, and keeps only the open dialog's fields and a row being dragged.

**The set page.** A set page is its own component (`components/set-page.js`), nested inside the Sheets tab's and re-created for each set it shows (the template keys it by the set's id), so nothing of one set's page outlives it. The component is composed of parts, one file each in `components/set-page/` (`frame.js`: start, stop and the focus after a draw; `view.js`: the set shown and its view; `menus.js`: the open menu; `draft.js`: edits by hand and pins; `fill.js`: a Fill and its suggestion; `settings.js`: the Fill settings dialog and the Gear to search count; `leave.js`: the question before leaving and the page's keys). Each part is a function returning its members, and `setPage` merges them into one object (getters kept), so the parts call each other through `this`. What they share (the page's element and refs, the solver) is passed to them.

- **What is saved when.** Nothing it proposes is saved until Apply: the manual draft (a second GearSet) and a Fill's suggestion live in the component only. A pin and the Fill settings go through `updateSet` at once.
- **The view.** Its `view` getter builds the table, the totals and the stat block of the set shown (the saved one, the draft, or the saved one with the suggestion taken) through `viewCache`, keyed by `rev`, the draft and the suggestion.
- **Edits by hand.** They are pure functions of plain data in `views/set-edits.js`; the piece picker (`views/piece-menu.js`), the materia menu (`views/stone-menu.js`) and the Food menu (`views/set-meal-menu.js`) are pure views too. The job's wearable pieces for the picker are built once per job and kept in a module `Map`, out of reactive state. The picker's lines (name, stats, sort order) are built once per job and slot (a `WeakMap` in `piece-menu.js`), the view is kept for the next read of it, and the picker and the Food menu draw their rows in steps (`views/limit-rows.js`, `ui/draw-in-steps.js`): about 30 rows when the menu opens, 40 more each frame, so the menu appears at once and no task is long.
- **A Fill.** It asks the page's solver (`solver.js`) with the set's id as the request's `key`, so a set's requests replace only that set's earlier ones, and sets the store's `busy` while it runs.
- **The leave guard.** The set page registers a **leave guard** on the store (`leaveGuard`). The store's moves off a set page (`openManager`, `openSheet`, `openSet` of another set, `closeSet`) call `askLeave(move)` first. While a draft, a running Fill or a waiting result is there, the guard keeps the move and asks; the answer runs it.

**Shared menus with another owner.** The Food row's menu (`components/meal-menu.js`) takes a `source` (where the menu comes from, what a pick does, which change closes it): the set page's `mealSource`. The Expansion and "Gear from" boxes (`gearFromToggles`, `expansionToggles` in `helpers.js`) take either a part of the shared store (`'browse'`) or an accessor `{read(component), write(component, patch)}`: the set page's reads and writes its set's Fill settings.

**Number inputs.** A number box bound to a setting uses one helper (`$num` in the template, `numberField` in `src/ui/helpers.js`) with two rules:

- **Range.** Values are rounded to a whole number (the Target GCD keeps hundredths). While typing, only an in-range value is committed, so a value on the way ("9" of "90") is held back rather than corrected under the user's cursor. On Enter or leaving the box, an out-of-range value moves to the nearest bound and the box shows it, so the box and the setting always agree. The box's `min` and `max` attributes come from the same bounds; a filter's bound of Infinity sets none, and its markup's `max` (the end of the real range) only stops the arrow keys.
- **When it commits.** A typed value is committed 300 ms after the last keystroke, or at once on Enter or when the field loses focus, so typing 123 never commits 1 and 12. A step (mouse wheel, arrow keys) commits at once, so the page follows the value as it scrolls (timeline in [Heavy work](#heavy-work-debounced-only-when-visible-or-on-request)).

The boxes that differ from those two rules:

| Box | Range | When it commits |
| --- | --- | --- |
| Gear filters (equip level, item level min and max, in both tabs) | any whole number from 1 up; an emptied box commits `''` (no limit) | the rules above |
| Target GCD | 0.50 to 2.50 seconds, in hundredths; a higher value moves to 2.50, the slowest base GCD | the rules above |
| Sync cap | no snapping (`snap: false`): it explains a bad value with its own error | the rules above |
| Synced level | the rules above | each valid value as it is typed |
| Substat tiers level | the rules above | each valid value as it is typed |

The Target GCD range is `TARGET_GCD_RANGE` in `settings.js`, also used by `restoreState`.

Two kinds of box keep their own handlers, on purpose:

- the GCD tab's level and speed correct what is typed and say so;
- the boxes that commit only on Enter or leaving (Piece stats' item level, the tiers' substat values), since a value on the way would be held to its range while typing.

**Changing the job.** Nothing but the job-specific selections is lost, so the page switches at once, without asking:

![Switching to any other job in the Job and sync panel, even one in the same role, happens at once without asking and changes only the open tab's selections. Kept when the new job can use it (a stat it has under the same name; a slot it wears), else reset to the new job's defaults. On How the math works: the Piece stats substats (Critical Hit, then speed; both stay or both reset) and slot (head, only if the new job lacks it). On the Gear browser: the slot (any slot) and the sort (item level). Held to the new job's level cap, lowered only if above it (90 becomes 80 for Blue Mage): the synced level and the Gear browser's equip level filter. Kept: sync cap and sync switch, the browser's Gear from boxes, market board switch, expansion and item level filters and search text, the Piece stats item level, the GCD and Substat tiers boxes, and the open tab. Not changed: the other tab's job and settings; a sheet has no panel, its job is set when it is made.](../diagrams/architecture-job-switch.svg)

**One panel per tab.** The Gear browser and How the math works each have their own Job and sync settings (job, cap, sync, level), saved in `browse` and `piece`. The store's top-level `job`, `cap`, `sync`, `level` and `jobCtx` are the open tab's copy, which the one panel on the page edits; `showTab` keeps the leaving tab's copy in its group and loads the new tab's.

- **Reading.** A component reads its own tab's panel through `store.panel(tab)` (`panelOf` in `settings.js`), so a hidden tab never works with the open tab's job.
- **Changing the job.** `setJob` resets only the open tab's selections (`resetForJob` takes the tabs to reset).
- **Restoring.** `restoreState` takes each group through `splitPanelSettings`, restores it for its own job, and gives an older save's single panel to both tabs.
- **The Sheets tab.** It has no panel (`PANEL_GROUP` has no group for it; each sheet holds its own job, level and sync). The panel is hidden there, going to it keeps the top-level copy as it was, and a save made on it restores the Gear browser's panel as the top-level copy.

**Reset to defaults** puts the open tab's settings back (its panel and its own fields), with no job chosen, after the browser's own confirmation dialog. The other tabs and the math sub-tab stay as they are.

### Each area derives a view

Every page area is a component that shows one **view** object. The view holds everything the template shows: formatted numbers, table rows, CSS classes, labels. The template only displays it.

The functions that build views are pure and live apart from the components, with no dependency on the UI framework. They take **plain inputs**, never the store:

- the job context;
- the sync settings (`syncSettings`);
- the area's own settings (the browser's filters, Piece stats' piece, a set's Fill recipe);
- for a Fill, a solver session.

A component assembles those inputs from its store (`settings.js` has the helpers, such as `syncSettings`). So the unit tests check what each tab shows directly. The views carry their text too (sentences, headings, the readout's lines), so the template does not build text from several fields.

**One pattern for derived views** (Gear browser, Piece stats, GCD, Substat tiers). The component has a getter, `view` (Piece stats: `pieceViews`, read through `explainer`, `steps` and the slider's getters), that reads the inputs from the store, makes a key of them, and asks a `viewCache` (`helpers.js`) for the view of that key. A new key builds the view; the same key returns the last one.

- Reading the inputs inside the getter makes every binding that shows the view track them, so the page updates in the same render as the setting.
- The template reads the view many times a render; the cache builds it once.
- The cache lives in the component's closure, not in its reactive state.

The Gear browser's getter returns its last view while its tab is hidden, so the list is built only while it can be seen.

**Results on request** (a set's Fill). Its result is not derived from the store on each change: **Fill** asks the solver for it, and the set page keeps it as a suggestion. What follows the set's Fill settings (the piece count, the greyed-out "Gear from" boxes, the Target GCD range) is one view, `gearToSearchView`. The set page asks the solver for it when the page opens, when its Fill settings open, and after each change of them (`refreshCount`). A newer answer replaces an older one.

Each component reads the job through its own `jobCtx` getter (the store's `jobCtx`), never through a parent component's scope; nested components that share a page area are named apart (Piece stats' `explainer` and `steps` around the GCD and tiers sub-tabs' `view`). The Food row's menu is its own component (`mealMenu`) inside the set page's. No component imports Alpine: `main.js` imports it and hands the set page its `raw` and the solver, so every component module loads in Node and its unit test binds it to a plain store.

**Large data never enters reactive state.** Alpine makes an object it holds reactive by wrapping it in a proxy, and wraps nested objects as they are read. A frozen object is left as it is. Keeping big lists frozen or outside the store avoids wrapping thousands of rows on every recompute:

- The item database is a plain module-level constant that the core reads directly. It is never placed in the store.
- The views with long lists (the gear browser's rows, a set page's table, the accuracy panel) are frozen before they are stored on the component. A set page's view is frozen all through (`deepFreeze` in `helpers.js`): with only its top frozen, `x-for` still wrapped each row it hands the template, and each cell read from a row, in a proxy.
- A menu inside a table (the piece picker, the materia menu, the Food menu) is built with `x-if` only while it is open, not hidden with `x-show`. Built hidden on every row, such menus were about four fifths of a result's elements and most of the time to draw it. The longest blocked main thread after a slow result went from about 90 to 25 ms, and from about 550 to 140 ms at 4× CPU throttle.
- The small parts of a set page's row that every worn piece shows (the pin, the gear category and source line, the stat cells) are the other way round: kept in every row and hidden with `x-show` while the row is empty. A Fill turns every empty row into a worn one at once, and building those parts with `x-if` then made about 700 elements in one task; now about 300 (the materia chips and the Take boxes, still built with `x-if`).
- The gear browser's rows are template markup (`src/index.html`), not HTML strings built in JavaScript. The view builder (`views/gear.js`) gives each row plain fields (`rowCls`, `nameParts` with a class each, `twice`, and per stat a cell with `cls`, `col`, `title`, `text`, `was`), so every binding is one property read and text goes through `x-text`, which never makes markup. A stat cell is one `td` and one span (5 bindings): the cap bar and the bold come from the `cut` class, and the muted number under the value is drawn by CSS from the cell's `data-was` attribute (`#gear-table td[data-was]::after`), not by a bound element. A page is 100 rows, and the time is the number of bindings. Measured at 4× CPU throttle on a busy machine (so ±15%), switching from Sheets to the Gear browser blocks the main thread for about 1.6 s at best (the first per-part templates: 1.6 to 1.8 s; one `x-html` string per row: 0.7 s), with 4,060 elements and 373 templates. Fewer templates, `x-show` instead of `x-if`, frozen rows, `x-bind` objects, unkeyed or indexed `x-for` and unrolled cells did not change the time; only fewer bindings per cell did.
- The database facts of a piece (`rowFacts` in `items.js`) are looked up through an index of rows by pool key, built on first use, and each key's facts are built when first asked for. The page's thread builds the index when it shows its first game piece (a Fill's first result). Building every key's facts there blocked it for about 25 ms (150 ms at 4× CPU throttle).
- The job's gear a Fill searches is built once per job, frozen, and kept in the solver session, which lives in the page's Web Worker ([section 9](#9-the-optimizers-worker)), never in reactive state. Frozen means the list and each pool item with its stats (`mkItem` in `items.js`), so the worker and the page's thread hold the same frozen objects, and `deepFreeze` stops at them.
- The set page reads its draft and suggestion through `Alpine.raw`, without the proxies, and sends the worker plain copies: a worker cannot be sent a proxy.

### Heavy work: debounced, only when visible, or on request

Cheap areas recompute at once; expensive ones wait, run only while the user can see them, or run only when asked:

| Page area | When it recomputes |
| --- | --- |
| Settings, How the math works | On every relevant change |
| Real-gear accuracy check | Once, when its panel is first opened |
| Gear browser | On a relevant change, while the Gear browser tab is open |
| A set's Fill | When the user presses Fill (the piece count under Gear to search: when the set page or its Fill settings open, and after each change of them) |

Notes:

- **Settings, How the math works** are cheap: a few formulas per piece; the explainer's curves (a few thousand generic pieces per setting) are remembered per setting, so a slider move costs a few milliseconds.
- **Accuracy check**: it scans every item in the database, so it runs only once.
- **Gear browser**: the database matches of its filters (including its own Gear from boxes and market board switch), with synced stats. It recomputes on any change of its filters, sort, job, cap, sync, level or page, and shows 100 matches a page; any change but the page goes back to page 1. Its layout is in [ui.md, section 3](ui.md#3-the-gear-browser-tab).
- **A set's Fill**: every piece the job can wear that passes the filters under the set's Gear to search (expansions, equip level, item level range, Gear from; the browser's filters with the set's own values). Its parts:
  - *When it runs:* only when the user presses Fill, not on a change of those filters or the set's Fill settings.
  - *Where it runs:* in a Web Worker, so the page stays responsive while it runs (tier ranking can take a few seconds); "Solving…" and Cancel show until the answer comes, and every edit on the Sheets tab is off ([section 9](#9-the-optimizers-worker)).
  - *Its answer:* a suggestion the set page keeps until Apply or Discard; nothing is saved before Apply ([ui.md, section 2](ui.md#2-fill-the-search-on-a-set-page)).
  - *On failure:* a search that fails (not a cancel) leaves the set as it was, with the line "Fill failed: <reason>." under the set's header.
  - *Limits and timing:* [node limit](../glossary.md) 700,000. The page records how long each search took as the `fill` performance measure (the first search for a job includes building its gear).

**How the waits work.** A typed number and the save are debounced: their timer restarts on every change, so typing 123 commits once and a burst of changes saves once. A set's piece count is asked for after each committed change of its Fill settings; the solver answers in the set's lane, so a newer request replaces one still waiting. Pressing Fill right after typing still searches with the value typed: the click first moves the focus out of the box, which commits it. Run times are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

![Timeline in milliseconds after typing 1, 12 and 123 into the sync cap, 100 ms apart as an example. The field commits only 123, 300 ms after the last keystroke (Enter or leaving the field commits at once). When the store changes, Settings, How the math works and the open Gear browser recompute at once; a set's Fill on the Sheets tab does not run; the saved state is written 150 ms later. The field's wait and the save's restart on every change. A box in a set's Fill settings commits the same way, then asks for its Gear to search count at once.](../diagrams/architecture-timing.svg)

## 4. Persistence

**The question:** what does the page remember between visits, and what happens when the remembered data is wrong?

The page remembers the user's settings in the browser's local storage. This is a convenience for one viewer on one browser: the page renders correctly without it, and every read and write is guarded, so a private window or blocked storage simply starts from the defaults.

**What is saved.** One JSON object under one key: job, sync cap, sync on or off, character level, open tab and math sub-tab, the Piece stats inputs (slot, substats, item level), browse filters and sort with its Gear from boxes and market board switch. The saved sheets have their own records (below). The job context, the job's gear, views and browse results are not saved; they are rebuilt.

**When.** One effect serializes the whole saved object (the sheets are saved separately, on their own edits), which makes it depend on every saved field, and writes it 150 ms after the last change.

**Validation on restore.** Stored data can be old, from another job's role, or hand-edited, so it is never trusted:

![Restoring splits the saved settings into one panel per tab (an older single panel goes to both), starts each tab from the defaults for its own job, then keeps each saved field only if it has the right type and range, else uses its default. Example from running the code, a save with the math tab for Blue Mage (level cap 80) and the Gear browser for Sage. The old tab name "pool" becomes the Gear browser; job Blue Mage is kept; level 95 becomes 80; sync cap 9999 becomes 795; Piece stats slot off-hand becomes head; substats speed, speed, Critical Hit become speed, none. The browser's job Sage and level 95 are kept; its sort by Tenacity becomes item level; an older save's Gear optimizer settings are dropped.](../diagrams/architecture-restore.svg)

A saved job id that is not a known job means no job is chosen; the job-dependent defaults then come from the default job until the user picks one. The rules for each field:

- numbers are rounded and clamped (item levels to 1 to 795, the highest real item level; character level to 1 to the job's level cap, 100 or the limited job's own);
- choices (tab, slot, stat, sort, filter) must be one of the values valid for this job;
- substat lists drop unknown or repeated entries, and an older third substat rank is dropped;
- older saves are translated: the math sub-view stored as the tab, the Gear pool tab (the Gear browser), and the one gear-group list that served both tabs (the browser starts from it). A saved pool is ignored, and so are an older save's search settings (`opt`, `optPanel`): a search's settings live on each gear set of a sheet. A list of left-out boxes with a key that is no box (such as an old save's six gear groups) starts over from the default boxes.

An invalid field falls back to its default and the valid ones are kept. The state unit tests cover this field by field ([testing.md, section 2](testing.md#2-what-each-file-covers)).

**Saved sheets.** Sheets are the first user data, so they are not in the settings object. `src/ui/sheet-storage.js` keeps them under two more keys of the same family:

- `ilvl-stat-lab-v4:sheets`: the index, `{v: 1, order}`, the sheet ids, first is top.
- `ilvl-stat-lab-v4:sheet:<id>`: one whole sheet, its gear sets inside.

A save writes its own record, plus the index when the sheet is new (it goes to the top).

- **Unreadable records.** A record that is not valid JSON, has a version other than 1 or an unknown job is never repaired or deleted by itself. `loadSheets` lists it in `unreadable` with its cause, and `deleteSheet(id)` (the Delete button, after asking) removes it.
- **Index mismatches.** An index id with no record is skipped; a record the index lacks is added at the end.
- **A save that fails.** It returns `{ok: false, reason: 'quota' | 'unavailable', message}` and leaves the sheet it was given unchanged, so the page keeps the edit in memory and shows the message.
- **Migrations.** There are none until roadmap A17; the shape may change freely before then.

The sheets' store (section 3) reads the records at load. It reads them again each time the manager or a sheet opens, so a change made in another browser tab shows; the last write wins per sheet. It writes one record on each edit, plus the index when a sheet is added, deleted or moved.

A save that fails keeps the edit in the store, puts the message on the page, and keeps that sheet from memory when the list is read again. With storage unavailable nothing is written and the sheets last until the page closes.

**Piece identity.** Anything kept that names a piece of gear refers to it by its **gameId**, the game's item id (the `Item.csv` row), and no name is stored (a view finds the name from the id, or says "missing item <id>"). `itemById` finds the database row of an id; the index is built once, on first use.

Two other keys exist and are not identities:

- a pool item's `id` is made fresh on every page load;
- the pool key (name, slot, item level) only groups the same piece from several sources, as the menus do.

Several rows could share a pool key, and a name can change in a patch; a gameId does neither.

No saved setting names a piece. A saved sheet's gear sets do: each row's piece by its gameId and its stones, and the meal by its key (meals have no gameId in the data) ([section 7](#7-pieces-and-sets-in-the-core)).

**Storage key versioning.** The key carries a version suffix (currently `-v4`). While the site has no users, a new field needs no bump: the restore step defaults and repairs it. Once it has users, bump the suffix only when old data cannot be repaired field by field.

## 5. Build

**The question:** how do many source modules and a data set become one file that works offline?

The build turns the source modules into one self-contained file in three steps:

1. **Bundle.** esbuild starts from the entry module and follows every import: Alpine, the UI, the core, the generated data, and the stylesheet.
   - Each `src/data/*.json` becomes a `JSON.parse` call on its compacted text (the `jsonParseData` plugin: browsers read JSON faster than the same object as code; data-pipeline.md section 8).
   - It writes one minified script and one stylesheet, in memory. The script is a self-running function, for Chrome 97, Firefox 104 and Safari 15.4 and later: `BROWSER_TARGETS`, set by the newest JS API the page calls, `findLast`. esbuild adds the CSS prefixes those need.
2. **Inline.** The HTML template has markers for the styles, the script and the build marks. The build replaces them with the stylesheet, the script and, on any branch but `main`, a "DEV" test-build badge next to the title plus the branch and commit in the footer. A `main` build, which is what deploys, has no marks. The branch comes from GitHub Actions' `GITHUB_REF_NAME` when set, else from git; with neither (or a detached checkout) there are no marks.
   The optimizer's Web Worker is a second bundle, built inside the first by the `solverWorker` plugin from `src/ui/solver-worker.js` and inlined into the page's script as a string ([section 9](#9-the-optimizers-worker)).
3. **Checks.** The build stops with an error if a marker is missing, if there is no script output, or if the script contains the text `</script` (which would end the inline script early). A unit test fails the check if the page passes 4 MB (`tests/unit/scripts-build.test.js`).

**Licence notices.** esbuild runs with `legalComments: 'eof'` (its default), which moves every legal comment in the bundled code to the end of the page's script; that covers the `@vue/reactivity` and `@vue/shared` notices Alpine vendors. Alpine itself ships no licence file and no copyright comment, so none is invented for it: the page's footer carries the project's own copyright line instead, and the README lists what is bundled.

The page loads nothing at run time except two kinds of font:

- **Web fonts**, which come from Google Fonts when online.
- **The Lodestone symbol font for the HQ mark**, hotlinked from the community mirror ewwwin/ffxiv-symbol-fonts, pinned to one commit and served by jsDelivr (`@font-face` in `styles.css`; never bundled, since no Square Enix licence names the font and the mirror has no licence file).

The HQ mark is plain "(HQ)" until `ui/hq-font.js` sees the font load and adds `html.hqfont`, which swaps in the glyph. Without a connection the page falls back to system fonts and still works.

Because the data is part of the script rather than fetched, the page works from a `file://` address, where browsers refuse to fetch local files. The size of the page and its parts is in [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page).

**First paint.** The script is the last thing in the file, and the browser paints the markup above it while it is still reading the script, before Alpine has run. Until then every `x-show` element shows, whatever its condition, and no `x-text` has its text. The page root (`<div class="wrap">`, which holds the whole body) carries `x-cloak`, hidden by `styles.css` until Alpine removes it once it has built the page, so the first frame shows the finished page with the open tab. `tests/unit/scripts-build.test.js` checks the root is cloaked and holds everything; the smoke test's `checkFirstPaint` records every frame from the first, on each tab and after a reload from a set page.

**Why one file:** the owner opens it locally and can keep or share it as a single file. No server, no install, no version mismatch between page and data.

## 6. Development loop

**The question:** how does a change go from an edit to a checked page?

The steps are: install once, work, check, look. Every command, with how long it takes, is in the [root README](../../README.md#develop); this section adds what each step does.

- **Install** (`npm install`, or `npm ci`; it installs esbuild, Biome, Playwright and Alpine). Biome does lint and format; Playwright drives the browser for the smoke test (run `npx playwright install chromium` once). The project requires Node 22 or later.
- **Work** (`npm run dev`). The page is rebuilt (not minified) whenever a source file or the HTML template changes, and the output folder is served on a local address the command prints. Reload the browser to see a change.
- **Check** (`npm run check`: lint, build, all tests). Lint, format check, build, unit tests, browser smoke test. It must pass before a change is called done. The generator tests (Python) and the Python lint run in `npm run check:all`, needed when the data pipeline changes.
- **Look** (open the built page at the five viewports in [testing.md, section 3.1](testing.md#31-viewports-to-look-at-for-ui-changes), from 960 px up to 2560 x 1440). The page must never scroll sideways; wide tables scroll inside their own box.

Tests are described in [testing.md](testing.md). After a game patch, the data is refreshed with the steps in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

## 7. Pieces and sets in the core

**The question:** where do the rules live that turn chosen gear into what the page shows? In three core modules, so a Fill's answer and a gear set chosen by hand go through the same code.

| Module | Holds | Used by |
| --- | --- | --- |
| `piece.js` | A piece under sync: the item level it is synced to (`itemSyncIlvl`), its stats there (`effStats`), the most each stat can be (`itemCaps`, `meldCaps`), whether it keeps its melds (`keepsMelds`) | the optimizer, `meld.js`, `set.js`, the views |
| `meld.js` | The meld rules (gates, high grades only in the big slots, caps), used both to find the best stones (`bestMeld`, `meldVersions`) and to apply a given list (`applyStones`), and to list the grades a slot takes (`slotGrades`, the set page's materia menu), and the shown overmeld odds (`overmeldChance`, `overmeldNumber`, `usesNqOvermeldRates`) | the optimizer, `set.js`, `views/set-page.js` |
| `set.js` | A gear set as plain frozen data (`makeSet`, `setFromPicks`) and what it adds up to (`evaluateSet`) | `recipe.js`, the set page's views |

**A gear set** (`set` in the code) is `{pieces, meal}`. Each piece is `{slot, gameId, stones}` for a database piece, `{slot, custom, stones}` for a piece not from the database, or `{slot}` for an empty slot. `stones` holds one entry per meld slot, `{stat, grade}` or null. `meal` is a meal's key, or null. Job, level and sync are not part of a gear set. They are passed to `evaluateSet`, as one gear sheet will hold them for all its gear sets. A gear set refers to database pieces by game id ([section 4](#4-persistence), "Piece identity").

**`evaluateSet(job, set, sync, level)`** returns everything a set page's table shows:

- per row: the piece's stats after sync and stones, its caps, melds, stones lost to a cap or removed (sync, gate, slot), its category and where it comes from;
- the gear totals, the meal's bonus and the totals with it, the character's base;
- each stat's tier, defense, the GCD and DoT/HoT bonus.

The solve (`runRecipe`, [section 8](#8-recipes-and-the-solver-session)) builds the gear set from the result's rows (`setFromPicks`). The set page puts that set on its rows and calls `evaluateInSheet` on it (`views/set-totals.js`), adding only what belongs to the page: the goal's marks, the piece picker, the materia and Food menus, and the text.

**Custom pieces** have a place in the model, but no editor yet. A custom piece is a pool item the gear set carries itself. The database facts the core reads through `rowFacts` in `items.js` (equip level, meld slots, slot code, item kind, gear category, its own weapon damage and defense) are null for it today. So it is never level-synced, takes stones only if it carries its own `meld` field (`{slots, overmeld}`, as the math tab's generic pieces do), uses the job's slot share and stat factors, and gets the item level table's weapon damage and defense. A custom piece the player can edit will need those fields on the item itself, or chosen defaults:

- an equip level, for level sync;
- meld slots and overmelding, for its stones;
- a slot code and item kind, for its slot share, stat factors, weapon damage and defense.

A relic whose substats the player allocates (roadmap A11) is the same case: a custom piece with a budget.

## 8. Recipes and the solver session

**The question:** how is a search asked for, and what is kept between searches? A **recipe** says what to look for: a set's Fill settings (`fillRecipe` in `views/fill-settings.js`: goal and tiebreaks, the filters under Gear to search, materia, food, the Target GCD and its mode, rank by tier). `runRecipe(job, sync, level, recipe, session, choices, pins)` in `src/core/recipe.js` solves it and returns `{status, set, record, found}`:

- **status:** `ok`, or why there is no gear set (`excluded`, `noset`, `nogcd`, `infeasible`, `badpin`: a pin cannot be kept, listed in `found.badPins`).
- **set:** the gear set the result shows, as plain data ([section 7](#7-pieces-and-sets-in-the-core)): each row the player's pick where it still gives the same result, else the easiest piece that does; the meal the Food row shows.
- **record:** how the gear set was made: job, sync, level and a frozen copy of the recipe, so a gear set keeps the goal it was solved for whatever changes later.
- **found:** what the display needs beyond the gear set: the rows' menus of pieces with the same result, the meals with the best's result, the stats tier ranking holds, the Target GCD facts, the node limit note.

`choices` are picks on a last result (`{pieces: {row: gameId}, meal}`), not saved; the page passes none. `pins` are what the solve must keep, `{pieces: [{slot, gameId, stones}], meal}`: a set's pinned rows and meal. A pinned piece is worn with exactly its stones, counts in the totals, tiers and a Target GCD, and need not pass the recipe's filters; a pinned meal is the meal even with Food off; the search fills the other slots (`resolvePins`; [optimizer.md, section 2](optimizer.md#the-game-rules-in-the-model)). A subset of the pins is a partial fill. The solver's handler calls `runRecipe` through `solveView` (`views/solve.js`), which returns the plain set; the set page evaluates it (`evaluateSet`) and formats it.

**The solver session** (`makeSession` in `src/core/session.js`) holds what a solve keeps for the next one. The page has one, in the solver's worker ([section 9](#9-the-optimizers-worker)), shared by every set page. It keeps, per kind, its last four entries (least recently used dropped first):

| Kind | Holds | Its key depends on |
| --- | --- | --- |
| gear | every piece the job can wear, as frozen pool items (5 to 10 ms to build; the meld caps are cached per pool item, so the same objects keep them warm) | the job |
| tier | tier ranking's candidate lists (it keys them inside by objective, limits and GCD mode) | the pool: job, sync, level, Gear to search, materia |
| fast | the fastest GCD the pool reaches | the pool, and the meal |
| prep | Target GCD's candidate lists | the pool, the goal and the GCD mode (not the GCD) |
| same | every piece as a candidate for the goal, unpruned (the rows' menus) | the pool and the goal, and the GCD mode while a GCD is asked |

Every key is made by one function, `recipeKey`, from one table of the recipe fields each kind depends on, so a new recipe field cannot be forgotten in one key and remembered in another. A unit test changes every field and checks which keys change. So typing a new Target GCD reruns only the search, a pick from a menu reruns the search on kept lists, and going back to a recent setting reuses its lists.

## 9. The optimizer's worker

**The question:** how does a search of several seconds leave the page responsive? Under a Target GCD with tier ranking a search can hold a thread for seconds. A set page's Fill and its Gear to search line run in a Web Worker; the page thread only sends the request and shows the reply.

| Part | Where | What it does |
| --- | --- | --- |
| Request | `solverRequest` in `src/ui/solver.js` | Plain data: the kind (`solve` or `gearToSearch`), the job's id, the sync settings, the level, the recipe, the optional `key` (the caller: a set's id) and `pins` (the slots a Fill keeps; sent only when there are some) |
| Handler | `makeSolverHandler` | Runs `solveView` or `gearToSearchView` with its own solver session; replies `{result, ms}`, or `{error}` |
| Worker | `src/ui/solver-worker.js` | Answers each message with the handler's reply, tagged with the request's id |
| Worker solver | `workerSolver` | Page side: starts the worker on the first request, posts requests, routes replies by id, replaces the worker on Cancel, falls back |
| Page-thread solver | `inProcessSolver` | The handler on the page thread: the unit tests, and the fallback |

Notes:

- **One file, from `file://`.** The worker's code is a string in the page's script; `main.js` starts it from a Blob URL. Chromium and Firefox run a Blob-URL worker from a `file://` page (checked with Playwright: Chromium, and Firefox 155 and 157 with no page errors); Safari is not checked.
- **The data, held once.** The worker needs the item database and the other data files, but the page does not carry a second copy. Each data module of the page also exports its text (`jsonParseData`), and the page posts those strings to the worker as its first message; the worker parses them on its own thread. The worker's bundle is wrapped to run on that message, since its data modules read the texts while it loads. The page grows by the worker's code only, about 83 KB ([data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)).
- **Started when needed.** The worker starts on the solver's first request: the Gear to search line a set page asks for as it opens. The page's first paint does not wait for it.
- **One copy of the job's gear.** The solver session lives in the worker, so the page thread never builds the job's gear.
- **Newer requests.** One request per kind is in the worker at a time. A newer one waits and replaces any request already waiting from the same caller, whose caller gets the newer one's reply, so settings changed during a long search are not all solved in turn. A caller is named by the request's optional `key` (a gear set's id, say): requests with different keys never replace each other and each gets its own reply; requests without a key count as one caller. The set page drops a reply it no longer wants (`fillId`, `countId`). A newer request does not stop the one in the worker: only Cancel does.
- **One worker for both kinds.** A worker runs one request at a time, so the Gear to search line waits behind a running search. A filter changed during a long search updates the line when the search ends (measured: 1,248 ms after the change, in a 1.45 s Warrior search). Cancel ends the wait at once. A second worker would parse the data again (about 50 ms) and keep a second copy of the job's gear.
- **Cancel.** A set page's Cancel (`cancelFill`) returns the page to idle at once, with the set as it was and the line "Fill cancelled.", and calls the solver's `cancel('solve', key)` with the set's id.
  - *The restart:* a worker cannot be interrupted mid-search, so when a search is in the worker, `workerSolver` terminates the worker and starts a fresh one at once. The new worker is handed the data texts again and parses them; its session builds the job's gear again.
  - *The callers:* the cancelled search's caller, and any search waiting behind it, get a cancelled error (`isCancelled`), which the component ignores.
  - *Gear to search:* requests not yet answered are posted to the new worker; with none, the last one is asked again, so the new worker builds the job's gear before the next search.
  - *When:* always when a search is in the worker. The restart costs about 0.2 to 0.5 s over a warm search, while letting the search finish can cost the rest of it, 1 to 3 s for a long Target GCD search.
  - *Measured* (Playwright): Warrior, level 100, Target GCD 2.30, food, two tiebreaks, cancelled at 0.3 s. The next quick search showed after 0.5 to 0.85 s instead of 1.25 to 1.6 s.
  - *Nothing to stop:* with no search in the worker (it already replied), or on the page-thread fallback, Cancel only drops the reply (`fillId`). A page-thread solve still waiting for its two frames is dropped before it starts.
- **Timeout.** A request still in the worker after 60 s (`SOLVER_TIMEOUT_MS`) is stopped the same way as a Cancel, but its callers get an error, "no answer after 60 s", so the page shows it as a failed search. The slowest search measured is 18 s (tier ranking with a Target GCD, under eight parallel sweeps; [perf-log.md, section 4.1](perf-log.md#41-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)). A Gear to search request takes 20 to 100 ms. So 60 s leaves a slow device three times the slowest and still ends a worker that will never answer.
- **Fallback.** If the worker cannot be made, fails to load or crashes, or a reply cannot be read on the page (a `messageerror` event), every request not yet answered is asked again on the page thread. A smoke group checks it with no `Worker` and with a worker that fails to load. The page thread's solver blocks the page, so the set page then waits two frames before asking, and "Solving…" is painted first.
- **Times.** The worker times each request itself. The `fill` performance measure is that time, the search's own, not the wait for the reply.

## Where this lives

| Concept | File |
| --- | --- |
| Generated data (never edit by hand) | `src/data/item-level.json`, `src/data/items.json`, `src/data/food.json`, `src/data/job-icons.js`, `src/data/gear-groups.json`, `src/data/max-speed.json` |
| Data generators (`regen.py` runs them in order; the last, in Node, writes `max-speed.json`) | `scripts/data/gen_item_level.py`, `gen_items.py`, `gen_gear_groups.py`, `gen_food.py`, `gen_job_icons.py`, `gen_max_speed.mjs` |
| Tables and limits derived from the data | `src/core/tables.js` |
| Jobs, role profiles, slots, slot shares, raw stat order | `src/core/constants.js`, `src/core/item-format.json` |
| Job context | `src/core/job-context.js` (`makeJobContext`, its `activeSlotTypes`, `specKind`, `vitFactor` and `maxLevel`; `statColumn`); level caps in `src/core/constants.js` (`JOB_LEVEL_CAPS`) |
| Raw row to stat keys, item filters, pool item ids | `src/core/items.js` (`dbStats`, `browseItems`, `gearFilter`, `filterGear`, `poolItemFromRow`) |
| Gear groups (which jobs share gear) and the pieces a job cannot wear, by job mask | `src/core/gear-groups.js` (`GEAR_GROUPS`, `copyTargets`, `piecesJobCannotWear`) |
| Piece identity: a database piece by its game id; the same piece from several sources | `src/core/items.js` (`itemById`, `poolItemById`; `poolKey`) |
| A piece under sync | `src/core/piece.js` (`itemSyncIlvl`, `effStats`, `itemCaps`, `meldCaps`, `keepsMelds`) |
| A gear set and what it adds up to; a given list of stones on a piece | `src/core/set.js` (`makeSet`, `setFromPicks`, `evaluateSet`); `src/core/meld.js` (`applyStones`) |
| Item stat rounding steps and the off-hand rule, written once | `src/core/formulas.js` (`statLine`, `offhandParts`) |
| Per-level game data (ParamGrow: base speed, level divisor, level sync item level) | `src/core/level-params.js` (`levelParams`, `clampLevel`) |
| Meal choice (totals with food, then food points, then the first) | `src/core/food.js` (`pickMeal`, `mealTotals`, `bestFood`); Target GCD and tier ranking share their defaults through `goalSettings` in `src/core/target-gcd.js` |
| Other core modules | `src/core/formulas.js`, `gear-groups.js`, `sync-target.js`, `speed.js`, `tiers.js`, `meld.js`, `piece.js`, `set.js`, `recipe.js`, `session.js`, `food.js`, `target-gcd.js`, `tier-rank.js`, `same-result.js`, `damage-defense.js`, `validation.js`, `optimizer/` |
| Entry point: restore, register the two stores and the components, save effect | `src/main.js` |
| Saved state: defaults, job reset, restore and repair, storage key | `src/ui/state.js` (`defaultState`, `defaultBrowse`: the browser's defaults, `resetForJob`, `clampLevels`, `splitPanelSettings`, `restoreState`, `STORE_KEY`, `SEARCH_MAX_LENGTH`) |
| Saved sheets: the index and one record per sheet, read, write, order, delete, the full-storage and unavailable-storage results | `src/ui/sheet-storage.js` (`loadSheets`, `saveSheet`, `saveOrder`, `deleteSheet`, `parseSheet`, `storageAvailable`) |
| The sheets' store: the sheets out of reactive state (`rev`), the open screen, the actions, the edit lock while a Fill runs | `src/ui/sheet-store.js` (`createSheetStore`: `list`, `sheet`, `currentSheet`, `currentSet`, `openManager`, `openSheet`, `openSet`, `closeSet`, `createSheet`, `editSheet`, `copySheet`, `deleteSheet`, `moveSheet`, `stepSheet`, `setLevel`, `setSyncOn`, `setCap`, `newSet`, `copySet`, `deleteSet`, `editSet`, `updateSet`, `moveSet`, `stepSet`, `busy`, `leaveGuard`, `askLeave`) |
| Sheets and gear sets as plain data: new, copied, Copy sheet's cleared pieces, names, moving a row | `src/ui/sheet-ops.js` (`newSheet`, `newGearSet`, `copyGearSet`, `copySheet`, `piecesToClear`, `cleanName`, `cleanDescription`, `copyName`, `defaultSheetName`, `defaultSetName`, `moveItem`, `NAME_MAX_LENGTH`) |
| What a Sheets dialog's main button does: the fields to the store call of its kind, the refused-form error, the blank name put back | `src/ui/sheet-dialogs.js` (`submitDialog`, `shownName`) |
| Shared store and actions | `src/ui/store.js` (`createAppStore`: `panel`, `showTab`, `setJob`, `resetAll`, `persisted`; `PERSISTED_KEYS`) |
| The store's settings as plain inputs: each tab's panel, sync settings, the cap Piece stats shows, the Target GCD range, the default Gear from boxes | `src/ui/settings.js` (`panelOf`, `PANEL_GROUP`, `syncSettings`, `levelSyncOn`, `shownSync`, `TARGET_GCD_RANGE`, `DEFAULT_EXCLUDE`) |
| The ranked stat menus (one rank per stat, swaps) | `src/ui/ranks.js` (`rankChoices`, `withRank`, `uniqueRanks`) |
| The view pattern, frozen views, number-field binding, "Gear from" boxes | `src/ui/helpers.js` (`viewCache`, `deepFreeze`, `numberField`, `storeNumberField`, `gearFromToggles`, `expansionToggles`) |
| View builders (pure, unit-tested) | `src/ui/views/` (`piece.js`, `sync-explainer.js`, `gcd.js`, `gear.js`, `tiers.js`, `solve.js`, `meal-menu.js`, `fill.js`, `saved-set.js`, the set page's views (`fill-settings.js`, `set-edits.js`, `piece-menu.js`, `stone-menu.js`, `set-meal-menu.js`) and the sheet views below); charts in `src/ui/sync-charts.js` (SVG for `x-html`; every name passed in goes through `escapeXml`) |
| Gear browser rows a page, page numbers shown | `src/ui/views/gear.js` (`PAGE_SIZE`, `PAGE_SLOTS`) |
| A recipe and its solve; the pool it searches; the page's node limit | `src/core/recipe.js` (`runRecipe`, `recipePool`, `emptyGearFrom`, `askedGcd`, `gcdRange`, `recipeKey`, `NODE_LIMIT`) |
| The solver session; the job's gear it keeps | `src/core/session.js` (`makeSession`, `SESSION_SIZE`); `src/core/items.js` (`jobGear`) |
| What the solver answers for a Fill: the Gear to search line, the solve | `src/ui/views/solve.js` (`gearToSearchView`, `searchCount`, `solveView`, which takes the Fill's pins and answers `badpin` with plain messages) |
| The Food menu's list: meals passing the filters, their lines, sort | `src/ui/views/meal-menu.js` (`mealMenu`, `mealList`, `mealsPassing`, `sortMeals`) |
| Which rows of a saved set hold a piece, row labels | `src/ui/views/saved-set.js` (`usedRows`, `holdsPiece`, `rowLabel`, `sameRow`) |
| Partial fill of a saved gear set: the pins, the "Fill N unpinned slots" count, the result put back on the open rows, bad-pin messages | `src/ui/views/fill.js` (`fillPlan`, `applyFill`, `dropBadPins`, `badPinMessages`) |
| A set page: its Fill settings and recipe, the goal line, edits by hand (a piece, a stone, the meal, a pin), the piece picker, the materia menu, the meal menu; the grades a meld slot takes | `src/ui/views/fill-settings.js` (`defaultFillSettings`, `fillSettingsOf`, `fillRecipe`, `goalText`), `set-edits.js` (`placePiece`, `withStone`, `withoutStone`, `withMeal`, `withPin`), `piece-menu.js` (`piecePickerView`), `stone-menu.js` (`materiaMenuView`), `set-meal-menu.js` (`setMealMenuView`); `src/core/meld.js` (`slotGrades`); the component `src/ui/components/set-page.js` and its parts in `src/ui/components/set-page/` |
| Sheet view builders: a saved sheet and its gear sets as plain view objects (see the notes below the table) | `src/ui/views/sheet-manager.js`, `sheet-sets.js`, `sheet-forms.js`, `set-rows.js`, `set-totals.js`, `set-draft.js`, `set-suggestion.js`, `sheet-text.js` |
| The page's solver: requests, the handler, the worker and page-thread solvers; the worker's entry; starting it | `src/ui/solver.js` (`solverRequest`, `makeSolverHandler`, `workerSolver`, `inProcessSolver`); `src/ui/solver-worker.js`; `src/main.js` (`startSolverWorker`) |
| Components | `src/ui/components/` (`page.js`, `sync-explainer.js`, `gcd.js`, `gear.js`, `meal-menu.js`, `tiers.js`, `sheets.js`, `set-page.js`) |
| Template, partials and styles | `src/index.html`, `src/partials/`, `src/styles.css` (see the notes below the table) |
| Build and dev server; the worker bundle | `scripts/build/build.mjs` (`solverWorker`, `jsonParseData`), `scripts/build/dev.mjs` |
| Node version, scripts, dependencies | `package.json` |
| Lint and format configuration | `biome.jsonc`, `pyproject.toml` |
| Diagrams | `docs/diagrams/architecture-layers.svg`, `docs/diagrams/architecture-ui-flow.svg`, `docs/diagrams/architecture-job-switch.svg`, `docs/diagrams/architecture-timing.svg`, `docs/diagrams/architecture-restore.svg` |

Notes on three rows of the table:

- **Sheet view builders** (`views/sheet-manager.js`, `sheet-sets.js`, `sheet-forms.js`, `set-rows.js`, `set-totals.js`, `set-draft.js`, `set-suggestion.js`, `sheet-text.js`) build:
  - the manager list, a sheet's page and set list;
  - the dialogs (New sheet, Copy sheet with its pieces to clear, Name and description, Delete);
  - a set's rows with materia chips, cap marks and Take boxes;
  - the Total, Tier and Defense rows and header figures with delta lines;
  - a manual draft's changes, a Fill suggestion, and the Fill answers that are no suggestion (bad pins, no set).
- **Template.** `src/index.html` has the markers `<!-- STYLES -->`, `<!-- SCRIPT -->`, `<!-- BUILD_BADGE -->`, `<!-- BUILD_INFO -->`, and `<!-- INCLUDE name.html key=value -->` for a partial.
- **Partials and styles.** `src/partials/` holds the Expansion and "Gear from" menus, one copy for the optimizer, the browser and a set page's Fill settings, filled in by `expandIncludes` in the build. `src/styles.css` is grouped by area: tokens, base, controls, layout, shared pieces, tables, popovers, menus, then each tab.
