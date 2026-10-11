# Documentation style guide

Shared by every page in `docs/`. Keep pages consistent with it.

## Writing
- Audience: developers new to the project and players curious about the math. Assume no FFXIV knowledge beyond what `docs/glossary.md` will define; explain a game term the first time it appears.
- Explain with mathematical notation, not code. GitHub renders LaTeX: inline `$...$`, display blocks in `$$ ... $$` on their own lines. Use plain words for names in formulas, e.g. $\text{budget}(i)$ not `IL.crit[i]`.
- Code names appear only in a short **"Where this lives"** table at the end of each page (concept → file).
- Mark every claim as **verified** (game files, Wiki, real items, tests) or **inferred / assumed**. Never present an inference as fact.
- Use real numbers from the game data in worked examples, and check them by running the code (`node` + imports from `src/core/`) rather than computing by hand.
- Plain, concise sentences. Headings in sentence case. No marketing tone.

## Diagrams
- Hand-made SVG files in `docs/diagrams/`, embedded with `![alt text](diagrams/name.svg)`. Alt text describes what the diagram shows.
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
- Before finishing, render each SVG to PNG and look at it (light and dark), e.g. headless Edge:
  `"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --screenshot=out.png --window-size=900,700 file:///.../diagram.svg`
  (for dark, wrap the SVG in a scratch HTML page with `<meta name="color-scheme" content="dark">` or emulate via `--force-dark-mode`). Fix overlaps, clipping and uneven spacing.
