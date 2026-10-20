/* Warns when an installed package differs from package-lock.json: after a pull that changed the lock, local tests would
   otherwise run other versions than CI (a different Playwright means a different Chromium). Checks the project's own
   dependencies and dev dependencies only, by reading node_modules/<name>/package.json. Never fails: it prints what to
   run and exits 0. Run first by `npm run check`. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/* The installed version of package `name`, found as Node finds it: node_modules here, else in a folder above (a git
   worktree inside the repo uses the main checkout's); null when it is not installed. */
function installedVersion(name) {
  for (let dir = ROOT; ; dir = dirname(dir)) {
    const manifest = resolve(dir, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return readJson(manifest).version;
    if (dirname(dir) === dir) return null;
  }
}

const lock = readJson(resolve(ROOT, 'package-lock.json'));
const own = lock.packages[''];
const names = Object.keys({ ...own.dependencies, ...own.devDependencies });
const mismatches = [];
for (const name of names) {
  const locked = lock.packages[`node_modules/${name}`]?.version;
  const installed = installedVersion(name);
  if (installed !== locked) mismatches.push(`${name}: installed ${installed ?? 'none'}, lock ${locked}`);
}
if (mismatches.length) {
  console.warn(`warning: installed packages differ from package-lock.json; run \`npm ci\`:\n  ${mismatches.join('\n  ')}`);
}
