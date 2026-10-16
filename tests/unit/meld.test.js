/* Materia melds (src/core/meld.js): stones by item level, slots, caps and the best melds of real pieces. Expected values
   come from the game files (Materia sheet values and gates, Item slot counts) and published caps (Kirin's Osode of
   Fending, item level 300 body: substat cap 110, Console Games Wiki), worked by hand, not from the code under test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, meldInfo, mkItem, poolItemFromRow } from '../../src/core/items.js';
import { MATERIA } from '../../src/core/tables.js';
import { bestMeld, meldCaps, meldSlots, meldText, stoneValues } from '../../src/core/meld.js';
import { optimize } from '../../src/core/optimizer/index.js';

const sge = makeJobContext('SGE');
const war = makeJobContext('WAR');
const pld = makeJobContext('PLD');

function piece(job, name) {
  const r = browseItems(job, { q: name, type: 'any', ilvlMin: 1, ilvlMax: 999, lvlMax: 100 }).find(x => x.name === name);
  assert.ok(r, name);
  return poolItemFromRow(job, r);
}

/* Combat materia: values I-XII 1, 2, 3, 4, 6, 16, 8, 24, 12, 36, 18, 54; gates 15, 30, 45, 70, 160, 290, 420, 420, 560,
   560, 690, 690; VI, VIII, X and XII cannot go past the first overmeld slot. */
test('best big and small stone at each item level gate', () => {
  const at = il => {
    const s = stoneValues(il);
    return [s.big.grade, s.big.value, s.small.grade, s.small.value];
  };
  assert.deepEqual(at(100), [4, 4, 4, 4]);
  assert.deepEqual(at(159), [4, 4, 4, 4]);
  assert.deepEqual(at(160), [5, 6, 5, 6]);
  assert.deepEqual(at(289), [5, 6, 5, 6]);
  assert.deepEqual(at(290), [6, 16, 5, 6]);
  assert.deepEqual(at(419), [6, 16, 5, 6]);
  assert.deepEqual(at(420), [8, 24, 7, 8]);
  assert.deepEqual(at(559), [8, 24, 7, 8]);
  assert.deepEqual(at(560), [10, 36, 9, 12]);
  assert.deepEqual(at(689), [10, 36, 9, 12]);
  assert.deepEqual(at(690), [12, 54, 11, 18]);
  assert.deepEqual(stoneValues(14), { big: null, small: null });
});

test('slots: guaranteed ones big; with overmelding 5 in all, the first overmeld big and the rest small', () => {
  assert.deepEqual(meldSlots(piece(war, "Kirin's Osode of Fending")), { big: 5, small: 0 }); // 5, no overmeld
  assert.deepEqual(meldSlots(piece(sge, "Courtly Lover's Pendulums")), { big: 3, small: 2 }); // 2 + overmeld
  assert.deepEqual(meldSlots(piece(sge, "Courtly Lover's Earrings of Healing")), { big: 2, small: 3 }); // 1 + overmeld
  // 0 slots but flagged for overmelding (15 Paladin shields): no melds (inferred)
  assert.deepEqual(meldSlots(piece(pld, 'Dwarven Mythril Shield')), { big: 0, small: 0 });
  assert.deepEqual(meldSlots(mkItem('Hand-made', 'head', 300, { crit: 10 })), { big: 0, small: 0 });
});

test("meld cap of a piece is its own sync cap: Kirin's Osode of Fending (item level 300 body) 110", () => {
  const c = meldCaps(war, piece(war, "Kirin's Osode of Fending"));
  assert.deepEqual([c.crit, c.det, c.dh, c.spd, c.spec], [110, 110, 110, 110, 110]);
});

test("Kirin's Osode of Fending: Determination 77 -> 110 with three VI, the other two slots left empty", () => {
  const it = piece(war, "Kirin's Osode of Fending");
  const m = bestMeld(war, it, ['det']);
  assert.deepEqual(m.gain, { det: 33 });
  assert.equal(m.free, 2);
  assert.equal(meldText(war, m), 'DET VI ×3, 2 slots empty');
  // with a tiebreak the two spare VI go to it
  assert.deepEqual(bestMeld(war, it, ['det', 'dh']).gain, { det: 33, dh: 32 });
  // a substat the piece lacks can be melded: five VI, 80 below the 110 cap
  assert.deepEqual(bestMeld(war, it, ['spd']).gain, { spd: 80 });
});

