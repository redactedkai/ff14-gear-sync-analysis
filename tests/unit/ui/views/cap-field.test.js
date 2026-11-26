/* What the item level field and the level field show (src/ui/views/cap-field.ts): the one set of rules behind the Gear browser's strip, the
   Sync settings popover, a sheet's page and the Sheets dialogs. The sentences themselves are asserted in ui/level-cap.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.ts';
import { CAP_MISSING_TEXT, CAP_TYPED_BAD_TEXT, LEVEL_TEXT, capLoweredText, rangeOnly } from '../../../../src/ui/level-cap.ts';
import { capFieldView, levelFieldView } from '../../../../src/ui/views/cap-field.ts';

const NO_FLAG = { kind: '', short: '', full: '' };
const lowered = { from: 500, to: 405, level: 70 };

test('item level field: with sync off it asks nothing and shows no error or note, whatever it holds', () => {
  const view = capFieldView({ syncOn: false, value: null, typedBad: true, lowered, max: MAX_REAL });
  assert.deepEqual([view.error, view.note, view.flag], ['', '', NO_FLAG]);
  assert.equal(view.range, `1–${MAX_REAL}`);
});

test('item level field: with sync on, no cap and text that is no cap are different errors, the text first', () => {
  const missing = capFieldView({ syncOn: true, value: null, typedBad: false, lowered: null, max: MAX_REAL });
  assert.equal(missing.error, CAP_MISSING_TEXT);
  assert.equal(missing.flag.kind, 'error');
  assert.notEqual(missing.flag.short, rangeOnly(missing.range), 'a missing cap says to enter one, not the range');
  const bad = capFieldView({ syncOn: true, value: null, typedBad: true, lowered: null, max: MAX_REAL });
  assert.deepEqual([bad.error, bad.flag.short], [CAP_TYPED_BAD_TEXT, rangeOnly(bad.range)]);
  assert.equal(capFieldView({ syncOn: true, value: 300, typedBad: false, lowered: null, max: MAX_REAL }).error, '');
});

test('item level field: a lowered cap is a note with a "Max" flag; an error takes its place', () => {
  const shown = capFieldView({ syncOn: true, value: 405, typedBad: false, lowered, max: MAX_REAL });
  assert.deepEqual([shown.error, shown.note, shown.flag.kind, shown.flag.short], ['', capLoweredText(lowered), 'lowered', 'Max 405']);
  assert.equal(shown.flag.full, shown.note, 'the flag carries the whole sentence for the tooltip');
  const bad = capFieldView({ syncOn: true, value: 405, typedBad: true, lowered, max: MAX_REAL });
  assert.deepEqual([bad.note, bad.flag.kind], ['', 'error']);
});

test('level field: text that is no level is an error with the range and "only"; a level shows the range', () => {
  const ok = levelFieldView({ typedBad: false, max: 100 });
  assert.deepEqual([ok.range, ok.error, ok.flag], [LEVEL_TEXT.range(100), '', NO_FLAG]);
  const bad = levelFieldView({ typedBad: true, max: 80 });
  assert.deepEqual(
    [bad.error, bad.flag],
    [LEVEL_TEXT.typedBad(80), { kind: 'error', short: rangeOnly(LEVEL_TEXT.range(80)), full: LEVEL_TEXT.typedBad(80) }],
  );
});
