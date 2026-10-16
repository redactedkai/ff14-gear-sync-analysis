# The gear optimizer

Given a pool of items and a job, the optimizer picks one item per gear slot so that a chosen stat is as high as possible, with up to two tiebreak stats. This page explains how it does that and why the answer is exact (unless the search hits its node limit).

How a piece's stats are computed, and what level sync does to them, is in [math.md](../mechanics/math.md). Where the item data comes from is in [data-pipeline.md](data-pipeline.md).

![The optimizer as six stages: pool, effective stats, per-slot candidate lists, dominance pruning, branch and bound, loadout. A real run with 1,999 Sage items synced to item level 123 keeps 119 candidates, visits 137 search nodes and returns 344 Spell Speed.](../diagrams/optimizer-pipeline.svg)

## 1. The problem

A character wears one item in each gear slot: weapon, head, body, hands, legs, feet, earrings, necklace, bracelets and **two** rings. Paladin and Beastmaster carry a one-handed weapon plus a shield (the off-hand slot); every other job uses a two-handed weapon, which leaves the off-hand empty. White Mage has both kinds at item level 100 (one wand and shield pair from A Realm Reborn). A few body pieces (the Vermilion Cloaks) also cover the head and leave it empty.

The user builds a **pool** of candidate items (real gear from the game data). The optimizer chooses a **loadout**, one item per slot, that:

1. maximizes the total of a **target** stat (for example Spell Speed or Tenacity),
2. then, among loadouts with the same target total, maximizes **tiebreak 1**,
3. then **tiebreak 2**.

This is a lexicographic order: a tiebreak only matters between loadouts that are equal on every higher-ranked stat.

Constraints:

- **Copies.** Each pool item has a number of copies. A ring marked Unique in the game can be worn once; any other ring can be worn in both ring slots, so it gets 2 copies. Everything else has 1 copy (it only fits one slot anyway). The copies come from the game data when an item is added and are not edited on the page; the gear table marks a 2-copy ring ×2.
- **A speed range** (optional): a minimum and a maximum for the speed stat (Skill Speed or Spell Speed). Other stats have no limits. The Target GCD layer (section 2) sets it from a GCD; the page's control is in section 7.

**The pool** on the page is every piece the job can wear, minus the gear groups the user leaves out; they are removed before the optimizer runs, so the search itself is unchanged (section 7).

The stats used are the **effective** stats: the synced stats when sync is on, the item's own stats otherwise. Sync caps each stat on a piece above the cap item level; see [math.md, section 5](../mechanics/math.md#5-item-level-sync). With **melds** on (the page's default), every piece that is not synced first gets its best materia melds for the objective, and its vector includes them. Without a speed range one melded version per piece is enough, as section 6 shows, so the search itself does not change; with one, a piece brings each meld split worth keeping (section 6).

## 2. Formal statement

**Slots.** Let $s_1, \dots, s_n$ be the slots to fill, in a fixed order: weapon, off-hand, head, body, hands, legs, feet, ear, neck, wrist, ring, ring, except that a slot some pool item can leave empty (the off-hand; the head, hands, legs or feet when a piece covering them is in the pool) moves to the end, in the same order, so a blocked slot always comes after the piece that blocks it. A slot type with no item in the pool is left out, so $n \le 12$.

**Blocked slots.** Each item $x$ has a set $B(x)$ of slot types it leaves empty: the off-hand for a two-handed weapon, the head for a cloak, the feet for legs that cover them, the hands, legs and feet for Herklaedi, nothing otherwise. The set comes from the item's slot code; a hand-made weapon on a two-handed job blocks the off-hand. A loadout is legal only if every slot in $B(x)$ of a chosen $x$ is empty.

Because blockable slots come last, the search knows whether one is blocked when it reaches it. A blocked slot takes no item and adds 0. While a chosen piece blocks a later slot, that slot's bound $u_j$ and speed come off the bounds of section 5, so a cloak's branch is pruned like any other. (Without this, ceiling runs on the full Sage pool synced to 123 hit their 150,000-node limit; now the largest takes 181 nodes.) Dominance pruning also respects blocked slots (section 4).

**Slot counts.** The ring type appears twice. For a slot type $t$, let $k_t$ be how many slots it has: $k_{\text{ring}} = 2$, otherwise $k_t = 1$.

**Candidates.** $P_t$ is the set of pool items of type $t$. Each item $x$ has a number of copies $c(x) \in \{1, 2\}$.

**Vectors.** Each item has an integer vector $v(x)$ with one entry per dimension: the job's stats (main stat, Vitality, Critical Hit, Determination, Direct Hit, the speed stat, and for tanks and healers Tenacity or Piety). The entries are the effective stats.

**Loadouts.** A loadout is $L = (x_1, \dots, x_n)$ with $x_i \in P_{s_i}$, or $x_i = \varnothing$ (empty), such that no item is used more often than its copies:

$$
\bigl|\{\, i : x_i = x \,\}\bigr| \le c(x) \quad \text{for every item } x.
$$

A slot is left empty only when every candidate for it is already used up. In practice that means a second ring slot when the pool has a single Unique ring. Two policies follow, and both are deliberate:

- **A single ring only when no pair exists.** If the pool allows any legal pair of rings, a loadout with one ring is not considered, even when every pair breaks a maximum and one ring alone would meet it.
- **A slot is never left empty to meet a constraint.** If every candidate in a slot breaks a maximum, the answer is "no feasible loadout", not a loadout with that slot empty (section 8).

The brute-force reference in the tests copies both rules, so each also has a direct test on a two-item pool (the "policy: ..." tests in the exhaustive test file). Changing one means changing the engine, the reference and those tests together.

**Totals.** For a dimension $d$, $T_d(L) = \sum_i v_d(x_i)$, with $v(\varnothing) = 0$.

**Objective.** With target $k_0$ and tiebreaks $k_1, k_2$ (either may be absent), maximize the tuple

$$
\bigl(T_{k_0}(L),\; T_{k_1}(L),\; T_{k_2}(L)\bigr)
$$

in lexicographic order.

**Constraints.** A speed minimum $m$ and maximum $M$, either optional:

$$
m \le T_{\text{spd}}(L) \le M.
$$

### Target GCD: from a GCD to a speed range

A player thinks in GCDs, not speed points, so the Target GCD layer takes a GCD $G$ and one of two modes, and sets $m$ and $M$ from them:

