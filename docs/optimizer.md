# The gear optimizer

Given a pool of items and a job, the optimizer picks one item per gear slot so that a chosen stat is as high as possible, with up to two tiebreak stats. This page explains how it does that and why the answer is exact (unless the search hits its node limit).

How a piece's stats are computed, and what level sync does to them, is in [math.md](math.md). Where the item data comes from is in [data-pipeline.md](data-pipeline.md).

![The optimizer as six stages: pool, effective stats, per-slot candidate lists, dominance pruning, branch and bound, loadout. A real run with 1,988 Sage items synced to item level 123 keeps 119 candidates, visits 137 search nodes and returns 344 Spell Speed.](diagrams/optimizer-pipeline.svg)

## 1. The problem

A character wears one item in each gear slot: weapon, head, body, hands, legs, feet, earrings, necklace, bracelets and **two** rings. Paladin carries a one-handed weapon plus a shield (the off-hand slot); every other job uses a two-handed weapon, which leaves the off-hand empty. White Mage has both kinds at item level 100 (one wand and shield pair from A Realm Reborn). A few body pieces (the Vermilion Cloaks) also cover the head and leave it empty.

The user builds a **pool** of candidate items (real gear from the game data). The optimizer chooses a **loadout**, one item per slot, that:

1. maximizes the total of a **target** stat (for example Spell Speed or Tenacity),
2. then, among loadouts with the same target total, maximizes **tiebreak 1**,
3. then **tiebreak 2**.

This is a lexicographic order: a tiebreak only matters between loadouts that are equal on every higher-ranked stat.

Constraints:

- **Copies.** Each pool item has a number of copies. A ring marked Unique in the game can be worn once; any other ring can be worn in both ring slots, so it gets 2 copies. Everything else has 1 copy (it only fits one slot anyway). The copies come from the game data when an item is added and are not edited on the page; the gear table marks a 2-copy ring ×2.
- **A speed range** (optional, engine only): a minimum and a maximum for the speed stat (Skill Speed or Spell Speed), meant for a future "reach this GCD tier" control ([roadmap.md](roadmap.md)). Other stats have no limits. The page does not expose it yet; it is covered by tests.

**Leaving out gear by source.** Under *Include*, one switch per group (all on by default) can take crafted, tomestone, ultimate, current Savage, relic or PvP gear out of the search (current Savage is the current expansion's Savage gear only; relic includes the Eureka, Bozja and Occult Crescent armor). The groups are the gear that is hardest to get. This happens before the optimizer runs: such items are removed from the pool it is given (and from the ceiling table's pool), so the search itself is unchanged. An item's groups come from the game files ([data-pipeline.md, section 4](data-pipeline.md#sources)); hand-made pieces have none and are never left out.

The stats used are the **effective** stats: the synced stats when sync is on, the item's own stats otherwise. Sync caps each stat on a piece above the cap item level; see [math.md, section 5](math.md#5-item-level-sync). Melds are ignored.

## 2. Formal statement

**Slots.** Let $s_1, \dots, s_n$ be the slots to fill, in a fixed order: weapon, off-hand, head, body, hands, legs, feet, ear, neck, wrist, ring, ring, except that a slot some pool item can leave empty (the off-hand, and the head when a cloak is in the pool) moves to the end. A slot type with no item in the pool is left out, so $n \le 12$.

