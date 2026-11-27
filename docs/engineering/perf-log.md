# Performance log

Every dated benchmark run of the gear optimizer, tier ranking and the page build, newest first, with the numbers as they were measured on the day.

The pages that describe the code ([optimizer.md](optimizer.md), [tier-ranking.md](tier-ranking.md), [data-pipeline.md](data-pipeline.md)) each keep one current table with its date and the command that reproduces it. The earlier runs and the comparisons between code versions are here.

A figure describes the code, data and machine of its date and is not re-run when the code changes, so two figures for the same thing can differ; section 1 says which one applies today.

Related pages: [optimizer.md, section 8](optimizer.md#8-correctness-and-performance) (current timings, the perf scripts and their budgets), [tier-ranking.md, section 8](tier-ranking.md#8-performance), [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page), [testing.md, section 3](testing.md#3-commands) (the commands), [glossary.md](../glossary.md).

## 1. How to read this log

Which number answers "how long does it take?", and what do the words in the tables mean?

**The setting.** Unless a run says otherwise: Node 22 (22.23.2 in the run of 2026-10-12) on the owner's Windows PC, and Chromium for the page. Timings depend on the PC and on what else runs; counts (nodes, runs, mismatches) do not. A run names its data (the datamining commit, for example `d9582a6`) where it is known.

**Words.**

- **Node:** one partly filled gear set the branch and bound looks at ([glossary](../glossary.md#project-terms)). A run that **stopped at the node limit** (truncated) may not be the best.
- **Median, 95th percentile:** over the runs of a table; "slowest tenth from" is the 90th percentile.
- **Melds off / on:** whether the best materia stones are chosen for each piece ([materia.md](../mechanics/materia.md)).
- **The quick benchmark** is `npm run perf` (Sage, Warrior, Paladin, Black Mage, Dancer and Samurai, 7,884 runs); a **sweep** is the engine run over a grid of jobs, sync settings and goals.
- **Exactly, or faster:** the two Target GCD modes ([optimizer.md, section 2](optimizer.md#target-gcd-from-a-gcd-to-a-speed-range)).
- **Prototype:** Perplexity's prototype of the 2026-10-17 tier ranking changes, swept beside the merged code (section 5).

**Figures that look like they conflict.** Each is right for its date; the log does not explain the differences between the two quick-benchmark runs.

| Question | Figures (date; section) | Which applies today |
| --- | --- | --- |
| Plain optimizer, quick benchmark, median, melds off / on | 22.4 / 34.6 ms (2026-10-15; 7.1); 12.7 / 19.0 ms (2026-10-17; 5.1) | The later run, 12.7 / 19.0 ms |
| Plain optimizer, every job's full pool, median, melds off / on | 9.2 / 14.8 ms (2026-10-14; 8.1) | Measured before the item level floor dropped to 15 (2026-10-15, section 7.1), which made every job's pool 21 to 33% larger; not repeated |
| Target GCD, a new GCD for the same goal, median / slowest | 3 ms / 3,869 ms before, 5 ms / 1,075 ms after the tables for blocked slots (2026-10-16; 6.1) | The after column |
| The page, Paladin, later runs | 21 ms (2026-10-15; 7.2) | Measured before the worker; the worker moved the search off the main thread (3.1) |
| Tier ranking with a Target GCD, "exactly", median | 774 ms (2026-10-16; 6.2); 0.47 s (2026-10-17, six jobs; 5.1); 445 ms (2026-10-18, all 23 jobs; 4.1) | The latest, 445 ms |

The sections run from the newest date to the oldest; each says which page it belongs to.

## 2. Runs of 2026-11-25 and 2026-11-10

### 2.1 The set page after an Auto-fill

The longest main-thread block after an Auto-fill on the set page, in Chromium (`npm run perf:browser --runs 2 --rates 1,4 --jobs PLD,SGE`, three alternating pairs of before and after builds). The cause was the page redrawing after an Auto-fill, not the search:

- The first piece shown built a lookup of all 20,031 item rows on the page's thread (about 25 ms at normal speed, 150 to 190 ms at 4x).
- Every Auto-fill built the table's `x-if` blocks again (153 blocks and about 690 elements in one task, 35 ms of it the view itself).

The fix kept each row's pin, source line and stat cells in the row and hid them while the row is empty (33 `x-if` blocks and about 316 elements). It also built each piece's facts when first asked for.

| Longest main-thread block | Before | After |
| --- | --- | --- |
| From the first Auto-fill on, normal speed, Paladin | 68 to 73 ms | 0 ms (no task over 50 ms) |
| From the first Auto-fill on, normal speed, Sage | 67 to 75 ms | 0 ms |
| From the first Auto-fill on, 4x CPU, Paladin | 370 to 404 ms | 344 to 444 ms |
| From the first Auto-fill on, 4x CPU, Sage | 366 to 402 ms (745 once) | 284 to 303 ms |
| The first Auto-fill's result task, 4x (trace, four runs each) | 381 to 746 ms | 264 to 287 ms |
| A later Auto-fill's result task, 4x (best of three) | 243 ms | 172 ms |

One "after" pass ran at 64% CPU load from other work and is left out.

- **Earlier figures, from the Alpine page** (menus built hidden on every row and `x-if` blocks, before the set page's menus became elements that draw only while open): such menus were about four fifths of a result's elements and most of the time to draw it, and the longest blocked main thread after a slow result went from about 90 to 25 ms, and from about 550 to 140 ms at 4x CPU throttle. A view frozen only at its top still had each row, and each cell read from a row, wrapped in a proxy by `x-for`; frozen all through (`deepFreeze`), none was. Building a row's pin, source line and stat cells with `x-if` made about 700 elements in one task for an Auto-fill that fills every empty row; kept in the row and hidden, about 300.

- Opening an empty set at 4x got slower (160 to 283 ms before, 213 to 333 ms after), because empty rows now carry the hidden parts.
- Opening a filled set is the same (about 310 to 390 ms).
- Discard at 4x went from about 145 to 170 ms.
- `npm run perf` counters did not change: 7,884 runs, the largest search 310 and 458 nodes, no truncated run.

### 2.2 The Gear browser's rows keyed by place

A click in the Gear browser removed the 50 rows and built 50 new ones, because the rows were keyed by the item. Keyed by their place on the page (`:key="rowPlace"` in `gear-page.html`) the 50 rows stay and only their bindings change.

- **Method:** Chromium at 1280 x 900, dark, Black Mage, level 50, item level 135 with sync on, 2,478 matches, 50 rows. Real mouse clicks, 5 fresh runs per click, the longest Event Timing entry of the click (what INP uses), the best of the 5 in ms (the browser rounds to 8 ms). Both pages (the build before the change and the build after) were measured back to back, twice. The second round ran on a quiet machine; the first ran while other sessions loaded it (about 1.5 times slower on both pages), so only the second is tabled.
- **Verified** (second round, best of 5 in ms):

| Click | 4x before | 4x after | 1x before | 1x after |
| --- | --- | --- | --- | --- |
| Slot pill (Weapon) | 624 | 400 | 96 | 64 |
| Slot pill (Head) | 648 | 344 | 96 | 56 |
| Sort by Item | 576 | 376 | 88 | 64 |
| Sort by item level | 664 | 400 | 88 | 64 |
| Page button (Next) | 664 | 416 | 96 | 72 |
| Page button (page 3) | 576 | 384 | 88 | 64 |
| Expansion box off | 640 | 416 | 96 | 72 |
| Expansion box on again | 400 | 368 | 56 | 64 |
| Job pick (Sage) | 632 | 504 | 104 | 80 |
| Job pick (Black Mage) | 592 | 424 | 96 | 72 |
| Gear categories All | 456 | 368 | 72 | 64 |

- The clicks that change few rows (a box back on, the sync switch, Reset filters) are about the same.
- **Wrong frame found and fixed:** a kept row showed the new item's name with the old item's HQ mark and x2 mark for one drawn frame, because Alpine's `x-show` shows and hides in the next animation frame. Both marks are now `:hidden` bindings; a frame recorder over 36 actions then saw no frame that the unkeyed page did not also draw ([architecture.md, section 3](architecture.md#3-the-ui-pattern)).

### 2.3 The Gear browser as one Lit element (run of 2026-11-25)

The Gear browser's screen moved from Alpine bindings to one Lit element (`<gsa-gear-browser>`, rows drawn with `map` by place and inside a `guard` on the view). The same clicks as in 2.2, measured with the same method on the page before and after the change, alternating, in one exclusive job: Chromium 1280 x 900, dark, Black Mage, level 50, item level 135 with sync on, 50 rows, real mouse clicks, 5 fresh runs per click, the longest Event Timing entry of the click, the best of the 5 in ms (the browser rounds to 8 ms). The last row is the Sheets to Gear browser switch (a click on the tab, until the rows are in the page and two frames are drawn). The set-up clicks (opening a menu) are not timed.

| Click | 4x before | 4x after | 1x before | 1x after |
| --- | --- | --- | --- | --- |
| Sort by Item | 400 | 224 | 80 | 40 |
| Sort by item level | 384 | 232 | 72 | 48 |
| Page button (Next) | 408 | 200 | 72 | 48 |
| Page button (page 3) | 400 | 184 | 72 | 40 |
| Slot pick (Weapon) | 376 | 184 | 64 | 40 |
| Slot pick (Head) | 336 | 184 | 64 | 32 |
| Slot pick (Any) | 416 | 208 | 72 | 48 |
| Expansion box off | 408 | 112 | 72 | 24 |
| Expansion box on again | 368 | 128 | 64 | 24 |
| Job pick (Sage) | 512 | 232 | 80 | 40 |
| Job pick (Black Mage) | 488 | 208 | 80 | 40 |
| Gear categories All | 400 | 200 | 64 | 40 |
| Sheets to Gear browser, to the rows drawn | 1,172 | 569 | 194 | 111 |

- Every click is faster, about half at 4x. The Expansion box went from about 400 to about 120 ms at 4x (the cause was not isolated).
- The click's own Event Timing entry for the screen switch is the same (48 and 40 ms at 4x): the screen draws in the tasks after the click.
- The run's other numbers, `npm run perf` and Auto-fill, are not touched by this change and were not run.
- **Earlier figures, from the Alpine page** (4x CPU throttle on a busy machine, so +-15%): switching from Sheets to the Gear browser blocked the main thread for about 1.6 s at best, with 4,060 elements and 373 templates. The first per-part templates took 1.6 to 1.8 s; one `x-html` string per row took 0.7 s. Fewer templates, `x-show` instead of `x-if`, frozen rows, `x-bind` objects, unkeyed or indexed `x-for` and unrolled cells did not change the time; only fewer bindings per cell did.

## 3. Runs of 2026-10-19

The page's searches moved into a Web Worker, and the inlined database was timed at page open.

### 3.1 The page with a Web Worker

Page timing for [optimizer.md](optimizer.md#8-correctness-and-performance).

Since 2026-10-19 the page's searches run in a Web Worker (audit 16 R8; [architecture.md, section 9](architecture.md#9-the-optimizers-worker)). Every result is the same: `npm run perf` gives the same node counts, truncations and answers in all 7,884 runs. Screenshots of every view at 1,440 and 960 px, light and dark, match the build before.

`npm run perf:browser -- --runs 2 --rates 1,4 --jobs PLD,SGE`, the build before and after run back to back on the same PC:

| | Paladin, before → after | Sage, before → after |
| --- | ---: | ---: |
| Main thread blocked, longest, from the first Optimize on (normal speed) | 164 → 0 ms | 273 → 0 ms |
| The same, 4× slower | 692 → 175 ms | 605 → 178 ms |
| Main thread blocked, longest, the page's opening included (normal speed) | 254 → 221 ms | 406 → 187 ms |
| Optimize to result shown, median (normal speed) | 163 → 116 ms | 139 → 101 ms |
| Page open to result, median (normal speed) | 885 → 693 ms | 1,103 → 620 ms |

- **What blocks the page now** is opening it (parsing the script and its data) and drawing a result, not the search. 0 ms means no task over 50 ms.
- **A long search.** Warrior at level 90, cap 123, Target GCD 2.47 or slower, Critical Hit then Determination, food, tier ranking, 4× slower: before, a 10 ms page timer stopped for 3.2 to 4.3 s. After, it stopped for 1.4 to 2.7 s, all of it after the reply came, while the result is drawn.
- **Drawing the result (2026-10-19).** The rows' menus are now built only while open, the view is frozen all through, and a stat cell has one span ([architecture.md, section 3](architecture.md#3-the-ui-pattern)). Longest blocked main thread after the reply, measured with CDP tracing (best runs):
  - The long search above (level 90, cap 123, Target GCD 2.47, food, tier ranking): about 90 → 25 ms at normal speed and 550 → 130 to 150 ms at 4× slower.
  - Sage at level 100 with the defaults: 31 → 18 ms, and 140 → 105 ms at 4×.
- **Opening a piece menu (Sage, head slot, 311 rows).** Drawing the first rows and the rest in steps ([architecture.md, section 3](architecture.md#3-the-ui-pattern)) showed the menu after about 36 ms instead of 149 ms at normal speed, with no task over 50 ms. Measured on a prototype of the stepped menu, not on the built page.
- **4× and 6× slower** are not a slow device's for the search itself: Chrome's CPU throttle slows the page's main thread, and the worker much less. So "Solved in" at those rates is lower than a slow device would show.
- **Sizes.** The page grows by the worker's code, about 83 kB; the data is not copied ([data-pipeline.md, section 8](data-pipeline.md#8-building-the-page)). The page's heap drops by 5 to 7 MB (Paladin 31.6 → 24.8 MB, Sage 29.8 → 24.8 MB), since the job's gear now lives in the worker's own heap, which `browser.ts` does not count.

### 3.2 The inlined database at page open

Build sizes and page-open timing for [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page), which also explains the `JSON.parse` loading. `scripts/perf/db-parse.ts` times Chromium from a mark just before the page's script to one just after; median of 7 runs, 2026-10-19, a 12-thread desktop.

| CPU | Item database as an object literal (before) | As `JSON.parse` (the page) | The page's whole script, before → after |
| --- | ---: | ---: | ---: |
| this machine | 75 ms | 58 ms | 200 → 157 ms |
| 4× slower | 488 ms | 290 ms | 775 → 643 ms |
| 6× slower | 647 ms | 469 ms | 1,439 → 1,011 ms |

- **Load:** the first two columns come from one run while another agent ran the optimizer bench, so they are higher and wider than on an idle machine (an idle run gave 76 and 49 ms at normal speed). The last column compares idle runs before and after the change.
- **The worker (2026-10-19).** The page's whole script, run back to back with the build before it, median of 7: 152 → 158 ms on this machine and 634 → 648 ms 4× slower (the 83 kB of worker code). The database as `JSON.parse` with its text exported: 54 to 57 ms, as before.

## 4. Runs of 2026-10-18

Tier ranking on every job with the merged code.

### 4.1 Tier ranking, the merged code on all 23 jobs

For [tier-ranking.md, section 8](tier-ranking.md#8-performance).

Raw and tier ranking, each run, on `dev` at `ef9575a`, with the item data as of code commit `cce7f34` (a commit of this repo; datamining commit `d9582a6`). The sweep covers:

- All 23 jobs.
- 13 sync settings within each job's level cap. Level 100 with no sync and item level caps 123, 290, 400, 530, 600 and 690; level 90 with no sync and cap 660; level 80 with cap 475, 70 with 345, 60 with 290, 50 with 123.
- 12 to 14 goals per role.
- Food off and the best meal.
- No Target GCD or one at 10%, 25%, 50%, 75% and 90% of the way from the GCD with no speed to the fastest the gear reaches, in both modes (Speed first runs without one).

That is 71,264 runs. The page's settings: the default Gear categories boxes left out, melds on, the page's node limit, a cold candidate cache per run. Ten workers on the owner's machine, Node 22; other work may have shared the machine.

| Runs | Median raw / tier | 95th percentile raw / tier | Slowest raw / tier | Over 1.5 s raw / tier |
| --- | --- | --- | --- | --- |
| All (71,264) | 135 ms / 361 ms | 400 ms / 1.34 s | 1.67 s / 37.6 s | 2 / 2,670 |
| No Target GCD (6,984) | 60 ms / 235 ms | 91 ms / 419 ms | 0.34 s / 1.06 s | 0 / 0 |
| Exactly (32,140) | 168 ms / 445 ms | 462 ms / 1.71 s | 1.67 s / 28.1 s | 1 / 2,089 |
| Or faster (32,140) | 131 ms / 345 ms | 353 ms / 1.09 s | 1.55 s / 37.6 s | 1 / 581 |

- **Tier against raw:** per run, tier ranking takes 2.85 times as long as raw ranking at the median, 5.2 times at the 95th percentile and 15.7 times at the 99th. It picks other ranked totals than raw ranking in 43.6% of runs, which is what it is for.
- **Stopped:** no raw ranking run stopped at the node limit and no run passed the sweep's 60 s limit. The tier ranking runs that did stop, counted by sync setting, are in [tier-ranking.md, section 9](tier-ranking.md#9-known-limits).
- **Slow spots:**
  - Level 100, cap 400 has a tier 95th percentile of 5.30 s and 297 runs over 5 s. Its 46 stops are all food off and 43 of them damage dealers (Determination > Critical Hit > Direct Hit 20, Critical Hit > Determination > Direct Hit 15, Critical Hit > Direct Hit > Determination 7).
  - Cap 123 at level 100 holds the slowest runs: healers, Piety > Determination > Direct Hit, GCD 2.46 to 2.48, 18 to 38 s (the 8 stops are White Mage and Sage; Scholar and Astrologian finish in 21 to 25 s).
  - Cap 530 at level 100 has a 95th percentile of 2.90 s.
  - The other ten settings stay at or under 2.15 s.
- **Against `582568f`:** the 4,160 runs this sweep shares with a sweep of the code before (2026-10-16; six sync settings, GCD points 25%, 50% and 75%) give the same ranked totals in all. Tier ranking's 95th percentile fell from 1.77 s to 1.26 s and runs over 1.5 s from 265 to 92, but its median rose from 303 to 357 ms (215 to 274 ms without a Target GCD).
- **The rise in the medians:** why they rose is **not checked**. Machine load is a possible cause (**assumed**): that sweep ran 5 workers, this one 10 with a raw ranking beside each run.

## 5. Runs of 2026-10-17

Tier ranking after the regain cuts, the trial search, the slot order and the band-reach tables; the prototype of those changes on every job.

### 5.1 Tier ranking after the regain cuts, the trial search, the slot order and band reach

For [tier-ranking.md, sections 4.4 and 5](tier-ranking.md#44-regain-cuts-from-the-stages-before).

A sweep of six jobs (White Mage, Sage, Black Mage, Paladin, Monk, Dancer), six settings (level 100 with no sync and synced to 690, 90 to 660, 80 to 475, 70 to 345, 50 to 123), 10 to 13 goals per role. Food: off and every meal. Target GCD: none, or one at a quarter, half and three quarters of the way from the GCD with no speed to the fastest the gear reaches, in both modes. That is 5,028 cases, each ranked both ways, on the page's pool.

Eight workers on the owner's machine, Node 22, data `d9582a6`. "Before" is the code at `582568f`, "prototype" is Perplexity's prototype of these changes, and "merged" is the code that went into `dev`. All three were swept on the same machine the same day. Other work may have shared the machine in any run.

| Tier ranking (runs) | Median | 95th percentile | Slowest | Over 1.5 s | Over 5 s | Stopped at the node limit |
| --- | --- | --- | --- | --- | --- | --- |
| No Target GCD (780), before | 0.30 s | 0.59 s | 2.5 s | 1 | 0 | 0 |
| No Target GCD (780), prototype | 0.16 s | 0.35 s | 0.7 s | 0 | 0 | 0 |
| No Target GCD (780), merged | 0.23 s | 0.44 s | 0.6 s | 0 | 0 | 0 |
| Exactly (2,124), before | 0.69 s | 5.9 s | 37 s | 445 | 132 | 35 |
| Exactly (2,124), prototype | 0.32 s | 1.1 s | 15 s | 67 | 8 | 2 |
| Exactly (2,124), merged | 0.47 s | 1.5 s | 18 s | 105 | 10 | 2 |
| Or faster (2,124), before | 0.53 s | 3.0 s | 23 s | 323 | 52 | 25 |
| Or faster (2,124), prototype | 0.23 s | 0.64 s | 13 s | 15 | 4 | 2 |
| Or faster (2,124), merged | 0.34 s | 1.0 s | 17 s | 18 | 8 | 2 |

- **The prototype is faster than the merged code**, though they give the same sets (below). Raw ranking shows the same gap with a Target GCD (median 0.10 s in the prototype against 0.19 s merged in exactly mode, 0.05 s against 0.13 s in or faster mode; 0.05 s for both without one), which points outside the tier search.
- **Why the gap:** **Verified** (2026-10-18, 288 of these runs timed one at a time, every version on every run): the prototype keeps meld versions in a cache across runs, keyed by the sync settings, while the merged code builds them once per ranking.
  - In a sweep that cache explains all of raw ranking's gap and 70–80% of tier ranking's.
  - With a new sync object per run, as the page makes, the prototype is within 5% of the merged code (that last 5% is not explained).
  - The page builds new sync settings on every render, so the prototype's cache would not carry across renders there.
- **In all:** the merged code's tier ranking took 2,671 s against 5,710 s before (the prototype: 1,904 s). Raw ranking (with a Target GCD it uses the same search, with no stage proofs) is about the same: slowest 1.0 s against 1.8 s, medians within 0.02 s.
- **Same answers:** in every case both rankings give the same totals of the ranked keys and the same meal.
  - The held tiers are the same in all but one, where the code before had stopped at the node limit in a stage and held Critical Hit one tier lower. The case is Paladin, level 100, cap 690, Determination > Direct Hit > Critical Hit, exactly 2.30, food off; the final totals are the same.
  - Other pieces with the same score came back in 1,802 tier and 984 raw cases (the search now visits sets in another order, which decides which of several tied sets it finds first).
  - The merged code and the prototype give the same sets and meals in all 5,028 cases, in both rankings.
- **Still stopped at the node limit:** 4, White Mage and Sage at level 100, cap 690, Piety > Critical Hit > Determination, GCD 2.29 ([tier-ranking.md, section 9](tier-ranking.md#9-known-limits)); all 4 stopped before too.

Slow cases, one at a time on an idle machine, before (the code at `b923b1d`) and after:

| Case | Before | After |
| --- | --- | --- |
| BLM 90, cap 660, exactly 2.32, Crit > Det > DH, no food | 6.7 s | 2.1 s |
| WAR 100, no sync, exactly 2.33, DH > Crit > Det, food | 15.5 s, truncated | 1.7 s |
| WHM 100, no sync, exactly 2.25, DH > Crit > Det, no food | 8.9 s, truncated | 1.1 s |
| WHM 100, cap 690, exactly 2.29, Piety > Crit > Det, no food | 7.3 s, truncated | 5.8 s |
| WHM 100, cap 690, exactly 2.29, Piety > Crit > Det, food | 8.0 s, truncated | 6.9 s, truncated |
| WHM 100, cap 690, exactly 2.29, Piety > Det > DH, food | 7.5 s, truncated | 5.6 s |
| SGE 100, cap 690, 2.29 or faster, Piety > Crit > Det, no food | 4.9 s, truncated | 6.2 s, truncated |
| WHM 100, cap 690, exactly 2.36, Piety > Crit > Det, food | 5.5 s, truncated | 4.1 s |
| SCH 100, cap 690, exactly 2.36, Piety > Crit > Det, food | 4.7 s, truncated | 2.5 s |

The worked example of [tier-ranking.md, section 2](tier-ranking.md#2-the-stages) takes 1.0 s in all. The quick benchmark of the plain optimizer (`npm run perf`, no limits, so no proofs or trial search) is unchanged: median 19.0 ms with melds and 12.7 ms without, against 18.8 and 12.8. Its largest searches fell from 555 to 458 nodes with melds and 380 to 310 without (the slot order).

### 5.2 The prototype on all 23 jobs

**The prototype on all 23 jobs (2026-10-17).** Before the merge, Perplexity's prototype was swept against the code before it on every job: six sync settings, 10 to 12 goals per role, food off and every meal. Target GCD: none, or one at a quarter, half and three quarters of the way from the slowest GCD to the fastest, in both modes.

That is 17,648 cases, eight workers. The times below are the prototype's, not the merged code's: the two give the same sets (above), but the merged code is slower (the table in [section 5.1](#51-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach)). The merged code's times on every job are in [section 4.1](#41-tier-ranking-the-merged-code-on-all-23-jobs).

| Tier ranking with a Target GCD | Median | 95th percentile | Slowest | Over 1.5 s |
| --- | --- | --- | --- | --- |
| Exactly, before | 0.60 s | 3.9 s | 44.2 s | 1,201 |
| Exactly, prototype | 0.30 s | 0.97 s | 15.2 s | 155 |
| Or faster, before | 0.49 s | 2.3 s | 24.2 s | 836 |
| Or faster, prototype | 0.21 s | 0.61 s | 12.7 s | 34 |

- **Speed:** with a Target GCD, the prototype's tier ranking ran 2 to 4 times faster than the code before (about twice at the median, about four times at the 95th percentile). Exactly mode over 5 s: 252 runs before, 8 in the prototype. The whole sweep took 930 s against 2,333 s.
- **Same answers:** the prototype gives the same ranked totals as the code before in all 17,648 cases, in both rankings. That the merged code does too is **inferred** (strongly supported: it gives the prototype's sets in all 5,028 cases of [section 5.1](#51-tier-ranking-after-the-regain-cuts-the-trial-search-the-slot-order-and-band-reach), and the code before's ranked totals in the 4,160 cases of [section 4.1](#41-tier-ranking-the-merged-code-on-all-23-jobs)).
- **Stopped at the node limit:** 138 tier ranking runs before, 4 in the prototype. The 4 are the White Mage and Sage cases at 2.29 of [tier-ranking.md, section 9](tier-ranking.md#9-known-limits) (9.5 to 15.2 s); they stopped before too, with the same ranked totals.
- **Tied sets:** 905 tier and 529 raw cases returned another set with the same ranked totals ([tier-ranking.md, section 9](tier-ranking.md#9-known-limits)).

## 6. Runs of 2026-10-16

The Target GCD sweep of the plain optimizer, and the first tier ranking sweeps.

### 6.1 Target GCD sweep

For [optimizer.md, section 8](optimizer.md#8-correctness-and-performance).

The real engine on every job (23), with:

- 17 sync settings (none; caps 123 to 690; level sync at 50 to 90; five level and cap pairs; cap 795 is left out because it syncs nothing, so it repeats no sync).
- Every substat but speed as the goal plus the main stat, with no, one or two tiebreaks.
- Six GCDs from the job's no-speed GCD (with its haste) down to the fastest its gear reaches, in both modes.
- Food off and "Best for the goal".

Pool: every piece the job can wear minus Savage, Ultimate and PvP; melds on; no node limit. Five workers on six cores, so the timings run high.

| Check | Runs | Result |
| --- | ---: | --- |
| Found a set | 252,112 | all |
| Same answer as the plain search | 26,471 | 0 mismatches |
| Same answer as the exhaustive search | 1,564 small pools | 0 mismatches |
| Truncated | 252,112 | none |

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

- **Before:** every run over 1 s was a Spell Speed job (Black Mage 187, White Mage 136, Scholar 12, Sage 3, Summoner 1), exactly mode, with food.
- **The medians:** the after run went 1.5 times slower everywhere, Skill Speed jobs and first runs included, which the change does not touch. The machine was busier then (other work ran during it).
- **Timed alone**, interleaved in one process, the two searches take the same time on the quick benchmark's 1,314 Black Mage and Paladin runs (median 22.9 against 22.8 ms without melds, 29.0 against 29.4 with), and on the slowest Paladin and Red Mage cases.
- **The slowest after:** Black Mage at level 70, no sync, Direct Hit then Critical Hit, exactly 2.13 with food, 1,075 ms in the sweep; 100 ms when rerun alone (665 ms before).
- **First runs** (building the candidate lists): median 64 ms, 95th percentile 217 ms in the sweep. The slowest, 2,062 ms (Red Mage, level 90), takes 370 to 640 ms when rerun alone in a fresh process, the same with either search.
- **Same answers:** 252,041 of the 252,112 runs give the same GCD and meal. The other 71 tie on the goal and both tiebreaks; they differ in the total the meal adds, which only decides between meals of equal goal ([optimizer.md, section 9](optimizer.md#9-known-behaviours-and-limits)).

### 6.2 Tier ranking: the filters and the fronts

For [tier-ranking.md, sections 4 and 5](tier-ranking.md#4-before-the-search-filters).

Every combat job, two goals each: Critical Hit > Determination > Direct Hit and the reverse order of the job's substats. Level 100 with no sync and level 90 synced to item level 660, every meal; a Target GCD halfway between 2.50 s and the fastest the gear reaches. Node 22 on the owner's machine, 2026-10-16, data `d9582a6`.

| | No Target GCD (84 runs) | Target GCD "exactly", before tier-ranking.md sections 4 and 5 (70 runs) | Target GCD "exactly", after them (70 runs) |
| --- | --- | --- | --- |
| Median | 174 ms | 3.2 s (level 90), 4.2 s (level 100) | 774 ms |
| Slowest tenth from | 236 ms | about 13 s | 1.9 s |
| Over 1.5 s | 0 | 54 | 9 |
| Over 5 s | 0 | 28 | 1 |
| Stopped at the node limit | 0 | 25 | 1 |
| Slowest | 395 ms | 15.7 s | 6.8 s |

The one search that stopped early was White Mage at level 100, exactly 2.32, Piety > Direct Hit > Determination (1.07 million nodes); the next slowest are White Mage, Astrologian, Black Mage, Scholar and Sage at 1.9 to 2.6 s. The 14 runs of the haste jobs are left out ([tier-ranking.md, section 9](tier-ranking.md#9-known-limits)).

**After the seed swaps, the memo dominance and the comparison limit** ([tier-ranking.md, sections 4.3](tier-ranking.md#43-improving-the-seed-first) and [5](tier-ranking.md#5-pareto-fronts); [optimizer.md, section 5](optimizer.md#with-minimums-on-other-stats)). The same sweep, run side by side with the code before so both saw the same load (2026-10-16):

- Target GCD median 691 → 728 ms, slowest tenth from 1,973 → 1,781 ms, over 1.5 s 10 → 9, slowest 7.2 → 4.0 s, stopped at the node limit 1 → 0.
- The White Mage case now ends at 199,759 nodes with Determination 801 with food (240 before, truncated); alone it takes 2.7 s against 6.0 s.
- Every run that ended before gives the same answer.

Some slow cases from a wider comparison (one run at a time, page pool):

| Case | Before | After |
| --- | --- | --- |
| BLM 90, cap 660, 2.32 or faster, Crit > DH > Det, food | 87 s | 1.6 s |
| BLM 90, cap 660, 2.32 or faster, Crit > Det > DH, no food | 21 s | 1.3 s |
| SGE 100, cap 690, 2.36 or faster, Piety > Crit > Det, food | over 180 s | 5.0 s, truncated |
| WHM 100, exactly 2.32, Piety > DH > Det, no food | 4.6 s | 1.6 s |

The Black Mage and Sage times came from the fronts' dominance filter, not from nodes: 266,179 nodes took 108 s in one search.

## 7. Runs of 2026-10-15

The database floor dropped from item level 100 to 15; the page was timed again.

### 7.1 Item level floor 15

For [optimizer.md, section 8](optimizer.md#8-correctness-and-performance). Lowering the database floor from item level 100 to 15 made every job's pool 21 to 33% larger. The quick benchmark (`npm run perf`: SGE, WAR, PLD, BLM, DNC, SAM, 7,884 runs), run on the same PC on the last commit before the change and after it, one run each with nothing else running:

| | Before | After |
| --- | ---: | ---: |
| Melds off, median / 95th percentile | 17.8 / 29.1 ms | 22.4 / 36.4 ms |
| Melds on, median / 95th percentile | 28.0 / 42.6 ms | 34.6 / 52.4 ms |
| Largest search (melds on / off) | 702 / 377 nodes | 555 / 380 nodes |

The time grows with the pool (each piece is scored and pruned before the search); the searches are no larger. Both runs miss the script's budgets on this PC, which were set on an earlier, smaller workload. The owner accepted the slowdown (accuracy first). Without the bound for blocking pieces in [optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound), level sync below 50 hit the node limit.

### 7.2 The page

For [optimizer.md, section 8](optimizer.md#8-correctness-and-performance). The first run was on 2026-10-14; the table is the rerun of 2026-10-15.

In Chromium, opened cold from a saved state on the Gear optimizer tab, at normal speed and with the CPU slowed 4 and 6 times (Chrome's slow-device emulation). Two fixes came out of the first run (2026-10-14), both leaving every result the same: the optimizer reads the store without Alpine's reactive proxies, and saving serialized the then large state (with its pool) only when the save ran. Rerun on 2026-10-15 after the pool step was dropped, against the previous build on the same machine, median of 3:

| Paladin, 2,534 pieces searched | Normal | 4× slower | 6× slower |
| --- | ---: | ---: | ---: |
| First run after opening the page | 54 ms | 242 ms | 423 ms |
| Later runs | 21 ms | 138 ms | 262 ms |
| Change to result shown, after the 120 ms wait | 43 ms | 253 ms | 500 ms |
| Page open to result | 0.7 s | 2.4 s | 4.0 s |
| Pick the job to result | 0.27 s | 1.1 s | 2.0 s |

- **First run:** it now builds the job's gear (it used to be restored from the saved pool): 24, 136 and 302 ms before.
- **Later runs and changes:** within the noise of the previous build (23, 129, 208 ms; 56, 251, 413 ms).
- **Pick the job to result:** before, a job switch plus "Add all" took 1.1, 3.9 and 6.3 s to reach a result. Saving now takes at most 1 ms (before, up to 16 ms at 6× with a full pool).
- **Memory** stays flat over 100 changes (14.5 MB). What remains slow is outside the optimizer: opening the page (2 MB of page and item data).

## 8. Runs of 2026-10-14

The stress test of the plain optimizer.

Measured on the same PC before Beastmaster was added (22 jobs), with the scripts listed in [testing.md, section 3](testing.md#3-commands). The workloads, the budgets and the way to compare versions are described in [optimizer.md, "What the perf scripts measure"](optimizer.md#what-the-perf-scripts-measure).

### 8.1 Every job's full pool

Each of the 22 jobs with every piece it can equip (1,899 to 2,641 items), 18 sync settings (none; item level caps 123 to 795; level sync at 50 to 90; five level and cap pairs) and about 40 objectives. The objectives are every single target, every target and tiebreak pair of substats, and random three-key orders. Each ran with melds off and on: 27,936 runs, each timed as the median of 3 calls.

| | Melds off | Melds on |
| --- | ---: | ---: |
| Median | 9.2 ms | 14.8 ms |
| 95th percentile | 13.3 ms | 20.1 ms |
| Largest search | 452 nodes | 1,209 nodes |
| Truncated | 0 | 0 |

- **Outliers.** About 1 run in 400 takes 40 to 80 ms. These are pauses for garbage collection and compiling, not cost: the slowest (Dark Knight, cap 530, Critical Hit then Skill Speed, 78 ms) takes 19.5 ms when rerun alone.
- **The largest searches.** The searches above 1,000 nodes are healers at level 60 with the main stat as the target and Vitality as a tiebreak (many near-ties); the search itself takes 1.4 ms of the run.
- **Where the time goes.** Building the candidate lists is most of a run: syncing, choosing melds, building the vectors and pruning take about 90%, the search under 10%.
- **The first run.** The very first run in a fresh process is the slowest: 75 to 79 ms on the largest pool (Paladin, melds on), then about 29, 24 and 20 ms as the code is compiled and the per-item caches fill.

### 8.2 Hostile pools

3,000 random pools of real pieces with random stats (near-ties, cloaks, two-handed weapons, shields, up to 200 Unique rings), then 600 steps that mutate the worst pool to grow its search: median 186 nodes, largest 700 (4.5 ms).

- Without a speed range the bound of [optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound) is exact (the slots left are independent, the ring pair and blocked slots are bounded exactly), so the search grows with the pool, not exponentially.
- With the engine's speed range, real full pools stayed below about 11,000 nodes; reaching the page's 700,000-node limit took a synthetic pool where every piece trades Critical Hit for speed, and stopped there after about 0.5 s. The speed tables of [optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound) (2026-10-16) bring that pool down to a few dozen nodes.

## 9. Runs of 2026-10-12

The first measurements, on the Sage pool.

Measured with Node 22.23.2 on the owner's Windows PC, median of 5 runs, including building the candidate lists (2026-10-12, with the kept-only pruning of [optimizer.md, section 4](optimizer.md#4-fewer-candidates-dominance-pruning)). The pool is every piece Sage can equip at item level 100 and up (1,999 items). The node counts before the ring-pair bound ([optimizer.md, section 5](optimizer.md#5-the-search-depth-first-branch-and-bound)) are in brackets; every result is the same. Melds could not be combined with a speed range then, hence "–"; Target GCD timings are in the [Target GCD sweep](#61-target-gcd-sweep) of 2026-10-16.

| Run | Nodes | Time | With melds |
| --- | ---: | ---: | ---: |
| Synced to 123, Spell Speed | 137 (137) | ~13 ms | 148 nodes, ~14 ms |
| Synced to 123, Spell Speed, tiebreaks Crit, Det | 137 (137) | ~12 ms | 148 nodes, ~13 ms |
| Unsynced, Spell Speed | 194 (505) | ~8 ms | 234 nodes, ~15 ms |
| Unsynced, Critical Hit, tiebreaks Det, Spell Speed | 194 (5,811) | ~9 ms | 233 nodes, ~17 ms |
| Unsynced, Critical Hit, Spell Speed at least 2,000 | 2,645 (3,238) | ~10 ms | – |
| Unsynced, Critical Hit, Spell Speed at most 1,000 (pruning off) | 2,194 (558,548) | ~7 ms (was ~450 ms) | – |

- **Rerun on 2026-10-18** with the code and data of that day, the first four runs: the same results and node counts, except two runs with melds. Synced to 123 with Spell Speed now takes 146 nodes (148 above), unsynced with Spell Speed 223 (234 above).
- **Sync shrinks the lists.** Synced runs leave fewer candidates after pruning (119 against 169 unsynced): sync cuts many pieces down to the same stats, so they differ only by item level.
- **Across pools.** Across the Sage and Warrior full pools, caps 123 to 660 and no sync, and five objectives, the slowest run takes about 20 ms without melds and 42 ms with them.
- **The real-gear probe.** Across the 9,800 real-gear runs, the median is 69 nodes, the 99th percentile 149 and the largest 203 (Summoner, items 260 to 300, unsynced). Before the ring-pair bound they were 73, 18,178 and 191,023.
  - The largest was Ninja and Viper, items 600 to 640, unsynced, Skill Speed.
  - Most armor there has no Skill Speed, so many candidates tie at a score of 0.
  - The best ring is Unique, so counting it twice left the bound 42 points too high to cut those ties.
  - Rerun on 2026-10-12 with both searches side by side: the same total in all 9,800 runs, none truncated.

## Where this lives

| Concept | File |
| --- | --- |
| The quick benchmark and the full sweep (`npm run perf`, `npm run perf:full`) | `scripts/perf/bench.ts`, with the workloads in `scripts/perf/workloads.ts` |
| Hostile pools, memory, per-step timing, comparing versions | `scripts/perf/adversarial.ts`, `memory.ts`, `split.ts`, `compare.ts` |
| The Target GCD sweep | `scripts/perf/target-gcd-sweep.ts` |
| The page in Chromium (`npm run perf:browser`) | `scripts/perf/browser.ts` |
| The inlined database at page open | `scripts/perf/db-parse.ts` |
| The tier ranking sweeps | one-off scripts; no committed script (the settings are listed in sections 4.1, 5.1 and 6.2) |
| The current timing tables | [optimizer.md, section 8](optimizer.md#8-correctness-and-performance), [tier-ranking.md, section 8](tier-ranking.md#8-performance), [data-pipeline.md, section 8](data-pipeline.md#8-building-the-page) |
