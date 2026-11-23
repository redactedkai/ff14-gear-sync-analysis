// Run the tests of one or more domains (tests/domains.mjs): `node scripts/test.mjs --domain set-page,auto-fill`.
// For work in progress. `npm run check` is still the bar for "done": it runs every test, and its smoke test prints the
// bare 'no errors' (a domain run's smoke test prints 'no errors (partial: ...)').
//
//   --domain a,b   the domains to run (default: all of them)
//   --fast         leave out the long unit files (LONG in tests/domains.mjs)
//   --py           also run the Python generator tests (all in `data`)
//   --sweep        also run the long optimizer sweep (all in `solver`)
//   --smoke        also build a private copy of the page and run the domains' browser checks (the shared dist/ is not touched)
//   --full         --py, --sweep and --smoke
//   --changed      run the domains that own the files `git status` lists as changed, added or untracked (a hint for the
//                  inner loop: `npm run check` is still the full gate). Prints one line per path and why. Not with --domain
//   --list         print the files of each domain and run nothing (with --changed: the mapping and the picked domains)
//   -- <flags>     everything after is passed to `node --test` (for example --test-name-pattern=...)
//
// With no option it runs every unit test file, as `npm test` does. Exit code: 2 for a bad option or an unknown domain,
// else the code of the first test run that failed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAINS,
  DOMAIN_NAMES,
  ROOT,
  domainsOfSource,
  domainsOfTest,
  matchesPattern,
  parseDomains,
  pythonFilesOf,
  sweepFilesOf,
  unitFilesOf,
} from '../tests/domains.mjs';

const BOOLEAN_OPTIONS = ['--fast', '--py', '--sweep', '--smoke', '--full', '--list', '--changed'];

// Reads the command line. Returns { domains, fast, py, sweep, smoke, list, changed, nodeFlags }, or { error } for a bad
// option or an unknown domain (the message lists the valid names). `--full` sets py, sweep and smoke; without `--domain`
// all domains run; with `--changed` the domains come from git later (see `domainsOfChanges`), and `--domain` is an error.
export function parseArguments(args) {
  const options = {
    domains: DOMAIN_NAMES,
    domainsGiven: false,
    fast: false,
    py: false,
    sweep: false,
    smoke: false,
    list: false,
    changed: false,
    nodeFlags: [],
  };
  const separator = args.indexOf('--');
  const own = separator < 0 ? args : args.slice(0, separator);
  if (separator >= 0) options.nodeFlags = args.slice(separator + 1);
  for (let i = 0; i < own.length; i++) {
    const arg = own[i];
    if (arg === '--domain') {
      try {
        options.domains = parseDomains(own[++i] ?? '');
      } catch (e) {
        return { error: e.message };
      }
      options.domainsGiven = true;
    } else if (BOOLEAN_OPTIONS.includes(arg)) {
      if (arg === '--full') Object.assign(options, { py: true, sweep: true, smoke: true });
      else options[arg.slice(2)] = true;
    } else {
      return { error: `unknown option ${arg}; options: --domain <names>, ${BOOLEAN_OPTIONS.join(', ')}, -- <node --test flags>` };
    }
  }
  if (options.changed && options.domainsGiven) return { error: '--changed picks the domains itself; leave out --domain' };
  return options;
}

// The paths that map to no domain on purpose: documentation and the Claude settings change no tested behaviour.
const NO_DOMAIN_PREFIXES = ['docs/', '.claude/'];

// The repo's own build and check settings: their tests are the tooling domain's (the build test reads package.json, the
// lint runs through biome.jsonc, CI runs the checks).
const TOOLING_CONFIG_PATTERNS = ['package.json', 'package-lock.json', 'biome.jsonc', '.github/**', '.githooks/**'];

// The changed paths in the output of `git status --porcelain -uall`: one per changed, added, renamed (the new name) or
// untracked file, as { path, deleted }. Quoted names (spaces) lose their quotes.
export function changedPathsOf(porcelain) {
  return porcelain
    .split('\n')
    .filter(line => line.length > 3)
    .map(line => {
      const status = line.slice(0, 2);
      const path = line.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
      return { path, deleted: status.includes('D') };
    });
}

// Which domains a changed path points to. Returns { path, domains, reason }: `domains` is the domain names (empty for none)
// and `reason` says why in a few words. A test file follows the registry's test rules (its module, or its `tests` list);
// a file of src/ or scripts/ follows the `src` lists; the repo's build settings are `tooling`; documentation and Claude
// settings map to nothing on purpose; any other path is unowned (`domains` empty and `unowned` true), which the caller prints as a warning, not an error.
export function domainsOfChange({ path, deleted = false }) {
  if (NO_DOMAIN_PREFIXES.some(prefix => path.startsWith(prefix)) || /^[^/]+\.md$/.test(path)) {
    return { path, domains: [], reason: 'documentation or settings, no tests' };
  }
  let domains = [];
  let reason = '';
  if (TOOLING_CONFIG_PATTERNS.some(pattern => matchesPattern(path, pattern))) {
    domains = ['tooling'];
    reason = 'build or check setting';
  } else if (path.startsWith('tests/')) {
    domains = domainsOfTest(path);
    reason = 'test file';
  } else if (path.startsWith('src/') || path.startsWith('scripts/')) {
    domains = domainsOfSource(path);
    reason = 'source file';
  }
  if (domains.length) return { path, domains, reason: `${reason}, owned by ${domains.join(' and ')}` };
  // a deleted file is no longer in the registry's patterns: not worth a warning
  if (deleted) return { path, domains: [], reason: 'deleted, no domain to run' };
  return { path, domains: [], reason: 'no domain owns this path', unowned: true };
}

