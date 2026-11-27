/* The test domains (tests/domains.mjs): the guard that keeps the registry whole. Every file of src/, scripts/ and tests/
   belongs to exactly one domain, every smoke step names a known domain, every registry pattern still matches a file, and
   package.json has a test:<domain> script for each domain and for no other name. A new file that no domain claims fails
   here with its path: add it to a domain's `src` or `tests` list in tests/domains.mjs (or, for a unit test, put it where
   its module's path says). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GROUPS } from '../../e2e/groups.ts';
import {
  DOMAINS,
  DOMAIN_NAMES,
  LONG,
  ROOT,
  domainsOfSource,
  domainsOfTest,
  listFiles,
  matchesPattern,
  mirroredModule,
  parseDomains,
  unitFilesOf,
} from '../../domains.mjs';

const SOURCE_FILES = [...listFiles('src'), ...listFiles('scripts')];
const TEST_FILES = listFiles('tests');

// "file: no domain" or "file: a and b" for each file that does not have exactly one domain.
function ownershipProblems(files: string[], domainsOf: (file: string) => string[]): string[] {
  return files.flatMap(file => {
    const owners = domainsOf(file);
    return owners.length === 1 ? [] : [`${file}: ${owners.length ? owners.join(' and ') : 'no domain'}`];
  });
}

test('domains: every file of src/ and scripts/ is in exactly one domain', () => {
  assert.deepEqual(ownershipProblems(SOURCE_FILES, domainsOfSource), []);
});

test('domains: every file of tests/ is in exactly one domain', () => {
  assert.deepEqual(ownershipProblems(TEST_FILES, domainsOfTest), []);
});

test('domains: every registry pattern matches a file, and every LONG entry is a unit test file', () => {
  const unmatched = [];
  for (const [name, domain] of Object.entries(DOMAINS)) {
    for (const pattern of domain.src) {
      if (!SOURCE_FILES.some(file => matchesPattern(file, pattern))) {
        unmatched.push(`${name} src: ${pattern}`);
      }
    }
    for (const pattern of domain.tests) {
      if (!TEST_FILES.some(file => matchesPattern(file, pattern))) {
        unmatched.push(`${name} tests: ${pattern}`);
      }
    }
  }
  const unitFiles = new Set(unitFilesOf(DOMAIN_NAMES));
  for (const file of LONG) {
    if (!unitFiles.has(file)) {
      unmatched.push(`LONG: ${file}`);
    }
  }
  assert.deepEqual(unmatched, []);
});

test('domains: every smoke step names a domain of the registry', () => {
  const problems = GROUPS.flatMap(group => group.steps)
    .filter(step => !DOMAIN_NAMES.includes(step.domain))
    .map(step => `${step.name}: ${step.domain ?? 'no domain'}`);
  assert.deepEqual(problems, []);
});

test("domains: a smoke step's file is in the folder of its step's domain (the domain's `tests` list)", () => {
  // each check function's file, from the import lines of groups.ts, then each `step(checkX, 'domain')` call
  const source = readFileSync(`${ROOT}/tests/e2e/groups.ts`, 'utf8');
  const fileOf = new Map();
  for (const [, names, path] of source.matchAll(/import \{([^}]+)\} from '\.\/(checks\/[^']+)'/g)) {
    for (const name of names
      .split(',')
      .map(text => text.trim())
      .filter(Boolean)) {
      fileOf.set(name, `tests/e2e/${path}`);
    }
  }
  const calls = [...source.matchAll(/step\((\w+), '([\w-]+)'\)/g)];
  assert.ok(calls.length > 40, `only ${calls.length} step calls found in groups.ts`);
  const problems = calls.flatMap(([, name, domain]) => {
    const file = fileOf.get(name);
    if (!file) {
      return [`${name}: not imported from tests/e2e/checks/`];
    }
    return domainsOfTest(file).includes(domain)
      ? []
      : [`${name} (${domain}) is in ${file}, which is in ${domainsOfTest(file).join(' and ') || 'no domain'}`];
  });
  assert.deepEqual(problems, []);
});

test('domains: every domain has a test:<domain> script in package.json, and no other test:<name> names a domain', () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')).scripts;
  const missing = DOMAIN_NAMES.filter(name => !(`test:${name}` in scripts));
  assert.deepEqual(missing, []);
  // a script that runs the wrapper for a domain must name a real one
  const wrong = Object.entries(scripts).flatMap(([script, command]) => {
    const named = command.match(/scripts\/test\.mjs --domain (\S+)/)?.[1];
    return named && !DOMAIN_NAMES.includes(named) ? [`${script}: ${named}`] : [];
  });
  assert.deepEqual(wrong, []);
});

test('domains: the domains together run every unit test file, each once', () => {
  const everyUnitFile = listFiles('tests/unit').filter(file => /\.test\.(js|ts)$/.test(file));
  const perDomain = DOMAIN_NAMES.flatMap(name => unitFilesOf([name]));
  assert.deepEqual([...perDomain].sort(), everyUnitFile);
});

test("domains: the domains table of docs/engineering/testing.md gives each domain's unit file and smoke step counts", () => {
  const doc = readFileSync(`${ROOT}/docs/engineering/testing.md`, 'utf8');
  const rows = [...doc.matchAll(/^\| `([\w-]+)` \|.*\| (\d+) \| (\d+) \|$/gm)];
  const stepsPerDomain = new Map();
  for (const step of GROUPS.flatMap(group => group.steps)) {
    stepsPerDomain.set(step.domain, (stepsPerDomain.get(step.domain) ?? 0) + 1);
  }
  const documented = rows.map(([, name, unitFiles, smokeSteps]) => [name, Number(unitFiles), Number(smokeSteps)]);
  const actual = DOMAIN_NAMES.map(name => [name, unitFilesOf([name]).length, stepsPerDomain.get(name) ?? 0]);
  assert.deepEqual(documented, actual);
});

test('domains: an unknown or empty domain name is an error that lists the valid names', () => {
  assert.deepEqual(parseDomains('sheets, set-page'), ['sheets', 'set-page']);
  assert.throws(() => parseDomains('sheets,nope'), /unknown domain nope; the domains are model, data/);
  assert.throws(() => parseDomains(''), /unknown domain/);
});

/* TypeScript files: a .ts file must be seen by the guard like a .js file. Each test plants one in a temporary tree
   (the registry's folders, one stray file) and expects the guard's own functions to report it. */
