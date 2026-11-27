/* Builds the page the shots are taken of, once before the tests: the live page as it looks (no DEV badge or footer
   branch line, which differ between branches: scripts/build/build.mjs, buildReleasePage), into a private folder in the
   system's temporary folder, so `dist/` stays as it is. The path goes to the test workers through the environment. */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReleasePage } from '../../scripts/build/build.mjs';

// the environment variable that holds the path of the page the visual tests open (set by the global setup)
export const PAGE_ENV = 'GSA_VISUAL_PAGE';

/* Playwright's global setup: returns a teardown-free setup; sets PAGE_ENV to the built page, unless it is already set
   (a page built elsewhere is shot as it is). */
export default async function globalSetup() {
  if (process.env[PAGE_ENV]) {
    return;
  }
  const folder = mkdtempSync(join(tmpdir(), 'gsa-visual-'));
  const pagePath = join(folder, 'page.html');
  await buildReleasePage(pagePath);
  process.env[PAGE_ENV] = pagePath;
}
