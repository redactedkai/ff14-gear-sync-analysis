# Architecture

How the page is put together: the layers, how job-dependent behaviour is passed around, how the UI keeps itself up to date, what is saved in the browser, and how everything becomes one HTML file. The math itself is in [math.md](../mechanics/math.md), the gear search in [optimizer.md](optimizer.md), and where the game data comes from in [data-pipeline.md](data-pipeline.md). Unfamiliar game terms are in the [glossary](../glossary.md).

## 1. The system at a glance

The tool is a single web page with no server. Everything it needs, including the game data, is inside one HTML file that a browser opens straight from disk.

![Four layers stacked top to bottom: generated game data, core logic, UI state, and components with the page template; each is used by the one below. A bundler joins all layers into one HTML file that a browser opens from disk. Generator tests check the data layer, unit tests check the core logic and UI state, and a smoke test checks the finished HTML file in a real browser.](../diagrams/architecture-layers.svg)

Each layer depends only on the layers above it:

| Layer | What it holds | Depends on |
| --- | --- | --- |
| 1. Generated game data | The item level budget table, per-level speed data, and the item database (17,281 pieces of gear). Produced by the data pipeline and never edited by hand. | nothing |
| 2. Core logic | Stat formulas, sync caps, speed and GCD, item queries, the optimizer, and the accuracy checks. Pure functions: no page, no browser storage, no shared mutable state. They run unchanged in Node, which is how the unit tests use them. | data |
| 3. UI state | The saved state (defaults, repair on load, browser storage) and one shared store that holds the current settings, the item pool, the current job context, and the actions that change them. | core |
| 4. Components and template | One component per page area. Each turns the store into a ready-to-display "view". The HTML template binds to those views and to store actions. | UI state, core |

The page uses one runtime library, Alpine.js, for reactivity and templating. The build uses one tool, esbuild. Adding any other dependency is a decision for the owner (see `CLAUDE.md`).

## 2. The job context