- **"Exactly"** (xivgear's meld solver): the GCD must be $G$. Some jobs want this because their cooldowns drift at a faster GCD (The Balance's Dragoon, Dark Knight and Gunbreaker guides).
- **"Or faster":** the GCD must be $G$ or shorter. The result can come out faster than asked, but only when that set ties or wins on the target and tiebreaks.

Steps:

1. **A band of speed.** Each GCD value is reached by a band of speed $[m_G, M_G]$, counted as gear plus food, with the job's always-on haste ([math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)). "Exactly" uses both ends, "or faster" only $m_G$. Example: a level 100 Sage at exactly 2.45 s needs 364 to 449 speed.
2. **One band of gear speed per meal.** A meal adds $f(g)$ speed, and $g + f(g)$ rises with every gear point, so the gear speeds whose total lands in the band form an interval. With the Sage example, a meal with no speed asks for 364 to 449 from gear; every speed meal at its maximum asks for 293 to 370. Meals that ask for the same interval share one search, so "Best for the goal" over 10 Sage meals runs 2 searches.
3. **The best meal.** Among the meals' results, the highest target with food wins, then tiebreak 1 and tiebreak 2 with food, then the most food points, then the job's food order. Food is chosen with the gear here: unlike a plain run ([math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)), the meal changes which gear fits.
4. **No answer.** "Exactly" a GCD slower than the GCD with no speed (2.40 for a level 100 Ninja, whose GCD with no speed is 2.12) is **unreachable**, and no search runs. When the searches find no set, the answer is **none**. Both report the fastest GCD the pool can reach.

The candidate lists of section 4 depend on the objective and on the kind of rule (none, minimum, or band), not on $m$ and $M$. So they are built once and reused for every meal and every new GCD. A list built for a band also serves a minimum.

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

Example (measured on the 1,999-item Sage pool, target Spell Speed, tiebreaks Critical Hit then Determination):

| | $R_1$ (Crit) | $R_2$ (Det) | $W_0, W_1, W_2$ |
| --- | ---: | ---: | --- |
| Synced to item level 123 | 344 | 373 | 129,030 ; 374 ; 1 |
| Unsynced | 3,149 | 3,141 | 9,897,300 ; 3,142 ; 1 |

**Exactness.** JavaScript numbers are exact for integers up to $2^{53} - 1 \approx 9.0 \times 10^{15}$. The engine bounds the largest possible score magnitude,

$$
B = \sum_j W_j \sum_{i=1}^{n} \max\bigl(0,\ \max_{x} v_{k_j}(x),\ -\min_{x} v_{k_j}(x)\bigr),
$$

and refuses to run (it raises an error saying the totals are too large to rank exactly) if $B$ or any weight exceeds $2^{53} - 1$. It does not fall back to an approximate ranking. Measured over every combat job's full real-gear pool, unsynced, for every choice of three different keys: the largest $B$ is $1.27 \times 10^{11}$ (Ninja, main stat / Vitality / Critical Hit), about 70,000 times below the limit.

Fixed weights do not work: the earlier $10^8, 10^4, 1$ stopped being lexicographic once a tiebreak total reached 10,000 ([history.md](../history.md)). **Verified** by test: a head piece with 20,000 of a tiebreak stat no longer outranks one with a higher target stat.

## 4. Fewer candidates: dominance pruning

Most items in a large pool can never be part of a best loadout because another item in the same slot is at least as good in every way. Removing them before the search is what keeps it fast: the 1,999-item Sage pool shrinks to 119 distinct candidates synced to 123, and to 169 unsynced (129 and 207 with melds).

**Beats.** Within one slot type, item $x$ **beats** item $y$, written $x \succ y$, when

$$
v_d(x) \ge v_d(y) \ \text{for every dimension } d, \quad B(x) \subseteq B(y), \quad\text{and}\quad \bigl(v(x) \ne v(y) \ \text{or } x \text{ comes before } y \text{ in the pool}\bigr).
$$

Every dimension includes all of the job's stats, not just the target and tiebreaks. That way an item kept for its speed, which may have a minimum, is not thrown away. The condition on blocked slots means $x$ leaves empty nothing that $y$ does not: a cloak that beats a body piece on every stat never removes it, because the head may be worth more. The tie rule makes $\succ$ a strict order: it is transitive and never cyclic.

**Drop rule.** Drop $y$ only if the items beating it have enough copies between them to fill every slot of its type:

$$
\sum_{x \succ y} c(x) \ \ge\ k_t .
$$

For a single-slot type this means "something beats it". For rings it means "two copies beat it": one ring with 2 copies, or two different rings. Copies are counted once per item, so two candidate versions of one Unique ring are still one ring.

**Computing it.** The candidates are sorted by score, then by the sum of their stats, with exact ties in pool order. A beater scores at least as much as what it beats (every weight is positive) and, unless it is an exact tie, has a larger stat sum, so every beater of $y$ comes before $y$. Each candidate is then compared only with the candidates already kept: by the argument below, the kept beaters always have enough copies, so this drops exactly the same candidates as comparing with all of them. On 23,652 real slot lists (22 jobs, before Beastmaster, six item level ranges, three sync settings, melds on and off, three objectives) both ways kept the same candidates, and the kept-only scan was 7 times faster. **Verified**.

### Why one better ring is not enough

![Three Unique rings A, B and C with 10, 9 and 5 of the target stat. The old rule drops B and C because A beats both, so the best pair it can find is A plus an empty slot, 10. The current rule keeps B because only one copy beats it, finds A plus B, 19, and drops only C, which two copies beat.](../diagrams/optimizer-rings.svg)

An earlier rule dropped an item if any single item with at least as many copies beat it ([history.md](../history.md)). That is safe for one slot, not for two. With three Unique rings worth 10, 9 and 5, ring A beats both others, so B and C were dropped and the optimizer returned A plus an empty slot (10) instead of A + B (19). **Verified** by tests for this pool, for two identical Unique rings (now 20, was 10), and for a 2-copy ring that still correctly beats two worse Unique rings (20).

### Why the rule is safe

Two facts together show that pruning never removes every best loadout.

**1. The kept items that beat $y$ still have enough copies.** Suppose $y$ was dropped, but the kept items that beat it have fewer than $k_t$ copies. Then some dropped item beats $y$. Among those, pick one, $z$, that no other dropped item beats ($\succ$ is a strict order on a finite set, so one exists). $z$ was dropped, so the items beating $z$ have at least $k_t$ copies. Each of them beats $y$ (transitivity), and each is kept (a dropped one would be a dropped beater of $y$ that beats $z$, contradicting the choice of $z$). So the kept beaters of $y$ have at least $k_t$ copies, a contradiction.

