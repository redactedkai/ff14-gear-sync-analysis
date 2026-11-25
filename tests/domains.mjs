// The test domains: every file of src/ and scripts/ belongs to one domain (a part of the product a maintainer changes in
// one sitting), and so does every file of tests/. scripts/test.mjs runs one domain's tests, tests/e2e/smoke.mjs one
// domain's browser checks, and tests/unit/scripts/test.domains.test.js fails when a file has no domain or two.
//
// Which domain is a test in?
//   - A unit test follows its module: tests/unit/ui/views/gcd.test.js mirrors src/ui/views/gcd.js, so it takes that file's
//     domain (a `.concern` after the module name is dropped: core/formulas.sync-clamp.test.js mirrors core/formulas.js).
//     Nothing to register. A test that mirrors no module goes in a domain's `tests` list below.
//   - A smoke step names its domain in tests/e2e/groups.mjs, by what the step checks (not by the folder of its file).
//   - A Python generator test (tests/data/) is `data`.
//   - A helper or support file is listed in the `tests` of the domain whose reference or data it holds; a general one is `tooling`.
// A new file of src/ or scripts/ must match a `src` pattern here; a test file that is in none fails the guard.
// Patterns: a path, a trailing `/**` for a folder, `{a,b}` for a choice.

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The domains in the order the docs list them: name -> title, what it owns in `src` (src/ and scripts/), and the test
// and support files its mirror rule does not place (`tests`).
export const DOMAINS = {
  model: {
    title: 'The game number rules: item stats, sync, speed, tiers, food, materia',
    src: [
      'src/core/{base-stats,clamp,clan-bonus,damage-defense,food,formulas,level-params,meld,piece,speed,sync-target,tiers}.js',
      'scripts/validate/**',
    ],
    tests: ['tests/unit/helpers/model-validation.js'],
  },
  data: {
    title: 'The game data and job facts, and the pipeline that generates them',
    src: [
      'src/core/{constants,tables,items,job-context,stat-keys,gear-groups,patches}.js',
      'src/core/item-format.json',
      'src/data/**',
      'scripts/data/**',
      'scripts/perf/db-parse.mjs',
    ],
    tests: ['tests/data/**'],
  },
  solver: {
    title: 'The search for the best gear set, in the core',
    src: [
      'src/core/optimizer/**',
      'src/core/{recipe,same-result,session,set,target-gcd,tier-rank}.js',
      'scripts/perf/{adversarial,args,bench,compare,memory,split,target-gcd-sweep,workloads}.mjs',
    ],
    tests: [
      'tests/sweep/**',
      'tests/unit/helpers/{exact-solver,exhaustive,pins,tier-reference}.js',
      'tests/unit/helpers/optimizer-view-sets.json',
    ],
  },
  'auto-fill': {
    title: 'Auto-fill on the page: settings, run, cancel, worker, suggestion',
    src: [
      'src/ui/{solve,solver,solver-worker}.js',
      'src/ui/sheets/{fill,fill-settings}.js',
      'src/ui/components/set-page/{fill,auto-fill-settings}.js',
      'src/ui/views/set-suggestion.js',
      'scripts/perf/browser.mjs',
    ],
    tests: ['tests/e2e/checks/auto-fill/**', 'tests/e2e/lib/{core,core-worker,init-scripts}.mjs'],
  },
  'set-page': {
    title: "A gear set's page: rows, hand edits, pins, menus, totals",
    src: [
      'src/ui/components/{set-page,meal-menu}.js',
      'src/ui/components/set-page/{draft,frame,leave,menus,page-state,view}.js',
      'src/ui/store/set-page-actions.ts',
      'src/ui/sheets/{saved-set,set-edits}.js',
      'src/ui/views/{limit-rows,meal-menu,piece-menu,set-draft,set-meal-menu,set-rows,set-totals,stone-menu}.js',
      'src/ui/draw-in-steps.js',
      'src/partials/set-page.html',
      'src/styles/{set-page,pieces,fill-settings}.css',
    ],
    tests: [
      'tests/e2e/checks/set-page/**',
      'tests/unit/helpers/{set-page-bind,page-magics}.js',
      'tests/unit/ui/components/set-page/no-alpine-raw.test.js',
    ],
  },
  sheets: {
    title: 'The Sheets tab: manager, a sheet page, dialogs, saved sheets',
    src: [
      'src/ui/components/sheets.js',
      'src/ui/components/sheets/**',
      'src/ui/native-dialog.js',
      'src/ui/sheets/{bonus-options,dialogs,ops,storage,store-shared}.js',
      'src/ui/store/{sheets-actions,sheets-facade}.ts',
      'src/ui/views/{sheet-forms,sheet-manager,sheet-sets,sheet-text}.js',
      'src/ui/{test-data.js,test-sheets.json}',
      'src/partials/{sheet-pages,cap-flag,dialog-error}.html',
      'src/styles/sheets.css',
    ],
    tests: [
      'tests/e2e/checks/sheets/**',
      'tests/e2e/lib/{sheets,fixtures}.mjs',
      'tests/unit/helpers/sheet-fixtures.js',
      'tests/unit/styles/sheets.backdrop-fallback.test.js',
    ],
  },
  'gear-browser': {
    title: 'The Gear browser tab and its filter menus',
    src: [
      'src/ui/components/{gear,filter-menus}.js',
      // the Slot menu, a Lit element (an island in the Gear browser's template)
      'src/ui/elements/gear-browser/**',
      'src/ui/views/gear.js',
      'src/partials/{gear-page,expansion-menu,gear-from-menu}.html',
      'src/styles/gear-browser.css',
    ],
    tests: ['tests/e2e/checks/gear-browser/**', 'tests/e2e/lib/columns.mjs', 'tests/unit/styles/gear-column-tint.test.js'],
  },
  'math-page': {
    title: 'How the math works: Piece stats, Substat tiers, GCD',
    src: [
      'src/ui/components/{sync-explainer,tiers,gcd}.js',
      // the "?" note of Substat tiers, a Lit element (an island in the math page's template)
      'src/ui/elements/math-page/**',
      'src/ui/views/{piece,sync-explainer,tiers,gcd}.js',
      'src/ui/{sync-charts,tier-window}.js',
      'src/partials/math-page.html',
      'src/styles/math-{bar,piece-stats,gcd,tiers,controls}.css',
    ],
    tests: ['tests/e2e/checks/math-page/**', 'tests/unit/ui/views/no-bad-values.test.js'],
  },
  app: {
    title: 'The page frame: tabs, Job and sync strip, Job menu, saved settings, startup, shared controls',
    src: [
      'src/{main.js,index.html,startup-failure.js}',
      // the Lit elements, one folder per domain (this one holds the placeholder counter of the stories chain); `shared` holds
      // what every element uses: the Zag controller and the bridge to the overlay manager
      'src/ui/elements/{app,shared}/**',
      'src/ui/router/**',
      'src/ui/components/{page,compose,overlay,job-menu,cap-controls}.js',
      'src/partials/job-menu.html',
      'src/ui/{state,store-key,job-sync-panel,level-cap,number-commit,number-field,overlays,ranks,hq-font}.js',
      'src/ui/{text,view-cache}.ts',
      'src/ui/store/{store,select,watch,app-state,app-actions,app-facade,page-store,autosave}.ts',
    ],
    tests: [
      'tests/e2e/checks/{settings,saved-state,startup,tabs}/**',
      'tests/e2e/lib/{setup,shared-checks}.mjs',
      'tests/unit/ui/views/level-sync.test.js',
      'tests/unit/startup-failure.test.js',
      'tests/unit/helpers/{fuzz,views}.js',
      'tests/unit/helpers/{store-adapters.ts,stores.js,old-app-store.js}',
      'tests/unit/ui/store/no-direct-writes.test.js',
    ],
  },
  look: {
    title: 'Shared CSS: tokens, themes, layout at the five windows, radii',
    src: ['src/styles/{base,controls,entry,fallbacks,footer,layout,menus,tokens}.css', 'scripts/shots/**'],
    tests: [
      'tests/e2e/checks/look/**',
      'tests/e2e/lib/axe.mjs',
      'tests/e2e/lib/visual.mjs',
      'tests/visual/**',
      'tests/unit/styles/theme-tokens.test.js',
      'tests/unit/styles/layers.test.js',
      'tests/unit/styles/z-index-scale.test.js',
      'tests/unit/helpers/css-colors.js',
    ],
  },
  tooling: {
    title: 'The build, the test runners and the repo code rules',
    src: ['scripts/build/**', 'scripts/layout-stress/**', 'scripts/{check-deps,py,test,visual}.mjs'],
    tests: [
      'tests/domains.mjs',
      // the component stories: the gallery, the fixtures, the config and the stories of every element (one folder per domain)
      'tests/stories/**',
      'tests/e2e/{smoke,groups}.mjs',
      'tests/e2e/lib/{constants,expect,nav}.mjs',
      'tests/unit/helpers/common.js',
      'tests/unit/scripts/**',
      'tests/unit/smoke-helpers/**',
      'tests/unit/ui/no-alpine.test.js',
    ],
  },
};

