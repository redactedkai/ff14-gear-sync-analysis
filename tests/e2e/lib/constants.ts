// Constants shared by the smoke test: paths, limits, the job list, the item level 123 caps.

import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const PAGE_PATH = process.env.SMOKE_PAGE ? resolve(process.env.SMOKE_PAGE) : resolve(ROOT, 'dist', 'index.html'); // run `npm run build` first

export const PAGE = pathToFileURL(PAGE_PATH).href;

export const OUT = process.env.SMOKE_OUT ? resolve(process.env.SMOKE_OUT) : resolve(ROOT, 'tests', 'e2e', 'out'); // screenshots (gitignored)

export const shot = (name: string) => resolve(OUT, name);

export const JOBS = ['SGE', 'WAR', 'PLD', 'BLM', 'NIN', 'DRG', 'BST', 'BLU'];

export const HAS_OFFHAND = new Set(['PLD', 'BST', 'WHM', 'BLM']); // jobs with a shield (one-handed weapon + shield; WHM and BLM also use a two-handed weapon): an Off-hand row

export const BAD_WORDS = ['undefined', 'NaN', 'null'];

export const TIMEOUT = Number(process.env.SMOKE_TIMEOUT) || 10_000; // ms for any single wait (SMOKE_TIMEOUT overrides it)

// ms for a page load or reload: a busy machine loads the page slowly, and a load is not what a step asserts
export const NAV_TIMEOUT = Math.max(30_000, TIMEOUT);

export const WORKERS = Number(process.env.SMOKE_WORKERS) || Math.max(1, Math.min(6, availableParallelism() >> 1)); // pages at once: each is a busy browser process, so no more than half the cores

/** Longer than the page's typing and save debounces (300 ms): the wait of a check that something does NOT happen after a typed
 * value, which nothing on the page signals (a check that it does happen waits on the page itself). */
export const DEBOUNCE_SETTLE_MS = 400;

// The narrowest window the page must fit with no sideways page scroll: half of a 1920 screen, the tool beside the game.
// There is no phone layout (owner's decision, 2026-10-15).
export const NARROW = { width: 960, height: 900 };

export const STORE_KEY = 'ilvl-stat-lab-v4'; // localStorage key of the saved state (src/ui/state.ts)

// Defaults owe nothing to any player's setup: no job chosen, no sync cap (sync off), level 100.
export const [DEFAULT_JOB, DEFAULT_CAP, DEFAULT_LEVEL] = ['PLD', '', '100'];

// The "Gear categories" boxes in ACTIVITIES order (src/core/item-format.json); DEFAULT_EXCLUDE (lib/core-worker.ts) are left out by
// default.
type Activity = { key: string; label: string; section: string; on: boolean; hint: string };
const ACTIVITIES: Activity[] = JSON.parse(readFileSync(new URL('../../../src/core/item-format.json', import.meta.url), 'utf8')).activities;
export const ACTIVITY_KEYS = ACTIVITIES.map(a => a.key);

// The name each "Gear categories" box shows: key -> label.
export const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(ACTIVITIES.map((a): [string, string] => [a.key, a.label]));

// The section (tab) each "Gear categories" box is in: key -> title.
export const ACTIVITY_SECTION: Record<string, string> = Object.fromEntries(ACTIVITIES.map((a): [string, string] => [a.key, a.section]));

// The "Gear categories" boxes of each menu section, section title -> keys in ACTIVITIES order: what a tab of the menu shows.
export const ACTIVITY_KEYS_BY_SECTION: Record<string, string[]> = Object.fromEntries(
  [...new Set(ACTIVITIES.map(a => a.section))].map((section): [string, string[]] => [
    section,
    ACTIVITIES.filter(a => a.section === section).map(a => a.key),
  ]),
);

// Sync caps at item level 123: slot -> [substat cap, main stat cap]. Same for every job (slot shares are job-neutral).
export const CAPS_123 = {
  'Head / Hands / Feet': [29, 30],
  'Body / Legs': [47, 48],
  Accessories: [23, 24],
};

export const CAPS_123_2H_WEAPON = [48, 50];
