/* The rules that belong to the math bar of How the math works (the sticky bar above Stat Allocation, GCD Scaling and Substat
   tiers; src/partials/math-page.html, src/styles/math-bar.css and math-controls.css): its dividers, its row breakpoints and its box heights. They judge
   what `measureView` returns as `mathBar` when a view asks for it (probe.mjs). Pure: plain data in, a list of
   {rule, detail} out. Ported from the Stat Allocation stress script of the math bar port (the probe of j3-stress.mjs). */

/* The widths of the bar's row, in rem, where Stat Allocation's controls change rows (src/styles/math-bar.css): from
   `ONE_ROW_REM` up everything is on one row; from `THREE_ACROSS_REM` the Job box, Piece and Sync settings share a row and the
   Item level control has the next; under that the Job box and Piece share a row, then Sync settings and Item level. */
export const ONE_ROW_REM = 78;
export const THREE_ACROSS_REM = 56;

/* The root font size (px) up to which the breakpoints are checked: a larger text size (125% and more) may add a row. */
const CHECKED_ROOT_PX = 20.01;

/* A rule's place against the gap between sections is exact to this many px. */
const RULE_TOLERANCE = 0.6;

/* The lowest slider track width (px) that still reads as a slider. */
export const MIN_TRACK_PX = 100;

/* How much a box of the bar may differ in height from the Job box (px). */
const BOX_HEIGHT_TOLERANCE = 0.5;

/* The row of controls Stat Allocation has at this measure, one of 'one-row', 'job+piece+sync/il' (the Item level control on
   its own row), 'job+piece/sync+il' or 'other(N rows)'. `tops` holds the top (px) of the Job box (`job`), the Piece section's
   box (`piecesec`), the Substats chip (`piece`), the Sync settings chip (`sync`) and the Item level control (`il`). null when the
   Item level control is not shown (the other sub-tabs). */
export function barLayout(tops) {
  if (tops.il === null || tops.il === undefined) {
    return null;
  }
  const same = (a, b) => Math.abs(tops[a] - tops[b]) < 3;
  const sorted = [tops.job, tops.piecesec, tops.piece, tops.sync, tops.il].sort((a, b) => a - b);
  const rows = 1 + sorted.slice(1).filter((top, index) => top - sorted[index] >= 3).length;
  if (rows === 1) {
    return 'one-row';
  }
  if (same('job', 'piece') && same('piece', 'sync') && !same('sync', 'il')) {
    return 'job+piece+sync/il';
  }
  if (same('job', 'piece') && !same('piece', 'sync') && same('sync', 'il')) {
    return 'job+piece/sync+il';
  }
  return `other(${rows} rows)`;
}

/* The layout the breakpoints give for a row `rowWidth` px wide at root font size `rem` px. */
export function expectedBarLayout(rowWidth, rem) {
  const rems = rowWidth / rem;
  if (rems >= ONE_ROW_REM) {
    return 'one-row';
  }
  return rems >= THREE_ACROSS_REM ? 'job+piece+sync/il' : 'job+piece/sync+il';
}

/* Which dividers show, as text ("afterjob:1,ilgroup:0"), and the layout: the state of the bar that changes at a breakpoint.
   '' when the measure has no bar. */
export function mathBarState(mathBar) {
  if (!mathBar) {
    return '';
  }
  const dividers = mathBar.sections
    .map(section => (section.kind === 'job' ? 'job' : `${section.id}:${section.ruleShown ? 1 : 0}`))
    .join(',');
  return `${barLayout(mathBar.tops) ?? 'no-item-level'}|${dividers}`;
}

/* The findings for the bar measure `mathBar` (probe.mjs, measureView):
   [{rule, detail}] with the rules bar-dividers, bar-breakpoints, bar-box-height and bar-slider-track. */
export function judgeMathBar(mathBar) {
  const out = [];
  if (!mathBar) {
    return out;
  }

  // the row cuts the dividers that land outside it (overflow-x: clip)
  if (mathBar.overflowX !== 'clip') {
    out.push({ rule: 'bar-dividers', detail: `the bar's row has overflow-x ${mathBar.overflowX}, not clip` });
  }

  // each divider shows exactly when its section is not the first on its line, in the middle of the gap, as high as the section
  mathBar.sections.forEach((section, index) => {
    if (section.kind === 'job') {
      if (section.hasRule) {
        out.push({ rule: 'bar-dividers', detail: 'the Job section has a divider' });
      }
      return;
    }
    if (!section.hasRule) {
      out.push({ rule: 'bar-dividers', detail: `${section.id} has no divider` });
      return;
    }
    const extra = section.wideGap ? mathBar.extraGap / 2 : 0;
    if (Math.abs(section.ruleLeft - (section.left - mathBar.columnGap / 2 - extra)) > RULE_TOLERANCE) {
      out.push({ rule: 'bar-dividers', detail: `${section.id}'s divider is not in the middle of the gap` });
    }
    if (Math.abs(section.ruleHeight - section.height) > 1) {
      out.push({
        rule: 'bar-dividers',
        detail: `${section.id}'s divider is ${Math.round(section.ruleHeight)} px high, its section ${Math.round(section.height)} px`,
      });
    }
    if (section.ruleClear) {
      out.push({ rule: 'bar-dividers', detail: `${section.id}'s divider has no colour` });
    }
    if (section.ruleShown === section.startsLine) {
      out.push({
        rule: 'bar-dividers',
        detail: `${section.id}'s divider is ${section.ruleShown ? 'shown' : 'hidden'} but the section ${section.startsLine ? 'starts a line' : 'is in the middle of a line'}`,
      });
    }
    // the Sync chip sits inside the Piece section but is its own place on the line when the bar wraps (Sync | Item level)
    const topsBefore = mathBar.sections.slice(0, index).map(other => other.top);
    if (section.id === 'p-ilgroup' && typeof mathBar.tops.sync === 'number') {
      topsBefore.push(mathBar.tops.sync);
    }
    if (section.ruleShown && !topsBefore.some(top => Math.abs(top - section.top) < 3)) {
      out.push({ rule: 'bar-dividers', detail: `${section.id}'s divider is shown with no section before it on the line` });
    }
  });

  // the row of controls the breakpoints give (checked at the page's own text size)
  const layout = barLayout(mathBar.tops);
  if (layout && mathBar.rem <= CHECKED_ROOT_PX) {
    const expected = expectedBarLayout(mathBar.rowWidth, mathBar.rem);
    if (layout !== expected) {
      out.push({
        rule: 'bar-breakpoints',
        detail: `${layout}, but ${expected} at ${Math.round(mathBar.rowWidth)} px (${(mathBar.rowWidth / mathBar.rem).toFixed(1)} rem)`,
      });
    }
  }

  // every box of the bar is as high as the Job box
  for (const box of mathBar.boxHeights) {
    if (mathBar.jobBoxHeight && Math.abs(box.h - mathBar.jobBoxHeight) > BOX_HEIGHT_TOLERANCE) {
      out.push({
        rule: 'bar-box-height',
        detail: `${box.id} is ${box.h.toFixed(1)} px high, the Job box ${mathBar.jobBoxHeight.toFixed(1)} px`,
      });
    }
  }
  if (mathBar.track !== null && mathBar.track < MIN_TRACK_PX) {
    out.push({ rule: 'bar-slider-track', detail: `the slider track is ${Math.round(mathBar.track)} px wide` });
  }
  return out;
}