export const DOMAIN_NAMES = Object.keys(DOMAINS);

// The unit test files whose tests add up to more than LONG_FILE_SECONDS: whole-database and brute-force comparisons. The
// wrapper leaves them out with --fast. They stay in `npm test`, `npm run check` and CI. A new unit file over the limit
// goes here; the list only affects --fast.
export const LONG_FILE_SECONDS = 5;
export const LONG = [
  'tests/unit/core/food.reference.test.js',
  'tests/unit/core/food.test.js',
  'tests/unit/core/items.multi-slot.test.js',
  'tests/unit/core/meld.real-pieces.test.js',
  'tests/unit/core/piece.sync-cap-grid.test.js',
  'tests/unit/core/optimizer/index.exact-solver.test.js',
  'tests/unit/core/optimizer/index.metamorphic.test.js',
  'tests/unit/core/optimizer/index.stat-minimums.test.js',
  'tests/unit/core/optimizer/index.test.js',
  'tests/unit/core/recipe.pins.test.js',
  'tests/unit/core/recipe.real-gear.test.js',
  'tests/unit/core/recipe.round-trip.test.js',
  'tests/unit/core/target-gcd.exhaustive.test.js',
  'tests/unit/ui/components/set-page/fill.best-meals.test.js',
  'tests/unit/ui/sheets/ops.copy-sheet.test.js',
  'tests/unit/ui/sheets/storage.fuzz.test.js',
  'tests/unit/ui/state.fuzz.test.js',
  'tests/unit/ui/views/gear.naive-browser.test.js',
  'tests/unit/ui/views/no-bad-values.test.js',
];

