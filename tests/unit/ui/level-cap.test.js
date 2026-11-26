/* The cap follows the level (src/ui/level-cap.js): the rule that lowers a cap and the note under the cap field. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../../../src/ui/state.js';
import {
  CAP_MISSING_FLAG,
  CAP_MISSING_TEXT,
  CAP_TYPED_BAD_TEXT,
  capFlag,
  capLoweredText,
  limitCapToLevel,
} from '../../../src/ui/level-cap.js';
import { MAX_REAL } from '../../../src/core/tables.ts';

/* The cap follows the synced level (owner's decision, 2026-10-18): a cap above the best gear made for the level
   (capCeiling) is lowered to it, never raised, and only while item level sync is on and level sync can apply. */
test('limitCapToLevel: lowers a cap above what the level allows, and leaves every other cap', () => {
  const app = s => Object.assign(defaultState(), { sync: true }, s);
  for (const [cap, level, want] of [
    [500, 50, 135], // level 50's weapons
    [500, 55, 136], // between level caps: the level's own item level
    [700, 90, 665], // Aloalo Island's cap
    [999, 50, 135], // above the highest real item level too
  ]) {
    const a = app({ cap, level });
    assert.deepEqual(limitCapToLevel(a), { from: cap, to: want, level }, `cap ${cap} level ${level}`);
    assert.equal(a.cap, want);
  }
  // at the job's level cap too: the level's ceiling is the highest real item level at level 100
  const top = app({ cap: 999, level: 100 });
  assert.deepEqual(limitCapToLevel(top), { from: 999, to: MAX_REAL, level: 100 });
  for (const s of [
    { cap: 123, level: 50 }, // T13: never raised
    { cap: 135, level: 50 },
    { cap: MAX_REAL, level: 100 }, // no gear above level 100
    { cap: 500, level: 50, sync: false },
    { cap: null, level: 50 },
  ]) {
    const a = app(s);
    assert.equal(limitCapToLevel(a), null, JSON.stringify(s));
    assert.equal(a.cap, s.cap);
  }
});

/* The note under a cap field after limitCapToLevel lowered it: the Job and sync panel and a sheet's page share it. */
test('capLoweredText: names the level, or the highest real item level', () => {
  const byLevel = capLoweredText({ from: 500, to: 405, level: 70 });
  assert.ok(/\b405\b/.test(byLevel) && /\b70\b/.test(byLevel), byLevel);
  const byMax = capLoweredText({ from: 900, to: MAX_REAL, level: null });
  assert.ok(new RegExp(`\\b${MAX_REAL}\\b`).test(byMax), byMax);
  assert.notEqual(byLevel, byMax);
  assert.equal(capLoweredText(null), '');
});

/* The flag in a cap field's label line, in the range's place: a few words with the whole sentence kept for the tooltip. */
test('capFlag: an error wins over a lowered note; a lowered cap says its top; no note is no flag', () => {
  const range = `1–${MAX_REAL}`;
  const lowered = { from: 500, to: 405, level: 70 };
  const note = capLoweredText(lowered);
  const error = capFlag({ error: CAP_TYPED_BAD_TEXT, note: '', lowered: null, range });
  assert.equal(error.kind, 'error');
  assert.ok(error.short.includes(range), error.short);
  assert.equal(error.full, CAP_TYPED_BAD_TEXT);
  // the missing cap has its own short flag, with no range in it, and keeps its whole sentence for the tooltip
  const missing = capFlag({ error: CAP_MISSING_TEXT, missing: true, note: '', lowered: null, range });
  assert.equal(missing.kind, 'error');
  assert.equal(missing.short, CAP_MISSING_FLAG);
  assert.ok(!missing.short.includes(range), missing.short);
  assert.equal(missing.full, CAP_MISSING_TEXT);
  const low = capFlag({ error: '', note, lowered, range });
  assert.equal(low.kind, 'lowered');
  assert.ok(/\b405\b/.test(low.short), low.short);
  assert.equal(low.full, note);
  assert.equal(capFlag({ error: CAP_TYPED_BAD_TEXT, note, lowered, range }).kind, 'error');
  assert.deepEqual(capFlag({ error: '', note: '', lowered: null, range }), { kind: '', short: '', full: '' });
  // a note with nothing lowered behind it (another sheet's, sync off) shows no flag
  assert.equal(capFlag({ error: '', note: '', lowered, range }).kind, '');
});
