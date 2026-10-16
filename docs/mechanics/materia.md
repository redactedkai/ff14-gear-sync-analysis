# Materia melds

The gear optimizer can give each piece its best materia melds for the chosen objective, together with the choice of gear. This page states the meld rules, how they were checked and what melds change in results. How the optimizer finds the best melds of one piece, and why choosing them piece by piece is exact, is in [optimizer.md, section 6](../engineering/optimizer.md#6-melds-in-the-search).

Related pages: [optimizer.md](../engineering/optimizer.md) (the search and the best melds of one piece), [math.md](math.md) (caps and sync), [glossary.md](../glossary.md).

## 1. Terms

A piece of gear carries a main stat, Vitality and usually two **substats** (secondary stats such as Critical Hit; see the [glossary](../glossary.md)). Melding lets the player add more substat points to a piece, within limits. The words below are used in the rest of the page.

- **Materia** are stones that add one combat substat to a piece of gear: Critical Hit, Determination, Direct Hit, Skill or Spell Speed, Tenacity or Piety. Placing one is **melding**.
- **Grades** run from I to XII. A higher grade is not always worth more (section 2): grade VI adds 16 points, grade VII only 8.
- A piece has 0 to 5 **guaranteed slots**. Some pieces (crafted gear and the old PvP sets) also allow **overmelding**, also called advanced melding: extra slots up to 5 in all, which can fail in game. The tool assumes every meld succeeds (owner's decision).
- A **synced** piece is one that item level sync or level sync applies to: its item level is above the duty's item level cap, or its equip level is above the synced level ([math.md, section 5](math.md#which-pieces-are-synced)). Its stats may or may not drop, but it loses all its melds (section 2).
- The **objective** is what the optimizer maximizes: a **target** stat, then up to two **tiebreaks** that decide between results with the same target ([glossary](../glossary.md)).

## 2. The rules

Four questions decide what a piece can gain from melds: how much each stone is worth, how many stones of each kind fit, how far each substat may rise, and whether the piece keeps its melds at all. The subsections answer them in that order, then say which of several equal melds the tool shows.

### Stone values and item level gates

A stone's grade fixes its value, and each grade fits only gear at or above a minimum item level (its **gate**). Every combat substat has the same values. Read from the game files (`Materia` sheet, and each materia item's item level); **verified**. The gate also appears on the Lodestone, the official game website, as "Base Item: Item Level N".

| Grade | I | II | III | IV | V | VI | VII | VIII | IX | X | XI | XII |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Value | 1 | 2 | 3 | 4 | 6 | 16 | 8 | 24 | 12 | 36 | 18 | 54 |
| Gear item level at least | 15 | 30 | 45 | 70 | 160 | 290 | 420 | 420 | 560 | 560 | 690 | 690 |

- **Main stats and Vitality cannot be melded:** their materia have value 0 (**verified**).
- **Grades VI, VIII, X and XII** (the **high grades**) go into a guaranteed slot or the first overmeld slot, never later. Their overmeld success rate is 0% past the first overmeld slot (game files, `MateriaGrade`; **verified**).

From grade VI on, the values alternate: each even grade is worth far more than the odd grade gated with it (VIII 24 against VII 8, XII 54 against XI 18), and only the even grades carry the slot restriction.

### Slots: big and small stones

Because the high grades are restricted, slots fall into two kinds. A **big** slot (a guaranteed slot or the first overmeld slot) takes any grade; a **small** slot (a later overmeld slot) takes any grade except VI, VIII, X and XII.

**Example.** Courtly Lover's Earrings of Healing (item level 770) have 1 guaranteed slot and allow overmelding, so they take 5 stones: 2 big (slots 1 and 2) and 3 small (slots 3 to 5). At item level 770 the best big stone is XII (+54) and the best small stone is XI (+18). The diagram shows the slots and their best meld for Critical Hit, then Determination.

![The five meld slots of an overmeldable earring, filled in order](../diagrams/materia-slots.svg)

**The rule.** With $g$ guaranteed slots (`Item.MateriaSlotCount`) and overmelding allowed (`Item.IsAdvancedMeldingPermitted`), a piece takes

$$
B = \min(5,\ g + 1) \ \text{"big" stones}, \qquad S = 5 - B \ \text{"small" stones},
$$

and without overmelding $B = g$, $S = 0$.

- A big slot takes any grade; the tool uses the most valuable grade the item level allows (the big stone) or the small stone below.
- A small slot takes the most valuable grade the item level allows that is not VI, VIII, X or XII (the small stone).
- Slots fill in order, so empty slots always come last (**verified**, Wiki). Overmelding starts only once every guaranteed slot is full.

The best stones by item level follow from the gate table:

| Gear item level | Big stone | Small stone |
| --- | --- | --- |
| 100 to 159 | IV (+4) | IV (+4) |
| 160 to 289 | V (+6) | V (+6) |
| 290 to 419 | VI (+16) | V (+6) |
| 420 to 559 | VIII (+24) | VII (+8) |
| 560 to 689 | X (+36) | IX (+12) |
| 690 and up | XII (+54) | XI (+18) |

The table starts at 100, the lowest item level in the database. Below 290 the two stones are the same, so the split into big and small slots changes nothing there.

**Pieces without guaranteed slots.** In the item data, no piece has 4 guaranteed slots or more than 5. 15 Paladin shields have no guaranteed slot but allow overmelding. The tool gives them no melds. That is **inferred**: xivgear (a community gear planner) gives them 5 slots, and no source says which is right.

### The cap on each substat

Melds cannot raise a substat without limit. On each piece, each substat is capped at that piece's own sync cap: the cap of its slot share and stat factor at its own item level ([math.md, section 5](math.md#the-clamp-rule)). A stone's points above the cap are lost.

**Example.** Kirin's Osode of Fending, an item level 300 body piece for tanks, has Critical Hit 110 and Determination 77, and a cap of 110 on every substat. Critical Hit is already at the cap, so melds add nothing to it. Determination has 33 points of room: two VI and one V (16 + 16 + 6 = 38) fill it, and 5 points are lost.

**The rule.** With $x_k$ the piece's own value of substat $k$ and $C_k$ its cap, the room left is

$$
h_k = \max(0,\ C_k - x_k),
$$

and the stones put into substat $k$ add $\min(h_k,\ \text{their total value})$ to it. A meld never lowers a stat already above its cap.

**Evidence.** This is **verified** for substats with a stat factor of 100: the top substat of real pieces equals it, and the Wiki's Kirin's Osode of Fending (item level 300 body) caps at 110 with its 77 melded up to 110. Where the factor is below 100 (for example Piety on kind 0 earrings, at 90%), the cap uses the factor-first cap order, which is **inferred** beyond three second-hand in-game values.

### Sync removes melds

A piece keeps its melds only if it is not synced: its item level is at or below the item level cap (with item level sync on), and its equip level is at or below the synced level. **Verified** in game by the owner. A piece exactly at the cap keeps them.

### Which stones are shown

Several melds can give a piece the same gains, when a stone's points are partly cut by the cap. In the Kirin's Osode example, three VI and "two VI and one V" both raise Determination by exactly 33. The tool shows, in this order:

1. the most gain on the target, then the tiebreaks;
2. the fewest stones (more slots left empty);
3. the fewest big stones (odd grades first: XI over XII, V over VI);
4. the first one found.

A slot whose stone adds nothing to the target or a tiebreak stays empty, rather than taking a stone in another substat (the owner's decision, 2026-10-15). For the Osode with Determination as the target, the tool shows two VI and one V, with 2 slots empty.

Stone prices, retrieval and overmeld odds play no part (the owner's decision, 2026-10-16). Only what is shown changes: a small stone in a big slot never raises a gain, so the gains, and every result, are the same as with each slot holding its own stone. (With a speed maximum it could reach lower speeds, but in 2,045 Target GCD runs it found no better set for about 14% more search work, so the optimizer leaves it out; owner, 2026-10-16.)

## 3. Checks

How do we know the rules above are implemented right? Three independent sources were compared with the tool.

- **Against xivgear** (its own code at commit `6c3c878` and its data API, 10,534 pieces of 8 jobs, item levels 100 to 795):
  - every meld cap matches (67,433 of 67,433);
  - every best stone per slot, every materia value and gate, and every sync decision match;
  - slot layouts match except the 8 zero-slot Paladin shields the API serves (section 2).

  On the target value, xivgear's autofill falls short of ours in 4,140 of 38,290 piece and stat cases. It refuses a stone that overshoots the cap by more than 2 points and never tries a smaller grade. With that allowance lifted, it matches ours on all 38,290. **Verified** (both run).
- **Brute-force reference:** the tests' reference enumerates every placement of the best allowed stone per slot on its own, without the code above, and agrees with the optimizer on 40 random pools of real pieces (some meldable, some synced).
- **Real items:** Kirin's Osode of Fending, Courtly Lover's Earrings of Healing and Pendulums, Rainbow Robe of Healing; every gate edge; synced and level-synced pieces; the 0-slot shields.

## 4. Effect on results

Do melds change which gear the optimizer picks? Sync decides how many pieces keep their melds at all. Pieces that keep their melds, out of the full pool (every piece the job can wear):

| Setting | Sage (1,999 pieces) | Warrior (2,383) |
| --- | --- | --- |
| Cap 123, level 50 | 18 | 41 |
| Cap 290 | 318 | 459 |
| Cap 400, level 70 | 591 | 776 |
| Cap 530, level 80 | 967 | 1,186 |
| Cap 660, level 90 | 1,338 | 1,557 |
| No sync | 1,749 | 1,968 |

Under sync, a piece above the cap gets its stats lowered to the cap and loses its melds. A meldable piece at or below the cap is limited by its own, lower cap.

- **Full database pool, synced (caps 123 to 660, five objectives):** melds never raised the target. They moved tiebreaks only.
- **Without sync,** they do raise it. Sage's Spell Speed goes from 2,609 to 2,899, Critical Hit from 3,135 to 3,168.
- **Pools gathered around a cap** are different: there melds raise the target often (in about 6 of 10 runs, measured in the planning prototype; **inferred** from that prototype).

## 5. Verified and assumed

| Claim | Status |
| --- | --- |
| Values, item level gates, no main stat or Vitality materia | Verified (game files, Lodestone) |
| High grades not past the first overmeld slot | Verified (game files) |
| Slots fill in order; overmelding after every guaranteed slot | Verified (Wiki) |
| Which stones are shown among equal gains (section 2) | The owner's decision (2026-10-16), not a game rule |
| Meld cap = the piece's own sync cap | Verified (real items, Wiki, xivgear) for factor 100; inferred below 100 |
| Melds lost on synced pieces | Verified (owner, in game) |
| Every meld succeeds | Assumed (owner's decision: odds are out of scope) |
| A slot whose stone adds nothing to the target or a tiebreak stays empty | The owner's decision (2026-10-15), not a game rule |
| 0-slot pieces with overmelding take nothing | Inferred (xivgear gives them 5 slots) |
| Shield and cloak caps (2H − 1H, share 220) | Inferred ([math.md, section 3](math.md#3-slot-shares)), and xivgear agrees |
| HQ and NQ share a cap | Inferred; the tool models HQ stats |
| Custom-stat relics melded on their base stats | Limitation: their real stats are set by the player |

Notes: HQ (high quality) and NQ (normal quality) are the two versions of a crafted item ([glossary](../glossary.md)). Custom-stat relics are relic weapons whose stats the player sets.

## Where this lives

| Concept | File |
| --- | --- |
| Stones by item level, slots, caps, best melds, meld text | `src/core/meld.js` (`stoneValues`, `meldSlots`, `meldCaps`, `bestMeld`, `meldText`) |
| Materia table, slot count and overmeld flag per item | `scripts/data/gen_items.py`, `src/core/items.js` (`meldInfo`), `src/core/tables.js` (`MATERIA`) |
| Melds in the candidate lists; meld versions under a speed range | `src/core/optimizer/candidates.js` (`itemCandidate`, `itemVersions`), `src/core/meld.js` (`meldVersions`) |
| The Materia switch, meld line and note | `src/ui/views/optimizer.js`, `src/index.html` |
| Tests | `tests/unit/meld.test.js`, `tests/unit/helpers/exhaustive.js` (`meldVectors`), `tests/unit/optimizer-exhaustive.test.js` |
