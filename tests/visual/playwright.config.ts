/* Playwright's settings for the screenshot baselines (tests/visual/). Run it through `npm run test:visual`
   (scripts/visual.mjs), which makes sure it runs only in the pinned image; docs/engineering/testing.md, "Screenshot
   baselines".

   - Dark scheme only; the fallback fonts only (fonts-stub.ts); animations off; the UTC time zone and the en-US
     locale, so a date drawn on the page (the seeded sheets' created and changed days) is the same on every machine.
   - One folder of baselines, `__screenshots__/`, with no platform in the file name: the baselines are made only by
     the CI job in the pinned Linux image, and compared only there. GSA_VISUAL_SNAPSHOTS names another folder (a
     scratch run on any machine, which compares with itself and never with the committed images).
   - Nothing is retried: a shot that differs once is a finding, not noise. */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotFolder = process.env.GSA_VISUAL_SNAPSHOTS ? resolve(process.env.GSA_VISUAL_SNAPSHOTS) : resolve(here, '__screenshots__');
// the HTML report goes beside the results folder, not inside it: Playwright clears the results folder before it writes the report
const outputFolder = process.env.GSA_VISUAL_OUTPUT ? resolve(process.env.GSA_VISUAL_OUTPUT) : resolve(here, 'test-results');

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  globalSetup: resolve(here, 'global-setup.ts'),
  snapshotPathTemplate: `${snapshotFolder.split('\\').join('/')}/{arg}{ext}`,
  outputDir: outputFolder,
  retries: 0,
  workers: Number(process.env.GSA_VISUAL_WORKERS) || 4,
  timeout: 120_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `${outputFolder}-report` }]],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // zero pixels may differ: the pinned image renders the same page the same way, and a difference is worth a look
      maxDiffPixels: 0,
    },
  },
  use: {
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
    browserName: 'chromium',
  },
});
