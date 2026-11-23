/* `npm run test:visual`: the screenshot baselines (tests/visual/), compared in the pinned Linux image only.

Screenshots differ between operating systems (fonts, antialiasing), so the baselines in tests/visual/__screenshots__/
are made and checked only by the CI job in the Playwright image named in PINNED_IMAGE (.github/workflows/visual.yml).
That job sets GSA_VISUAL_IMAGE to the image's tag. Anywhere else this command prints why it did nothing and exits 0,
and it is never part of `npm run check`.

Run: npm run test:visual [-- --update] [-- --local] [-- <playwright test options>]
  --update  writes the baselines (the manual "update baselines" workflow does this); only in the pinned image
  --local   runs outside the pinned image against a scratch folder of baselines (GSA_VISUAL_SNAPSHOTS, a path
            you give), never the committed ones: to try the tests, not to judge the page
Exits 0 with a message when it is not in the pinned image or when no baselines exist yet; otherwise the exit code of
Playwright (1 on a difference, with the actual, expected and diff images in tests/visual/test-results/). */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// the Playwright image the baselines belong to: the playwright version of package.json, then the Ubuntu 24.04 build
export const PINNED_IMAGE = 'mcr.microsoft.com/playwright:v1.64.1-noble';
// the environment variable that says the run is inside the pinned image; its value is the image tag
export const IMAGE_ENV = 'GSA_VISUAL_IMAGE';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tests', 'visual', 'playwright.config.mjs');

/* The image tag after the colon of PINNED_IMAGE, which the CI job gives to this script as GSA_VISUAL_IMAGE. */
export function pinnedTag() {
  return PINNED_IMAGE.split(':')[1];
}

/* True when `folder` holds at least one baseline image. */
export function hasBaselines(folder) {
  return existsSync(folder) && readdirSync(folder).some(file => file.endsWith('.png'));
}

/* What to do for the given environment and options: { run: false, message } or { run: true, update }. `snapshotFolder`
   is where the baselines are read from (or written to, with `update`). */
export function plan({ env, argv, snapshotFolder }) {
  const inImage = env[IMAGE_ENV] === pinnedTag();
  const local = argv.includes('--local');
  const update = argv.includes('--update');
  if (!inImage && !local) {
    return {
      run: false,
      message: `test:visual skipped: baselines are made and compared only in ${PINNED_IMAGE} (the Visual workflow). Nothing to do here.`,
    };
  }
  if (local && !env.GSA_VISUAL_SNAPSHOTS) {
    return {
      run: false,
      message: 'test:visual --local needs GSA_VISUAL_SNAPSHOTS=<scratch folder>, so it never touches the committed baselines.',
    };
  }
  if (!update && !hasBaselines(snapshotFolder)) {
    return {
      run: false,
      message:
        'test:visual skipped: no baselines yet. Run the Visual workflow by hand (workflow_dispatch) to make them, then commit the images it uploads.',
    };
  }
  return { run: true, update };
}

/* Runs Playwright's test runner on the visual config with the options that are not ours. */
function main() {
  const argv = process.argv.slice(2);
  const snapshotFolder = resolve(process.env.GSA_VISUAL_SNAPSHOTS || join(root, 'tests', 'visual', '__screenshots__'));
  const decision = plan({ env: process.env, argv, snapshotFolder });
  if (!decision.run) {
    console.log(decision.message);
    return 0;
  }
  const passThrough = argv.filter(arg => arg !== '--local' && arg !== '--update');
  const playwrightCli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js');
  const args = [playwrightCli, 'test', '-c', configPath, ...(decision.update ? ['--update-snapshots', 'all'] : []), ...passThrough];
  return spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root }).status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
