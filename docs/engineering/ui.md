# The page: tabs and controls

What the page shows and how its controls behave: the tabs, a set page's Fill and its settings, the Gear browser's layout, the How the math works sub-tabs, the level and cap fields, and the Sheets tab. Each control is described by its current rule. How the page is built is in [architecture.md](architecture.md); what the search does with the settings is in [optimizer.md](optimizer.md).

Related pages: [architecture.md](architecture.md) (the store, views and when each area recomputes), [optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters) (the pool the page hands to the search), [tier-ranking.md](tier-ranking.md), [math.md](../mechanics/math.md), [glossary.md](../glossary.md), [roadmap.md](../roadmap.md).

## 1. The tabs

Pick a job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one (how to start is in the [root README](../../README.md#use-it); the level and cap fields are in section 5). The page has two working tabs and one reference tab:

1. **Sheets** (opens first): saved sheets, each for one job, level and item level sync, holding gear sets. It has no Job and sync panel (each sheet holds its own) and needs no job chosen. A set page's **Fill** picks one item per unpinned slot (two rings) from every piece the job can wear to maximize one stat, with two optional tiebreakers and an optional Target GCD; a Materia switch (on by default) gives each piece its best melds, and under **Gear to search** the **Gear from** boxes leave out gear by how it is obtained (quests, crafting, Savage, PvP, ...; nine of them are off by default). Sections 2 and 6.
2. **Gear browser**: one table of real gear for the selected job, with filters and its synced stats, for looking gear up. A name search sits on its title line ("/" jumps to it). Slot pills show how many pieces each slot has, a Reset button appears at their end while a filter is set, and a click on a column heading sorts by it (again to flip).

   The table shows 100 matches a page, with page numbers above it. A piece that sync lowers shows its synced numbers in bold, with its own numbers in small type under them. It has its own Gear from boxes. HQ-capable crafted gear carries the HQ mark (the HQ mark, section 3), and rings that can be worn on both hands ×2. Section 3.
3. **How the math works** (reference), with three sub-tabs. Section 4.

## 2. Fill: the search on a set page

A set page's **Fill** fills the set's unpinned rows from every piece the job can wear, with the set's own **Fill settings** (the gear icon on the set bar; section 6). The pool it searches and the Gear to search filters are in [optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters).

In the Fill settings the **goal** is the three ranked stats (Maximize and the two tiebreaks), and the **target** is the first of them, the stat to maximize. A stat holds one rank, so picking one another rank holds swaps them, and a line under the switches says which rank changed ("Tiebreak 1 changed to Mind (a stat holds one rank)."). A Fill's answer is one **gear set**: a piece for every unpinned slot, with melds, and a meal while the meal is not pinned and Food is on.

### Target GCD

The control for the Target GCD layer of [optimizer.md, section 2](optimizer.md#target-gcd-from-a-gcd-to-a-speed-range).

- **Place.** Beside the goal in the Fill settings: the box (empty means any GCD) and "exactly" / "or faster" ("exactly" by default, as in xivgear).
- **Label.** It gives the range of GCDs the gear reaches in parentheses ("Target GCD (2.50 to 2.10)"). The range follows the settings as they change: it is one search for the most speed (20 to 100 ms), run in the solver's worker with the piece count.
- **Box.** It takes 0.50 to 2.50; a higher value moves to 2.50 when the box is left (2.50 is the slowest base GCD).
- **Haste jobs.** For Monk, Ninja, Samurai and Viper the label also names the haste ("Target GCD (2.12 to 1.80 with Fuka 13%)") and the box takes the hasted GCD.
- **Messages.** When no gear set fits, the Fill says why in a line under the header ("Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)", "The GCD can't go below 1.50", "No set at exactly 2.10").
- **Off.** The box is disabled while the target is speed (the label then reads "Target GCD (off: the target is speed)").

### Running a Fill

The search runs only when the player presses Fill, in the set's own lane of the solver's worker ([architecture.md, section 9](architecture.md#9-the-optimizers-worker)), so the page stays free.

- **While it runs.** Fill becomes "Solving…" with a **Cancel** button, and every edit on the tab is off. Cancel stops the search in the worker and leaves the set as it was.
- **Its answer** waits as a suggestion with Take boxes (section 6). A Fill that finds nothing, or a pin no set can keep, says why in a line under the header; a pin it cannot keep is dropped from the set.
- **If it fails.** A search that fails (not a cancel) says so in the same line, with its reason; the set stays as it was.

### Spare points to tiebreaks (rank by tier)

Roadmap A7. A switch in the Fill settings, beside Materia and Food.

- **Default.** **On**. It is dimmed and disabled until Tiebreak 1 is set: with no tiebreak there is nothing to send spare points to.
- **Label and note.** The ? note reads "Substats only improve at tiers, so points short of the next tier do nothing in game. This sends those spare points to your tiebreaks instead." "Tier" is the community's word (AkhMorning, The Balance, xivgear); "wasted" is avoided, since melding guides use it for materia past an item's cap.
- **What it does.** On, the search is tier ranking ([tier-ranking.md](tier-ranking.md)): meal and gear are chosen together, with or without a Target GCD, since every tier counts food.

### Character panel totals

A set's Total row shows each substat as the in-game character panel does: the level's base plus gear plus food; [math.md, section 6](../mechanics/math.md#totals-as-on-the-character-panel). Main stat and Vitality also start from the job's base (the level's base main stat times the job's modifier). They leave out the clan's bonus, which the page does not ask for, so they can be up to 3 points off the panel's (**owner's decision**; a note under the table says so). The party bonus is not counted.

### Which piece a Fill suggests

Roadmap A9. Under sync many pieces reach the same caps: for Sage at level 50, cap 123, with crafted and tomestone gear, every slot has 11 to 20 others. A Fill suggests, for each row, the piece with the same result that is easiest to get: the lowest equip level, then the lowest item level, the search's own pick on a tie (`core/same-result.js`).

- **The same result:** the same main stat, and every substat at the same tier, counted with the set's meal. The tiers are tier ranking's (`rankTierOf`, [tier-ranking.md](tier-ranking.md)), so speed holds its GCD (with haste) but its DoT/HoT tick scaling may drop a step (**owner's decision**, as for tier ranking), and Tenacity holds its mitigation step (200) but its damage bonus may drop a step (**owner's decision**). The goal stat's raw points stay as well.
- **Rows share their spare points.** Two swaps can each keep a tier alone and lose it together, so every check is made against the pieces the other rows show: rows are filled in panel order. A Unique piece is never in two rows (rings), and a piece must leave the same slots empty as the search's pick (a cloak never replaces a plain body).
- **The meal** a Fill suggests is the highest item level meal with the best meal's result (`sameMeals`).

### The Food row's menu

The Food row's meal on a set page is a menu (`components/meal-menu.js`, `views/meal-menu.js`), with "No food" first while the set has a meal.

- **The menu** lists every meal the job can use (`allMeals`; 182 for Astrologian), by expansion, newest first, one line each: its item level first ("i580", as players write it), its name, and what it adds on the set's gear in the meal's own order, its main stat first and Vitality last ("SpS +44 DHT +41 VIT +54"); its stat pair ("Spell Speed + Direct Hit") is the row's hover text. The set's meal is lit.
- **Filters.** A search box (meal names) and stat pills (CRT, DET, DHT, SpS, PIE; a meal must have each pill picked) narrow the list.
  - *Start:* the pills start empty, then stay as the player leaves them unless they would leave the list empty for the menu opened; then they start over.
  - *Grey pills:* a pill greys out only for a real reason: a third one (a meal has at most two stats), or one that would leave the list empty under the other filters.
  - *Empty list:* so only a search can empty the list, which then says so: "No meal matches "xyz". Clear search" (`mealsPassing`, `mealPillOff`, `mealEmptyReason`; a unit test walks every state the menu can reach).
- **Picked stats as chips.** A stat on a picked pill is drawn as a soft accent chip in every meal's line. The line is view data (`adds`, `mealLine`), not a string.
- **Sort.** While a pill is on, a row under the search box reads "Sort: ILVL / CRT" ("ILVL / CRT / DET" with two pills, in the pills' order).
  - ILVL is the expansion grouping, highest item level first.
  - A stat sorts the list by the points the meal adds on the set's gear, highest first, then by the other picked stat, ties newest first, as one list.
  - Turning off the sorted stat's pill goes back to ILVL (`sortMeals`, `mealList`).
- **Best for goal.** It applies to a set Fill made and nobody changed since (the saved `bestMeals`, [sheets.md](sheets.md#saved-data); a waiting result, or a draft that changes a piece or a stone, has none; a draft of the meal alone keeps it).
  - *Star:* the Food row shows a gold star beside the meal (a hidden "best for goal" text for a screen reader), and the menu's tool row has a "Best for goal" switch with the same star before its label.
  - *Switch:* it is on the first time the menu opens, then stays as the player left it (while the page stays open). On, the list is the tagged meals and the pills are cleared (turning the switch on clears them).
  - *Your pick:* with the switch on or off, the meal the set holds leads the list alone under "Your pick" (when it passes the search and the pills), even if it is not tagged.
  - *Off:* every meal is listed and the tagged ones wear the star after their name (`mealBestKeys`, `mealBestNote`; `mealsPassing`'s `bestOnly`).
  - *The star's drawing:* it is the `best` class from `mealList`'s `rowClass`, a CSS mask on the name's `::after` with the words as its alt text, so a row has no extra element.
  - *Hand pick:* a meal picked by hand wears no pill, but the switch and the tagged meals stay.
- **A meal picked** is a change by hand: it makes a draft and pins the meal (section 6).

## 3. The Gear browser tab

The database matches of the tab's own filters, with synced stats; when it recomputes is in [architecture.md, section 3](architecture.md#heavy-work-debounced-only-when-visible-or-on-request).

**Layout.** The name search is on the title line (every word must be in the name, the words found are marked). Under it are slot pills with each slot's count under the other filters, and one row of filters (item level as one "min – max" field, as under Gear to search). A Reset button (funnel and ×) sits at the end of the pills' line while any filter is off its default (`browseFiltered`; its place is kept while hidden, so the pills do not move). Sorting is from the column headings (`browse.sort` and `browse.dir`, saved).

**Rows and cells.**

- A row that sync lowers shows what the player gets on top, bold: the synced stats, the lowered ones with the cap bar; a muted line under each holds the piece's own value, and a grey bar marks the row's left edge (`browseCell`).
- The key above each table reads "maxed on this piece" beside a barred sample.
- The item level column shows the piece's own item level, in the browser and on a set page alike (the synced one there would confuse).

**Pages.**

- The table shows 100 matches a page (`PAGE_SIZE`). The title line gives the number of matches ("2,156 matches").
- The page numbers sit at the left of the key's line above the table, and the key at its right. The line always shows, even with one page and no key, so the table does not move as they come and go.
- With more than 7 pages, the line keeps 7 number places between the ‹ and › arrows: the first page, the last, the current one with one page each side, and "…" for the pages skipped (‹ 1 … 8 9 10 … 22 ›); near an end the numbers run on from that end (‹ 1 2 3 4 5 … 22 ›). With one page there are no numbers (`pageList`).
- Each number and arrow is a button; the current page has `aria-current="page"`, and the arrows are disabled at the ends. A page change scrolls the table's box to its first row.
- Any change to the list (a filter, the search, a slot pill, the sort, the job, the level or sync) goes back to page 1, also when the old setting comes back. The page is not saved: a reload starts at page 1.

**The HQ mark** (`.hqg`, `ui/hq-font.js`): after the name of HQ-capable gear and of the meal in the Food row. It is plain "(HQ)" in the muted colour until the Lodestone symbol font (hotlinked from the ewwwin/ffxiv-symbol-fonts mirror, pinned to one commit) has loaded, then `html.hqfont` swaps in the glyph; offline or blocked, the text stays.

## 4. The How the math works tab

A reference tab with three sub-tabs, each on its own settings where noted:

- **Piece stats**: what sync does to one piece, before and after sync, and when an overgeared piece has more than a melded one at the cap: the same slot at every item level against a melded piece at the cap, with how each stat is built, checked against real gear and the Wiki. Under "Each stat, step by step", each stat is the lower of the piece's own value and its ceiling, the same slot at the synced item level, with the slot shares of the budget. A "?" button opens "How sync works". The example piece's melds go into the two chosen substats, the 2nd first, since the 1st is already at the piece's own cap.
- **GCD**: how speed becomes the GCD at a level ([math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)), on its own settings, whatever the job, sync or optimizer result:
  - *Settings:* a level (the synced level until another is typed; one out of range is corrected, its note as the box's hover text), a haste (none, or a job's always-on haste from [math.md, Haste](../mechanics/math.md#haste), every percent listed) and a total speed.
  - *Shows:* for the speed, the GCD, GCDs per minute, the speed to the next step, the cut to cast and recast times (`recastMult`), the tick multiplier and the haste; a chart of the speed one 0.01 s step takes at every level (the first ten steps' average, the haste's levels marked); and 13 steps around the speed, the speed's step in the middle unless it is near the base or the floor.
  - *Slider:* it runs from the level's base to the most total speed any job can have there (the numbers are in [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)).
- **Substat tiers**: where each substat's tiers start around your value, as on the character panel ([math.md, Substat tiers](../mechanics/math.md#substat-tiers-breakpoints)). A card per substat shows its tiers around a value: From, the effects, spare and to next. Values are typed or clicked, held to the base and the most the level allows. Each substat has its own "?".
  - *Level:* its own, in the math bar (as the other sub-tabs' controls are), and the synced level until another is typed. Each valid level counts as it is typed, so the tiers at level 80 can be read while the settings say 50. The optimizer result never comes in (the sub-tab has no Fill button).
  - *Steps shown:* 7 tiers either side of the value, with no More tiers button. Each substat shows the same number of steps, its value's step in the middle unless it is near the base or the last step, where the steps run on past the other side instead of leaving rows empty.

## 5. The level and cap fields

The Job and sync panel at the top of the page (job, synced level, item level sync and its cap) is one panel that shows the open tab's own settings: the Gear browser and How the math works each keep their own job, level, sync switch and cap, saved apart, so changing them on one tab leaves the others as they were. The Sheets tab has no panel: each sheet holds its own job, level and sync (section 6).

The panel has two states, as in the prototype:

- a one-line strip ("Job: Sage · Level 100 · Item level sync: off", the cap in place of "off" while sync is on, "none chosen" with no job) with a Change button;
- the full panel with Reset to defaults and Close.

Its behaviour:

- It always starts as the strip, with or without a job. Change opens the panel, and the open state is one flag shared by both tabs (`settings.open`, `components/page.js`).
- Change and Close move the keyboard focus to the other button; Escape in the open panel closes it and puts the focus on Change.
- The strip sits flush on the tab bar (its margin cancels the page gap), so the bar is 53 px lower on the two reference tabs than on Sheets.
- The tabs stay while the open tab has no job, since another tab may have one.
- Reset to defaults resets the open tab's settings only.

The rule the level and cap follow, that a cap above the highest gear made for the level is lowered to it, is in [math.md, section 5](../mechanics/math.md#5-item-level-sync) (without it, a cap alone gave a level 50 character item level 400 stats and a 1.50 s GCD; [history.md](../history.md#stat-model-and-data)). This section is when and how the page applies it. A sheet's page and its New sheet and Copy sheet forms apply it the same way, through the same function ([sheets.md, "A sheet's level and sync"](sheets.md#a-sheets-level-and-sync)).

- **When.** The page lowers the cap once the level field settles (typing 80 passes through 8), when a cap is entered, when item level sync is switched on, and on loading a saved state, and only while item level sync is on (`limitCapToLevel` in `src/ui/state.js`). The job does not matter: a job at its own level cap (Beastmaster at 50, Blue Mage at 80) is limited the same way.
- **The field.** It takes any whole number of 1 or more, so 999 is lowered the same way, with a note under the field ("Lowered to 135, the highest for level 50.") and a gold flash of the field. The note stays until the next change, and stays put when the up arrow is pressed at the limit. Other text (0, 12.5) is an error under the field ("Enter a whole item level from 1 to 795"), in the note's place, and the cap stays as it was. The field shows the cap that applies.

## 6. The Sheets tab

The tab has three levels: the **sheet manager** (every saved sheet), a **sheet page** (one sheet: its settings and its gear sets) and a **set page** (one gear set). Which sheet or set is open is never saved: the tab always opens at the manager. The saved shapes and the storage rules are in [sheets.md](sheets.md) and [architecture.md, section 4](architecture.md#4-persistence).

**The sheet manager.** One row per sheet, in the user's order, with:

- the name (a link that opens it), the first line of its description ("No description" without one) and the actions Open, Edit, Copy and Delete;
- the job's icon and name;
- "Lv 100, ilvl 123" ("ilvl sync off");
- the number of gear sets;
- the dates it was created and last changed, in the browser's time zone (saved as UTC times);
- the date of the game data it was made with.

With no sheet, a "No sheets yet" card with New sheet takes the list's place; with sheets, New sheet sits at the right of the heading. Records the page cannot read are listed under "Could not be read" with their cause and a Delete button.

**New sheet** is a dialog: a name, a description (optional), the job (the Job and sync panel's icons; fixed once the sheet is made), the level (held to the job's level cap), item level sync and its cap (the highest real item level at first). While no name is typed, the name follows the job, level and sync ("White Mage Lv 50 ilvl 130"). A sheet needs a job and a name that is not empty after trimming; a refused name puts the default back, with the reason. The new sheet goes to the top of the list and its page opens.

**A sheet page.** A breadcrumb "Sheets / <sheet>", then the sheet's panel: its name with Edit name and description, Copy sheet and Delete sheet; its description; the job (fixed, with its icon), the level, the item level sync switch and the cap. Level and item level sync apply as they are typed, with no question, and every gear set is shown under them; the cap is kept while sync is off.

Below the panel, "Gear sets": one row per set, in the user's order, with:

- its name (a link to its page) and the first line of its notes;
- how many slots are pinned and unpinned (and how many are empty);
- the actions Edit, Copy and Delete;
- the set's figures under the sheet's settings (main stat, GCD, Critical Hit and its damage, Determination, Direct Hit, the special substat where the job has one, DoT/HoT).

With no set, a "No gear sets yet" card with New set takes the list's place.

**A set page** has a header that stays at the top of the window while the table scrolls under it:

- **The breadcrumb** "Sheets / <sheet> / <set>", with a caret after the set's name that opens the set switcher (the sheet's other sets, "All gear sets (N)" and "+ New set"), and the sheet's settings as one read-only line ("White Mage · Level 70 · Item level sync 300"). On a sheet page the caret after the sheet's name switches sheets the same way.
- **The set bar:** the set's name with a pencil that opens "Name and description"; Fill ("Fill 4 unpinned slots": the unpinned rows the job uses, plus the meal while it is not pinned; off with nothing open), or Apply and Discard while a draft or a Fill result waits; the goal ("for MND › CRT · 2,153 pieces", once the set has Fill settings); a gear icon that opens the Fill settings; Copy and Delete.
- **The stat block:** the figures of the sheet's settings (main stat, GCD, Critical Hit and its damage, Determination, Direct Hit, the special substat where the job has one, DoT/HoT) as "Total"; while a draft or a Fill result waits, "Now" and "After" with each change in green (better) or red (worse), a lower GCD counting as better.
  - A job with an always-on haste (Monk, Ninja, Samurai, Viper) has the label "GCD (with Haste)" and shows the GCD without the haste, then with it: "2.49s (1.99s)". The delta lines compare the hasted GCD. Its column is wider in the stat block and in the sheet page's list of gear sets.

Under the header: the set's notes (all their lines; nothing when empty), then the gear table. Each row has:

- a pin before the slot's name (filled: pinned, outlined: not);
- the piece as a button that opens the **piece picker**: every piece of that slot the job can wear, grouped by expansion newest first, with a search box over names and gear categories, "Empty this slot" first; a Unique ring already in the other ring row is shown but cannot be picked;
- one chip per materia slot that opens the **materia menu**.

The materia menu:

- It shows the four most valuable grades the slot takes, or all twelve with "Show all grades"; a cell the piece's cap already reaches is marked.
- An overmeld slot adds an "odds" row under the grades with each grade's meld chance, and a note when the piece cannot be high quality (NQ rates; display only, the search counts every meld as a success).
- Only the last stone can be removed, so no chip moves; an empty slot's menu has no Remove button.

The Food row's menu is described in section 2.

- **Edits by hand make a draft.** A piece, a stone or a meal chosen by hand changes a copy of the set, not the set. The changed rows are tinted and the stat block shows Now and After. Apply ("Apply 2 changes") saves the draft while Discard drops it, each with a note at the window's bottom. A piece or stone chosen by hand pins its row, and a meal pins the meal. Fill is off during a draft.
- **Pins** are saved as soon as they are clicked, draft or not. Fill keeps a pinned row as it is and fills the others.
- **Fill** runs the search (section 2) with the set's Fill settings (saved with the set at the first Fill: the defaults until then) and its pins, in the set's own lane of the solver. While it runs, Fill becomes Cancel and every edit on the tab is off.
  - *Result:* it waits as a suggestion: the rows it changes are tinted, each with a "Take" box, and Apply saves only the rows taken; Discard (or Escape) drops it.
  - *Empty slot:* a slot the result leaves empty because no piece of it has an equip level up to the one under Gear to search is named in a line under the header ("Weapon: no Sage piece up to equip level 50, the lowest needs level 60.", `suggestionView`'s `emptyNote`).
  - *While it waits:* pieces and stones cannot be changed (a click on the table says so).
  - *Nothing found:* a Fill that finds nothing, or a pin no set can keep, says why in a line under the header; a pin it cannot keep is dropped from the set.
- **The Fill settings** (the gear icon): Maximize and two tiebreaks, Target GCD, melds, food, Spare points to tiebreaks, and Gear to search (equip level, item level range, Expansion and "Gear from"). They are saved at once; a change drops a waiting Fill result, with a note, and the set's tagged "best for goal" meals.
  - *Floating menus:* the Expansion and Gear from menus and the Spare points note float over the dialog, fixed to the window with their height cut to its bottom (`placeMenu` in `ui/helpers.js`), so the dialog's scroll box does not cut them.
  - *Centring:* the dialog is centred with auto margins, not a transform, which would make it their containing box.
- **Leaving the page** (a breadcrumb link, the set switcher, Copy, New set) asks first while something is unsaved or running:
  - a draft ("Apply and leave", "Discard and leave", "Keep editing");
  - a running Fill ("Leave and cancel the Fill", "Keep waiting");
  - a waiting result ("Leave and drop the result", "Keep reviewing").

   A tab button that leaves the Sheets tab asks the same question (`components/page.js` `goTab`).
- **Keys.** Escape closes the open menu or note (in the Fill settings the menu takes the key itself and puts the focus back on its button), then the Fill settings, then the question (as Keep), then drops a waiting Fill result. Tab stays inside the question and the Fill settings.

**Where each action lands:**

| Action | Lands on |
| --- | --- |
| New sheet | the new sheet's page |
| Copy sheet | the manager, the copy at the top, with a note ("Copied as “Heal (1)”.") |
| Delete sheet | the manager |
| New set | the new set's page ("Set N", the smallest number free) |
| Copy set | the list, the copy right after the original |
| Delete set | the list |

Notes:

- **Names.** Names of sheets and sets need not be unique, are trimmed, may not be empty, and the name box takes at most 60 characters (the saved data has no limit); a long one is cut with an ellipsis in lists, with the full name on hover. A copy is named "<name> (1)", or the first number free ("X (1)" copies to "X (2)").
- **Name and description.** Edit opens the "Name and description" dialog, for a sheet (from its row or its page) or a gear set (from its row). Descriptions keep their lines, and the box takes at most 500 characters (`DESCRIPTION_MAX_LENGTH`; the saved data has no limit); a gear set's description is its notes.
- **Copy sheet** asks for a name (the copy name at first), the job (the jobs of the sheet's gear group, its own included; a Blue Mage or Beastmaster sheet copies to no other job), the level and item level sync. When the chosen job cannot wear some of the sheet's pieces (by the item's job list, on every row, the off-hand of a two-handed job included), the dialog lists them by set, slot and name, and Copy sheet stays off until "Clear these pieces in the copy" is ticked; in the copy those rows are empty and their pins dropped. The gear groups come from the item data (`src/data/gear-groups.json`).
- **Delete** always asks first, naming the sheet and its number of gear sets, or the set. There is no undo.
- **Reordering.** Each row of both lists has a handle at its left: drag it above or below another row (a line marks where it drops), or focus it and press Up or Down arrow. The handle keeps the focus, and a live region reads where the row went ("Set 2 moved to position 1 of 2.", "Heal is already first."). New sheets go to the top.
- **Dialogs.** One at a time, over a dimmed page. Escape or a click on the dimmed page cancels, Enter in a one-line box presses the main button, Tab stays inside, and the focus goes back where it was.
- **While a Fill runs** every edit action on the tab is off: New, Edit, Copy, Delete, reordering, the level and sync fields, and the set page's own edits.
- **Saving.** Each change saves the one sheet it changed, at once. A full storage keeps the change in the page, with the storage's message above the tab; with storage blocked, a line says the sheets last until the page closes.

## 7. Corner radii

One radius, 4 px, for every box, field, button, table, menu and dialog. There is no radius token: each rule in `src/styles.css` writes `4px`. Exceptions are round on purpose: switch tracks (12 px) and knobs (50%), radio buttons and rank badges (50%), the ? help buttons (50%), origin pills and the Food menu's stat pills (999 px), and the 2 px items (range tracks, the search mark, legend swatches). The smoke step `checkRadii` (`tests/e2e/smoke.mjs`, table `RADII`) measures each surface below in the browser, so a rule that drifts fails it.

| Surface | Radius |
| --- | --- |
| Fields, selects, menu buttons, buttons (primary, danger, link, icon, caret), the piece and food buttons, stone chips | 4 px |
| Panels, stat block, notes, callouts, tables' boxes, the segmented control | 4 px |
| Piece, food, stone, breadcrumb and Fill settings menus, with their search boxes and rows | 4 px |
| Dialogs (New sheet, Edit, Copy, Delete, the leave question, Fill settings) | 4 px |
| Scrollbar thumbs | 4 px |
| Gear table, stuck column-name row | top corners 4 px (first cell left, last cell right), middle cells square |
| Gear table, last row | bottom corners 4 px (on the body, first and last cell) |

The gear table draws its own outline so the stuck column-name row has real rounded corners. It needs:

- separate borders (`border-collapse: separate`) with the outline on the cells;
- no border and no `overflow` on the wrapper (an `overflow` of `auto` stops the sticky row, `clip` cuts off menus);
- the stick offset equal to the page header's height (not one pixel less, which hides the cell's top border);
- a 4 px page-coloured wedge (`th:first-child::before`, `th:last-child::before`) in each top corner, so the rows scrolling under the stuck row do not show their square side borders through the curve.

`checkRadii` reads the corner pixels at 2x device scale, in a 1920 x 950 window scrolled to the page bottom: every pixel outside the arc must be the page colour.

## Where this lives

| Concept | File |
| --- | --- |
| The page template (frame, Job and sync panel, Sheets shell and dialogs, footer) | `src/index.html` |
| The Math tab, the Gear browser, the sheet manager and sheet page, a set's page | `src/partials/math-page.html`, `gear-page.html`, `sheet-pages.html`, `set-page.html` |
| What the solver answers for a Fill: the answer, the Gear to search line and the Target GCD label | `src/ui/views/solve.js` (`solveView`, `gearToSearchView`, `searchCount`) |
| The Food row's menu | `src/ui/components/meal-menu.js`, `src/ui/views/meal-menu.js` (`mealMenu`, `mealsPassing`, `mealPillOff`, `mealEmptyReason`, `mealLine`, `sortMeals`, `mealList`, `mealBestKeys`, `mealBestNote`); `src/core/food.js` (`allMeals`) |
| Pieces and meals with the same result | `src/core/same-result.js` (`sameMeals`), `src/core/tiers.js` (`rankTierOf`), `src/core/items.js` (`searchMatches`) |
| Relics left out | `src/core/items.js` (`allocatedRelic`) |
| Gear browser: component and view (Reset, cells of lowered pieces, pages) | `src/ui/components/gear.js`, `src/ui/views/gear.js` (`browseFiltered`, `browseCell`, `pageList`) |
| Sheets tab: component and store | `src/ui/components/sheets.js`, `src/ui/sheet-store.js`; sheet and set operations in `src/ui/sheet-ops.js` |
| Sheets: view builders for the manager, a sheet's page, the dialogs, a set's table, a manual draft and a Fill suggestion | `src/ui/views/sheet-manager.js`, `sheet-sets.js`, `sheet-forms.js`, `set-rows.js`, `set-totals.js`, `set-draft.js`, `set-suggestion.js`, `fill.js` |
| A set page: component and its own views | `src/ui/components/set-page.js` and its parts in `src/ui/components/set-page/`, `src/ui/views/fill-settings.js`, `set-edits.js`, `piece-menu.js`, `stone-menu.js`, `set-meal-menu.js`; the grades a meld slot takes: `src/core/meld.js` (`slotGrades`) |
| How the math works sub-tabs | `src/ui/components/sync-explainer.js`, `gcd.js`, `tiers.js`; `src/ui/views/piece.js`, `sync-explainer.js`, `gcd.js`, `tiers.js` |

Notes on the table:

- The Sheets tab component handles the screens, dialogs and reordering; its store holds the sheets, the open screen and the actions.
- A set page's component handles the draft, pins, Fill and the question before leaving; its own views are the Fill settings, edits by hand, the piece picker, and the materia and meal menus.
