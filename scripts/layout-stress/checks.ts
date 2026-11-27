/* The checks of one window: open the page, visit every view of a screen, measure it, and judge the measures by the rules
   (rules.ts). A finding is {rule, severity, detail, where, view}; the runner adds the screen, setup, window and browser. */
import type { Browser, Page } from 'playwright';
import {
  findBoxRowProblems,
  findOutside,
  findOverlaps,
  findWrappedLabels,
  judgeDialog,
  judgeMenu,
  judgeRowsVisible,
  makeFindings,
  compareProbes,
  THRESHOLDS,
} from './rules.ts';
import { judgeMathBar } from './math-rules.ts';
import { measureDialog, measureFocusRing, measureMenu, measureView } from './probe.ts';
import { openPage, settle } from './session.ts';
import { probeConfig } from './targets.ts';
import type { Finding, FixtureOpen, FixtureSetup, Probe, Screen, Setup, View } from './types.ts';

/* The findings collector of rules.ts makeFindings. */
type Findings = ReturnType<typeof makeFindings>;

/* The first line of an error's message (anything thrown that is not an Error gives its text). */
export function firstLine(error: unknown): string {
  return String(error instanceof Error ? error.message : error).split('\n')[0] ?? '';
}

/* The most Tab stops a focus walk visits in one view. */
const MAX_FOCUS_STOPS = 70;

/* Scrolls a set page so its pinned header is at the top of the window: the worst case for the rows under it. */
export async function pinHeader(page: Page, selector = '.shead'): Promise<void> {
  await page.evaluate(header => {
    const element = document.querySelector(header);
    if (element) {
      scrollTo(0, element.getBoundingClientRect().top + scrollY);
    }
  }, selector);
  await settle(page);
}

/* Reaches `view` on `page` and measures it (with the widest numbers typed in when `widest`: the stress build). Returns the probe (rules.ts shape). Waits for the page to be still. */
export async function reachAndMeasure(page: Page, view: View, open: FixtureOpen, widest = false): Promise<Probe> {
  await view.reach(page, open);
  if (widest && view.widest) {
    await view.widest(page);
  }
  await settle(page);
  if (view.pinned) {
    await pinHeader(page);
  }
  return page.evaluate(measureView, probeConfig(view));
}

/* Measures `view` again where the page is (after a resize), pinned again when the view is. */
export async function measureAgain(page: Page, view: View): Promise<Probe> {
  if (view.pinned) {
    await pinHeader(page);
  }
  return page.evaluate(measureView, probeConfig(view));
}

/* The findings of the rules that look at one probe: the page, each scope, the labels and the rows under a pinned header.
   `where` names the view. Returns a list of {rule, severity, detail, where}. */
