/* Private builds of the page for the layout stress tool. The tool never builds into the repo's dist/ and never edits src/:
   it copies src/, scripts/build/ and package.json to a folder in the system's temporary folder, links node_modules, and
   builds there, so a second session's build or edit is not touched and does not touch the run. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The repository's root folder. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* The limits of the STRESS build: a level and an item level with the most digits any number box or chip will ever show (the
   page already sizes its boxes from its limits, MAX_LEVEL and MAX_REAL; the real ones are 100 and 795). Every digit is an
   8, the widest in most fonts. */
export const STRESS_LEVEL = 888;
export const STRESS_ITEM_LEVEL = 8888;

/* The patches the STRESS build applies to its copy of the source (never to src/). Each is {file, from, to, all}: the
   exact text `from` in `file` (a path from the repository root) becomes `to`; with `all` every copy of it does. A patch
   whose text is not found throws, so a change to the source that moves a limit is noticed instead of silently testing the
   real limits. What they do together:
   - MAX_LEVEL (tables.ts) is 888 and MAX_REAL is 8888, so a job's level cap, the level and item level boxes, their ranges
     ("1-888", "1-8888"), the cap field's limits, the chips and every size the page derives from the limits take the widest digits;
   - the tables keyed by level (PG, MAX_SPEED, the main stat base in base-stats.ts) get rows up to level 888 that repeat the
     last real row, so no number turns into NaN and the page keeps working;
   - MAX_ILVL (the ItemLevel table's last row, 920) is left as it is: an item level above it reads the last row. */
export const STRESS_PATCHES = Object.freeze([
  {
    file: 'src/core/tables.ts',
    from: 'export const PG = ITEM_LEVEL_FILE.PG;',
    to: `export const PG = [...ITEM_LEVEL_FILE.PG, ...Array.from({ length: ${STRESS_LEVEL} - ITEM_LEVEL_FILE.PG.length }, () => ITEM_LEVEL_FILE.PG.at(-1))];`,
  },
  {
    file: 'src/core/tables.ts',
    from: 'export const MAX_SPEED = Object.freeze([...MAX_SPEED_FILE.total]);',
    to: `export const MAX_SPEED = Object.freeze([...MAX_SPEED_FILE.total, ...Array.from({ length: ${STRESS_LEVEL} - MAX_SPEED_FILE.total.length }, () => MAX_SPEED_FILE.total.at(-1))]);`,
  },
  {
    file: 'src/core/tables.ts',
    from: 'export const MAX_REAL = ITEMS.reduce((m, r) => Math.max(m, r[ROW.ilvl]), 0);',
    to: `export const MAX_REAL = ${STRESS_ITEM_LEVEL};`,
  },
  {
    file: 'src/core/tables.ts',
    from: 'export const MAX_LEVEL = ITEMS.reduce((m, r) => Math.max(m, r[ROW.equipLevel]), 0);',
    to: `export const MAX_LEVEL = ${STRESS_LEVEL};`,
  },
  {
    file: 'src/core/base-stats.ts',
    from: 'LEVEL_MAIN[lv - 1]',
    to: 'LEVEL_MAIN[Math.min(lv, LEVEL_MAIN.length) - 1]',
    all: true,
  },
]);

/* `text` with `patch` applied; throws when the patch's text is not in it. */
export function applyPatch(text, patch) {
  if (!text.includes(patch.from)) {
    throw new Error(`stress patch for ${patch.file} does not apply: "${patch.from}" is not in the source any more`);
  }
  return patch.all ? text.replaceAll(patch.from, patch.to) : text.replace(patch.from, () => patch.to);
}

/* The files of the repository the private copy needs (relative to the root). */
const COPIED = ['src', join('scripts', 'build'), 'package.json'];

/* A private build in a new folder of the system's temporary folder. `patches` are applied to the copy of the source first
   (STRESS_PATCHES for the stress build, none for the real one). The build is the one the repo's own dev branch shows (the
   DEV badge and its test data button, `branch`). Returns {dir, page} (the built page's path) and `remove()`, which deletes the folder. */
export function buildPrivate({ patches = [], branch = 'dev', root = REPO_ROOT } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ff14-stress-'));
  for (const name of COPIED) {
    cpSync(join(root, name), join(dir, name), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction');
  for (const patch of patches) {
    const path = join(dir, patch.file);
    writeFileSync(path, applyPatch(readFileSync(path, 'utf8'), patch));
  }
  execFileSync(process.execPath, [join(dir, 'scripts', 'build', 'build.mjs')], {
    cwd: dir,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, GITHUB_REF_NAME: branch, GITHUB_SHA: '' },
  });
  const page = join(dir, 'dist', 'index.html');
  if (!existsSync(page)) {
    throw new Error(`the private build wrote no page at ${page}`);
  }
  return { dir, page, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
