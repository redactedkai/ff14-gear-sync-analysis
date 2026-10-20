# The page: tabs and controls

What the page shows and how its controls behave: the tabs, the Gear optimizer's controls around the search and the menus on its result, the Gear browser's layout, and the How the math works sub-tabs. Most of it is the owner's design, dated where it was decided. How the page is built is in [architecture.md](architecture.md); what the search does with the settings is in [optimizer.md](optimizer.md).

Related pages: [architecture.md](architecture.md) (the store, views and when each area recomputes), [optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters) (the pool the page hands to the search), [tier-ranking.md](tier-ranking.md), [math.md](../mechanics/math.md), [glossary.md](../glossary.md), [roadmap.md](../roadmap.md).

## 1. The tabs

Pick a job from the icons at the top, then set the synced level, and turn on item level sync with a cap if you want one (how to start is in the [root README](../../README.md#use-it)). Once a job is chosen, the page has two working tabs and one reference tab:

1. **Gear optimizer** (opens first): picks one item per slot (two rings) from every piece the job can wear to maximize one stat, with two optional tiebreakers and an optional Target GCD, when you press **Optimize**. A Materia switch (on by default) gives each piece its best melds. Under **Gear to search**, the **Gear from** boxes leave out gear by how it is obtained (quests, crafting, Savage, PvP, ...); nine of them are off by default. Section 2.
2. **Gear browser**: one table of real gear for the selected job, with filters and its synced stats, for looking gear up. A name search sits on its title line ("/" jumps to it), slot pills show how many pieces each slot has, a Reset button appears at their end while a filter is set, and a click on a column heading sorts by it (again to flip). A piece that sync lowers shows its synced numbers in bold, with its own numbers in small type under them. It has its own gear group boxes. HQ-capable crafted gear is marked HQ, and rings that can be worn on both hands ×2. Section 3.
3. **How the math works** (reference), with three sub-tabs. Section 4.

## 2. The Gear optimizer tab

The controls around the search and the menus on its result. The pool it searches and the Gear to search filters are in [optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters).

### Target GCD

Owner's decisions, 2026-10-16. The control for the Target GCD layer of [optimizer.md, section 2](optimizer.md#target-gcd-from-a-gcd-to-a-speed-range).

- The Goal row's last two columns (owner, 2026-10-18: the Goal and Gear to search rows share five columns) hold the box (empty means any GCD) and "exactly" / "or faster" ("exactly" by default, as in xivgear); the label gives the range of GCDs the gear reaches in parentheses ("Target GCD (2.50 to 2.10)"). The range follows the settings as they change, before the next Optimize: it is one search for the most speed (20 to 100 ms), run with the piece count 120 ms after a change.
- For Monk, Ninja, Samurai and Viper the label also names the haste ("Target GCD (2.12 to 1.80 with Fuka 13%)") and the box takes the hasted GCD; the result shows both ("2.14s · GCD (Fuka 13%; 2.47 without)").
- A set that meets the GCD gets no line under the box (owner, 2026-10-19). One short line in plain text says when the set came out faster in "or faster" mode ("2.17, faster than asked"); when no set fits it says why in a warning box ("Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)", "The GCD can't go below 1.50", "No set at exactly 2.10").
- The range comes from a search, so the label shows it only while the result is for the current settings. The box is disabled while the goal is speed (the label then reads "Target GCD (off: the goal is speed)") and cleared on a job switch.

### Optimize

Owner, 2026-10-18. The search runs only when the user presses Optimize, at the right of the switches' line, after tier ranking's switch; before the first press the page says "Press Optimize to find the best set for the goal." A setting changed after a search dims the result, with "The settings changed since this result. Press Optimize to update it." above it, and turns its menus off (a pick would search with the new settings); a job switch clears it. A piece or meal picked from the menus of a current result still updates it at once.

### Spare points to tiebreaks (rank by tier)

Roadmap A7; owner's decisions, 2026-10-16.

- A "Spare points to tiebreaks" switch at the right of the Materia and Food line, before Optimize, **on by default** (kept after comparing tier and raw results, owner's decision, 2026-10-17); it is saved, and a save from before it existed restores it on.
- Its label and ? note ("Substats only improve at tiers, so points short of the next tier do nothing in game. This sends those spare points to your tiebreaks instead.") were chosen on 2026-10-18 after an independent review of the words players use: "tier" is the community's word (AkhMorning, The Balance, xivgear), and "wasted" was avoided, since melding guides use it for materia past an item's cap. It was "Rank by tier" before.
- On, the search is tier ranking ([tier-ranking.md](tier-ranking.md)): meal and gear are chosen together, with or without a Target GCD, since every tier counts food.
- In the Tier row the held stats are highlighted. (A line under the readout named them in order with the effect each held, "Ranked by tier: Piety +165 MP, then ..."; dropped on 2026-10-18 by the owner, since the Goal selects give the order and the Effect row the effects.)
- A thin progress bar shows from the first frame of a solve until the result: the solve holds the page's thread, and the bar's animation runs on the compositor meanwhile.

### Character panel totals

The Total and With food rows show each substat as the in-game character panel does: the level's base plus gear (plus food); [math.md, section 6](../mechanics/math.md#totals-as-on-the-character-panel). Main stat and Vitality stay gear points: their base depends on the job and clan, which the page does not ask for (owner's decision). The party bonus is not counted. The Target GCD line's speed band uses the same numbers.

### Other pieces with the same result

Roadmap A9; owner's decisions, 2026-10-16. The search returns one set, but under sync many pieces reach the same caps: for Sage at level 50, item level 123, with crafted and tomestone gear, every slot has 11 to 20 others, 171 in all. So each result row shows a piece with the same result, and its item cell is a menu ("1 of 14") of all of them, by expansion, each with its gear category ([data-pipeline.md, section 4](data-pipeline.md#gear-category)). A search box at the top takes the keys when the menu opens (owner, 2026-10-18); a piece passes when every word is in its name or gear category ("ring heal", "raid"), and a search that matches nothing says so with Clear search (`samePassing`, sharing `searchMatches` with the Food menu).

- **The same result:** the same main stat, and every substat at the same tier, counted with the result's meal. The tiers are tier ranking's (`rankTierOf`, [tier-ranking.md](tier-ranking.md)), so speed holds its GCD (with haste) but its DoT/HoT tick scaling may drop a step (the GCD matters far more; owner's decision, 2026-10-16, as for tier ranking), and Tenacity holds its mitigation step (200) but its damage bonus may drop a step (tanks take Tenacity for mitigation; Critical Hit, Determination or Direct Hit do more for damage; owner's decision, 2026-10-16). The plain optimizer maximizes the goal stat's raw points, so they stay as well (a Spell Speed goal that kept its GCD at 3 points less would show less than the search found); so do they under tier ranking, where the points left over go to the goal (order A; [tier-ranking.md](tier-ranking.md)).
- **Which piece a row shows:** the lowest equip level, then the lowest item level; the search's own pick on a tie. No setting: the pieces are equivalent, so none is marked as the optimizer's.
- **Rows share their spare points.** Two swaps can each keep a tier alone and lose it together, so every check is made against the pieces the other rows show at that moment: rows are filled in panel order, each menu is computed against the rows as shown, and a pick from a menu checks the others again. A Unique piece is never in two rows (rings), and a piece must leave the same slots empty as the search's pick (a cloak never replaces a plain body).
- **The candidates** are the search's own, unpruned: every piece with its synced stats and the melds the search would give it (each meld version under a Target GCD). Most pieces are ruled out by the main stat alone. Picks are not saved (A3 will) and any setting change clears them.
- **Cost:** in Node, 0 to 19 ms per run, plus 14 to 19 ms to build the unpruned lists, which are kept while the pool settings, goal and GCD mode stay (Sage at level 50 / 100 and Warrior at level 70 / item level 400).

### The Food row's menu

Owner's design, 2026-10-18; it replaced the Meal (HQ) box. With Food on, the search uses the best meal for the goal, and the Food row's meal is a menu like the rows' above, made to serve sets built by hand later (A4) as well:

- **Which meal the row shows:** the highest item level meal with the same result as the best (owner, 2026-10-18) (`sameMeals`: the same as for pieces, plus the same total on every goal key without tiers, since every meal adds Vitality), tagged "best for goal" and counted ("1 of 11"). Under sync many meals tie: for Astrologian at level 50, item level 123, Mind > Vitality > Direct Hit, 11 meals from Dawntrail, Endwalker and Shadowbringers give the same bonus, and the row shows the newest Dawntrail one.
- **The menu** lists every meal the job can use (`allMeals`; 182 for Astrologian), by expansion, newest first, one line each (owner, 2026-10-18): its item level first ("i580", as players write it), its name, and what it adds on this gear ("SpS +44 DHT +41 VIT +54"); its stat pair ("Spell Speed + Direct Hit") is the row's hover text. No deltas and no "same result" labels. Above the list, on one line: a search box (meal names), stat pills (CRT, DET, DHT, SpS, PIE; a meal must have each pill picked, and after two the rest are greyed out, since a meal has at most two stats) and a "Best for goal" switch, on by default, that keeps only the tagged meals. The pills start from the goal (owner, 2026-10-18): the first time the menu opens for a result (after Optimize or a meal pick), the goal's substats are picked in order (target, tiebreak 1, tiebreak 2), only those the newest meal tagged best for goal has, and two at most; the player's changes then stay. Turning "Best for goal" on puts the pills back to those, so the switch never empties the list. A pill that would leave no meal under the other filters is greyed out, like a third one. So only a search can empty the list, which then says so: "No meal matches "xyz". Clear search" (`mealsPassing`, `mealPillOff`, `mealEmptyReason`; a unit test walks every state the menu can reach and checks it).
- **A picked meal** reruns the search with it in place of the best, since with tier ranking or a Target GCD the meal can change which gear wins; the row then says "HQ, picked". Like the rows' picks it is not saved and any setting change clears it.
- **Limit:** the tags compare meals on the gear the search found with the best meal. Under tier ranking or a Target GCD another meal could lead the search to other gear; checking that would take a search per meal, so it is left to a pick.

### Removed: the ceiling table

The page used to show a per-stat ceiling table below the result (each stat's best total from the pool, synced and unsynced). It was removed on 2026-10-12 (owner's decision): it repeated the main result per target and the Sync limits tab, and cost 12 or 14 extra searches on every change.

## 3. The Gear browser tab

The database matches of the tab's own filters, with synced stats; when it recomputes is in [architecture.md, section 3](architecture.md#heavy-work-debounced-only-when-visible-or-on-request).

Layout (owner, 2026-10-18): the name search on the title line (every word must be in the name, the words found are marked), slot pills with each slot's count under the other filters, one row of filters (item level as one "min – max" field, as under Gear to search), a Reset button (funnel and ×) at the end of the pills' line while any filter is off its default (`browseFiltered`; its place is kept while hidden, so the pills do not move), and sorting from the column headings (`browse.sort` and `browse.dir`, saved). A row that sync lowers (owner, 2026-10-19) shows what the player gets on top, bold: the synced item level and stats, the lowered stats with the optimizer's cap bar; a muted line under it holds the piece's own numbers, "before sync" under the name, and a grey bar marks the row's left edge (`browseCell`).

## 4. The How the math works tab

A reference tab with three sub-tabs, each on its own settings where noted:

- **Piece stats**: what sync does to one piece, before and after sync, and when an overgeared piece has more than a melded one at the cap: the same slot at every item level against a melded piece at the cap, with how each stat is built, checked against real gear and the Wiki. Under "Each stat, step by step", each stat is the lower of the piece's own value and its ceiling, the same slot at the synced item level, with the slot shares of the budget. A "?" button opens "How sync works".
- **GCD**: how speed becomes the GCD at a level, on its own level, haste and speed (not the job, sync or optimizer): the facts for one speed (the GCD, GCDs per minute, the cut to cast and recast times), the speed one 0.01 s step takes at every level, and the steps around the speed. The speed slider runs from the level's base to the most any job can have there.
- **Substat tiers**: where each substat's tiers start around your value, as on the character panel. A card per substat shows its tiers around a value: From, the effects, spare and to next. Values are typed or clicked, held to the base and the most the level allows. Its own level sits in the math bar and is the synced level until another is typed. Each substat has its own "?".

The Sync limits sub-tab was removed on 2026-10-16.

## Where this lives

| Concept | File |
| --- | --- |
| The page template (every tab and control) | `src/index.html` |
| Gear optimizer: component, view (Target GCD label, result rows, same-result and meal menus) | `src/ui/components/optimizer.js`, `src/ui/views/optimizer.js` (`samePassing`, `mealsPassing`, `mealPillOff`, `mealEmptyReason`) |
| The Food row's menu | `src/ui/components/meal-menu.js`; `src/core/food.js` (`allMeals`) |
| Pieces and meals with the same result | `src/core/same-result.js` (`sameMeals`), `src/core/tiers.js` (`rankTierOf`), `src/core/items.js` (`searchMatches`) |
| Relics left out | `src/core/items.js` (`allocatedRelic`) |
| Gear browser: component and view (Reset, cells of lowered pieces) | `src/ui/components/gear.js`, `src/ui/views/gear.js` (`browseFiltered`, `browseCell`) |
| How the math works sub-tabs | `src/ui/components/sync-explainer.js`, `gcd.js`, `tiers.js`; `src/ui/views/piece.js`, `sync-explainer.js`, `gcd.js`, `tiers.js` |
