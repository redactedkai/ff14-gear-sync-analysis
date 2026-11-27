/* The number boxes (src/ui/number-field.ts: numberBox): what a box commits on Enter or leaving it, for each
   of its options, and after typing stops. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPING_DEBOUNCE_MS, numberBox } from '../../../src/ui/number-field.ts';
import { TARGET_GCD_RANGE } from '../../../src/ui/job-sync-panel.ts';
import type { NumberBoxOptions } from '../../../src/ui/number-field.ts';
import { FakeInput, FakeInputEvent, dispatchTo, stubGlobal } from '../helpers/dom-fakes.ts';

/* A box bound to one value: {value(), leave(text), type(text), step(text)}; leave types `text` and leaves the box. */
function box(start: number | string, lo: number, hi: number | (() => number), options: NumberBoxOptions<string> = {}) {
  let value = start;
  const field = numberBox(
    () => value,
    (v: number | string) => {
      value = v;
    },
    lo,
    hi,
    options,
  );
  /* types `text` and leaves the box; returns what the box shows afterwards */
  const leave = (text: string): string => {
    const input = new FakeInput(text);
    dispatchTo(input, field.onChange, new Event('change'));
    return input.value;
  };
  /* types `text` (a typed edit: an InputEvent with an inputType) */
  const type = (text: string): void => dispatchTo(new FakeInput(text), field.onInput, new FakeInputEvent('insertText'));
  /* steps the box to `text` with the mouse wheel or an arrow key (an input event with no inputType) */
  const step = (text: string): void => dispatchTo(new FakeInput(text), field.onInput, new Event('input'));
  return { value: () => value, leave, type, step };
}

/* Owner, 2026-10-19: scrolling through the Synced item level did not move the Target GCD range until it stopped. */
test('number box: a step (wheel, arrow keys) commits at once; typed digits wait for typing to stop', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = box(300, 1, 795);
  b.step('301');
  assert.equal(b.value(), 301);
  b.type('3');
  assert.equal(b.value(), 301);
  t.mock.timers.tick(300);
  assert.equal(b.value(), 3);
});

test('number box: whole values; empty commits nothing', () => {
  const b = box(50, 1, 100);
  b.leave('80.4');
  assert.equal(b.value(), 80);
  b.leave('');
  assert.equal(b.value(), 80);
});

/* Owner, 2026-10-19: a negative filter value was ignored while the box kept showing it, so the box and the search
   disagreed. Leaving the box now moves the value to the nearest bound and shows it. */
test('number box: leaving it with a value out of range moves it to the nearest bound, shown in the box', () => {
  const b = box(50, 1, 100);
  assert.equal(b.leave('101'), 100);
  assert.equal(b.value(), 100);
  assert.equal(b.leave('-5'), 1);
  assert.equal(b.value(), 1);
  const filter = box('', 1, Infinity, { empty: '' });
  assert.equal(filter.leave('-5'), 1);
  assert.equal(filter.value(), 1);
  const gcd = box('', 0.5, Infinity, { decimals: 2, empty: '' });
  assert.equal(gcd.leave('0.1'), 0.5);
  assert.equal(gcd.value(), 0.5);
});

test('number box: while typing, a value out of range commits nothing ("9" on the way to "90")', () => {
  const b = box(50, 10, 100, { live: true });
  b.type('9');
  assert.equal(b.value(), 50);
  b.type('90');
  assert.equal(b.value(), 90);
});

test('number box: snap false keeps an out-of-range value out on leaving too (the sync cap explains it)', () => {
  const cap = box(123, 1, Infinity, { snap: false });
  assert.equal(cap.leave('0'), '0');
  assert.equal(cap.value(), 123);
});

/* Owner, 2026-11-20: typing 1.5 in the sync cap showed its error for a moment, then the error went and the box kept "1.5" while the
   cap was 2 (the box rounded it and committed it). A box that explains its errors keeps such a value out, as it does 0. */
test('number box: snap false keeps a value with more digits than the box takes out (1.5 is not rounded to 2)', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cap = box(123, 1, Infinity, { snap: false });
  cap.type('1.5');
  t.mock.timers.tick(TYPING_DEBOUNCE_MS);
  assert.equal(cap.value(), 123, 'not committed after typing stops');
  assert.equal(cap.leave('1.5'), '1.5', 'the box keeps what was typed');
  assert.equal(cap.value(), 123, 'and not on leaving either');
  cap.leave('12');
  assert.equal(cap.value(), 12, 'a whole number still commits');
  // a box that snaps rounds as before
  const snapping = box(50, 1, 100);
  snapping.leave('1.5');
  assert.equal(snapping.value(), 2);
});

test('number box: a bound may be read at each input (the job level cap)', () => {
  let cap = 80;
  const b = box(50, 1, () => cap);
  b.leave('90');
  assert.equal(b.value(), 80);
  cap = 100;
  b.leave('90');
  assert.equal(b.value(), 90);
});

/* Audit 02, finding 10: the gear filters and the Target GCD were plain boxes. They keep what they
   took: an emptied filter is no limit (''), and the GCD keeps hundredths. */
test("number box options: empty commits a filter's '' and decimals keeps the GCD's hundredths", () => {
  const filter = box(150, 1, Infinity, { empty: '' });
  filter.leave('9999');
  assert.equal(filter.value(), 9999);
  filter.leave('');
  assert.equal(filter.value(), '');
  const gcd = box('', 0.5, Infinity, { decimals: 2, empty: '' });
  gcd.leave('2.40');
  assert.equal(gcd.value(), 2.4);
  gcd.leave('2.475');
  assert.equal(gcd.value(), 2.48);
});

