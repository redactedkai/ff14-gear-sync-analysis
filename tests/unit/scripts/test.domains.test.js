/* The test domains (tests/domains.mjs): the guard that keeps the registry whole. Every file of src/, scripts/ and tests/
   belongs to exactly one domain, every smoke step names a known domain, every registry pattern still matches a file, and
   package.json has a test:<domain> script for each domain and for no other name. A new file that no domain claims fails
   here with its path: add it to a domain's `src` or `tests` list in tests/domains.mjs (or, for a unit test, put it where
   its module's path says). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROUPS } from '../../e2e/groups.mjs';
import {
  DOMAINS,
  DOMAIN_NAMES,
  LONG,
  ROOT,
  domainsOfSource,
  domainsOfTest,
  listFiles,
  matchesPattern,
  parseDomains,
  unitFilesOf,
} from '../../domains.mjs';

const SOURCE_FILES = [...listFiles('src'), ...listFiles('scripts')];
const TEST_FILES = listFiles('tests');

// "file: no domain" or "file: a and b" for each file that does not have exactly one domain.
function ownershipProblems(files, domainsOf) {
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
    for (const pattern of domain.src)
      if (!SOURCE_FILES.some(file => matchesPattern(file, pattern))) unmatched.push(`${name} src: ${pattern}`);
    for (const pattern of domain.tests)
      if (!TEST_FILES.some(file => matchesPattern(file, pattern))) unmatched.push(`${name} tests: ${pattern}`);
  }
  const unitFiles = new Set(unitFilesOf(DOMAIN_NAMES));
  for (const file of LONG) if (!unitFiles.has(file)) unmatched.push(`LONG: ${file}`);
  assert.deepEqual(unmatched, []);
});

test('domains: every smoke step names a domain of the registry', () => {
  const problems = GROUPS.flatMap(group => group.steps)
    .filter(step => !DOMAIN_NAMES.includes(step.domain))
    .map(step => `${step.name}: ${step.domain ?? 'no domain'}`);
  assert.deepEqual(problems, []);
});

test("domains: a smoke step's file is in the folder of its step's domain (the domain's `tests` list)", () => {
  // each check function's file, from the import lines of groups.mjs, then each `step(checkX, 'domain')` call
  const source = readFileSync(`${ROOT}/tests/e2e/groups.mjs`, 'utf8');
  const fileOf = new Map();
  for (const [, names, path] of source.matchAll(/import \{([^}]+)\} from '\.\/(checks\/[^']+)'/g))
    for (const name of names
      .split(',')
      .map(text => text.trim())
      .filter(Boolean))
      fileOf.set(name, `tests/e2e/${path}`);
  const calls = [...source.matchAll(/step\((\w+), '([\w-]+)'\)/g)];
  assert.ok(calls.length > 40, `only ${calls.length} step calls found in groups.mjs`);
  const problems = calls.flatMap(([, name, domain]) => {
    const file = fileOf.get(name);
    if (!file) return [`${name}: not imported from tests/e2e/checks/`];
    return domainsOfTest(file).includes(domain)
      ? []
      : [`${name} (${domain}) is in ${file}, which is in ${domainsOfTest(file).join(' and ') || 'no domain'}`];
  });
  assert.deepEqual(problems, []);
});

test('domains: every domain has a test:<domain> script in package.json, and no other test:<name> names a domain', () => {
  const scripts = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')).scripts;
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
  const everyUnitFile = listFiles('tests/unit').filter(file => file.endsWith('.test.js'));
  const perDomain = DOMAIN_NAMES.flatMap(name => unitFilesOf([name]));
  assert.deepEqual([...perDomain].sort(), everyUnitFile);
});

test('domains: an unknown or empty domain name is an error that lists the valid names', () => {
  assert.deepEqual(parseDomains('sheets, set-page'), ['sheets', 'set-page']);
  assert.throws(() => parseDomains('sheets,nope'), /unknown domain nope; the domains are model, data/);
  assert.throws(() => parseDomains(''), /unknown domain/);
});