const SKIPPED_FOLDERS = new Set(['__pycache__', 'out', 'node_modules']);

// Every file under `folder` (relative to the repo root), as sorted paths with forward slashes, relative to the root.
// Folders that hold generated or foreign files (`out`, `__pycache__`, `node_modules`) are left out.
// `root` is the repo root; only the guard tests pass another, a temporary tree with a planted file.
export function listFiles(folder, root = ROOT) {
  const found = [];
  const visit = current => {
    for (const name of readdirSync(current)) {
      if (SKIPPED_FOLDERS.has(name)) {
        continue;
      }
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else {
        found.push(relative(root, path).replaceAll('\\', '/'));
      }
    }
  };
  visit(join(root, folder));
  return found.sort();
}

// A pattern with its `{a,b}` choices written out: 'x/{a,b}.js' gives ['x/a.js', 'x/b.js'].
function expandChoices(pattern) {
  const choice = pattern.match(/\{([^}]+)\}/);
  if (!choice) {
    return [pattern];
  }
  return choice[1].split(',').flatMap(option => expandChoices(pattern.replace(choice[0], option)));
}

// True when `file` matches `pattern` (a path, a folder ending in `/**`, or `{a,b}` choices).
export function matchesPattern(file, pattern) {
  return expandChoices(pattern).some(path => (path.endsWith('/**') ? file.startsWith(path.slice(0, -2)) : file === path));
}