test('number box options: onEmpty runs when an empty box is left, with the box', () => {
  const seen: string[] = [];
  const b = box(70, 1, 100, { live: true, onEmpty: input => seen.push(input.value) });
  b.leave('60');
  b.leave('');
  assert.equal(b.value(), 60);
  assert.deepEqual(seen, ['']);
});

/* Typing waits for the keys to stop: a box commits TYPING_DEBOUNCE_MS after the last keystroke, once, with the last
   value; a live box (the synced level) commits each valid value at once. */
test('number box typing: one commit after the keys stop, of the last value; a live box commits each value at once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commits: number[] = [];
  const field = numberBox(
    () => commits.at(-1) ?? 50,
    v => commits.push(v),
    1,
    999,
  );
  const type = (text: string): void => dispatchTo(new FakeInput(text), field.onInput, new FakeInputEvent('insertText'));
  type('1');
  type('12');
  t.mock.timers.tick(TYPING_DEBOUNCE_MS - 1);
  type('123');
  t.mock.timers.tick(TYPING_DEBOUNCE_MS - 1);
  assert.deepEqual(commits, []);
  t.mock.timers.tick(1);
  assert.deepEqual(commits, [123]);
  // Enter or leaving the box before the wait ends commits at once, and the waiting commit is dropped
  type('130');
  dispatchTo(new FakeInput('130'), field.onChange, new Event('change'));
  t.mock.timers.tick(TYPING_DEBOUNCE_MS);
  assert.deepEqual(commits, [123, 130]);

  const live: number[] = [];
  const level = numberBox(
    () => live.at(-1) ?? 100,
    v => live.push(v),
    1,
    100,
    { live: true },
  );
  for (const text of ['9', '90', '900']) {
    dispatchTo(new FakeInput(text), level.onInput, new Event('input'));
  }
  assert.deepEqual(live, [9, 90]); // 900 is out of range
});

test('Target GCD box: 0.50 to 2.50 seconds; a value outside moves to the nearest end when the box is left', () => {
  const gcd = box('', ...TARGET_GCD_RANGE, { decimals: 2, empty: '' });
  assert.equal(gcd.leave('3.00'), 2.5);
  assert.equal(gcd.value(), 2.5);
  assert.equal(gcd.leave('0.2'), 0.5);
  assert.equal(gcd.value(), 0.5);
});

/* A draw that runs again because another setting of the same part changed (a Gear categories box changed the Gear
   browser's filters) must leave the text typed in this box alone: only a change of this box's own stored value rewrites it. */
test('number box: a run of the binding that finds the stored value unchanged keeps the text typed in the box, focused or not', () => {
  const restoreDocument = stubGlobal('document', { activeElement: null });
  try {
    let stored: number | '' = 61;
    const field = numberBox(
      () => stored,
      v => {
        stored = v;
      },
      1,
      Number.POSITIVE_INFINITY,
      { empty: '' },
    );
    const input = new FakeInput();
    const run = () => field.shownValue(input);
    input.value = String(run()); // the first run shows the stored value
    assert.equal(input.value, '61');
    input.value = '60.7'; // typed, committed as 61, box left
    assert.equal(run(), '60.7', 'another setting of the part changed: the typed text stays');
    stored = 70; // this box's own setting changed (a reset, the address): the box shows it
    assert.equal(run(), 70);
    input.value = '';
    assert.equal(run(), '', 'an emptied box stays empty while its setting is unchanged');
    stored = '';
    assert.equal(run(), '');
  } finally {
    restoreDocument();
  }
});

test('number box: a typed value the setting lowers back to what it was is shown lowered, not kept as typed', async () => {
  const restoreDocument = stubGlobal('document', { activeElement: null });
  try {
    let stored = 135; // a cap the level allows; 500 is lowered to it
    const field = numberBox(
      () => stored,
      v => {
        stored = Math.min(v, 135);
      },
      1,
      795,
    );
    const input = new FakeInput();
    const run = () => field.shownValue(input);
    input.value = String(run());
    input.value = '500';
    dispatchTo(input, field.onChange, new Event('change')); // typed and left: the setting ends where it was
    assert.equal(stored, 135);
    assert.equal(run(), 135, 'the page updates the box after the box wrote');
    await Promise.resolve(); // the page has updated
    input.value = '134.6';
    assert.equal(run(), '134.6', 'a later run that finds the setting unchanged keeps the typed text');
  } finally {
    restoreDocument();
  }
});

/* A Lit element draws for its own reasons (the flag of the text typed) before the page has stored what the box committed: that draw
   must not put the old value back over the text. */
test('number box: a draw after a commit and before the page stores it keeps the text typed ("60.7" for the 61 on its way)', async () => {
  const input = new FakeInput();
  const restoreDocument = stubGlobal('document', { activeElement: input });
  try {
    let stored = 60;
    let committed: number | undefined;
    const field = numberBox(
      () => stored,
      v => {
        committed = v;
      },
      1,
      100,
      { live: true },
    );
    const run = () => field.shownValue(input);
    input.value = String(run());
    input.value = '60.7';
    dispatchTo(input, field.onInput, new FakeInputEvent('insertText'));
    assert.equal(committed, 61);
    assert.equal(run(), '60.7', 'the page still holds 60');
    stored = committed;
    assert.equal(run(), '60.7', 'the page now holds 61');
    await Promise.resolve();
    assert.equal(run(), '60.7', 'a later run finds the stored value unchanged');
  } finally {
    restoreDocument();
  }
});
