/* One screenshot per view of the page (the VIEWS of scripts/shots/views.ts) at 1440 and 960 px wide, dark scheme, full
   page: 72 baselines in `__screenshots__/`. The views, their saved states and their steps are shared with
   `npm run shots`, so a new view there is a new baseline here. */

import { pathToFileURL } from 'node:url';
import { expect, test } from 'playwright/test';
import { VIEWS, openView, prepareContext, viewUrl } from '../../scripts/shots/views.ts';
import { PAGE_ENV } from './global-setup.ts';
import { stubWebFonts } from './fonts-stub.ts';

const WIDTHS = [1440, 960];
const VIEWPORT_HEIGHT = 900;

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const [name, view] of Object.entries(VIEWS)) {
      test(name, async ({ context, page }) => {
        await stubWebFonts(context);
        await prepareContext(context, view);

        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        const builtPage = process.env[PAGE_ENV];
        if (!builtPage) {
          throw new Error(`${PAGE_ENV} is not set: the global setup builds the page`);
        }
        await page.goto(viewUrl(pathToFileURL(builtPage).href, view));
        await openView(page, view);

        expect(pageErrors, 'script errors on the page').toEqual([]);
        const sidewaysPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sidewaysPx, 'sideways scroll').toBeLessThanOrEqual(0);
        await expect(page).toHaveScreenshot(`${name}-${width}-dark.png`, {
          fullPage: true,
          maxDiffPixels: ('maxDiffPixels' in view ? view.maxDiffPixels : undefined) ?? 0,
        });
      });
    }
  });
}
