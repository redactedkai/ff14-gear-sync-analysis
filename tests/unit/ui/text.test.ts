/* The text helpers (src/ui/text.ts): counts in en-US numbers (fmtInt) and the hand-written pair of a sentence (oneOrMany). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtInt, joinNames, oneOrMany } from '../../../src/ui/text.ts';

/* Audit 13, finding 6: counts followed the browser's locale ("1.234" in German reads like a decimal next to "2.48s").
   The default locale of this process cannot be changed, so the test watches which locale the formatter fmtInt keeps is
   made for (the module is loaded again to see it made). */
test('fmtInt: thousands separators in en-US whatever the browser locale', async () => {
  const NumberFormat = Intl.NumberFormat;
  const asked: (string | string[] | undefined)[] = [];
  class SpyingNumberFormat extends NumberFormat {
    constructor(locale?: string | string[], options?: Intl.NumberFormatOptions) {
      asked.push(locale);
      super(locale, options);
    }
  }
  Intl.NumberFormat = SpyingNumberFormat as typeof Intl.NumberFormat;
  try {
    // a query on the path loads the module again; a variable keeps TypeScript from resolving it as a file name
    const freshPath = '../../../src/ui/text.ts?locale-check';
    const fresh: typeof import('../../../src/ui/text.ts') = await import(freshPath);
    assert.equal(fresh.fmtInt(1234567), '1,234,567');
  } finally {
    Intl.NumberFormat = NumberFormat;
  }
  assert.deepEqual(asked, ['en-US']);
  assert.equal(fmtInt(1234567), '1,234,567');
});

test('oneOrMany: the first text for a count of 1, else the second (zero included)', () => {
  assert.equal(oneOrMany(1, 'it', 'them'), 'it');
  assert.equal(oneOrMany(2, 'it', 'them'), 'them');
  assert.equal(oneOrMany(0, 'it', 'them'), 'them');
});

test('joinNames: a list of names as one phrase, every name once and in order', () => {
  assert.equal(joinNames(['Head']), 'Head');
  for (const names of [
    ['Head', 'Food'],
    ['Head', 'Ring 2', 'Food'],
  ]) {
    const phrase = joinNames(names);
    const at = names.map(name => phrase.indexOf(name));
    assert.ok(
      at.every((place, i) => place >= 0 && (i === 0 || place > at[i - 1])),
      phrase,
    );
  }
  assert.notEqual(joinNames(['Head', 'Food']), joinNames(['Food', 'Head']));
  assert.equal(joinNames([]), '');
});
