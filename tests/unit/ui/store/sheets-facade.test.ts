/* The sheets facade (src/ui/store/sheets-facade.ts), `$store.sheets` on the page: what the manager, a sheet's page and a gear set's
   page read, each reading the revision of the `sheets` slice; the calls are the actions of sheets-actions.ts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageStore } from '../../../../src/ui/store/page-store.ts';
import type { SliceRevisions } from '../../../../src/ui/store/app-facade.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { restoreState } from '../../../../src/ui/state.js';
import { saveSheet, sheetKey } from '../../../../src/ui/sheets/storage.js';
import { fakeStorage, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

/* The state a page starts with when nothing is saved. */
const DEFAULTS = restoreState(null) as unknown as RestoredState;

/* A page store over a storage that holds the sheet 's_1' with the gear sets 'g_1' and 'g_2', and the slices its getters read. */
function stores() {
  const storage = fakeStorage() as unknown as Storage;
  saveSheet(sheetOf('SGE', [sageSet(), sageSet({ id: 'g_2', name: 'Set 2' })], { name: 'Sage 123' }), storage);
  const reads: string[] = [];
  const page = createPageStore({
    restored: DEFAULTS,
    storage,
    track: (revisions: SliceRevisions) =>
      new Proxy(revisions, {
        get(target, slice: string) {
          reads.push(slice);
          return target[slice];
        },
      }),
  });
  return { ...page, reads };
}

test('the screen, the open sheet and set and the lists follow the actions, and each read is a read of the sheets revision', () => {
  const { sheets, reads } = stores();
  assert.deepEqual(
    [sheets.screen, sheets.sheetId, sheets.setId, sheets.currentSheet, sheets.currentSet],
    ['sheets', null, null, null, null],
  );
  assert.deepEqual(
    sheets.list().sheets.map(sheet => sheet.id),
    ['s_1'],
  );
  sheets.openSheet('s_1');
  sheets.openSet('g_2');
  assert.deepEqual([sheets.screen, sheets.sheetId, sheets.setId], ['set', 's_1', 'g_2']);
  assert.equal(sheets.currentSheet?.name, 'Sage 123');
  assert.equal(sheets.currentSet?.name, 'Set 2');
  assert.equal(sheets.set('g_1')?.name, 'Set 1');
  assert.equal(sheets.sheet('nope'), null);
  assert.equal(sheets.href('s_1', 'g_2'), '#/sheets/s_1/sets/g_2');
  reads.length = 0;
  void [
    sheets.screen,
    sheets.sheetId,
    sheets.setId,
    sheets.missing,
    sheets.saveMessage,
    sheets.note,
    sheets.noteSeq,
    sheets.busy,
    sheets.rev,
  ];
  sheets.list();
  sheets.sheet('s_1');
  sheets.set('g_1');
  void [sheets.currentSheet, sheets.currentSet];
  assert.deepEqual([...new Set(reads)], ['sheets']);
});

test('a note, the lock and the revision: set by actions, counted even when the note is the same', () => {
  const { sheets } = stores();
  const before = sheets.rev;
  sheets.setNote('Copied.');
  sheets.setNote('Copied.');
  assert.deepEqual([sheets.note, sheets.noteSeq, sheets.rev - before], ['Copied.', 2, 2]);
  assert.equal(sheets.busy, false);
  sheets.setBusy(true);
  assert.equal(sheets.busy, true);
  assert.equal(sheets.locked()?.ok, false);
  sheets.setBusy(false);
  assert.equal(sheets.locked(), null);
});

test("the set page's guard is kept by the actions: a move off the set page asks; an unsettled page is the store's to say", () => {
  const { sheets } = stores();
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  assert.equal(sheets.hasUnsettled(), false, 'no page holds anything');
  let held: (() => void) | null = null;
  sheets.setLeaveGuard(move => {
    held = move;
    return true;
  });
  sheets.pages.openPage('g_1');
  sheets.pages.startFill('g_1');
  assert.equal(sheets.hasUnsettled(), true);
  sheets.closeSet();
  assert.equal(sheets.screen, 'set', 'the guard took the move over');
  sheets.setLeaveGuard(null);
  (held as unknown as () => void)();
  assert.equal(sheets.screen, 'sheet');
  sheets.pages.closePage('g_1');
  assert.equal(sheets.hasUnsettled(), false);
});

test('a whole sheet put in the list: replaced by its id or on top, saved, its time kept when asked', () => {
  const storage = fakeStorage() as unknown as Storage;
  const { sheets } = createPageStore({ restored: DEFAULTS, storage, now: () => 5000 });
  const sheet = sheetOf('SGE', [sageSet()], { name: 'Example' });
  assert.deepEqual(sheets.commitSheet(sheet, { touch: false }), { ok: true });
  assert.deepEqual([sheets.list().sheets[0].id, sheets.list().sheets[0].updatedAt], [sheet.id, sheet.updatedAt]);
  sheets.commitSheet({ ...sheet, name: 'Renamed' });
  assert.equal(sheets.list().sheets.length, 1);
  assert.deepEqual([sheets.list().sheets[0].name, sheets.list().sheets[0].updatedAt], ['Renamed', 5000]);
  assert.ok(storage.getItem(sheetKey(sheet.id)), 'saved');
});
