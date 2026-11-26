/* Helpers for the look checks of the stories: what a CSS token resolves to, and one computed style of an element, both as the
   browser's own strings, so a test compares an element's colour with the token the page's stylesheet names for it (the dark scheme
   is the config's, so the tokens resolve to the dark values). */
import type { Locator, Page } from 'playwright/test';

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
