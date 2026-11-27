/* The Gear browser (gearView) over random filter and sort settings from a fixed seed, against a naive filter and sort written
   here from the raw database rows: the same rows over all pages, the same count, the same order for the chosen sort, and the
   Slot menu counting the rows under the other filters. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, ACTIVITY_MARKET_BIT, DB_SLOT_TYPE, JOBS, ROW } from '../../../../src/core/constants.ts';
import { dbStats, expansionOf, rowStats } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { ITEMS } from '../../../../src/core/tables.ts';
import { syncSettings } from '../../../../src/ui/job-sync-panel.ts';
import { defaultBrowse } from '../../../../src/ui/state.ts';
import { gearView } from '../../../../src/ui/views/gear.ts';
import { rng } from '../../helpers/common.ts';

const CASES = 250;
const STAT_ORDER = ['str', 'dex', 'int', 'mind', 'vit', 'piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps', 'mainAttr', 'secAttr'];

/* The rows the browser should list for `job` under the filters `browse`: {name, type, ilvl, lvl}, by the rules of the page's
   filters written out again (job mask, slot, equip level, item level range, expansion, name words, main stat, Gear categories). */
function naiveRows(job, browse) {
  const jobBit = 1 << job.jobIndex;
  const words = browse.q.toLowerCase().split(/\s+/).filter(Boolean);
  const allowedRoutes =
    ACTIVITIES.filter(activity => !browse.exclude.includes(activity.key)).reduce((mask, activity) => mask | activity.bit, 0) |
    (browse.market ? ACTIVITY_MARKET_BIT : 0);
  const equipLevelMax = Number(browse.lvl) || 0;
  const ilvlMin = Number(browse.min) || 0;
  const ilvlMax = Number(browse.max) || 0;
  const statAt = key => STAT_ORDER.indexOf(key);
  const rows = [];
  for (const row of ITEMS) {
    if ((row[ROW.jobMask] & jobBit) === 0) {
      continue;
    }
    if (browse.type !== 'any' && DB_SLOT_TYPE[row[ROW.slotCode]] !== browse.type) {
      continue;
    }
    if (row[ROW.equipLevel] > job.maxLevel || (equipLevelMax && row[ROW.equipLevel] > equipLevelMax)) {
      continue;
    }
    if (ilvlMin && row[ROW.ilvl] < ilvlMin) {
      continue;
    }
    if (ilvlMax && row[ROW.ilvl] > ilvlMax) {
      continue;
    }
    if (browse.expOff.includes(expansionOf(row[ROW.equipLevel], row[ROW.ilvl]))) {
      continue;
    }
    if (!words.every(word => row[ROW.name].toLowerCase().includes(word))) {
      continue;
    }
    const raw = rowStats(row);
    if (!raw[statAt(job.mainKey)] && !raw[statAt('mainAttr')]) {
      continue;
    }
    if (!row[ROW.routes].some(route => (route & ~allowedRoutes) === 0)) {
      continue;
    }
    rows.push({
      name: row[ROW.name],
      type: DB_SLOT_TYPE[row[ROW.slotCode]],
      ilvl: row[ROW.ilvl],
      lvl: row[ROW.equipLevel],
      raw: dbStats(job, raw),
    });
  }
  return rows;
}

test('the Gear browser lists the rows, order and slot counts of a naive filter and sort', () => {
  const rand = rng(8675309);
  const pick = list => list[Math.floor(rand() * list.length)];
  const words = ['', '', '', 'ring', 'of', 'ironworks', 'a', 'heavens', 'the sky', 'zzzz', ' Cap ', 'Ra'];
  const id = row => `${row.name}|${row.type}|${row.ilvl}`;
  for (let n = 0; n < CASES; n++) {
    const job = makeJobContext(pick(JOBS).id);
    const browse = {
      ...defaultBrowse(job),
      q: pick(words),
      type: pick(['any', 'any', ...job.activeSlotTypes]),
      expOff: ['ARR', 'HW', 'SB', 'ShB', 'EW', 'DT'].filter(() => rand() < 0.25),
      exclude: ACTIVITIES.map(activity => activity.key).filter(() => rand() < 0.3),
      market: rand() < 0.5,
      min: pick(['', '', 100, 300, 690, '12abc']),
      max: pick(['', '', 200, 500, 795, 99999]),
      lvl: pick([job.maxLevel, '', 50, 70, 90, 1]),
      sort: pick(['name', 'lvl', 'ilvl', ...job.stats]),
      dir: pick(['asc', 'desc']),
    };
    const cap = pick([null, 123, 475, 660]);
    const sync = syncSettings({ cap, sync: cap != null, level: pick([null, 50, 90, job.maxLevel]) });
    const label = `${job.jobId} ${JSON.stringify(browse)} cap ${cap}`;

    // the count
    const want = naiveRows(job, browse);
    const first = gearView(job, sync, browse, 1);
    const count = /^(\d[\d,]*)/.exec(first.countText);
    assert.equal(count ? Number(count[1].replace(/,/g, '')) : 0, want.length, `${label}: count text "${first.countText}"`);

    // the rows over all pages
    const shown = [];
    for (let page = 1; page <= first.pageCount; page++) {
      shown.push(...gearView(job, sync, browse, page).shown);
    }
    assert.deepEqual(shown.map(id).sort(), want.map(id).sort(), `${label}: rows`);

    // the order: by the sort key, then the view's ties; ascending reverses the key (a stat is its synced value)
    const keyOf = row => {
      if (browse.sort === 'lvl') {
        return row.lvl;
      }
      return browse.sort === 'ilvl' ? row.ilvl : row.eff[browse.sort] || 0;
    };
    const direction = browse.dir === 'asc' ? -1 : 1;
    for (let i = 1; i < shown.length; i++) {
      const before = shown[i - 1];
      const after = shown[i];
      const comesLater =
        browse.sort === 'name' ? direction * after.name.localeCompare(before.name) : direction * (keyOf(after) - keyOf(before));
      assert.ok(comesLater <= 0, `${label}: row ${i} (${id(after)}) should not come after ${id(before)}`);
    }

    // the Slot menu counts the rows under every other filter
    const anyRows = naiveRows(job, { ...browse, type: 'any' });
    for (const pill of first.slots) {
      const expected = pill.key === 'any' ? anyRows.length : anyRows.filter(row => row.type === pill.key).length;
      assert.equal(pill.count, expected, `${label}: pill ${pill.key}`);
    }
  }
});