function withPlantedFiles<Result>(paths: string[], run: (root: string) => Result): Result {
  const root = mkdtempSync(join(tmpdir(), 'domains-ts-'));
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), '// planted\n');
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('domains guard: a .ts file in src/ or scripts/ that no domain claims is reported', () => {
  withPlantedFiles(['src/ui/stray.ts', 'scripts/stray.ts'], root => {
    const files = [...listFiles('src', root), ...listFiles('scripts', root)];
    assert.deepEqual(files, ['src/ui/stray.ts', 'scripts/stray.ts']);
    assert.deepEqual(ownershipProblems(files, domainsOfSource), ['src/ui/stray.ts: no domain', 'scripts/stray.ts: no domain']);
  });
});

test('domains guard: a .ts file the registry names has its domain (text.ts and view-cache.ts are in app)', () => {
  assert.ok(SOURCE_FILES.includes('src/ui/text.ts'));
  assert.deepEqual(domainsOfSource('src/ui/text.ts'), ['app']);
  assert.deepEqual(domainsOfSource('src/ui/view-cache.ts'), ['app']);
  assert.deepEqual(domainsOfSource('src/ui/text.js'), [], 'the old .js path is gone');
});

test('domains guard: a .test.ts file is a unit test, listed once and mirrored to its .ts module', () => {
  withPlantedFiles(['tests/unit/ui/text.test.ts', 'tests/unit/ui/stray.test.ts'], root => {
    assert.deepEqual(unitFilesOf(['app'], { root }), ['tests/unit/ui/text.test.ts'], 'the mirrored one runs; the stray has no domain');
    assert.deepEqual(ownershipProblems(unitFilesOf(DOMAIN_NAMES, { root }), domainsOfTest), []);
    assert.deepEqual(ownershipProblems(listFiles('tests/unit', root), domainsOfTest), ['tests/unit/ui/stray.test.ts: no domain']);
  });
  const modules = new Set(['src/ui/text.ts', 'src/ui/views/gcd.ts']);
  assert.equal(mirroredModule('tests/unit/ui/text.test.ts', modules), 'src/ui/text.ts');
  assert.equal(mirroredModule('tests/unit/ui/views/gcd.test.ts', modules), 'src/ui/views/gcd.ts');
  assert.deepEqual(domainsOfTest('tests/unit/ui/text.test.ts'), ['app']);
  assert.ok(unitFilesOf(['app']).includes('tests/unit/ui/text.test.ts'));
  assert.ok(unitFilesOf(['app']).includes('tests/unit/ui/view-cache.test.ts'));
});
