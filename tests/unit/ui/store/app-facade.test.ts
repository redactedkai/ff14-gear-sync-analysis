/* The app facade (src/ui/store/app-facade.ts), `$store.app` on the page: each getter reads the revision of the slice it shows, so a
   template tracks it; each method is an action, counted as the action runs; nothing can be assigned to. A recording stand-in for
   the template engine's tracked revisions tells which slice a getter reads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.js';
import { createPageStore } from '../../../../src/ui/store/page-store.ts';
import type { SliceRevisions } from '../../../../src/ui/store/app-facade.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { restoreOpen } from '../../helpers/common.js';

/* A page store over `saved` (state.js restoreState's input, with the open tab) whose revisions record every read and every write
   in `trail`: 'read:<slice>' and 'write:<slice>:<revision>'. */
function recorded(saved: object = { tab: 'browse' }) {
  const trail: string[] = [];
  const stores = createPageStore({
    restored: restoreOpen(saved) as unknown as RestoredState,
    storage: null,
    track: (revisions: SliceRevisions) =>
      new Proxy(revisions, {
        get(target, slice: string) {
          trail.push(`read:${slice}`);
          return target[slice];
        },
        set(target, slice: string, revision: number) {
          trail.push(`write:${slice}:${revision}`);
          target[slice] = revision;
          return true;
        },
      }),
  });
  /* The slices the reads of `read` touched, once each, in order. */
  const slicesRead = (read: () => unknown) => {
    trail.length = 0;
    read();
    return [...new Set(trail.filter(entry => entry.startsWith('read:')).map(entry => entry.slice(5)))];
  };
  return { ...stores, trail, slicesRead };
}

test('each getter reads the revision of the slice it shows', () => {
  const { app, slicesRead } = recorded();
  assert.deepEqual(
    slicesRead(() => app.tab),
    ['screen'],
  );
  assert.deepEqual(
    slicesRead(() => app.mathTab),
    ['screen'],
  );
  assert.deepEqual(
    slicesRead(() => app.pendingTab),
    ['screen'],
  );
  for (const field of ['job', 'jobCtx', 'cap', 'sync', 'level'] as const)
    assert.deepEqual(slicesRead(() => app[field]).sort(), ['screen', 'settings'], `${field}: the open tab's panel`);
  for (const field of ['browse', 'piece', 'sheetFigures'] as const)
    assert.deepEqual(
      slicesRead(() => app[field]),
      ['settings'],
      field,
    );
  assert.deepEqual(
    slicesRead(() => app.gcd),
    ['math'],
  );
  assert.deepEqual(slicesRead(() => app.tiers).sort(), ['math', 'settings']);
  assert.deepEqual(
    slicesRead(() => app.panel('browse')),
    ['settings'],
  );
  assert.deepEqual(
    slicesRead(() => app.persisted()),
    ['settings'],
  );
});

test('an action writes the revision of its slice as it runs, so a template is run again without waiting for the tick', () => {
  const { app, trail } = recorded();
  trail.length = 0;
  app.editBrowse({ q: 'ring' });
  assert.deepEqual(trail, ['write:settings:1']);
  app.editGcd({ speed: 400 });
  app.showSub('gcd');
  assert.deepEqual(trail.slice(1), ['write:math:1', 'write:screen:1']);
  assert.equal(app.browse.q, 'ring', 'the state is read at once, whatever the tick');
});

test("the members of the old Alpine store are there, and the open tab's panel is the one they show", () => {
  const { app } = recorded({
    tab: 'browse',
    browse: { job: 'WAR', cap: 600, sync: true, level: 90 },
    piece: { job: 'SGE', cap: 123, sync: false, level: 85 },
  });
  assert.equal(app.maxReal, MAX_REAL);
  assert.deepEqual([app.tab, app.mathTab, app.pendingTab], ['browse', 'piece', null]);
  assert.deepEqual([app.job, app.level, app.sync, app.cap, app.jobCtx.jobId], ['WAR', 90, true, 600, 'WAR']);
  app.showTab('math');
  assert.deepEqual([app.job, app.level, app.sync, app.jobCtx.jobId], ['SGE', 85, false, 'SGE']);
  app.showTab('sheets');
  assert.equal(app.job, 'WAR', "the Sheets tab has no panel: the Gear browser's shows");
  assert.deepEqual(app.panel('math').job, 'SGE');
  assert.equal(app.panel('tiers').level, app.panel('tiers').jobCtx.maxLevel);
  assert.deepEqual(Object.keys(app.tiers), ['job', 'level']);
});

test("the setting a number box names is written by its action: the open tab's panel, or browse, piece or gcd", () => {
  const { app, store } = recorded({ tab: 'math' });
  app.setField('level', 90);
  app.setField('cap', 300);
  app.setField('browse.min', 200);
  app.setField('piece.ilvl', 640);
  app.setField('gcd.speed', 410);
  assert.deepEqual([app.panel('math').level, app.panel('math').cap, app.panel('browse').level], [90, 300, 100]);
  assert.deepEqual([app.browse.min, app.piece.ilvl, app.gcd.speed], [200, 640, 410]);
  assert.deepEqual(store.log.slice(-5), [
    'settings/editPanel',
    'settings/editPanel',
    'settings/editBrowse',
    'settings/editPiece',
    'math/editGcd',
  ]);
  assert.throws(() => app.setField('nowhere.at.all', 1), /No setting/);
});

test('nothing is assigned to a facade: a write is an action call, so it is counted and saved', () => {
  const { app, sheets } = recorded();
  const assign = (facade: object, field: string) => () => {
    (facade as Record<string, unknown>)[field] = 1;
  };
  for (const field of [
    'tab',
    'mathTab',
    'pendingTab',
    'job',
    'jobCtx',
    'cap',
    'sync',
    'level',
    'browse',
    'piece',
    'gcd',
    'tiers',
    'sheetFigures',
  ])
    assert.throws(assign(app, field), TypeError, field);
  for (const field of [
    'screen',
    'sheetId',
    'setId',
    'missing',
    'saveMessage',
    'note',
    'noteSeq',
    'busy',
    'currentSheet',
    'currentSet',
    'rev',
  ])
    assert.throws(assign(sheets, field), TypeError, field);
});

test('an edit that changes nothing is not an action: no revision, so the page does not draw again', () => {
  const { app, store } = recorded({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: true, level: 100 } });
  app.editGcd({ level: 90 });
  app.editBrowse({ q: 'ring' });
  const counted = store.log.length;
  app.editGcd({ level: 90 });
  app.editBrowse({ q: 'ring' });
  app.editPiece({ slot: app.piece.slot });
  app.editPanel({ level: 100, cap: 123 });
  app.setPanel('math', app.panel('math'));
  app.followLevelSync();
  app.showSub('piece');
  assert.equal(store.log.length, counted);
  app.editBrowse({ q: 'rings' });
  assert.equal(store.log.length, counted + 1);
});
