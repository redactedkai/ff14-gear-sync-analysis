// Assertions: the per-group record of failed checks, and the expect polling assertions (the plain playwright library has none).

import assert from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Locator, Page } from 'playwright';
import { BAD_WORDS, TIMEOUT } from './constants.ts';
import { boxStillForFrames } from './layer-wait.ts';

// Each group of steps runs on its own page, in parallel with the others. Its failed checks and the page's JS and
// console errors go to its own record (found through the async context), so the output is the same in every run.
export interface StepRecord {
  /* The names of the group's steps, joined. */
  name: string;
  /* The page's JavaScript and console errors. */
  errors: string[];
  /* The failed checks and the steps that threw. */
  failures: string[];
  /* The known failures seen (KNOWN_LOW_CONTRAST, KNOWN_MENU_OVERFLOW), by their key: printed, never counted. */
  known: Map<string, string>;
  /* Each step's name and its time in ms. */
  steps: [string, number][];
}
export const stepRecord = new AsyncLocalStorage<StepRecord>();

/** The record of the group this code runs in (a check outside a group is a bug in the test). */
export function currentRecord(): StepRecord {
  const record = stepRecord.getStore();
  if (!record) {
    throw new Error('no step record: a check ran outside a group');
  }
  return record;
}

/** Records the failure `msg` when `cond` is false, and returns `cond`, so the run goes on. */
export function check(cond: unknown, msg: string): boolean {
  if (!cond) {
    currentRecord().failures.push(msg);
  }
  return Boolean(cond);
}

/** `value`, or a thrown error naming `what` when it is null or undefined: the typed way to say that a lookup (a bounding box, a
 * find) must have found something. The failure is the step's, recorded by the runner. */
export function mustFind<Value>(value: Value | null | undefined, what: string): Value {
  if (value === null || value === undefined) {
    throw new Error(`not found: ${what}`);
  }
  return value;
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// True when `text` holds the number `want` as a whole word: 12 is not found in "120" or "2.12", "1,839" holds 1,839 only.
const hasWholeNumber = (text: string, want: number | string) =>
  new RegExp(`(^|[^\\w.,])${String(want).replace('.', '\\.')}($|[^\\w])`).test(text);

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Polls `fn` (every 50 ms, up to TIMEOUT) until it returns `ok`; throws with the last `got` otherwise. */
export async function poll(what: string, fn: () => Promise<{ ok: boolean; got: unknown }>): Promise<void> {
  const end = Date.now() + TIMEOUT;
  let last: unknown = 'nothing read';
  for (;;) {
    try {
      const r = await fn();
      if (r.ok) {
        return;
      }
      last = r.got;
    } catch (e) {
      last = String(e instanceof Error ? e.message : e).split('\n')[0];
    }
    if (Date.now() > end) {
      throw new assert.AssertionError({ message: `expect ${what}: last seen ${JSON.stringify(last)}` });
    }
    await sleep(50);
  }
}

/** Wait until Zag has placed the popover whose content matches `selector`. Zag shows a popover a frame before it places it: until
 * then its positioner has no `--y` and sits above the window (translated up by 100vh), so a box measured right after the popover
 * turns visible is not where a player sees it. */
export async function placedByZag(pg: Page, selector: string) {
  await poll(`the popover ${selector} to be placed by Zag`, async () => {
    const offset = await pg.evaluate((sel: string) => {
      const positioner = document.querySelector(sel)?.closest('[data-part="positioner"]');
      return positioner ? getComputedStyle(positioner).getPropertyValue('--y') : 'no positioner';
    }, selector);
    return { ok: offset !== '' && offset !== 'no positioner', got: offset || 'not placed yet' };
  });
  // placed once is not placed for good: Zag moves a layer again (it sizes, flips and shifts it), so the box must hold still for a few frames
  await pg.locator(selector).evaluate(boxStillForFrames);
}

/** Wait until the focus is on the layer matching `selector` or inside it. Zag moves the focus into a dialog or menu a frame after it
 * opens (to the control the layer names, or the layer itself), and a key or a `fill` before that lands on whatever had the focus: a
 * `fill` into one box, then the move to the first box, puts the text into the wrong box. Wait here before typing into a layer
 * whose first control is not the one typed into. */
export async function focusInsideLayer(pg: Page, selector: string) {
  await poll(`the focus to be inside ${selector}`, async () => {
    const got = await pg.evaluate((sel: string) => document.querySelector(sel)?.contains(document.activeElement) ?? false, selector);
    return { ok: got, got };
  });
}

export function expect(loc: Locator) {
  const make = (neg: boolean) => {
    const m = <T>(what: string, read: () => Promise<T>, test: (got: T) => boolean) =>
      poll(`${loc} ${neg ? 'not ' : ''}${what}`, async () => {
        const got = await read();
        const hit = test(got);
        return { ok: neg ? !hit : hit, got };
      });
    const text = () => loc.textContent({ timeout: 500 }).then(raw => norm(raw ?? ''));
    const textTest = (want: string | RegExp) => (got: string) => (want instanceof RegExp ? want.test(got) : got === want);
    return {
      toBeAttached: () =>
        m(
          'to be attached',
          async () => (await loc.count()) > 0,
          g => g,
        ),
      toBeVisible: () =>
        m(
          'to be visible',
          () => loc.isVisible(),
          g => g,
        ),
      toBeHidden: () =>
        m(
          'to be hidden',
          () => loc.isVisible(),
          g => !g,
        ),
      toBeEnabled: () =>
        m(
          'to be enabled',
          () => loc.isEnabled({ timeout: 500 }),
          g => g,
        ),
      toBeDisabled: () =>
        m(
          'to be disabled',
          () => loc.isEnabled({ timeout: 500 }),
          g => !g,
        ),
      toHaveText: (want: string | RegExp) => m(`to have text ${want}`, text, textTest(typeof want === 'string' ? norm(want) : want)),
      toContainText: (want: string) => m(`to contain text ${want}`, text, g => g.includes(norm(want))),
      // The text holds the number `want` as a whole word (12 is not found in 120). For a note or label: the inputs it must reflect, not its sentence.
      toHaveNumber: (want: number | string) => m(`to have the number ${want}`, text, g => hasWholeNumber(g, want)),
      // The text holds every one of `parts`, in any order: a string as a substring (names, labels), a number as a whole word.
      toHaveTextParts: (parts: (string | number)[]) =>
        m(`to have the text parts ${JSON.stringify(parts)}`, text, g =>
          parts.every(part => (typeof part === 'number' ? hasWholeNumber(g, part) : g.includes(norm(part)))),
        ),
      toHaveAttribute: (name: string, want: string | null) =>
        m(
          `to have attribute ${name}=${want}`,
          () => loc.getAttribute(name, { timeout: 500 }),
          g => g === want,
        ),
      toHaveValue: (want: string) =>
        m(
          `to have value ${want}`,
          () => loc.inputValue({ timeout: 500 }),
          g => g === want,
        ),
      toHaveCount: (want: number) =>
        m(
          `to have count ${want}`,
          () => loc.count(),
          g => g === want,
        ),
    };
  };
  return { ...make(false), not: make(true) };
}

export async function checkNoBadText(pg: Page, where: string) {
  const txt = await pg.innerText('body');
  for (const bad of BAD_WORDS) {
    check(!txt.includes(bad), `"${bad}" visible in ${where}`);
  }
}
