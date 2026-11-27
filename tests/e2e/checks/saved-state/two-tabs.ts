// The saved settings (Gear browser filters, Stat Allocation) in two browser tabs.

import { PAGE, STORE_KEY } from '../../lib/constants.ts';
import { check, stepRecord } from '../../lib/expect.ts';
import { fieldValue, newPage, showMath, showTab, waitReady, waitSaved } from '../../lib/nav.ts';
import { pickOption } from '../../lib/select.ts';

/** The saved settings as another browser tab finds them in the shared storage. */
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORE_KEY);

/** Count the storage events `page` hears from now on (a save by another tab of the same storage raises one), so a step can
 * wait until the other tab's save has reached this tab and only then check that this tab did not change. */
const listenForStorageEvents = page =>
  page.evaluate(key => {
    window.__storageEvents = 0;
    window.addEventListener('storage', event => {
      if (event.key === key) {
        window.__storageEvents++;
      }
    });
  }, STORE_KEY);

/** Wait until `page` has heard `count` storage events of the settings key since listenForStorageEvents. */
const waitForStorageEvents = (page, count) => page.waitForFunction(wanted => window.__storageEvents >= wanted, count);

/** Open the Gear browser (its own panel) and read the Item level "min" box. */
async function browserFrom(page) {
  await showTab(page, 'browse', true);
  return fieldValue(page, '#b-min');
}

/** Open Stat Allocation and read its slot and item level boxes: [slot, item level]. */
async function pieceBoxes(page) {
  await showMath(page, 'piece');
  return [await fieldValue(page, '#p-slot'), await fieldValue(page, '#p-ilvl')];
}

/** The saved settings of the Gear browser and Stat Allocation in two browser tabs (two pages of one context share the storage, as
 * two tabs do). The rule, as the page behaves (src/ui/store/autosave.ts, src/ui/state.ts): a tab reads the saved settings once,
 * when it opens, and never again (it ignores storage events: no live sync); each save writes the tab's whole settings, the
 * Gear browser's, Stat Allocation's and Substat tiers' together, not only the field that changed. So the tab that saves last
 * wins everything: a change the other tab made and this tab never saw is written over by this tab's old value of it, and a reload
 * of either tab shows the last saved whole. There is no merge by field. Checked, with the Item level "min" box of the Gear
 * browser (page A's) and the slot and item level boxes of Stat Allocation (page B's):
 *   1. A types a "min" and it is saved; B, open since before, has heard the save and still shows none (no live sync).
 *   2. B picks a slot in Stat Allocation and it is saved: the stored "min" is B's (empty), A's is lost, and the slot is B's. A
 *      still shows its own "min" until it reloads, and then shows B's whole: no "min", B's slot.
 *   3. B types an item level in Stat Allocation and it is saved; A, which has heard of it and not changed, types a "max" and saves:
 *      the stored item level is A's (empty), B's is lost, and the stored "max" and B's slot are kept. B reloads and finds A's whole. */
export async function checkTwoTabsSettings(pg) {
  const rec = stepRecord.getStore();
  const other = await newPage(pg.context());
  other.on('pageerror', e => rec.errors.push(`page error (second tab): ${e.message ?? e}`));
  other.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('ERR_')) {
      rec.errors.push(`console error (second tab): ${m.text()}`);
    }
  });
  await showTab(pg, 'browse', true);
  await other.goto(PAGE);
  await waitReady(other);
  check((await browserFrom(other)) === '', 'two tabs, settings: the second tab starts with a "min" item level');
  await listenForStorageEvents(pg);
  await listenForStorageEvents(other);

  // 1. A types a "min"; B hears of the save and shows nothing new
  await pg.fill('#b-min', '130');
  await waitSaved(pg, 's => Number(s.browse.min) === 130');
  await waitForStorageEvents(other, 1);
  const bMin = await browserFrom(other);
  check(bMin === '', `two tabs, settings: the second tab's "min" changed under it, to '${bMin}'`);

  // 2. B picks a slot and saves its whole settings: A's "min" is lost; A shows its own until it reloads, then B's whole
  await showMath(other, 'piece');
  await pickOption(other, '#p-slot', 'body');
  await waitSaved(other, "s => s.piece.slot === 'body'");
  await waitForStorageEvents(pg, 1);
  const afterB = await stored(pg);
  check(
    afterB.piece.slot === 'body' && String(afterB.browse.min) === '',
    `two tabs, settings: the stored slot is '${afterB.piece.slot}' and "min" '${afterB.browse.min}', not B's whole ('body' and empty)`,
  );
  const aMin = await pg.inputValue('#b-min');
  check(aMin === '130', `two tabs, settings: the first tab's "min" changed under it, to '${aMin}'`);
  await pg.reload();
  await waitReady(pg);
  const aMinAfter = await browserFrom(pg);
  check(aMinAfter === '', `two tabs, settings: after the first tab reloads its "min" is '${aMinAfter}', not the second tab's (empty)`);
  const [aSlot] = await pieceBoxes(pg);
  check(aSlot === 'body', `two tabs, settings: after the first tab reloads its slot is '${aSlot}', not the second tab's 'body'`);

  // 3. B types an item level and saves; A, which never saw it, types a "max" and saves: B's item level is lost
  await listenForStorageEvents(pg);
  await listenForStorageEvents(other);
  await other.fill('#p-ilvl', '300');
  await other.locator('#p-ilvl').dispatchEvent('change');
  await waitSaved(other, 's => s.piece.ilvl === 300');
  await waitForStorageEvents(pg, 1);
  await showTab(pg, 'browse', true);
  await pg.fill('#b-max', '135');
  await waitSaved(pg, 's => Number(s.browse.max) === 135');
  await waitForStorageEvents(other, 1);
  const afterA = await stored(pg);
  check(
    afterA.piece.ilvl === null && afterA.piece.slot === 'body' && Number(afterA.browse.max) === 135,
    `two tabs, settings: the stored item level is ${afterA.piece.ilvl} (slot '${afterA.piece.slot}', "max" ${afterA.browse.max}), not A's whole (null, 'body', 135)`,
  );
  const bIlvl = await fieldValue(other, '#p-ilvl');
  check(bIlvl === '300', `two tabs, settings: the second tab's item level changed under it, to '${bIlvl}'`);
  await other.reload();
  await waitReady(other);
  const [bSlot, bIlvlAfter] = await pieceBoxes(other);
  const [aSlotNow, aIlvlNow] = await pieceBoxes(pg); // what the page that saved last shows (an item level never typed shows its default)
  check(
    bIlvlAfter === aIlvlNow && bIlvlAfter !== '300' && bSlot === aSlotNow,
    `two tabs, settings: after the second tab reloads its item level is '${bIlvlAfter}' (slot '${bSlot}'), not the first tab's '${aIlvlNow}' ('${aSlotNow}')`,
  );
  const bMax = await other.inputValue('#b-max');
  check(
    (await browserFrom(other)) === '' && bMax === '135',
    `two tabs, settings: after it reloads, the second tab shows "max" '${bMax}', not the first tab's whole (empty "min", "max" 135)`,
  );
  await other.close();
}
