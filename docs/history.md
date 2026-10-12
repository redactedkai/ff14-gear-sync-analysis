# History of corrections

A log of claims and results that turned out to be wrong, what replaced them, and how the mistake was found. Its purpose is to stop the same mistakes from coming back. Add an entry whenever a published number, a doc statement or a result of the tool has to be retracted.

Related pages: [validation.md](validation.md) (current evidence), [math.md](math.md), [optimizer.md](optimizer.md), [data-pipeline.md](data-pipeline.md).

## Lessons

Most entries below come from one of these patterns:

- **An inference stated as a fact.** Say what the data shows, and label the explanation as inferred ("unused", not "placeholder").
- **A rounded or remembered number instead of a re-run.** Re-run the code before quoting a figure, and keep one decimal for percentages; 99.5% is not 100%.
- **A result checked only against the code that produced it.** Prefer an independent reference: game data, the Wiki, exhaustive search.
- **Job-specific thinking in a job-agnostic tool.** The owner plays Sage, but the tool serves all 22 combat jobs.

## Stat model and data

| What was claimed or done | What is true | How it was found |
| --- | --- | --- |
| A "materia slot × 0.91" factor explains main-stat differences between the model and some items. | The difference was normal quality (NQ) against high quality (HQ) values. The database stores the HQ values of every item that can be HQ. | Not recorded. |
| The HQ bonus (`BaseParamValueSpecial`) can be added to every item. | It is added only when `CanBeHq` is true. Adding it everywhere inflated the stats of 290 database rows. | Diffing the item database against the first version. |
| Those ~290 inflated rows were relic and raid pieces. | They are mostly upgradeable gear families: Phantom Vision (140 rows, item level 780), Arcanaut's (105 rows, item level 745), plus 45 item level 130 Captain's weapons (Serpent, Storm and Flame, 15 each). The count of 290 was right. | Recounting by name during the doc rewrite (2026-10); see [data-pipeline.md, section 4](data-pipeline.md#stats-and-the-hq-bonus). |
| Using one rounding instead of two is wrong for about 1 piece in 30. | It is wrong for about 1 piece in 5: one rounding reproduces 79.1% of the 16,584 checked pieces exactly (16,586 since the two cloaks joined the database), two roundings 98.7%. | Re-running both variants over the database during the doc rewrite (2026-10); see [math.md, section 4](math.md#the-formula). |
| Formula accuracy reaches 100% in two item level bands (136–300 within ±1; 301–600 exact). | 99.5% and 99.6%. Only 301–600 within ±1 is really 100.0% (7,184 of 7,184). Summaries such as "97 to 100% exact" overstate the top end; the exact range is 97.1% to 99.6%. | Re-running `bandAccuracy` with one decimal during the doc rewrite (2026-10); see [validation.md, section 2](validation.md#2-every-real-piece-by-item-level-band). |
| The level-50 GCD thresholds in the tests (150, 202, 307, 349) are reference values like AkhMorning's level-100 examples. | Their source was never recorded. They are regression values until matched against a published tier table. The 0 and 3 thresholds are not asserted at all. | Tracing each test value to a source during the doc rewrite (2026-10); see [validation.md, section 5](validation.md#5-speed-and-gcd). |
| Item level rows 796 to 920 are an "unused placeholder". | They are unused by any current gear. The data cannot say why they exist; "budget room for future gear" is an inference. | Not recorded; the history of `ItemLevel.csv` is now in [data-pipeline.md, section 7](data-pipeline.md#item-levels-above-795). |
| An item level slider maximum of 520. | Arbitrary. Replaced by the highest real item level (795), computed from the database rather than stored. | Not recorded. |
| Dungeon gear cannot be identified from the game files (no client sheet holds loot tables), so leaving it out needs the Lodestone. | Loot tables are indeed not in the client, but each piece's `Item.SubcategorySort` code marks its source: code 270 is every dungeon piece and nothing else. | Checking the undocumented codes against Garland Tools' dungeon loot lists, the Console Games Wiki and the Lodestone; see [subcategory-sort-codes.md](subcategory-sort-codes.md). |
| Shields use the 40 ‰ off-hand share like any slot; the two item level 120 shields (Tenacity 13, where 40 ‰ gives 14) are an unexplained exception, and the shield substat cap at 123 is 14. | An off-hand's stats are the two-handed value minus the one-handed value: 224 of 226 real off-hands fit, against 195 for 40 ‰, the 120 shields included. The shield substat cap at 123 is 13 under this rule (inferred; no shield exists at 123 and the Wiki's one shield cap, 53 at 475, fits both). | A study of the pieces the formula misses (2026-10), confirmed by re-running the accuracy check; adopted by the owner. |
| Vitality is × 0.9 for Intelligence and Mind **jobs** (a job rule; in the accuracy check, inferred from the piece's main stat). | The factor belongs to the **item** and is in the game files: `BaseParam.MeldParam`, column `Item.BaseParamModifier`. It is Vitality × 0.9 on Intelligence/Mind gear, as before, but also every main stat and Vitality × 0.9 on the 13 pieces with all four main stats (Lieutenant's, Field Commander's, Warlord's, Proto Ultima Mesh), which the job rule predicted 10% too high and synced at the full cap; and it gives the factor of pieces with no main stat (Occult "of Magic" Vitality 307, "of Blood" 341). The rounding order (slot value first, then the factor) is unchanged and still read off real items. The page now reads the factor per item; the job's factor is kept only where no item is involved (Sync caps, Piece stats), where it equals the game files' value for the job's own gear. | Following xivgear's sync code, which reads `BaseParamModifier` (2026-10), then re-running the accuracy check over the whole database; see [math.md, section 4](math.md#the-stat-factor-of-an-item). |
| Gear sources (first draft): currency code 1 in a type-2 exchange shop is not a tomestone, and gear traded in to make tomestone gear is tomestone gear too. | Code 1 there is Allagan Tomestones of Poetics (the Lodestone shows the cost). The traded-in rule flagged pieces nothing shows were sold for tomestones (Weathered, Antiquated, Yasha) and depended on whether the old shop survived in the files, so it was dropped; only the forward direction (made from tomestone gear) is kept. The flag also briefly counted any listing whose second item slot was empty as a match (item id 0). | Spot-checking random pieces against Lodestone item pages (Augmented Deepshadow Necklace of Healing) and diffing the flags before and after each rule. |

## Results of the tool

| What was reported | What is true | How it was found |
| --- | --- | --- |
| Best synced Spell Speed for Sage from one item level 130 healer set: 194 of 200. | The set's ring is Unique, so it can be worn only once: 171 synced to 123, 176 unsynced. The `IsUnique` flag is now carried into the database. | Not recorded. |
| The optimizer returns the best loadout unless the search is truncated. | Dominance pruning removed an item when any single better item existed. Rings fill two slots, so the second-best ring could be dropped. Against the exact optimum on real gear, **360 of 9,800 runs (3.7%) were below it**, for example Paladin, items 160 to 200, synced, Critical Hit: 322 instead of 345. Now an item is dropped only if the items beating it can fill every slot of its type; the same runs miss 0. Pruning is also switched off when a stat maximum is set, which it had got wrong too. | Engineering audit (real-gear probe and random pools against exhaustive search). See [optimizer.md, section 4](optimizer.md#4-fewer-candidates-dominance-pruning). |
| The lexicographic score with fixed weights $10^8, 10^4, 1$ ranks target, then tiebreak 1, then tiebreak 2. | Only while each tiebreak total stays below 10,000. Above that, a tiebreak could outrank the target. Real gear had not crossed the limit (largest totals about 6,000), but synthetic pools did. Weights are now derived from the pool, and a score that could exceed $2^{53}-1$ raises an error. | Engineering audit. See [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number). |

## Scope and claims

| What was claimed or done | What is true | How it was found |
| --- | --- | --- |
| Sage-specific behaviour (Eukrasian spells' effect on the GCD and similar) belonged in the page. | Removed. The tool is job-agnostic: all 22 combat jobs, cap and synced level are settings. Do not reintroduce Sage-only wording, presets or logic. | Not recorded; removed on purpose. |
| This is the first item level sync calculator. | Not confirmed. A search found none (XIVGear's README and site do not describe one), but absence was not proven. Do not claim novelty without checking again. | Not recorded. |
