/* The guard that keeps tests/ and scripts/ in TypeScript: no tracked `.js`, `.mjs` or `.cjs` file there except the ones
   listed below, each kept on purpose. A new script or test is a `.ts` file (CLAUDE.md, "Code rules"); this fails with the
   path of a stray one. src/ is not checked here: its two `.js` files (the entry and the ES5 startup-failure page) are
   named in CLAUDE.md. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// The JavaScript files that stay, each with the reason.
const KEPT_AS_JAVASCRIPT: Record<string, string> = {
  'tests/stories/app/broken-elements.js': 'a story fixture that loads as plain script in the gallery page',
  'tests/unit/scripts/fixtures/lit-lint/bad-element.js': 'input for the Lit lint test: must be a .js file to be linted',
  'tests/unit/scripts/fixtures/lit-lint/good-element.js': 'input for the Lit lint test: must be a .js file to be linted',
};

/* The tracked files under tests/ and scripts/ that end in .js, .mjs or .cjs (git's list, so generated `out/` folders,
   which are ignored, do not count). */
function trackedJavaScript(): string[] {
  const listing = execFileSync('git', ['ls-files', '--', 'tests', 'scripts'], { cwd: ROOT, encoding: 'utf8' });
  return listing.split('\n').filter(file => /\.(js|mjs|cjs)$/.test(file));
}

test('tests/ and scripts/ hold no JavaScript file but the ones kept on purpose', () => {
  const strays = trackedJavaScript().filter(file => !(file in KEPT_AS_JAVASCRIPT));
  assert.deepEqual(strays, [], 'rename these to .ts, or add them to KEPT_AS_JAVASCRIPT with a reason');
});

test('every kept JavaScript file still exists, so the list does not collect dead entries', () => {
  const tracked = new Set(trackedJavaScript());
  const dead = Object.keys(KEPT_AS_JAVASCRIPT).filter(file => !tracked.has(file));
  assert.deepEqual(dead, [], 'remove these from KEPT_AS_JAVASCRIPT');
});