// The domain names (in registry order) that the changed paths point to, with one printed line per path.
// Returns { lines, domains, unowned } where `unowned` is the paths no domain owns.
export function domainsOfChanges(changes) {
  const mapped = changes.map(domainsOfChange);
  const domains = DOMAIN_NAMES.filter(name => mapped.some(entry => entry.domains.includes(name)));
  return {
    lines: mapped.map(entry => `${entry.path}: ${entry.unowned ? 'WARNING ' : ''}${entry.reason}`),
    domains,
    unowned: mapped.filter(entry => entry.unowned).map(entry => entry.path),
  };
}

// Reads `git status` and prints which domains the changed files select. Returns { domains } or { error }.
function pickChangedDomains() {
  const result = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) return { error: `git status failed: ${result.stderr || result.error}` };
  const picked = domainsOfChanges(changedPathsOf(result.stdout));
  console.log(picked.lines.join('\n') || 'no changed files');
  if (picked.unowned.length) console.warn(`warning: ${picked.unowned.length} changed path(s) are in no domain (see tests/domains.mjs)`);
  return { domains: picked.domains };
}

// Runs a command with the output shown. Returns its exit code (1 when it could not start).
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  return result.status ?? 1;
}

// Prints the selection of each domain, as the run would take it.
async function listSelection(options) {
  const { GROUPS } = await import('../tests/e2e/groups.mjs');
  for (const name of options.domains) {
    const stepsHere = GROUPS.flatMap(group => group.steps).filter(step => step.domain === name).length;
    const groupsHere = GROUPS.filter(group => group.steps.some(step => step.domain === name)).length;
    console.log(`${name}: ${DOMAINS[name].title}`);
    console.log(`  smoke: ${stepsHere} steps in ${groupsHere} groups`);
    for (const [kind, files] of [
      ['unit', unitFilesOf([name], { fast: options.fast })],
      ['sweep', sweepFilesOf([name])],
      ['python', pythonFilesOf([name])],
    ]) {
      if (files.length) console.log(`  ${kind}: ${files.length} files\n${files.map(file => `    ${file}`).join('\n')}`);
    }
  }
}

// Builds the page into a folder of its own, runs the smoke test on it, and removes the folder. Returns the exit code.
async function runSmoke(options) {
  const [esbuild, build] = await Promise.all([import('esbuild'), import('./build/build.mjs')]);
  const privateFolder = mkdtempSync(join(tmpdir(), 'ff14-smoke-'));
  try {
    const result = await esbuild.build(build.esbuildOptions());
    build.writePage(result.outputFiles, build.buildInfo(), join(privateFolder, 'index.html'));
    const domainArgs = options.domainsGiven ? ['--domain', options.domains.join(',')] : [];
    return run(process.execPath, ['tests/e2e/smoke.mjs', ...domainArgs], {
      SMOKE_PAGE: join(privateFolder, 'index.html'),
      SMOKE_OUT: join(privateFolder, 'out'),
    });
  } finally {
    rmSync(privateFolder, { recursive: true, force: true });
  }
}

// Runs what the options select, in the order unit, sweep, Python, smoke; stops at the first failure. Returns the exit code.
export async function main(args) {
  const options = parseArguments(args);
  if (options.error) {
    console.error(options.error);
    return 2;
  }
  if (options.changed) {
    const picked = pickChangedDomains();
    if (picked.error) {
      console.error(picked.error);
      return 2;
    }
    if (!picked.domains.length) {
      console.log('changed: no domain picked, nothing to run');
      console.log('A partial run is a hint only: `npm run check` is still the full gate.');
      return 0;
    }
    options.domains = picked.domains;
    options.domainsGiven = true;
    console.log(`changed: ${picked.domains.join(', ')}`);
  }
  if (options.list) {
    if (!options.changed) await listSelection(options);
    return 0;
  }
  const label = options.domainsGiven ? options.domains.join(', ') : 'all domains';

  const unitFiles = unitFilesOf(options.domains, { fast: options.fast });
  console.log(`unit: ${unitFiles.length} files (${label}${options.fast ? ', fast' : ''})`);
  let code = unitFiles.length ? run(process.execPath, ['--test', ...options.nodeFlags, ...unitFiles]) : 0;

  if (!code && options.sweep) {
    const sweepFiles = sweepFilesOf(options.domains);
    console.log(`sweep: ${sweepFiles.length} files (${label})`);
    if (sweepFiles.length) code = run(process.execPath, ['--test', ...options.nodeFlags, ...sweepFiles]);
  }

  if (!code && options.py) {
    const pythonFiles = pythonFilesOf(options.domains);
    console.log(`python: ${pythonFiles.length} files (${label})`);
    // every generator test is in `data`, so a run that includes it runs the whole folder, as `npm run test:py` does
    if (pythonFiles.length)
      code = run(process.execPath, ['scripts/py.mjs', '-m', 'unittest', 'discover', '-s', 'tests/data', '-p', 'test_*.py']);
  }

  if (!code && options.smoke) {
    console.log(`smoke: ${label}`);
    code = await runSmoke(options);
  }
  if (options.changed) console.log('A partial run is a hint only: `npm run check` is still the full gate.');
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