Almost everything depends on the selected job: which stat is the main stat, which speed stat applies, whether there is a special substat (Piety, Tenacity or none), whether the weapon is two-handed or a one-handed weapon plus shield, which gear slots exist, and how Vitality is scaled. The 22 combat jobs fall into five role profiles that decide most of this (table in [math.md, section 1](../mechanics/math.md#1-terms)).

The tool computes all of that **once per job** into a *job context*: a small, frozen description of the job. Every core function that needs job information takes the context as its first argument. Nothing in the core reads "the current job" from anywhere else.

What a job context contains:

- **Neutral stat names and their meaning for this job.** Shared code always uses the same seven role-neutral names: main stat, Vitality, Critical Hit, Determination, Direct Hit, speed, special substat. The context says that, for example, "main stat" means Mind for a healer and Strength for a tank, and "speed" means Spell Speed or Skill Speed. It also lists which of these the job actually has (six or seven stats) and their display names.
- **Weapon mode and slots.** Two-handed weapon, or one-handed weapon plus off-hand (Paladin). This fixes the list of active slots for Piece stats and the sync caps table, and the weapon's slot share (140 or 100 per mille). Real pieces carry their own slot code, so a White Mage wand and shield, or a cloak that covers the head, use their own share and blocked slots in the browser and the optimizer.
- **Vitality factor.** 0.9 for Intelligence and Mind jobs, 1 otherwise: the factor the job's own gear carries, used only where no real item is involved (Sync caps, Piece stats). A real piece uses its own stat factors, read from the game files for its kind ([math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item)).
- **Position in the item database's job mask**, used to filter gear the job can equip ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)).

Contexts are cached, so asking for the same job twice returns the same object, and frozen, so no caller can change one by accident. An unknown job id falls back to the default job.

Why it is built this way: an earlier version kept the current job's stat mapping in shared mutable variables that every function read. Any code that forgot to update them, or ran between two updates, could see a mix of two jobs. Passing an explicit, frozen context makes each function's job dependence visible in its arguments and lets the tests run any job side by side. The neutral names matter for the same reason: a Piece stats label once showed as "undefined" because shared code used a job-specific stat name where a neutral one belonged.

The game database stores stats in a fixed raw order of 14 stats (all four main stats, Vitality, Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed, and the game's generic Main Attribute and Secondary Attribute). The context converts a raw row into the job's neutral stats in one place; nothing else reads raw stat positions.

## 3. The UI pattern

![At page load the saved state is read from browser storage, repaired, and becomes the shared store. A change in the store re-runs each component effect that read it; the effect calls the core logic and derives a frozen view, which the template displays. User input calls store actions, which change the store again. The store is saved back to browser storage 150 ms after the last change.](../diagrams/architecture-ui-flow.svg)

### One shared store

All state that matters lives in one shared store: the saved settings and pool, plus two derived values that are not saved:

- the **current job context**, replaced whenever the job changes;
- a **pool change counter**, increased by every action that changes the pool. A view that depends on the pool reads this one number instead of walking every item, so it re-runs exactly when the pool changes and costs nothing to track.

Changes go through store actions (set job, add rows, remove an item, set copies, clear, replace generated items, switch tab). Number inputs are bound to store fields through a helper that only commits whole numbers inside the allowed range; typing an out-of-range value is ignored rather than corrected under the user's cursor.

**Changing the job.** Switching to any other job, even one in the same role, clears the pool and resets the job-specific selections (Piece stats substats, optimizer target and tiebreaks, browse slot and sort, pool filter) to the new job's defaults. The sync cap, synced level and sync switch are kept. This way the pool never holds gear the current job can't wear, and its stored stats always match the job's stat mapping. Because the pool is lost, the page asks first when the pool is not empty: a warning under the job menu names the new job and the number of items, with Switch and clear or Cancel; the menu keeps showing the current job until the switch is confirmed.

### Each area derives a view

Every page area is a component that recomputes one **view** object from the store inside a reactive effect. The effect reads the store fields it needs, which registers them as dependencies, and runs again when any of them changes. The view holds everything the template shows: formatted numbers, table rows, CSS classes, labels. The template only displays it. The functions that build views are pure and live apart from the components, with no dependency on the UI framework, so the unit tests check what each tab shows directly; the components only wire them to the store.

Views are frozen before they are stored on the component, and large data never enters reactive state:

- The item database is a plain module-level constant that the core reads directly. It is never placed in the store.
- Browse results (up to thousands of matching items) and views are frozen.

Alpine makes an object it holds reactive by wrapping it in a proxy, and wraps nested objects as they are read. A frozen object is left as it is. Keeping big lists frozen or outside the store avoids wrapping thousands of rows on every recompute.

### Heavy work: debounced and only when visible

| Page area | When it recomputes |
| --- | --- |
| Settings, Piece stats, Sync limits | On every relevant change (cheap: a few formulas) |
| Real-gear accuracy check | Once, the first time its panel is opened (it scans every item in the database) |
| Gear table | On any change of its filters, list (All gear or My pool), the pool, job, cap, sync or level, but only while the Gear pool tab is open. Shows the first 100 database matches or 400 pool items; "Add all" takes at most 3,000 |
| Pool table | On every pool change. Renders the first 400 rows; the optimizer still uses all of them |
| Optimizer result | 120 ms after the last change of pool, job, cap, sync, level or optimizer settings, and only while the Gear optimizer tab is open. Node limit 700,000 |
| Per-stat ceiling table | Same trigger and delay; 12 or 14 optimizer runs at 150,000 nodes each |

The debounce works by reading all inputs synchronously inside the effect (so they are tracked) and scheduling the expensive part on a timer that is reset on every change. Typing a number therefore runs the optimizer once, after the user pauses. On a 1,988-item Sage pool one optimizer run takes about 15 to 25 ms and the full ceiling table about 0.27 s ([optimizer.md, section 7](optimizer.md#7-correctness-and-performance)).

## 4. Persistence

The page remembers the user's settings between visits in the browser's local storage. This is a convenience for one viewer on one browser: the page renders correctly without it, and every read and write is guarded, so a private window or blocked storage simply starts from the defaults.

**What is saved.** One JSON object under one key: job, sync cap, sync on or off, character level, open tab and math sub-tab, the Sync limits item level, Piece stats inputs, browse filters and sort, optimizer target and tiebreaks, and the pool itself (each item's name, slot, item level, stats, copies, HQ flag and source). The job context, the pool change counter, views and browse results are not saved; they are rebuilt.

**When.** One effect serializes the whole saved object, which makes it depend on every saved field, and writes it 150 ms after the last change.

**Validation on restore.** Stored data can be old, from another job's role, or hand-edited, so it is never trusted. Restoring starts from the defaults for the saved job (or the default job, if that id is unknown) and then takes each saved field only if it has the right type and range:

- numbers are rounded and clamped (item levels to 1 to 795, the highest real item level; character level to 1 to 100);
- choices (tab, slot, stat, sort, filter) must be one of the values valid for this job;
- substat lists drop unknown or repeated entries;
- pool items are dropped if their slot, item level or stats are unusable, unknown fields are discarded, duplicate ids are removed, and the restored ids are reserved so new items never reuse them;
- older saves that stored the math sub-view as the tab are translated.

An invalid field falls back to its default and the valid ones are kept. 14 unit tests cover this field by field.

**Storage key versioning.** The key carries a version suffix (currently `-v3`). While the site has no users, a new field needs no bump: the restore step defaults and repairs it. Once it has users, bump the suffix only when old data cannot be repaired field by field.

## 5. Build

The build turns the source modules into one self-contained file:

1. **Bundle.** esbuild starts from the entry module and follows every import: Alpine, the UI, the core, the generated data, and the stylesheet. It writes one minified script (as a self-running function, targeting ES2020 browsers) and one stylesheet, in memory.
2. **Inline.** The HTML template has two markers, one for styles and one for the script. The build replaces them with the stylesheet and the script and writes the finished page.
3. **Checks.** The build stops with an error if a marker is missing, if there is no script output, or if the script contains the text `</script` (which would end the inline script early).

The result is about 1.57 MB, close to 90% of it the item database ([data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)). It loads nothing at run time except the web fonts, which come from Google Fonts when online; without a connection the page falls back to system fonts and still works. Because the data is part of the script rather than fetched, the page works from a `file://` address, where browsers refuse to fetch local files.

Why one file: the owner opens it locally and can keep or share it as a single file. No server, no install, no version mismatch between page and data.

## 6. Development loop

| Step | Command | What happens |
| --- | --- | --- |
| Install once | `npm install` | esbuild, Biome (lint and format) and Alpine. Node 22 or later is enforced. |
| Work | `npm run dev` | Rebuilds the page (not minified) whenever a source file or the HTML template changes, and serves the output folder on a local address it prints. Reload the browser to see a change. |
| Check | `npm run check` | Lint, format check, build, unit tests, generator tests, browser smoke test. Must pass before a change is called done. |
| Look | open the built page | At desktop width and at about 400 px (phone). The page must never scroll sideways; wide tables scroll inside their own box. |

Tests are described in [testing.md](testing.md). After a game patch, the data is refreshed with the steps in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

## Where this lives

| Concept | File |
| --- | --- |
| Generated data (never edit by hand) | `src/data/item-level.json`, `src/data/items.json`, `src/data/job-icons.js` |
| Tables and limits derived from the data | `src/core/tables.js` |
| Jobs, role profiles, slots, slot shares, raw stat order | `src/core/constants.js`, `src/core/item-format.json` |
| Job context | `src/core/job-context.js` (`makeJobContext`, `slotActive`, `ilWeight`, `statColumn`) |
| Raw row to neutral stats, item filters | `src/core/items.js` (`dbStats`, `browseItems`, `poolItemFromRow`) |
| Other core modules | `src/core/formulas.js`, `sync-target.js`, `speed.js`, `meld.js`, `validation.js`, `optimizer/` |
| Entry point: restore, register, save effect | `src/main.js` |
| Saved state: defaults, job reset, restore and repair, storage key | `src/ui/state.js` (`defaultState`, `resetForJob`, `restoreState`, `STORE_KEY`) |
| Shared store and actions | `src/ui/store.js` (`createAppStore`, `PERSISTED_KEYS`) |
| Debounced effect, number-field binding, cell formatting | `src/ui/helpers.js` (`debouncedEffect`, `storeNumberField`, `statCell`) |
| Budget chart | `src/ui/chart.js` |
| View builders (pure, unit-tested) | `src/ui/views/` (`piece.js`, `sync-caps.js`, `gear.js`, `optimizer.js`) |
| Components | `src/ui/components/` (`page.js`, `piece-lab.js`, `sync-caps.js`, `validation-panel.js`, `gear.js`, `optimizer.js`) |
| Template and styles | `src/index.html` (markers `<!-- STYLES -->`, `<!-- SCRIPT -->`), `src/styles.css` |
| Build and dev server | `scripts/build/build.mjs`, `scripts/build/dev.mjs` |
| Lint and format configuration | `biome.json`, `pyproject.toml` |
| Diagrams | `docs/diagrams/architecture-layers.svg`, `docs/diagrams/architecture-ui-flow.svg` |