// The names of the domains whose `key` list ('src' or 'tests') has a pattern matching `file`.
function domainsListing(file, key) {
  return DOMAIN_NAMES.filter(name => DOMAINS[name][key].some(pattern => matchesPattern(file, pattern)));
}

// The domains that own a file of src/ or scripts/: one name for a correct registry; none or several are guard failures.
export function domainsOfSource(file) {
  return domainsListing(file, 'src');
}

// The src/ file a unit test mirrors, or null: tests/unit/ui/views/gcd.test.js gives src/ui/views/gcd.js; a `.concern` is
// dropped; `index` is a real file in a folder (core/optimizer/index.pinned gives src/core/optimizer/index.js).
export function mirroredModule(testFile, sourceFiles) {
  const parts = testFile.match(/^tests\/unit\/(.+)\/([^/.]+)(?:\.[^/]+)?\.test\.(?:js|ts)$/);
  if (!parts) {
    return null;
  }
  return ['js', 'ts', 'json'].map(ext => `src/${parts[1]}/${parts[2]}.${ext}`).find(path => sourceFiles.has(path)) ?? null;
}

const SOURCE_FILES = new Set(listFiles('src'));

// The domains of a file of tests/: the ones whose `tests` list names it, else the domain of the module it mirrors.
// One name for a correct registry; none or several are guard failures.
export function domainsOfTest(file) {
  const listed = domainsListing(file, 'tests');
  if (listed.length) {
    return listed;
  }
  const module = mirroredModule(file, SOURCE_FILES);
  return module ? domainsOfSource(module) : [];
}

// Splits a list of domain names ('sheets,set-page') and checks each. Returns the names, in the given order; throws an
// Error that lists the valid names for an unknown or empty one.
export function parseDomains(text) {
  const names = text
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  const unknown = names.filter(name => !DOMAIN_NAMES.includes(name));
  if (!names.length || unknown.length) {
    throw new Error(`unknown domain ${unknown.join(', ') || '(none given)'}; the domains are ${DOMAIN_NAMES.join(', ')}`);
  }
  return names;
}

// A test file's name: `.test.js`, or `.test.ts` (Node strips the types when it loads one).
const TEST_FILE = /\.test\.(js|ts)$/;

// The unit test files (tests/unit/**/*.test.{js,ts}) of the named domains, sorted. `fast` leaves out the LONG files.
// `root` is the repo root (another only in the guard tests).
export function unitFilesOf(domainNames, { fast = false, root = ROOT } = {}) {
  return listFiles('tests/unit', root)
    .filter(file => TEST_FILE.test(file))
    .filter(file => domainNames.some(name => domainsOfTest(file).includes(name)))
    .filter(file => !(fast && LONG.includes(file)));
}

// The sweep test files (tests/sweep/*.test.{js,ts}) of the named domains, sorted.
export function sweepFilesOf(domainNames) {
  return listFiles('tests/sweep').filter(file => TEST_FILE.test(file) && domainNames.some(name => domainsOfTest(file).includes(name)));
}

// The Python generator test files (tests/data/test_*.py) of the named domains, sorted.
export function pythonFilesOf(domainNames) {
  return listFiles('tests/data').filter(
    file => /\/test_[^/]*\.py$/.test(file) && domainNames.some(name => domainsOfTest(file).includes(name)),
  );
}
