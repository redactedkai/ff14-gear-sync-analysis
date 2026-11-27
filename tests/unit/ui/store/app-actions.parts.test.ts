/* The revisions of the parts of the state (store.ts parts, app-state.ts STATE_PARTS) after each app action, and what a facade getter
   reads. Two checks that no action and no getter can get wrong without a test failing:
   - after every action, the parts whose revision moved are exactly the parts whose contents differ (judged by JSON, not by the
     store's own comparison), and the action list below has a case for each action the app actions have;
   - for every action and every getter, a getter whose value changed read the revision of a part that moved. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageStore } from '../../../../src/ui/store/page-store.ts';
import type { PageStore } from '../../../../src/ui/store/page-store.ts';
import { STATE_PARTS } from '../../../../src/ui/store/app-state.ts';
import type { AppState, RestoredState } from '../../../../src/ui/store/app-state.ts';
import { partKey } from '../../../../src/ui/store/store.ts';
import { restoreOpen } from '../../helpers/fixtures/common.ts';
import { withRecordedReads } from '../../helpers/fixtures/revision-reads.ts';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/* A page store over `saved` that records the revision keys each read touches (`reads`). The frame scheduler runs at once. */
function recorded(saved: object) {
  const reads = new Set<string>();
  const page = withRecordedReads(
    createPageStore({ restored: restoreOpen(saved) as unknown as RestoredState, storage: null, frame: callback => callback() }),
    key => reads.add(key),
  );
  return { ...page, reads };
}

/* What each part of the state holds now, as JSON: {revision key: text}. */
function contents(state: AppState): Record<string, string> {
  const held: Record<string, string> = {};
  for (const [slice, paths] of Object.entries(STATE_PARTS)) {
    for (const path of paths) {
      held[partKey(slice, path)] = JSON.stringify(
        path.split('.').reduce<unknown>((inside, key) => (inside as Record<string, unknown>)[key], state[slice]),
      );
    }
  }
  return held;
}

/* The getters of the app facade, each as a function of the page store that gives its value as JSON. */
const GETTERS: Record<string, (page: PageStore) => unknown> = {
  tab: ({ app }) => app.tab,
  mathTab: ({ app }) => app.mathTab,
  pendingTab: ({ app }) => app.pendingTab,
  job: ({ app }) => app.job,
  jobId: ({ app }) => app.jobCtx.jobId,
  cap: ({ app }) => app.cap,
  sync: ({ app }) => app.sync,
  level: ({ app }) => app.level,
  browse: ({ app }) => app.browse,
  piece: ({ app }) => app.piece,
  sheetFigures: ({ app }) => app.sheetFigures,
  gcd: ({ app }) => app.gcd,
  tiers: ({ app }) => app.tiers,
  'panel(browse)': ({ app }) => app.panel('browse'),
  'panel(math)': ({ app }) => app.panel('math'),
  'panel(tiers)': ({ app }) => app.panel('tiers'),
  persisted: ({ app }) => app.persisted(),
  route: ({ app }) => app.route(),
};

/* One case of an app action: `saved` the state to start from (settings that differ from the defaults, so the action has something to
   change); `setup` calls that make the state the action starts from; `run` the calls of the action; `replaced` the parts that may
   count without their contents differing (the action puts a new object or array there, which counts; or it changes the part and puts it back). */
interface Case {
  saved: object;
  setup?: (page: PageStore) => void;
  run: (page: PageStore) => void | Promise<void>;
  replaced?: string[];
}

