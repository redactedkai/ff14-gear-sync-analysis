# Tier ranking

How the optimizer can rank gear sets by the **tiers** of the target and tiebreak stats instead of their raw totals (roadmap A7), and the reductions that make those searches fast enough. A tier is one step of a stat's effect; the points between two steps do nothing. Written for a reader versed in integer programming and knapsack methods but new to this code base and the game from section 2 on; notation follows [optimizer.md, section 2](optimizer.md#2-formal-statement).

Related pages: [optimizer.md](optimizer.md) (the model and the search this builds on), [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers) (tiers, speed and food), [materia.md](../mechanics/materia.md) (melds), [glossary.md](../glossary.md).

## Overview in plain words

What happens when the page ranks by tier (the "Spare points to tiebreaks" switch, on by default), step by step; each step's section has the details and the proof.

1. **What a tier is.** A secondary stat's effect moves in steps: Critical Hit's rate rises one step every 9 or 10 points at level 90, and speed's effect is the GCD (the time between most actions), which drops 0.01 s at a time. Points between two steps are wasted, so two gear sets are compared by the step they reach, not by raw points (section 1).
2. **One search per ranked stat.** The goal is a target stat and up to two tiebreaks, in order, with weapon damage ahead of them all. A first search finds the most of the target and so its best tier; a second finds the most of tiebreak 1, a third the most of tiebreak 2, and a last one ranks the raw totals so that leftover points go to the target (section 2).
3. **Each search holds the stats before it.** A search must keep every earlier stat one point above the start of the tier it reached, then maximizes its own stat. Each search also starts from the gear set the one before found, so it only has to find something better (section 2).
4. **Filters shrink the lists.** Before a search, every piece (and every way of filling its materia slots) that cannot be in a gear set meeting the holds and beating the gear set in hand is dropped: pieces too far below the best of their slot, pieces a bound prices out, and pieces the proofs of the earlier searches rule out. In the worked example 10,846 candidates become 68 (section 4).
5. **A short search, or fronts, finish it.** A trial search of at most 20,000 nodes settles most searches. When it does not, a dynamic program over the slots keeps only the partial gear sets no other beats (Pareto fronts); the plain branch and bound is the last resort (section 5).