**2. Any loadout using a dropped item can swap it for a kept one without getting worse.** Let $L$ use dropped item $y$ in a slot of type $t$. The kept beaters of $y$ have at least $k_t$ copies. The other $k_t - 1$ slots of that type use at most $k_t - 1$ of those copies, so at least one copy of a kept beater $x$ is free. Replace $y$ by $x$. Since $v(x) \ge v(y)$ in every dimension:

- every total stays the same or rises, so the score does not drop (all weights are positive);
- a speed minimum that held before still holds.

Repeat until no dropped item is used. This ends, because each swap moves to an item higher in the strict order $\succ$. The result uses only kept items and is at least as good as $L$.

Step 2 assumes that more of a stat never hurts. A speed maximum breaks that. In the tested example, head H1 (20 Spell Speed, 30 Crit) beats H2 (15, 25), and rings A, B and C carry 10, 9 and 5 Spell Speed. With "Spell Speed at most 33" every loadout with H1 reaches 34 or more, so only H2 is allowed. The right answer is Critical Hit 25 (H2 with two of the rings), **verified** by test. Until the Target GCD work (2026-10-16), pruning was simply off under a maximum. The rule below replaces that.

### Pruning with a speed range

With a speed range the search looks at only two numbers per candidate: its score $\sigma$ and its speed. So pruning compares only those:

- **Minimum only:** $x$ beats $y$ when $\sigma(x) \ge \sigma(y)$, $v_{\text{spd}}(x) \ge v_{\text{spd}}(y)$ and $B(x) \subseteq B(y)$, with the same tie rule as above.
- **A maximum too:** the same, but with $v_{\text{spd}}(x) = v_{\text{spd}}(y)$. Candidates with different speeds never prune each other.

The drop rule and both steps of the proof carry over. In step 2, a swap does not lower the score, and the speed total rises (minimum only) or stays the same (with a maximum), so the speed rule still holds. In the example above, H1 has more speed than H2, so it no longer removes it.

The other stats play no part, so this keeps far fewer candidates than full dominance. Example: the full Sage pool, unsynced, Critical Hit then Determination. Full dominance keeps 212 candidates (257 with melds). With a speed minimum this rule keeps 38 (84); with a maximum, 702 (1,406 meld versions, section 6). Between loadouts with exactly the same score, the one returned can differ from a run without a speed range. The exhaustive-search tests compare the target and tiebreak totals, so they allow that.

The candidates are sorted by score, then by speed, then by stat sum. As above, every beater comes first, and each candidate is compared only with the kept ones. With a maximum, the scan runs once for each speed value.

**Minimums on other stats** (the engine side of tier ranking, roadmap A7) work the same way: each stat with a minimum joins speed in the comparison, and $x$ must have at least $y$'s value of every one. The swap keeps every minimum, so the proof is unchanged. The candidates are then sorted by score, then by the sum of the limited stats (`pruneForLimits`).

## 5. The search: depth-first branch and bound

After pruning, each slot's candidate list is sorted by score, best first, then by stat sum (exact ties keep pool order). The search fills slots one at a time in the fixed order of section 2, trying candidates best first. It keeps the best complete loadout found so far, with score $\sigma^*$.

![A three-slot example: heads H1 and H2, bodies B1 and B2, necks N1 and N2. The first descent H1, B1, N1 gives 43. N2 gives 41. Body B2 is pruned because 34 + 8 cannot beat 43, and head H2 because 12 + 23 cannot. Seven of fifteen nodes are visited.](../diagrams/optimizer-search-tree.svg)

At a node where slots $1, \dots, p-1$ are filled, with partial score $\sigma$ and partial totals $T_d$, the search stops exploring if any of these holds:

**Score bound.** The remaining slots can add at most

$$
U_p = \sum_{i \ge p} u_i, \qquad u_i = \max\Bigl(0,\; \max_{x \in P_{s_i}} \bigl(\sigma(x) - \textstyle\sum_{s_j \in B(x),\, j > i} u_j\bigr)\Bigr),
$$

so if $\sigma + U_p \le \sigma^*$, nothing below this node can be strictly better. For a piece that blocks no later slot, $u_i$ is just the best score in the slot. A piece that blocks later slots (legs that cover the feet) is bounded together with them: its score is spread over its own slot and the ones it empties, so $\sigma(x) \le u_i + \sum_{j \in B(x)} u_j$ and the sum never counts both the piece and the slots it blocks. (Counting both, with the best feet piece on top of a legs piece already worth legs and feet, the search hit its node limit under level sync below 50, where every piece syncs to nearly the same item level and loadouts tie; now those searches take a few hundred nodes.) The speed bound uses the same spread. (A loadout only replaces the best one if it scores strictly higher, so among equal scores the first one found is kept.)

**Speed minimum.** If $T_{\text{spd}} + \sum_{i \ge p} \max\bigl(0, \max_{x \in P_{s_i}} v_{\text{spd}}(x)\bigr) < m$, the minimum can no longer be reached.

**Speed maximum.** A candidate is skipped if adding it would push the speed total past $M$. All real item stats are non-negative (checked over all 20,031 database rows), so the total can only grow along a branch.

**Ring pair.** Both bounds use the best value in each remaining slot independently, except that the two ring slots are bounded together. At the first ring slot the two add at most the best **legal pair**: the best ring twice if it has 2 copies, otherwise the best ring plus the best ring of another item (the best alone if there is none). Every legal pair is at most this: a pair with the best ring adds the best other item at most, and a pair without it has both members at most the best other item.

Two independent slot bounds would count the best Unique ring twice. That leaves the bound too high, and the search cannot cut the many near-ties below it (one real run fell from 80,290 nodes to 170 with the pair bound). The bounds still ignore copies in other ways and can overestimate. Overestimating never cuts a branch that should be kept; it only makes the search visit more nodes.

**Ring symmetry.** The two ring slots share one list. Choosing (A, B) or (B, A) gives the same loadout, so the second ring's position in the sorted list must be at least the first ring's position. The same ring can fill both slots only if it has 2 copies.

**Empty slot.** A slot is left empty only when no candidate for it has a copy left. Candidates skipped by the ring symmetry rule or by the speed maximum still count as available here.

**Node limit.** Every visited node counts. When the count passes the limit, the search stops, returns the best loadout found so far and marks the result as **truncated**. A truncated result may not be the best one. The page uses a limit of 700,000 nodes and shows a note under a truncated result. The engine's own default, when no limit is given, is 1,500,000.

### With a speed range

