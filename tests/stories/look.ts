/* Helpers for the look checks of the stories: what a CSS token resolves to, and one computed style of an element, both as the
   browser's own strings, so a test compares an element's colour with the token the page's stylesheet names for it (the dark scheme
   is the config's, so the tokens resolve to the dark values). */
import { expect, type Locator, type Page } from 'playwright/test';

/* The colour a token such as `--gold` resolves to on the page, as the computed `rgb(...)` string of an element painted with it. */
export async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/* One computed style property (camelCase, e.g. `backgroundColor`) of the element the locator names. */
export async function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element)[name as keyof CSSStyleDeclaration] as string, property);
}

/* The computed properties that still tell one element from another when the system forces its colours (the page's colours, tints
   and shadows are replaced by system colours, the opacity stays): the outline, the borders, the weight, the underline and the opacity. */
const FORCED_MARKS = ['outlineStyle', 'borderTopStyle', 'borderLeftStyle', 'fontWeight', 'textDecorationLine', 'opacity'] as const;

/* The marks of an element (FORCED_MARKS) as one string: two elements with the same string look alike in forced colours. */
export async function marksOf(locator: Locator): Promise<string> {
  return locator.evaluate((element, names) => names.map(name => getComputedStyle(element)[name]).join('|'), [...FORCED_MARKS]);
}

/* Whether the element draws a line round itself (a border or an outline), which forced colours keep: its edge against the page. */
export async function hasEdge(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0) || style.outlineStyle !== 'none';
  });
}

/* Whether the element has an outline now (a focus ring). */
export async function hasRing(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
}

/* The forced-colours look of an open menu or popover, which the caller has opened with forced colours on (the check for each
   element is this call and the steps that open it): its `panel` has an edge; its `chosen` row is marked apart from a `plain` row
   (when it has both); and `ring` has a focus ring: a control the keyboard focuses (Shift+Tab and Tab, so that the engines count the
   focus as the keyboard's and draw the ring), or with `lit` the row the keys light, which takes no focus. */
export async function expectForcedColoursLook(
  page: Page,
  { panel, chosen, plain, ring, lit = false }: { panel: Locator; chosen?: Locator; plain?: Locator; ring: Locator; lit?: boolean },
): Promise<void> {
  expect(await hasEdge(panel), 'the open layer has an edge').toBe(true);
  if (chosen && plain) {
    expect(await marksOf(chosen), 'the chosen row is marked apart from a plain row').not.toBe(await marksOf(plain));
  }
  if (!lit) {
    await ring.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(ring).toBeFocused();
  }
  expect(await hasRing(ring), 'the focused or lit row has a ring').toBe(true);
}

/* A tap on the empty corner of the window, far from every story's controls: a press outside whatever is open (a tap on a named
   control could land under the open layer). */
export async function tapOutside(page: Page): Promise<void> {
  await page.touchscreen.tap(1240, 690);
}
