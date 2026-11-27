/* The width sweep of one view: one page is reached once and resized from 960 to 2560 px (a coarse step, then each change
   bisected to 1 px, breakpoints.ts). It gives the breakpoint table, the rules judged at every width, `widening-adds-rows`,
   and `resize-equals-fresh` (the resized page against a page loaded at the same width, and against itself narrowing). */
import { findChangePoints } from './breakpoints.ts';
import { judgeProbe, measureAgain, reachAndMeasure } from './checks.ts';
import { SWEEP_FROM, SWEEP_STEP, SWEEP_TO } from './matrix.ts';
import { compareProbes, describeKeyChange, layoutKey, makeFindings, rowCounts, rowsIncreaseWhenWidening } from './rules.ts';
import { openPage, settle } from './session.ts';

/* How many widths of the sweep are also loaded fresh and compared: every change point and its neighbour below, and
   every `FRESH_EVERY`th coarse width. */
const FRESH_EVERY = 8;

/* Sets the window to `width` x `height` and measures the view again once the layout has settled. */
async function measureAt(page, view, width, height) {
  await page.setViewportSize({ width, height });
  await settle(page);
  return measureAgain(page, view);
}

/* Sweeps `view` of `screen` at window height `height`. `fixtures`: as in checks.ts. Returns
   {changes: [{at, changes}], measured, findings}: the findings are `widening-adds-rows`, `resize-equals-fresh` and the
   page rules at every width, each with the range of widths it happens in (`widths: [first, last]`, `count`). */
export async function sweepView({ browser, file, view, fixtures, setup, height, step = SWEEP_STEP, from = SWEEP_FROM, to = SWEEP_TO }) {
  const { fixture, failWrites } = fixtures[view.fixture];
  const open = { browser, file, height, fixture, failWrites, setup };
  const { context, page, errors } = await openPage(browser, { ...open, width: from });
  const found = makeFindings();
  try {
    await reachAndMeasure(page, view, fixture.open);

    // the upward pass: coarse widths, each change bisected
    const result = await findChangePoints({
      from,
      to,
      step,
      measure: width => measureAt(page, view, width, height),
      keyOf: layoutKey,
      describe: describeKeyChange,
    });

    // the page rules at every width measured, grouped: one finding per rule and place with its range of widths
    const groups = new Map();
    for (const { width, result: probe } of result.series) {
      for (const item of judgeProbe(probe, view.id)) {
        const key = `${item.rule}|${item.where}|${item.detail.replace(/[\d.]+/g, '#')}`;
        const group = groups.get(key) ?? { ...item, widths: [width, width], count: 0 };
        group.widths = [Math.min(group.widths[0], width), Math.max(group.widths[1], width)];
        group.count++;
        groups.set(key, group);
      }
    }
    const grouped = [...groups.values()].map(group => ({ ...group, view: view.id }));

    // widening never adds rows
    const rowFindings = rowsIncreaseWhenWidening(result.series.map(({ width, result: probe }) => ({ width, rows: rowCounts(probe) })));
    for (const item of rowFindings) {
      found.add(
        'widening-adds-rows',
        `${item.scope}: ${item.from.rows} rows at ${item.from.width} px, ${item.to.rows} at ${item.to.width} px`,
        view.id,
      );
    }

    // the downward pass over the coarse widths: the same layout as going up
    const byWidth = new Map(result.series.map(({ width, result: probe }) => [width, probe]));
    const coarse = result.series.map(item => item.width).filter(width => (width - from) % step === 0 || width === to);
    const downDifferences = [];
    for (const width of [...coarse].reverse()) {
      const down = await measureAt(page, view, width, height);
      if (layoutKey(down) !== layoutKey(byWidth.get(width))) {
        downDifferences.push(`${width} px: ${describeKeyChange(byWidth.get(width), down).join('; ')}`);
      }
    }
    if (downDifferences.length) {
      found.add(
        'resize-equals-fresh',
        `narrowing gives another layout than widening at ${downDifferences.length} width(s): ${downDifferences.slice(0, 3).join(' | ')}`,
        view.id,
      );
    }

    // a page loaded at the width against the resized page: the change points, the width below each, and every few coarse widths
    const freshWidths = new Set(result.changes.flatMap(change => [change.at - 1, change.at]));
    coarse.forEach((width, index) => {
      if (index % FRESH_EVERY === 0) {
        freshWidths.add(width);
      }
    });
    const scopeNames = Object.keys(result.series[0].result.scopes);
    const freshDifferences = [];
    for (const width of [...freshWidths].sort((a, b) => a - b)) {
      const fresh = await openPage(browser, { ...open, width });
      try {
        const freshProbe = await reachAndMeasure(fresh.page, view, fixture.open);
        const resized = await measureAt(page, view, width, height);
        const differences = compareProbes(resized, freshProbe, scopeNames);
        if (layoutKey(resized) !== layoutKey(freshProbe) || differences.length) {
          freshDifferences.push(
            `${width} px: ${(differences.length ? differences : describeKeyChange(resized, freshProbe)).slice(0, 2).join('; ')}`,
          );
        }
      } finally {
        await fresh.context.close();
      }
    }
    if (freshDifferences.length) {
      found.add(
        'resize-equals-fresh',
        `${freshDifferences.length} width(s) lay out differently resized than loaded: ${freshDifferences.slice(0, 3).join(' | ')}`,
        view.id,
      );
    }

    if (errors.length) {
      found.add('no-page-errors', errors[0], view.id);
    }
    return {
      changes: result.changes,
      measured: result.measured,
      findings: [...found.list.map(item => ({ ...item, view: view.id })), ...grouped],
    };
  } catch (error) {
    found.add('check-completed', `${view.id} sweep: ${error.message.split('\n')[0]}`, view.id);
    return { changes: [], measured: 0, findings: found.list.map(item => ({ ...item, view: view.id })) };
  } finally {
    await context.close();
  }
}
