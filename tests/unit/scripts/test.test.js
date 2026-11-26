/* The test wrapper (scripts/test.mjs): how it reads its options and which unit files a domain selects. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedPathsOf, domainsOfChange, domainsOfChanges, parseArguments } from '../../../scripts/test.mjs';
import { DOMAIN_NAMES, LONG, unitFilesOf } from '../../domains.mjs';

test('wrapper options: no option runs all domains; --full turns on Python, sweep and smoke; flags after -- go to node', () => {
  const none = parseArguments([]);
  assert.deepEqual(none.domains, DOMAIN_NAMES);
  assert.equal(none.domainsGiven, false);
  const full = parseArguments(['--domain', 'sheets,set-page', '--full', '--', '--test-name-pattern=x']);
  assert.deepEqual(full.domains, ['sheets', 'set-page']);
  assert.deepEqual([full.py, full.sweep, full.smoke], [true, true, true]);
  assert.deepEqual(full.nodeFlags, ['--test-name-pattern=x']);
});

test('wrapper options: an unknown domain or option is an error', () => {
  assert.match(parseArguments(['--domain', 'nope']).error, /unknown domain nope/);
  assert.match(parseArguments(['--domain']).error, /unknown domain/);
  assert.match(parseArguments(['--wat']).error, /unknown option --wat/);
});

test('wrapper selection: a unit test goes to the domain of its module; --fast leaves out the long files only', () => {
  // real files: the set page's row builder and the optimizer are in different domains
  assert.ok(unitFilesOf(['set-page']).includes('tests/unit/ui/views/set-rows.test.js'));
  assert.ok(!unitFilesOf(['solver']).includes('tests/unit/ui/views/set-rows.test.js'));
  assert.ok(unitFilesOf(['solver']).includes('tests/unit/core/optimizer/index.exact-solver.test.js'));
  const all = unitFilesOf(DOMAIN_NAMES);
  const fast = unitFilesOf(DOMAIN_NAMES, { fast: true });
  assert.deepEqual(
    all.filter(file => !fast.includes(file)),
    [...LONG].sort(),
  );
});

test('changed files: git status lines give the new path of a rename, untracked files and deletions', () => {
  const porcelain = [
    ' M src/ui/views/gcd.js',
    '?? tests/e2e/checks/set-page/columns.mjs',
    'R  src/ui/old-name.js -> src/ui/store.js',
    ' D src/styles.css',
    '',
  ].join('\n');
  assert.deepEqual(changedPathsOf(porcelain), [
    { path: 'src/ui/views/gcd.js', deleted: false },
    { path: 'tests/e2e/checks/set-page/columns.mjs', deleted: false },
    { path: 'src/ui/store.js', deleted: false },
    { path: 'src/styles.css', deleted: true },
  ]);
});

test('changed files: a source file, a unit test, a smoke check and a build setting each map to their domain', () => {
  const domainsOf = path => domainsOfChange({ path }).domains;
  assert.deepEqual(domainsOf('src/ui/views/gcd.js'), ['math-page']);
  assert.deepEqual(domainsOf('src/core/optimizer/index.js'), ['solver']);
  assert.deepEqual(domainsOf('scripts/data/regen.py'), ['data']);
  assert.deepEqual(domainsOf('tests/unit/ui/views/set-rows.test.js'), ['set-page']);
  assert.deepEqual(domainsOf('tests/e2e/checks/auto-fill/focus.mjs'), ['auto-fill']);
  assert.deepEqual(domainsOf('tests/e2e/checks/set-page/overmeld-odds.mjs'), ['set-page']);
  assert.deepEqual(domainsOf('package.json'), ['tooling']);
});

test('changed files: documentation maps to nothing without a warning; an unknown path is a warning; a deleted source file is not', () => {
  for (const path of ['docs/engineering/testing.md', 'README.md', '.claude/settings.json']) {
    const change = domainsOfChange({ path });
    assert.deepEqual([change.domains, change.unowned], [[], undefined], path);
  }
  assert.equal(domainsOfChange({ path: 'notes.txt' }).unowned, true);
  assert.equal(domainsOfChange({ path: 'src/styles.css', deleted: true }).unowned, undefined);
});

test('changed files: the picked domains come in registry order, one line per path, and the unowned paths are listed', () => {
  const picked = domainsOfChanges([
    { path: 'tests/unit/ui/views/set-rows.test.js' },
    { path: 'src/ui/views/gcd.js' },
    { path: 'src/core/formulas.ts' },
    { path: 'docs/roadmap.md' },
    { path: 'notes.txt' },
  ]);
  assert.deepEqual(picked.domains, ['model', 'set-page', 'math-page']);
  assert.equal(picked.lines.length, 5);
  assert.match(picked.lines[1], /^src\/ui\/views\/gcd\.js: .*math-page/);
  assert.deepEqual(picked.unowned, ['notes.txt']);
});

test('wrapper options: --changed cannot be combined with --domain', () => {
  assert.equal(parseArguments(['--changed']).changed, true);
  assert.match(parseArguments(['--changed', '--domain', 'sheets']).error, /--changed picks the domains itself/);
});