/* Greedy filling is not exact. Critical Hit 142 below a cap of 203 leaves 61; two big (XII, 54) and three small (XI, 18)
   stones. Greedy puts both XII into Critical Hit (+61, 47 lost) and three XI into Determination (+54); XII + XI cover
   the 61 as well and leave a XII for Determination: +90. */
test("Courtly Lover's Earrings of Healing: Crit > Det beats greedy (+61 / +90, not +61 / +54)", () => {
  const it = piece(sge, "Courtly Lover's Earrings of Healing");
  const m = bestMeld(sge, it, ['crit', 'det']);
  assert.deepEqual(m.gain, { crit: 61, det: 90 });
  // in slot order: XII in the guaranteed slot and the first overmeld slot, XI in overmeld slots 2 to 4, which refuse
  // the even grades (MateriaGrade: XII has a 0% rate past the first overmeld slot)
  assert.equal(meldText(sge, m), 'CRT XII, DET XII, CRT XI, DET XI ×2');
  assert.deepEqual(bestMeld(sge, it, ['det', 'crit']).gain, { det: 162 });
  // Critical Hit alone: XII + XI reach the cap as well as two XII, with the cheaper stone; the other three slots stay
  // empty (no stones in substats the objective doesn't score)
  const crit = bestMeld(sge, it, ['crit']);
  assert.deepEqual(crit.gain, { crit: 61 });
  assert.equal(meldText(sge, crit), 'CRT XII, CRT XI, 3 slots empty');
});

test("Courtly Lover's Pendulums: Crit > Det > DH gets Direct Hit +54 (greedy +36)", () => {
  const m = bestMeld(sge, piece(sge, "Courtly Lover's Pendulums"), ['crit', 'det', 'dh']);
  assert.deepEqual(m.gain, { det: 127, dh: 54 });
});

test('Rainbow Robe of Healing (item level 115): grade IV only; Piety headroom 13 takes four, one slot left empty', () => {
  const it = piece(sge, 'Rainbow Robe of Healing');
  assert.deepEqual(bestMeld(sge, it, ['spd']).gain, { spd: 20 });
  const m = bestMeld(sge, it, ['spec']);
  assert.equal(m.gain.spec, 13);
  assert.equal(
    m.stones.reduce((n, x) => n + x.n, 0),
    4,
  );
  assert.equal(m.free, 1);
});

test('no melds: a main stat target alone, a piece with no slots, a hand-made piece', () => {
  assert.equal(bestMeld(sge, piece(sge, "Courtly Lover's Earrings of Healing"), ['main']), null);
  assert.equal(bestMeld(pld, piece(pld, 'Dwarven Mythril Shield'), ['det']), null);
  assert.equal(bestMeld(sge, mkItem('Hand-made', 'head', 300, { crit: 10 }), ['crit']), null);
});

/* Whether a piece keeps its melds is the sync rule (verified by the owner in game): kept at the cap, lost one above it,
   lost when its equip level is above the synced level, kept with sync off. Kirin's Osode: item level 300, equip 70. */
test('melds count only on pieces that are not synced', () => {
  const it = piece(war, "Kirin's Osode of Fending");
  const det = sync => optimize(war, [it], sync, { target: 'det', melds: true }).totals.det;
  assert.equal(det({ cap: 300, sync: true, level: 100 }), 110);
  assert.equal(det({ cap: null, sync: false, level: 100 }), 110);
  assert.equal(det({ cap: 299, sync: true, level: 100 }), 77);
  assert.equal(det({ cap: null, sync: false, level: 69 }), 77);
  assert.equal(det({ cap: 300, sync: true, level: 70 }), 110);
});

/* With a speed range a piece brings every meld split worth keeping (meldVersions): the piece has no Skill Speed, so a
   minimum is met only by melding some. Its Determination is 33 below its cap, so the slots past that take Skill Speed
   and Determination still reaches 110. */
test('melds with a speed range: a speed minimum is met by melds', () => {
  const it = piece(war, "Kirin's Osode of Fending");
  const r = optimize(war, [it], { cap: null, sync: false }, { target: 'det', melds: true, spdMin: 10 });
  assert.ok(r.ok);
  assert.ok(r.totals.spd >= 10);
  assert.equal(r.totals.det, 110);
  assert.equal(optimize(war, [it], { cap: null, sync: false }, { target: 'det', spdMin: 10, spdMax: 999 }).ok, false);
});

/* Every meld line is a legal melding order. Read left to right, the stones fill slots 1, 2, ... in turn: no more stones
   than slots; no VI, VIII, X or XII past the first overmeld slot (MateriaGrade gives them a 0% rate there); every grade
   allowed at the piece's item level; every stat a combat substat; the gains add up and stay within each cap. Checked
   for every meldable piece of a healer, a tank and a caster, for several objectives. */
