# Documentation style guide

Shared by every page in `docs/`. Keep pages consistent with it. A checklist is at the end.

## Where a page goes

| Folder | Holds | Pages today |
| --- | --- | --- |
| `docs/mechanics/` | How the game works, as this project models it, and the evidence for it | math, validation, materia |
| `docs/engineering/` | How the code works: structure, data generation, the optimizer, tests, reference tables for game-file columns the generators read | architecture, data-pipeline, optimizer, tier-ranking, ui, testing, subcategory-sort-codes |
| `docs/` (top level) | Pages for the whole set | README (the index), glossary, roadmap, history, data-changelog |
| `docs/diagrams/` | Every SVG diagram, and this guide | |

To choose: if the text would still be true with a different implementation, it is mechanics; if it describes this code, it is engineering.

A new page goes into the index (`docs/README.md`: its table and the reading order), its new terms go into `docs/glossary.md`, and the pages it relates to link to it. Moving or renaming a page means updating every link to it.

## Page layout

1. `# Title`, in sentence case.
2. One paragraph: what the page covers.
3. A "Related pages:" line with links.
4. Numbered sections: `## 1. Terms`, `## 2. The rules`. Other pages link to sections by number.
5. If the page makes claims: a closing verified-and-assumed table (claim, status, evidence).
6. Last, unnumbered: `## Where this lives`, a short table from concept to file.

Top-level pages and reference tables can skip the numbered sections.

## Links

Relative links only, so they work on GitHub and in a local checkout:

| Linking from | to a top-level page | to `mechanics/` | to `engineering/` | to a diagram |
| --- | --- | --- | --- | --- |
| `docs/` (top level) | `glossary.md` | `mechanics/math.md` | `engineering/optimizer.md` | `diagrams/name.svg` |
| `docs/mechanics/` | `../glossary.md` | `math.md` | `../engineering/optimizer.md` | `../diagrams/name.svg` |
| `docs/engineering/` | `../glossary.md` | `../mechanics/math.md` | `optimizer.md` | `../diagrams/name.svg` |
| repo root (`README.md`) | `docs/glossary.md` | `docs/mechanics/math.md` | `docs/engineering/optimizer.md` | `docs/diagrams/name.svg` |

- **Sections** are linked by their GitHub anchor: lower case, spaces become hyphens, other punctuation is dropped. `## 4. The stats on a piece` is `#4-the-stats-on-a-piece`; `### 2.1 The brute-force reference and the real-gear pools` is `#21-the-brute-force-reference-and-the-real-gear-pools`.
- **Renaming or renumbering a heading breaks every link to it.** Search `docs/` for the old anchor first and fix each hit.
- **Link text** names the page and the section, and reads naturally: `[math.md, section 5](../mechanics/math.md#5-item-level-sync)`.
- **Code, test and data files** are named in code font (`src/core/meld.js`), not linked.

## Writing

- Audience: developers new to the project and players curious about the math. Assume no FFXIV knowledge beyond what `docs/glossary.md` defines; explain a game term the first time it appears on a page.
- Explain with mathematical notation, not code. GitHub renders LaTeX: inline `$...$`, display blocks in `$$ ... $$` on their own lines. Use plain words for names in formulas, e.g. $\text{budget}(i)$ not `IL.crit[i]`.
- Explain a concept in plain words first. A code name (a function, constant or file, in code font) may follow in the text where a reader needs it to find the code or a test; every concept still gets a row in the closing "Where this lives" table (concept → file). Formulas use plain words, never code names (above).
- Plain, concise sentences. Headings in sentence case. No marketing tone.

## Status words

Mark every claim, in the same sentence or table row. Use these words:

| Word | Use it for |
| --- | --- |
| **verified** | Checked against the game files, the Wiki, real items, or in game by the owner; or by a test whose expected value comes from one of those |
| **inferred** | Fits the data, but nothing outside confirms it. Add "strongly supported" or "supported second-hand" when there is partial evidence |
| **assumed** | No evidence either way: a working assumption |
| **second-hand** | An in-game value or report from someone else (a forum post, xivgear's test notes), not captured by this project |
| **owner's decision** | A modelling choice the owner made; say what it rests on |
| **community reference** | A formula or table from a community source (AkhMorning), not the game files |

- Never upgrade a status without new evidence, and never present an inference as fact.
- When evidence changes a status, update every page that states it. When a claim is retracted, add an entry to `docs/history.md`.
- Test expected values have their own kinds (external truth, independent derivation, brute-force reference, regression value): see [validation.md, section 1](../mechanics/validation.md#1-sources-of-truth).

## Numbers

- Use real numbers from the game data in worked examples, and check them by running the code (`node` + imports from `src/core/`) rather than computing by hand.
- Say which data a page's counts describe (the datamining commit, for example `d9582a6`), and date measurements such as timings and probes.
- Keep one decimal for percentages; 99.5% is not 100%.
- Give each number one home page and link to it from elsewhere, so a patch changes one place. When a change alters a documented number or rule, update the page that states it.

## Diagrams

- Hand-made SVG files in `docs/diagrams/`, embedded as an image with the relative path from the links table above. Alt text describes what the diagram shows, and its numbers match the page.
- Numbers inside a diagram follow the same rules as text: when a number changes, update the SVG too.
- `viewBox` width 720 (height as needed), no fixed `width`/`height` attributes, generous whitespace, nothing smaller than 12px text.
- Text is real `<text>` (not paths), font-family `system-ui, -apple-system, "Segoe UI", sans-serif`; monospace (`ui-monospace, Consolas, monospace`) only for numbers in tables.
- Colours come from CSS classes in an inline `<style>` with a `@media (prefers-color-scheme: dark)` block, so the diagram follows the reader's theme. Palette:

| Role | Light | Dark |
| --- | --- | --- |
| background (`.bg`, fill a full-size rect) | `#fffdf7` | `#142023` |
| surface / box fill (`.box`) | `#ece9dd` | `#1b2b2e` |
| text, strokes (`.fg`) | `#1b2a2c` | `#e5eeed` |
| secondary text, grid (`.muted`) | `#586869` | `#92a5a5` |
| accent: main flow, substat line (`.accent`) | `#0d6e72` | `#4cc2b6` |
| highlight: main stat, emphasis (`.gold`) | `#8f5f0c` | `#e2b659` |
| cap / clamp / rejected (`.bad`) | `#b0402c` | `#f08a74` |
| kept / accepted (`.good`) | `#25773a` | `#6cc788` |

- Boxes: `rx="8"`, 1.5px strokes, arrows with a single shared `<marker>`. Align to a grid; equal spacing between siblings.
- Render each SVG to PNG and look at it in light and dark, e.g. headless Edge:
  `"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --screenshot=out.png --window-size=900,700 file:///.../diagram.svg`
  (for dark, wrap the SVG in a scratch HTML page with `<meta name="color-scheme" content="dark">` or emulate via `--force-dark-mode`). Fix overlaps, clipping and uneven spacing.

## Before finishing

- [ ] Every claim carries a status word.
- [ ] Every number was re-run, and the page says which data it describes.
- [ ] Every relative link and anchor resolves.
- [ ] New terms are in the glossary; a new page is in the index.
- [ ] Each changed diagram was rendered and checked in light and dark.