The bounds above take each slot's best score and best speed separately. Under a speed rule that is weak: the best-scoring pieces often carry no speed, so the score bound stays high while the speed has to come from elsewhere. Before the Target GCD work, a synthetic pool where every piece trades Critical Hit for speed ran to the 700,000-node limit. Three additions fix that, and each one keeps the search exact.

**Speed tables.** Before the search, a table gives $\text{rest}(p, c)$: the most score slots $p, \dots, n$ can still add when the loadout so far has speed $c$ and the rule must still hold at the end. It replaces the plain score bound with $\sigma + \text{rest}(p, T_{\text{spd}}) \le \sigma^*$.

- **Minimum only:** $\text{need}_p(r)$ is the most score slots $p, \dots, n$ add while adding at least $r$ speed, for $r$ from 0 to $m$, built from the last slot back. Each slot contributes only its frontier: the best score at each speed, and only speeds where no faster piece scores as much.
- **With a maximum:** $\text{exact}_p(s)$ is the most score while adding exactly $s$ speed, for $s$ from 0 to $M$. The bound is the best value over the speeds that still land in $[m, M]$. A running maximum, and a sliding maximum over a window the band's width, read it in constant time.

Each slot is counted on its own. The tables ignore copies (a Unique ring may count twice), and they let a slot stay empty where a legal loadout can leave it empty: a blockable slot, a slot with no candidates, or a ring slot whose list holds fewer than two copies. So the table never falls below what some legal completion adds, and it cuts nothing it should keep. A maximum at or above the most speed the slots can add is treated as no maximum.

**One table per set of blocked slots.** Once a chosen piece blocks a later slot (a two-handed weapon the off-hand, a cloak the head), that slot adds nothing to any completion. The table for no blocked slots still counts its best piece there, so the bound stays too high and branches under that piece are almost never cut. The search therefore keeps one table per set of blocked slots, built the first time it is needed, in which those slots can only stay empty. That is still an upper bound: a blocked slot is empty in every completion. A table costs 1 to 50 ms to build, more than a small search takes, so the extra tables are built only after 2,000 nodes (`LAZY_TABLES` in search.js); before that the table for no blocked slots stands in, which is a looser bound but still a bound.

Measured (2026-10-16): White Mage and Black Mage were the slow cases, since 98 of White Mage's 116 weapon candidates and 107 of Black Mage's 124 are two-handed. White Mage at cap 400, Piety then Determination and Direct Hit, exactly 2.40 with food, searched 1,120,206 nodes over its four meal bands and took 5.3 s; with the tables it takes 92 ms. Black Mage at cap 660, exactly 2.34 with food: 10.2 s, now 84 ms (warm runs, one process, nothing else running).

**Speed groups.** At each node a slot's candidates are grouped by speed and by the slots they block. Within a group the table's term for the rest is the same, so the groups are tried in order of their bound and each is scanned by score until a candidate cannot beat $\sigma^*$. Groups come sorted by their best score, so the loop stops at the first group that cannot beat $\sigma^*$ even with the table's most at any speed.

**A memo.** Two partial loadouts at the same slot have the same completions when they have:

- the same speed total (with a minimum and no maximum, any total at or past $m$ counts as $m$);
- the same blocked slots;
- at the second ring slot, the same first ring.

So a later one is cut unless its score is higher. Copies need no key: only the two ring slots share items, and the first ring is in the key.

Blocked slots are not taken off the table bounds as they are off the plain ones. The tables already leave a blocked slot empty (and let a blockable one stay empty), so taking a blocked slot's best score off as well can undercut the bound. That gave one wrong White Mage answer in 41,000 runs of the prototype sweep, which is how it was found.

Measured on the synthetic pool above: 29 nodes with a speed minimum and 12 with a band, both against 700,001 (truncated) before.

### With minimums on other stats

A search may also hold any stat to a minimum (tier ranking, roadmap A7), alone or with the speed range. Each limited stat gets everything speed has above:

- its own table, built the same way (`limitTables`);
- its own minimum check;
- a place in the group key and the memo key.