export function judgeProbe(probe: Probe, where: string): Finding[] {
  const found = makeFindings();
  if (probe.hscroll) {
    found.add('no-sideways-scroll', `the page is wider than the window (${probe.width} px)`, where);
  }
  for (const text of probe.past.slice(0, 3)) {
    found.add('nothing-past-window', text, where);
  }
  if (probe.clipped.length) {
    found.add('no-clipped-cells', `${probe.clipped.length} element(s): ${probe.clipped.slice(0, 3).join(', ')}`, where);
  }
  const wrapped = findWrappedLabels(probe.wrapped);
  if (wrapped.length) {
    found.add('label-one-line', `${wrapped.length} label(s) wrap: ${wrapped.slice(0, 3).join(', ')}`, where);
  }
  if (probe.nameLines?.over) {
    found.add('names-max-lines', `${probe.nameLines.over} name(s) over 2 lines (most ${probe.nameLines.max})`, where);
  }
  for (const [name, scope] of Object.entries(probe.scopes)) {
    const outside = findOutside(scope.controls, scope.containers);
    if (outside.length) {
      found.add(
        'control-in-container',
        `${outside.length} control(s) past their box: ${outside
          .slice(0, 3)

          .map(item => `${item.id} in ${item.container} by ${item.by}px`)
          .join(', ')}`,
        `${where}/${name}`,
      );
    }
    const overlaps = findOverlaps(scope.controls);
    if (overlaps.length) {
      found.add(
        'no-overlap',
        `${overlaps.length} pair(s): ${overlaps
          .slice(0, 3)
          .map(pair => pair.join(' and '))
          .join(', ')}`,
        `${where}/${name}`,
      );
    }
    for (const problem of findBoxRowProblems(scope.boxes)) {
      found.add(
        'boxes-equal-height',
        `boxes in a row differ in ${problem.kind} by ${problem.spread}px: ${problem.ids.slice(0, 4).join(', ')}`,
        `${where}/${name}`,
      );
    }
  }
  if (probe.rows) {
    for (const item of judgeRowsVisible({ visible: probe.rows.visible, stack: probe.pinned?.stack ?? 0, windowHeight: probe.height })) {
      found.add(item.rule, item.detail, where, item.severity);
    }
  } else if (probe.pinned?.stack) {
    for (const item of judgeRowsVisible({ visible: Infinity, stack: probe.pinned.stack, windowHeight: probe.height })) {
      found.add(item.rule, item.detail, where, item.severity);
    }
  }
  for (const item of judgeMathBar(probe.mathBar)) {
    found.add(item.rule, item.detail, where);
  }
  const barHeight = probe.scopes.mathbar?.height ?? 0;
  const barPercent = Math.round((100 * barHeight) / probe.height);
  if (barPercent > THRESHOLDS.maxBarPercent) {
    found.add('sticky-bar-share', `the bar takes ${barPercent}% of the window (${barHeight} of ${probe.height} px)`, where);
  }
  return found.list;
}

/* The scopes of `view` that must keep their layout when something opens or its content changes: its `stable` ones. */
const stableScopes = (view: View): string[] => view.stable ?? [];

/* Opens and measures each menu of `view`, then shuts it (Escape, then a click on the page's title if it stayed after a moment). A popup
   (`menu.popup`) is judged as a warning only (the page can scroll to it). Opening a menu must not move the view's stable scopes. */
async function checkMenus(page: Page, view: View, probe: Probe, found: Findings): Promise<void> {
  for (const menu of view.menus ?? []) {
    const where = `${view.id}/${menu.id}`;
    try {
      await menu.open(page);
      await settle(page);
      await page.waitForTimeout(120);
      const box = await page.evaluate(measureMenu, menu.selector);
      if (!box) {
        found.add('check-completed', `${menu.id} did not open`, where);
      } else {
        for (const item of judgeMenu({ ...box, stack: menu.inPinnedHeader ? 0 : (probe.pinned?.stack ?? 0) })) {
          if (menu.popup && item.rule === 'menu-inside-window') {
            found.add('popup-inside-window', item.detail, where);
          } else {
            found.add(item.rule, item.detail, where);
          }
        }
      }
      const open = await page.evaluate(measureView, probeConfig(view));
      const moved = compareProbes(probe, open, stableScopes(view), undefined, true);
      if (moved.length) {
        found.add('menu-keeps-layout', `opening it: ${moved.slice(0, 3).join('; ')}`, where);
      }
      await page.keyboard.press('Escape');
      await hideOr(page, menu.selector, () => page.mouse.click(2, 2));
      await settle(page);
    } catch (error) {
      found.add('check-completed', `${menu.id}: ${firstLine(error)}`, where);
    }
  }
}

/* Puts the view through each of its `states` (content the layout must not depend on: [{id, apply(page)}]): each state's
   findings that the base state did not have are the state's, and the stable scopes must lay out as in the base state. */
async function checkStates(page: Page, view: View, baseProbe: Probe, found: Findings): Promise<void> {
  const reported = new Set(judgeProbe(baseProbe, view.id).map(item => `${item.rule}|${item.detail}`));
  for (const state of view.states ?? []) {
    await state.apply(page);
    await settle(page);
    const probe = await page.evaluate(measureView, probeConfig(view));
    for (const item of judgeProbe(probe, `${view.id} (${state.id})`)) {
      if (!reported.has(`${item.rule}|${item.detail}`)) {
        found.list.push(item);
      }
    }
    const differences = compareProbes(baseProbe, probe, stableScopes(view));
    if (differences.length) {
      found.add('content-independent', `${state.id}: ${differences.slice(0, 3).join('; ')}`, `${view.id}/states`);
    }
  }
}

