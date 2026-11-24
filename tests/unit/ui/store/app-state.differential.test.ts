/* The new store against the old Alpine store (helpers/old-app-store.js, the Alpine store as it was): the same random sequences of actions run on both, and after
   each one the saved JSON (key order too), the open tab and math view, each tab's panel, the typed levels and the GCD settings must be
   equal. The sequences come from a seeded generator, so a failure names the seed and the step that reproduces it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../../src/core/constants.js';
import { restorePanel, restoreState } from '../../../../src/ui/state.js';
import { createAppStore as createOldStore } from '../../helpers/old-app-store.js';
import { createAppActions } from '../../../../src/ui/store/app-actions.ts';
import { createAppStore, jobCtxOf, panelOf, persisted } from '../../../../src/ui/store/app-state.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { restoreOpen, rngInt } from '../../helpers/common.js';

/* The saves the runs start from: none, one with a different job on each tab (the math panel's IL Sync off), and one with it on. */
const STARTS = [
  { saved: null, open: {} },
  {
    saved: {
      browse: { job: 'WAR', cap: 705, sync: false, level: 90, sort: 'det', q: 'axe' },
      piece: { job: 'BLM', cap: 300, sync: false, level: 70, slot: 'ring', subs: ['crit', 'sps'] },
      tiers: { job: 'WHM' },
    },
    open: { tab: 'browse' },
  },
  {
    saved: { piece: { job: 'SGE', cap: 123, sync: true, level: 85 }, browse: { job: 'BLU', cap: 200, sync: true, level: 80 } },
    open: { tab: 'math', mathTab: 'gcd' },
  },
];

const JOB_IDS: string[] = JOBS.map((job: { id: string }) => job.id);
const TAB_NAMES = ['sheets', 'browse', 'math', 'piece', 'gcd', 'tiers', 'pool', 'opt'];
const SUB_NAMES = ['piece', 'gcd', 'tiers', 'nothing'];
const SLOTS = ['head', 'body', 'ring', 'weapon', 'offhand'];
const STATS = ['crit', 'det', 'dh', 'sks', 'sps', 'piety', 'ten', null];

/* One step of a run: a label for the failure message, the step on the old store (its fields and methods) and on the new actions (what it
   edits by writing a field there is an action call here). */
interface Step {
  label: string;
  old(store: ReturnType<typeof createOldStore>): void;
  next(actions: ReturnType<typeof createAppActions>): void;
}

/* A random step from the generator `pick` (n => integer in [0, n)). */
function randomStep(pick: (n: number) => number): Step {
  const from = <Item>(list: readonly Item[]) => list[pick(list.length)];
  const kind = pick(20);
  const job = from(JOB_IDS);
  const level = 1 + pick(100);
  const cap = from([null, 1 + pick(795), 123, 405]);
  const sync = pick(2) === 0;
  const tab = from(['browse', 'math']);
  switch (kind) {
    case 0:
    case 1: {
      const name = from(TAB_NAMES);
      return { label: `showTab(${name})`, old: s => s.showTab(name), next: a => a.showTab(name) };
    }
    case 2: {
      const name = from(SUB_NAMES);
      return { label: `showSub(${name})`, old: s => s.showSub(name), next: a => a.showSub(name) };
    }
    case 3:
    case 4:
      return { label: `setJob(${job})`, old: s => s.setJob(job), next: a => a.setJob(job) };
    case 5:
      return { label: `setJob(${job}, tiers)`, old: s => s.setJob(job, 'tiers'), next: a => a.setJob(job, 'tiers') };
    case 6:
      return { label: `setTiersJob(${job})`, old: s => s.setTiersJob(job), next: a => a.setTiersJob(job) };
    case 7: {
      // a link's panel, checked as the router checks it
      const { jobCtx: _jobCtx, ...panel } = restorePanel({ job, cap, sync, level });
      return { label: `setPanel(${tab}, ${JSON.stringify(panel)})`, old: s => s.setPanel(tab, panel), next: a => a.setPanel(tab, panel) };
    }
    case 8:
      return { label: 'resetAll()', old: s => s.resetAll(), next: a => a.resetAll() };
    case 9:
      return { label: 'followLevelSync()', old: s => s.followLevelSync(), next: a => a.followLevelSync() };
    case 10:
      return {
        label: `edit cap ${cap}`,
        old: s => {
          s.cap = cap;
        },
        next: a => a.editPanel({ cap }),
      };
    case 11:
      return {
        label: `edit sync ${sync}, level ${level}`,
        old: s => {
          s.sync = sync;
          s.level = level;
        },
        next: a => a.editPanel({ sync, level }),
      };
    case 12: {
      const sort = from(['name', 'ilvl', 'det', 'crit', 'sps']);
      const type = from(['any', ...SLOTS]);
      return {
        label: `edit browse sort ${sort}, type ${type}`,
        old: s => {
          s.browse.sort = sort;
          s.browse.type = type;
        },
        next: a => a.editBrowse({ sort, type }),
      };
    }
    case 13: {
      const text = from(['', 'axe', 'Dread']);
      const min = from<number | ''>(['', 100, 500]);
      return {
        label: `edit browse q ${text}, min ${min}`,
        old: s => {
          s.browse.q = text;
          s.browse.min = min;
        },
        next: a => a.editBrowse({ q: text, min }),
      };
    }
    case 14: {
      const lvl = from<number | ''>(['', 1 + pick(100)]);
      return {
        label: `edit browse lvl ${lvl}`,
        old: s => {
          s.browse.lvl = lvl;
        },
        next: a => a.editBrowse({ lvl }),
      };
    }
    case 15: {
      const slot = from(SLOTS);
      const subs = [from(STATS), from(STATS)];
      return {
        label: `edit piece ${slot} ${subs}`,
        old: s => {
          s.piece.slot = slot;
          s.piece.subs = subs;
        },
        next: a => a.editPiece({ slot, subs }),
      };
    }
    case 16: {
      const typed = from([null, 1 + pick(100)]);
      return {
        label: `tiers level ${typed}`,
        old: s => {
          s.tiers.level = typed;
        },
        next: a => a.setTiersLevel(typed),
      };
    }
    case 17: {
      const haste = from(['', 'WAR']);
      const speed = from([null, 400 + pick(200)]);
      return {
        label: `gcd ${haste} ${speed}`,
        old: s => {
          Object.assign(s.gcd, { haste, speed });
        },
        next: a => a.editGcd({ haste, speed }),
      };
    }
    case 18: {
      const figures = from(['effects', 'points']);
      return {
        label: `sheetFigures ${figures}`,
        old: s => {
          s.sheetFigures = figures;
        },
        next: a => a.setSheetFigures(figures),
      };
    }
    default:
      return { label: 'resetAll()', old: s => s.resetAll(), next: a => a.resetAll() };
  }
}

