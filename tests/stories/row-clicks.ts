/* Helpers for the stories of a list whose row opens from a click anywhere on it (the sheet manager's rows and the sheet page's gear set
   rows): where to click, and how to drag across text. The rule itself (which clicks open a row) is `opensRow` in
   `src/ui/elements/sheets/open-row.ts`; these read the real DOM of the rows. */
import type { Locator, Page } from 'playwright/test';

/* Clicks `inset` px inside the right end of `locator`'s box, at its middle: the empty end of a row's line of buttons. */
export async function clickAtRightEnd(page: Page, locator: Locator, inset = 3): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('the part to click at the end of has no box');
  }
  await page.mouse.click(box.x + box.width - inset, box.y + box.height / 2);
}

/* Clicks the point `(x, y)` px from the top left corner of `locator`'s box. */
export async function clickAtPoint(page: Page, locator: Locator, x: number, y: number): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('the part to click in has no box');
  }
  await page.mouse.click(box.x + x, box.y + y);
}

/* Drags the pointer across the first 40 px of `locator`, which selects text there; returns what is selected. */
export async function dragAcross(page: Page, locator: Locator): Promise<string> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('the text to drag across has no box');
  }
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  return page.evaluate(() => String(getSelection()));
}
