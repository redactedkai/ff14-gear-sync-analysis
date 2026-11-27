/* A set page's materia menu (src/ui/views/stone-menu.ts) on real items: the grades an item level takes, the room under the
   cap, the odds of an overmeld slot. Expected values come from the items' published facts (materia grades, meld rules), not
   from the code. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { materiaMenuView } from '../../../../src/ui/views/stone-menu.ts';
import { placePiece } from '../../../../src/ui/sheets/set-edits.ts';
import { hasNumber, hasParts, piece } from '../../helpers/common.ts';
import { sageSet } from '../../helpers/sheet-fixtures.ts';

const SGE = makeJobContext('SGE');
const HEAD = 2;
const EAR = 7;

test('the materia menu: the best grades the item level takes, the room under the cap, removing the last stone', () => {
  const set = sageSet(); // Rainbow Cap: Critical Hit 20 under a cap of 28, three Critical Hit IV (4 each)
  const menu = materiaMenuView(SGE, set, HEAD, 2, false);
  assert.ok(hasParts(menu.title, 'Head', 'overmeld') && hasNumber(menu.title, 1), menu.title);
  // item level 115 takes grades I to IV (grade V needs 160)
  assert.deepEqual(
    menu.bands[0].columns.map(c => c.roman),
    ['IV', 'III', 'II', 'I'],
  );
  const crit = menu.bands[0].rows.find(r => r.stat === 'crit');
  assert.deepEqual(
    crit.cells.map(c => [c.text, c.on, c.fit]),
    [
      ['+4', true, 'none'], // 20 + 4 + 4 from slots 1 and 2 is already 28
      ['+3', false, 'none'],
      ['+2', false, 'none'],
      ['+1', false, 'none'],
    ],
  );
  assert.equal(menu.canRemove, true);
  assert.equal(menu.hasStone, true);
  assert.equal(materiaMenuView(SGE, set, HEAD, 3, false).hasStone, false, 'the fourth slot is empty: no Remove');
  const blocked = materiaMenuView(SGE, set, HEAD, 0, false);
  assert.ok(hasParts(blocked.removeNote, 'overmeld') && hasNumber(blocked.removeNote, 1), blocked.removeNote); // the slot to empty first
  assert.ok(hasParts(blocked.title, 'Head') && hasNumber(blocked.title, 1) && hasNumber(blocked.title, 2), blocked.title);
  assert.notEqual(blocked.title, menu.title, 'a guaranteed slot and an overmeld slot are titled apart');

  const all = materiaMenuView(SGE, set, HEAD, 3, true);
  assert.deepEqual([all.bands.length, all.columns], [2, 6]);
  assert.equal(all.bands[0].columns[0].roman, 'XII');
  assert.ok(hasParts(all.highNote, 'VI', 'VIII', 'X', 'XII'), `overmeld slot 2: ${all.highNote}`); // the grades it cannot take
  assert.equal(materiaMenuView(SGE, set, HEAD, 2, true).highNote, '', 'the first overmeld slot takes any grade');
});

/* The overmeld odds in the materia menu: the Wiki's Advanced Materia Melding table (HQ pieces) and the MateriaGrade sheet
   (NQ pieces), as in core/meld.overmeld-odds.test.ts. Courtly Lover's Earrings of Healing (item level 770, 1 slot +
   overmeld, can be HQ) and Axe of the Fury (item level 205, 2 slots + overmeld, cannot be HQ). */
const odds = menu => menu.bands.flatMap(b => b.columns).map(c => c.odds);

test('the materia menu: odds in an overmeld slot of an HQ piece, none in a guaranteed slot', () => {
  const earringsId = piece(SGE, "Courtly Lover's Earrings of Healing").gameId;
  const set = placePiece(SGE, sageSet(), EAR, earringsId).gearSet;

  const guaranteed = materiaMenuView(SGE, set, EAR, 0, false);
  assert.ok(hasParts(guaranteed.title, 'Earring') && hasNumber(guaranteed.title, 1), guaranteed.title);
  assert.deepEqual([guaranteed.showOdds, odds(guaranteed), guaranteed.nqNote], [false, ['', '', '', ''], '']);

  // overmeld slot 1: grades XII, XI, X, IX (best grades only) at 17%, the first slot taking every grade
  const first = materiaMenuView(SGE, set, EAR, 1, false);
  assert.ok(hasParts(first.title, 'Earring', 'overmeld') && hasNumber(first.title, 1), first.title);
  assert.deepEqual([first.showOdds, odds(first), first.nqNote], [true, ['17%', '17%', '17%', '17%'], '']);

  // overmeld slot 2: grades XI, IX, VII, V at 10%; the Wiki gives 10, 7, 5 for slots 2, 3, 4
  assert.deepEqual(odds(materiaMenuView(SGE, set, EAR, 2, false)), ['10%', '10%', '10%', '10%']);
  assert.deepEqual(odds(materiaMenuView(SGE, set, EAR, 3, false)), ['7%', '7%', '7%', '7%']);
  assert.deepEqual(odds(materiaMenuView(SGE, set, EAR, 4, false)), ['5%', '5%', '5%', '5%']);

  // all grades in overmeld slot 2: XII to VII, then VI to I; the grades the slot cannot take (the high ones, in a small slot) show a dash
  const all = materiaMenuView(SGE, set, EAR, 2, true);
  assert.deepEqual(odds(all), ['–', '10%', '–', '10%', '–', '10%', '–', '10%', '32%', '38%', '44%', '48%']);

  // a piece of item level 115 (Rainbow Cap, overmeld slot 1): grades V to XII need a higher item level, so they show a dash too
  const lowLevel = materiaMenuView(SGE, sageSet(), HEAD, 2, true);
  assert.deepEqual(odds(lowLevel).slice(0, 8), ['–', '–', '–', '–', '–', '–', '–', '–']);
});

test('the materia menu: an NQ piece uses the NQ odds and says so', () => {
  const WAR = makeJobContext('WAR');
  const axeId = piece(WAR, 'Axe of the Fury').gameId;
  const set = placePiece(WAR, sageSet(), 0, axeId).gearSet;
  const guaranteed = materiaMenuView(WAR, set, 0, 1, false);
  assert.deepEqual([guaranteed.showOdds, odds(guaranteed), guaranteed.nqNote], [false, ['', '', '', ''], '']);
  const first = materiaMenuView(WAR, set, 0, 2, false);
  assert.ok(hasParts(first.title, 'Weapon', 'overmeld') && hasNumber(first.title, 1), first.title);
  assert.deepEqual(odds(first), ['12%', '48%', '60%', '72%']); // grades V to II, the most item level 205 takes: NQ rates
  assert.ok(first.nqNote.length > 0, 'the odds say they are for a piece that cannot be high quality');
});
