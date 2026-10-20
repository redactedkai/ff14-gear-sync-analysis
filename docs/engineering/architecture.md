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
- **Core.** Plain functions with no page and no browser storage. The only shared mutable state is the counter that numbers new pool items and a few lookup caches keyed by their pure inputs. The work kept between optimizer solves is not module state: it lives in a solver session object that the caller creates and passes in ([section 8](#8-recipes-and-the-solver-session)). Because nothing in it touches the browser, the core runs unchanged in Node, which is how the unit tests use it.
- **UI state.** The saved state (defaults, repair on load, browser storage), one shared store that holds the current settings, the current job context, and the actions that change them, and two small pure modules the rest of the UI builds on: `settings.js` turns the store's fields into the plain inputs the core and the views take (the sync settings, the optimizer's recipe, the key that tells when they change), and `ranks.js` holds the rule of the ranked stat menus. Neither imports another UI module, so no import goes back up the layers: `state.js` and `helpers.js` use them, and nothing below the views imports a view.
- **Components.** Each assembles the plain inputs of its area from the store, hands them to a pure view builder (`src/ui/views/`) and keeps the ready-to-display "view" it returns. The HTML template binds to those views and to store actions.

The page uses one runtime library, Alpine.js, for reactivity and templating. The build uses one tool, esbuild. Adding any other dependency is a decision for the owner (see `CLAUDE.md`).

## 2. The job context

**The question:** how does shared code know which job it is working for, without a global "current job" variable?

Almost everything depends on the selected [job](../glossary.md) (a character's combat class, such as Sage or Paladin): which stat is the main stat, which speed stat applies, whether there is a special substat (Piety, Tenacity or none), whether the weapon is two-handed or a one-handed weapon plus shield, which gear slots exist, and how Vitality is scaled. The 23 combat jobs fall into five role profiles that decide most of this (table in [math.md, section 1](../mechanics/math.md#1-terms)).

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

- **Neutral stat names and their meaning for this job.** Shared code always uses the same seven role-neutral names: main stat, Vitality, Critical Hit, Determination, Direct Hit, speed, special substat. The context says that, for example, "main stat" means Mind for a healer and Strength for a tank, and "speed" means Spell Speed or Skill Speed. It also lists which of these the job actually has (six or seven stats) and their display names.
- **Weapon mode and slots.** Two-handed weapon, or one-handed weapon plus off-hand (Paladin, Beastmaster). This fixes the list of active slots for Piece stats and the slot filter, and the weapon's [slot share](../glossary.md) (140 or 100 per mille). Real pieces carry their own slot code, so a White Mage wand and shield, or a cloak that covers the head, use their own share and blocked slots in the browser and the optimizer.
- **Vitality factor.** 0.9 for Intelligence and Mind jobs, 1 otherwise. This is the factor the job's own gear carries. It is used only where no real item is involved (How the math works). A real piece uses its own stat factors, read from the game files for its kind ([math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item)).
- **Level cap.** 100, or the limited job's own: Blue Mage 80, Beastmaster 50 (a constant from the Lodestone patch notes; the game files have none, [math.md, section 1](../mechanics/math.md#1-terms)). The synced level and the equip level filter stop there, and gear above it is left out of the gear list and the search.
- **Position in the item database's job mask**, used to filter gear the job can equip ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)).

Three properties make contexts safe to pass around:

- **Cached:** asking for the same job twice returns the same object.
- **Frozen** (deeply): no caller can change one by accident.
- **Total:** an unknown job id gets the default job's context (Paladin).

**Why it is built this way.** An earlier version kept the current job's stat mapping in shared mutable variables that every function read. Code that forgot to update them, or ran between two updates, could see a mix of two jobs. An explicit, frozen context makes each function's job dependence visible in its arguments and lets the tests run any job side by side. The neutral names matter for the same reason: a Piece stats label once showed "undefined" because shared code used a job-specific stat name where a neutral one belonged.

**From raw rows to neutral stats.** The game database stores stats in a fixed raw order of 14 stats: all four main stats (Strength, Dexterity, Intelligence, Mind), Vitality, Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed, and the game's generic Main Attribute and Secondary Attribute. One function in the item module turns a raw row into the job's neutral stats, using the context; nothing else reads raw stat positions.

## 3. The UI pattern

**The question:** when the user changes one setting, how does every affected part of the page update, without recomputing expensive results more often than needed?

The answer is a one-way data flow: one store, one derived view per page area, and a template that only displays views.

![At page load the saved state is read from browser storage, repaired, and becomes the shared store. A change in the store re-runs each component effect that read it; the effect calls the core logic and derives a frozen view, which the template displays. User input calls store actions, which change the store again. The store is saved back to browser storage 150 ms after the last change.](../diagrams/architecture-ui-flow.svg)

### One shared store

All state that matters lives in one shared store: the saved settings, plus a few values that are not saved. The **current job context** is replaced whenever the job changes; until the user picks a job, the default job's context stands in. The **highest real item level** bounds the item level boxes. The GCD and Substat tiers sub-tabs keep **their own boxes** (a level, and for GCD a haste and a speed), each empty until typed in, so they follow the synced level until the user sets one. The optimizer's result is not in the store: its component keeps it, together with the settings it was solved for (`optimizerKey` in `settings.js`), so the page can tell when a setting has changed since the last **Optimize**.

There is no gear pool to keep: the optimizer searches every piece the job can wear ([optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters)), so the store holds only settings. Until 2026-10-15 the user built a pool on a Gear pool tab first; dropping that step costs nothing in speed (building a job's gear takes about 5 to 10 ms, measured once on 2026-10-15; a whole optimizer run takes about 20 ms, see [optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

Changes go through store actions: set job, reset everything, switch tab or math sub-tab.

**Number inputs.** A number box bound to a setting uses one helper (`$num` in the template, `numberField` in `src/ui/helpers.js`) with two rules:

- Values are rounded to a whole number (the Target GCD keeps hundredths). While typing, only an in-range value is committed, so a value on the way ("9" of "90") is held back rather than corrected under the user's cursor. On Enter or leaving the box, an out-of-range value moves to the nearest bound and the box shows it, so the box and the setting always agree. The sync cap opts out (`snap: false`) because it explains a bad value with its own error. The gear filters (equip level, item level min and max, in both tabs) take any whole number from 1 up, and an emptied box commits `''` (no limit). The Target GCD takes 0.50 to 2.50 seconds (`TARGET_GCD_RANGE` in `settings.js`, also used by `restoreState`): 2.50 is the slowest base GCD, so a higher value moves to 2.50 (owner, 2026-10-19). The box's `min` and `max` attributes come from the same bounds; a filter's bound of Infinity sets none, and its markup's `max` (the end of the real range) only stops the arrow keys.
- A typed value is committed 300 ms after the last keystroke, or at once on Enter or when the field loses focus, so typing 123 never commits 1 and 12. A step (mouse wheel, arrow keys) commits at once, so the page follows the value as it scrolls (timeline in [Heavy work](#heavy-work-debounced-only-when-visible-or-on-request)). The exceptions commit each valid value as it is typed: the synced level (owner, 2026-10-17) and the Substat tiers level; the optimizer's piece count still runs at most once per 120 ms.

Two kinds of box keep their own handlers, on purpose: the GCD tab's level and speed correct what is typed and say so, and the boxes that commit only on Enter or leaving (Piece stats' item level, the tiers' substat values), since a value on the way would be held to its range while typing.

**Changing the job.** Nothing but the job-specific selections is lost, so the page switches at once, without asking:

![Switching to any other job, even one in the same role, happens at once without asking. Kept when the new job can use it (a stat it has under the same name; the Target GCD when speed stat and haste match; a slot it wears), else reset to the new job's defaults: Piece stats substats (Critical Hit, then speed), Piece stats slot (head, only if the new job lacks it), optimizer target (main stat), tiebreaks 1 and 2 (none), meal (best for goal: a meal picked from the Food menu is cleared), Target GCD (any), gear browser slot (any slot) and sort (item level). Held to the new job's level cap, lowered only if above it (90 becomes 80 for Blue Mage): the synced level and both equip level filters. Kept: sync cap and sync switch, the "Gear from" boxes and market board switch of both tabs, expansion and item level filters, materia and food on or off, the Piece stats item level, the open tab and search text.](../diagrams/architecture-job-switch.svg)

**Reset to defaults** puts every setting back, with no job chosen, after the browser's own confirmation dialog. The open tab and math sub-tab stay as they are.

### Each area derives a view

Every page area is a component that shows one **view** object. The view holds everything the template shows: formatted numbers, table rows, CSS classes, labels. The template only displays it.

The functions that build views are pure and live apart from the components, with no dependency on the UI framework, and they take **plain inputs**, never the store: the job context, the sync settings (`syncSettings`), the area's own settings (the browser's filters, Piece stats' piece, the optimizer's recipe), and for the optimizer a solver session. A component assembles those inputs from the store (`settings.js` has the helpers, such as `optimizerInputs`). So the unit tests check what each tab shows directly, and a set of the planned sheet can hand in its own recipe the same way. The views carry their text too (sentences, headings, the readout's lines), so the template does not build text from several fields.

**One pattern for derived views** (Gear browser, Piece stats, GCD, Substat tiers). The component has a getter, `view` (Piece stats: `pieceViews`, read through `explainer`, `steps` and the slider's getters), that reads the inputs from the store, makes a key of them, and asks a `viewCache` (`helpers.js`) for the view of that key. A new key builds the view; the same key returns the last one. Reading the inputs inside the getter makes every binding that shows the view track them, so the page updates in the same render as the setting, and the template, which reads the view many times a render, builds it once. The cache lives in the component's closure, not in its reactive state. The Gear browser's getter returns its last view while its tab is hidden, so the list is built only while it can be seen.

**Results on request** (the optimizer). Its result is not derived from the store on each change: **Optimize** builds it, and the component keeps it with the settings it was solved for. What follows the settings before the next Optimize (the piece count, the greyed-out "Gear from" boxes, the Target GCD range) is one view, `gearToSearchView`, built by a throttled effect (`throttledEffect`: at most once per 120 ms, during a burst of changes too, so scrolling a number box moves the Target GCD range with it), since its fastest-GCD search takes 20 to 100 ms.

Each component reads the job through its own `jobCtx` getter (the store's `jobCtx`), never through a parent component's scope; nested components that share a page area are named apart (Piece stats' `explainer` and `steps` around the GCD and tiers sub-tabs' `view`). The Food row's menu is its own component (`mealMenu`) inside the optimizer's. No component imports Alpine: `main.js` imports it and hands the optimizer its `effect` and `raw`, so every component module loads in Node and its unit test binds it to a plain store.

**Large data never enters reactive state.** Alpine makes an object it holds reactive by wrapping it in a proxy, and wraps nested objects as they are read. A frozen object is left as it is. Keeping big lists frozen or outside the store avoids wrapping thousands of rows on every recompute:

- The item database is a plain module-level constant that the core reads directly. It is never placed in the store.
- The views with long lists (the gear browser's rows, the optimizer result, the accuracy panel) are frozen before they are stored on the component. The optimizer result is frozen all through (`deepFreeze` in `helpers.js`): with only its top frozen, `x-for` still wrapped each row it hands the template, and each cell read from a row, in a proxy.
- A menu inside a result (the optimizer rows' menus of pieces with the same result, the Food menu) is built with `x-if` only while it is open, not hidden with `x-show`: built hidden on every row, they were about four fifths of the result's elements and most of the time to draw it (2026-10-19: the longest blocked main thread after a slow result went from about 90 to 25 ms, and from about 550 to 140 ms at 4× CPU throttle).
- The job's gear the optimizer searches is built once per job, frozen, and kept in the solver session, which lives in the optimizer's Web Worker ([section 9](#9-the-optimizers-worker)), never in reactive state. The optimizer reads the store through `Alpine.raw`, without the proxies: a worker cannot be sent a proxy.

### Heavy work: debounced, only when visible, or on request

Cheap areas recompute at once; expensive ones wait, run only while the user can see them, or run only when asked:

| Page area | When it recomputes |
| --- | --- |
| Settings, How the math works | On every relevant change |
| Real-gear accuracy check | Once, when its panel is first opened |
| Gear browser | On a relevant change, while the Gear browser tab is open |
| Optimizer result | When the user presses Optimize (the piece count under Gear to search: at once, then at most once per 120 ms while settings change) |

Notes:

- **Settings, How the math works** are cheap: a few formulas per piece; the explainer's curves (a few thousand generic pieces per setting) are remembered per setting, so a slider move costs a few milliseconds.
- **Accuracy check**: it scans every item in the database, so it runs only once.
- **Gear browser**: the database matches of its filters (including its own Gear from boxes and market board switch), with synced stats. It recomputes on any change of its filters, job, cap, sync or level, and shows the first 100 matches. Its layout is in [ui.md, section 3](ui.md#3-the-gear-browser-tab).
- **Optimizer result**: every piece the job can wear that passes the filters under Gear to search (expansions, equip level, item level range, Gear from; the browser's filters with the optimizer's own values). Searched only when the user presses Optimize (owner, 2026-10-18; it used to rerun on every change of those filters, job, cap, sync, level or optimizer settings). A setting changed after a search leaves the result shown but dimmed, with a note and its menus off, until Optimize runs again; a job switch clears it. The count in the heading and the greyed-out Gear from boxes still follow the settings. The search runs in a Web Worker, so the page stays responsive while it runs (tier ranking can take a few seconds); a progress bar and Cancel show until the result comes ([section 9](#9-the-optimizers-worker)). A search that fails (not a cancel) leaves the result from before it dimmed, with the line "The search failed: <reason>. Press Optimize to try again." until the next Optimize. [Node limit](../glossary.md) 700,000. A line under the result says how long the solve took ("Solved in 21 ms."; the first solve for a job includes building its gear).

**How the waits work.** A typed number and the save are debounced: their timer restarts on every change, so typing 123 commits once and a burst of changes saves once. The optimizer's piece count is throttled instead (`throttledEffect`): the effect reads all inputs synchronously (so they are tracked), and the expensive part runs from a timer, at once after a rest and at most once per 120 ms during a burst, so $k$ changes 50 ms apart update it about $k/2.4$ times, not $k$ times and not only at the end. It always runs from the timer, never inside the effect, so what it reads (the component's own result) is not tracked and a new result asks for no new piece count. Pressing Optimize right after typing still searches with the value typed: the click first moves the focus out of the box, which commits it. Run times are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

![Timeline in milliseconds after typing 1, 12 and 123 into the sync cap, 100 ms apart as an example. The field commits only 123, 300 ms after the last keystroke (Enter or leaving the field commits at once). When the store changes, Settings, How the math works and the open gear browser recompute at once; the optimizer's piece count and Target GCD range are asked for at once, and at most once per 120 ms while changes go on (the search itself waits for Optimize); the saved state is written 150 ms later. The field's wait and the save's restart on every change.](../diagrams/architecture-timing.svg)

## 4. Persistence

**The question:** what does the page remember between visits, and what happens when the remembered data is wrong?

The page remembers the user's settings in the browser's local storage. This is a convenience for one viewer on one browser: the page renders correctly without it, and every read and write is guarded, so a private window or blocked storage simply starts from the defaults.

**What is saved.** One JSON object under one key: job, sync cap, sync on or off, character level, open tab and math sub-tab, the Piece stats inputs (slot, substats, item level), browse filters and sort, the optimizer settings with its Gear from boxes and market board switch. The job context, the job's gear, views and browse results are not saved; they are rebuilt.

**When.** One effect serializes the whole saved object, which makes it depend on every saved field, and writes it 150 ms after the last change.

**Validation on restore.** Stored data can be old, from another job's role, or hand-edited, so it is never trusted:

![Restoring starts from the defaults for the saved job, then keeps each saved field only if it has the right type and range, else uses its default. Example from running the code (2026-10-16), a save for Blue Mage (level cap 80): job Blue Mage is kept; character level 95 becomes 80; sync cap 9999 becomes 795; the old tab name "pool" becomes the Gear browser; Piece stats slot off-hand becomes head; substats speed, speed, Critical Hit become speed, none; optimizer target special substat becomes main stat.](../diagrams/architecture-restore.svg)

A saved job id that is not a known job means no job is chosen; the job-dependent defaults then come from the default job until the user picks one. The rules for each field:

- numbers are rounded and clamped (item levels to 1 to 795, the highest real item level; character level to 1 to the job's level cap, 100 or the limited job's own);
- choices (tab, slot, stat, sort, filter) must be one of the values valid for this job;
- substat lists drop unknown or repeated entries, and an older third substat rank is dropped;
- older saves are translated: the math sub-view stored as the tab, the Gear pool tab (now the Gear browser), and the one gear-group list the pool days had for both tabs (the optimizer starts from it). A saved pool is ignored. A list of left-out boxes with a key that is no box (the six gear groups before 2026-10-18) starts over from the default boxes.

An invalid field falls back to its default and the valid ones are kept. The state unit tests cover this field by field ([testing.md, section 2](testing.md#2-what-each-file-covers)).

**Piece identity.** Anything kept that names a piece of gear refers to it by its **gameId**, the game's item id (the `Item.csv` row), with the piece's name stored beside it so a reader can tell what it is. `itemById` finds the database row of an id; the index is built once, on first use. Two other keys exist and are not identities: a pool item's `id` is made fresh on every page load, and the pool key (name, slot, item level) only groups the same piece from several sources, as the menus do. Several rows could share a pool key, and a name can change in a patch; a gameId does neither. No saved setting names a piece today: the picks from a result's menus (each row's piece by its gameId) and the picked meal (by its key; meals have no gameId in the data) live only until the next Optimize. The first to be kept will be a set's pieces ([section 7](#7-pieces-and-sets-in-the-core)), so `restoreState` has nothing to repair yet.

**Storage key versioning.** The key carries a version suffix (currently `-v4`). While the site has no users, a new field needs no bump: the restore step defaults and repairs it. Once it has users, bump the suffix only when old data cannot be repaired field by field.

## 5. Build

**The question:** how do many source modules and a data set become one file that works offline?

The build turns the source modules into one self-contained file in three steps:

1. **Bundle.** esbuild starts from the entry module and follows every import: Alpine, the UI, the core, the generated data (each `src/data/*.json` as a `JSON.parse` call on its compacted text, the `jsonParseData` plugin: browsers read JSON faster than the same object as code; data-pipeline.md section 8), and the stylesheet. It writes one minified script (as a self-running function, for Chrome 97, Firefox 104 and Safari 15.4 and later: `BROWSER_TARGETS`, set by the newest JS API the page calls, `findLast`; esbuild adds the CSS prefixes those need) and one stylesheet, in memory.
2. **Inline.** The HTML template has markers for the styles, the script and the build marks. The build replaces them with the stylesheet, the script and, on any branch but `main`, a "DEV" test-build badge next to the title plus the branch and commit in the footer. A `main` build, which is what deploys, has no marks. The branch comes from GitHub Actions' `GITHUB_REF_NAME` when set, else from git; with neither (or a detached checkout) there are no marks.
   The optimizer's Web Worker is a second bundle, built inside the first by the `solverWorker` plugin from `src/ui/solver-worker.js` and inlined into the page's script as a string ([section 9](#9-the-optimizers-worker)).
3. **Checks.** The build stops with an error if a marker is missing, if there is no script output, or if the script contains the text `</script` (which would end the inline script early).

The page loads nothing at run time except the web fonts, which come from Google Fonts when online; without a connection the page falls back to system fonts and still works. Because the data is part of the script rather than fetched, the page works from a `file://` address, where browsers refuse to fetch local files. The size of the page and its parts is in [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page).

**Why one file:** the owner opens it locally and can keep or share it as a single file. No server, no install, no version mismatch between page and data.

## 6. Development loop

**The question:** how does a change go from an edit to a checked page?

| Step | Command | What happens |
| --- | --- | --- |
| Install once | `npm install` (or `npm ci`) | Installs esbuild, Biome, Playwright and Alpine |
| Work | `npm run dev` | Rebuilds on change and serves the page |
| Check | `npm run check` | Lint, build, all tests |
| Look | open the built page | Desktop width and 960 px |

Notes:

- **Install.** Biome does lint and format; Playwright drives the browser for the smoke test (run `npx playwright install chromium` once). The project requires Node 22 or later.
- **Work.** The page is rebuilt (not minified) whenever a source file or the HTML template changes, and the output folder is served on a local address the command prints. Reload the browser to see a change.
- **Check.** Lint, format check, build, unit tests, browser smoke test. It must pass before a change is called done. The generator tests (Python) and the Python lint run in `npm run check:all`, needed when the data pipeline changes.
- **Look.** The page must never scroll sideways; wide tables scroll inside their own box.

Every command, with how long it takes, is in the [root README](../../README.md#develop). Tests are described in [testing.md](testing.md). After a game patch, the data is refreshed with the steps in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

## 7. Pieces and sets in the core

**The question:** where do the rules live that turn chosen gear into what the page shows? In three core modules, so the optimizer's result and the planned sheet of sets (gear and materia chosen by hand; [roadmap.md](../roadmap.md)) go through the same code.

| Module | Holds | Used by |
| --- | --- | --- |
| `piece.js` | A piece under sync: the item level it is synced to (`itemSyncIlvl`), its stats there (`effStats`), the most each stat can be (`itemCaps`, `meldCaps`), whether it keeps its melds (`keepsMelds`) | the optimizer, `meld.js`, `set.js`, the views |
| `meld.js` | The meld rules (gates, high grades only in the big slots, caps), used both to find the best stones (`bestMeld`, `meldVersions`) and to apply a given list (`applyStones`) | the optimizer, `set.js` |
| `set.js` | A set as plain frozen data (`makeSet`, `setFromPicks`) and what it adds up to (`evaluateSet`) | `recipe.js`, the optimizer view |

**A set** is `{pieces, meal}`. Each piece is `{slot, gameId, name, stones}` for a database piece, `{slot, custom, stones}` for a piece not from the database, or `{slot}` for an empty slot. `stones` holds one entry per meld slot, `{stat, grade}` or null. `meal` is a meal's key, or null. Job, level and sync are not part of a set. They are passed to `evaluateSet`, as one sheet will hold them for all its sets. A set refers to database pieces by game id ([section 4](#4-persistence), "Piece identity").

**`evaluateSet(job, set, sync, level)`** returns everything the optimizer's result table shows: per row the piece's stats after sync and stones, its caps, melds, stones lost to a cap or removed (sync, gate, slot), its category and where it comes from; the gear totals, the meal's bonus and the totals with it, the character's base; each stat's tier; defense; the GCD and DoT/HoT bonus. The solve (`runRecipe`, [section 8](#8-recipes-and-the-solver-session)) builds the set from the result's rows (`setFromPicks`); the optimizer view calls `evaluateSet` on it and adds only what belongs to the page: the goal's marks, each row's menu of pieces with the same result, the Food row's menu, and the text.

**Custom pieces** have a place in the model, but no editor yet. A custom piece is a pool item the set carries itself. The database facts the core reads through `rowFacts` in `items.js` (equip level, meld slots, slot code, item kind, gear category, its own weapon damage and defense) are null for it today. So it is never level-synced, takes stones only if it carries its own `meld` field (`{slots, overmeld}`, as the math tab's generic pieces do), uses the job's slot share and stat factors, and gets the item level table's weapon damage and defense. A custom piece the player can edit will need those fields on the item itself, or chosen defaults:

- an equip level, for level sync;
- meld slots and overmelding, for its stones;
- a slot code and item kind, for its slot share, stat factors, weapon damage and defense.

A relic whose substats the player allocates (roadmap A11) is the same case: a custom piece with a budget.

## 8. Recipes and the solver session

**The question:** how is a search asked for, and what is kept between searches? A **recipe** says what to look for: the optimizer's settings as the page holds them (goal and tiebreaks, the filters under Gear to search, materia, food, the Target GCD and its mode, rank by tier). `runRecipe(job, sync, level, recipe, session, choices)` in `src/core/recipe.js` solves it and returns `{status, set, record, found}`:

- **status:** `ok`, or why there is no set (`excluded`, `noset`, `nogcd`, `infeasible`).
- **set:** the set the result shows, as plain data ([section 7](#7-pieces-and-sets-in-the-core)): each row the player's pick where it still gives the same result, else the easiest piece that does; the meal the Food row shows.
- **record:** how the set was made: job, sync, level and a frozen copy of the recipe, so a set keeps the goal it was solved for whatever changes later.
- **found:** what the display needs beyond the set: the rows' menus of pieces with the same result, the meals with the best's result, the stats tier ranking holds, the Target GCD facts, the node limit note.

`choices` are the player's picks on the last result (`{pieces: {row: gameId}, meal}`), not saved. The optimizer view calls `runRecipe`, evaluates its set (`evaluateSet`) and formats it; nothing in the view searches.

**The solver session** (`makeSession` in `src/core/session.js`) holds what a solve keeps for the next one. The page has one, in the optimizer's worker ([section 9](#9-the-optimizers-worker)); a sheet of sets will have one per sheet. It keeps, per kind, its last four entries (least recently used dropped first):

| Kind | Holds | Its key depends on |
| --- | --- | --- |
| gear | every piece the job can wear, as frozen pool items (5 to 10 ms to build; the meld caps are cached per pool item, so the same objects keep them warm) | the job |
| tier | tier ranking's candidate lists (it keys them inside by objective, limits and GCD mode) | the pool: job, sync, level, Gear to search, materia |
| fast | the fastest GCD the pool reaches | the pool, and the meal |
| prep | Target GCD's candidate lists | the pool, the goal and the GCD mode (not the GCD) |
| same | every piece as a candidate for the goal, unpruned (the rows' menus) | the pool and the goal, and the GCD mode while a GCD is asked |

Every key is made by one function, `recipeKey`, from one table of the recipe fields each kind depends on, so a new recipe field cannot be forgotten in one key and remembered in another (audit 02, findings 5 and 6). A unit test changes every field and checks which keys change. So typing a new Target GCD reruns only the search, a pick from a menu reruns the search on kept lists, and going back to a recent setting reuses its lists. These used to be five one-entry caches at the top of the optimizer view, each with a key written by hand.

## 9. The optimizer's worker

**The question:** how does a search of several seconds leave the page responsive? Under a Target GCD with tier ranking a search can hold a thread for seconds (audit 16 R8, owner 2026-10-19). The optimizer's searches and its Gear to search line run in a Web Worker; the page thread only sends the request and shows the reply.

| Part | Where | What it does |
| --- | --- | --- |
| Request | `solverRequest` in `src/ui/solver.js` | Plain data: the kind (`solve` or `gearToSearch`), the job's id, the sync settings, the level, the recipe, the menu picks |
| Handler | `makeSolverHandler` | Runs `optimizerView` or `gearToSearchView` with its own solver session; replies `{result, ms}`, or `{error}` |
| Worker | `src/ui/solver-worker.js` | Answers each message with the handler's reply, tagged with the request's id |
| Worker solver | `workerSolver` | Page side: starts the worker on the first request, posts requests, routes replies by id, replaces the worker on Cancel, falls back |
| Page-thread solver | `inProcessSolver` | The handler on the page thread: the unit tests, and the fallback |

Notes:

- **One file, from `file://`.** The worker's code is a string in the page's script; `main.js` starts it from a Blob URL. Chromium runs a Blob-URL worker from a `file://` page (checked with Playwright, 2026-10-19).
- **The data, held once.** The worker needs the item database and the other data files, but the page does not carry a second copy. Each data module of the page also exports its text (`jsonParseData`), and the page posts those strings to the worker as its first message; the worker parses them on its own thread. The worker's bundle is wrapped to run on that message, since its data modules read the texts while it loads. The page grows by the worker's code only, about 83 KB ([data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)).
- **Started when needed.** The worker starts on the optimizer's first request: the Gear to search line, 120 ms after the page has a job. The page's first paint does not wait for it.
- **One copy of the job's gear.** The solver session lives in the worker, so the page thread never builds the job's gear.
- **Newer requests.** One request per kind is in the worker at a time. A newer one waits and replaces any request already waiting, whose caller gets the newer one's reply, so settings changed during a long search are not all solved in turn. The component drops a reply it no longer wants (`solveId`, `gearToSearchId`, or a job switch since). A newer request does not stop the one in the worker: only Cancel does.
- **Cancel.** The optimizer's Cancel (`cancel()` in its component) returns the page to idle at once, with the result it showed and that result's menu picks, and calls the solver's `cancel('solve')`. A worker cannot be interrupted mid-search, so when a search is in the worker, `workerSolver` terminates the worker and starts a fresh one at once, which is handed the data texts again and parses them; its session builds the job's gear again. The cancelled search's caller, and any search waiting behind it, get a cancelled error (`isCancelled`), which the component ignores. Gear to search requests not yet answered are posted to the new worker; with none, the last one is asked again, so the new worker builds the job's gear before the next search.
  - *When:* always when a search is in the worker. The restart costs about 0.2 to 0.5 s over a warm search, while letting the search finish can cost the rest of it, 1 to 3 s for a long Target GCD search (Warrior, level 100, Target GCD 2.30, food, two tiebreaks, cancelled at 0.3 s: the next quick search showed after 0.5 to 0.85 s instead of 1.25 to 1.6 s; Playwright, 2026-10-19).
  - *Nothing to stop:* with no search in the worker (it already replied), or on the page-thread fallback, Cancel only drops the reply (`solveId`), as before. A page-thread solve still waiting for its two frames is dropped before it starts.
- **Timeout.** A request still in the worker after 60 s (`SOLVER_TIMEOUT_MS`) is stopped the same way as a Cancel, but its callers get an error, "no answer after 60 s", so the page shows it as a failed search. The slowest search measured is 18 s (tier ranking with a Target GCD, under eight parallel sweeps; [tier-ranking.md, section 8](tier-ranking.md#8-performance)) and a Gear to search request takes 20 to 100 ms, so 60 s leaves a slow device three times the slowest and still ends a worker that will never answer.
- **Fallback.** If the worker cannot be made, fails to load or crashes, or a reply cannot be read on the page (a `messageerror` event), every request not yet answered is asked again on the page thread. A smoke group checks it with no `Worker` and with a worker that fails to load. The page thread's solver blocks the page, so the component then waits two frames before asking, and the progress bar is painted first.
- **Times.** The worker times each request itself. "Solved in N ms" and the `optimizer` performance measure are that time, the search's own, not the wait for the reply.

## Where this lives

| Concept | File |
| --- | --- |
| Generated data (never edit by hand) | `src/data/item-level.json`, `src/data/items.json`, `src/data/food.json`, `src/data/job-icons.js`, `src/data/max-speed.json` |
| Data generators (`regen.py` runs them in order; the last, in Node, writes `max-speed.json`) | `scripts/data/gen_item_level.py`, `gen_items.py`, `gen_food.py`, `gen_job_icons.py`, `gen_max_speed.mjs` |
| Tables and limits derived from the data | `src/core/tables.js` |
| Jobs, role profiles, slots, slot shares, raw stat order | `src/core/constants.js`, `src/core/item-format.json` |
| Job context | `src/core/job-context.js` (`makeJobContext`, its `activeSlotTypes`, `specKind`, `vitFactor` and `maxLevel`; `statColumn`); level caps in `src/core/constants.js` (`JOB_LEVEL_CAPS`) |
| Raw row to neutral stats, item filters, pool item ids | `src/core/items.js` (`dbStats`, `browseItems`, `gearFilter`, `filterGear`, `poolItemFromRow`) |
| Piece identity: a database piece by its game id; the same piece from several sources | `src/core/items.js` (`itemById`, `poolItemById`; `poolKey`) |
| A piece under sync | `src/core/piece.js` (`itemSyncIlvl`, `effStats`, `itemCaps`, `meldCaps`, `keepsMelds`) |
| A set and what it adds up to; a given list of stones on a piece | `src/core/set.js` (`makeSet`, `setFromPicks`, `evaluateSet`); `src/core/meld.js` (`applyStones`) |
| Item stat rounding steps and the off-hand rule, written once | `src/core/formulas.js` (`statLine`, `offhandParts`) |
| Per-level game data (ParamGrow: base speed, level divisor, level sync item level) | `src/core/level-params.js` (`levelParams`, `clampLevel`) |
| Meal choice (totals with food, then food points, then the first) | `src/core/food.js` (`pickMeal`, `mealTotals`, `bestFood`); Target GCD and tier ranking share their defaults through `goalSettings` in `src/core/target-gcd.js` |
| Other core modules | `src/core/formulas.js`, `sync-target.js`, `speed.js`, `tiers.js`, `meld.js`, `piece.js`, `set.js`, `recipe.js`, `session.js`, `food.js`, `target-gcd.js`, `tier-rank.js`, `same-result.js`, `damage-defense.js`, `validation.js`, `optimizer/` |
| Entry point: restore, register, save effect | `src/main.js` |
| Saved state: defaults, job reset, restore and repair, storage key | `src/ui/state.js` (`defaultState`, `defaultBrowse`: the browser's defaults, `resetForJob`, `clampLevels`, `restoreState`, `STORE_KEY`, `SEARCH_MAX_LENGTH`) |
| Shared store and actions | `src/ui/store.js` (`createAppStore`, `PERSISTED_KEYS`) |
| The store's settings as plain inputs: sync settings, the cap Piece stats shows, the recipe, the optimizer's settings key, the default Gear from boxes | `src/ui/settings.js` (`syncSettings`, `levelSyncOn`, `shownSync`, `recipeOf`, `optimizerInputs`, `optimizerKey`: the job and sync settings and every field of `opt`, `DEFAULT_EXCLUDE`) |
| The ranked stat menus (one rank per stat, swaps) | `src/ui/ranks.js` (`rankChoices`, `withRank`, `uniqueRanks`) |
| The view pattern, throttled effect, number-field binding, "Gear from" boxes | `src/ui/helpers.js` (`viewCache`, `throttledEffect`, `numberField`, `storeNumberField`, `gearFromToggles`, `expansionToggles`) |
| View builders (pure, unit-tested) | `src/ui/views/` (`piece.js`, `sync-explainer.js`, `gcd.js`, `gear.js`, `optimizer.js`, `tiers.js`); charts in `src/ui/sync-charts.js` (SVG for `x-html`; every name passed in goes through `escapeXml`) |
| Gear browser row limit | `src/ui/views/gear.js` (`SHOW_LIMIT`) |
| A recipe and its solve; the pool it searches; the page's node limit | `src/core/recipe.js` (`runRecipe`, `recipePool`, `relicsLeftOut`, `emptyGearFrom`, `askedGcd`, `gcdRange`, `recipeKey`, `NODE_LIMIT`) |
| The solver session; the job's gear it keeps | `src/core/session.js` (`makeSession`, `SESSION_SIZE`); `src/core/items.js` (`jobGear`) |
| The optimizer tab's view: Gear to search, the result | `src/ui/views/optimizer.js` (`gearToSearchView`, `searchCount`, `optimizerView`) |
| The optimizer's solver: requests, the handler, the worker and page-thread solvers; the worker's entry; starting it | `src/ui/solver.js` (`solverRequest`, `makeSolverHandler`, `workerSolver`, `inProcessSolver`); `src/ui/solver-worker.js`; `src/main.js` (`startSolverWorker`) |
| Components | `src/ui/components/` (`page.js`, `sync-explainer.js`, `gcd.js`, `gear.js`, `optimizer.js`, `meal-menu.js`, `tiers.js`) |
| Template and styles | `src/index.html` (markers `<!-- STYLES -->`, `<!-- SCRIPT -->`, `<!-- BUILD_BADGE -->`, `<!-- BUILD_INFO -->`, and `<!-- INCLUDE name.html key=value -->` for a partial), `src/partials/` (the Expansion and "Gear from" menus, one copy for both tabs, filled in by `expandIncludes` in the build), `src/styles.css` (grouped by area: tokens, base, controls, layout, shared pieces, tables, popovers, menus, then each tab) |
| Build and dev server; the worker bundle | `scripts/build/build.mjs` (`solverWorker`, `jsonParseData`), `scripts/build/dev.mjs` |
| Node version, scripts, dependencies | `package.json` |
| Lint and format configuration | `biome.jsonc`, `pyproject.toml` |
| Diagrams | `docs/diagrams/architecture-layers.svg`, `docs/diagrams/architecture-ui-flow.svg`, `docs/diagrams/architecture-job-switch.svg`, `docs/diagrams/architecture-timing.svg`, `docs/diagrams/architecture-restore.svg` |