**Blocked slots.** Each item $x$ has a set $B(x)$ of slot types it leaves empty: the off-hand for a two-handed weapon, the head for a cloak, nothing otherwise (from the item's slot code; a hand-made weapon on a two-handed job blocks the off-hand). A loadout is legal only if every slot in $B(x)$ of a chosen $x$ is empty. Because blockable slots come last, the search knows when it reaches one whether it is blocked; a blocked slot takes no item and adds 0, so it adds 0; while a chosen piece blocks a later slot, that slot's best score and speed come off the bounds below, so the cloak's branch is pruned like any other (without this, ceiling runs on the full Sage pool synced to 123 hit their 150,000-node limit; now the largest takes 181 nodes). Dominance also respects it: $A$ can only prune $B$ when $B(A) \subseteq B(B)$, so a cloak that beats a body piece on every stat never removes it (the head may be worth more). The ring type appears twice. For a slot type $t$, let $k_t$ be how many slots it has: $k_{\text{ring}} = 2$, otherwise $k_t = 1$.

**Candidates.** $P_t$ is the set of pool items of type $t$. Each item $x$ has a number of copies $c(x) \in \{1, 2\}$.

**Vectors.** Each item has an integer vector $v(x)$ with one entry per dimension: the job's stats (main stat, Vitality, Critical Hit, Determination, Direct Hit, the speed stat, and for tanks and healers Tenacity or Piety). The entries are the effective stats.

**Loadouts.** A loadout is $L = (x_1, \dots, x_n)$ with $x_i \in P_{s_i}$, or $x_i = \varnothing$ (empty), such that no item is used more often than its copies:

$$
\bigl|\{\, i : x_i = x \,\}\bigr| \le c(x) \quad \text{for every item } x.
$$

A slot is left empty only when every candidate for it is already used up. In practice that means a second ring slot when the pool has a single Unique ring. Two policies follow, and both are deliberate:

- **A single ring only when no pair exists.** If the pool allows any legal pair of rings, a loadout with one ring is not considered, even when every pair breaks a maximum and one ring alone would meet it.
- **A slot is never left empty to meet a constraint.** If every candidate in a slot breaks a maximum, the answer is "no feasible loadout", not a loadout with that slot empty (section 8).

The brute-force reference in the tests copies both rules, so each also has a direct test on a two-item pool (`tests/unit/optimizer-exhaustive.test.js`, "policy: ..."). Changing one means changing the engine, the reference and those tests together.

**Totals.** For a dimension $d$, $T_d(L) = \sum_i v_d(x_i)$, with $v(\varnothing) = 0$.

**Objective.** With target $k_0$ and tiebreaks $k_1, k_2$ (either may be absent), maximize the tuple

$$
\bigl(T_{k_0}(L),\; T_{k_1}(L),\; T_{k_2}(L)\bigr)
$$

in lexicographic order.

**Constraints** (engine only). A speed minimum $m$ and maximum $M$, either optional:

$$
m \le T_{\text{spd}}(L) \le M.
$$

## 3. Turning the lexicographic order into one number

The search adds and compares scores, so the three keys are packed into one integer score per item:

$$
\sigma(x) = W_0\, v_{k_0}(x) + W_1\, v_{k_1}(x) + W_2\, v_{k_2}(x), \qquad \sigma(L) = \sum_i \sigma(x_i).
$$

The weights must make sure a lower-ranked stat can never outweigh one point of a higher one. They are derived from the pool. For each key $k_j$, let $R_j$ be the widest range its loadout total can span:

$$
R_j = \sum_{i=1}^{n} \Bigl( \max\bigl(0,\ \max_{x \in P_{s_i}} v_{k_j}(x)\bigr) - \min\bigl(0,\ \min_{x \in P_{s_i}} v_{k_j}(x)\bigr) \Bigr).
$$

The $0$ inside accounts for an empty slot. Then, from the lowest key up,

$$
W_2 = 1, \qquad W_1 = R_2 + 1, \qquad W_0 = R_1 W_1 + R_2 + 1 = (R_1 + 1)(R_2 + 1).
$$

In general $W_j = 1 + \sum_{l > j} R_l W_l$. If you use fewer keys, drop the missing ones (one key gives $W_0 = 1$).

**Why this is lexicographic.** Take two loadouts that first differ at key $j$, by at least 1 (stats are integers). The keys below $j$ can change the score difference by at most $\sum_{l > j} R_l W_l = W_j - 1$. So the score difference is at least $W_j - (W_j - 1) = 1 > 0$, and the loadout that is better on key $j$ always scores higher.

Example (measured on the 1,988-item Sage pool, target Spell Speed, tiebreaks Critical Hit then Determination):

| | $R_1$ (Crit) | $R_2$ (Det) | $W_0, W_1, W_2$ |
| --- | ---: | ---: | --- |
| Synced to item level 123 | 344 | 373 | 129,030 ; 374 ; 1 |
| Unsynced | 3,149 | 3,141 | 9,897,300 ; 3,142 ; 1 |

**Exactness.** JavaScript numbers are exact for integers up to $2^{53} - 1 \approx 9.0 \times 10^{15}$. The engine bounds the largest possible score magnitude,

$$
B = \sum_j W_j \sum_{i=1}^{n} \max\bigl(0,\ \max_{x} v_{k_j}(x),\ -\min_{x} v_{k_j}(x)\bigr),
$$

and refuses to run (it raises an error saying the totals are too large to rank exactly) if $B$ or any weight exceeds $2^{53} - 1$. It does not fall back to an approximate ranking. Measured over every combat job's full real-gear pool, unsynced, for every choice of three different keys: the largest $B$ is $1.27 \times 10^{11}$ (Ninja, main stat / Vitality / Critical Hit), about 70,000 times below the limit.

Before a fix (see [history.md](history.md)) the weights were fixed at $10^8, 10^4, 1$, which stops being lexicographic once a tiebreak total reaches 10,000. **Verified** by test: a head piece with 20,000 of a tiebreak stat used to outrank one with a higher target stat; now it does not.

## 4. Fewer candidates: dominance pruning

Most items in a large pool can never be part of a best loadout because another item in the same slot is at least as good in every way. Removing them before the search is what keeps it fast: the 1,988-item Sage pool shrinks to 119 distinct candidates synced to 123, and to 167 unsynced.

**Beats.** Within one slot type, item $x$ **beats** item $y$, written $x \succ y$, when

$$
v_d(x) \ge v_d(y) \ \text{for every dimension } d, \quad\text{and}\quad \bigl(v(x) \ne v(y) \ \text{or } x \text{ comes before } y \text{ in the pool}\bigr).
$$

Every dimension includes all of the job's stats, not just the target and tiebreaks. That way an item kept for its speed, which may have a minimum, is not thrown away. The tie rule makes $\succ$ a strict order: it is transitive and never cyclic.

**Drop rule.** Drop $y$ only if the items beating it have enough copies between them to fill every slot of its type:

$$
\sum_{x \succ y} c(x) \ \ge\ k_t .
$$

For a single-slot type this means "something beats it". For rings it means "two copies beat it": one ring with 2 copies, or two different rings. Copies are counted once per item, so two candidate versions of one Unique ring are still one ring.

### Why one better ring is not enough

![Three Unique rings A, B and C with 10, 9 and 5 of the target stat. The old rule drops B and C because A beats both, so the best pair it can find is A plus an empty slot, 10. The current rule keeps B because only one copy beats it, finds A plus B, 19, and drops only C, which two copies beat.](diagrams/optimizer-rings.svg)

Before the F1 fix, an item was dropped if any single item with at least as many copies beat it. That is safe for one slot, not for two. With three Unique rings worth 10, 9 and 5, ring A beats both others, so B and C were dropped and the optimizer returned A plus an empty slot (10) instead of A + B (19). **Verified** by tests for this pool, for two identical Unique rings (now 20, was 10), and for a 2-copy ring that still correctly beats two worse Unique rings (20).

### Why the rule is safe

Two facts together show that pruning never removes every best loadout.

**1. The kept items that beat $y$ still have enough copies.** Suppose $y$ was dropped, but the kept items that beat it have fewer than $k_t$ copies. Then some dropped item beats $y$. Among those, pick one, $z$, that no other dropped item beats ($\succ$ is a strict order on a finite set, so one exists). $z$ was dropped, so the items beating $z$ have at least $k_t$ copies. Each of them beats $y$ (transitivity), and each is kept (a dropped one would be a dropped beater of $y$ that beats $z$, contradicting the choice of $z$). So the kept beaters of $y$ have at least $k_t$ copies, a contradiction.

**2. Any loadout using a dropped item can swap it for a kept one without getting worse.** Let $L$ use dropped item $y$ in a slot of type $t$. The kept beaters of $y$ have at least $k_t$ copies. The other $k_t - 1$ slots of that type use at most $k_t - 1$ of those copies, so at least one copy of a kept beater $x$ is free. Replace $y$ by $x$. Since $v(x) \ge v(y)$ in every dimension:

- every total stays the same or rises, so the score does not drop (all weights are positive);
- a speed minimum that held before still holds.

Repeat until no dropped item is used. This ends, because each swap moves to an item higher in the strict order $\succ$. The result uses only kept items and is at least as good as $L$.

**Pruning is turned off when a speed maximum is set.** Step 2 assumes that more of a stat never hurts. A maximum breaks that: in the tested example, head H1 (20 Spell Speed, 30 Crit) beats H2 (15, 25), and rings A, B, C carry 10, 9 and 5 Spell Speed. With "Spell Speed at most 33" every loadout with H1 reaches 34 or more, so only H2 is allowed. Without pruning the optimizer finds Critical Hit 25 (H2 with two of the rings), which is the correct answer (**verified** by test).

## 5. The search: depth-first branch and bound

After pruning, each slot's candidate list is sorted by score, best first (ties keep pool order). The search fills slots one at a time in the fixed order of section 2, trying candidates best first. It keeps the best complete loadout found so far, with score $\sigma^*$.

![A three-slot example: heads H1 and H2, bodies B1 and B2, necks N1 and N2. The first descent H1, B1, N1 gives 43. N2 gives 41. Body B2 is pruned because 34 + 8 cannot beat 43, and head H2 because 12 + 23 cannot. Seven of fifteen nodes are visited.](diagrams/optimizer-search-tree.svg)

At a node where slots $1, \dots, p-1$ are filled, with partial score $\sigma$ and partial totals $T_d$, the search stops exploring if any of these holds:

**Score bound.** The remaining slots can add at most

$$
U_p = \sum_{i \ge p} \max_{x \in P_{s_i}} \sigma(x),
$$

so if $\sigma + U_p \le \sigma^*$, nothing below this node can be strictly better. (A loadout only replaces the best one if it scores strictly higher, so among equal scores the first one found is kept.)

**Speed minimum.** If $T_{\text{spd}} + \sum_{i \ge p} \max\bigl(0, \max_{x \in P_{s_i}} v_{\text{spd}}(x)\bigr) < m$, the minimum can no longer be reached.

**Speed maximum.** A candidate is skipped if adding it would push the speed total past $M$. All real item stats are non-negative (checked over all 17,281 database rows), so the total can only grow along a branch.

Both bounds use the best value in each remaining slot independently, except that the two ring slots are bounded together. At the first ring slot the two add at most the best **legal pair**: the best ring twice if it has 2 copies, otherwise the best ring plus the best ring of another item (the best alone if there is none). Every legal pair is at most this: a pair with the best ring adds the best other item at most, and a pair without it has both members at most the best other item. Counting the best Unique ring twice, as two independent slot bounds do, left the bound too high whenever the best ring was Unique, and the search could not cut the many near-ties below it (one real run fell from 80,290 nodes to 170). The bounds still ignore copies in other ways and can overestimate; overestimating never cuts a branch that should be kept, it only makes the search visit more nodes.

**Ring symmetry.** The two ring slots share one list. Choosing (A, B) or (B, A) gives the same loadout, so the second ring's position in the sorted list must be at least the first ring's position. The same ring can fill both slots only if it has 2 copies.

**Empty slot.** A slot is left empty only when no candidate for it has a copy left. Candidates skipped by the ring symmetry rule or by the speed maximum still count as available here.

**Node limit.** Every visited node counts. When the count passes the limit, the search stops, returns the best loadout found so far and marks the result as **truncated**. A truncated result may not be the best one. The page uses a limit of 700,000 nodes for the main result and 150,000 for each ceiling run (section 6), and says so when a result was truncated: the main result shows a note, and a ceiling cell shows "≥ value" with a footnote. The engine's own default, when no limit is given, is 1,500,000.

## 6. The per-stat ceiling table

Below the main result, the Gear optimizer tab shows "Ceiling per stat from this pool". For each of the job's stats it runs the optimizer with that stat as the only target (no tiebreaks) twice: synced to the current cap, and unsynced. Each cell is the highest total of that one stat the pool can reach, ignoring all other stats. The last row converts the synced speed ceiling into a GCD.

That is 12 or 14 runs (6 or 7 stats, two sync modes). On the 1,999-item Sage pool they take about 0.29 s together.

## 7. Correctness and performance

### Correctness evidence

| Check | What it compares | Result |
| --- | --- | --- |
| Exhaustive search, random pools (test) | 400 seeded random pools: rings with 1 and 2 copies, Unique items, empty slot types, sync on/off, tiebreaks, speed minimums and maximums. Optimizer vs trying every legal loadout | all equal |
| Exhaustive search, huge tiebreak values (test) | 200 random pools with tiebreak stats up to 50,000 per item | all equal |
| Constraints (test) | A small pool of real items: speed minimum, maximum and range, infeasible cases, against an independent brute force | all equal |
| Regressions (test) | F1 ring pools (19, 20, 20), F3 large tiebreaks, the speed maximum example of section 4 | pass |
| Known values (test) | Generic item level 475 gear synced to 123: 296 Spell Speed, 2.22 s GCD at level 50 | pass |
| Real gear, exact optimum (probe, not a committed test) | 22 jobs × 35 item level windows $[\ell, \ell + 40]$ for $\ell = 100, 120, \dots, 780$ × sync on/off at cap 123 × every stat as target = **9,800 runs**. Reference: with one target and no constraints the best loadout is just the best item per slot (best ring pair respecting copies) | **0 misses** |

The real-gear probe was rerun for this page with the current code. Run with the old ring rule plugged into the same search, it misses in **360 of 9,800** runs, which matches the number recorded in [history.md](history.md#results-of-the-tool), including its example (Paladin, items 160 to 200, synced, Critical Hit: 322 instead of 345). With the cap set to the middle of each window instead of 123, the current code again misses 0, the old rule 590.

The exhaustive and constraint tests run with `npm test`. If a change to scoring, pruning or the search makes any of them disagree with the reference, the test fails and names the pool.

### Performance

Measured with Node 22.23.2 on the owner's Windows PC, median of 5 runs, including building the candidate lists. The pool is every piece Sage can equip at item level 100 and up (1,999 items). The node counts before the ring-pair bound (section 5) are in brackets; every result is the same.

| Run | Nodes | Time |
| --- | ---: | ---: |
| Synced to 123, Spell Speed | 137 (137) | ~25 ms |
| Synced to 123, Spell Speed, tiebreaks Crit, Det | 137 (137) | ~23 ms |
| Unsynced, Spell Speed | 194 (505) | ~17 ms |
| Unsynced, Critical Hit, tiebreaks Det, Spell Speed | 194 (5,811) | ~17 ms |
| Unsynced, Critical Hit, Spell Speed at least 2,000 | 2,645 (3,238) | ~19 ms |
| Unsynced, Critical Hit, Spell Speed at most 1,000 (pruning off) | 2,194 (558,548) | ~7 ms (was ~450 ms) |
| Ceiling table: 14 runs at 150,000 nodes each, synced to 123 at level 50 | | ~290 ms |

Synced runs leave fewer candidates after pruning (119 against 167 unsynced): sync cuts many pieces down to the same stats, so they differ only by item level.

Across the 9,800 real-gear runs, the median is 69 nodes, the 99th percentile 149 and the largest 203 (Summoner, items 260 to 300, unsynced). Before the ring-pair bound they were 73, 18,178 and 191,023: the largest was Ninja and Viper, items 600 to 640, unsynced, Skill Speed, where most armor has no Skill Speed, so many candidates tie at a score of 0, and the best ring is Unique, so counting it twice left the bound 42 points too high to cut those ties. Rerun on 2026-10-12 with both searches side by side: the same total in all 9,800 runs, none truncated.

## 8. Known behaviours and limits

- **Empty pool:** the result is "ok" with no picks and all totals 0 (**verified** by test). The page shows its own empty-pool message first.
- **Missing slot types** are left out of the loadout.
- **Truncated results** may not be optimal, so the page marks them: a note under the main result, and "≥ value" plus a footnote in the ceiling table. No run in the 9,800-run probe comes near the ceiling limit of 150,000 any more (before the ring-pair bound, the 191,023-node case did, and its cell showed a lower bound).
- **Ties:** among loadouts with exactly the same score, the first one found wins: higher-ranked items first, then pool order.
- **A speed maximum never empties a slot.** If every candidate in a slot would break it, the result is "no feasible loadout", even though leaving that slot empty would satisfy it. The speed range is engine only, so this does not affect the page yet.
- **Scores too large to rank exactly** raise an error instead of returning a possibly wrong answer (section 3). Real gear stays far below that point.
- **Model assumptions** carry over from the stat model: synced stats follow the clamp rule in [math.md](math.md) (verified against the Wiki's item level 475 caps); melds are ignored (assumed). Items in the pool use their real stats, so the empirical substat shares do not affect the optimizer.

## Where this lives

| Concept | File |
| --- | --- |
| Effective stats, item vectors, score weights, dominance pruning, candidate lists | `src/core/optimizer/candidates.js` (`effStats`, `makeScorer`, `pruneDominated`, `buildCandidates`) |
| Bounds and depth-first branch and bound | `src/core/optimizer/search.js` (`suffixBounds`, `branchAndBound`) |
| Entry point, pruning switch for a speed maximum | `src/core/optimizer/index.js` (`optimize`) |
| Which slots a job uses | `src/core/job-context.js` (`slotActive`) |
| Sync clamp | `src/core/formulas.js` (`syncStats`) |
| Copies (Unique rings), pool items from the database | `src/core/items.js` (`poolItemFromRow`, `browseItems`) |
| Page use: node limits, main result, ceiling table | `src/ui/views/optimizer.js` (`NODE_LIMIT`, `CEILING_NODE_LIMIT`, `optimizerView`, `ceilingView`) |
| Tests | `tests/unit/optimizer.test.js`, `tests/unit/optimizer-exhaustive.test.js`, `tests/unit/optimizer-constraints.test.js` |
