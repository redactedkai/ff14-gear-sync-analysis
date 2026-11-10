# Roadmap: feature ideas

Feature ideas only; each needs the owner's go-ahead. An ID (A1, A2, ...) names an idea; IDs are never reused. A new feature should replace or simplify controls where it can: the page has felt "overwhelming" before. Findings and open questions belong on the page they concern (in-game captures still needed: [validation.md, section 8](mechanics/validation.md#8-in-game-captures-still-missing)).

## To build

In build order (the owner's order).

| ID | Idea | In one line |
| --- | --- | --- |
| A3 | Save and share | Settings, gear sets and picks in a JSON file or a URL; after A4 |
| A11 | Relics with allocated substats | Let the optimizer pick them; after A4 |
| A12 | Import from xivgear | Bring in an xivgear link or JSON as gear sets; after A4 |
| A14 | Final viewport and width review | Before the merge to `main` |
| A17 | Harden the saved gear sheet format | Version 1 and migrations, before the first public release |
| A18 | Shields for White Mage and Black Mage at level 50 and below | Offer the one-handed arm and shield; after A4 |
| A19 | Labels and guess marks on the set page | The GCD haste label and the guess mark on the synced Total; after A4 |
| A20 | Saved sheets: edge cases and notes | Ids the database lost and Copy sheet resets that happen without a word; before A17 |
| A21 | Many Fill recipes in one sheet | Measure the 4-entry session cache; after A4 |
| A22 | Type checking | JSDoc types checked by `tsc`, file by file |

### Notes on the rows

- **A3.** A JSON file or a URL, holding the settings, the gear sets and the pieces picked from the same-result menus. After A4.
- **A11.** The optimizer leaves these relics out today, since the game files hold no substats for them ([optimizer.md, section 7](engineering/optimizer.md#7-the-pages-pool-and-its-filters)). The page shows no note about them. Model the allocation so it can pick one. A relic whose substats are set by hand counts as having none in a gear set's Total, Tier row and header today, with no word on the page; A11 fixes that too. After A4.
- **A12.** Bring a gear set or an xivgear sheet in from an xivgear link or its exported JSON, as gear sets in a gear sheet: pieces, materia and meal by game id, with the job, level and cap; relic substats and custom items are listed as not mapped. After A4.
- **A14.** Before the merge to `main`:
  - the container cap is settled at 1280 px (every tab, the Sheets tab included);
  - decide the `@media (min-width: 1300px)` rule on `.twopanel`;
  - re-check the viewport list in [testing.md, section 3.1](engineering/testing.md#31-viewports-to-look-at-for-ui-changes), in particular whether the short 1280 x 720 screen (about 1265 x 565 window, 4.4% of desktop screens in StatCounter, October 2026) stays.
- **A17.** Not public yet, so while A4 is built the saved shapes may change with no migration (`v` stays 1; an unreadable record is skipped and listed with a Delete button). Before the first public release:
  - freeze the format as version 1;
  - write the migration strategy (a chain of tested functions, one per `v` step, run when a record is read);
  - keep fixture records of every shipped shape in a unit test;
  - decide what a build does with a record saved by a newer version (listed as "saved by a newer version", never deleted or rewritten);
  - settle the rule for dev and main builds that share saved data;
  - turn the tolerant reader of old stat keys (`withCurrentStatKeys` in `src/ui/sheet-storage.js`, which reads the position keys `main`, `spd`, `spec` of a record saved before the keys were the game's own) into the first migration step;
  - replace the quiet repair on read (`repairSheet` in `src/ui/sheet-ops.js`: it holds a sheet's level and item level cap to what the job and level allow, and drops a damaged `bestMeals`) with migrations. It only exists to mend saved sheets from earlier builds and hand edits, so once the format is frozen a record that fails a check should be listed as unreadable, not changed.

- **A19.** Two numbers on the set page need a label that says what they include.
  - The header GCD and the Tier row for Monk, Ninja, Samurai and Viper include an always-on haste (haste values come from job guides, not the game files) and are labelled only "GCD"; label it, for example "GCD (with Fuka)".
  - The Total uses the main stat and Vitality clamp under item level sync, which is a guess ([math.md](mechanics/math.md)), with no mark; only the math tab's help names it. Mark it in a few words next to the number, as the rules for guesses say.
- **A20.** Cases the saved sheets handle without telling the user.
  - A saved game id the database lacks shows "missing item 12345" with no name; a data update or a filter change can cause it, and Copy sheet copies such an id as it is.
  - Copy sheet resets a Fill setting that does not fit the other job (a stat it lacks) and cuts an equip level without a note.
- **A21.** The session keeps 4 recipes per kind (`SESSION_SIZE` in `src/core/session.js`). A sheet whose sets use more than 4 distinct Fill recipes evicts entries, and each eviction costs a full search (seconds under a Target GCD). Measure it with a sheet of several sets, then raise the size or store the results.
- **A22.** Type checking, so the code is easier to maintain. Needs the owner's yes for two dev dependencies (`typescript`, `@types/alpinejs`); nothing ships in the page.
  - Start with JSDoc types checked by `tsc` (`checkJs`, `noEmit`, non-strict), files stay `.js`, `npm run check` gets a `typecheck` step.
  - Opt in per file with `// @ts-check`, from `src/core` and `src/ui/views` outward; turn the shape comments into `@typedef`s.
  - Stat keys, job ids and profiles become unions derived from the frozen tables (`as const`); no `enum`.
  - Alpine: the types are community-made; templates are not checked; `$store` is `unknown` until a `Stores` interface is declared; component factories are left to infer their return type.
  - Renaming to `.ts` is a later, optional step (imports need the `.ts` extension; `node --test` on `.ts` relies on Node's type stripping, untested here).
- **A18.** Until level 50 these jobs wield a one-handed arm and a shield (Console Games Wiki, "Shield"); the item data has 26 White Mage and 25 Black Mage shields and 24 and 38 one-handed arms (equip level 15 to 50). The tool treats every job but Paladin and Beastmaster as two-handed (`ONE_HANDED_JOBS`, `activeSlotTypes`), so it offers none. Decide how the off-hand row follows the level without a level rule in the saved gear sets (they always hold 12 rows). After A4.

## Built

On `dev` at least; live once on `main`.

| ID | Idea | Details |
| --- | --- | --- |
| A1 | Target GCD | [optimizer.md, section 2](engineering/optimizer.md#target-gcd-from-a-gcd-to-a-speed-range) |
| A2 | Food | [math.md, section 6](mechanics/math.md#food) |
| A4 | Gear sets and comparison (the Sheets tab; follow-ups A18 to A21) | [sheets.md](engineering/sheets.md), [ui.md, section 2](engineering/ui.md#2-fill-the-search-on-a-set-page) |
| A13 | The page template split into partials | [architecture.md, section 5](engineering/architecture.md#5-build) |
| A16 | Stat keys that are the game's own stats | [architecture.md, section 2](engineering/architecture.md#2-the-job-context) |
| A5 | Check sync caps against ffxiv-gearing | [validation.md, section 9](mechanics/validation.md#9-against-another-tool-ffxiv-gearing) |
| A7 | Rank by tier | [tier-ranking.md](engineering/tier-ranking.md) |
| A8 | Substat tiers (breakpoints) | [math.md, section 6](mechanics/math.md#substat-tiers-breakpoints) |
| A9 | Other pieces with the same result | [ui.md, "Which piece a Fill suggests"](engineering/ui.md#which-piece-a-fill-suggests) |
| A10 | Gear from filter | [data-pipeline.md, section 4.6](engineering/data-pipeline.md#46-sources) |