/* Fail with the seed, the step number and its label when the two stores differ. */
function assertSame(old: ReturnType<typeof createOldStore>, store: ReturnType<typeof createAppStore>, where: string): void {
  const { state } = store;
  assert.equal(JSON.stringify(persisted(state)), JSON.stringify(old.persisted()), `${where}: saved JSON`);
  assert.deepEqual([state.screen.tab, state.screen.mathTab], [old.tab, old.mathTab], `${where}: screen`);
  for (const tab of ['browse', 'math', 'tiers']) {
    const want = old.panel(tab);
    const got = panelOf(state, tab);
    assert.deepEqual(
      [got.job, got.cap, got.sync, got.level, got.jobCtx.jobId],
      [want.job, want.cap, want.sync, want.level, want.jobCtx.jobId],
      `${where}: panel(${tab})`,
    );
  }
  assert.equal(state.math.tiersLevel, old.tiers.level, `${where}: tiers level`);
  assert.deepEqual(state.math.gcd, old.gcd, `${where}: gcd`);
  if (state.screen.tab !== 'sheets') {
    const open = panelOf(state, state.screen.tab);
    assert.deepEqual(
      [open.job, open.cap, open.sync, open.level, open.jobCtx.jobId],
      [old.job, old.cap, old.sync, old.level, old.jobCtx.jobId],
      `${where}: the open tab's copy`,
    );
    assert.equal(jobCtxOf(state, state.screen.tab), old.jobCtx, `${where}: job context`);
  }
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const STEPS_PER_RUN = 250;

for (const [startIndex, start] of STARTS.entries()) {
  test(`random action sequences match the old store, start ${startIndex + 1} of ${STARTS.length} (${SEEDS.length} seeds x ${STEPS_PER_RUN} steps)`, () => {
    for (const seed of SEEDS) {
      const pick = rngInt(seed * 7919 + startIndex);
      const old = createOldStore(restoreOpen(start.saved ? { ...start.saved, ...start.open } : null));
      const restored = start.saved ? restoreState(start.saved, start.open) : restoreState(null);
      const store = createAppStore(restored as RestoredState, { available: false, sheets: [], unreadable: [], indexProblem: null });
      const actions = createAppActions(store);
      assertSame(old, store, `seed ${seed}, start`);
      for (let step = 1; step <= STEPS_PER_RUN; step++) {
        const action = randomStep(pick);
        action.old(old);
        action.next(actions);
        assertSame(old, store, `seed ${seed}, step ${step}, ${action.label}`);
      }
    }
  });
}

test('the generator reaches every tab, a job change on each panel owner and a reset (the run is not trivially equal)', () => {
  const pick = rngInt(99);
  const labels = new Set<string>();
  for (let i = 0; i < 400; i++) labels.add(randomStep(pick).label.split('(')[0].split(' ')[0]);
  for (const name of [
    'showTab',
    'showSub',
    'setJob',
    'setTiersJob',
    'setPanel',
    'resetAll',
    'followLevelSync',
    'edit',
    'tiers',
    'gcd',
    'sheetFigures',
  ])
    assert.ok(labels.has(name), name);
});
