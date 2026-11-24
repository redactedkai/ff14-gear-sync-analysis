/* How the math works, Piece stats' component (src/ui/components/sync-explainer.js), bound to a plain store as Alpine
   binds it: its views built once per change of their inputs, the item level slider and box, the substat menus, and the
   chart's width. What Piece stats shows is checked in ui/views/sync-explainer.test.js and ui/views/piece.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncExplainer } from '../../../../src/ui/components/sync-explainer.js';
import { syncSettings } from '../../../../src/ui/job-sync-panel.js';

import { OFF_TEXT, explainerItemLevel, explainerView } from '../../../../src/ui/views/sync-explainer.js';
import { restoreOpen } from '../../helpers/common.js';
import { createAppFacade } from '../../helpers/stores.js';

/* The component bound to the store of `saved`, as Alpine binds it ($store.app). */
function bound(saved = { job: 'SGE', sync: true, cap: 123, tab: 'math' }) {
  const app = createAppFacade(restoreOpen(saved));
  return { app, c: Object.assign(syncExplainer(), { $store: { app } }) };
}

test('Piece stats: its views follow the settings, each built once per change', () => {
  const { app, c } = bound();
  const pick = explainerItemLevel(app.jobCtx, syncSettings(app), app.piece);
  assert.deepEqual([c.ilvlRange, c.il], [pick.range, pick.il]);
  assert.deepEqual(c.explainer, explainerView(app.jobCtx, syncSettings(app), app.piece, { piece: 0 }));
  assert.equal(c.steps.cap, 123);
  // the same settings: the same objects
  const first = c.pieceViews;
  assert.equal(c.pieceViews, first);
  assert.equal(c.explainer, first.explainer);
  // the item level, the slot, the substats, the cap and the chart's width are inputs
  for (const change of [
    () => app.editPiece({ ilvl: 130 }),
    () => app.editPiece({ slot: 'body' }),
    () => app.editPiece({ subs: ['det', 'crit'] }),
    () => app.editPanel({ cap: 200 }),
    () => (c.widths.piece = 640),
  ]) {
    const before = c.pieceViews;
    change();
    assert.notEqual(c.pieceViews, before, String(change));
  }
  assert.ok(c.explainer.curveChartSvg.includes('640'), 'the chart is drawn at its box width');
  // no sync: no explainer, and the note says why
  app.editPanel({ sync: false });
  assert.equal(c.explainer, null);
  assert.equal(c.offText, OFF_TEXT.off);
  app.editPanel({ sync: true });
  app.editPanel({ cap: null });
  assert.equal(c.explainer, null);
  assert.equal(c.offText, OFF_TEXT.needCap);
});

test('Piece stats: the item level box holds a value to the slider; Reset goes back to the cap', () => {
  const { app, c } = bound();
  const [lo, hi] = c.ilvlRange;
  c.setIlvl(String(hi + 50));
  assert.equal(app.piece.ilvl, hi);
  assert.equal(c.ilvlFill, 100);
  c.setIlvl(String(lo - 50));
  assert.equal(app.piece.ilvl, lo);
  assert.equal(c.ilvlFill, 0);
  c.setIlvl('abc');
  assert.equal(app.piece.ilvl, lo);
  c.resetIlvl();
  assert.equal(app.piece.ilvl, null);
  assert.equal(c.il, 123);
});

test('Piece stats: the substat menus; a 2nd substat picked as the 1st swaps them', () => {
  const { app, c } = bound();
  assert.deepEqual(
    c.slotOptions.map(o => o.label),
    ['Weapon', 'Head / Hands / Feet', 'Body / Legs', 'Accessories'],
  );
  assert.deepEqual(
    c.substatOptions.map(o => o[0]),
    app.jobCtx.substats,
  );
  assert.deepEqual(app.piece.subs, ['crit', 'sps']);
  assert.ok(!c.substat2Options.some(o => o[0] === 'crit'));
  c.setSub(0, 'sps');
  assert.deepEqual(app.piece.subs, ['sps', 'crit']);
});

test("Piece stats: the chart's box is watched once it is drawn, and its width redraws the chart", () => {
  const { c } = bound();
  const watched = [];
  let report = null;
  const saved = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      report = callback;
    }
    observe(el) {
      watched.push(el);
    }
  };
  try {
    const box = {};
    c.observeChart(box);
    c.observeChart(box);
    assert.deepEqual(watched, [box, box]);
    report([{ contentRect: { width: 512.4 } }]);
    assert.equal(c.widths.piece, 512);
    report([{ contentRect: { width: 0 } }]);
    assert.equal(c.widths.piece, 512, 'a hidden box keeps the last width');
  } finally {
    globalThis.ResizeObserver = saved;
  }
});

test('Piece stats: the Materia slots menu follows the slot; a slot change drops a choice the new slot lacks', () => {
  const { app, c } = bound();
  c.setSlot('ear');
  assert.deepEqual([c.slotCounts, c.slotsShown], [[0, 1, 2, 5], 1]); // accessories: usually 1
  app.editPiece({ slots: 5 });
  c.setSlot('ring');
  assert.deepEqual([app.piece.slot, app.piece.slots, c.slotsShown], ['ring', 5, 5]); // 5 is fine on a ring
  app.editPiece({ slots: 1 });
  c.setSlot('head');
  assert.deepEqual([c.slotCounts, app.piece.slots, c.slotsShown], [[0, 2, 5], null, 2]); // no armor has 1
});