/* Scrolls the page down and checks that the sticky bar `view.pinnedBar` is at the top of the window with its controls in the
   same places. A page too short to scroll is not checked. */
async function checkPinnedBar(page: Page, view: View, baseProbe: Probe, found: Findings): Promise<void> {
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 200);
  if (!scrollable) {
    return;
  }
  await page.evaluate(() => scrollTo(0, 500));
  await settle(page);
  const top = await page.evaluate(
    selector => Math.round((document.querySelector(selector)?.getBoundingClientRect().top ?? 0) * 10) / 10,
    view.pinnedBar ?? '',
  );
  const probe = await page.evaluate(measureView, probeConfig(view));
  if (Math.abs(top) > 0.5) {
    found.add('pinned-bar-at-top', `the bar is ${top} px from the top of the window after scrolling`, view.id);
  }
  const moved = compareProbes(baseProbe, probe, stableScopes(view));
  if (moved.length) {
    found.add('pinned-bar-at-top', `scrolling moves its controls: ${moved.slice(0, 3).join('; ')}`, view.id);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await settle(page);
}

/* How long a menu or dialog may take to hide after Escape before it counts as still open. The page hides it one frame
   later (about 16 ms), so an immediate visibility check would sometimes see it open, and the fallback click (which moves the
   mouse and the focus) would make the run differ from one run to the next. */
const HIDE_AFTER_ESCAPE_MS = 1500;

/* Waits for the first element of `selector` to hide; runs `fallback` (an async function) when it is still shown after
   HIDE_AFTER_ESCAPE_MS. */
async function hideOr(page: Page, selector: string, fallback: () => unknown): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'hidden', timeout: HIDE_AFTER_ESCAPE_MS }).catch(fallback);
}

/* Shuts the open dialog (Escape; its Cancel button when Escape did not), so the next view's clicks reach the page. */
async function closeDialog(page: Page, selector: string): Promise<void> {
  await page.keyboard.press('Escape');
  await hideOr(page, selector, () => page.click(`${selector} .dlgbtns button:not(.primary)`));
  await page.waitForSelector(selector, { state: 'detached', timeout: 5000 });
}

/* Presses Tab through the view from its start and checks each focus ring (a ring that a box around the control cuts off,
   or the window's edge). One finding per control. */
