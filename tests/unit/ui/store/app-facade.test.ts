/* The app facade (src/ui/store/app-facade.ts), on the page: each getter reads the revision of each part of the state it
   shows and no other, so a screen can tell when to read it again; each method is an action, counted as the action runs; nothing can be assigned to. A
   recording stand-in for the revisions tells which revisions a getter reads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.ts';
import { createPageStore } from '../../../../src/ui/store/page-store.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { restoreOpen } from '../../helpers/common.js';
import { withRecordedReads } from '../../helpers/revision-reads.ts';

/* A page store over `saved` (state.ts restoreState's input, with the open tab) whose facade reports each revision key it reads
   to `trail`, a key being a slice ('settings') or a part ('settings.browse'); `revisionsMoved(act)` runs `act` and lists the
   revisions it moved as '<key>:<revision>', sorted. */
function recorded(saved: object = { tab: 'browse' }) {
  const trail: string[] = [];
  const stores = withRecordedReads(createPageStore({ restored: restoreOpen(saved) as unknown as RestoredState, storage: null }), key =>
    trail.push(key),
  );
  /* The revision keys the reads of `read` touched, once each, sorted. */
  const keysRead = (read: () => unknown) => {
    trail.length = 0;
    read();
    return [...new Set(trail)].sort();
  };
  const revisionsMoved = (act: () => void) => {
    const before = { ...stores.store.revs };
    act();
    const after: Record<string, number> = stores.store.revs;
    return Object.keys(after)
      .filter(key => after[key] !== before[key])
      .map(key => `${key}:${after[key]}`)
      .sort();
  };
  return { ...stores, keysRead, revisionsMoved };
}

test('each getter reads the revision of each part it shows, and no other', () => {
  const { app, keysRead } = recorded();
  assert.deepEqual(
    keysRead(() => app.tab),
    ['screen.tab'],
  );
  assert.deepEqual(
    keysRead(() => app.mathTab),
    ['screen.mathTab'],
  );
  assert.deepEqual(
    keysRead(() => app.pendingTab),
    ['screen.pendingTab'],
  );
  const panelFieldOf = { job: 'job', jobCtx: 'job', cap: 'cap', sync: 'sync', level: 'level' } as const;
  for (const [getter, field] of Object.entries(panelFieldOf)) {
    assert.deepEqual(
      keysRead(() => app[getter as keyof typeof panelFieldOf]),
      ['screen.tab', `settings.panels.browse.${field}`],
      `${getter}: the open tab's panel field`,
    );
  }
  app.showTab('math');
  for (const [getter, field] of Object.entries(panelFieldOf)) {
    assert.deepEqual(
      keysRead(() => app[getter as keyof typeof panelFieldOf]),
      ['screen.tab', `settings.panels.math.${field}`],
      `${getter}: the math tab's panel once it is open`,
    );
  }
  assert.deepEqual(
    keysRead(() => app.browse),
    ['settings.browse'],
  );
  assert.deepEqual(
    keysRead(() => app.piece),
    ['settings.piece'],
  );
  assert.deepEqual(
    keysRead(() => app.sheetFigures),
    ['settings.sheetFigures'],
  );
  assert.deepEqual(
    keysRead(() => app.gcd),
    ['math.gcd'],
  );
  assert.deepEqual(
    keysRead(() => app.tiers),
    ['math.tiersLevel', 'settings.tiers'],
  );
  assert.deepEqual(
    keysRead(() => app.panel('browse')),
    ['cap', 'job', 'level', 'sync'].map(field => `settings.panels.browse.${field}`),
  );
  assert.deepEqual(
    keysRead(() => app.panel('math')),
    ['cap', 'job', 'level', 'sync'].map(field => `settings.panels.math.${field}`),
  );
  assert.deepEqual(
    keysRead(() => app.panel('tiers')),
    ['settings.tiers'],
  );
  assert.deepEqual(
    keysRead(() => app.persisted()),
    ['settings'],
  );
  assert.deepEqual(
    keysRead(() => app.route()),
    ['screen.mathTab', 'screen.pendingTab', 'screen.tab', 'sheets'],
  );
});

test('an action counts the revisions of its slice and of the parts it changed as it runs, without waiting for the tick', () => {
  const { app, revisionsMoved } = recorded();
  assert.deepEqual(
    revisionsMoved(() => app.editBrowse({ q: 'ring' })),
    ['settings.browse:1', 'settings:1'],
  );
  assert.deepEqual(
    revisionsMoved(() => {
      app.editGcd({ speed: 400 });
      app.showSub('gcd');
    }),
    ['math.gcd:1', 'math:1', 'screen.mathTab:1', 'screen:1'],
  );
  assert.equal(app.browse.q, 'ring', 'the state is read at once, whatever the tick');
});

test('the objects a getter hands out are frozen copies, the same one until their part changes', () => {
  const { app } = recorded();
  const before = app.browse;
  assert.equal(app.browse, before, 'the same object while nothing changed');
  assert.ok(Object.isFrozen(before) && Object.isFrozen(before.expOff), 'frozen all through');
  assert.throws(() => {
    (before as { q: string }).q = 'x';
  }, TypeError);
  app.editPiece({ slot: 'body' });
  assert.equal(app.browse, before, "another part's change leaves it alone");
  app.editBrowse({ q: 'ring' });
  assert.notEqual(app.browse, before);
  assert.deepEqual([before.q, app.browse.q], ['', 'ring'], 'the old copy keeps what it showed');
  assert.ok(Object.isFrozen(app.gcd) && Object.isFrozen(app.piece) && Object.isFrozen(app.tiers));
});

test("the facade has the members the screens read, and the open tab's panel is the one they show", () => {
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
  ]) {
    assert.throws(assign(app, field), TypeError, field);
  }
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
  ]) {
    assert.throws(assign(sheets, field), TypeError, field);
  }
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
