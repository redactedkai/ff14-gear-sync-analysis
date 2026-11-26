/* Helpers for the look checks of the stories: what a CSS token resolves to, and one computed style of an element, both as the
   browser's own strings, so a test compares an element's colour with the token the page's stylesheet names for it (the dark scheme
   is the config's, so the tokens resolve to the dark values). */
import { expect, type Locator, type Page } from 'playwright/test';
import { layerArmed, layerPlaced } from './layers.ts';

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

/* Waits until the element, its `::before` and `::after` and what is inside it have finished their CSS transitions and animations
   (a switch's knob sliding, a track fading). A transition starts at the first frame after the change, so a style read right after
   a click still returns the old value on a runner that answers faster than a frame. */
export async function settled(locator: Locator): Promise<void> {
  await locator.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
  });
}

/* The computed properties that still tell one element from another when the system forces its colours (the page's colours, tints
   and shadows are replaced by system colours, the opacity stays): the outline, the borders, the weight, the underline and the opacity. */
const FORCED_MARKS = ['outlineStyle', 'borderTopStyle', 'borderLeftStyle', 'fontWeight', 'textDecorationLine', 'opacity'] as const;

/* The marks of an element (FORCED_MARKS) as one string: two elements with the same string look alike in forced colours. */
export async function marksOf(locator: Locator): Promise<string> {
  return locator.evaluate((element, names) => names.map(name => getComputedStyle(element)[name]).join('|'), [...FORCED_MARKS]);
}

/* The paint of an element as one string: its fill and border colour, and for its `::before` and `::after` (a tick, a knob) the fill,
   the content, the offset from the left and the transform. In forced colours these are the colours the system forces, so two
   elements with the same string look alike. */
export async function paintOf(locator: Locator): Promise<string> {
  return locator.evaluate(element =>
    [undefined, '::before', '::after']
      .map(pseudo => {
        const style = getComputedStyle(element, pseudo);
        return [style.backgroundColor, style.borderTopColor, pseudo ? [style.content, style.left, style.transform] : []].flat().join(' ');
      })
      .join('|'),
  );
}

/* Whether a part drawn over an element (its `::before` or `::after`: a tick, a knob) shows against what is behind it: the part
   exists (it has content) and its fill is another colour than the element's own fill, or, when the element has none (Firefox
   makes an element's fill see-through and paints the canvas colour behind it), than the first fill behind it up the tree. In
   forced colours these are system colours. */
export async function partShows(locator: Locator, pseudo: '::before' | '::after'): Promise<boolean> {
  return locator.evaluate((element, name) => {
    const part = getComputedStyle(element, name);
    let behind: Element | null = element;
    while (behind && /^rgba\(.*, 0\)$|^transparent$/.test(getComputedStyle(behind).backgroundColor)) {
      behind = behind.parentElement;
    }
    return part.content !== 'none' && part.backgroundColor !== (behind ? getComputedStyle(behind).backgroundColor : 'transparent');
  }, pseudo);
}

/* Expects that two states of a control (ticked and not, on and off, worn and plain) look different in forced colours: their marks
   (FORCED_MARKS) and their paint (`paintOf`) are not the same. */
export async function expectLookApart(first: Locator, second: Locator, message: string): Promise<void> {
  const look = async (locator: Locator) => `${await marksOf(locator)}#${await paintOf(locator)}`;
  expect(await look(first), message).not.toBe(await look(second));
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
  await layerPlaced(panel);
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
   control could land under the open layer). It waits first until Zag watches for a press outside (`layerArmed`). */
export async function tapOutside(page: Page): Promise<void> {
  await layerArmed(page); // Zag watches for a press outside a frame after the layer opens
  await page.touchscreen.tap(1240, 690);
}
