/* Playwright Test config for the component stories: one project per engine, the gallery opened from file:// (no server),
   no retries (a flaky story is a bug to fix, not to hide). `npm run test:stories` runs the chromium project,
   `npm run test:stories:all` all three. The gallery is built first by tests/stories/build.ts. */
import { defineConfig, devices } from 'playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const storiesDir = dirname(fileURLToPath(import.meta.url));
const galleryUrl = pathToFileURL(join(storiesDir, 'out/index.html')).href;

/* The options every project shares: the gallery as the base URL, one page reused by the tests of a worker, dark scheme. */
const shared = { baseURL: galleryUrl, serviceWorkers: 'block', reuseContext: true, colorScheme: 'dark' } as const;

export default defineConfig({
  testDir: storiesDir,
  testMatch: '**/*.spec.ts',
  outputDir: join(storiesDir, 'out/results'),
  reporter: 'line',
  retries: 0,
  // the three engines are separate projects, so each gets its own pages and results
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...shared } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...shared } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...shared } },
  ],
});