/* One case or more per app action (the keys are the names in createAppActions). */
const MATH_OPEN = {
  tab: 'math',
  mathTab: 'piece',
  piece: { job: 'SGE', cap: 123, sync: false, level: 90 },
  browse: { job: 'WAR', level: 95 },
};
const BROWSE_OPEN = { tab: 'browse', piece: { job: 'SGE', cap: 123, sync: false, level: 90 }, browse: { job: 'WAR', level: 95 } };
const CASES: Record<string, Case[]> = {
  setJob: [
    { saved: BROWSE_OPEN, run: ({ app }) => app.setJob('BLU') },
    { saved: MATH_OPEN, run: ({ app }) => app.setJob('WHM') },
    { saved: MATH_OPEN, run: ({ app }) => app.setJob('DRG', 'browse') },
    { saved: MATH_OPEN, run: ({ app }) => app.setJob('DRG', 'tiers') },
    { saved: { tab: 'sheets' }, run: ({ app }) => app.setJob('WHM') },
  ],
  setTiersJob: [
    {
      saved: MATH_OPEN,
      setup: ({ app }) => app.setTiersLevel(100),
      run: ({ app }) => app.setTiersJob('BLU'), // a job whose level cap is lower clears the level typed
    },
  ],
  setTiersLevel: [{ saved: MATH_OPEN, run: ({ app }) => app.setTiersLevel(70) }],
  followLevelSync: [
    {
      saved: MATH_OPEN,
      setup: ({ app }) => app.editPanel({ cap: 1 }),
      run: ({ app }) => app.followLevelSync(),
    },
  ],
  setPanel: [
    { saved: MATH_OPEN, run: ({ app }) => app.setPanel('math', { job: 'GNB', cap: 600, sync: true, level: 80 }) },
    { saved: MATH_OPEN, run: ({ app }) => app.setPanel('browse', { job: 'MNK', cap: null, sync: false, level: 100 }) },
  ],
  editPanel: [
    { saved: MATH_OPEN, run: ({ app }) => app.editPanel({ level: 80, sync: true }) },
    { saved: MATH_OPEN, run: ({ app }) => app.editPanel({ cap: 500 }, 'browse') },
  ],
  editBrowse: [{ saved: BROWSE_OPEN, run: ({ app }) => app.editBrowse({ q: 'ring', expOff: ['ARR'] }) }],
  editPiece: [{ saved: MATH_OPEN, run: ({ app }) => app.editPiece({ ilvl: 600, subs: ['crit', 'det'] }) }],
  editGcd: [{ saved: MATH_OPEN, run: ({ app }) => app.editGcd({ speed: 400 }) }],
  setSheetFigures: [{ saved: BROWSE_OPEN, run: ({ app }) => app.setSheetFigures('points') }],
  resetAll: [
    { saved: BROWSE_OPEN, run: ({ app }) => app.resetAll(), replaced: ['settings.browse'] },
    { saved: MATH_OPEN, run: ({ app }) => app.resetAll() },
  ],
  openTab: [
    {
      saved: BROWSE_OPEN,
      run: async ({ app }) => {
        app.openTab('math');
        await new Promise(resolve => setTimeout(resolve, 5)); // the opening waits one timer after the frame
      },
      replaced: ['screen.pendingTab'], // set, then cleared when the tab shows
    },
  ],
  showTab: [
    { saved: BROWSE_OPEN, run: ({ app }) => app.showTab('math') },
    { saved: BROWSE_OPEN, run: ({ app }) => app.showTab('gcd') },
  ],
  showSub: [{ saved: MATH_OPEN, run: ({ app }) => app.showSub('tiers') }],
};

test('every app action has a case here (a new action fails this until its case is added)', () => {
  const { appActions } = recorded({});
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(appActions).sort());
});

for (const [action, cases] of Object.entries(CASES)) {
  cases.forEach((one, index) => {
    test(`${action} #${index + 1}: the parts counted are the parts that changed, and no getter that changed missed one`, async () => {
      const page = recorded(one.saved);
      one.setup?.(page);
      const heldBefore = contents(page.store.state);
      const valuesBefore = Object.fromEntries(
        Object.entries(GETTERS).map(([name, getter]) => [name, JSON.stringify(getter(page) ?? null)]),
      );
      const revisionsBefore = { ...page.store.revs };
      page.reads.clear();
      await one.run(page);
      await tick();
      const heldAfter = contents(page.store.state);
      const changed = Object.keys(heldAfter).filter(key => heldAfter[key] !== heldBefore[key]);
      const counted = Object.keys(heldAfter).filter(key => page.store.revs[key] !== revisionsBefore[key]);
      assert.deepEqual(
        counted.filter(key => !one.replaced?.includes(key) || changed.includes(key)).sort(),
        changed.sort(),
        `${action}: the parts that moved`,
      );
      assert.ok(changed.every(key => counted.includes(key)));
      assert.ok(changed.length > 0 || action === 'setJob', `${action} #${index + 1} changes something, or the case tests nothing`);

      // a getter's value changed: it must have read a part that moved, or the slice (its readers would not run again)
      for (const [name, getter] of Object.entries(GETTERS)) {
        page.reads.clear();
        const after = JSON.stringify(getter(page) ?? null);
        if (after === valuesBefore[name]) {
          continue;
        }
        const keysRead = [...page.reads];
        const moved = keysRead.some(key => page.store.revs[key] !== revisionsBefore[key]);
        assert.ok(moved, `${name} changed after ${action} but none of its revisions (${keysRead.join(', ')}) moved`);
      }
    });
  });
}
