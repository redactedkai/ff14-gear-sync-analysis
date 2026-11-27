/* Stat Allocation as one view (src/ui/views/piece-stats.ts): what the <gsa-piece-stats> element shows for Sage under item level
   sync 123 (the owner's case) and under level sync, and the empty state. What each number is lives in sync-explainer.test.ts and
   piece.test.ts; this checks the parts the element adds: the chart's width, the sentences, and the flags of the template. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { syncSettings } from '../../../../src/ui/job-sync-panel.ts';
import { OFF_TEXT, explainerItemLevel, explainerView } from '../../../../src/ui/views/sync-explainer.ts';
import { pieceView } from '../../../../src/ui/views/piece.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { KEEP_LINE, pieceStatsView } from '../../../../src/ui/views/piece-stats.ts';

const sage = makeJobContext('SGE');
const piece = { ilvl: null, slot: 'head', subs: ['crit', 'sps'], slots: null };
const synced = syncSettings({ cap: 123, sync: true, level: 85 });

test('the screen is the explainer and the step table of the piece at the item level the slider shows, with the chart as wide as its box', () => {
  const view = pieceStatsView(sage, synced, piece, { width: 640, switchOn: true });
  const pick = explainerItemLevel(sage, synced, piece);
  assert.deepEqual(view.pick, pick);
  assert.equal(view.offText, '');
  const explainer = mustFind(view.explainer, 'the explainer');
  assert.equal(explainer.curveChartSvg, mustFind(explainerView(sage, synced, piece, { piece: 640 }), 'the explainer').curveChartSvg);
  assert.ok(explainer.curveChartSvg.includes('640'));
  assert.deepEqual(view.steps.summary, pieceView(sage, synced, piece, pick.il).summary);
});

test('an item level above the cap says what the piece gains and loses; at the cap there is one row and no gold', () => {
  const above = pieceStatsView(sage, synced, { ...piece, ilvl: 130 }, { width: 0, switchOn: true });
  const aboveExplainer = mustFind(above.explainer, 'the explainer above the cap');
  assert.equal(aboveExplainer.title, 'An example IL 130 piece, before and after sync');
  assert.equal(aboveExplainer.solo, false);
  assert.equal(aboveExplainer.vsRows.length, 2);
  const capped = pieceStatsView(sage, synced, piece, { width: 0, switchOn: true });
  const cappedExplainer = mustFind(capped.explainer, 'the explainer at the cap');
  assert.equal(cappedExplainer.solo, true, 'one row alone: the table keeps the second row’s space');
  assert.ok(cappedExplainer.bars.every(bar => bar.extraText === ''));
  assert.match(above.steps.rows[0].lostText, /^−\d+$/, 'the step table writes a loss with a minus sign');
  assert.equal(above.steps.rows[0].weightText, `${above.steps.rows[0].w}%`);
});

test('a number line adds the points over the piece at the cap in gold; a piece below the cap adds its melds after the total', () => {
  const body = { ...piece, slot: 'body' };
  const over = mustFind(
    pieceStatsView(sage, synced, { ...body, ilvl: 130 }, { width: 0, switchOn: true }).explainer,
    'the explainer above the cap',
  );
  const second = mustFind(
    over.bars.find(bar => bar.label.startsWith('Spell Speed')),
    'the Spell Speed bar',
  );
  assert.ok(second.extra > 0, 'the 70% line is cut to the full-share cap, above the melded piece’s');
  assert.equal(second.extraText, ` +${second.extra}`);
  assert.equal(over.anyMelds, false, 'a synced piece loses its melds');
  const below = mustFind(
    pieceStatsView(sage, synced, { ...body, ilvl: 120 }, { width: 0, switchOn: true }).explainer,
    'the explainer below the cap',
  );
  const melded = below.bars.filter(bar => bar.melds > 0);
  assert.ok(melded.length > 0 && below.anyMelds);
  for (const bar of melded) {
    assert.equal(bar.meldText, ` +${bar.melds}`);
  }
});

test('no sync: no panels, a sentence that says why, and the step table still shows the piece', () => {
  const unsynced = syncSettings({ cap: null, sync: false, level: 100 });
  const off = pieceStatsView(sage, unsynced, piece, { width: 0, switchOn: false });
  assert.equal(off.explainer, null);
  assert.equal(off.offText, OFF_TEXT.off);
  assert.equal(off.steps.status, 'off');
  const needCap = pieceStatsView(sage, syncSettings({ cap: null, sync: true, level: 100 }), piece, { width: 0, switchOn: true });
  assert.equal(needCap.offText, OFF_TEXT.needCap);
});

test('a line with nothing to say keeps its height with a no-break space, in the table and under it', () => {
  const capped = mustFind(pieceStatsView(sage, synced, piece, { width: 0, switchOn: true }).explainer, 'the explainer at the cap');
  assert.equal(capped.verdict, KEEP_LINE, 'at the cap there is no verdict');
  assert.equal(capped.vsRows[0].materiaNote, KEEP_LINE);
  assert.match(KEEP_LINE, /^\s$/, 'it is one white-space character, not an empty string');
});