The bound is the **smallest** of the tables. Each table is an upper bound with the other limits dropped, so the smallest is one too. A joint table over every limited stat would be exact but far too large ($10^{10}$ cells at level 100). Candidates must be prepared for the stats that may get a minimum (`prepare`'s `minStats`), since pruning and meld versions depend on them.

Tier ranking's searches hold two or three stats near their most, often with a speed band, where these tables alone are weak. Three more steps run before the search there: a shortfall filter, pruning against a set already in hand (a seed), and Pareto fronts that often settle the search without a tree. They are explained in [tier-ranking.md](tier-ranking.md). The shortfall filter also runs on Target GCD searches (their speed minimum).

With no minimums the search is the one above. Against the search before this change (2026-10-16), the plain optimizer gave the same results with the same node counts in 5,580 runs (`scripts/perf/compare.mjs --quick`), and Target GCD gave the same results in 2,045 runs of each mode, with slightly fewer nodes (198,473 against 199,862 in "exactly" mode) from the shortfall filter.

## 6. Melds in the search

With melds on, every piece that is not synced enters the search with its best melds for the objective. The meld rules (stone values, item level gates, caps, sync) are in [materia.md, section 2](../mechanics/materia.md#2-the-rules); this section is how the best melds of one piece are found and why one melded version per piece is enough.

Notation from there: a piece has $B$ **big** stones (guaranteed slots and the first overmeld slot, any grade) and $S$ **small** ones (later overmeld slots, no grade VI, VIII, X or XII), worth $V$ and $v$ at the best grade its item level allows, and $h_k$ is its **room** on substat $k$, the points left below its cap.

### The best melds of one piece

The objective ranks substats in order, keys $k_1, k_2, k_3$: the target, then up to two tiebreaks. Only keys that are combat substats can take stones; a main stat target alone melds nothing.

A meld plan puts $b_j$ big and $s_j$ small stones into key $k_j$. The rest are spare and stay empty. With big value $V$ and small value $v$, the gain on key $k_j$ is

$$
\text{gain}_j = \min\bigl(h_{k_j},\ b_j V + s_j v\bigr), \qquad \sum_j b_j \le B, \quad \sum_j s_j \le S .
$$

The best plan maximizes $(\text{gain}_1, \text{gain}_2, \text{gain}_3)$ in lexicographic order: first the target's gain, then the first tiebreak's, then the second's.

- **Ties** go to the plan that leaves the most slots empty, then to the one whose stones are worth the least. A stone that adds nothing to a key is not melded: no stones go into substats the objective doesn't score (the owner's decision, 2026-10-15; until then they went into the job's other substats in order). The page lists the empty slots after the stones ("3 slots empty").
- **The search tries every split** of the $B$ big and $S$ small stones among the keys and the spare bucket. That is at most 200 splits per piece, and the result is cached for each combination of stones, values and rooms.
- **Always the best grade:** for a fixed split, a bigger stone never lowers a gain, so using the most valuable allowed grade loses nothing.

**Greedy filling is not exact.** Putting the biggest stone into the first key that still has room loses on some pieces. Courtly Lover's Earrings of Healing (item level 770) has Critical Hit 142 against a cap of 203, so 61 of room, and takes 2 big stones (XII, 54) and 3 small (XI, 18), as in the diagram in [materia.md, section 2](../mechanics/materia.md#2-the-rules). With Critical Hit as the target and Determination as the tiebreak:

- Greedy puts both XII into Critical Hit: 108 for 61 of room, 47 lost. The three XI give Determination 54.
- XII + XI reach the cap just as well and leave a XII for Determination: 54 + 18 + 18 = 90.

Over every meldable piece of all 22 jobs before Beastmaster and every ordered pair of substats (615,204 cases), greedy is worse in 13,543 (2.20%). **Verified** by running both.

**A missing substat can be melded.** Kirin's Osode of Fending (5 guaranteed slots, grade VI) maximizing Skill Speed, which it doesn't carry, gets five VI: $5 \times 16 = 80$, below its cap of 110. Maximizing Determination instead, it gets three VI ($77 \to 110$), and its other two slots stay empty; with Direct Hit as a tiebreak, those two VI give Direct Hit 32.

**Order.** The page lists the stones in slot order, the order they are melded in: the big stones (slots 1 to $B$), then the small ones. Read left to right, every list is a legal melding order. A test checks this for every meldable piece of three jobs under four objectives.

### Why one melded version per piece is exact

The optimizer scores a loadout as the sum of per-piece scores, $\sigma(L) = \sum_i \sigma(x_i)$, with the weights of section 3. Those weights are derived from the vectors the search can use, so they are computed after melding.

- **Melds belong to one piece.** A piece's melds change only that piece's vector. Copies (a Unique ring is worn once) and blocked slots (a cloak empties the head) depend on the item, not on its melds.
- **The best version wins every swap.** Take any legal loadout and replace one worn piece's melds with that piece's best plan. The loadout stays legal, and its score can only go up, because $\sigma$ restricted to one piece orders plans exactly as their lexicographic gain tuples. Repeat for every piece.
- **So one version per piece is enough.** Some best loadout uses only best-melded pieces, so each meldable piece enters the search as one candidate and the search itself is unchanged. This holds even for two copies of one ring, since each copy takes the same best plan.
- **It does not hold with a speed range.** Under a speed minimum or maximum, a piece's best melds depend on the rest of the loadout: a stone in speed can be worth more than a stone in the target if the rest of the set falls a few points short. Until 2026-10-16 the engine refused melds together with a speed range; now each piece brings several versions (below).

### Meld versions under a speed range

With a speed range, speed joins the keys of the split search above, and every split is kept that no other split **beats**:

- **Minimum only:** another split beats it when it gains at least as much on every key, speed included.
- **With a maximum:** the same, but only at the same speed gain. A split with less speed can be what keeps a set under $M$.

A stat with a minimum (tier ranking) joins the keys the same way as speed with a minimum only. Each surviving split is one candidate of the piece. Every version shares the item, so copies and Unique rings still count once per piece. Pruning (section 4) then drops the versions that another candidate beats on score and speed.

**Why this is exact.** Take a best loadout and one of its pieces with melds $P$. Some kept split $Q$ gains at least as much as $P$ on every key, and (with a maximum) the same speed. Swapping $P$ for $Q$ does not lower the score, and the speed total rises (minimum only) or stays the same. So some best loadout uses only kept versions.

Among splits with the same gains, the one with the fewest stones wins, then the fewest big stones, as for one best split ([materia.md, section 2](../mechanics/materia.md)). A small stone in a big slot can be the split shown, but never adds a version: with a maximum its lower speed could, yet it found no better set in 2,045 Target GCD runs for about 14% more search work (owner, 2026-10-16). The lists are cached by stones and room. Room beyond what all the stones can add changes nothing, so it is clamped first, and more pieces share one list. Example: the full Sage pool, unsynced, Critical Hit then Determination. After pruning, a band keeps 1,406 candidates, a minimum 84, and no speed range 257.

The first version of this kept only the splits beaten by nothing on every key, including speed, even with a maximum. That dropped splits with less speed that a band needed. Perplexity's review flagged it too, and the exhaustive test with a band now covers it.

## 7. The page's pool and its filters

The page has no pool for the user to build: the optimizer searches every database piece the job can wear (built once per job, about 5 to 10 ms) that passes the filters under **Gear to search**. Until 2026-10-15 the user picked pieces into a pool on a Gear pool tab first (often with "Add all"); the owner dropped that step once searching everything proved as fast. A sweep then compared that with era gear only (pieces the sync leaves untouched, which keep their materia): over 1,971 runs (every job, 17 sync settings, every target, materia on), searching every piece gave a better target total in 70% of runs (median +2%, at most +35%), never a worse one (era gear is a subset), and its best loadouts are about three quarters synced high-level pieces (docs/scratchpad/gear-merge, era-vs-synced).

Gear to search has the Gear browser's filters, in the same order, with the optimizer's own values (added 2026-10-15 at the owner's request): Expansion, item level from and to, equip level up to (each empty means no limit; the equip level starts at the job's level cap), and the gear groups. A piece passes exactly when the browser would list it with the same filters and no name or slot. The filters only narrow the pool, so they never make the search slower. One checkbox per group (in a row; two columns on phones) leaves crafted, tomestone, relic, current Savage, ultimate or PvP gear out when unticked. Current Savage, ultimate and PvP are left out by default (the owner's decision, 2026-10-14); a saved choice, including every box ticked, is kept. Current Savage is the current expansion's Savage gear only; relic includes the Eureka, Bozja and Occult Crescent armor. The groups are the gear that is hardest to get. The heading counts the pieces searched out of every piece the job can wear ("searching 1,939 of 1,999 pieces"). The Gear browser has its own filters, so looking gear up never changes the search; when no piece passes, the page says so instead of a result. An item's groups come from the game files ([data-pipeline.md, section 4](data-pipeline.md#sources)).

**Target GCD on the page** (owner's decisions, 2026-10-16). A line under the Goal grid holds the box (empty means any GCD), "exactly" / "or faster" ("exactly" by default, as in xivgear) and the range of GCDs the gear reaches. For Monk, Ninja, Samurai and Viper the label names the haste ("Target GCD (Fuka 13%)") and the box takes the hasted GCD; the result shows both ("2.14s · GCD (Fuka 13%; 2.47 without)"). One short line under the box, in plain text, says what the GCD needs ("Skill Speed 677 to 783 (character panel)") or that the set came out faster in "or faster" mode ("2.17, faster than asked"); when no set fits it says why in a warning box ("Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)", "The GCD can't go below 1.50", "No set at exactly 2.10"). The fastest GCD the gear reaches is in the range beside the box. The box is disabled while the goal is speed and cleared on a job switch. The page keeps the candidate lists and the fastest GCD between runs, so typing a new GCD reruns only the search.

**Character panel totals.** The Total and With food rows show each substat as the in-game character panel does: the level's base plus gear (plus food); docs/mechanics/math.md, "Totals as on the character panel". Main stat and Vitality stay gear points: their base depends on the job and clan, which the page does not ask for (owner's decision). The party bonus is not counted. The Target GCD line's speed band uses the same numbers.

The page used to show a per-stat ceiling table below the result (each stat's best total from the pool, synced and unsynced). It was removed on 2026-10-12 (owner's decision): it repeated the main result per target and the Sync limits tab, and cost 12 or 14 extra searches on every change.

## 8. Correctness and performance

### Correctness evidence

| Check | Kind | Size | Result |
| --- | --- | --- | --- |
| Real-gear pools, seven jobs | test | 3,072 to 147,456 loadouts | all equal |
| Unique rings | test | one real pool | all equal |
| Page views and the built page | test | real pools | all equal |
| Exhaustive search, random pools | test | 400 pools | all equal |
| Exhaustive search, huge tiebreaks | test | 200 pools | all equal |
| Speed constraints | test | one small real pool | all equal |
| Regressions | test | 5 small pools | pass |
| Known values | test | generic gear | pass |
| Exhaustive search with melds | test | 40 pools | all equal |
| Target GCD against the exhaustive search | test | small real pools | all equal |
| Target GCD sweep, every job | probe | 252,112 runs | **0 mismatches** |
| Melds against xivgear | probe | 10,534 pieces | all equal |
| Real gear, exact optimum | probe | 9,800 runs | **0 misses** |

Notes:

- **Real-gear pools.** White Mage, Sage, Warrior, Paladin, Dragoon, Bard and Black Mage, each with every item it can equip in a small item level window between 120 and 135. For every substat as the target, synced to 123 and unsynced, the target, main stat and Vitality totals equal the brute force.
- **Unique rings.** Item level 130 Sage gear whose only ring is Unique wears it once (235 Spell Speed synced, 243 unsynced); with two copies allowed the same ring is worn twice (258 / 267).
- **Page views and the built page.** The optimizer view on real Black Mage gear, and the smoke test's Sage and Warrior pools (Spell Speed 247 / 255, Skill Speed 85 / 87).
- **Exhaustive search, random pools.** Seeded random pools with rings of 1 and 2 copies, Unique items, empty slot types, sync on and off, tiebreaks, speed minimums and maximums. The optimizer is compared with trying every legal loadout.
- **Huge tiebreaks.** Random pools with tiebreak stats up to 50,000 per item.
- **Speed constraints.** A small pool of real items: speed minimum, maximum and range, and infeasible cases, against an independent brute force.
- **Regressions.** The three ring pools of section 4 (best totals 19, 20 and 20), the large-tiebreak case of section 3, and the speed maximum example of section 4.
- **Known values.** Generic item level 475 gear synced to 123 gives 296 Spell Speed, a 2.22 s GCD at level 50.
- **Exhaustive search with melds.** Random pools of real pieces (some meldable, some synced), against a reference that enumerates every stone placement on its own ([materia.md](../mechanics/materia.md)).
- **Target GCD against the exhaustive search.** Both modes with melds, on small real pools with Unique rings, two-handed weapons, shields and the A Realm Reborn tank pieces that cover several slots (Flanchards, Herklaedi). GCDs slower than the free result (the drift case) are included. With food and haste, the reference finds each meal's band by scanning every gear speed, with no use of the engine's band arithmetic.
- **Target GCD sweep.** Not a committed test (`node scripts/perf/target-gcd-sweep.mjs`); details under Performance below. Every 4th run without food is solved again by the plain search, and each job and sync setting adds four small random pools checked by the exhaustive search. The tables for blocked slots are checked against the exhaustive search in `npm test` with `lazyTables: 0`, since small pools never reach 2,000 nodes.
- **Melds against xivgear.** Meld caps, stones, sync decisions and the target after melds ([materia.md, section 3](../mechanics/materia.md#3-checks)). The target matches once xivgear's 2-point overcap allowance is lifted.
- **Real gear, exact optimum.** Not a committed test. 22 jobs (measured before Beastmaster was added) × 35 item level windows $[\ell, \ell + 40]$ for $\ell = 100, 120, \dots, 780$ × sync on and off at cap 123 × every stat as target. Reference: with one target and no constraints, the best loadout is just the best item per slot (best ring pair respecting copies).

The real-gear probe was rerun for this page with the current code. With the old ring rule plugged into the same search, it misses in **360 of 9,800** runs, the number recorded in [history.md](../history.md#results-of-the-tool), including its example (Paladin, items 160 to 200, synced, Critical Hit: 322 instead of 345). With the cap at the middle of each window instead of 123, the current code again misses 0 and the old rule 590.

The brute force shares the optimizer's rule for a piece's synced stats, so these checks test the search, not the sync model; none of these totals has been checked in game ([validation.md, section 8](../mechanics/validation.md#8-open-question-in-game-captures)).

The exhaustive and constraint tests run with `npm test`. If a change to scoring, pruning or the search makes any of them disagree with the reference, the test fails and names the pool.

### Performance

Measured with Node 22.23.2 on the owner's Windows PC, median of 5 runs, including building the candidate lists (2026-10-12, with the kept-only pruning of section 4). The pool is every piece Sage can equip at item level 100 and up (1,999 items). The node counts before the ring-pair bound (section 5) are in brackets; every result is the same. Melds could not be combined with a speed range then, hence "–"; Target GCD timings are in the Target GCD sweep below.

| Run | Nodes | Time | With melds |
| --- | ---: | ---: | ---: |
| Synced to 123, Spell Speed | 137 (137) | ~13 ms | 148 nodes, ~14 ms |
| Synced to 123, Spell Speed, tiebreaks Crit, Det | 137 (137) | ~12 ms | 148 nodes, ~13 ms |
| Unsynced, Spell Speed | 194 (505) | ~8 ms | 234 nodes, ~15 ms |
| Unsynced, Critical Hit, tiebreaks Det, Spell Speed | 194 (5,811) | ~9 ms | 233 nodes, ~17 ms |
| Unsynced, Critical Hit, Spell Speed at least 2,000 | 2,645 (3,238) | ~10 ms | – |
| Unsynced, Critical Hit, Spell Speed at most 1,000 (pruning off) | 2,194 (558,548) | ~7 ms (was ~450 ms) | – |

Synced runs leave fewer candidates after pruning (119 against 169 unsynced): sync cuts many pieces down to the same stats, so they differ only by item level. Across the Sage and Warrior full pools, caps 123 to 660 and no sync, and five objectives, the slowest run takes about 20 ms without melds and 42 ms with them.

Across the 9,800 real-gear runs, the median is 69 nodes, the 99th percentile 149 and the largest 203 (Summoner, items 260 to 300, unsynced). Before the ring-pair bound they were 73, 18,178 and 191,023. The largest was Ninja and Viper, items 600 to 640, unsynced, Skill Speed: most armor there has no Skill Speed, so many candidates tie at a score of 0, and the best ring is Unique, so counting it twice left the bound 42 points too high to cut those ties. Rerun on 2026-10-12 with both searches side by side: the same total in all 9,800 runs, none truncated.

### Item level floor 15 (2026-10-15)

Lowering the database floor from item level 100 to 15 made every job's pool 21 to 33% larger. The quick benchmark (`npm run perf`: SGE, WAR, PLD, BLM, DNC, SAM, 7,884 runs), run on the same PC on the last commit before the change and after it, one run each with nothing else running:

| | Before | After |
| --- | ---: | ---: |
| Melds off, median / 95th percentile | 17.8 / 29.1 ms | 22.4 / 36.4 ms |
| Melds on, median / 95th percentile | 28.0 / 42.6 ms | 34.6 / 52.4 ms |
| Largest search (melds on / off) | 702 / 377 nodes | 555 / 380 nodes |

The time grows with the pool (each piece is scored and pruned before the search); the searches are no larger. Both runs miss the script's budgets on this PC, which were set on an earlier, smaller workload. The owner accepted the slowdown (accuracy first). Without the bound for blocking pieces in section 5, level sync below 50 hit the node limit.

### Stress test (2026-10-14)

Measured on the same PC before Beastmaster was added (22 jobs), with the scripts listed in [testing.md, section 3](testing.md#3-commands).

**Every job's full pool.** Each of the 22 jobs with every piece it can equip (1,899 to 2,641 items), 18 sync settings (none; item level caps 123 to 795; level sync at 50 to 90; five level and cap pairs) and about 40 objectives (every single target, every target and tiebreak pair of substats, and random three-key orders), with melds off and on: 27,936 runs, each timed as the median of 3 calls.

| | Melds off | Melds on |
| --- | ---: | ---: |
| Median | 9.2 ms | 14.8 ms |
| 95th percentile | 13.3 ms | 20.1 ms |
| Largest search | 452 nodes | 1,209 nodes |
| Truncated | 0 | 0 |

- About 1 run in 400 takes 40 to 80 ms. These are pauses for garbage collection and compiling, not cost: the slowest (Dark Knight, cap 530, Critical Hit then Skill Speed, 78 ms) takes 19.5 ms when rerun alone.
- The searches above 1,000 nodes are healers at level 60 with the main stat as the target and Vitality as a tiebreak (many near-ties); the search itself takes 1.4 ms of the run.
- Building the candidate lists is most of a run: syncing, choosing melds, building the vectors and pruning take about 90%, the search under 10%.
- The very first run in a fresh process is the slowest: 75 to 79 ms on the largest pool (Paladin, melds on), then about 29, 24 and 20 ms as the code is compiled and the per-item caches fill.

**Hostile pools.** 3,000 random pools of real pieces with random stats (near-ties, cloaks, two-handed weapons, shields, up to 200 Unique rings), then 600 steps that mutate the worst pool to grow its search: median 186 nodes, largest 700 (4.5 ms). Without a speed range the bound of section 5 is exact (the slots left are independent, the ring pair and blocked slots are bounded exactly), so the search grows with the pool, not exponentially. With the engine's speed range, real full pools stayed below about 11,000 nodes; reaching the page's 700,000-node limit took a synthetic pool where every piece trades Critical Hit for speed, and stopped there after about 0.5 s. The speed tables of section 5 (2026-10-16) bring that pool down to a few dozen nodes.

**The page.** In Chromium, opened cold from a saved state on the Gear optimizer tab, at normal speed and with the CPU slowed 4 and 6 times (Chrome's slow-device emulation). Two fixes came out of the first run (2026-10-14), both leaving every result the same: the optimizer reads the store without Alpine's reactive proxies, and saving serialized the then large state (with its pool) only when the save ran. Rerun on 2026-10-15 after the pool step was dropped, against the previous build on the same machine, median of 3:

| Paladin, 2,534 pieces searched | Normal | 4× slower | 6× slower |
| --- | ---: | ---: | ---: |
| First run after opening the page | 54 ms | 242 ms | 423 ms |
| Later runs | 21 ms | 138 ms | 262 ms |
| Change to result shown, after the 120 ms wait | 43 ms | 253 ms | 500 ms |
| Page open to result | 0.7 s | 2.4 s | 4.0 s |
| Pick the job to result | 0.27 s | 1.1 s | 2.0 s |

Notes:
- **First run:** it now builds the job's gear (it used to be restored from the saved pool): 24, 136 and 302 ms before.
- **Later runs and changes:** within the noise of the previous build (23, 129, 208 ms; 56, 251, 413 ms).
- **Pick the job to result:** before, a job switch plus "Add all" took 1.1, 3.9 and 6.3 s to reach a result. Saving now takes at most 1 ms (before, up to 16 ms at 6× with a full pool).
- **Memory** stays flat over 100 changes (14.5 MB). What remains slow is outside the optimizer: opening the page (2 MB of page and item data).

### Target GCD sweep (2026-10-16)

The real engine on every job (23), 17 sync settings (none; caps 123 to 690; level sync at 50 to 90; five level and cap pairs; cap 795 is left out because it syncs nothing, so it repeats no sync), every substat but speed as the goal plus the main stat, no, one or two tiebreaks, six GCDs from the job's no-speed GCD (with its haste) down to the fastest its gear reaches, both modes, and food off and "Best for the goal". Pool: every piece the job can wear minus Savage, Ultimate and PvP; melds on; no node limit. Five workers on six cores, so the timings run high.

| Check | Runs | Result |
| --- | ---: | --- |
| Found a set | 252,112 | all |
| Same answer as the plain search | 26,471 | 0 mismatches |
| Same answer as the exhaustive search | 1,564 small pools | 0 mismatches |
| Truncated | 252,112 | none |

Notes:
- **Plain-search checks:** 5,043 more hit the plain search's 1,000,000-node limit and were not compared; the runs themselves finished.
- **Unreachable GCDs:** 123 of the small-pool checks asked a hasted job for a GCD it cannot have; every one was reported as unreachable.
- **"Or faster":** 38,495 runs came back faster than asked, as that mode allows.

Times, a new GCD for the same goal (the candidate lists reused, as on the page), before and after the tables for blocked slots:

| | Before | After |
| --- | ---: | ---: |
| Median | 3 ms | 5 ms |
| 95th percentile | 60 ms | 63 ms |
| 99th percentile | 243 ms | 125 ms |
| Slowest | 3,869 ms | 1,075 ms |
| Over 1 s | 339 | 1 |
| Over 0.45 s | 1,061 | 28 |

Notes:
- **Before:** every run over 1 s was a Spell Speed job (Black Mage 187, White Mage 136, Scholar 12, Sage 3, Summoner 1), exactly mode, with food.
- **The medians:** the after run went 1.5 times slower everywhere, Skill Speed jobs and first runs included, which the change does not touch. The machine was busier then (other work ran during it). Timed alone, interleaved in one process, the two searches take the same time on the quick benchmark's 1,314 Black Mage and Paladin runs (median 22.9 against 22.8 ms without melds, 29.0 against 29.4 with), and on the slowest Paladin and Red Mage cases.
- **The slowest after:** Black Mage at level 70, no sync, Direct Hit then Critical Hit, exactly 2.13 with food, 1,075 ms in the sweep; 100 ms when rerun alone (665 ms before).
- **First runs** (building the candidate lists): median 64 ms, 95th percentile 217 ms in the sweep. The slowest, 2,062 ms (Red Mage, level 90), takes 370 to 640 ms when rerun alone in a fresh process, the same with either search.
- **Same answers:** 252,041 of the 252,112 runs give the same GCD and meal. The other 71 tie on the goal and both tiebreaks; they differ in the total the meal adds, which only decides between meals of equal goal (section 9).

## 9. Known behaviours and limits

- **Empty pool:** the result is "ok" with no picks and all totals 0 (**verified** by test). The page shows its own message instead ("No gear to search") when the gear groups left out leave nothing.
- **Missing slot types** are left out of the loadout.
- **Truncated results** may not be optimal, so the page puts a note under them. No real or hostile pool comes near the page's limit of 700,000 (the largest is 1,209 nodes). Before the speed tables, only a speed range could reach it (section 5).
- **Ties:** among loadouts with exactly the same score, the first one found wins: higher-ranked items first, then pool order.
- **Meals of equal goal:** Target GCD picks the meal whose set scores most on the goal and tiebreaks, then the one that adds most in total. That last step uses whichever tied set each meal's search returned, so it is not the most any tied set could get with that meal (71 of 252,112 sweep runs changed meal when the search order changed; the goal and tiebreaks were the same).
- **A speed maximum never empties a slot.** If every candidate in a slot would break it, the result is "no feasible loadout", even though leaving that slot empty would satisfy it. For Target GCD this is the "none" answer.
- **Scores too large to rank exactly** raise an error instead of returning a possibly wrong answer (section 3). Real gear stays far below that point.
- **Model assumptions** carry over from the stat model: synced stats follow the clamp rule in [math.md](../mechanics/math.md) (verified against the Wiki's item level 475 caps); melds follow [materia.md](../mechanics/materia.md), with every meld assumed to succeed. Items in the pool use their real stats, so the empirical substat shares do not affect the optimizer.

## Where this lives

| Concept | File |
| --- | --- |
| Effective stats, item vectors, score weights, dominance pruning, candidate lists | `src/core/optimizer/candidates.js` (`effStats`, `makeScorer`, `pruneDominated`, `pruneForLimits`, `buildCandidates`) |
| Best melds of a piece; meld versions under a speed range | `src/core/meld.js` (`bestMeld`, `meldVersions`) |
| Bounds, limit tables, filters before the search and depth-first branch and bound | `src/core/optimizer/search.js` (`suffixBounds`, `limitTables`, `dropShortfalls`, `lagrangeBound`, `fixByReducedCost`, `branchAndBound`) |
| Pareto fronts (tier ranking's searches) | `src/core/optimizer/front.js` (`frontSearch`) |
| Entry points: candidates once, search many times | `src/core/optimizer/index.js` (`prepare`, `solve`, `optimize`) |
| Target GCD: GCD to speed band, meals, haste | `src/core/target-gcd.js` (`optimizeGcd`); `src/core/speed.js` (`speedForGcd`, `hasteFor`) |
| Which slots a job uses | `src/core/job-context.js` (`activeSlotTypes` in `makeJobContext`) |
| Sync clamp | `src/core/formulas.js` (`syncStats`) |
| Copies (Unique rings), pool items from the database | `src/core/items.js` (`poolItemFromRow`, `browseItems`) |
| Page use: the job's gear, gear groups, node limit, result | `src/ui/views/optimizer.js` (`jobGear`, `searchPool`, `searchCount`, `NODE_LIMIT`, `optimizerView`) |
| Page timing marks (`optimizer`, `save`) | `src/ui/components/optimizer.js`, `src/main.js` |
| Stress-test scripts | `scripts/perf/` (`bench.mjs`, `split.mjs`, `adversarial.mjs`, `browser.mjs`, `compare.mjs`, `memory.mjs`, `workloads.mjs`, `target-gcd-sweep.mjs`) |
| Tests | `tests/unit/optimizer.test.js`, `tests/unit/optimizer-exhaustive.test.js` (with the brute-force reference in `tests/unit/helpers/exhaustive.js`), `tests/unit/optimizer-constraints.test.js`, `tests/unit/target-gcd.test.js`, `tests/unit/target-gcd-exhaustive.test.js`, `tests/unit/stat-minimums.test.js` |
