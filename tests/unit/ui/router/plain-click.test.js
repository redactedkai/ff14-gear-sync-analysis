/* Which clicks the page takes over (src/ui/router/plain-click.js): the primary button with no modifier key. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followInPage, plainClick } from '../../../../src/ui/router/plain-click.js';

const click = (overrides = {}) => ({
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  ...overrides,
});

test('a primary-button click with no modifier key is plain', () => {
  assert.equal(plainClick(click()), true);
});

test('Ctrl, Cmd, Shift and Alt each make a click not plain', () => {
  for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
    assert.equal(plainClick(click({ [key]: true })), false, key);
  }
});

test('a middle or secondary button is not plain', () => {
  assert.equal(plainClick(click({ button: 1 })), false);
  assert.equal(plainClick(click({ button: 2 })), false);
});

test('every combination of modifiers but none is not plain', () => {
  const keys = ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'];
  for (let mask = 1; mask < 16; mask += 1) {
    const modifiers = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    assert.equal(plainClick(click(modifiers)), false, JSON.stringify(modifiers));
  }
});

test('followInPage cancels the navigation and moves on a plain click only', () => {
  let moves = 0;
  const plain = click();
  assert.equal(
    followInPage(plain, () => (moves += 1)),
    true,
  );
  assert.equal(plain.prevented, true);
  const withCtrl = click({ ctrlKey: true });
  assert.equal(
    followInPage(withCtrl, () => (moves += 1)),
    false,
  );
  assert.equal(withCtrl.prevented, false);
  assert.equal(moves, 1);
});