async function checkFocusRings(page: Page, view: View, found: Findings): Promise<void> {
  const reported = new Set<string>();
  await page.evaluate(() => {
    scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  for (let stop = 0; stop < MAX_FOCUS_STOPS; stop++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(measureFocusRing);
    if (!ring) {
      break;
    }
    if (ring.clippedBy && !reported.has(ring.id)) {
      reported.add(ring.id);
      found.add('focus-ring-clipped', `${ring.id}'s focus ring is cut off by ${ring.clippedBy}`, view.id);
    }
  }
}

/* Picks every job in turn through the view's job menu: a finding the view's own probe did not have (`baseProbe`) is a finding of that job, and the job's scope must lay out as it did for the first. */
async function checkJobs(page: Page, view: View, jobIds: readonly string[], baseProbe: Probe, found: Findings): Promise<void> {
  const jobs = view.jobs;
  if (!jobs) {
    return;
  }
  // what the view already reported for its first job is not reported again for every job
  const reported = new Set(judgeProbe(baseProbe, view.id).map(item => `${item.rule}|${item.detail}`));
  const jobRules = ['no-clipped-cells', 'label-one-line', 'no-overlap', 'control-in-container', 'boxes-equal-height'];
  let first: { jobId: string; probe: Probe } | null = null;
  for (const jobId of jobIds) {
    await jobs.open(page);
    await jobs.pick(page, jobId);
    await settle(page);
    const probe = await page.evaluate(measureView, probeConfig(view));
    for (const item of judgeProbe(probe, `${view.id} (${jobId})`)) {
      if (jobRules.includes(item.rule) && !reported.has(`${item.rule}|${item.detail}`)) {
        found.list.push(item);
      }
    }
    if (!first) {
      first = { jobId, probe };
    } else {
      const differences = compareProbes(first.probe, probe, [jobs.scope]);
      if (differences.length) {
        found.add('content-independent', `${jobId} against ${first.jobId}: ${differences.slice(0, 3).join('; ')}`, `${view.id}/jobs`);
      }
    }
  }
}

/* The findings of one window for one screen. `views` are the screen's views to visit (targets.ts), grouped by fixture:
   `fixtures` maps a fixture name to {fixture, failWrites}. Returns {findings, probes: {viewId: probe}, fonts}. A
   view that cannot be reached is a `check-completed` finding, and the rest are still visited. */
export async function checkScreenInWindow({
  browser,
  file,
  screen,
  fixtures,
  jobIds,
  width,
  height,
  setup,
  walkFocus = true,
  widest = false,
}: {
  browser: Browser;
  file: string;
  screen: Screen;
  fixtures: Record<string, FixtureSetup>;
  jobIds: readonly string[];
  width: number;
  height: number;
  setup: Setup;
  walkFocus?: boolean;
  widest?: boolean;
}): Promise<{ findings: Finding[]; probes: Record<string, Probe>; fonts: boolean }> {
  const found = makeFindings();
  const probes: Record<string, Probe> = {};
  let fontsLoaded = false;
  const byFixture = Map.groupBy(screen.views, view => view.fixture);
  for (const [fixtureName, views] of byFixture) {
    const chosen = fixtures[fixtureName];
    if (!chosen) {
      throw new Error(`unknown fixture ${fixtureName}`);
    }
    const { fixture, failWrites } = chosen;
    const { context, page, errors, fonts } = await openPage(browser, { file, width, height, fixture, failWrites, setup });
    fontsLoaded = fonts;
    try {
      for (const view of views) {
        try {
          const probe = await reachAndMeasure(page, view, fixture.open, widest);
          probes[view.id] = probe;
          found.list.push(...judgeProbe(probe, view.id).map(item => ({ ...item, view: view.id })));
          if (view.dialog) {
            const box = await page.evaluate(measureDialog, view.dialog);
            if (box) {
              for (const item of judgeDialog(box)) {
                found.add(item.rule, item.detail, view.id);
              }
            }
          }
          await checkMenus(page, view, probe, found);
          if (view.jobs) {
            await checkJobs(page, view, jobIds, probe, found);
          }
          if (view.states) {
            await checkStates(page, view, probe, found);
          }
          if (view.pinnedBar) {
            await checkPinnedBar(page, view, probe, found);
          }
          if (view.focusWalk && walkFocus) {
            await checkFocusRings(page, view, found);
          }
          if (view.dialog) {
            await closeDialog(page, view.dialog);
          }
        } catch (error) {
          found.add('check-completed', `${view.id}: ${firstLine(error)}`, view.id);
        }
      }
      if (screen.crossCheck && fixtureName === screen.crossFixture) {
        try {
          for (const item of await screen.crossCheck(page)) {
            found.add(item.rule, item.detail, item.where);
          }
        } catch (error) {
          found.add('check-completed', `${screen.id} cross check: ${firstLine(error)}`, screen.id);
        }
      }
    } finally {
      if (errors.length) {
        found.add('no-page-errors', errors[0], fixtureName);
      }
      await context.close();
    }
  }
  // a view and its twin hold other content: the scopes that must not depend on content lay out the same
  for (const view of screen.views.filter(item => item.twin)) {
    const twin = probes[view.twin ?? ''];
    const own = probes[view.id];
    if (!twin || !own) {
      continue;
    }
    const differences = compareProbes(twin, own, view.stable ?? []);
    if (differences.length) {
      found.add('content-independent', `${differences.slice(0, 4).join('; ')}`, `${view.id} against ${view.twin}`);
    }
  }
  const findings = found.list.map(item => ({ ...item, view: item.view ?? item.where.split(/[/ ]/)[0] }));
  return { findings, probes, fonts: fontsLoaded };
}
