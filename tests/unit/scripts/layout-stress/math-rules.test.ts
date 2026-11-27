/* The math bar's rules of the layout stress tool (scripts/layout-stress/math-rules.ts) on made-up measures of the bar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barLayout, expectedBarLayout, judgeMathBar, mathBarState } from '../../../../scripts/layout-stress/math-rules.ts';
import type { MathBar } from '../../../../scripts/layout-stress/types.ts';

/* A bar measure of Stat Allocation at the page's own text size (16 px), one row, with its two dividers in place. */
function oneRowBar(overrides: Partial<MathBar> = {}): MathBar {
  return {
    rem: 16,
    rowWidth: 1280,
    columnGap: 24,
    extraGap: 0,
    overflowX: 'clip',
    sections: [
      {
        id: 'job',
        kind: 'job',
        hasRule: false,
        wideGap: false,
        left: 0,
        top: 100,
        height: 40,
        startsLine: true,
        ruleLeft: 0,
        ruleHeight: 0,
        ruleClear: false,
        ruleShown: false,
      },
      {
        id: 'piece',
        kind: 'divided',
        hasRule: true,
        wideGap: false,
        left: 300,
        top: 100,
        height: 56,
        startsLine: false,
        ruleLeft: 288,
        ruleHeight: 56,
        ruleClear: false,
        ruleShown: true,
      },
      {
        id: 'p-ilgroup',
        kind: 'divided',
        hasRule: true,
        wideGap: false,
        left: 800,
        top: 100,
        height: 56,
        startsLine: false,
        ruleLeft: 788,
        ruleHeight: 56,
        ruleClear: false,
        ruleShown: true,
      },
    ],
    tops: { job: 100, piecesec: 100, piece: 100, sync: 100, il: 100 },
    jobBoxHeight: 40,
    boxHeights: [{ id: '#p-slot', h: 40 }],
    track: 220,
    ...overrides,
  };
}

test('the layout is read from the tops of the Job box, the Piece section, the two chips and the Item level control', () => {
  assert.equal(barLayout({ job: 0, piecesec: 0, piece: 0, sync: 0, il: 0 }), 'one-row');
  assert.equal(barLayout({ job: 0, piecesec: 0, piece: 0, sync: 0, il: 60 }), 'job+piece+sync/il');
  assert.equal(barLayout({ job: 0, piecesec: 0, piece: 0, sync: 60, il: 60 }), 'job+piece/sync+il');
  assert.equal(barLayout({ job: 0, piecesec: 60, piece: 60, sync: 120, il: 180 }), 'other(4 rows)');
  assert.equal(barLayout({ job: 0, piecesec: 0, piece: 0, sync: 0, il: null }), null); // the other sub-tabs have no Item level control
});

test('the breakpoints are 78 rem for one row and 56 rem for three across', () => {
  assert.equal(expectedBarLayout(78 * 16, 16), 'one-row');
  assert.equal(expectedBarLayout(78 * 16 - 1, 16), 'job+piece+sync/il');
  assert.equal(expectedBarLayout(56 * 16, 16), 'job+piece+sync/il');
  assert.equal(expectedBarLayout(56 * 16 - 1, 16), 'job+piece/sync+il');
});

test('a bar that lays out as the breakpoints say, with its dividers in place, has no finding', () => {
  assert.deepEqual(judgeMathBar(oneRowBar()), []);
  assert.deepEqual(judgeMathBar(null), []);
});

test('a bar in the wrong row layout for its width is a finding, but not at a larger text size', () => {
  const stacked = oneRowBar({ tops: { job: 100, piecesec: 100, piece: 100, sync: 100, il: 180 } });
  assert.deepEqual(
    judgeMathBar(stacked).map(item => item.rule),
    ['bar-breakpoints'],
  );
  assert.deepEqual(judgeMathBar({ ...stacked, rem: 24 }), []); // 150% text: any extra row is allowed
});

