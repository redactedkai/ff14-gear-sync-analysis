// Checks several screens run: the totals of a set, the sync caps of a job.

import { CAPS_123, CAPS_123_2H_WEAPON, HAS_OFFHAND } from './constants.mjs';
import { check, expect } from './expect.mjs';
import { hasHScroll, setNumber, showMath } from './nav.mjs';

/** The Total row's cells of the open set page against `totals` (coreRecipe's: the character panel's numbers). */
export async function checkTotals(pg, what, totals, stats = Object.keys(totals)) {
  for (const stat of stats) {
    const got = await pg.locator(`#sh-total td[data-col="${stat}"]`).innerText();
    check(got === String(totals[stat]), `${what}: Total ${stat} is ${got}, the core finds ${totals[stat]}`);
  }
}

/** Piece stats at cap 123: for every slot, a piece above the cap is cut to the slot's caps, so its main stat and 1st
 * substat bars end at the known values. A shield job has an Off-hand slot, a two-handed job does not. */
export async function checkSyncCaps(pg, job) {
  await showMath(pg, 'piece');
  const slots = await pg.locator('#p-slot option').allInnerTexts();
  check(HAS_OFFHAND.has(job) === slots.includes('Off-hand'), `${job}: Piece stats slots ${JSON.stringify(slots)}`);
  const caps = HAS_OFFHAND.has(job) ? CAPS_123 : { ...CAPS_123, Weapon: CAPS_123_2H_WEAPON };
  for (const [slot, [sub, main]] of Object.entries(caps)) {
    await pg.selectOption('#p-slot', { label: slot });
    await setNumber(pg, '#p-ilvl', '160'); // above the cap, inside the slider's range
    await expect(pg.locator('#p-lead')).toHaveNumber(123);
    const kept = await pg.locator('#p-bars .num b').allInnerTexts(); // main stat, Vitality, 1st and 2nd substat
    check(kept[0] === String(main), `${job}: ${slot} main stat cap '${kept[0]}', expected ${main}`);
    check(kept[2] === String(sub), `${job}: ${slot} substat cap '${kept[2]}', expected ${sub}`);
  }
  await pg.selectOption('#p-slot', { label: 'Head / Hands / Feet' });
  await pg.click('#p-ilvl-reset');
}

/** Where a cap field's label line, input and neighbours are now: `line` the label line (a selector), `cap` and `level` the two
 * inputs (the level input sits beside the cap input), `others` the boxes next to the field that must not move (selectors).
 * Returns {em (the line's height in its font size), capTop, capHeight, capWidth, dy (cap input's top less level input's), others
 * ([left, top] of each)}. Take one in a state with no flag, then one in each state with a flag, and compare them with
 * checkCapLineStable. */
export function capLineShape(pg, { line, cap, level, others }) {
  return pg.evaluate(
    ({ line: lineSelector, cap: capSelector, level: levelSelector, others: otherSelectors }) => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const label = document.querySelector(lineSelector);
      const capBox = box(capSelector);
      return {
        em: label.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(label).fontSize),
        capTop: capBox.top,
        capHeight: capBox.height,
        capWidth: capBox.width,
        dy: capBox.top - box(levelSelector).top,
        others: otherSelectors.map(selector => [box(selector).left, box(selector).top]),
      };
    },
    { line, cap, level, others },
  );
}

/** A cap field in the state `what` against its shape with no flag (both from capLineShape): the label line is one line (under
 * 2 em), the input is where it was and as big, it sits level with the level input, no neighbour moved, and the page has no
 * sideways scroll. */
export async function checkCapLineStable(pg, what, plain, shape) {
  check(shape.em < 2, `${what}: the cap label wraps (${shape.em.toFixed(1)} em high)`);
  check(Math.abs(shape.capTop - plain.capTop) < 1, `${what}: the cap input moved ${(shape.capTop - plain.capTop).toFixed(1)} px down`);
  check(
    Math.abs(shape.capHeight - plain.capHeight) < 1,
    `${what}: the cap input is ${(shape.capHeight - plain.capHeight).toFixed(1)} px taller`,
  );
  check(
    Math.abs(shape.capWidth - plain.capWidth) < 1,
    `${what}: the cap input is ${(shape.capWidth - plain.capWidth).toFixed(1)} px wider`,
  );
  check(Math.abs(shape.dy) < 1, `${what}: the cap input is ${shape.dy.toFixed(1)} px off the level input`);
  shape.others.forEach(([left, top], at) => {
    const moved = Math.abs(left - plain.others[at][0]) + Math.abs(top - plain.others[at][1]);
    check(moved < 1, `${what}: the neighbour box ${at + 1} moved ${moved.toFixed(1)} px`);
  });
  check(!(await hasHScroll(pg)), `${what}: the page scrolls sideways`);
}
