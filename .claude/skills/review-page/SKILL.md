---
name: review-page
description: Build a click-through review page where the owner picks between UI options or approves visible changes, one card per change with before and option screenshots, pick buttons, a notes box and "Copy my picks". Use whenever the owner should choose between UI/UX options (mockups of where a control goes, wording variants) or approve a batch of visible changes before they land.
---

# Review page

A static HTML page in `docs/scratchpad/<topic>/` (gitignored), opened from `file://`. The owner clicks an option or Drop on each card, writes notes, and pastes back the "Copy my picks" text. The round-4 UX review (`docs/scratchpad/ux-round4/`) is the model. Never publish it as a claude.ai Artifact.

## Steps

1. **One option, one commit.** Where code exists, build each option as its own commit (a Keep/Drop change is a card with one option). Options of the same card go on separate branches from the same base (`<topic>-<id>-a`, `-b`, ...); independent changes can share one review branch, one commit each. Record branch, hash and subject per card in `docs/scratchpad/<topic>/commits.md`. Where no code exists yet, make static HTML mockups instead, one per option, in the same folder.
2. **Shots of the affected view only.** Build each page without the DEV badge: bash `GITHUB_REF_NAME=main npm run build`, PowerShell `$env:GITHUB_REF_NAME = 'main'; npm run build; Remove-Item Env:GITHUB_REF_NAME`, and copy `dist/index.html` aside (`before.html` from the base, `<id>-<key>.html` per option).
   - If a view in `scripts/shots/shots.mjs` (`VIEWS`) shows the change: `npm run shots -- --page <page.html> --out docs/scratchpad/<topic>/shots/<id>-<key> --only <view>`. It shoots 1440 and 960 px, light and dark, full page, mouse off the page, and fails on a page error or sideways scroll.
   - Otherwise copy `docs/scratchpad/ux-round4/shots.mjs` into the topic folder and give the card a state, steps and a clip (the selectors of the changed region). Keep its rules: fonts blocked, mouse moved off the page before the shot, solve time fixed, both widths, and add the dark scheme (`colorScheme: 'dark'`).
   - Look at every shot before using it: the change must be visible in it.
3. **Cards JSON.** Write `docs/scratchpad/<topic>/cards.json` (schema below). Text follows CLAUDE.md, "Working with the owner": short, plain, neutral, no advice between options.
4. **Generate:** `node .claude/skills/review-page/make-page.mjs docs/scratchpad/<topic>/cards.json`. It writes `index.html` next to the JSON, warns on missing shots and stops on schema errors.
5. **Check** in Playwright at 1440 and 960 px: no console errors, no sideways scroll, no broken images (`docs/scratchpad/review-page-test/check.mjs` in the worktree that built this skill is an example).
6. **Open** it in the default browser (PowerShell `Start-Process docs/scratchpad/<topic>/index.html`) and ask the owner to paste the "Copy my picks" text.
7. **Apply the picks.** One line per card: `<id>: <label> (<key>) — <note>`, or `<id>: Drop`, or `<id>: undecided`. Keep the picked option's commit, drop the rest (rebase them out of the review branch, or delete the option branches), and follow each note. Add dropped cards to the next page's `dropped` list. Ask about undecided cards; don't guess. Merge with the `merge-wave` skill when the owner asks.

## Cards JSON

```json
{
  "title": "Cancel button: where it goes",
  "intro": "One card per change. Shots: dev (before) and dev plus each option.",
  "storageKey": "review-cancel-picks",
  "dropped": ["11-1 dropped: Equip level stays independent of Synced level."],
  "cards": [
    {
      "id": "W1",
      "group": "Optimizer",
      "title": "Where the Cancel button goes",
      "problem": "A long search cannot be stopped.",
      "before": { "text": "As on dev.", "shots": { "1440 light": "shots/W1-before/03-opt-result-1440-light.png" } },
      "options": [
        { "key": "a", "label": "Beside the bar", "text": "Cancel sits beside the progress bar.",
          "shots": { "1440 light": "shots/W1-a/...png", "960 light": "...", "1440 dark": "...", "960 dark": "..." } },
        { "key": "b", "label": "Under the bar", "text": "...", "shots": { } }
      ],
      "drop": true,
      "dependsOn": "wave W (the Web Worker).",
      "notes": "Shot: the busy state, forced."
    }
  ]
}
```

- Required: `title`, `cards`; per card `id` (unique), `title`, `options` (one or more); per option `key` (one lower-case letter, unique in the card).
- Optional: `intro`, `dropped` (lines), `storageKey` (default from the title; give each review its own), per card `group` (a heading when it changes), `problem`, `before` (a reference column, not pickable), `drop` (default true: a Drop button), `dependsOn`, `notes`; per option `label` (default "Option a"; use "Keep" for a single change), `text`, `shots`.
- `shots` maps a view name to a PNG path, relative to the JSON file or absolute. The page has one switch for all cards with every view name used, so use the same names everywhere (`1440 light`, `960 light`, `1440 dark`, `960 dark`). A column without that view's shot says so.
- Picks and notes are kept in the browser's localStorage under `storageKey` (try/catch; the page works without it). Regenerating keeps them; a new `storageKey` starts fresh.
