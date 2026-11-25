// Assertions: the per-group record of failed checks, and the expect polling assertions (the plain playwright library has none).

import assert from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BAD_WORDS, TIMEOUT } from './constants.mjs';

// Each group of steps runs on its own page, in parallel with the others. Its failed checks and the page's JS and
// console errors go to its own record (found through the async context), so the output is the same in every run.
export const stepRecord = new AsyncLocalStorage();

export function check(cond, msg) {
  if (!cond) {
    stepRecord.getStore().failures.push(msg);
  }
  return cond;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

const norm = s => s.replace(/\s+/g, ' ').trim();

// True when `text` holds the number `want` as a whole word: 12 is not found in "120" or "2.12", "1,839" holds 1,839 only.
const hasWholeNumber = (text, want) => new RegExp(`(^|[^\\w.,])${String(want).replace('.', '\\.')}($|[^\\w])`).test(text);

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function poll(what, fn) {
  const end = Date.now() + TIMEOUT;
  let last = 'nothing read';
  for (;;) {
    try {
      const r = await fn();
      if (r.ok) {
        return;
      }
      last = r.got;
    } catch (e) {
      last = String(e.message).split('\n')[0];
    }
    if (Date.now() > end) {
      throw new assert.AssertionError({ message: `expect ${what}: last seen ${JSON.stringify(last)}` });
    }
    await sleep(50);
  }
}

export function expect(loc) {
  const make = neg => {
    const m = (what, read, test) =>
      poll(`${loc} ${neg ? 'not ' : ''}${what}`, async () => {
        const got = await read();
        const hit = test(got);
        return { ok: neg ? !hit : hit, got };
      });
    const text = () => loc.textContent({ timeout: 500 }).then(norm);
    const textTest = want => got => (want instanceof RegExp ? want.test(got) : got === want);
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
      toHaveText: want => m(`to have text ${want}`, text, textTest(typeof want === 'string' ? norm(want) : want)),
      toContainText: want => m(`to contain text ${want}`, text, g => g.includes(norm(want))),
      // The text holds the number `want` as a whole word (12 is not found in 120). For a note or label: the inputs it must reflect, not its sentence.
      toHaveNumber: want => m(`to have the number ${want}`, text, g => hasWholeNumber(g, want)),
      // The text holds every one of `parts`, in any order: a string as a substring (names, labels), a number as a whole word.
      toHaveTextParts: parts =>
        m(`to have the text parts ${JSON.stringify(parts)}`, text, g =>
          parts.every(part => (typeof part === 'number' ? hasWholeNumber(g, part) : g.includes(norm(part)))),
        ),
      toHaveAttribute: (name, want) =>
        m(
          `to have attribute ${name}=${want}`,
          () => loc.getAttribute(name, { timeout: 500 }),
          g => g === want,
        ),
      toHaveValue: want =>
        m(
          `to have value ${want}`,
          () => loc.inputValue({ timeout: 500 }),
          g => g === want,
        ),
      toHaveCount: want =>
        m(
          `to have count ${want}`,
          () => loc.count(),
          g => g === want,
        ),
    };
  };
  return { ...make(false), not: make(true) };
}

export async function checkNoBadText(pg, where) {
  const txt = await pg.innerText('body');
  for (const bad of BAD_WORDS) {
    check(!txt.includes(bad), `"${bad}" visible in ${where}`);
  }
}
