/* The modal dialogs' helpers (src/ui/native-dialog.js): which controls Tab reaches, Tab wrapping inside the dialog, and what is a
   click on the backdrop. Elements are plain objects: the helpers read only a few properties. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onBackdrop, tabStops, wrapTab } from '../../../src/ui/native-dialog.js';

const control = (name, extra = {}) => ({
  name,
  disabled: false,
  tabIndex: 0,
  visibility: 'visible',
  getClientRects: () => [{}],
  focus() {
    focused = this;
  },
  ...extra,
});
let focused = null;
globalThis.getComputedStyle = el => ({ visibility: el.visibility });
const dialogOf = controls => ({ querySelectorAll: () => controls });
const key = (shiftKey = false, name = 'Tab') => ({
  key: name,
  shiftKey,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});
const withActive = (el, run) => {
  globalThis.document = { activeElement: el };
  focused = null;
  run();
};

test('tabStops: shown, enabled controls in the Tab order; hidden, disabled and tabindex -1 ones are left out', () => {
  const list = [
    control('name'),
    control('disabled', { disabled: true }),
    control('hidden panel', { getClientRects: () => [] }),
    control('invisible', { visibility: 'hidden' }),
    control('roving', { tabIndex: -1 }),
    control('ok'),
  ];
  assert.deepEqual(
    tabStops(dialogOf(list)).map(el => el.name),
    ['name', 'ok'],
  );
});

test("wrapTab: Tab on the last control goes to the first, Shift+Tab on the first to the last, any other Tab is the browser's", () => {
  const [first, middle, last] = ['first', 'middle', 'last'].map(name => control(name));
  const dialog = dialogOf([first, middle, last]);
  withActive(last, () => {
    const event = key();
    wrapTab(event, dialog);
    assert.deepEqual([event.prevented, focused], [true, first]);
  });
  withActive(first, () => {
    const event = key(true);
    wrapTab(event, dialog);
    assert.deepEqual([event.prevented, focused], [true, last]);
  });
  withActive(middle, () => {
    for (const shift of [false, true]) {
      const event = key(shift);
      wrapTab(event, dialog);
      assert.deepEqual([event.prevented, focused], [false, null]);
    }
  });
  withActive(first, () => {
    const event = key(false, 'Enter');
    wrapTab(event, dialog);
    assert.equal(event.prevented, false, 'only Tab');
  });
});

test('wrapTab: with the focus on the dialog itself, Shift+Tab goes to the last control; with no control at all, Tab stays put', () => {
  const [first, last] = [control('first'), control('last')];
  withActive({}, () => {
    const event = key(true);
    wrapTab(event, dialogOf([first, last]));
    assert.equal(focused, last);
  });
  withActive({}, () => {
    const event = key();
    wrapTab(event, dialogOf([]));
    assert.equal(event.prevented, true);
  });
});

test('onBackdrop: a click on the dialog element outside its box is the backdrop; on its padding or on a child it is not', () => {
  const dialog = { getBoundingClientRect: () => ({ left: 100, right: 300, top: 50, bottom: 150 }) };
  const click = (target, clientX, clientY) => onBackdrop({ target, clientX, clientY }, dialog);
  assert.equal(click(dialog, 20, 20), true);
  assert.equal(click(dialog, 301, 100), true);
  assert.equal(click(dialog, 150, 149), false, 'inside the box: its own padding');
  assert.equal(click({}, 20, 20), false, 'a child of the dialog');
});
