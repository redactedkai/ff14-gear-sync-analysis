/* A set page's piece picker (src/ui/views/piece-menu.ts) on real items: the pieces of a slot by expansion, the search, the
   empty text. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobGear } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { piecePickerView } from '../../../../src/ui/views/piece-menu.ts';
import { SAGE_IDS, sageSet } from '../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const HEAD = 2;

test('the piece picker: the slot pieces by expansion newest first, the search, the empty text', () => {
  const gear = jobGear(SGE);
  const all = piecePickerView(SGE, gear, sageSet(), HEAD, '');
  assert.ok(all.placeholder.includes('head'), all.placeholder); // the slot searched
  assert.equal(all.canEmpty, true);
  assert.equal(all.groups[0].label, 'Dawntrail');
  assert.equal(all.footText, `${gear.filter(item => item.type === 'head').length.toLocaleString('en-US')} pieces`);

  const rainbow = piecePickerView(SGE, gear, sageSet(), HEAD, 'rainbow');
  const items = rainbow.groups.flatMap(g => g.items);
  // the Holy Rainbow Hat (equip level 52) is Heavensward's, the Rainbow Cap (level 50) A Realm Reborn's
  assert.deepEqual(
    rainbow.groups.map(g => g.items.map(x => x.key)),
    [[10881], [SAGE_IDS.head]],
  );
  assert.deepEqual(
    rainbow.groups.map(g => g.label),
    ['Heavensward', 'A Realm Reborn'],
  );
  const cap = items.find(x => x.key === SAGE_IDS.head);
  assert.equal(cap.on, true, 'the piece the row holds');
  assert.equal(cap.levels, '115, lvl 50');
  assert.match(cap.line, /^CRT 20 · PIE 28 · 2\+3 slots$/);

  assert.ok(piecePickerView(SGE, gear, sageSet(), HEAD, 'zzzz').emptyText.includes('zzzz'), 'the empty line quotes the query');
});
