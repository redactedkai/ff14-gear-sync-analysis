# Sheets

The Sheets tab keeps the player's gear sets. A **sheet** is one piece of content (a job, a level and an item level sync, such as "Bahamut T13 Healer": Sage, level 100, item level 123) and holds several **gear sets** for it. This page describes how sheets are saved and the rules the code follows. The screens are in `ui.md`; the search an Auto-fill runs is in `optimizer.md`.

```
Tab "Sheets"
  Sheet manager      every sheet                     New sheet, Copy, Delete, open one
    Sheet page       one sheet: its gear sets        level and sync, New set
      Set page       one gear set: the gear table    pieces, stones, meal, pins, Auto-fill
Tab "Gear browser"         its own Job and sync panel
Tab "How the math works"   its own Job and sync panel
```

The breadcrumb reads `Sheets / <sheet> / <set>`. The page opens on the Sheets tab, at the sheet manager, unless the address names another screen ([ui.md, section 1](ui.md#1-the-tabs), Addresses); which sheet or set is open is never saved.

## Saved data

The sheets are in `localStorage`, beside the page's settings object (`ilvl-stat-lab-v4`, `src/ui/store-key.js`). Two more keys are conveniences, not saved data: the reload guard's dev flag and the tab's scroll positions (`sessionStorage`), described in [architecture.md](architecture.md) under "Saved sheets". The sheets' keys:

| Key | Holds |
|---|---|
| `ilvl-stat-lab-v4:sheets` | the index: `{ v, order }`, the sheet ids in the player's order |
| `ilvl-stat-lab-v4:sheet:<id>` | one whole sheet, its gear sets inside |

One record per sheet: two browser tabs never overwrite each other's sheets, and one damaged record loses one sheet.

**Sheet**

| Field | Meaning |
|---|---|
| `v` | the record's version, 1 |
| `id` | made once, never reused, not shown |
| `name` | required, need not be unique |
| `description` | optional, several lines |
| `job` | one of the combat jobs; fixed once the sheet exists (Copy sheet makes one for another job) |
| `level` | the synced level, 1 to the job's level cap |
| `sync` | item level sync: `{ on, cap }` (note 1) |
| `clan` | a clan's name ("Midlander", from `CLANS` in `src/core/tables.ts`) or null for none (note 2) |
| `partyRoles` | the unique roles in the party, a whole number 0 to 5: 1% each of every attribute; the page shows it on the main stat and Vitality (note 2) |
| `sets` | the gear sets, in the player's order |
| `gameData` | `{ commit, date }` of the game data the sheet was made with; a hint, it changes no number. The manager's Patch column shows the patch of that date (`patchOnDay` in `src/core/patches.ts`), worked out when the list is drawn, so a sheet saved before the table existed gets one too |
| `createdAt`, `updatedAt` | ms since 1970 (UTC); the manager shows them as dates in the browser's time zone |

1. `sync`: the cap is a number even while sync is off, 1 to the highest real item level, and no higher than the level allows while sync is on (below).
2. `clan` and `partyRoles`: a missing field means none, so a record from before them is read as written and loads unchanged. A new sheet saves `null` and `0`. A `clan` that is neither null nor text, or a `partyRoles` that is not a whole number 0 to 5, is a damaged field and the record is listed as unreadable; a clan name this build does not know is not damage and reads as no clan (`withKnownClan`). The two values change the totals of every gear set of the sheet and nothing else ([A sheet's clan and party bonus](#a-sheets-clan-and-party-bonus)).

**Gear set**

| Field | Meaning |
|---|---|
| `id`, `name`, `description` | as for a sheet; the description holds the set's notes |
| `pieces` | always 12 rows, in `SET_ROW_SLOTS` order (`src/ui/sheets/storage.js`: weapon, off-hand, head to wrist, ring twice), for every job |
| `meal` | an `allMeals` key (HQ), or null |
| `bestMeals` | the meals tagged "best for goal", or null (note 1) |
| `pinned` | `{ pieces: row numbers, meal: boolean }`: what Auto-fill keeps |
| `fillSettings` | the set's own Auto-fill settings, or null until Auto-fill runs or its settings are edited |
| `createdAt`, `updatedAt` | ms |

1. `bestMeals`: the keys of the meals tied for the best result of the Auto-fill that was last applied whole, in `allMeals` order, or null (see below).

A **piece row** is `{ slot, gameId, stones }`; an empty row is `{ slot }`. The game id is the identity: no name is saved. `stones` has one entry per meld slot, `{ stat, grade }` or null; a missing list counts as an empty one (`src/ui/sheets/saved-set.js` `sameRow`). A row the job does not use (the off-hand of a job without a shield) keeps what it holds, stored but not counted; White Mage and Black Mage use the Off-hand row at every level, so a shield stays when the sheet's level changes.

**Auto-fill settings** are `goal` (target stat, two tiebreaks, Target GCD and its mode, rank by tier, melds, food) and `searchCriteria` (expansions, "Gear categories" boxes, the market board switch, item level and equip level limits). `sheets/fill-settings.js` `fillRecipe` turns them into the recipe `core/recipe.js` solves.

**`bestMeals`** is a hint the page shows ("best for goal" on the Food row and the Food menu, [ui.md](ui.md#the-food-rows-menu)).

- Saved: Apply on an Auto-fill result saves it (`views/set-suggestion.js` `appliedFields`: `found.food.tagged` of `core/recipe.js` `runRecipe`, null with Food off) only when nothing is declined. A declined Take box means the set is not as Auto-fill made it.
- Kept: it stays whichever meal the set holds (`views/meal-menu.js` `mealBestKeys`). Pin changes keep it. Copy set keeps it, and Copy sheet keeps it only for the same job, level and sync. An Apply on a manual draft of the meal or the pins alone keeps it.
- Dropped (set to null): by Apply on a manual draft that changes a piece or a stone, by any change of the set's Auto-fill settings, and by a change of the sheet's level or sync.
- An Auto-fill with nothing to change saves it as soon as the Auto-fill ends. Apply is off, so nothing else is saved (`elements/set-page/fill-run.ts` `endFill`).
- Reading: it is not checked when read. A damaged value is read as none and dropped (`sheets/ops.js` `repairSheet`); a record from before the field has none.

Never saved: totals, tiers, defense and the GCD (always `evaluateSet` with the sheet's job, level and sync), an Auto-fill suggestion, a manual draft, open menus, and the solver's session.

## Reading and writing

`src/ui/sheets/storage.js` reads and writes the records; `src/ui/store/sheets-actions.ts` holds the actions over them and `src/ui/store/sheets-facade.ts` is the sheets facade, which hands out the sheets as plain data and has a `rev` that counts the changes. `src/ui/sheets/dialogs.js` is what the main button of the open dialog does, as plain code. `submitDialog` sends the dialog's fields to the store call of its kind (new, copy, edit sheet, edit set, delete). A refused form gets its error text and the field the text is about (`FORM_FIELD` in `ops.js`; none for a reason about the sheet), and is left as it is: a blank name stays blank (`shownName` is the name the box shows). Where the reason shows is in [ui.md, Dialogs](ui.md).

- Every record is checked field by field when it is read (`setProblem`, `rowProblem`). A record this build cannot read (not JSON, a newer `v`, an unknown job, a damaged row, pin, meal, time or Auto-fill settings) is skipped and listed in the sheet manager under "Could not be read". The list gives the cause and a Delete button that asks first. It is never deleted or rewritten on its own.
- A record names its stats by the game's own keys (`mind`, `sps`, `ten`, ...): the Auto-fill settings' `target`, `tb` and `tb2` and each stone's `stat`. A record written before that named them by position (`main`, `spd`, `spec`). The reader turns such a key into the sheet's job's key at that position (`withCurrentStatKeys`, `src/core/stat-keys.ts` `currentStatKey`), so one record may hold either kind, and `v` stays 1. The record is rewritten with the game's keys at the sheet's next save.
- A sheet record not in the index is listed after the indexed ones.
- A write that fails (a full storage) keeps the change on the page, marks it unsaved and says so; the order of the sheets is marked unsaved the same way.
- A tab reads fresh records each time it opens the manager or a sheet. Two browser tabs: the last write of a sheet wins; there is no live sync.

## A sheet's level and sync

Level and item level sync are edited on the sheet's page only, and change at once without a question: nothing is lost. A piece above the new level is synced down by the usual rules (`docs/mechanics/math.md` section 5); a synced piece's stones stay stored and count again if the cap or level goes back up. The set page shows the sheet's job, level and sync as a read-only line.

A sheet's cap follows its level by the Job and sync panel's rule ([ui.md, section 5](ui.md#5-the-level-and-cap-fields); `limitCapToLevel`, shared through `sheetSettings` in `src/ui/sheets/ops.js`). While item level sync is on, a cap above what the level allows is lowered to it and never raised. The panel's flag appears in the field's label line ("Max 405", with the sentence "Lowered to 405, max for level 70." as its tooltip).
It applies in three places:

- On the sheet page, when the level or cap is entered or its sync switched on.
- In the New sheet and Copy sheet forms, as their job, level, cap or sync change (and again on Create and Copy).
- To a saved sheet as it is read: a level above the job's level cap is held to it and the cap lowered, with no note. The repair is written with the sheet's next edit.

The Gear browser and How the math works each keep their own Job and sync panel and never follow a sheet.

## A sheet's clan and party bonus

The settings row of the sheet page has two more boxes, "Race / Clan" and "Party bonus", at its right end. They are saved with the sheet and change the totals of all its gear sets (the main stat and Vitality: `core/clan-bonus.js`; the totals are `views/set-totals.js`). They are display only: Auto-fill and the optimizer never read them, so a change leaves each set's `bestMeals` as it is (a change of level or sync drops them).

- `store.setClan(name)` and `store.setPartyRoles(value)` (both through `editBonus`) save the open sheet like any setting: refused while an Auto-fill runs (`LOCKED_TEXT`), nothing written when the value is the one held, a failed save keeps the edit in memory. A clan that is not a clan's name is no clan; party roles are held to a whole number 0 to 5.
- Copy sheet copies both, whatever job the copy is for: they belong to the player, not the job.
- The entries of the two lists are built once by `src/ui/sheets/bonus-options.js`; the boxes are `<gsa-select>`s in `<gsa-sheet-page>`, which send a `sheet-action` event (`clan`, `party`) and never change their own value, so a change the store refuses leaves the saved value shown.

## Names

Names may repeat (the id is the identity). A name is trimmed, and an empty one is refused: the saved name is unchanged and the dialog keeps the box as typed, with the reason. A new sheet is named from its job, level and sync ("White Mage Lv 50 ilvl 130") until a name is typed; a new set takes the smallest unused "Set N". A copy is named `<name> (1)`, then `(2)`, the first number not used among its siblings; copying "X (1)" gives "X (2)".

## Copy sheet

Copy sheet is the only way to change a sheet's job. The form offers a new name, job, level and sync. A job is offered only from the same gear group (`src/core/gear-groups.ts`, generated from the item data: jobs that share most of their armor). Blue Mage and Beastmaster, with their own level caps, copy to no other job.

The clan and the party bonus are copied as they are. The goal and the stones move to the new job by position (`remapStatKey`: the main stat to the main stat, speed to speed, the special substat to the special substat). A stat the new job lacks stays in the copy, and the set's Auto-fill settings put it back to their default.

Pieces the new job cannot wear are emptied in the copy and their pins dropped. The form lists them by set and slot first and waits for its box to be ticked.

## Pins and Auto-fill

A pinned row or meal is one Auto-fill keeps. A piece or stone chosen by hand is pinned when the change is applied. Auto-fill searches the set's unpinned rows with the set's Auto-fill settings (`sheets/fill.js` `fillPlan`): the pinned pieces are worn with exactly their stones and count in the totals, the tiers and a Target GCD. A pin the search cannot keep (a missing item, a piece in the wrong slot or one the job cannot wear, pieces that cannot be worn together, a meal the job cannot eat) stops the Auto-fill with a plain message. An unusable piece or meal is unpinned (the row is unpinned and the meal pin cleared, saved when the Auto-fill ends), and one line names the rows with no reason (the meal as "Food"); a relic's row is unpinned with its reason; pieces that cannot be worn together get their own line and drop nothing.

## Drafts and suggestions

Nothing proposed is saved until Apply.

- A **manual draft**: a piece, stone or meal chosen by hand. The set page shows Now and After and counts the changes; Apply saves them, Discard drops them. Auto-fill is off during a draft. A piece that covers other slots (a 2H weapon the Off-hand, a cloak the Head) picked over held pieces in those rows also empties them in the draft, so Discard brings both back; a piece for a covered row is refused and its control is disabled. A saved set that holds both is left as saved, with no note; an Auto-fill Apply never leaves both (the search takes a 1H weapon beside a pinned shield and leaves the Off-hand empty beside a 2H weapon; a pinned 2H weapon with a pinned shield is a pin conflict; when a suggestion is taken in part, a covered Off-hand's Take box follows the weapon's and is dimmed and disabled, `views/set-suggestion.js` `takeStateOf`).
- A **Auto-fill suggestion**: the set as Auto-fill would leave it. Each changed row and the meal have a Take box; Apply saves what is taken, Discard drops it all.

The draft's count and the suggestion's count go by the same row comparison (`sameRow`). Leaving the set page with a draft, a running Auto-fill or a waiting result asks first (Keep editing or Discard and leave; for a result, Keep reviewing). A tab link that leaves the Sheets tab asks the same question (`AppRootModel.goTab`, `src/ui/elements/app/app-root-model.ts`).

## The edit lock

While an Auto-fill runs, every edit is off: pieces, stones, the meal, pins, Apply, adding, copying, deleting or reordering sets and sheets, and the sheet's level and sync. Cancel stays on. A result applies only to the set and recipe it was started with, so no stale result lands.

## Where an action lands

Delete and Copy keep the player one level up. Deleting the set or sheet one is inside goes to the screen above it; deleting a row from a list stays on the list. Deleting a set or a sheet always asks first, naming it (and a sheet's number of sets), with the focus on Cancel so a stray Enter does not delete; there is no undo. Copying a set puts the copy next to the original; copying a sheet returns to the manager with the copy on top. New sheet opens the new sheet; New set opens the new set's page. New sheets go to the top of the manager.

## Missing items

A game id the item database no longer has shows as "missing item <id>" on its row. It is kept as saved, counts nothing and can be replaced like any piece; Auto-fill reports it as a pin it cannot keep.
