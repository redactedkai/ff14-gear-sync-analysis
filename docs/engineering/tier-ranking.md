# Tier ranking

How the optimizer ranks gear sets by the **tiers** of the target and tiebreak stats instead of their raw totals (roadmap A7), and the three reductions that make those searches fast enough. In optimization terms: a preemptive (lexicographic) objective over step functions of the totals, solved as a sequence of multi-dimensional multiple-choice knapsack problems (MMKP) with minimums; each is reduced by bound-based variable fixing (the shortfall filter), Lagrangian reduced-cost fixing against a known feasible set, and a bounded Pareto-front dynamic program (Nemhauser–Ullmann with Morin–Marsten fathoming) that usually settles it without a search tree. Written for a reader versed in integer programming and knapsack methods but new to this code base and the game; notation follows [optimizer.md, section 2](optimizer.md#2-formal-statement).

Related pages: [optimizer.md](optimizer.md) (the model and the search this builds on), [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers) (tiers, speed and food), [materia.md](../mechanics/materia.md) (melds), [glossary.md](../glossary.md).

## 1. The problem

What does "rank by tiers" mean, and why is it a different objective from the plain optimizer's?

**Tiers.** A secondary stat's effect moves in steps. Critical Hit's rate is $5\% + \lfloor 200\, g / \text{div} \rfloor$ per mille, where $g$ is the gear's points of the stat (plus food) and $\text{div}$ a constant per character level (community reference: AkhMorning, matched by xivgear). Speed's effect is the GCD (the global cooldown, the time between most actions), which drops 0.01 s at a time. Main stat and Vitality have no useful steps here; every point counts.

![Critical Hit rate against its total at level 90, where div is 1,900 and one step is 9 or 10 points: 29.2% from 2,299, 29.3% from 2,309, 29.4% from 2,318, so every total from 2,309 to 2,317 gives 29.3% and the points between two steps do nothing. Tier ranking holds the stat at the tier's start plus one, 2,310, so that a one-point error in the model does not drop the tier.](../diagrams/tier-ranking-tiers.svg)

Write $\tau_d(T)$ for the tier of stat $d$ at total $T$, and $\text{start}_d(t)$ for its least total. Every $\tau_d$ is a **non-decreasing step function**: a floor of an increasing function, or for speed, a GCD that only shortens with more speed.

**Raw order versus tier order.** The plain optimizer ([optimizer.md, section 2](optimizer.md#2-formal-statement)) solves $\operatorname{lex\,max}\,(T_{k_0}, T_{k_1}, T_{k_2})$ over the target $k_0$ and tiebreaks $k_1, k_2$. Its target always lands in its best tier, but a tiebreak can end a few points under its next step while points sit unused above a step of the target. Tier ranking solves

$$
\operatorname{lex\,max}\ \bigl(\tau_{k_0}(T_{k_0}),\ \tau_{k_1}(T_{k_1}),\ \tau_{k_2}(T_{k_2}),\ T_{k_0},\ T_{k_1},\ T_{k_2}\bigr)
$$

over the same feasible set: first the best tier of each key in order, then the raw totals, so leftover points go to the target (the owner's decision, 2026-10-16, "order A"). Totals count food; speed's tier counts the job's haste and the 1.50 s GCD floor.

The step functions make the first three criteria non-linear in $x$, so the weighted-sum scalarization of [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number) does not apply to them directly. Section 2 turns them into linear minimums instead.

**Choices by the owner (2026-10-16).**

| Choice | Decision |
| --- | --- |
| Default | On, for now; a later comparison with raw ranking may change it |
| Leftover points | To the target (order A above) |
| Where a key is held | One point above its tier start, so a one-point model error does not drop the tier |
| Speed's tier | The GCD step |
| Tenacity's tier | Its mitigation step |

- **Speed:** the GCD step, not the finer step of damage-over-time ticks.
- **Tenacity:** its mitigation step ($\lfloor 200\, g / \text{div} \rfloor$), since players stack Tenacity for damage taken; the result table's Tier row still shows the damage step.

## 2. The stages

How is a lexicographic objective over step functions solved with a linear-objective engine? As a preemptive (goal-programming) sequence: one problem per key, each adding a minimum that fixes the previous key's optimal tier.

![Four searches for Dark Knight at level 90, item level 660, a GCD of exactly 2.30 with food: the most Critical Hit (2,310, held at 2,310 or more), the most Determination with that hold (1,288, held at 1,277 or more), the most Direct Hit with both holds (0), then the raw order under all three holds.](../diagrams/tier-ranking-stages.svg)

**The sequence.** Let $X$ be the feasible set of [optimizer.md, section 2](optimizer.md#2-formal-statement) (choice, conflict, copy and speed rows). For $q = 0, 1, 2$:

$$
(P_q)\qquad M_q = \max\ \bigl\{\, T_{k_q}(x) \;:\; x \in X,\ \ T_{k_r}(x) \ge h_r \ \text{ for } r < q \,\bigr\},
$$

with $t_q = \tau_{k_q}(M_q)$ and the **hold**

$$
h_q = \min\bigl(\text{start}_{k_q}(t_q) + 1,\ M_q\bigr).
$$

Last,

$$
(P_3)\qquad \operatorname{lex\,max}\ \bigl\{\, (T_{k_0}, T_{k_1}, T_{k_2})(x) \;:\; x \in X,\ \ T_{k_r}(x) \ge h_r \ \text{ for } r = 0, 1, 2 \,\bigr\},
$$

which is the plain optimizer under three extra minimum rows, scalarized as in [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number). Each $(P_q)$ is an MMKP: the plain model plus one covering row per earlier key.

**Why this is exact.** Since $\tau_d$ is non-decreasing, $\{x : \tau_d(T_d(x)) \ge t\} = \{x : T_d(x) \ge \text{start}_d(t)\}$, a single linear covering row. So the sets whose $k_0$ is in its best tier are exactly the feasible sets with $T_{k_0} \ge \text{start}(t_0)$; maximizing $T_{k_1}$ over them finds the best $\tau_{k_1}$ among them (monotonicity again), and so on by induction. This is the standard preemptive scheme (Ehrgott 2005, *Multicriteria Optimization*, Springer, on lexicographic optimization), with the optimal value of each stage turned into a minimum for the next. The "+ 1" narrows each set to the ones a point inside the tier; that is the owner's rule, not a relaxation.

**Food.** A meal adds $f(g) = \min(\text{max}, \lfloor p\,(b + g)/100 \rfloor)$ to a stat with $g$ gear points ([math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)). $g + f(g)$ is non-decreasing in $g$, so a hold on the total with food becomes a minimum on gear points: the least $g$ whose total reaches the hold (found by bisection). Each meal runs the stages on its own. After each stage only the meals that reach the best tier go on (the others lose on that tier whatever follows), and meals asking for the same problem share it.

**A Target GCD** turns into a band on gear speed per meal ([optimizer.md, section 2](optimizer.md#target-gcd-from-a-gcd-to-a-speed-range)), a capacity and a covering row present in every stage.

**Seeds (warm starts).** Each stage after the first starts from the previous stage's optimal set for that meal. That set is feasible for the next stage (each hold is at most what it reached), so it is an incumbent with score $\sigma^\star$ from the start: the next stage only has to find something strictly better, and if it stops early (its node limit) it still returns a feasible set. Sections 4.2 and 5 use $\sigma^\star$ for fixing and fathoming.

The worked example above, as the code runs it (Dark Knight, level 90, item level 660, exactly 2.30, every meal; measured 2026-10-16 on this machine, data `d9582a6`):

| Search | Limits (gear points) | Candidates | Kept after the filters | Settled by | Result (with food) |
| --- | --- | --- | --- | --- | --- |
| Most Critical Hit (one per meal band, 6) | speed band only | 1,358 | 1,210 | search, 10–17 nodes | 2,310 with Nachos |
| Most Determination | Critical Hit ≥ 2,159 | 2,975 | 78 | fronts | 1,288 |
| Most Direct Hit | and Determination ≥ 1,277 | 11,045 | 120 | fronts | 0 |
| Raw order | all three | 2,976 | 77 | fronts | 2,310 / 1,288 / 0 |

"Candidates" counts the variables $x_{s,i}$ after dominance reduction: every piece with each meld version worth keeping ([optimizer.md, section 6](optimizer.md#6-melds-in-the-search)); a version is a way to fill the piece's materia slots, and each is one item of its class.

## 3. Why the plain search struggles here

Why can the plain branch and bound not just solve each $(P_q)$?

The engine is a depth-first branch and bound over the 11 or 12 slot positions ([optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound)). Without limits its separable bound is exact, and searches end in a few hundred nodes. A stage of tier ranking adds tight limits: two or three stats each held within a few points of their maximum, and with a Target GCD a speed band about 60 to 85 points wide. Two things go wrong:

- **Many more candidates.** Dominance reduction ([optimizer.md, section 4](optimizer.md#4-fewer-candidates-dominance-pruning)) may drop a piece only for one at least as good on the score and every limited stat, and under a speed maximum only for one with the same speed. The full White Mage pool at level 100 keeps 19 to 26 candidates per slot in a plain search, 115 to 173 with a GCD band, and 770 to 1,570 in a tier stage with a band: about $10^{35}$ sets.
- **Weak bounds.** The engine's bound under minimums is the smallest of one exact DP table per limited stat ([optimizer.md, section 5](optimizer.md#with-minimums-on-other-stats)); each table keeps one limit row and drops the others, so each accepts sets that trade the other held stat, or the speed band, away. Joint infeasibility of the limit rows is only detected at complete assignments. In one White Mage stage the true best had Direct Hit 0, and proving that nothing reaches 1 took 1.2 million nodes.

The difficulty is the optimality proof, not finding the optimum: the seed is usually already optimal. Sections 4 and 5 replace most of that proof. All three techniques are exact: they only remove variables or partial solutions that provably cannot be part of a set better than the incumbent.

## 4. Before the search: filters

Which variables can be fixed to 0 before the search? Two fixing arguments, applied in turn: one from the minimum rows alone, one from a Lagrangian bound against the seed.

![The filters on the example's third search: 11,045 candidates, 137 after the shortfall filter (a budget of 5 points of Critical Hit), 120 after pruning against the set in hand from search 2; the shortfall filter runs again after each fixing until nothing more drops. Pareto fronts then settle it, the largest holding 6,958 partial sets (265 ms); past 150,000 entries in one front or 1,000,000 extensions in all, the branch and bound runs instead with the same set in hand and lists.](../diagrams/tier-ranking-filters.svg)

### 4.1 The shortfall filter

When can a single candidate never appear in a set meeting a minimum? When even the best of every other slot cannot make up for it. This is bound-based variable fixing on a covering row, the activity-bound argument of MIP presolve (Savelsbergh 1994, *ORSA Journal on Computing*, on preprocessing and probing).

**The rule.** For a stat $d$ with a minimum $m_d$, let $u_{d,s} = \max_i v_d(i)$ over the candidates of position $s$ (the most of $d$ any candidate adds there), and $U_d = \sum_s u_{d,s}$, the row's maximum activity. Every set has $T_d \le U_d$, and a set with $x_{s,i} = 1$ has

$$
T_d \;\le\; U_d - u_{d,s} + v_d(i).
$$

If that is below $m_d$, the row cannot hold with $x_{s,i} = 1$, so fix $x_{s,i} = 0$. Equivalently, the set may fall short of "the best in every slot" by at most the **budget** $U_d - m_d$ in total (the row's slack at maximum activity), and a candidate whose own shortfall $u_{d,s} - v_d(i)$ exceeds the budget is out.

**Why it matters here.** Holding a key one point above its tier start leaves a tiny budget: 5 points of Critical Hit in the example, 43 points of Piety for White Mage at level 100. Most meld versions spend a stone elsewhere and fall short by more than that, so the filter fixes most variables (11,045 candidates to 137 in the example). Fixing variables lowers the $u_{d,s}$, which can shrink the budget, so the filter repeats to a fixed point.

**The conflict and copy rows.** The maximum activities are the same separable bounds the search uses: a piece that leaves later slots empty (a two-handed weapon and the off-hand) is counted at its value minus those slots' bounds, and the two ring positions share one list, so a ring is bounded with the best ring as its partner.

This idea came from a research report the owner commissioned through Perplexity (2026-10-16), which also traces it to the normalization step of standard multiple-choice knapsack algorithms (Kellerer, Pferschy and Pisinger 2004, *Knapsack Problems*, Springer, MCKP chapter).

### 4.2 Pruning against the set in hand

Given the seed with score $\sigma^\star$, which candidates cannot be part of any strictly better feasible set? A Lagrangian bound answers this per candidate, by reduced-cost fixing.

**The relaxation.** Dualize every limit row: each minimum $T_d \ge m_d$ (the held keys, and a speed minimum) with multiplier $\lambda_d \ge 0$, and the speed maximum $T_{\text{spd}} \le M$ with $\mu \ge 0$. Each penalty term is $\ge 0$ on every feasible set, so for $x \in X$ meeting the limits,

$$
\sigma(x) \;\le\; L(x; \lambda, \mu) = \sigma(x) + \sum_d \lambda_d \bigl(T_d(x) - m_d\bigr) + \mu \bigl(M - T_{\text{spd}}(x)\bigr).
$$

The remaining subproblem keeps the choice rows (at most one item per position, empty allowed) and **drops** the copy and conflict rows, so it separates by position. With the **priced value** $a(i) = \sigma(i) + \sum_d \lambda_d v_d(i) - \mu\, v_{\text{spd}}(i)$ and $A_s = \max\bigl(0, \max_i a(i)\bigr)$ over the candidates of position $s$,

$$
L(\lambda, \mu) \;=\; \sum_s A_s - \sum_d \lambda_d m_d + \mu M .
$$

Any $\lambda, \mu \ge 0$ give a valid upper bound (weak duality); the Lagrangian dual $\min_{\lambda, \mu \ge 0} L$ gives the best one (Geoffrion 1974, *Mathematical Programming Study* 2; Fisher 1981, *Management Science*).

**The multipliers: projected subgradient with Polyak's step.** Starting from $\lambda = \mu = 0$, a subgradient $g$ of $L$ is the slack of each dualized row at the subproblem's maximizer $\hat{x}$: $g_d = T_d(\hat{x}) - m_d$ and $g_\mu = M - T_{\text{spd}}(\hat{x})$. The update is

$$
(\lambda, \mu) \leftarrow \max\Bigl(0,\ (\lambda, \mu) - \theta\, \frac{L(\lambda, \mu) - \sigma^\star}{\lVert g \rVert^2}\, g\Bigr),
$$

Polyak's step (Polyak 1969, *USSR Computational Mathematics and Mathematical Physics*) with the target value $\sigma^\star$, a lower bound on the dual optimum. $\theta$ starts at 1 and is halved after 15 steps without a lower $L$, the usual safeguard (Held, Wolfe and Crowder 1974, *Mathematical Programming*; Fisher 1981). It runs at most 300 steps, stops at a zero subgradient, and keeps the best multipliers found.

**Reduced-cost fixing.** Forcing $x_{s,i} = 1$ changes the subproblem only at position $s$, so it lowers $L$ by exactly the reduced cost $A_s - a(i)$. If

$$
L(\lambda, \mu) - \bigl(A_s - a(i)\bigr) \;\le\; \sigma^\star ,
$$

no feasible set with $x_{s,i} = 1$ beats the seed, and $x_{s,i}$ is fixed to 0 (the standard argument, as in Crowder, Johnson and Padberg 1983, *Operations Research*).

The same bound also fathoms nodes inside the branch and bound, with the multipliers fixed at the root.

Points to note:

- **Bad multipliers cannot make it wrong**, only weak. With every multiplier at 0 the bound is the plain separable score bound. A test that flipped the multipliers' signs got multipliers near 0 back from the descent and fixed 2 candidates instead of 6,743, with the same answers.
- **Rounding.** Multipliers are fractions, so the bound is a float. Every comparison keeps a margin far above the possible rounding error (scores stay below $2^{53}$).
- **Ties.** A set equal to $\sigma^\star$ has the same target and tiebreak totals (the score packs them exactly, [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number)), so fixing at "$\le \sigma^\star$" loses nothing.
- **Its limit.** The subproblem has the integrality property, so the dual bound equals the linear-programming relaxation's value (Geoffrion 1974; strictly, the LP relaxation of the model without its copy and conflict rows, since the subproblem drops them): it may mix fractions of two candidates to land exactly in the speed band, which no real set can. Re-optimizing the multipliers at every node therefore cut nothing (section 6); it is used for fixing, not as the search's main bound.

In the example the shortfall filter does most of the work (137 to 120 here), but on other cases reduced-cost fixing matters more: Black Mage at level 90, exactly 2.30, takes 2.8 s with it and 6.4 s without, Summoner 2.1 s and 6.1 s (measured 2026-10-16).

## 5. Pareto fronts

After fixing, each position holds about 10 to 100 candidates. Can the stage be solved without a tree? Yes, by the multi-criteria dynamic program over positions: keep, per stage, the nondominated partial solutions in (score, limited totals) space, fathom the ones that cannot beat the incumbent, and read the optimum off the last stage.

![A toy example with three slots and a minimum of 100 Determination: from the last slot back, the partial sets no other one beats are kept; the best set meeting the minimum, 95, is in the last front.](../diagrams/tier-ranking-fronts.svg)

**The recurrence.** Process the positions from the last to the first. Let $F_s$ be the front for positions $s, \dots, n$, with $F_{n+1} = \{\varnothing\}$ (score 0, all totals 0). Then

$$
F_s = \text{nondominated}\bigl(\{\, i + e \;:\; i \text{ a choice for position } s,\; e \in F_{s+1} \,\}\bigr),
$$

and the answer is the best entry of $F_1$ that meets every limit. This is Nemhauser and Ullmann's dynamic program for knapsack problems (1969, *Management Science*), with one criterion per limited stat instead of one weight.

**State dominance.** Entries $e$ and $f$ compare only when they leave the same positions empty, their pieces block the same positions and, under a speed maximum, they have the same speed. Then $e$ dominates $f$ when it has at least $f$'s score and at least $f$'s total of every other limited stat. Any completion of $f$ is also a completion of $e$, with no lower score and no broken limit, so $f$ can go. Two state truncations make far more entries comparable:

- **A total past its minimum counts as the minimum.** Once Determination reaches 1,277, more of it cannot matter to the row, so 1,280 and 1,300 compare as equal.
- **Speed past its minimum counts as the minimum when there is no maximum.** With a maximum (a band) speed stays exact, since more speed can break it.

**Fathoming (Morin and Marsten).** An entry whose score plus the most the earlier positions can add cannot beat $\sigma^\star$ goes, and so does one that cannot reach a minimum even with the most the earlier positions add of that stat. This is the bounding of Morin and Marsten (1976, *Operations Research*, "Branch-and-bound strategies for dynamic programming"); [optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound) uses the reverse, DP state dominance inside the branch and bound.

**The game's rules.** The two ring positions are one stage whose choices are the legal pairs (the same item twice only with 2 copies; one ring and an empty slot only when no pair exists), which enforces the copy rows exactly. Blocked positions are tracked per entry: a blockable position may be left empty, and a full set counts only if the positions it leaves empty are exactly the ones its pieces block, which enforces the conflict rows. These are the same rules as the search ([optimizer.md, section 2](optimizer.md#2-formal-statement)).

**Why this replaces the proof.** Branch and bound spends most of a tier stage proving that nothing beats the incumbent. With fronts the proof is built in: every full set is either in $F_1$ or was dropped for one at least as good on everything that matters, so the best feasible entry of $F_1$ is optimal.

**When it fails.** A front grows when a held stat has a wide budget: many partial totals sit below the minimum, where the truncation merges nothing. The Determination budget in the example's third search is 887 points, and its largest front holds 6,958 entries (265 ms). The fronts give up past 150,000 entries in one front or 1,000,000 extensions in all, and the branch and bound runs instead, still with the seed and the reduced lists.

What is specific here, beyond the classic method that Perplexity's report pointed to, is the truncation at the minimums and the game's slot rules.

## 6. What did not work

Recorded so that nobody tries them again without a new idea.

| Idea | Why it failed |
| --- | --- |
| Branching order by the held keys | Finding the optimum was never the problem; proving it was |
| A bound table on a weighted sum of the held stats | A surrogate row: a set can meet it while failing one limit |
| Re-optimizing the multipliers at every node | Never fathomed a node (the integrality gap, section 4.2) |
| A table on exact speed × the shortfall of a held stat | Exact, but fixing and fronts already capture it; cost time |
| Meet in the middle (enumerating the last positions' completions) | No consistent gain once the fronts existed |

Notes:

- **Weighted-sum table.** Like each single-stat table, it bounds an average of the limits (a surrogate relaxation), so it is no tighter on the joint infeasibility.
- **Per-node multipliers.** The Lagrangian bound mixes fractions of candidates to land in the speed band, so re-tuning it below the root gained nothing.

## 7. Correctness evidence

| Claim | Status | Evidence |
| --- | --- | --- |
| The stages give the lexicographic optimum of tiers then raw totals | **Verified** | Tests against a reference that enumerates every set and meal and applies the stage rule with its own tier and food formulas: two and three keys, main stat, food off, one meal and every meal, levels 50 and 100, Target GCD in both modes with haste |
| The shortfall filter, the pruning against the seed and the fronts change no result | **Verified** | A test on 120 tight cases (bigger pools, a minimum within 5 points of the most, a narrow speed band) against the plain search, which also checks that pieces were dropped and that fronts settled some searches; 2,000 more random cases by script |
| Minimums on any stat are exact in the search | **Verified** | Tests against the brute-force reference, with and without melds, with blocked slots and a speed band |
| The tests catch errors in these parts | **Verified** | Broken on purpose: pruning twice as aggressive, fronts comparing the score only, tier holds at the start instead of one above, Tenacity's damage step, no haste: each made a test fail |
| A seed that breaks a limit is ignored | **Verified** | A test |
| The tier formulas and food formula | **Community reference** / **inferred** | As in [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers) |

## 8. Performance

How long does a full tier ranking take, and how much did sections 4 and 5 save?

Every combat job, two goals each (Critical Hit > Determination > Direct Hit and the reverse order of the job's substats), level 100 with no sync and level 90 synced to item level 660, every meal; a Target GCD halfway between 2.50 s and the fastest the gear reaches. Node 22 on the owner's machine, 2026-10-16, data `d9582a6`.

| | No Target GCD (84 runs) | Target GCD "exactly", before sections 4 and 5 (70 runs) | Target GCD "exactly", now (70 runs) |
| --- | --- | --- | --- |
| Median | 174 ms | 3.2 s (level 90), 4.2 s (level 100) | 774 ms |
| Slowest tenth from | 236 ms | about 13 s | 1.9 s |
| Over 1.5 s | 0 | 54 | 9 |
| Over 5 s | 0 | 28 | 1 |
| Stopped at the node limit | 0 | 25 | 1 |
| Slowest | 395 ms | 15.7 s | 6.8 s |

The one search that still stops early is White Mage at level 100, exactly 2.32, Piety > Direct Hit > Determination (1.07 million nodes); the next slowest are White Mage, Astrologian, Black Mage, Scholar and Sage at 1.9 to 2.6 s. The 14 runs of the haste jobs are left out (section 9).

The remaining time is mostly building the candidate lists (meld versions and dominance reduction), which happens once per stage.

## 9. Known limits

- **Searches that stop early.** A few cases still reach the node limit; they return the seed or better, marked as possibly not the best, like any truncated result.
- **Haste jobs in the sweep.** Monk, Samurai, Ninja and Viper have a GCD below 2.50 s with no speed at all; the sweep's halfway GCD lands above it, so those runs end at once ("unreachable") and are left out of the timings.
- **The page.** Tier ranking is on by default and holds the page's thread while it solves (about 0.2 s without a Target GCD, up to a few seconds with one), so a progress bar shows meanwhile; the controls and readout are in [optimizer.md, section 7](optimizer.md#7-the-pages-pool-and-its-filters).

## Where this lives

| Concept | File |
| --- | --- |
| The stages, holds, meals and seeds | `src/core/tier-rank.js` (`rankByTier`) |
| Tier per stat for ranking, tier start | `src/core/tiers.js` (`rankTierOf`, `tierStart`) |
| A speed band per meal | `src/core/target-gcd.js` (`gearBand`) |
| Minimums on any stat, seeds | `src/core/optimizer/index.js` (`prepare`, `solve`) |
| Pruning with limits | `src/core/optimizer/candidates.js` (`pruneForLimits`) |
| Shortfall filter, Lagrangian bound, reduced-cost fixing, the search | `src/core/optimizer/search.js` (`dropShortfalls`, `lagrangeBound`, `fixByReducedCost`, `branchAndBound`) |
| Pareto fronts | `src/core/optimizer/front.js` (`frontSearch`) |
| The page: switch, readout, held marks, progress bar | `src/ui/views/optimizer.js` (`optimizerView`, `tierLists`), `src/ui/components/optimizer.js` (`solve`), `src/index.html` (`#o-by-tier`, `#o-held`, `#o-busy`) |
| Tests | `tests/unit/tier-rank.test.js`, `tests/unit/stat-minimums.test.js`; the page in `tests/unit/views.test.js` and `tests/e2e/smoke.mjs` (`checkRankByTier`) |