**In optimization terms,** the objective is preemptive (lexicographic, [glossary](../glossary.md#project-terms)) over step functions of the totals. It is solved as a sequence of multi-dimensional multiple-choice knapsack problems (MMKP): "multiple-choice" because exactly one piece is taken per slot, "multi-dimensional" because several limits hold at once (a minimum on each held stat and the speed band), each with minimums. Each is reduced by bound-based variable fixing (the shortfall filter), by Lagrangian reduced-cost fixing against a known feasible gear set (a bound from relaxing the limits into the objective, which proves that a piece cannot be in a better gear set) and by valid inequalities from the earlier stages' proven optima (regain cuts), then settled by a short trial search or, failing that, a bounded Pareto-front dynamic program (Nemhauser–Ullmann with Morin–Marsten fathoming), with the branch and bound ([glossary](../glossary.md#project-terms)) as the last resort. How long it takes is in section 8.

**Other tools (2026-10-16).** None of the tools checked ranks gear by tiers across stats: xivgear and Etro show a stat's tier (points spare, points to the next), xivgear and ffxivcalc rank by a damage simulation, Ariyala's solver and the KaneTW solver by linear stat weights (KaneTW adds speed tiers only, behind a flag it warns is slow), and ffxiv-gearing by a Determination and Direct Hit expectation.

## 1. The problem

What does "rank by tiers" mean, and why is it a different objective from the plain optimizer's?

**Tiers.** A secondary stat's effect moves in steps. Critical Hit's rate is $5\% + \lfloor 200\, g / \text{div} \rfloor$ per mille, where $g$ is the gear's points of the stat (plus food) and $\text{div}$ a constant per character level (community reference: AkhMorning, matched by xivgear). Speed's effect is the GCD (the global cooldown, the time between most actions), which drops 0.01 s at a time. Main stat and Vitality have no useful steps here; every point counts.

![Critical Hit rate against its total at level 90, where div is 1,900 and one step is 9 or 10 points: 29.2% from 2,299, 29.3% from 2,309, 29.4% from 2,318, so every total from 2,309 to 2,317 gives 29.3% and the points between two steps do nothing. Tier ranking holds the stat at the tier's start plus one, 2,310, so that a one-point error in the model does not drop the tier.](../diagrams/tier-ranking-tiers.svg)

Write $\tau_d(T)$ for the tier of stat $d$ at total $T$, and $\text{start}_d(t)$ for its least total. Every $\tau_d$ is a **non-decreasing step function**: a floor of an increasing function, or for speed, a GCD that only shortens with more speed.

**Raw order versus tier order.** The plain optimizer ([optimizer.md, section 2](optimizer.md#2-formal-statement)) solves $\operatorname{lex\,max}\,(T_{k_0}, T_{k_1}, T_{k_2})$ over the target $k_0$ and tiebreaks $k_1, k_2$. Its target always lands in its best tier, but a tiebreak can end a few points under its next step while points sit unused above a step of the target. Tier ranking solves

$$
\operatorname{lex\,max}\ \bigl(\tau_{k_0}(T_{k_0}),\ \tau_{k_1}(T_{k_1}),\ \tau_{k_2}(T_{k_2}),\ T_{k_0},\ T_{k_1},\ T_{k_2}\bigr)
$$

over the same feasible set of gear sets: first the best tier of each key in order, then the raw totals, so leftover points go to the target (the owner's decision, "order A"). Totals count food; speed's tier counts the job's haste and the 1.50 s GCD floor.

The step functions make the first three criteria non-linear in $x$, so the weighted-sum scalarization of [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number) does not apply to them directly. Section 2 turns them into linear minimums instead.

**Choices by the owner.**

| Choice | Decision |
| --- | --- |
| Default | On; kept after a comparison with raw ranking |
| Tied gear sets | No tie rule yet (section 9) |
| Leftover points | To the target (order A above) |
| Where a key is held | One point above its tier start, so a one-point model error does not drop the tier |
| Speed's tier | The GCD step |
| Tenacity's tier | Its mitigation step |
| Weapon damage | Ranked before every key, held at its most (section 2) |

- **Speed:** the GCD step, not the finer step of damage-over-time ticks.
- **Tenacity:** its mitigation step ($\lfloor 200\, g / \text{div} \rfloor$), since players stack Tenacity for damage taken; the result table's Tier row still shows the damage step.

## 2. The stages

How is a lexicographic objective over step functions solved with a linear-objective engine? As a preemptive (goal-programming) sequence: one problem per key, each adding a minimum that fixes the previous key's optimal tier.

![Four searches for Dark Knight at level 90, cap 660, a GCD of exactly 2.30 with food: the most Critical Hit (2,310, held at 2,310 or more; it proves at most 2,164 gear points), the most Determination with that hold (1,288, held at 1,277 or more; proves at most 1,288), the most Direct Hit with both holds (0, proven), then the raw order under all three holds. Each proof becomes a regain cut in every later search. The first search is a full search of 12 nodes; the others start from the gear set before and end in a trial search of 764, 2,648 and 5,262 nodes.](../diagrams/tier-ranking-stages.svg)

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

**Why this is exact.** Since $\tau_d$ is non-decreasing, $\{x : \tau_d(T_d(x)) \ge t\} = \{x : T_d(x) \ge \text{start}_d(t)\}$, a single linear covering row. So the gear sets whose $k_0$ is in its best tier are exactly the feasible gear sets with $T_{k_0} \ge \text{start}(t_0)$; maximizing $T_{k_1}$ over them finds the best $\tau_{k_1}$ among them (monotonicity again), and so on by induction. This is the standard preemptive scheme (Ehrgott 2005, *Multicriteria Optimization*, Springer, on lexicographic optimization), with the optimal value of each stage turned into a minimum for the next. The "+ 1" narrows each gear set to the ones a point inside the tier; that is the owner's rule, not a relaxation.

**Food.** A meal adds $f(g) = \min(\text{max}, \lfloor p\,(b + g)/100 \rfloor)$ to a stat with $g$ gear points ([math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers)). $g + f(g)$ is non-decreasing in $g$, so a hold on the total with food becomes a minimum on gear points: the least $g$ whose total reaches the hold (found by bisection). Each meal runs the stages on its own. After each stage only the meals that reach the best tier go on (the others lose on that tier whatever follows), and meals asking for the same problem share it.

**Weapon damage first.** Every search ranks the weapon's weapon damage before the target ([optimizer.md, section 1](optimizer.md#1-the-problem); not for Blue Mage). Tier ranking runs it as one more stage before $(P_0)$: weapon damage has no tiers, so its stage finds the most, $M_{\text{wd}}$, and holds it there ($h_{\text{wd}} = M_{\text{wd}}$, no "+ 1"). The keys above then run under that hold, and the last stage ranks weapon damage first among the raw totals. A stage of its own keeps the regain cuts (section 4.4) valid: each later stage has every row of the one before. Weapon damage is not named in the "Ranked by tier" line; a note under the result says it comes first.

**A Target GCD** turns into a band on gear speed per meal ([optimizer.md, section 2](optimizer.md#target-gcd-from-a-gcd-to-a-speed-range)), a capacity and a covering row present in every stage.

**Seeds (warm starts).** Each stage after the first starts from the previous stage's optimal gear set for that meal. That gear set is feasible for the next stage (each hold is at most what it reached), so it is an incumbent with score $\sigma^\star$ from the start: the next stage only has to find something strictly better, and if it stops early (its node limit) it still returns a feasible gear set. Sections 4.2 and 5 use $\sigma^\star$ for fixing and fathoming.

**Proven maxima.** A stage that finishes (does not stop at its node limit) also proves $M_q$, the most of its key under its rows. Every later stage of the meal has those rows and more, so it gets $M_q$ as a cut (section 4.4).

The worked example above, as the code runs it (Dark Knight, level 90, cap 660, exactly 2.30, every meal, the page's pool without Savage, Ultimate and PvP gear; measured 2026-10-17, data `d9582a6`):

| Search | Limits (gear points) | Candidates | Kept after the filters | Settled by | Result (with food) |
| --- | --- | --- | --- | --- | --- |
| Most Critical Hit (one per meal band, 6) | speed band only | 1,192 | 1,192 | search, 12 nodes | 2,310 with Nachos |
| Most Determination | Critical Hit ≥ 2,159 | 2,935 | 74 | trial search, 764 nodes | 1,288 |
| Most Direct Hit | and Determination ≥ 1,277 | 10,846 | 68 | trial search, 2,648 nodes | 0 |
| Raw order | all three | 10,846 | 76 | trial search, 5,262 nodes | 2,310 / 1,288 / 0 |

"Candidates" counts the variables $x_{s,i}$ after dominance reduction: every piece with each meld version worth keeping ([optimizer.md, section 6](optimizer.md#6-melds-in-the-search)); a version is a way to fill the piece's materia slots, and each is one item of its class.

## 3. Why the plain search struggles here

Why can the plain branch and bound not just solve each $(P_q)$?

The engine is a depth-first branch and bound over the 11 or 12 slot positions ([optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound)). Without limits its separable bound is exact, and searches end in a few hundred nodes. A stage of tier ranking adds tight limits: two or three stats each held within a few points of their maximum, and with a Target GCD a speed band about 60 to 85 points wide. Two things go wrong:

- **Many more candidates.** Dominance reduction ([optimizer.md, section 4](optimizer.md#4-fewer-candidates-dominance-pruning)) may drop a piece only for one at least as good on the score and every limited stat, and under a speed maximum only for one with the same speed. The full White Mage pool at level 100 keeps 19 to 26 candidates per slot in a plain search, 115 to 173 with a GCD band, and 770 to 1,570 in a tier stage with a band: about $10^{35}$ gear sets.
- **Weak bounds.** The engine's bound under minimums is the smallest of one exact DP table per limited stat ([optimizer.md, section 5](optimizer.md#with-minimums-on-other-stats)); each table keeps one limit row and drops the others, so each accepts gear sets that trade the other held stat, or the speed band, away. Joint infeasibility of the limit rows is only detected at complete assignments. In one White Mage stage the true best had Direct Hit 0, and proving that nothing reaches 1 took 1.2 million nodes.

The difficulty is usually the optimality proof, not finding the optimum: the seed is usually already optimal. Not always: the seed is the best gear set for the previous key, and it can be far from the best for this one (section 4.3). Sections 4 and 5 replace most of that proof. Every technique there is exact: it only removes variables or partial solutions that provably cannot be part of a gear set better than the incumbent.

## 4. Before the search: filters

Which variables can be fixed to 0 before the search? Three arguments, applied in turn: one from the minimum rows alone, one from a Lagrangian bound against the seed, and one from what the earlier stages proved.

![The filters on the example's third search: 10,846 candidates, 133 after the shortfall filter (a budget of 5 points of Critical Hit), 117 after pruning against the gear set in hand from search 2, 68 after the regain cuts from searches 1 and 2 (room 5 points of Critical Hit and 11 of Determination); the shortfall filter runs again after each fixing until nothing more drops. A trial search of at most 20,000 nodes then settles it in 2,648 nodes; only if it does not finish do Pareto fronts run, and past 150,000 entries in one front or 1,000,000 extensions in all, the full branch and bound, with the same gear set in hand and lists.](../diagrams/tier-ranking-filters.svg)

### 4.1 The shortfall filter

When can a single candidate never appear in a gear set meeting a minimum? When even the best of every other slot cannot make up for it. This is bound-based variable fixing on a covering row, the activity-bound argument of MIP presolve (Savelsbergh 1994, *ORSA Journal on Computing*, on preprocessing and probing).

**The rule.** For a stat $d$ with a minimum $m_d$, let $u_{d,s} = \max_i v_d(i)$ over the candidates of position $s$ (the most of $d$ any candidate adds there), and $U_d = \sum_s u_{d,s}$, the row's maximum activity. Every gear set has $T_d \le U_d$, and a gear set with $x_{s,i} = 1$ has

$$
T_d \;\le\; U_d - u_{d,s} + v_d(i).
$$

If that is below $m_d$, the row cannot hold with $x_{s,i} = 1$, so fix $x_{s,i} = 0$. Equivalently, the gear set may fall short of "the best in every slot" by at most the **budget** $U_d - m_d$ in total (the row's slack at maximum activity), and a candidate whose own shortfall $u_{d,s} - v_d(i)$ exceeds the budget is out.

**Why it matters here.** Holding a key one point above its tier start leaves a tiny budget: 5 points of Critical Hit in the example, 43 points of Piety for White Mage at level 100. Most meld versions spend a stone elsewhere and fall short by more than that, so the filter fixes most variables (10,846 candidates to 133 in the example). Fixing variables lowers the $u_{d,s}$, which can shrink the budget, so the filter repeats to a fixed point.

**The conflict and copy rows.** The maximum activities are the same separable bounds the search uses: a piece that leaves later slots empty (a two-handed weapon and the off-hand) is counted at its value minus those slots' bounds, and the two ring positions share one list, so a ring is bounded with the best ring as its partner.

The same idea is the normalization step of standard multiple-choice knapsack algorithms (Kellerer, Pferschy and Pisinger 2004, *Knapsack Problems*, Springer, MCKP chapter).

### 4.2 Pruning against the gear set in hand

Given the seed with score $\sigma^\star$, which candidates cannot be part of any strictly better feasible gear set? A Lagrangian bound answers this per candidate, by reduced-cost fixing.

**The relaxation.** Dualize every limit row: each minimum $T_d \ge m_d$ (the held keys, and a speed minimum) with multiplier $\lambda_d \ge 0$, and the speed maximum $T_{\text{spd}} \le M$ with $\mu \ge 0$. Each penalty term is $\ge 0$ on every feasible gear set, so for $x \in X$ meeting the limits,

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

no feasible gear set with $x_{s,i} = 1$ beats the seed, and $x_{s,i}$ is fixed to 0 (the standard argument, as in Crowder, Johnson and Padberg 1983, *Operations Research*).

The same bound also fathoms nodes inside the branch and bound, with the multipliers fixed at the root.

Points to note:

- **Bad multipliers cannot make it wrong**, only weak. With every multiplier at 0 the bound is the plain separable score bound. A test that flipped the multipliers' signs got multipliers near 0 back from the descent and fixed 2 candidates instead of 6,743, with the same answers.
- **Rounding.** Multipliers are fractions, so the bound is a float. Every comparison keeps a margin far above the possible rounding error (scores stay below $2^{53}$).
- **Ties.** A gear set equal to $\sigma^\star$ has the same target and tiebreak totals (the score packs them exactly, [optimizer.md, section 3](optimizer.md#3-turning-the-lexicographic-order-into-one-number)), so fixing at "$\le \sigma^\star$" loses nothing.
- **Its limit.** The subproblem has the integrality property, so the dual bound equals the linear-programming relaxation's value (Geoffrion 1974; strictly, the LP relaxation of the model without its copy and conflict rows, since the subproblem drops them): it may mix fractions of two candidates to land exactly in the speed band, which no real gear set can. Re-optimizing the multipliers at every node therefore cut nothing (section 6); it is used for fixing, not as the search's main bound.

In the example the shortfall filter does most of the work (133 to 117 here), but on other cases reduced-cost fixing matters more: Black Mage at level 90, exactly 2.30, takes 2.8 s with it and 6.4 s without, Summoner 2.1 s and 6.1 s (measured 2026-10-16).

### 4.3 Improving the seed first

The fixing above is only as strong as $\sigma^\star$. The seed is the previous stage's optimum, chosen for another key, so it can be poor for this one. Before the Lagrangian step, a **1-opt local search** improves it: at each position, any candidate that keeps every limit, the copies and the blocked slots, and raises the score. The best such swap is made, and the passes repeat until none helps (`improveStart`).

- **Exact:** the result is still a legal gear set meeting every limit, and the search still looks for anything strictly better.
- **The case that showed it.** White Mage at level 100, exactly 2.32, Piety > Direct Hit > Determination, every meal. In the Determination stage (Prune Ponzecake), the seed had Determination 188 and the best has 710: the same gear set with the body and both rings swapped.
  - Without the swaps, the search ran 700,000 nodes without finding any better gear set, so the page showed 188 and held Determination's tier at 12 where 40 was possible.
  - It needed 812,472 nodes to finish. The Lagrangian gap was 885 points of Determination against the seed.
  - With the swaps, the seed starts at 710, the gap is 361 points, fixing keeps 330 of 2,268 candidates, and the search needs 7,397 nodes.

### 4.4 Regain cuts from the stages before

The hard stages are the last ones: the key is held near its most, the answer is often 0 or a few points, and the search must prove that nothing does better. The earlier stages already proved something about those gear sets: stage $q$ found $M_q$, the most of key $k_q$ under its rows. Can a later stage use that? Yes, as a valid inequality (a cut).

**The exchange argument.** Take any gear set $x$ feasible for a later stage $q' > q$ (or $P_3$). Its rows include stage $q$'s: the same speed rule, and holds on the same keys that are no lower. In each position, swap the chosen piece $i$ for a piece $j$ of the same position that

- leaves the same positions empty (so the conflict rows still hold);
- has the same speed under a band, or at least as much under a minimum only;
- has at least $i$'s value of every key stage $q$ held;
- for a ring: is another meld version of $i$, or a ring with 2 copies (so the two ring positions never hold one Unique ring twice).

Other positions each hold a different item, so any such swaps together give a legal gear set $x'$ that meets stage $q$'s rows. So $T_{k_q}(x') \le M_q$. With the **regain** $\rho_q(i)$ = the most of $k_q$ such a swap adds to piece $i$ (0 when none adds any),

$$
T_{k_q}(x) + \sum_s \rho_q(x_s) \;\le\; M_q, \qquad\text{and since } T_{k_q}(x) \ge h_q:\qquad \sum_s \rho_q(x_s) \;\le\; M_q - h_q .
$$

Every feasible set of the later stage meets this row, so adding it removes no feasible gear set. The room $M_q - h_q$ is the hold margin plus whatever the tier start leaves, usually less than one materia stone, so the row says: the gear set may put almost no stone, and no whole piece, against key $k_q$ where a swap could have put it back.

**In the search.** The regain is a column of a new knapsack row with a small capacity:

- a candidate whose own regain passes the room is fixed to 0;
- the row joins the search's limits as a maximum, with its own limit table (an exact DP on the row, [optimizer.md, section 5](optimizer.md#with-a-speed-range));
- it is computed after the other filters, on the few candidates left, with the full lists (and each piece's every meld version) as the pieces a swap may bring in.

Three details keep it exact:

- **Only finished stages.** A stage stopped at its node limit proves nothing; a wrong $M_q$ would cut good gear sets. Such a stage passes no cut.
- **The memo ignores the row.** Two partial gear sets with the same totals of the real rows have the same completions that meet those rows, and every such full gear set meets the cut, so the row's total stays out of the state key ([optimizer.md, section 5](optimizer.md#with-minimums-on-other-stats)).
- **The fronts ignore it too.** An entry is compared on the real rows only (section 5), for the same reason; entries past the room are dropped.

**Gain.** In the example's third search, the cuts from stages 1 and 2 (room 5 points of Critical Hit and 11 of Determination) keep 68 candidates of 117 and the trial search needs 2,648 nodes against 4,800 without them, in about the same time (120 against 106 ms: working out the regains costs what the nodes save). On the hardest stages the gain is far larger. With the other changes of 2026-10-17, White Mage at level 100, sync off, Direct Hit > Critical Hit > Determination, exactly 2.25, food off, went from 8.9 s and a stop at the node limit to 1.1 s and 1,118 nodes in all ([performance log, section 4.1](perf-log.md#41-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)). In the ablation of the solver review described below (each change switched off in turn, on a prototype), the cuts and the band-reach tables ([optimizer.md, section 5](optimizer.md#with-minimums-on-other-stats)) were what turned the healer stages that stopped at the node limit into finished proofs.

The idea and its proof came from a solver review the owner commissioned through Perplexity (2026-10-17). In integer-programming terms it is an exchange (swap) argument turned into a valid inequality; the review found no tighter bound that was cheap enough (section 6).

## 5. Pareto fronts

After fixing, each position holds about 10 to 100 candidates. Can the stage be solved without a tree? Yes, by the multi-criteria dynamic program over positions: keep, per stage, the nondominated partial solutions in (score, limited totals) space, fathom the ones that cannot beat the incumbent, and read the optimum off the last stage.

**A trial search first.** Building the fronts takes 0.1 to 1.4 s, often for a stage the branch and bound finishes in a few hundred nodes, and on the hard stages the fronts grew too large and were given up after that time was spent (the solver review's profile of the slow cases: 25 to 40% of their time). So the branch and bound runs first for at most 20,000 nodes. Only if it does not finish are fronts built, starting from the best gear set it found; most stages never build them (the example in section 2 builds none). Exact: the trial search is the same search with a lower node limit, and a stage it finishes is proven.

![A toy example with three slots and a minimum of 100 Determination: from the last slot back, the partial gear sets no other one beats are kept; the best gear set meeting the minimum, 95, is in the last front.](../diagrams/tier-ranking-fronts.svg)

**The recurrence.** Process the positions from the last to the first. Let $F_s$ be the front for positions $s, \dots, n$, with $F_{n+1} = \{\varnothing\}$ (score 0, all totals 0). Then

$$
F_s = \text{nondominated}\bigl(\{\, i + e \;:\; i \text{ a choice for position } s,\; e \in F_{s+1} \,\}\bigr),
$$

and the answer is the best entry of $F_1$ that meets every limit. This is Nemhauser and Ullmann's dynamic program for knapsack problems (1969, *Management Science*), with one criterion per limited stat instead of one weight.

**State dominance.** Entries $e$ and $f$ compare only when they leave the same positions empty, their pieces block the same positions and, under a speed band, they have the same speed. Then $e$ dominates $f$ when it has at least $f$'s score and at least $f$'s total of every other limited stat (at most, for a stat with a maximum only). Any completion of $f$ is also a completion of $e$, with no lower score and no broken limit, so $f$ can go. Two state truncations make far more entries comparable:

- **A total past its minimum counts as the minimum.** Once Determination reaches 1,277, more of it cannot matter to the row, so 1,280 and 1,300 compare as equal.
- **Speed past its minimum counts as the minimum when there is no maximum.** With a maximum (a band) speed stays exact, since more speed can break it.

Two more rules, for rows beyond the holds:

- **A regain cut (section 4.4) is not compared.** Entries past its room go, but two entries are compared on the real rows only: any completion of $f$ that meets the real rows is a completion of $e$ that meets them too, and a full gear set meeting the real rows always meets the cut.
- **A second band** (a maximum and a minimum on a stat other than speed) makes the fronts give up, and the search runs. Only speed has a band today; the rule keeps the dominance test right if another one is added.

**The filter.** The kept entries of a group are compared with each new one, best score first. With at most two compared totals (the usual case: one or two held keys under a speed band) the kept entries of a group reduce to a staircase, and one binary search per entry decides it (Kung, Luccio and Preparata 1975, *Journal of the ACM*, on the maxima of a set of vectors). With three or more, each kept entry is compared in turn.

**Fathoming (Morin and Marsten).** An entry whose score plus the most the earlier positions can add cannot beat $\sigma^\star$ goes, and so does one that cannot reach a minimum even with the most the earlier positions add of that stat. This is the bounding of Morin and Marsten (1976, *Operations Research*, "Branch-and-bound strategies for dynamic programming"); [optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound) uses the reverse, DP state dominance inside the branch and bound.

**The game's rules.** The two ring positions are one stage whose choices are the legal pairs (the same item twice only with 2 copies; one ring and an empty slot only when no pair exists), which enforces the copy rows exactly. Blocked positions are tracked per entry: a blockable position may be left empty, and a full gear set counts only if the positions it leaves empty are exactly the ones its pieces block, which enforces the conflict rows. These are the same rules as the search ([optimizer.md, section 2](optimizer.md#2-formal-statement)).

**Why this replaces the proof.** Branch and bound spends most of a tier stage proving that nothing beats the incumbent. With fronts the proof is built in: every full gear set is either in $F_1$ or was dropped for one at least as good on everything that matters, so the best feasible entry of $F_1$ is optimal.

**When it fails.** A front grows when a held stat has a wide budget: many partial totals sit below the minimum, where the truncation merges nothing. Measured 2026-10-16, when fronts settled the example's third search: its Determination budget was 887 points, and its largest front held 6,958 entries (265 ms). The fronts give up past 150,000 entries in one front, 1,000,000 extensions in all, or 30 million entry comparisons in the dominance filter in all, and the branch and bound runs instead, still with the seed and the reduced lists, from the top with its memo cleared (the trial search's memo holds states it never finished). Giving up never changes the answer, only who proves it.

- **Why the comparison limit.** Without the staircase, the filter compares each new entry with the kept ones of its group, so a large front costs its size squared. Black Mage at level 90, cap 660, 2.32 or faster, Critical Hit > Determination > Direct Hit, food off, spent 21 s in that loop before the front gave up on its size; the search after it took 25,359 nodes. With the limit the whole run takes 1.3 s. The limit applies only with three or more compared totals.
- **Ring pairs.** The ring stage gives up before building its pairs when they alone pass the extension limit. Building 2 million pairs (Direct Hit first, GCD 2.30 or 2.31, healers at level 100) overflowed the stack and showed an error on the page.

What is specific here, beyond the classic method above, is the truncation at the minimums and the game's slot rules.

## 6. What did not work

Recorded so that nobody tries them again without a new idea.

| Idea | Why it failed |
| --- | --- |
| Branching order by the held keys | Finding the optimum was never the problem; proving it was |
| A bound table on a weighted sum of the held stats | A surrogate row: a gear set can meet it while failing one limit |
| Re-optimizing the multipliers at every node | Never fathomed a node (the integrality gap, section 4.2) |
| A table on exact speed × the shortfall of a held stat | Exact, but fixing and fronts already capture it; cost time |
| Meet in the middle (enumerating the last positions' completions) | No consistent gain once the fronts existed |
| A score to beat without the tiebreaks | Same nodes (11.75 against 11.77 million) |
| Fronts for feasibility only | 716 million extensions at the third stage |
| A stage that looks only for the next tier | No gain on the slow cases; looser regain cuts (P) |
| A stage that maximizes its key alone | No gain; one healer stage stopped at the node limit again (P) |
| Proven maxima as plain maxima on the keys | No effect on the LP bound; unsafe with the old group bounds (P) |
| Regain filter only, without the sum row | No faster; one run stopped at the node limit (P) |
| Slot order by the lists before the filters | Slower than the old fixed order (P) |
| Two-row exact DP and surrogate DP bounds | Bounds of 72 to 1,330 where the answer is 0 (P) |

(P): tried on the prototype of the 2026-10-17 solver review; the measurements are the review's.

Notes:

- **Weighted-sum table.** Like each single-stat table, it bounds an average of the limits (a surrogate relaxation), so it is no tighter on the joint infeasibility.
- **Per-node multipliers.** The Lagrangian bound mixes fractions of candidates to land in the speed band, so re-tuning it below the root gained nothing.
- **Score to beat.** When a stage's seed is already its best (section 9), the search must show that no gear set has one more point of the target. Asking only that, with the tiebreaks out of the score, fathomed almost nothing more: the nodes that survive are the ones whose bounds cannot see the rows' joint infeasibility, not the ones kept alive by a tiebreak.
- **Feasibility fronts.** The same question as fronts with every score at 0, the target as a minimum, and every total capped at its minimum. On White Mage at level 100, exactly 2.31, the second stage already held 4,834 entries.

## 7. Correctness evidence

| Claim | Status | Evidence |
| --- | --- | --- |
| The stages give the lexicographic optimum of tiers then raw totals | **Verified** | Tests against a reference that enumerates every gear set and meal and applies the stage rule with its own tier and food formulas: two and three keys, main stat, food off, one meal and every meal, levels 50 and 100, Target GCD in both modes with haste |
| The shortfall filter, the pruning against the seed, the trial search and the fronts change no result | **Verified** | A test on 120 tight cases (bigger pools, a minimum within 5 points of the most, a narrow speed band) against the plain search, which also checks that pieces were dropped and that the trial search or fronts settled some searches; 2,000 more random cases by script |
| The fronts alone give the best gear set, for each way they compare entries | **Verified** | A test of the fronts without the trial search against the plain search: a band with one or two held stats (the staircase), a speed minimum with two (pairwise), a speed maximum alone (less is better) |
| The regain cuts remove no feasible gear set | **Verified** | A test against the brute-force reference on small real pools: the proof's maximum, the second search's totals, and every piece of the plain search's answer passing the cut with its regains summing to at most the room; 360 more random tier ranking cases against the reference (three keys with a Target GCD among them) |
| The regain cuts, trial search, slot order and band reach change no ranked result | **Verified** | Sweeps against the code before ([performance log, sections 4.1, 4.2 and 3.1](perf-log.md#41-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)): the same ranked totals and meal in all 5,028 cases (held tiers too, but for one the code before had cut short), and the same ranked totals in the 4,160 cases the 2026-10-18 sweep shares with it on every job. The 17,648-case sweep on every job ran the solver review's prototype, which gives the merged code's gear sets in all 5,028 cases; on the rest that is **inferred** |
| Minimums on any stat are exact in the search | **Verified** | Tests against the brute-force reference, with and without melds, with blocked slots and a speed band |
| The tests catch errors in these parts | **Verified** | Broken on purpose: pruning twice as aggressive, fronts comparing the score only, tier holds at the start instead of one above, Tenacity's damage step, no haste: each made a test fail. Also: a Unique ring allowed to swap for any ring, the regain ignoring the held keys, the fronts comparing a maximum-only total the wrong way, the staircase ignoring its second total |
| A seed that breaks a limit is ignored | **Verified** | A test |
| The tier formulas; the food formula | **Community reference** (tiers) / **verified** in a synced duty (food) | As in [math.md, section 6](../mechanics/math.md#6-speed-and-substat-tiers) |

**What tier ranking changes (2026-10-18 sweep, 1,560 cases where both rankings found a gear set: 13 sync settings, each with no Target GCD, exactly and or faster).** The two rankings return different gear sets in 709 cases (45%). In every one of them tier ranking reaches the same or more tiers of the goal (685 more, 24 the same), and raw ranking the same or more raw points (692 more), as the definitions require. On a simple damage estimate outside the tool (the tool has no damage model), neither ranking is better: tier ranking's gear set was ahead in 335 cases and behind in 289 (medians +0.21% and -0.29%), and behind in 57 of the 69 cases at level 100, cap 123. Tier ranking answers "the most tiers of the goal, in order", not "the most damage".

## 8. Performance

How long does a full tier ranking take today, and how much did sections 4 and 5 save? The dated runs, with their settings, are in the [performance log](perf-log.md); this section keeps the current table.

**Current timings (2026-10-18).** Tier ranking with the merged code (`ef9575a`, item data as of `cce7f34`, datamining commit `d9582a6`) on all 23 jobs: 13 sync settings, 12 to 14 goals per role, food off and the best meal, and no Target GCD or one of five GCDs, in both modes; the page's settings, a cold candidate cache per run, ten workers on the owner's machine with Node 22. 71,264 runs, settings in [performance log, section 3.1](perf-log.md#31-tier-ranking-the-merged-code-on-all-23-jobs).

| Runs | Median | 95th percentile | Slowest | Over 1.5 s |
| --- | --- | --- | --- | --- |
| All (71,264) | 361 ms | 1.34 s | 37.6 s | 2,670 |
| No Target GCD (6,984) | 235 ms | 419 ms | 1.06 s | 0 |
| Exactly (32,140) | 445 ms | 1.71 s | 28.1 s | 2,089 |
| Or faster (32,140) | 345 ms | 1.09 s | 37.6 s | 581 |

Not a committed script: the sweeps are one-off runs ([performance log](perf-log.md#1-how-to-read-this-log)); the plain search's timings are reproduced by `npm run perf` ([optimizer.md, section 8](optimizer.md#8-correctness-and-performance)).

**What sections 4 and 5 saved** (2026-10-16, Target GCD "exactly", 70 runs at level 100 and level 90, [performance log, section 5.2](perf-log.md#52-tier-ranking-the-filters-and-the-fronts)): median 3.2 s (level 90) and 4.2 s (level 100) before, 774 ms after; slowest 15.7 s before, 6.8 s after. The 2026-10-17 changes took the code before from a median of 0.69 s to 0.47 s in exactly mode ([section 4.1](perf-log.md#41-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)).

The remaining time is mostly building the candidate lists (meld versions and dominance reduction), which happens once per stage.

## 9. Known limits

- **Searches that stop early.** A few cases still reach the node limit; they return the seed or better, marked as possibly not the best, like any truncated result.
  - A stopped search can return a lower tier than the finished one. Black Mage at level 100, cap 400, Critical Hit > Determination > Direct Hit, food off, GCD 2.44: **or faster** stops at Direct Hit 16 (tier 3) after 761,301 nodes (7.8 to 9.4 s in three runs) and finishes at the same 16 with no node limit after 1,870,994 nodes (13.0 to 15.8 s); **exactly** stops at Direct Hit 12 (tier 2) after 1,231,055 nodes (7.2 to 7.8 s) and finishes at 16 (tier 3) after 3,549,357 nodes (17.1 to 17.7 s). **Verified** by running `rankByTier` on the page's pool, 2026-11-10, three timed runs each (the node counts are the same every run; the machine had other work running).
  - At the page's node limit, three timed runs each (2026-11-10, **verified**): White Mage, level 100, cap 123, Piety > Determination > Direct Hit, GCD 2.47 exactly, best meal: stops after 1,394,433 nodes (12.2 to 12.5 s) at the tiers the finished search reaches (1,575,392 nodes, 12.4 to 15.6 s). Machinist, level 100, cap 400, Determination > Critical Hit > Direct Hit, 2.40 or faster, food off: stops after 715,040 nodes (6.2 to 7.4 s) at the finished search's tiers (1,081,590 nodes, 6.7 to 8.2 s). Searches that finish with the same GCD settings: White Mage cap 123 at 2.46, 2.47 and 2.48 exactly, food off (19,355, 1,221,073 and 76,822 nodes, 0.3 to 7.8 s); Sage cap 123 at the same three (460, 162,062 and 327,762 nodes, 0.1 to 4.5 s); Dragoon, Samurai and Red Mage at cap 400, 2.40 or faster (6,980, 60 and 3,570 nodes, under 0.5 s).
  - In the 2026-10-18 sweep of every job ([performance log, section 3.1](perf-log.md#31-tier-ranking-the-merged-code-on-all-23-jobs)), 66 of 71,264, all at level 100: 46 at cap 400, mostly damage dealers with Determination or Critical Hit first, all food off; 8 at cap 123, White Mage and Sage with Piety > Determination > Direct Hit (the slowest runs, up to 38 s); 8 at 530; and the 4 cases at 690. Why item levels 400 and 123 are this hard is still unexplained (under investigation).
  - The rows that make "one more point of the target" impossible are three or four tight limits at once (the speed band and two held keys). Every bound here keeps or prices one row at a time, or relaxes integrality, so none sees it. The Lagrangian bound allows 213 points of Direct Hit in the White Mage case at level 100, exactly 2.31, Piety > Determination > Direct Hit, food off (which finishes at Direct Hit 12). The regain cuts see one earlier stage's row each, which is why they help, but not all of them together.
  - Open: a bound that sees the held rows, the band and the copy and conflict rows at once. The solver review measured a linear-programming relaxation with those rows at 17 points of Direct Hit on a Black Mage stage where the Lagrangian bound here allows 191; nothing of the kind is built.
- **Pinned pieces.** With pinned pieces (`fixed`, [optimizer.md, section 2](optimizer.md#the-game-rules-in-the-model)) every minimum, band and proven maximum is on the whole gear set, pinned points included, and a pinned meal is the only meal; the stages search the other slots. Checked against the reference with the same pins (`core-optimizer.pinned.test.js`, `tests/full/core-tier-rank.pinned.test.js`).
- **Tied gear sets.** Several gear sets can share the same ranked totals; the search returns the first it finds, so which one comes back depends on the search order (the slot order, [optimizer.md, section 9](optimizer.md#9-known-behaviours-and-limits)). They can differ in the stats that are not ranked. In the 17,648-case sweep ([performance log, section 4.2](perf-log.md#42-the-prototype-on-all-23-jobs)), where the code before and the prototype returned different tied gear sets, the expected damage per second differed by −2.8% to +2.9% in tier ranking and −1.5% to +1.9% in raw ranking. That estimate uses Character Panel Refined's expected damage per hit (**community reference**) divided by the GCD; it is not a simulation. There is no tie rule (**owner's decision**: the search may still change); options discussed were the most main stat then the least spare speed, or the tiers of the unranked substats.
- **Time per node.** Searches run about 5 to 12 µs a node, so the node limit bounds the time of the search part (about 4 to 8 s at 700,000). The limit is per search and a ranking runs several, so a ranking that stops takes longer: 9.9 to 37.6 s in the 2026-10-18 sweep. The fronts are bounded by their own limits (section 5); without the comparison limit, a front that gave up could take minutes first.
- **Haste jobs in the 2026-10-16 sweep.** Monk, Samurai, Ninja and Viper have a GCD below 2.50 s with no speed at all; that sweep's halfway GCD lands above it, so those runs end at once ("unreachable") and are left out of the timings.
- **The page.** Tier ranking is on by default and solves in the page's Web Worker, so the page stays free ([architecture.md, section 9](architecture.md#9-the-optimizers-worker)); a set page's Fill shows “Solving…” and Cancel while it runs (in the 2026-10-18 sweep: median 0.24 s and at most 1.1 s without a Target GCD; with one, median 0.35 to 0.45 s, 95th percentile 1.1 to 1.7 s, and up to 38 s in the slow spots above). The controls are in [ui.md, section 2](ui.md#spare-points-to-tiebreaks-rank-by-tier).

## Where this lives

| Concept | File |
| --- | --- |
| The stages, holds, meals and seeds; each stage's proven maximum | `src/core/tier-rank.js` (`rankByTier`, `provenMost`) |
| Tier per stat for ranking, tier start | `src/core/tiers.js` (`rankTierOf`, `tierStart`) |
| A speed band per meal | `src/core/target-gcd.js` (`gearBand`) |
| Minimums on any stat, seeds | `src/core/optimizer/index.js` (`prepare`, `solve`) |
| Pruning with limits; meld versions built once per ranking | `src/core/optimizer/candidates.js` (`pruneForLimits`, `itemVersions` with `versionCache`) |
| Shortfall filter, Lagrangian bound, reduced-cost fixing, slot order, trial search, the search | `src/core/optimizer/search.js` (`dropShortfalls`, `improveStart`, `lagrangeBound`, `fixByReducedCost`, `shortListsFirst`, all run by `prepareSearch`; `TRIAL_NODES`, `branchAndBound`) |
| Regain cuts | `src/core/optimizer/regain.js` (`addRegainCuts`) |
| Pareto fronts, the staircase dominance | `src/core/optimizer/front.js` (`frontSearch`, `paretoFilter`, `beatenOnStairs`) |
| The page: switch, Solving… and Cancel | `src/core/recipe.js` (`runRecipe`; the candidate lists kept in the solver session, `session.js`), `src/ui/views/fill-settings.js` (`fillRecipe`), `src/ui/views/solve.js` (`solveView`), `src/ui/components/set-page.js` (`fill`), `src/index.html` (`#s-by-tier`, `#sh-cancel`) |
| Tests | `tests/unit/core-tier-rank.test.js` (reference in `tests/unit/helpers/tier-reference.js`; 360 more cases in `tests/full/`, `npm run test:full`), `tests/unit/core-optimizer.stat-minimums.test.js`, `tests/unit/core-optimizer-regain.test.js`; the page in `tests/unit/ui-views-optimizer.test.js` and `tests/e2e/smoke.mjs` (`checkRankByTier`) |