test('every meld is a legal order of slots, for every meldable piece', () => {
  let checked = 0;
  for (const job of [sge, war, makeJobContext('BLM')]) {
    const pool = browseItems(job, { q: '', type: 'any', ilvlMin: 1, ilvlMax: 999, lvlMax: 100 }).map(r => poolItemFromRow(job, r));
    const objectives = [['crit'], ['spd', 'det'], ['det', 'crit', 'dh'], [job.substats.at(-1), 'crit']];
    for (const it of pool) {
      const info = meldInfo(it);
      if (!info?.slots) continue;
      const highSlots = info.overmeld ? info.slots + 1 : info.slots; // guaranteed slots and the first overmeld slot
      const total = info.overmeld ? 5 : info.slots;
      const caps = meldCaps(job, it);
      for (const keys of objectives) {
        const m = bestMeld(job, it, keys);
        if (!m) continue;
        const seq = m.stones.flatMap(x => Array(x.n).fill(x));
        const label = `${job.jobId} ${it.name} ${keys}`;
        assert.equal(seq.length + m.free, total, label);
        const sum = {};
        seq.forEach((x, i) => {
          assert.ok(job.substats.includes(x.stat), label);
          // no stone in a substat the objective doesn't score: those slots stay empty (owner's decision 2026-10-15)
          assert.ok(keys.includes(x.stat), `${label}: a stone in ${x.stat}`);
          assert.ok(MATERIA.gate[x.grade - 1] <= it.ilvl, `${label}: grade ${x.grade} below its gate`);
          if (i >= highSlots) assert.ok(!MATERIA.high.includes(x.grade), `${label}: grade ${x.grade} in slot ${i + 1}`);
          sum[x.stat] = (sum[x.stat] || 0) + MATERIA.values[x.grade - 1];
        });
        for (const [s, g] of Object.entries(m.gain)) {
          const base = it.stats[s] || 0;
          assert.equal(g, Math.min(sum[s] || 0, Math.max(0, caps[s] - base)), `${label}: ${s}`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 10000, `${checked} melds checked`);
});

/* meldVersions (Target GCD). Kirin's Osode of Fending (item level 300, no Skill Speed, Determination 77 of a 110 cap):
   with a speed minimum only, more speed is always better, so every kept version melds speed into the slots that
   Determination does not fill; with a maximum (exactSpd), versions with less speed must survive too, down to none, or a
   band below the piece's full speed could be missed. */
test('meld versions: with a speed maximum, versions with less speed are kept', async () => {
  const { meldVersions } = await import('../../src/core/meld.js');
  const it = piece(war, "Kirin's Osode of Fending");
  const gains = vs => vs.map(m => [m?.gain.det || 0, m?.gain.spd || 0]);
  const min = gains(meldVersions(war, it, ['det', 'spd']));
  const exact = gains(meldVersions(war, it, ['det', 'spd'], { exactSpd: true }));
  for (const v of min)
    assert.ok(
      exact.some(w => w[0] === v[0] && w[1] === v[1]),
      `${v} kept with a maximum`,
    );
  assert.ok(exact.length > min.length);
  assert.ok(
    exact.some(([det, spd]) => det === 33 && spd === 0),
    'Determination to its cap and no speed',
  );
  assert.ok(!min.some(([det, spd]) => det === 33 && spd === 0), 'beaten by more speed without a maximum');
  // no version beats another on both stats at the same speed (exact) or at all (min)
  const beats = (a, b) => a[0] >= b[0] && a[1] >= b[1] && (a[0] > b[0] || a[1] > b[1]);
  for (const a of min) for (const b of min) assert.ok(!beats(a, b), `${a} beats ${b}`);
  for (const a of exact) for (const b of exact) assert.ok(a[1] !== b[1] || !beats(a, b), `${a} beats ${b}`);
  // every gain stays within the cap and comes from legal stones
  for (const m of meldVersions(war, it, ['det', 'spd'], { exactSpd: true })) {
    if (!m) continue;
    assert.ok((m.gain.det || 0) <= 33);
    assert.ok((m.gain.spd || 0) <= 110);
  }
});

test('meld versions: a piece that takes no stones has one version, no melds', async () => {
  const { meldVersions } = await import('../../src/core/meld.js');
  assert.deepEqual(meldVersions(sge, mkItem('H', 'head', 300, { crit: 10 }), ['crit', 'spd']), [null]);
});
