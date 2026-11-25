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
| 3. UI state | Saved state, the shared store, the settings as plain inputs, the sheet model (`src/ui/sheets/`) and the solver (`src/ui/solver.js`, `src/ui/solve.js`) | core |
| 4. Components and template | One component per page area (a Lit element, with an Alpine wrapper where Alpine runs the screen), and the pure view builders (`src/ui/views/`) they use | UI state, core |

Notes:

- **Data.** The item level budget table, per-level speed data, stat factor table, materia table, item database, food table and job icons. Produced by the data pipeline and never edited by hand. Row counts are in [data-pipeline.md, section 7](data-pipeline.md#7-facts-about-the-current-data).
- **Core.** Plain functions with no page and no browser storage. The only shared mutable state is the counter that numbers new pool items and a few lookup caches keyed by their pure inputs. The job gear kept between solves is not module state: it lives in a solver session object that the caller creates and passes in ([section 8](#8-recipes-and-the-solver-session)). Because nothing in it touches the browser, the core runs unchanged in Node, which is how the unit tests use it.
- **UI state.** The saved state (defaults, repair on load, browser storage), one shared store (the current settings, the current job context and the actions that change them), the sheet model (`src/ui/sheets/`: a sheet’s rules and its saved records, not a view) and the solver (`src/ui/solver.js`, `src/ui/solve.js`, the handler that runs in the worker). Two small pure modules sit under them: `job-sync-panel.js` turns the store’s fields into the plain inputs the core and the views take (each tab’s panel, the sync settings), and `ranks.js` holds the rule of the ranked stat menus. Neither imports another UI module, and the views import the sheet model and these modules, never the other way round, so no import goes back up the layers. The modules of the UI, and what each owns, are in [section 3](#the-uis-modules).
- **Components.** Each page area is a Lit element (`src/ui/elements/`). It takes the plain inputs of its area from its wrapper or its parent element, hands them to a pure view builder (`src/ui/views/`) and keeps the ready-to-display "view" it returns; its template only displays that view. The Alpine wrapper in the HTML template (`src/ui/components/`) reads the store and calls the store's actions.
- **The optimizer's worker.** One part runs off the page's thread. A set page's Auto-fill and its Gear to search line go to a Web Worker with its own copy of the core logic, which parses the data texts the page hands it (`src/ui/solver.js`, `src/ui/solver-worker.js`; [section 9](#9-the-optimizers-worker)). If the browser will not run it, they run on the page's thread instead.

The page's runtime libraries are Alpine.js (the page's frame, the Sheets tab's dialogs and the wrappers of the elements), Lit (the elements), Zag (`@zag-js/*`: the machines of menus, popovers and dialogs) and floating-ui (placement). The build uses one tool, esbuild. Adding any other dependency is a decision for the owner (see `CLAUDE.md`).

## 2. The job context

**The question:** how does shared code know which job it is working for, without a global "current job" variable?

Almost everything depends on the selected [job](../glossary.md) (a character's combat class, such as Sage or Paladin). It decides:

- which stat is the main stat, and which speed stat applies;
- whether there is a special substat (Piety, Tenacity or none);
- whether the weapon is two-handed, a one-handed weapon plus shield, or either (`weaponMode` '2h', '1h+oh', 'mixed');
- which gear slots exist, and how Vitality is scaled.

The 23 combat jobs fall into five role profiles that decide most of this (table in [math.md, section 1](../mechanics/math.md#1-terms)).

**An example.** Three jobs, as their contexts describe them (from running the code):

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

- **Stat keys for this job.** A stat key is the game's own name for a stat: `str`, `dex`, `int`, `mind` (the main stat), `vit`, `crit`, `det`, `dh`, `sks`, `sps` (speed), `piety`, `ten` (the special substat). The context lists the keys the job has (`stats`: the main stat, Vitality, then the substats; six or seven keys, with no placeholder for a missing special substat). It also names three of them for code that needs "the job's own": `mainKey` (Mind for a healer, Strength for a tank), `speedKey` (Spell Speed or Skill Speed) and `specKey` (Piety, Tenacity or null). Display names (`label`, `short`) come from one table by key, `STAT_LABEL` and `STAT_SHORT` in `src/core/constants.js`.
- **Weapon mode and slots.** Two-handed weapon (`'2h'`), one-handed weapon plus off-hand (`'1h+oh'`: Paladin, Beastmaster) or either (`'mixed'`: White Mage, Black Mage), from the lists `ONE_HANDED_JOBS` and `MIXED_WEAPON_JOBS` in `constants.js`; a unit test derives both from the item data. A job with a shield has the Off-hand among its active slots, which fixes the slots of Piece stats and the slot filter; the weapon's [slot share](../glossary.md) a hand-made weapon takes is 140 per mille for '2h' and 100 for the other two (Piece stats offers the one-handed Weapon and the Off-hand for a mixed job). Real pieces carry their own slot code, so a White Mage wand and shield, or a cloak that covers the head, use their own share and blocked slots in the browser and the optimizer.
- **Vitality factor.** 0.9 for Intelligence and Mind jobs, 1 otherwise. This is the factor the job's own gear carries. It is used only where no real item is involved (How the math works). A real piece uses its own stat factors, read from the game files for its kind ([math.md, section 4](../mechanics/math.md#the-stat-factor-of-an-item)).
- **Level cap.** 100, or the limited job's own: Blue Mage 80, Beastmaster 50 (a constant from the Lodestone patch notes, the same as xivgear's `JOB_DATA`; the game files hold no cap as a number, but each job's own gear stops at that equip level, [math.md, section 1](../mechanics/math.md#1-terms)). The synced level and the equip level filter stop there, and gear above it is left out of the gear list and the search.
- **Position in the item database's job mask**, used to filter gear the job can equip ([data-pipeline.md, section 4](data-pipeline.md#4-item-database-generation)).

Three properties make contexts safe to pass around:

- **Cached:** asking for the same job twice returns the same object.
- **Frozen** (deeply): no caller can change one by accident.
- **Total:** an unknown job id gets the default job's context (Paladin).

**Why it is built this way.** Keeping the current job's stat mapping in shared mutable variables that every function read would let code that forgot to update them, or ran between two updates, see a mix of two jobs. An explicit, frozen context makes each function's job dependence visible in its arguments and lets the tests run any job side by side. The stat keys matter for the same reason. Shared code may name a key in a table, but a job-specific key written into logic (`'sks'` where `job.speedKey` belongs) would break for the other jobs, so it asks the context (`tests/unit/core/stat-keys.test.js` greps `src/core` and `src/ui/views` for strays).

**From raw rows to stat keys.** The game database stores stats in a fixed raw order of 14 stats: all four main stats (Strength, Dexterity, Intelligence, Mind), Vitality, Piety, Tenacity, Direct Hit, Critical Hit, Determination, Skill Speed, Spell Speed. After them come the game's generic Main Attribute and Secondary Attribute.

The raw stats already carry the game's keys, so one function in the item module (`dbStats`) turns a raw row into the job's stats. The result has the keys the job has, with the generic Main Attribute added to its main stat and Secondary Attribute to its special stat (Direct Hit for a job with none). Nothing else reads raw stat positions.

## 3. The UI pattern

**The question:** when the user changes one setting, how does every affected part of the page update, without recomputing expensive results more often than needed?

The answer is a one-way data flow: one store, one derived view per page area, and a template that only displays views.

![At page load the saved state is read from browser storage, repaired, and becomes the shared store. A change in the store re-runs each component effect that read it; the effect calls the core logic and derives a frozen view, which the template displays. User input calls store actions, which change the store again. The store is saved back to browser storage 150 ms after the last change.](../diagrams/architecture-ui-flow.svg)

### The UI's modules

![Boot starts routing and saved state; both feed the stores and panels, which the view layer reads. The view layer uses form inputs, overlays, drawing, messages and the solver worker; styling and fonts serve every part. Build, tests, layout stress and test data sit around the page. Overlays and messages are done in several places and have no single module.](../diagrams/architecture-ui-modules.svg)

| Module | What it owns | Where |
| --- | --- | --- |
| Boot and failure message | Start-up order; a message when the page cannot start | `src/main.js`, `src/startup-failure.js` |
| Routing | The address of each screen, the settings in its query, the title, focus and scroll on Back and Forward | `src/ui/router/` |
| Saved state | Defaults, repair on load, the saved shape, browser storage | `src/ui/state.js`, `src/ui/sheets/storage.js` |
| Stores and panels | The shared store with its slices, actions and facades, each tab's Job and sync panel, the cap and level rules | `src/ui/store/`, `src/ui/job-sync-panel.js`, `src/ui/level-cap.js` |
| View layer | Pure view builders, the view cache, one Lit element per area, the Alpine wrappers, the templates | `src/ui/views/`, `src/ui/view-cache.ts`, `src/ui/elements/`, `src/ui/components/`, `src/partials/` |
| Form inputs | The number-box pattern, the cap and level error flags, the ranked stat menus | `src/ui/number-field.js`, `src/ui/elements/app/cap-field.ts`, `level-field.ts`, `src/ui/views/cap-field.js`, `src/ui/ranks.js` |
| Lit elements and Zag layers | The Lit elements (the Gear browser screen, its Slot menu, the Expansion and Gear categories menus, the Job menu, the Job and sync strip with the item level and level fields, the sheet manager and a sheet's page, the sheet and set switchers, the math bar, Stat Allocation, the GCD Scaling and Substat tiers sub-tabs, the Substat tiers "?" note, a placeholder counter), the Zag controller and the bridge to the overlay manager that they share | `src/ui/elements/` |
| Overlays | Menus, popovers and dialogs | several places (below) |
| Drawing | Charts, long lists drawn in steps, the window of rows of a Substat tiers card | `src/ui/sync-charts.js`, `src/ui/draw-in-steps.js`, `src/ui/tier-window.js` (which rows), `src/ui/elements/math-page/tier-rows.ts` (drawing them) |
| Messages | Save errors, notes, toasts, dialog errors | several places (below) |
| Solver worker | Auto-fill off the page's thread, with a fallback to the page's thread | `src/ui/solver.js`, `src/ui/solver-worker.js` |
| Styling and fonts | Colour tokens, dark and light themes, layout, font fallbacks, the HQ mark's font | `src/styles/`, `src/ui/hq-font.js` |
| Build | The one-file page and the dev server | `scripts/build/` |
| Tests | Unit domains, the smoke test, screenshots | `tests/`, `scripts/test.mjs`, `scripts/shots/` |
| Layout stress | Width, font and content sweeps, per browser | `scripts/layout-stress/` |
| Test data | The test data button and its sample sheets | `src/ui/test-data.js` |

Imports run one way, as in the layers: boot starts routing and saved state, both fill the stores, the view layer reads the stores and uses the parts below it, and nothing imports upward.

- **Overlays.** Menus, popovers and notes opened by a button are layers of one manager (`ui/overlays.js`): one stack, and one listener each for Escape, a press outside and the focus moving away. Every layer on it is an element with a Zag machine (the Slot, Job, Expansion and Gear categories menus, the tiers note, the math bar's popovers, the sheet and set switchers, and on the set page the piece picker, the materia menu, the Food menu, the Auto-fill settings popover with its Spare points note and every drop-down choice); each registers its open layer through the overlay bridge (next bullet).
  - *Rules:* Escape closes the topmost layer and puts the focus back on its button. A press outside closes it, and the focus stays where the press went. Tab out closes it (the Auto-fill settings popover is the exception: it is not modal and stays open). ArrowDown on a menu's button opens it. Opening a layer closes the others, except the ones it is part of (the settings' menus and note). A change of screen (tab, sub-tab, sheet, gear set, Back or Forward) closes every layer and never moves the focus: the router owns it (`main.js`).
  - *Keys written by hand, outside the machines:* Tab out of the Slot menu and the Job menu (above), ArrowDown on the math bar popovers' buttons (`bar-popover.ts`), and the set page's Escape (`pageKey` in `leave-guard.js`): with no layer open and no question asked, it discards a waiting Auto-fill result ([ui.md, section 6](ui.md#6-the-sheets-tab), Keys).
  - *Modal:* the Sheets dialogs (New, Copy, Edit sheet, Edit set, Delete) are a `<gsa-dialog>` (`elements/shared/dialog.ts`, a Zag dialog) that the Sheets template draws only while one is open, with the Alpine-run form as its content: Zag holds Tab inside, hides the page behind from assistive technology and blocks it, locks its scroll, and sends `dialog-escape` (Escape) and `dialog-close` (the X, a press outside) for the page to answer. The Copy sheet "?" panel is a `<gsa-collapsible>` (`elements/shared/collapsible.ts`, a Zag collapsible) whose open state the page keeps, so that the first Escape closes the panel and the next one the dialog. The leave question on the set page is the same element with `alert` (Zag's `alertdialog`): the set page's template draws it only while a draft, a running Auto-fill or a waiting result asks, the focus starts on Keep, and Escape, the X and a press outside all answer Keep (`leave.ask`, `answerLeave('keep')`); a change of page removes it. The math tab's "?" help is modal too: the focus goes into it and Tab stays inside.
  - *Not in the manager:* the Copy dialog's "?" panel (its open state is the dialog's, closed first by the dialog's cancel).
- **Zag layers.** An element that Zag's popover, menu or select machine drives is built on two shared modules (`src/ui/elements/shared/`), and each element is described below.
  - *The Zag controller* (`zag-controller.ts`): a Lit reactive controller over `@zag-js/vanilla`. It starts a machine when the element connects and stops it when it disconnects, asks the element to draw when the machine changes, and after each draw puts the machine's attributes and handlers on the parts the markup names with `data-zag-part`. It finds them under its own `data-zag-host` element only, so a machine nested in another's content takes none of its attributes, and it names the machine `zg-<kind>-<number>`, away from the page's own ids. `clearPlacement()` takes a closed popover's place (`--x`, `--y`) off its positioner, since Zag's `reposition` never does and a reopened menu would look placed before it is. It talks to a small local interface, so its tests run in Node with a fake element.
  - *The overlay bridge* (`overlay-bridge.ts`): it registers an open Zag layer with the page's manager, so the manager opens one layer at a time and closes every layer on a change of screen. Escape stays the machine's: the manager is told to ignore it for that layer, and the bridge's `guardEscape` (the machine's `onEscapeKeyDown`) hands an Escape to the manager when a manager layer sits above the Zag layer, so one Escape closes one layer whichever stack it is in. When the manager closes a Zag layer it does so with `restoreFocus: false`, because the machine would otherwise return the focus to its button after the press that closed it had gone to another control, and the manager's Tab-out rule would then close that control's layer. A layer of one kind may hold or sit inside another (`parent`).
  - *Menus on touch and Tab* (the Slot menu and the Job menu): Zag cancels the `pointerdown` of a menu's button, so WebKit sends no `click` for a touch tap and the menu would never open. Both elements pass the button's attributes through `touchFriendlyTrigger` (`zag-controller.ts`), which keeps Zag's `pointerdown` handler for the mouse only. Zag's menu holds Tab inside the list; the element closes on Tab instead and lets the focus move on (the one hand-written key rule of the element: Shift+Tab from the list first puts the focus on the button, so that it goes on to the control before it).
  - *Substat tiers "?" note* (`elements/math-page/stat-note.ts`, a Zag popover): one element for every card's "?", with no trigger of its own. The sub-tab's element, `<gsa-tiers-view>`, draws it inside itself and gives it the pressed button as `anchor` (placed through `positioning.getAnchorElement`) and the words as `note`; the note tells it with `note-close` when it closed by itself.
  - *Math bar popovers* (`elements/math-page/bar-popover.ts`, `<gsa-bar-popover>`, a Zag popover): the "?" help, the Substats & materia chip's and the Sync chip's are three of one element. It draws nothing and wraps the markup its parent gives it, which the math bar element draws (the Sync chip's holds the Level and Synced IL fields and the IL Sync switch); the parts are marked `data-zag-part`: trigger, positioner, content and an optional backdrop. Its attributes are the ids, the control that takes the focus, `modal` (the help: the focus stays inside and a press on the backdrop closes it) and `align-bar` (a popover that would pass the bar's right end hangs from the chip's right edge). It sends `popover-close`. ArrowDown on its button opens it, a hand-written key like the other menus' (it is the one key the element adds).
  - *Slot menu* (`elements/gear-browser/slot-menu.ts`, a Zag menu with radio items): it opens on ArrowDown, picks with Enter, and Escape, a press outside or a pick close it with the focus back on its button. Its layer goes through the bridge like every other.
  - *Expansion and Gear categories menus* (`expansion-menu.ts`, `gear-categories.ts`, with the tabs in `gear-sections.ts`, a second element and Zag tabs machine because one element holds one machine): Zag popovers (not modal, no focus moved in on open) built by `filter-popover.ts`. ArrowDown or a click on the button opens the panel, Escape and a press outside close it with the focus back on the button, a Tab out of it closes it, floating-ui places it under the button (the Gear categories panel with its right edge on the button's, over the button when there is more room above) and Zag's `--available-height` cuts it. `filter-menu-model.ts` holds what they work out from the data (tabs, button texts, the lists after a tick) with no DOM.
  - *Sheet and set switchers* (`elements/sheets/switch-menu.ts`, a Zag popover holding a plain list of links, no `role=menu`): the first row goes to the parent screen, then one link per sheet or set with the open one marked, and a "+ New" button; a plain click picks, any other click is the browser's. The open row takes the focus, Tab and Shift+Tab walk the rows as in any list of links, the list closes when the focus leaves it and the caret (Zag's focus-outside dismissal; the focus stays where the Tab put it), and Escape and a press outside close it with the focus back on the caret. Its rows are drawn only while it is open.
  - *Job menu* (`elements/app/job-menu.ts`, `<gsa-job-menu>`, a Zag menu with radio items in role rows), one element for the strip and the math bar: the page gives it `job` and listens for `job-change`. ArrowDown opens it on the chosen job, Up and Down move between the roles and Left and Right inside one (the element's own keys), Tab closes it and the focus moves on; `sized` adds the hidden copy of the longest "Name (CODE)" for the math bar.
  - *Materia menu* (`elements/set-page/materia-menu.ts`, `<gsa-materia-menu>`, a Zag popover with no trigger of its own, like the tiers note): one element for every chip. The set page names the pressed chip as `anchor` and gives the grades by stat as `menu` (`views/stone-menu.js`); the element draws the grade grids, closes itself on a pick, Remove, Close, Escape or a press outside with the focus back on the chip, and tells the page with `stone-pick`, `stone-remove`, `grades-toggle`, `materia-close` and `materia-shown`. The menu always sits under the chip (no flip); the page scrolls it into the window on `materia-shown`, once Zag has placed it (`keepMenuInView`).
  - *Piece picker* (`elements/set-page/piece-picker.ts`, `<gsa-piece-picker>`, one for every row's piece button): a Zag popover, not a combobox, because its search box and Empty button sit inside the panel and Tab moves through them. The page gives it the pressed button as `anchor`, the picker (`views/piece-menu.js`, cut to the rows drawn so far) as `menu` and the search text as `query`, and takes `piece-pick`, `picker-query`, `picker-close` and `picker-shown` back. The set page's session still draws the long list in steps (`menus.js`: `limitRows`, `drawInSteps`); the element draws only what it is given and only while it is open.
  - *Food menu* (`elements/set-page/food-menu.ts`, `<gsa-food-menu>`, a Zag popover built by `filter-popover.ts`): the button and the menu with its search box, pills, switch, Sort row and list of meals. The set page's element gives it the button's words and, only while it is open (the element sends `food-open`), the meals (`menu`: a big list that the page builds only for an open menu), and takes the meal picked from `meal-pick`; the element reads no store. `food-menu-model.ts` holds its state (search text, pills, sort, the switch, how many rows are drawn) with no DOM. The opened menu focuses its search box, scrolls to the meal the row shows and draws its list in steps. It keeps under the page's pinned header and stuck column names (`viewTop`, a function the page gives it, which becomes the popover's `boundary`), and flips over the button when that side has more room.
  - *Auto-fill settings popover* (`elements/set-page/settings-popover.ts`, `<gsa-settings-popover>`, a Zag popover, not modal): like the math bar's popovers it draws nothing and wraps the set page's own markup (the gear button as the trigger, the positioner, the box, the X as the close trigger), because the set page's element draws the goal and Gear to search boxes inside it; the box is always in the page while the bar is at rest, hidden while closed. It is placed under the set bar (the closest `.tbar`, never flipped) and sends `settings-open` (`detail`: whether it is open). It stays open when the focus leaves it (`onFocusOutside` calls `preventDefault`: Tab goes on into the page), so only the gear, the X, Escape and a press outside close it; the focus goes to its first select when it opens. It is the parent layer of the menus inside it: its layer has the fixed id `settings`, which the box carries as `data-overlay-layer`, and `filter-popover.ts` reads it; a layer inside it is placed with `position: fixed`, so the popover's scroll box does not cut it. The Spare points "?" and its note are the element `<gsa-rank-note>` (`rank-note.ts`, built by `filter-popover.ts` like the filter menus, its right edge on the button's).
  - *Drop-down choice* (`elements/shared/select.ts`, `<gsa-select>`, a Zag select machine): every drop-down choice (the Slot, 1st and 2nd substat, Materia slots, Haste, Goal, Race / Clan and Party bonus boxes) is one of these: a button that shows the chosen option (`data-value` holds its value) and a list of options, sometimes under group headings. The element that draws it gives it `options` (`{ value, label, group? }`; `value` may be '' for an option that means none: Zag is given an internal key for it, because it builds an option's id from the value and sets no `aria-activedescendant` for an empty one, and the page, `change` and `data-value` keep ''), `value`, `button-id` (the id of the button; the list is `<id>-list`), `label` (the accessible name of the button and the list) and `disabled`, and takes the pick from `change` (`detail`: the value); the element never changes `value` itself, so a refused edit leaves the old choice shown. The `<label for>` next to it names the button, and a `.selhost` span holds it in its row. The list's room is the window's (`boundary`), because floating-ui takes the math bar (`overflow-x: clip`) for the box that cuts it. Inside the Auto-fill settings popover the list is a child layer of the popover's and `fixed` to the window; inside the math bar's Substats & materia popover it is a child of the popover's layer (the nearest Zag element's id).
  - *Select keys:* ArrowDown, ArrowUp, Enter and Space open the list on the chosen option; letters pick on the closed button and light an option in the open list; Escape closes with the value kept and the focus on the button; a press outside closes; Tab closes and the focus moves on (`closeOnTab`, `elements/shared/key-focus.ts`, shared with the Slot menu, since Zag's select would hold the Tab). The button's focus ring follows the last input (`trackLastInput`, the same file: a key press or a mouse or touch press anywhere on the page, so a click on a chip elsewhere that moves the focus into a popover shows no ring; the Job menu's lit icon follows it too).
  - A new Zag-backed overlay takes its keys from the machine.
- **Islands.** Alpine still runs the page root (the tabs and the footer), the Sheets tab (its dialogs and the wrappers of its elements) and the wrappers of the Gear browser and the Math tab. Each screen is a Lit element inside one of these wrappers, an island: `<div x-effect="Object.assign($el.firstElementChild, pageProps)" @sheet-action="onSheetAction($event.detail)"><gsa-sheet-page x-ignore></gsa-sheet-page></div>`. The wrapper's `x-effect` sets the element's properties from the screen's data (it runs again when what it read changes, a job change included), and the wrapper listens for the element's events and calls a store action. `x-ignore` keeps Alpine out of the markup the element draws (Alpine neither walks it nor evaluates a directive written into it). The element reads no store and calls no Alpine function; big objects go in by reference. An element inside an island is plain Lit: it takes its properties from its parent's template and sends events to it, with no wrapper (the math bar draws its Job menu, selects, popovers and the level and item level fields; the Gear browser draws its menus).
  - *The set page:* `<gsa-set-page>` is the one island given the store itself (`ports`, a frozen object that the wrapper passes on from `main.js`) instead of a view, since it holds a session with a draft, a running search and the leave guard; it follows the store through `store.subscribe` and calls the Sheets facade's actions, and still reads no `$store`.
  - *Whole screens* (the sheet manager and a sheet's page): the element gets its view from the wrapper (`x-effect="Object.assign($el.firstElementChild, pageProps)"`, the view null while another screen is open, so the element draws nothing and keeps its own state), and sends one `sheet-action` event whose `detail` says what happened; an action that needs the store's answer (a step of a row, an edit of the level or cap) has a `result` field that the wrapper fills in before the event returns.
  - *The math bar* (`<gsa-math-bar>`): its wrapper is the sticky `.mathbar` box (`x-effect="Object.assign($el.firstElementChild, barInput)"`); the Sync settings chip with its popover (the Level and Synced IL fields and the IL Sync switch) is drawn by the element, which sends `level-change`, `cap-change` and `sync-change` for the page to apply. The Slot, substat and Materia slots menus are `<gsa-select>` elements inside it.
  - *The Job and sync strip* (`<gsa-job-strip>`, the Gear browser's): its wrapper keeps the strip's section, `x-show` and `data-job`. A form of the Sheets dialogs, which Alpine still runs, holds the same two fields in wrappers that take no box (`.fieldhost`).
  - *Registration:* each element file registers itself on import, and `src/main.js` imports the elements the templates use, so the one-file build bundles them. The element's CSS is in `src/styles/` like any other, written for the light DOM.
- **Messages.** The note after an action and the message of a failed save are one element at the window's bottom, outside the tabs (`<gsa-notes>`, `elements/app/notes.ts`; `#sh-toast` and `#sh-save-error`; an own element, not Zag's toast group): both are always in the page, empty when there is nothing to say, so a screen reader announces the text when it arrives. The text lives in the sheets slice (`note`, `noteSeq`, `saveMessage`); the page gives it to the element, which sends `note-expire` `NOTE_MS` (`note-timer.ts`) after a note was last said, and the page then clears the note. A failed save's message stays until a save succeeds. A dialog's field errors share one partial (`src/partials/dialog-error.html`). The bar for unavailable storage (`#sh-unavailable`) is still on the Sheets tab.

### One shared store

All state that matters lives in one store (`src/ui/store/`): a plain object tree that named actions change in place, with a revision per top-level slice (and per part of the `settings`, `screen` and `math` slices) and one notification per tick. It is not a reactive proxy, so the optimizer and the worker read plain data: a change is announced by `store.update(name, change)` (`store.ts`), never noticed by a setter. The **job context** of a panel is made from its job's id (`makeJobContext`, cached, frozen); the **highest real item level** bounds the item level boxes. The GCD and Substat tiers sub-tabs keep **their own boxes** (a level, and for GCD a haste and a speed), each empty until typed in: GCD Scaling follows Stat Allocation's synced level until the user sets one, and Substat tiers (which has its own job) its job's level cap. A gear set page's draft, its Auto-fill's result (the suggestion until Apply or Discard) and its Auto-fill status are in the store too (`setPages`, below).

| Slice | Holds | Saved |
| --- | --- | --- |
| `settings` | the Gear browser's filters, Stat Allocation's example piece, the sheet list's figures, Substat tiers' job, and each reference tab's Job and sync panel (job, cap, sync, level) | yes |
| `screen` | the open tab and math sub-tab, and the tab a click is opening | no (the address names it) |
| `math` | the GCD sub-tab's settings and the level typed on Substat tiers | no |
| `sheets` | the saved sheets as loaded, the screen the Sheets tab shows (manager, sheet or gear set), the note, the save message, the edit lock | each sheet on its own edit |
| `setPages` | one entry per open gear set page: its manual draft, its Auto-fill suggestion, the Auto-fill's status and search id, the Gear to search count and its answer, and the line about the search | no |

- **Actions.** An action is named `<slice>/<name>` (`settings/setJob`); `update` counts it in the slice's revision and in a log of the last 50 names, and tells the listeners once at the end of the tick, however many actions ran in it. The actions are in `app-actions.ts` (settings, screen, math), `sheets-actions.ts` (the Sheets tab) and `set-page-actions.ts` (the gear set pages); an action that would change nothing returns before `update`, so nothing renders or saves. A number typed in a box is checked by the box (`number-commit.js`) before it calls an action.
- **Reading.** The selectors in `app-state.ts` return plain data from the state: `panelOf(state, tab)` (a tab has one panel, held once in `settings.panels`), `persisted`, `currentSheet`, `routeOf`. `Select` (`select.ts`) is a controller that asks its host to render again only when what it selected changed; `watch` (`watch.ts`) calls a function when a selector's value changes, and the router and the overlay manager use it.
- **Revisions.** `update` counts an action in its slice's revision. The `settings`, `screen` and `math` slices are also split into **parts** (`STATE_PARTS` in `app-state.ts`: each tab's panel field, `browse`, `piece`, `tiers`, `sheetFigures`; the open tab, the math sub-tab, the pending tab; the GCD settings and the Substat tiers level), each with a revision that counts only the actions that changed it. The store finds the changed parts itself: it copies each part one level deep before the action and compares it after (`Object.is` on each field; a new object or array counts as changed), so an action names nothing but its slice and cannot forget a part. A part's revision key is `<slice>.<path>` (`settings.browse`, `settings.panels.math.cap`); the constructor refuses a state key that is in no part. `tests/unit/ui/store/app-actions.parts.test.ts` runs every app action and checks the parts that moved against what really changed, and that every getter whose value changed read a part that moved.
- **Facades.** The templates and components read `$store.app` and `$store.sheets`, two facades over the store (`app-facade.ts`, `sheets-facade.ts`, put together with the actions by `page-store.ts`). A getter of the app facade reads the revision of each part it returns and no other (an Alpine-tracked copy that `update` writes as the action runs), so a binding runs again only after a change of what it shows: a typed-but-unsaved number box is not rewritten by an unrelated setting of another part, and one that finds its own setting unchanged keeps its text (`numberField`). The plain objects it returns (`browse`, `piece`, `gcd`, `tiers`) are frozen copies, made again only after their part changed, so nothing outside an action can change the state through them. A getter of the Sheets facade reads the revision of its slice, and returns the plain state; a method is an action. The page registers both frozen (`sealFacade` in `page-store.ts`, called by `main.js`): nothing in a facade can be assigned to, defined on, deleted or added to, from a console or anywhere else, and Alpine, which leaves an object that cannot be extended unwrapped, reads them as they are (the facades hold no state of their own: their getters read the tracked revisions). A write is a call (`editPanel`, `editBrowse`, `editPiece`, `editGcd`, `setSheetFigures`, `setNote`, ...), and `tests/unit/ui/store/no-direct-writes.test.js` searches the sources for an assignment. The number boxes write through `setField(path, value)`.
- **Saving.** `autosave.ts` subscribes once to the store: it writes the JSON of `persisted(state)` 150 ms after the last change of the `settings` slice, and at once when the page is hidden. The sheets are saved by their actions, one record each (`sheets/storage.js`).
- **Test hook.** `window.gsaDebug` holds the two facades, `state` (the store's state) and `log` (the last 50 action names), read only.

There is no gear pool to keep: an Auto-fill searches every piece the job can wear that passes the set's filters ([optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters) says why no pool is built), so the store holds only settings. Searching everything costs nothing in speed (building a job's gear takes about 5 to 10 ms; a whole search takes about 20 ms, see [optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

Changes of the settings go through the actions: set job (`setJob(id, owner)`, owner `'browse'`, `'math'` or `'tiers'`), reset everything, switch tab or math sub-tab, and the edits of a panel, the browser's filters, the piece and the GCD settings.

**The sheets' part.** The Sheets tab's slice (`sheets`) holds:

- the saved sheets (`data`);
- the open screen (`screen`: the manager, a sheet or a set, with `sheetId` and `setId`);
- the actions that make, edit, copy, delete and reorder sheets and gear sets, change a sheet's level and item level sync, and save a set (`updateSet`, for the set page).

The sheets are user data, not settings: an action replaces a sheet, never edits it in place, and every reader (`list`, `sheet`, `currentSheet`, `currentSet` of the facade) hands out the plain data. The facade's `rev` is the slice's revision, so a view cached by it is built again after any action of the Sheets tab. The set page's leave guard is a function the actions keep (`setLeaveGuard`), since a function is not state; what a page holds that leaving would lose is in the `setPages` slice, which the `unsettled` selector reads.

The operations on the plain data (a new sheet or set, Copy sheet with the pieces the new job cannot wear cleared, names) are pure functions in `src/ui/sheets/ops.js`; what the open dialog's main button does with its fields is `src/ui/sheets/dialogs.js` (`submitDialog`). While `busy` is set (an Auto-fill runs) every edit action is refused. The component (`components/sheets.js`) builds its views from the store with `viewCache`, keyed by `rev`, and keeps only the open dialog's fields.

**The Sheets tab's component.** `components/sheets.js` is a thin composer: `sheetsTab()` joins four parts, one file each in `components/sheets/`, with `compose` (`components/compose.js`, which throws when two parts define the same member). Each part is a function that returns its members; they share `this`, so a part calls another's members, and each file's header names the members it borrows. A closure variable stays inside the one part that uses it (`managerCache`, `pageCache`, `headerCache` in `view.js`; `tabEl` in `frame.js`; `returnFocus` in `dialog.js`), so none is passed between parts:

- `frame.js`: start (a dialog left open closes when the tab, sheet or gear set changes), the `sheets` store getter, the screen to draw and `afterDraw`;
- `view.js`: the manager, the sheet's page and the set page's header views, and the properties of the three island elements (`managerProps`, `pageProps`: each element's view while its screen is open, else null; `setPageProps`: the set page's ports, its top line and whether a dialog is open);
- `actions.js`: the answers to the elements' `sheet-action` events (a table of one answer per action) and the pick of the caret menu after a sheet's name;
- `dialog.js`: New sheet, Copy sheet, Edit sheet, Edit gear set and Delete, with the focus returning to the opener, the form fields and the keys.

**The sheet manager and a sheet's page.** Two Lit elements in light DOM (`elements/sheets/sheet-manager.ts`, `sheet-page.ts`), islands in the Sheets tab. `<gsa-sheet-manager>` draws the sheets table, the unreadable records, the empty card and the "not found" screen; `<gsa-sheet-page>` draws the breadcrumb with its caret menu, the sheet's banner and settings (level, item level, IL Sync, Race / Clan, Party bonus) and the gear sets list with the Effects / Stat points switch and the sortable headings. They show a view that the view builders make (`views/sheet-manager.js`, `sheet-sets.js`: `sheetListView` the list in its sort, `sheetSwitcherView` the caret menu) and tell the page what the user did in `sheet-action` events (`sheet-action.ts`). What an element keeps is what the screen alone needs: the gear sets list's sort (back to the saved order when the sheet or the Effects / Stat points switch changes) and the cap the page last lowered. The level and item level boxes are the shared fields `<gsa-level-field>` and `<gsa-cap-field>` (below); an edit asks the page and the answer comes back in the event's `result`, whose lowered cap the page gives to the item level field. Two controllers and a helper serve both elements: `row-reorder.ts` (`RowReorder`, a Lit reactive controller: dragging a row by its handle, dropping it above or below the row under the pointer, and Up and Down on a focused handle, which keeps the focus on the handle after the page draws the new order; it changes no data) and `open-row.ts` (`opensRow`: a click anywhere on a row opens it, but not a click on the row's own controls (the name link, the buttons, the drag handle) or one that ends a text selection in the row; the name link stays the keyboard and screen-reader way in, the row has no role and no tab stop).

**The Job and sync strip and the cap and level fields.** `<gsa-job-strip>` (`elements/app/job-strip.ts`) draws the Gear browser's strip row: the Job menu, the synced level, the synced item level, the IL Sync switch and Reset (which asks the browser first). The level and the item level are `<gsa-level-field>` and `<gsa-cap-field>`, one field for every place that has one: the strip, the Sync settings popover of Stat Allocation (inside `<gsa-math-bar>`), a sheet's page and the New and Copy sheet forms. A field is its own box (it puts the classes of the place it is in on itself, from its `layout`), reads no store, shows `capFieldView` and `levelFieldView` (`views/cap-field.js`: the error, the note after a lowering and the flag in the label line, from `level-cap.js`), commits through the shared number box and sends `cap-change` and `level-change`. The cap field has the rest of the rule: any whole number from 1 as typed, text that is no item level flagged, and, with `follow` (the strip and the popover, while their tab is open), the lowering to what the level allows when the stored cap changes, IL Sync is switched or, after `TYPING_DEBOUNCE_MS`, the level changes (`cap-follow.ts` says which change does what); it tells the page what it lowered in `lowered-change`, and shows the note, the flag, the gold border and the flash each time `lowered` is a new object. Where the page lowers the cap itself (a sheet's page, the dialogs' form), it gives `lowered`. The level field flags text that is no level (`validate`) and drops it when its `scope` changes (the math tab's open tab and job).

**The set page.** A set page is one Lit element in light DOM (`elements/set-page/set-page.ts`, `<gsa-set-page>`), an island in the Sheets tab, made again for each set it shows (the template's `x-for` keys it by the set's id), so nothing of one set's page outlives it. The tab's wrapper gives it its `ports` (the store, its Sheets facade, the solver and the highest real item level: `SetPagePorts`, made in `main.js` and frozen so Alpine hands it on unwrapped), the set's `setId`, `header` (the page's top line, `setHeaderView`) and `dialogOpen`; the element never reads `$store`, follows the store itself (it draws again when the revision of the Sheets tab or of the set pages changes) and sends `sheet-action` for Edit and Delete, whose dialogs the tab owns. It draws the sticky header (breadcrumb, the set's name and buttons, the set bar, the stat block), the gear table with its totals and the menus and popovers that are elements of their own (piece picker, materia menu, Food menu, Auto-fill settings popover with its selects, number boxes and the two filter menus, and the question before leaving, a `<gsa-dialog>`). A template only displays: the page's view comes from `views/set-page.js` (`buildSetPageView`; `setPageViews` keeps it, and the Food menu, until the sheets' revision, the set, the draft or the suggestion changes; `fillButtonView`, `noPiecesFlag`), typed for the template in `set-page-types.ts`.

What the page does is its **session** (`elements/set-page/session.js`, `PageSession`: plain classes, no DOM and no Lit, so they run in Node): it reads what the store holds of this page (the saved set and its sheet, the draft, the suggestion, the Auto-fill status, the Gear to search answer, all through `ports.sheets`) and owns five parts, one file each:

- `menus.js` (`PageMenus`): the open piece picker, materia menu and Food menu, the views of the first two, where an open menu sits in the window (`viewTop`, `menuRoom`, `keepMenuInView`) and the caret menu after the set's name;
- `edits.js` (`PageEdits`): edits by hand and pins;
- `fill-run.js` (`PageFill`): an Auto-fill and its suggestion;
- `fill-settings-edit.js` (`PageFillSettings`): the Auto-fill settings' goal and Gear to search boxes and the Gear to search count (the popover itself is `<gsa-settings-popover>`);
- `leave-guard.js` (`PageLeave`): the question before leaving and the page's keys.

The parts reach one another through the session (`session.edits.pick(...)`). The session is made when the element has its ports and set (`willUpdate`) and stopped when the element leaves the page; it asks the element only for `host`: `query(selector)` (an element of the page, for the focus and the scroll), `afterDraw(callback)`, `requestUpdate()`, `isConnected` and `dialogOpen`. What a part keeps that the page draws (the open menu, the question, the note about a moved rank) calls `session.changed()`, which draws the page again. The header's height is followed by the element (`--sh`).

- **What is saved when.** Nothing it proposes is saved until Apply: the manual draft (a second GearSet) and an Auto-fill's suggestion live in the store's `setPages` slice only, one entry per open page. A pin and the Auto-fill settings go through `updateSet` at once.
- **The page's entry in the store.** `set-page-actions.ts` opens an entry when the page starts (`openPage`) and drops it when the page goes (`closePage`), so a page left holds nothing. The entry is frozen and replaced on each change; the draft goes in as a frozen copy (`frozenCopy`) and the suggestion as a frozen object, both stored by reference. The template engine cannot wrap a frozen object, so the page reads them plain through `sheets.page(setId)` (the session gives `draft`, `suggestion`, `running`, `fillLine` and the Gear to search answer as getters) and nothing is unwrapped. Every change is an action (`sheets.pages.setDraft`, `startFill`, `fillSuggested`, `fillEnded`, `cancelFill`, `endFill`, `setSuggestion`, `startCount`, `countLanded`, `countFailed`).
- **The Auto-fill's status.** `fill` is `idle`, `running`, `waiting` (a suggestion is there), `failed` or `cancelled`. Each search gets an id from one counter of the store (`startFill`), and the answer carries it: an answer whose id is not the page's current one (the search was cancelled, a newer one runs, the page was left) is ignored, as is a Gear to search count that is not the newest. The worker and the page's thread solver still get plain data: the request is built from copies (`clone`), never from the store's frozen entry.
- **The view.** `setPageViews` builds the table, the totals and the stat block of the set shown (the saved one, the draft, or the saved one with the suggestion taken) through `viewCache`, keyed by `rev`, the set, the draft and the suggestion.
- **Edits by hand.** They are pure functions of plain data in `sheets/set-edits.js`; the piece picker (`views/piece-menu.js`), the materia menu (`views/stone-menu.js`) and the Food menu (`views/set-meal-menu.js`) are pure views too. The job's wearable pieces for the picker are built once per job and kept in a module `Map`, out of reactive state. The picker's lines (name, stats, sort order) are built once per job and slot (a `WeakMap` in `piece-menu.js`), and the view is kept for the next read of it. The picker and the Food menu draw their rows in steps (`views/limit-rows.js`, `ui/draw-in-steps.js`): about 30 rows when the menu opens, 40 more each frame, so the menu appears at once and no task is long.
- **An Auto-fill.** It asks the page's solver (`solver.js`) with the set's id as the request's `key`, so a set's requests replace only that set's earlier ones, and sets the store's `busy` while it runs.
- **The leave guard.** The set page registers a **leave guard** on the store (`leaveGuard`). The store's moves off a set page (`openManager`, `openSheet`, `openSet` of another set, `closeSet`) call `askLeave(move)` first. While a draft, a running Auto-fill or a waiting result is there, the guard keeps the move and asks; the answer runs it.
- **The reload and close guard.** The store's `unsettled(state)` selector says whether any open set page holds a draft, a running Auto-fill or a waiting result (no side effect; the set page's leave question asks the same rule of its own page, `unsettledKind`). `installUnloadGuard` (`router/unload-guard.js`, started in `main.js`) adds a `beforeunload` listener that asks the browser for its own question while `unsettled(store.state)` is true. The **dev flag** turns it off: the `localStorage` key `ilvl-stat-lab-v4:no-unload-guard` set to `1` (read inside try/catch at each unload; `UNLOAD_GUARD_OFF_KEY`). A person never sets it; the smoke test does, so its reloads are not held.

**Shared menus with another owner.** The Expansion and "Gear categories" menus are elements that take the filters as properties and send the change as an event; the Gear browser's element and the set page's `filters` and `setFilters` (`set-page/fill-settings-edit.js`, which read and write the set's Auto-fill settings) are their two owners.

**Number inputs.** What typed text commits and what the box shows is one pure function, `commit(text, options)` in `src/ui/number-commit.js` (with `formatNumber`), used by every number box. A number box bound to a setting uses one helper, `numberBox` in `src/ui/number-field.js` (`$num` and `numberField` bind it for Alpine; a Lit element such as the Gear browser's calls it from its own handlers), which adds the timing, with two rules:

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

The Target GCD range is `TARGET_GCD_RANGE` in `job-sync-panel.js`, also used by `restoreState`.

Two kinds of box keep their own handlers, on purpose:

- the GCD tab's level and speed correct what is typed and say so (the rule is `commit`'s, the debounce and the message are the tab's);
- the boxes that commit only on Enter or leaving (the tiers' substat values go through `commit` with `final`; the math bar's item level box keeps its own rounding and bounds in `ilvlEdit`, `views/math-bar.js`), since a value on the way would be held to its range while typing.

**Changing the job.** Nothing but the job-specific selections is lost, so the page switches at once, without asking:

![Switching to any other job in the Job and sync panel, even one in the same role, happens at once without asking and changes only the open tab's selections. Each selection is kept, reset to the new job's defaults, or held to the new job's level cap; the lists below the diagram give each one.](../diagrams/architecture-job-switch.svg)

What the diagram shows, by outcome:

- **Kept when the new job can use it, else reset to the new job's defaults** (a stat it has under the same name; a slot it wears):
  - on How the math works: the Piece stats substats (Critical Hit, then speed; both stay or both reset) and the slot (head, only if the new job lacks it);
  - on the Gear browser: the slot (any slot) and the sort (item level).
- **Held to the new job's level cap, lowered only if above it** (90 becomes 80 for Blue Mage): the synced level and the Gear browser's equip level filter.
- **Kept:** sync cap and sync switch, the browser's Gear categories boxes, market board switch, expansion and item level filters and search text, the Piece stats item level, the GCD and Substat tiers boxes, and the open tab.
- **Not changed:** the other tab's job and settings; a sheet has no panel, its job is set when it is made.

**One panel per tab.** The Gear browser and How the math works (Stat Allocation) each have their own Job and sync settings (job, cap, sync, level), saved in `browse` and `piece`. The store's top-level `job`, `cap`, `sync`, `level` and `jobCtx` are the open tab's copy, which the open tab's controls edit (the Gear browser's strip, Stat Allocation's math bar); `showTab` keeps the leaving tab's copy in its group and loads the new tab's. Substat tiers has its own job, saved as `tiers: { job }` (`tiers.job`, default Paladin, repaired on restore): `panel('tiers')` returns that job with no cap, no sync and the job's level cap as the level, and `setJob(id, 'tiers')` calls `setTiersJob`. `mathJobOwner(mathTab)` names the owner of the open sub-tab's Job box (`'tiers'` on Substat tiers, `'math'` otherwise). GCD Scaling has no job box.

- **Reading.** A component reads its own tab's panel through `store.panel(tab)` (`panelOf` in `job-sync-panel.js`), so a hidden tab never works with the open tab's job.
- **Changing the job.** `setJob` resets only the open tab's selections (`resetForJob` takes the tabs to reset).
- **Restoring.** `restoreState` takes each group through `splitPanelSettings`, restores it for its own job, and gives an older save's single panel to both tabs.
- **The cap on Stat Allocation.** While IL Sync is off the cap holds the item level that level sync gives (`holdLevelSyncCap`: null at the job's level cap). It follows the level box, the job, Reset and a load (`followLevelSync`, called by those actions and by `setPanel`, `restoreState`), never a watcher; switching IL Sync on keeps it.
- **The Sheets tab.** It has no panel (`PANEL_GROUP` has no group for it; each sheet holds its own job, level and sync). The panel is hidden there, going to it keeps the top-level copy as it was, and a save made on it restores the Gear browser's panel as the top-level copy.

**Reset to defaults** puts the open tab's settings back (its panel and its own fields), with the default job (Paladin), after the browser's own confirmation dialog. The other tabs and the math sub-tab stay as they are.

### Each area derives a view

Every page area is a component that shows one **view** object. The view holds everything the template shows: formatted numbers, table rows, CSS classes, labels. The template only displays it.

The functions that build views are pure and live apart from the components, with no dependency on the UI framework. They take **plain inputs**, never the store:

- the job context;
- the sync settings (`syncSettings`);
- the area's own settings (the browser's filters, Piece stats' piece, a set's Auto-fill recipe);
- for an Auto-fill, a solver session.

A component assembles those inputs from its store (`job-sync-panel.js` has the helpers, such as `syncSettings`). So the unit tests check what each tab shows directly. The views carry their text too (sentences, headings, the readout's lines), so the template does not build text from several fields.

**One pattern for derived views** (Gear browser, Piece stats, GCD, Substat tiers). The component has a getter, `view` (in an element, as `<gsa-piece-stats>`'s: `pieceStatsView` for the settings it is given and the chart's width), that reads the inputs from the store (an element: from its properties), makes a key of them, and asks a `viewCache` (`view-cache.ts`) for the view of that key. A new key builds the view; the same key returns the last one.

- Reading the inputs inside the getter makes every binding that shows the view track them, so the page updates in the same render as the setting.
- The template reads the view many times a render; the cache builds it once.
- The cache lives in the component's closure, not in its reactive state.

The Gear browser's getter returns its last view while its tab is hidden, so the list is built only while it can be seen.

**Results on request** (a set's Auto-fill). Its result is not derived from the store on each change: **Auto-fill** asks the solver for it, and the set page keeps it as a suggestion. What follows the set's Auto-fill settings (the piece count, the pieces per "Gear categories" box, the Target GCD range) is one view, `gearToSearchView`. The set page asks the solver for it when the page opens, when its Auto-fill settings open, and after each change of them (`refreshCount`). A newer answer replaces an older one.

Each element gets the job through its own properties (a Job menu's `job`, a `panel` that holds it), never through a parent's scope. The Food row's menu is its own element (`<gsa-food-menu>`) inside the set page's. No module imports Alpine but `main.js`, which hands the set page its `ports` (the store, the Sheets facade, the solver, the highest real item level), so a unit test binds a component or a session to a plain store.

**Large data never enters reactive state.** Alpine makes an object it holds reactive by wrapping it in a proxy, and wraps nested objects as they are read. A frozen object is left as it is. Keeping big lists frozen or outside the store avoids wrapping thousands of rows on every recompute:

- The item database is a plain module-level constant that the core reads directly. It is never placed in the store.
- The views with long lists (the gear browser's rows, a set page's table) are frozen all through (`deepFreeze` in `view-cache.ts`) before an element keeps them, so nothing wraps or changes a row it reads.
- A menu inside a table (the piece picker, the materia menu, the Food menu) is one element for every row, and it draws its rows only while it is open; the page builds its list only for an open menu. It is not built hidden on every row ([perf-log.md, section 2.1](perf-log.md#21-the-set-page-after-an-auto-fill) has the measurement).
- The small parts of a set page's row that every worn piece shows (the pin, the gear category and source line, the stat cells) are the other way round: kept in every row and hidden (`hideWhen` in `set-page.ts`) while the row is empty, because an Auto-fill turns every empty row into a worn one at once. The materia chips and the Take boxes are drawn only for a worn piece.
- The gear browser's rows are the template of one Lit element (`GsaGearBrowser`, `elements/gear-browser/gear-browser.ts`), not HTML strings built in JavaScript. The element is an island (a wrapper in `src/partials/gear-page.html` gives it `panel`, `browse` and `active` and takes `browse-edit`); its view is built by `GearBrowserModel` and kept in a field, frozen, never in reactive state.
  - *Plain fields:* the view builder (`views/gear.js`) gives each row plain fields (`rowCls`, `nameParts` with a class each, `twice`, and per stat a cell with `cls`, `col`, `title`, `text`, `was`). So every binding is one property read, and text goes through a text binding, which never makes markup.
  - *Few bindings:* a stat cell is one `td` and one span. The cap bar and the bold come from the `cut` class, and the muted number under the value is drawn by CSS from the cell's `data-was` attribute (`#gear-table td[data-was]::after`), not by an element of its own. A page is 50 rows, and the time is the number of bindings. The pointed-at and the sorted column are tinted by CSS rules on the table's `data-hot` and `data-sorted` attributes (`set-page.css`, one selector per column key), not a class on every cell.
  - *Draws only when the list changes:* the rows are inside a `guard` on the view, so the pointer moving over the table (which changes `data-hot`) draws nothing in the rows; while the tab is hidden the element does not draw at all (`shouldUpdate`).
  - *Measured:* [perf-log.md, section 2.3](perf-log.md#23-the-gear-browser-as-one-lit-element-run-of-2026-11-25) (the clicks and the switch from Sheets, before and after the element).
  - *Rows by place:* the rows are drawn with `map` over `view.shown`, never `repeat`, so a row is the place on the page and not the item. A sort, a page, a slot, a filter or a job change keeps the 50 rows and only rebinds them, instead of removing 50 and building 50: about 30% less time for a click in the table at 4× CPU throttle ([perf-log.md](perf-log.md), section 2.2). The cost is that a kept row shows its old item until every binding has run, so every part of a row must come from the same item in one draw: the two marks (HQ, x2) are `hidden` bindings of the row's own template (`.hqg[hidden]` in `pieces.css` beats the font rule's `display`), not a deferred show. Nothing in a row may follow the place instead of the item: the smoke step `checkBrowserRowsMatchView` compares every row with `view.shown` before each drawn frame. The page line's buttons and the headings are the exception: they are `repeat`ed by key, so the focus stays on the page button pressed when the numbers move.
- The database facts of a piece (`rowFacts` in `items.js`) are looked up through an index of rows by pool key, built on first use, and each key's facts are built when first asked for. The page's thread builds the index when it shows its first game piece (an Auto-fill's first result). Building every key's facts there blocked it for about 25 ms (150 ms at 4× CPU throttle).
- The job's gear an Auto-fill searches is built once per job, frozen, and kept in the solver session, which lives in the page's Web Worker ([section 9](#9-the-optimizers-worker)), never in reactive state. Frozen means the list and each pool item with its stats (`mkItem` in `items.js`), so the worker and the page's thread hold the same frozen objects, and `deepFreeze` stops at them.
- The set page's draft and suggestion are frozen objects in the store, which Alpine does not wrap, so nothing is unwrapped; the worker is sent plain copies built for the request: a worker cannot be sent a proxy.

### Heavy work: debounced, only when visible, or on request

Cheap areas recompute at once; expensive ones wait, run only while the user can see them, or run only when asked:

| Page area | When it recomputes |
| --- | --- |
| Settings, How the math works | On every relevant change |
| Gear browser | On a relevant change, while the Gear browser tab is open |
| A set's Auto-fill | When the user presses Auto-fill (the piece count: note below) |

Notes:

- **Settings, How the math works** are cheap: a few formulas per piece; the explainer's curves (a few thousand generic pieces per setting) are remembered per setting, so a slider move costs a few milliseconds.
- **Accuracy check**: it scans every item in the database, so it runs only once.
- **Gear browser**: the database matches of its filters (including its own Gear categories boxes and market board switch), with synced stats. It recomputes on any change of its filters, sort, job, cap, sync, level or page, and shows 50 matches a page; any change but the page goes back to page 1. Its layout is in [ui.md, section 3](ui.md#3-the-gear-browser-tab).
- **A set's Auto-fill**: every piece the job can wear that passes the filters under the set's Gear to search (expansions, equip level, item level range, Gear categories; the browser's filters with the set's own values). Its parts:
  - *When it runs:* only when the user presses Auto-fill, not on a change of those filters or the set's Auto-fill settings. The piece count under Gear to search is asked for when the set page or its Auto-fill settings open, and after each change of them.
  - *Where it runs:* in a Web Worker, so the page stays responsive while it runs (tier ranking can take a few seconds); "Solving…" and Cancel show until the answer comes, and every edit on the Sheets tab is off ([section 9](#9-the-optimizers-worker)).
  - *Its answer:* a suggestion the set page keeps until Apply or Discard; nothing is saved before Apply ([ui.md, section 2](ui.md#2-auto-fill-the-search-on-a-set-page)).
  - *On failure:* a search that fails (not a cancel) leaves the set as it was, with the line "Auto-fill failed: <reason>." under the set's header.
  - *Limits and timing:* [node limit](../glossary.md) 700,000. The page records how long each search took as the `fill` performance measure (the first search for a job includes building its gear).

**How the waits work.** A typed number and the save are debounced: their timer restarts on every change, so typing 123 commits once and a burst of changes saves once. A set's piece count is asked for after each committed change of its Auto-fill settings; the solver answers in the set's lane, so a newer request replaces one still waiting. Pressing Auto-fill right after typing still searches with the value typed: the click first moves the focus out of the box, which commits it. Run times are in [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

![Timeline in milliseconds after typing 1, 12 and 123 into the sync cap, 100 ms apart as an example. The field commits only 123, 300 ms after the last keystroke (Enter or leaving the field commits at once). When the store changes, Settings, How the math works and the open Gear browser recompute at once; a set's Auto-fill on the Sheets tab does not run; the saved state is written 150 ms later. The field's wait and the save's restart on every change. A box in a set's Auto-fill settings commits the same way, then asks for its Gear to search count at once.](../diagrams/architecture-timing.svg)

## 4. Persistence

**The question:** what does the page remember between visits, and what happens when the remembered data is wrong?

The page remembers the user's settings in the browser's local storage. This is a convenience for one viewer on one browser: the page renders correctly without it, and every read and write is guarded, so a private window or blocked storage simply starts from the defaults.

**What is saved.** One JSON object under one key: job, sync cap, sync on or off, character level (a panel each for the Gear browser and Stat Allocation), Substat tiers' job, open tab and math sub-tab, the Piece stats inputs (slot, substats, materia slots, item level), browse filters and sort with its Gear categories boxes and market board switch. The saved sheets have their own records (below). The job context, the job's gear, views and browse results are not saved; they are rebuilt.

**When.** One effect serializes the whole saved object (the sheets are saved separately, on their own edits), which makes it depend on every saved field, and writes it 150 ms after the last change.

**Validation on restore.** Stored data can be old, from another job's role, or hand-edited, so it is never trusted:

![Restoring splits the saved settings into one panel per tab (an older single panel goes to both), starts each tab from the defaults for its own job, then keeps each saved field only if it has the right type and range, else uses its default. The example below the diagram is from running the code.](../diagrams/architecture-restore.svg)

The example in the diagram, from running the code: a save with the math tab for Blue Mage (level cap 80) and the Gear browser for Sage.

- Math tab: the old tab name "pool" becomes the Gear browser; job Blue Mage is kept; level 95 becomes 80; sync cap 9999 becomes 795; Piece stats slot off-hand becomes head; substats speed, speed, Critical Hit become speed, none.
- Gear browser: job Sage and level 95 are kept; its sort by Tenacity becomes item level; an older save's Gear optimizer settings are dropped.

A saved job id that is not a known job becomes the default job (Paladin). The rules for each field:

- numbers are rounded and clamped (item levels to 1 to 795, the highest real item level; character level to 1 to the job's level cap, 100 or the limited job's own);
- choices (tab, slot, stat, sort, filter) must be one of the values valid for this job;
- substat lists drop unknown or repeated entries, and an older third substat rank is dropped;
- older saves are translated: the math sub-view stored as the tab, the Gear pool tab (the Gear browser), and the one gear-group list that served both tabs (the browser starts from it). A saved pool is ignored, and so are an older save's search settings (`opt`, `optPanel`): a search's settings live on each gear set of a sheet. A list of left-out boxes with a key that is no box (such as an old save's six gear groups) starts over from the default boxes.

An invalid field falls back to its default and the valid ones are kept. The state unit tests cover this field by field ([testing.md, section 2](testing.md#2-what-each-file-covers)).

**Saved sheets.** Sheets are the first user data, so they are not in the settings object. `src/ui/sheets/storage.js` keeps them under two more keys of the same family:

- `ilvl-stat-lab-v4:sheets`: the index, `{v: 1, order}`, the sheet ids, first is top.
- `ilvl-stat-lab-v4:sheet:<id>`: one whole sheet, its gear sets inside.

A save writes its own record, plus the index when the sheet is new (it goes to the top).

Two more keys are conveniences of the page, not saved data. The **dev flag** `ilvl-stat-lab-v4:no-unload-guard` (`localStorage`, `UNLOAD_GUARD_OFF_KEY`) turns the reload guard off (see "The reload and close guard"); the failure screen does not count it as saved data and its reset leaves it. The **scroll positions** are one JSON object, `{history entry id: scrollY}`, under the `sessionStorage` key `gsa-scroll-by-entry` (`ui/router/scroll-storage.js`: this tab only, written when the page is hidden, read at the start so a reload scrolls back; a value that is not a finite number is dropped, and a blocked or damaged storage reads as none).

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

1. **Bundle.** esbuild starts from the entry module and follows every import: Alpine, the UI, the core, the generated data, and the stylesheet (`src/styles/entry.css`, which imports the files of `src/styles/` in cascade order).
   - Each `src/data/*.json` becomes a `JSON.parse` call on its compacted text (the `jsonParseData` plugin: browsers read JSON faster than the same object as code; data-pipeline.md section 8).
   - It writes one minified script and one stylesheet, in memory. The script is a self-running function, for Chrome and Edge 130, Firefox 132 and Safari 18.2 and later: `BROWSER_TARGETS`, the Baseline 2024 floor (the first version of each core browser with every feature that became Baseline in 2024; read from the `baseline-browser-mapping` package's `getCompatibleVersions({ targetYear: 2024 })`, which reads the web-features data). At that floor esbuild lowers none of the page's JS and the stylesheet needs no prefixes or fallbacks for `@layer`, `:has()` or `color-mix()`.
2. **Inline.** The HTML template has markers for the styles, the script and the build marks. The build replaces them with the stylesheet, the script and, on any branch but `main`, a "DEV" test-build badge next to the title plus the branch and commit in the footer. A `main` build, which is what deploys, has no marks. The branch comes from GitHub Actions' `GITHUB_REF_NAME` when set, else from git; with neither (or a detached checkout) there are no marks.
   The optimizer's Web Worker is a second bundle, built inside the first by the `solverWorker` plugin from `src/ui/solver-worker.js` and inlined into the page's script as a string ([section 9](#9-the-optimizers-worker)).
3. **Checks.** The build stops with an error if a marker is missing, if there is no script output, or if the script contains the text `</script` (which would end the inline script early). A unit test fails the check if the page passes 5 MB (`tests/unit/scripts/build.test.js`).

**Licence notices.** esbuild runs with `legalComments: 'eof'` (its default), which moves every legal comment in the bundled code to the end of the page's script; that covers the `@vue/reactivity` and `@vue/shared` notices Alpine vendors and Lit's BSD-3-Clause notices. Zag (`@zag-js/*`, MIT), Floating UI (`@floating-ui/*`, MIT) and proxy-compare (MIT) carry no notice in their code, so the build adds their LICENSE files after those (`bundledLicenseNotices` and `NOTICE_PACKAGES` in `scripts/build/build.mjs`, as the script's `footer`); `tests/unit/scripts/build.notices.test.js` fails when a bundled package has no notice. Alpine itself ships no licence file and no copyright comment, so none is invented for it: the page's footer carries the project's own copyright line instead, and the README lists what is bundled.

The page loads nothing at run time except two kinds of font:

- **Web fonts**, which come from Google Fonts when online.
- **The Lodestone symbol font for the HQ mark**, hotlinked from the community mirror ewwwin/ffxiv-symbol-fonts, pinned to one commit and served by jsDelivr (`@font-face` in `src/styles/pieces.css`; never bundled, since no Square Enix licence names the font and the mirror has no licence file).

The HQ mark is plain "(HQ)" until `ui/hq-font.js` sees the font load and adds `html.hqfont`, which swaps in the glyph. Without a connection the page falls back to system fonts and still works.

Because the data is part of the script rather than fetched, the page works from a `file://` address, where browsers refuse to fetch local files. The size of the page and its parts is in [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page).

**First paint.** The script is the last thing in the file, and the browser paints the markup above it while it is still reading the script, before Alpine has run. Until then every `x-show` element shows, whatever its condition, and no `x-text` has its text. The page root (`<div class="wrap">`, which holds the whole body) carries `x-cloak`, hidden by `src/styles/base.css` until Alpine removes it once it has built the page, so the first frame shows the finished page with the open tab. `tests/unit/scripts/build.test.js` checks the root is cloaked and holds everything; the smoke test's `checkFirstPaint` records every frame from the first, on each tab and after a reload from a set page.

**Startup failure.** The first thing in `<head>`, before the `<style>`, is a small classic ES5 script (`src/startup-failure.js`, about 4 KB minified; `startupScript()` in `scripts/build/build.mjs` writes `STORE_KEY` and the dev flag's key (`UNLOAD_GUARD_OFF_KEY`) into it and minifies it, and the build stops if it holds a closing script tag). It makes its own message with DOM calls and inline styles that use only CSS system colours (`Canvas`, `CanvasText`, `GrayText`, `Highlight`), so it reads in the light and dark OS themes and still works when the stylesheet or the app's script is broken. It listens for `error` and `unhandledrejection`, and checks once, in a `setTimeout(0)` after `DOMContentLoaded` (the app's script has run to its end by then, and the errors Alpine rethrows were queued earlier): the start failed if an error came before the check, the start marker is missing (`src/main.js` sets `data-started` on `<html>` once `Alpine.start()` has returned), or the page root is missing or still has `x-cloak`. Every build also exposes a read-only `window.gsaDebug` (`app`, `sheets`, and `scope(selector)`, the data of the Alpine component on an element) so tests read the page's state without Alpine's private fields. Until the check has run, a style rule (`.wrap{display:none!important}`) keeps the page root unpainted, so a start that fails midway never shows its half-built page for a frame (`display:none`, not `visibility:hidden`: a descendant with `visibility:visible` of its own, such as the Gear browser's sort arrow, paints through a hidden ancestor). In its place a boot shell (`#boot` in `src/index.html`: the title, an inert tab bar with the tab the address names selected and the others dimmed, and a loading line named for that tab; the script reads the address (`#/gear`, `#/math...`, else the Sheets tab) into `data-boot-tab` on `<html>`) shows from the first paint, so a slow start is not a blank page. The check removes the rule and the shell on every path, which moves a healthy page's real first paint to one timer turn after `DOMContentLoaded`; a failed start hides the shell with the rest of the page. Then the listeners are removed; later errors are not startup failures. The message has the heading "The page failed to start." and hides the rest of the page, also when the root was built (an Alpine error), since a half-built page cannot be trusted. It shows the first error as text, a Reload button, and, when a key equal to `STORE_KEY` or starting with `STORE_KEY:` exists (the reload guard's dev flag is not counted, and the reset leaves it), a Reset saved data button that asks first, removes only those keys and reloads. When no saved data exists, the message says so and has no Reset button; when `localStorage` throws, it says the browser does not let the page read its saved data and has no Reset button. A `<noscript>` line at the top of `<body>` covers JavaScript off. The smoke test's `checks/startup/` covers each case. A saved time outside the range of a `Date` (beyond 8.64e15 ms) makes a sheet record unreadable (`isTime` in `src/ui/sheets/storage.js`), so a damaged date cannot throw while the Sheets tab formats it.

**Why one file:** the owner opens it locally and can keep or share it as a single file. No server, no install, no version mismatch between page and data.

## 6. Development loop

**The question:** how does a change go from an edit to a checked page?

The steps are: install once, work, check, look. Every command, with how long it takes, is in the [root README](../../README.md#develop); this section adds what each step does.

- **Install** (`npm install`, or `npm ci`; it installs esbuild, Biome, ESLint, TypeScript, Playwright, Lit, Zag and Alpine). Biome does lint and format; Playwright drives the browser for the smoke test (run `npx playwright install chromium` once). The project requires Node 22.18 or later (type stripping runs `.ts` files; `tsc --noEmit` is the type check, `tsconfig.json`).
- **Work** (`npm run dev`). The page is rebuilt (not minified) whenever a source file or the HTML template changes, and the output folder is served on a local address the command prints. Reload the browser to see a change.
- **Check** (`npm run check`: lint, typecheck, build, unit tests, component stories, browser smoke test). Lint is Biome (with a format check) and ESLint for the Lit elements. It must pass before a change is called done. The generator tests (Python) and the Python lint run in `npm run check:all`, needed when the data pipeline changes.
- **Look** (open the built page at the five viewports in [testing.md, section 3.1](testing.md#31-viewports-to-look-at-for-ui-changes), from 960 px up to 2560 x 1440). The page must never scroll sideways; wide tables scroll inside their own box.

Tests are described in [testing.md](testing.md). After a game patch, the data is refreshed with the steps in [data-pipeline.md, section 9](data-pipeline.md#9-updating-after-a-game-patch).

## 7. Pieces and sets in the core

**The question:** where do the rules live that turn chosen gear into what the page shows? In three core modules, so an Auto-fill's answer and a gear set chosen by hand go through the same code.

| Module | Holds | Used by |
| --- | --- | --- |
| `piece.js` | A piece under sync: its synced item level, its stats there, the most each stat can be, whether it keeps its melds (note 1) | the optimizer, `meld.js`, `set.js`, the views |
| `meld.js` | The meld rules (gates, high grades only in the big slots, caps) and what they are used for (note 2) | the optimizer, `set.js`, `sheets/fill-settings.js`, `views/stone-menu.js` |
| `set.js` | A gear set as plain frozen data (`makeSet`, `setFromPicks`) and what it adds up to (`evaluateSet`) | `recipe.js`, the set page's views |

1. `piece.js` holds the item level a piece is synced to (`itemSyncIlvl`), its stats there (`effStats`), the most each stat can be (`itemCaps`, `meldCaps`) and whether it keeps its melds (`keepsMelds`).
2. `meld.js` applies the same meld rules for four uses:
   - to find the best stones (`bestMeld`, `meldVersions`);
   - to apply a given list of stones (`applyStones`);
   - to list the grades a slot takes (`slotGrades`, for the set page's materia menu);
   - to give the shown overmeld odds (`overmeldChance`, `overmeldNumber`, `usesNqOvermeldRates`).

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

**The question:** how is a search asked for, and what is kept between searches (only the job's gear)? A **recipe** says what to look for: a set's Auto-fill settings (`fillRecipe` in `sheets/fill-settings.js`: goal and tiebreaks, the filters under Gear to search, materia, food, the Target GCD and its mode, rank by tier). `runRecipe(job, sync, level, recipe, session, choices, pins)` in `src/core/recipe.js` solves it and returns `{status, set, record, found}`:

- **status:** `ok`, or why there is no gear set (`excluded`, `noset`, `nogcd`, `infeasible`, `badpin`: a pin cannot be kept, listed in `found.badPins`).
- **set:** the gear set the result shows, as plain data ([section 7](#7-pieces-and-sets-in-the-core)): each row the player's pick where it still gives the same result, else the easiest piece that does; the meal the Food row shows.
- **record:** how the gear set was made: job, sync, level and a frozen copy of the recipe, so a gear set keeps the goal it was solved for whatever changes later.
- **found:** what the display needs beyond the gear set: the rows' menus of pieces with the same result, the meals with the best's result, the stats tier ranking holds, the Target GCD facts, the node limit note.

`choices` are picks on a last result (`{pieces: {row: gameId}, meal}`), not saved; the page passes none. `pins` are what the solve must keep, `{pieces: [{slot, gameId, stones}], meal}`: a set's pinned rows and meal. A pinned piece is worn with exactly its stones, counts in the totals, tiers and a Target GCD, and need not pass the recipe's filters; a pinned meal is the meal even with Food off; the search fills the other slots (`resolvePins`; [optimizer.md, section 2](optimizer.md#the-game-rules-in-the-model)). A subset of the pins is a partial fill. The solver's handler calls `runRecipe` through `solveView` (`solve.js`), which returns the plain set; the set page evaluates it (`evaluateSet`) and formats it.

**The solver session** (`makeSession` in `src/core/session.js`) holds the one thing a solve keeps for the next: each job's gear, every piece the job can wear as frozen pool items (5 to 10 ms to build). It keeps the gear of the last four jobs, least recently used dropped first. The page has one session, in the solver's worker ([section 9](#9-the-optimizers-worker)), shared by every set page. The meld caps are cached per pool item, so the same gear objects keep them warm.

Nothing else is kept. Every solve builds its candidate lists, the fastest GCD and the rows' menus again: a new Target GCD, a pick from a menu or a return to an earlier set each cost a full search (about 0.1 to 3 s in the measured cases).

## 9. The optimizer's worker

**The question:** how does a search of several seconds leave the page responsive? Under a Target GCD with tier ranking a search can hold a thread for seconds. A set page's Auto-fill and its Gear to search line run in a Web Worker; the page thread only sends the request and shows the reply.

| Part | Where | What it does |
| --- | --- | --- |
| Request | `solverRequest` in `src/ui/solver.js` | Plain data: the kind, the job's id, the sync settings, the level, the recipe, an optional `key` and `pins` (note below) |
| Handler | `makeSolverHandler` | Runs `solveView` or `gearToSearchView` with its own solver session; replies `{result, ms}`, or `{error}` |
| Worker | `src/ui/solver-worker.js` | Answers each message with the handler's reply, tagged with the request's id |
| Worker solver | `workerSolver` | Page side: starts the worker on the first request, posts requests, routes replies by id, replaces the worker on Cancel, falls back |
| Page-thread solver | `inProcessSolver` | The handler on the page thread: the unit tests, and the fallback |

Notes:

- **The request's fields.** The kind is `solve` or `gearToSearch`. The optional `key` is the caller (a set's id). `pins` are the slots an Auto-fill keeps; they are sent only when there are some.
- **One file, from `file://`.** The worker's code is a string in the page's script; `main.js` starts it from a Blob URL. Chromium and Firefox run a Blob-URL worker from a `file://` page (checked with Playwright: Chromium, and Firefox 155 and 157 with no page errors); Safari is not checked.
- **The data, held once.** The worker needs the item database and the other data files, but the page does not carry a second copy. Each data module of the page also exports its text (`jsonParseData`), and the page posts those strings to the worker as its first message; the worker parses them on its own thread. The worker's bundle is wrapped to run on that message, since its data modules read the texts while it loads. The page grows by the worker's code only, about 83 KB ([data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)).
- **Started when needed.** The worker starts on the solver's first request: the Gear to search line a set page asks for as it opens. The page's first paint does not wait for it.
- **One copy of the job's gear.** The solver session lives in the worker, so the page thread never builds the job's gear.
- **Newer requests.** One request per kind is in the worker at a time. A newer one waits and replaces any request already waiting from the same caller, whose caller gets the newer one's reply, so settings changed during a long search are not all solved in turn. A caller is named by the request's optional `key` (a gear set's id, say): requests with different keys never replace each other and each gets its own reply; requests without a key count as one caller. The set page drops a reply it no longer wants (`fillId`, `countId`). A newer request does not stop the one in the worker: only Cancel does.
- **One worker for both kinds.** A worker runs one request at a time, so the Gear to search line waits behind a running search. A filter changed during a long search updates the line when the search ends (measured: 1,248 ms after the change, in a 1.45 s Warrior search). Cancel ends the wait at once. A second worker would parse the data again (about 50 ms) and keep a second copy of the job's gear.
- **Cancel.** A set page's Cancel (`cancelFill`) returns the page to idle at once, with the set as it was and the line "Auto-fill cancelled.", and calls the solver's `cancel('solve', key)` with the set's id.
  - *The restart:* a worker cannot be interrupted mid-search, so when a search is in the worker, `workerSolver` terminates the worker and starts a fresh one at once. The new worker is handed the data texts again and parses them; its session builds the job's gear again.
  - *The callers:* the cancelled search's caller, and any search waiting behind it, get a cancelled error (`isCancelled`), which the component ignores.
  - *Gear to search:* requests not yet answered are posted to the new worker; with none, the last one is asked again, so the new worker builds the job's gear before the next search.
  - *When:* always when a search is in the worker. The restart costs about 0.2 to 0.5 s over a warm search, while letting the search finish can cost the rest of it, 1 to 3 s for a long Target GCD search.
  - *Measured* (Playwright): Warrior, level 100, Target GCD 2.30, food, two tiebreaks, cancelled at 0.3 s. The next quick search showed after 0.5 to 0.85 s instead of 1.25 to 1.6 s.
  - *Nothing to stop:* with no search in the worker (it already replied), or on the page-thread fallback, Cancel only drops the reply (`fillId`). A page-thread solve still waiting for its two frames is dropped before it starts.
- **Timeout.** A request still in the worker after 60 s (`SOLVER_TIMEOUT_MS`) is stopped the same way as a Cancel, but its callers get an error, "no answer after 60 s", so the page shows it as a failed search. The slowest search measured is 18 s (tier ranking with a Target GCD, under eight parallel sweeps; [perf-log.md, section 5.1](perf-log.md#51-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)). A Gear to search request takes 20 to 100 ms. So 60 s leaves a slow device three times the slowest and still ends a worker that will never answer.
- **Fallback.** If the worker cannot be made, fails to load or crashes, or a reply cannot be read on the page (a `messageerror` event), every request not yet answered is asked again on the page thread. A smoke group checks it with no `Worker` and with a worker that fails to load. The page thread's solver blocks the page, so the set page then waits two frames before asking, and "Solving…" is painted first.
- **Times.** The worker times each request itself. The `fill` performance measure is that time, the search's own, not the wait for the reply.

## Where this lives

| Concept | File |
| --- | --- |
| Generated data (never edit by hand) | `src/data/item-level.json`, `src/data/items.json`, `src/data/food.json`, `src/data/job-icons.js`, `src/data/gear-groups.json`, `src/data/max-speed.json`, `src/data/summary.json` |
| Data generators (`regen.py` runs them in order; the last, in Node, writes `max-speed.json`) | `scripts/data/gen_item_level.py`, `gen_items.py`, `gen_gear_groups.py`, `gen_food.py`, `gen_job_icons.py`, `gen_max_speed.mjs` |
| Tables and limits derived from the data | `src/core/tables.js` |
| Jobs, role profiles, slots, slot shares, raw stat order | `src/core/constants.js`, `src/core/item-format.json` |
| Job context | `src/core/job-context.js` (`makeJobContext`, its `mainKey`, `speedKey`, `specKey`, `activeSlotTypes`, `vitFactor` and `maxLevel`) |
| A character's base stat at a level | `src/core/base-stats.js` (`statBase`, `LEVEL_MAIN`) |
| Stat labels; level caps | `src/core/constants.js` (`STAT_LABEL`, `STAT_SHORT`; `JOB_LEVEL_CAPS`) |
| Saved position keys | `src/core/stat-keys.js` (`currentStatKey`, `remapStatKey`) |
| Raw row to stat keys, item filters, pool item ids | `src/core/items.js` (`dbStats`, `browseItems`, `gearFilter`, `filterGear`, `poolItemFromRow`) |
| Gear groups (which jobs share gear) and the pieces a job cannot wear, by job mask | `src/core/gear-groups.js` (`GEAR_GROUPS`, `copyTargets`, `piecesJobCannotWear`) |
| Piece identity: a database piece by its game id; the same piece from several sources | `src/core/items.js` (`itemById`, `poolItemById`; `poolKey`) |
| A piece under sync | `src/core/piece.js` (`itemSyncIlvl`, `effStats`, `itemCaps`, `meldCaps`, `keepsMelds`) |
| A gear set and what it adds up to; a given list of stones on a piece | `src/core/set.js` (`makeSet`, `setFromPicks`, `evaluateSet`); `src/core/meld.js` (`applyStones`) |
| Item stat rounding steps and the off-hand rule, written once | `src/core/formulas.js` (`statLine`, `offhandParts`) |
| Per-level game data (ParamGrow: base speed, level divisor, level sync item level) | `src/core/level-params.js` (`levelParams`, `clampLevel`) |
| Meal choice (totals with food, then food points, then the first) | `src/core/food.js` (`pickMeal`, `mealTotals`, `bestFood`); Target GCD and tier ranking share their defaults through `goalSettings` in `src/core/target-gcd.js` |
| Other core modules | `src/core/formulas.js`, `gear-groups.js`, `sync-target.js`, `speed.js`, `tiers.js`, `meld.js`, `piece.js`, `set.js`, `recipe.js`, `session.js`, `food.js`, `target-gcd.js`, `tier-rank.js`, `same-result.js`, `damage-defense.js`, `optimizer/` |
| Entry point: restore, make the store and register its two facades and the components, start the router, autosave | `src/main.js` |
| Addresses: the hash of each screen and the settings in its query (`query.js`: `readQuery`, `writeQuery`), the page title, the router that keeps the address and the two stores in step, the focus after Back | `src/ui/router/routes.js` (`parseRoute`, `formatRoute`, `titleOf`), `router.js` (`createRouter`, `windowPort`), `focus.js` (`focusScreenHeading`), `plain-click.js` (`plainClick`, `followInPage`), `scroll-storage.js` (`readScrollPositions`, `writeScrollPositions`), `unload-guard.js` (`installUnloadGuard`, `UNLOAD_GUARD_OFF_KEY`) |
| Saved state: defaults, job reset, restore and repair, storage key | `src/ui/state.js` (`defaultState`, `defaultBrowse`: the browser's defaults, `resetForJob`, `clampLevels`, `splitPanelSettings`, `restoreState`, `restoreBrowseFields` and `restorePieceFields` (the checks a saved setting and an address's setting share), `STORE_KEY`, `SEARCH_MAX_LENGTH`) |
| Saved sheets: the index and one record per sheet, read, write, order, delete, the full-storage and unavailable-storage results | `src/ui/sheets/storage.js` (`loadSheets`, `saveSheet`, `saveOrder`, `deleteSheet`, `parseSheet`, `storageAvailable`) |
| The sheets' actions: the sheets as plain data, the open screen, the actions, the edit lock while an Auto-fill runs | `src/ui/store/sheets-actions.ts` (`createSheetsActions`), `src/ui/store/sheets-facade.ts` (`createSheetsFacade`; the members are in the notes below the table), `src/ui/sheets/store-shared.js` (the refusal texts, `readSheets`) |
| Sheets and gear sets as plain data: new, copied, Copy sheet's cleared pieces, names, moving a row | `src/ui/sheets/ops.js` (`newSheet`, `newGearSet`, `copyGearSet`, `copySheet`, `piecesToClear`, `cleanName`, `cleanDescription`, `copyName`, `defaultSheetName`, `defaultSetName`, `moveItem`, `NAME_MAX_LENGTH`) |
| What a Sheets dialog's main button does: the fields to the store call of its kind, the refused form's error and the field it is about | `src/ui/sheets/dialogs.js` (`submitDialog`, `shownName`) |
| Lit elements and Zag layers | The elements of each screen and the Zag controller and bridge they share (the first note below) | `src/ui/elements/` (`gear-browser/`, `math-page/`, `sheets/`, `set-page/`, `app/`, `shared/`) |
| Shared store and actions | `src/ui/store/store.ts` (`Store`), `app-state.ts` (the state and the selectors: `panelOf`, `persisted`, `routeOf`), `app-actions.ts` (`setJob`, `showTab`, `resetAll`, `editPanel`, `editBrowse`, ...), `app-facade.ts` (`$store.app`), `page-store.ts` (`createPageStore`, `sealFacade`: freezes a facade), `autosave.ts`, `select.ts`, `watch.ts` |
| The store's settings as plain inputs: each tab's panel, sync settings, the cap Piece stats shows, the Target GCD range, the default Gear categories boxes, the example piece's materia slot totals | `src/ui/job-sync-panel.js` (`panelOf`, `PANEL_GROUP`, `syncSettings`, `shownSync`, `TARGET_GCD_RANGE`, `DEFAULT_EXCLUDE`, `meldSlotChoices`, `meldSlotsOf`) |
| The cap follows the level: the rule that lowers a cap, the flag in a cap field's label line, what the two fields show | `src/ui/level-cap.js` (`limitCapToLevel`, `capLoweredText`, `capFlag`, `capTextBad`, `CAP_TYPED_BAD_TEXT`), `src/ui/views/cap-field.js` (`capFieldView`, `levelFieldView`), `src/ui/elements/app/cap-field.ts`, `level-field.ts` and `cap-flag.ts` |
| The ranked stat menus (one rank per stat, swaps) | `src/ui/ranks.js` (`rankChoices`, `withRank`, `uniqueRanks`) |
| Text helpers the views share: counts, plurals, a deep copy | `src/ui/text.ts` (`fmtInt`, `plural`, `oneOrMany`, `clone`) |
| The view pattern, frozen views | `src/ui/view-cache.ts` (`viewCache`, `deepFreeze`) |
| Number-box behaviour and its Alpine binding, the flash of a lowered cap field | `src/ui/number-field.js` (`numberBox`, `numberField`, `storeNumberField`, `flashLowered`, `TYPING_DEBOUNCE_MS`) |
| The Expansion and "Gear categories" menus, where a floating menu opens (components only) | `src/ui/elements/gear-browser/filter-menu-model.ts` (`GEAR_FROM_SECTIONS`, `gearFromSummary`, `gearFromHint`, `excludeAfterToggle`) for the two menus |
| View builders (pure, unit-tested) | `src/ui/views/` (`piece.js`, `sync-explainer.js`, `math-bar.js`, `piece-stats.js`, `gear.js`, `tiers.js`, `meal-menu.js`; the set page's views (rows below) and the sheet views (notes below the table)) |
| Charts | `src/ui/sync-charts.js` (SVG for `unsafeSVG` in the Stat Allocation and GCD Scaling elements; every name passed in goes through `escapeXml`) |
| Gear browser rows a page, page numbers shown | `src/ui/views/gear.js` (`PAGE_SIZE`, `PAGE_SLOTS`) |
| A recipe and its solve; the pool it searches; the page's node limit | `src/core/recipe.js` (`runRecipe`, `recipePool`, `gearFromCounts`, `askedGcd`, `gcdRange`, `NODE_LIMIT`) |
| The solver session; the job's gear it keeps | `src/core/session.js` (`makeSession`, `SESSION_SIZE`); `src/core/items.js` (`jobGear`) |
| What the solver answers for an Auto-fill: the Gear to search line, the solve | `src/ui/solve.js` (`gearToSearchView`, `searchCount`, `solveView`, which takes the Auto-fill's pins and answers `badpin` with plain messages) |
| The Food menu's list: meals passing the filters, their lines, sort | `src/ui/views/meal-menu.js` (`mealMenu`, `mealList`, `mealsPassing`, `sortMeals`) |
| Which rows of a saved set hold a piece, row labels | `src/ui/sheets/saved-set.js` (`usedRows`, `holdsPiece`, `rowLabel`, `sameRow`) |
| Partial fill of a saved gear set: the pins, the "Auto-fill N slots" count, the result put back on the open rows, bad-pin messages | `src/ui/sheets/fill.js` (`fillPlan`, `applyFill`, `dropBadPins`, `badPinMessages`) |
| A set page's Auto-fill settings and recipe, the goal line | `src/ui/sheets/fill-settings.js` (`defaultFillSettings`, `fillSettingsOf`, `fillRecipe`, `goalText`) |
| A set page's edits by hand (a piece, a stone, the meal, a pin) | `src/ui/sheets/set-edits.js` (`placePiece`, `withStone`, `withoutStone`, `withMeal`, `withPin`) |
| A set page's piece picker, materia menu and meal menu; the grades a meld slot takes | `src/ui/views/piece-menu.js` (`piecePickerView`), `stone-menu.js` (`materiaMenuView`), `set-meal-menu.js` (`setMealMenuView`); `src/core/meld.js` (`slotGrades`) |
| The set page: its element, its session and the parts of it | `src/ui/elements/set-page/set-page.ts` (`GsaSetPage`) and `set-page-types.ts`, `session.js`, `menus.js`, `edits.js`, `fill-run.js`, `fill-settings-edit.js`, `leave-guard.js`; the view in `src/ui/views/set-page.js` |
| Sheet view builders: a saved sheet and its gear sets as plain view objects (see the notes below the table) | `src/ui/views/sheet-manager.js`, `sheet-sets.js`, `sheet-forms.js`, `set-rows.js`, `set-totals.js`, `set-draft.js`, `set-suggestion.js`, `sheet-text.js` |
| The page's solver: requests, the handler, the worker and page-thread solvers; the worker's entry; starting it | `src/ui/solver.js` (`solverRequest`, `makeSolverHandler`, `workerSolver`, `inProcessSolver`); `src/ui/solver-worker.js`; `src/main.js` (`startSolverWorker`) |
| Components | `src/ui/components/` (`page.js`, `sync-explainer.js`, `sheets.js`) |
| Template, partials and styles | `src/index.html`, `src/partials/`, `src/styles/` (see the notes below the table) |
| Build and dev server; the worker bundle | `scripts/build/build.mjs` (`solverWorker`, `jsonParseData`), `scripts/build/dev.mjs` |
| Node version, scripts, dependencies | `package.json` |
| Lint and format configuration | `biome.jsonc`, `pyproject.toml` |
| Diagrams | `docs/diagrams/architecture-layers.svg`, `docs/diagrams/architecture-ui-flow.svg`, `docs/diagrams/architecture-ui-modules.svg`, `docs/diagrams/architecture-job-switch.svg`, `docs/diagrams/architecture-timing.svg`, `docs/diagrams/architecture-restore.svg` |

Notes on five rows of the table:

- **The Lit elements** (`src/ui/elements/`, one folder per domain; every file in them is `.ts` except the set page's session parts). `src/main.js` imports the ones the templates use:
  - *Shared* (`shared/`): `zag-controller.ts` (`ZagController`, one Zag machine for an element), `overlay-bridge.ts` (`createOverlayBridge`, a Zag layer in the overlay manager), `dialog.ts` (`GsaDialog`, the modal dialog), `collapsible.ts` (`GsaCollapsible`), `select.ts` (`GsaSelect`, the drop-down choice) with `select-names.ts`, `key-focus.ts` (the Tab and focus-ring rules the Slot menu and the select share), `element-width.ts` (`ElementWidthController`, which follows the width of a chart's box), `number-box.ts` (`shownNumber`, a number box's value in a Lit template) and `button-icons.ts` (the Edit, Copy and Delete icons).
  - *Gear browser* (`gear-browser/`): `gear-browser.ts` (`GsaGearBrowser`, the screen) and `gear-browser-model.ts` (its list, page and sort rules, with no DOM), `slot-menu.ts` (`GsaSlotMenu`) with `slot-menu-names.ts` (its words and keys, written once), `expansion-menu.ts`, `gear-categories.ts` and `gear-sections.ts` (the filter menus), `filter-popover.ts` (their Zag popover and bridge) and `filter-menu-model.ts` (their data and texts).
  - *Math page* (`math-page/`): `math-bar.ts` (`GsaMathBar`, the math bar: the sub-tab links, the "?" help, the Job menu, the Slot menu, the Substats & materia chip, the Sync settings chip with its popover and the Gear item level control, with the GCD and Substat tiers controls inside) with `math-bar-names.ts` (its events `math-sub`, `piece-edit` and `sync-change` and the shapes it takes), `bar-popover.ts` (`GsaBarPopover`) with `bar-popover-names.ts`, `piece-stats.ts` (`GsaPieceStats`, the Stat Allocation sub-tab: two panels, the chart through `unsafeSVG`, the step table), `gcd-view.ts` (`GsaGcdView`, the GCD Scaling sub-tab: facts, chart, step table) and `gcd-controls.ts` (`GsaGcdControls`, its Level, Haste and speed controls in the math bar) with `gcd-names.ts` (their `gcd-edit` event and settings shape), `tiers-view.ts` (`GsaTiersView`, the Substat tiers sub-tab: the cards and their "?" note) and `tiers-controls.ts` (`GsaTiersControls`, its Level box in the math bar) with `tiers-names.ts` (their `tiers-level` event), `stat-note.ts` (`GsaStatNote`) with `stat-note-names.ts`, and `tier-rows.ts` (`tierRows`, the directive that draws a card's window of rows in its scroll area).
  - *Sheets* (`sheets/`): `sheet-manager.ts` (`GsaSheetManager`) and `sheet-page.ts` (`GsaSheetPage`) with `sheet-action.ts` (their event), `switch-menu.ts` (`GsaSwitchMenu`, the sheet and set switchers), `row-reorder.ts`, `open-row.ts` and `drag-handle.ts` (the row's drag handle, written once for both elements).
  - *Set page* (`set-page/`): `set-page.ts` (`GsaSetPage`, the page's template) with `set-page-types.ts`, its session `session.js` with `menus.js`, `edits.js`, `fill-run.js`, `fill-settings-edit.js` and `leave-guard.js`, `food-menu.ts` (`GsaFoodMenu`) with `food-menu-model.ts`, `materia-menu.ts` (`GsaMateriaMenu`), `settings-popover.ts` (`GsaSettingsPopover`), `rank-note.ts` (`GsaRankNote`) and `piece-picker.ts` (`GsaPiecePicker`) with `piece-picker-names.ts` (its words, events and the click rule).
  - *App* (`app/`): `job-strip.ts` (`GsaJobStrip`, the Gear browser's Job and sync strip) with `job-strip-names.ts` (its Reset question and events), `job-menu.ts` (`GsaJobMenu`, the Job menu of the strip and of the math bar) with `job-menu-names.ts`, `cap-field.ts` (`GsaCapField`, the item level field of the strip, the Sync settings popover, a sheet's page and the dialogs' forms) with `cap-follow.ts` (what it does when its inputs change), `level-field.ts` (`GsaLevelField`, the level field of the same places), `field-names.ts` (their events and the lowered cap's shape) and `cap-flag.ts` (the flag in their label line), `notes.ts` (`GsaNotes`, the toast and the save error) with `note-timer.ts` (the note's clock), and `gsa-counter.ts` (the placeholder counter of the stories).
- **The sheets' facade** (`createSheetsFacade` in `src/ui/store/sheets-facade.ts`, with the actions of `sheets-actions.ts`) has these members:
  - state: `list`, `sheet`, `currentSheet`, `currentSet`, `busy`, `note`, `saveMessage`, `rev`;
  - screens: `openManager`, `openSheet`, `openSet`, `closeSet`;
  - sheet actions: `createSheet`, `editSheet`, `copySheet`, `deleteSheet`, `moveSheet`, `stepSheet`, `setLevel`, `setSyncOn`, `setCap`;
  - set actions: `newSet`, `copySet`, `deleteSet`, `editSet`, `updateSet`, `moveSet`, `stepSet`;
  - the set page's functions: `setLeaveGuard`, `askLeave`, `hasUnsettled` (the `unsettled` selector), `setBusy`, `setNote`;
  - the gear set pages: `page(setId)` (the page's frozen state) and `pages` (the actions of `set-page-actions.ts`).
- **Sheet view builders** (`views/sheet-manager.js`, `sheet-sets.js`, `sheet-forms.js`, `set-rows.js`, `set-totals.js`, `set-draft.js`, `set-suggestion.js`, `sheet-text.js`) build:
  - the manager list, a sheet's page and set list;
  - the dialogs (New sheet, Copy sheet with its pieces to clear, Edit sheet, Edit gear set, Delete);
  - a set's rows with materia chips, cap marks and Take boxes;
  - the Total, Tier and Defense rows and header figures with delta lines;
  - a manual draft's changes, an Auto-fill suggestion, and the Auto-fill answers that are no suggestion (bad pins, no set).
- **Template.** `src/index.html` has the markers `<!-- STYLES -->`, `<!-- SCRIPT -->`, `<!-- BUILD_BADGE -->`, `<!-- BUILD_INFO -->`, and `<!-- INCLUDE name.html key=value -->` for a partial.
- **Partials and styles.** `src/partials/` holds the components that are big or reused: `math-page.html`, `gear-page.html` (the Gear browser element's wrapper), `set-page.html` (each the wrapper of its screen's element, included once) and `dialog-error.html` (the error line of the dialogs, filled in with `id=` and `place=`).
  - *Nesting:* a partial may include partials, three levels deep at most, and a partial that includes itself stops the build. A partial's leading comment is dropped from the page; comments below it stay.
  - *Layout:* long opening tags put one attribute per line (the `<link>` tags in the head stay on one line, a test matches them as text).
  - *Scopes:* scopes, refs and ids work across a partial boundary because the build pastes them in before Alpine sees the page.
  - *Where markup goes:* new markup of a component goes in that component's partial; `index.html` keeps the frame, the Job and sync panel, the Sheets shell with its dialogs and the footer. Filled in by `expandIncludes` in the build.
  - *Styles:* `src/styles/` holds one file per area, each a run of whole sections, in cascade order: `tokens` (the `:root` colors, light and both dark lists), `base`, `controls`, `layout`, `pieces` (shared pieces, tables, popovers), `menus` (dropdown menus), `fill-settings` (a set page's Fill settings dialog), `gear-browser`, the math tab's `math-bar`, `math-piece-stats`, `math-gcd`, `math-tiers` and `math-controls` (the controls row of Stat Allocation), `footer`, `sheets`, `set-page`, `fallbacks` (the last-layer rules). `src/styles/entry.css` imports them in that order; esbuild bundles the imports (the `styles:bundle` plugin), and the tests that read the stylesheet as text get the same text from `readStyles()` in `scripts/build/styles.mjs`, which follows the entry's `@import` lines. Every rule is in a cascade layer, named in the first line of `entry.css`: `tokens`, `base`, `controls` (the bare inputs, selects and buttons), `components` (one sublayer per shared file: `components.layout`, `.pieces`, `.menus` (its two files)), `views` (one sublayer per screen file: `views.gear-browser`, `.math` (its five files), `.footer`, `.sheets`, `.set-page`) and `fallbacks`; a later layer beats an earlier one whatever the specificity, so a shared file never beats a screen's file, and `tests/unit/styles/layers.test.js` fails on a rule outside a layer. A component that relies on a control's state (`button:hover`, `button:disabled`) says so in its own rule (`.build-button:hover`, `.meal-pill:hover:not(:disabled)`, `.pager button:disabled:hover`), because a generic rule in the `controls` layer no longer outranks a later class rule by specificity. Inside a file, source order and specificity decide as before; moving a rule between files, or a file in the list, changes which rule wins a tie only inside a layer.