test('a divider shows exactly when its section is not first on its line, in the middle of the gap, as high as its section', () => {
  const sections = oneRowBar().sections;
  const hiddenMidLine = oneRowBar({ sections: [sections[0], { ...sections[1], ruleShown: false }, sections[2]] });
  assert.match(judgeMathBar(hiddenMidLine)[0].detail, /piece's divider is hidden but the section is in the middle of a line/);
  const shownAtStart = oneRowBar({ sections: [sections[0], { ...sections[1], startsLine: true }, sections[2]] });
  assert.match(judgeMathBar(shownAtStart)[0].detail, /shown but the section starts a line/);
  const offCentre = oneRowBar({ sections: [sections[0], { ...sections[1], ruleLeft: 280 }, sections[2]] });
  assert.match(judgeMathBar(offCentre)[0].detail, /not in the middle of the gap/);
  const short = oneRowBar({ sections: [sections[0], { ...sections[1], ruleHeight: 30 }, sections[2]] });
  assert.match(judgeMathBar(short)[0].detail, /divider is 30 px high, its section 56 px/);
  const noColour = oneRowBar({ sections: [sections[0], { ...sections[1], ruleClear: true }, sections[2]] });
  assert.match(judgeMathBar(noColour)[0].detail, /no colour/);
  assert.match(judgeMathBar(oneRowBar({ overflowX: 'visible' }))[0].detail, /overflow-x visible, not clip/);
});

test('a shown divider needs a section before it on its line; the wide gap after the Job box moves the divider half the extra gap', () => {
  const sections = oneRowBar().sections;
  const alone = oneRowBar({ sections: [{ ...sections[0], top: 10 }, { ...sections[1], top: 100 }, sections[2]] });
  assert.match(judgeMathBar(alone)[0].detail, /shown with no section before it on the line/);
  const wide = oneRowBar({ extraGap: 8, sections: [sections[0], { ...sections[1], wideGap: true, ruleLeft: 300 - 12 - 4 }, sections[2]] });
  assert.deepEqual(judgeMathBar(wide), []);
});

test('in the narrow layout (Job | Piece, then Sync | Item level) the Item level divider has the Sync chip before it', () => {
  const sections = oneRowBar().sections;
  const wrapped = oneRowBar({
    rem: 24, // 150% text: 1280 px is 53 rem, the narrow layout
    tops: { job: 100, piecesec: 100, piece: 100, sync: 180, il: 180 },
    sections: [sections[0], sections[1], { ...sections[2], top: 180 }],
  });
  assert.deepEqual(judgeMathBar(wrapped), []);
  const alone = oneRowBar({
    tops: { job: 100, piecesec: 100, piece: 100, sync: 100, il: 180 },
    sections: [sections[0], sections[1], { ...sections[2], top: 180 }],
  });
  assert.match(judgeMathBar(alone).find(item => item.rule === 'bar-dividers')?.detail ?? '', /no section before it/);
});

test('a box of the bar must be as high as the Job box, and a slider track under 100 px is a finding', () => {
  const findings = judgeMathBar(
    oneRowBar({
      boxHeights: [
        { id: '#p-slot', h: 40 },
        { id: '#p-ilvl', h: 36 },
      ],
      track: 80,
    }),
  );
  assert.deepEqual(
    findings.map(item => item.rule),
    ['bar-box-height', 'bar-slider-track'],
  );
  assert.match(findings[0].detail, /#p-ilvl is 36\.0 px high, the Job box 40\.0 px/);
  assert.deepEqual(judgeMathBar(oneRowBar({ jobBoxHeight: 0, boxHeights: [{ id: '#g-level', h: 36 }], track: null })), []); // GCD Scaling has no Job box
});

test('the bar state names the layout and which dividers show, and is empty without a bar', () => {
  assert.equal(mathBarState(oneRowBar()), 'one-row|job,piece:1,p-ilgroup:1');
  assert.equal(mathBarState(null), '');
});
