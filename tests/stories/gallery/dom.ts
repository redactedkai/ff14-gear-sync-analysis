/* Helpers for the stories' event handlers, which read the page: `event.currentTarget` and query results come back as loose DOM
   types, and these narrow them to the element's class (a wrong shape throws a readable error in the gallery, which the
   fixture reports as a page error). */

/* The class of an element, as `instanceof` takes it. */
type ElementClass<Found> = abstract new (...args: never[]) => Found;

/* The element a listener sits on (`event.currentTarget`), as an instance of `kind` (HTMLElement for any element). Throws when
   the listener is on something else. */
export function listenerElement(event: Event): HTMLElement;
export function listenerElement<Found extends HTMLElement>(event: Event, kind: ElementClass<Found>): Found;
export function listenerElement(event: Event, kind: ElementClass<HTMLElement> = HTMLElement): HTMLElement {
  const target = event.currentTarget;
  if (!(target instanceof kind)) {
    throw new Error(`the listener is not on a ${kind.name}`);
  }
  return target;
}

/* The first element under `root` that matches `selector`, as an instance of `kind`. Throws when there is none. */
export function findElement<Found extends Element>(root: ParentNode, selector: string, kind: ElementClass<Found>): Found {
  const found = root.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`no ${kind.name} matches ${selector}`);
  }
  return found;
}

/* The ancestor of `start` (or `start` itself) that matches `selector`. Throws when there is none. */
export function closestElement(start: Element, selector: string): HTMLElement {
  const found = start.closest(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ancestor matches ${selector}`);
  }
  return found;
}
