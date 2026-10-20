---
name: merge-wave
description: Merge a finished feature or worktree branch (one "wave" of work) into dev in this repo. Use when the owner asks to merge, land or fast-forward a branch or wave into dev. Checks who holds dev, rebases, runs the checks the change needs, fast-forwards dev and rebuilds the page. Never pushes and never touches main.
---

# Merge a wave into dev

The repo's flow is feature branch → `dev` → `main`, fast-forward only (CLAUDE.md, "Branches"). Several sessions share this machine, so look before you move anything.

## Steps

1. **Who holds what.** Run `git worktree list` and `git status` in each checkout you will touch.
   - Note which checkout has `dev` checked out (usually the main checkout). If it has uncommitted changes, or another session is working in it, stop and ask the owner.
   - Never kill processes by name, and never use bare `git stash`.
2. **Rebase.** In the wave's worktree: `git rebase dev`. Resolve conflicts by keeping both sides' intent; if a conflict is in a file another wave rewrote, ask rather than guess.
3. **No attribution.** `git log dev..HEAD --format=%B` must show no `Co-Authored-By` or "Generated with" line. Reword the commit if one slipped in (`git commit --amend` for the last one).
4. **Checks**, on the rebased branch, by what it touches (`git diff --stat dev...HEAD`):
   - always `npm run check` (must pass; the smoke test prints `no errors`);
   - `scripts/data/` or `src/data/`: also `npm run check:all`;
   - scoring, pruning or the search (`src/core/optimizer/`, `src/core/tier-rank.js`, `src/core/target-gcd.js`): also `npm run test:full` and `npm run perf`. Report node counts and truncations; timing matters only above about 0.5 s, so ignore budget misses below that and don't rerun them;
   - UI changes: also look at the built page at full width and at 960 px.
5. **Fast-forward dev.** In the checkout that holds `dev`: `git merge --ff-only <branch>`. If no checkout holds `dev`: `git fetch . <branch>:dev` (refuses anything but a fast-forward). If the fast-forward is refused, go back to step 2.
6. **Rebuild.** In the checkout that holds `dev`: `npm run build`, so the local `dist/index.html` shows `dev` (with the DEV badge).
7. **Report** the commits merged (`git log --oneline <old dev>..dev`), the checks run with their results, and anything skipped.

Don't push, don't touch `main`, and don't delete the wave's branch or worktree unless the owner asks.
