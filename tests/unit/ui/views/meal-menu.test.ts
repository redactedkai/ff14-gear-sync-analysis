/* The Food row's menu of a set page (src/ui/views/meal-menu.ts): its meals by expansion and what each adds on the set's
   gear, the pills, search, stat line and sort, and the empty list's advice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../../src/core/constants.ts';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import {
  mealBestKeys,
  mealBestNote,
  mealEmptyReason,
  mealLine,
  mealList,
  mealMenu,
  mealPillOff,
  mealsPassing,
  sortMeals,
} from '../../../../src/ui/views/meal-menu.ts';
import { setMealMenuView } from '../../../../src/ui/views/set-meal-menu.ts';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.ts';
import { sageSet, sheetOf } from '../../helpers/sheet-fixtures.ts';
import { makeApp, solveOf } from '../../helpers/views.ts';

/* A Sage set: synced level 70, item level 375, Critical Hit > Determination > Mind, materia and food. On its gear Popoto
   Potage and Mollete (Critical Hit + Spell Speed) add the most Critical Hit the totals allow, +133 (under their 151
   cap: their percent of these totals); Caramel Popcorn (Determination + Critical Hit) adds +91 Critical Hit and +125 or
   +126 Determination. */
test("Food menu on a Sage set: what each meal adds on the set's gear, chips and the Critical Hit sort", () => {
  const app = makeApp('SGE', { level: 70, cap: 375 });
  Object.assign(app.recipe, { target: 'crit', tb: 'det', tb2: 'mind', melds: true, food: true, byTier: true });
  const { run, set } = solveOf(app);
  assert.equal(run.status, 'ok');
  const shown = allMeals(app.jobCtx).find(m => m.key === run.set.meal);
  const menu = mealMenu(app.jobCtx, 70, set.gear, shown);
  const all = menu.groups.flatMap(g => g.items);
  assert.equal(all.length, allMeals(app.jobCtx).length, 'every meal the job can use');
  assert.deepEqual(
    all.filter(x => x.on).map(x => x.name),
    [shown.name],
    "the set's meal is marked",
  );
  for (const name of ['Popoto Potage', 'Mollete']) {
    assert.equal(all.find(x => x.name === name).adds[0].text, 'CRT +133', name);
  }
  const popcorn = all.find(x => x.name === 'Caramel Popcorn');
  assert.deepEqual(
    popcorn.adds.map(a => a.stat),
    ['det', 'crit', 'vit'],
    'its main stat first',
  );
  assert.equal(popcorn.adds[1].value, 91);
  assert.ok([125, 126].includes(popcorn.adds[0].value), popcorn.adds[0].text);
  assert.ok(menu.pills.every(p => app.jobCtx.substats.includes(p.stat)));

  // no pill: the set's meal first, then every other meal, by expansion newest first, no chip, no Sort row
  const none = mealList(menu, { stats: [], query: '', sortBy: 'ilvl' });
  assert.deepEqual(none.sorts, []);
  assert.deepEqual(
    none.groups.map(g => g.key),
    ['pick', 'Dawntrail', 'Endwalker', 'Shadowbringers', 'Stormblood', 'Heavensward', 'A Realm Reborn'],
  );
  assert.deepEqual(
    none.groups[0].items.map(x => x.name),
    [shown.name],
    "the set's meal leads alone",
  );
  assert.ok(none.groups.every(g => g.items.every(x => x.line.every(a => !a.hit))));

  // CRT and DET, sorted by CRT: one list, most Critical Hit first
  const both = mealList(menu, { stats: ['crit', 'det'], query: '', sortBy: 'crit' });
  assert.deepEqual(
    both.sorts.map(o => o.label),
    ['ILVL', 'CRT', 'DET'],
  );
  // the set's meal does not have both stats, so it is not listed apart: one list
  assert.deepEqual(
    both.groups.map(g => [g.key, g.label]),
    [['sorted', null]],
  );
  const sorted = both.groups[0].items;
  assert.equal(sorted[0].name, 'Caramel Popcorn');
  assert.ok(sorted.every(x => x.stats.includes('crit') && x.stats.includes('det')));
  const crit = sorted.map(x => x.adds.find(a => a.stat === 'crit').value);
  assert.deepEqual(
    crit,
    [...crit].sort((a, b) => b - a),
  );
  assert.deepEqual(
    sorted[0].line.map(a => a.hit),
    [true, true, false],
  );
});

/* The Food menu's filters on a hand-made list: Critical Hit + Determination, Critical Hit +
   Direct Hit, Spell Speed + Determination; each adds Vitality last. */
const meal = (name, ilvl, adds) => ({
  key: name,
  name,
  ilvl,
  stats: Object.keys(adds).filter(s => s !== 'vit'),
  adds: Object.entries(adds).map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  on: false,
});
const MEALS = [
  meal('Caramel Popcorn', 770, { det: 125, crit: 91, vit: 121 }),
  meal('Rroneek au Gratin', 770, { crit: 91, dh: 36, vit: 121 }),
  meal('Mate Cookie', 740, { sps: 36, det: 125, vit: 121 }),
];
const filters = (stats, query = '') => ({ stats, query });

test('Food menu filters: every picked stat, every search word', () => {
  assert.equal(mealsPassing(MEALS, filters([])).length, 3);
  assert.deepEqual(
    mealsPassing(MEALS, filters(['crit'])).map(x => x.name),
    ['Caramel Popcorn', 'Rroneek au Gratin'],
  );
  assert.deepEqual(
    mealsPassing(MEALS, filters(['crit', 'dh'])).map(x => x.name),
    ['Rroneek au Gratin'],
  );
  assert.deepEqual(
    mealsPassing(MEALS, filters([], 'mate coo')).map(x => x.name),
    ['Mate Cookie'],
  );
});

test("Food menu stat line: a meal's stats in its own order, a picked pill's stat marked, none with no pill", () => {
  const { adds } = MEALS[0];
  assert.deepEqual(
    mealLine(adds, []).map(a => [a.stat, a.hit]),
    [
      ['det', false],
      ['crit', false],
      ['vit', false],
    ],
  );
  assert.deepEqual(
    mealLine(adds, ['crit']).map(a => a.hit),
    [false, true, false],
  );
  assert.deepEqual(
    mealLine(adds, ['crit', 'det']).map(a => a.hit),
    [true, true, false],
  );
  assert.equal(mealLine(adds, ['crit'])[1].text, 'crit +91');
});

test('Food menu sort: by the points a meal adds, then the other picked stat, ties newest first; ILVL keeps the order', () => {
  const items = [
    meal('A', 770, { det: 100, crit: 50, vit: 1 }),
    meal('B', 740, { det: 90, crit: 60, vit: 1 }),
    meal('C', 710, { det: 110, crit: 60, vit: 1 }),
    meal('D', 680, { det: 110, crit: 60, vit: 1 }),
  ];
  const names = list => list.map(x => x.name);
  assert.deepEqual(names(sortMeals(items, 'ilvl', ['crit'])), ['A', 'B', 'C', 'D']);
  // one pill: Critical Hit, ties newest first
  assert.deepEqual(names(sortMeals(items, 'crit', ['crit'])), ['B', 'C', 'D', 'A']);
  // two pills: Critical Hit, then Determination, then newest first
  assert.deepEqual(names(sortMeals(items, 'crit', ['crit', 'det'])), ['C', 'D', 'B', 'A']);
  assert.deepEqual(names(sortMeals(items, 'det', ['crit', 'det'])), ['C', 'D', 'A', 'B']);
  // a stat whose pill is off sorts as ILVL
  assert.deepEqual(names(sortMeals(items, 'det', ['crit'])), ['A', 'B', 'C', 'D']);
  assert.notEqual(sortMeals(items, 'ilvl', []), items, 'a new array');
});

test('Food menu pills: greyed out only as a third, or when the list would be empty; a picked one never is', () => {
  // nothing greys a pill but the list
  assert.equal(mealPillOff(MEALS, 'dh', filters([])), false);
  assert.equal(mealPillOff(MEALS, 'crit', filters(['crit'])), false);
  // Spell Speed with Critical Hit: no meal has both
  assert.equal(mealPillOff(MEALS, 'sps', filters(['crit'])), true);
  assert.equal(mealPillOff(MEALS, 'det', filters(['crit'])), false);
  // a third pill, always
  assert.equal(mealPillOff(MEALS, 'sps', filters(['crit', 'det'])), true);
  // under a search: a pill that would leave nothing it matches
  assert.equal(mealPillOff(MEALS, 'dh', filters([], 'caramel')), true);
});

test('Food menu empty list: only a search empties the list, and Clear search brings meals back', () => {
  assert.equal(mealEmptyReason(MEALS, filters(['crit'])), null);
  const noMatch = mealEmptyReason(MEALS, filters(['crit'], 'xyz '));
  assert.equal(noMatch.action, 'query');
  assert.ok(noMatch.text.includes('xyz') && !noMatch.text.includes('xyz '), noMatch.text); // the query, trimmed
  // nothing to bring back (a state the menu cannot reach, or no meal at all): no line
  assert.equal(mealEmptyReason(MEALS, filters(['crit', 'sps'])), null);
  assert.equal(mealEmptyReason([], filters([], 'xyz')), null);
});

test('Food menu list: the pills and search narrow the list; the Sort row follows the picked pills', () => {
  const menu = {
    groups: [
      { label: 'Dawntrail', items: MEALS.slice(0, 2) },
      { label: 'Endwalker', items: MEALS.slice(2) },
    ],
    pills: ['crit', 'det', 'dh', 'sps'].map(stat => ({ stat, short: stat.toUpperCase(), label: stat })),
  };
  const view = (stats, query = '', sortBy = 'ilvl') => mealList(menu, { stats, query, sortBy });
  const shown = v => v.groups.map(g => [g.key, g.items.map(x => x.name)]);
  assert.deepEqual(shown(view(['dh'])), [['Dawntrail', ['Rroneek au Gratin']]]);
  const searched = view([], 'popoto');
  assert.deepEqual(shown(searched), []);
  assert.equal(searched.empty.action, 'query');
  assert.ok(searched.empty.text.includes('popoto'), searched.empty.text);
  assert.equal(view([]).empty, null);
  // the Sort row: ILVL, then the picked stats in the pills' order, whatever order they were picked in
  assert.deepEqual(
    view(['det', 'crit']).sorts.map(o => o.key),
    ['ilvl', 'crit', 'det'],
  );
  // sorted by a stat whose pill is off: ILVL, by expansion
  assert.deepEqual(
    view(['crit'], '', 'det').groups.map(g => g.key),
    ['Dawntrail'],
  );
});

/* Every state the Food menu can reach, for every job's real meals. The pills start empty and the walk applies every move
   the menu allows: a pill on or off (on only while mealPillOff allows it) and a search (none, one matching no meal, one
   word of a meal's name). In every state the pills leave a meal with no search, so an empty list always comes from the
   search, and Clear search brings meals back. */
test('Food menu: in every reachable state only a search empties the list, and Clear search brings meals back', () => {
  let states = 0;
  for (const { id: jobId } of JOBS) {
    const job = makeJobContext(jobId);
    const items = allMeals(job).map(m => ({ key: m.key, name: m.name, stats: m.stats.map(x => x.stat) }));
    if (!items.length) {
      continue;
    }
    const pills = job.substats.filter(s => items.some(x => x.stats.includes(s)));
    const words = [items[0], items[items.length >> 1], items.at(-1)].map(x => x.name.split(' ')[0].toLowerCase());
    const queries = ['', 'zzzz', ...words];
    const key = f => `${[...f.stats].sort().join()}|${f.query}`;
    const seen = new Set();
    const queue = [{ stats: [], query: '' }];
    while (queue.length) {
      const f = queue.pop();
      const k = key(f);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      states++;
      const where = `${jobId} at ${k}`;
      assert.ok(mealsPassing(items, { ...f, query: '' }).length > 0, `the pills leave no meal: ${where}`);
      const passing = mealsPassing(items, f).length;
      const reason = mealEmptyReason(items, f);
      assert.equal(Boolean(reason), passing === 0, `an empty list with no line, or a line over meals: ${where}`);
      if (reason) {
        assert.equal(reason.action, 'query', where);
      }
      // every move the menu allows
      for (const p of pills) {
        if (f.stats.includes(p)) {
          queue.push({ ...f, stats: f.stats.filter(s => s !== p) });
        } else if (!mealPillOff(items, p, f)) {
          queue.push({ ...f, stats: [...f.stats, p] });
        }
      }
      for (const q of queries) {
        queue.push({ ...f, query: q });
      }
    }
  }
  assert.ok(states > 500, `${states} states walked`);
});

test('what the Food menu template shows is in the view: hover text, item level text, row class, chip classes', () => {
  const job = makeJobContext('SGE');
  const meals = allMeals(job);
  const shown = meals.find(m => m.name === 'Popoto Potage');
  const menu = mealMenu(job, 100, { mind: 0, vit: 0, crit: 0, det: 0, dh: 0, sps: 0, piety: 0 }, shown);
  const items = menu.groups.flatMap(g => g.items);
  const potage = items.find(x => x.name === 'Popoto Potage');
  assert.equal(potage.ilvlText, `i${shown.ilvl}`);
  assert.equal(potage.onClass, 'on');
  assert.deepEqual(
    items.filter(x => x.onClass).map(x => x.name),
    ['Popoto Potage'],
  );
  const line = mealLine(potage.adds, ['crit']);
  assert.deepEqual(
    line.map(a => a.cls),
    line.map(a => (a.stat === 'crit' ? 'meal-stat hit' : 'meal-stat')),
  );
});

test('every meal of every job has two or three stat lines, the most the template has room for', () => {
  for (const id of Object.keys(JOBS)) {
    const job = makeJobContext(id);
    const totals = Object.fromEntries(job.stats.map(s => [s, 0]));
    const items = mealMenu(job, 100, totals, null).groups.flatMap(g => g.items);
    assert.ok(items.length > 0, id);
    for (const x of items) {
      assert.ok(x.adds.length >= 2 && x.adds.length <= 3, `${id} ${x.name}: ${x.adds.length} lines`);
    }
  }
});

/* A real Auto-fill result for Sage at level 100 with item level sync 123, goal Critical Hit and Food on: the meals tied for the
   best result (solveOf's found.food.tagged), as Apply saves their keys. */
function tiedMeals() {
  const app = makeApp('SGE', {});
  Object.assign(app.recipe, { target: 'crit', food: true });
  const food = solveOf(app).run.found.food;
  return { app, keys: food.tagged.map(tied => tied.key), shown: food.shown };
}

test('"best for goal": the saved tie list tags the meal of the set; the menu offers the switch and the list shows only tagged meals while it is on', () => {
  const { keys, shown } = tiedMeals();
  assert.ok(keys.length > 1);
  const set = sageSet({ meal: shown.key });
  const context = evaluateInSheet(sheetOf('SGE', [set]), set);
  const menu = setMealMenuView(context, set, mealBestKeys({ ...set, bestMeals: keys }));
  assert.equal(menu.hasBest, true);
  const items = menu.groups.flatMap(g => g.items);
  assert.deepEqual(
    items
      .filter(x => x.best)
      .map(x => x.key)
      .sort(),
    [...keys].sort(),
  );
  // switch on: only the tagged meals, no pill; off: every meal, the tagged ones wear the "best" class
  const on = mealList(menu, { stats: [], query: '', sortBy: 'ilvl', bestOnly: true }).groups.flatMap(g => g.items);
  assert.deepEqual(on.map(x => x.key).sort(), [...keys].sort());
  assert.ok(on.every(x => !x.rowClass.includes('best')));
  const off = mealList(menu, { stats: [], query: '', sortBy: 'ilvl', bestOnly: false }).groups.flatMap(g => g.items);
  assert.equal(off.length, items.length);
  assert.deepEqual(
    off
      .filter(x => x.rowClass.includes('best'))
      .map(x => x.key)
      .sort(),
    [...keys].sort(),
  );
  assert.equal(off.find(x => x.key === shown.key).rowClass, 'on best');
  // a pill no tagged meal has is off while the switch is on; a search with no tagged match says so and Clear brings them back
  const all = menu.groups.flatMap(g => g.items);
  const taggedStats = new Set(all.filter(x => x.best).flatMap(x => x.stats));
  const lacking = menu.pills.find(p => !taggedStats.has(p.stat));
  if (lacking) {
    assert.equal(mealPillOff(all, lacking.stat, { stats: [], query: '', bestOnly: true }), true);
  }
  const other = all.find(x => !x.best);
  assert.deepEqual(mealEmptyReason(all, { stats: [], query: other.name, bestOnly: true }), {
    text: `No meal matches "${other.name}".`,
    action: 'query',
  });
  // no tags: no switch, nothing marked
  const plain = setMealMenuView(context, set);
  assert.deepEqual([plain.hasBest, plain.groups.flatMap(g => g.items).some(x => x.best)], [false, false]);
});

test('"best for goal": a meal the set holds that is not tagged stays in the list while the switch is on', () => {
  const { keys } = tiedMeals();
  const probe = sageSet();
  const probeMenu = setMealMenuView(evaluateInSheet(sheetOf('SGE', [probe]), probe), probe, keys);
  const untagged = probeMenu.groups.flatMap(g => g.items).find(x => !x.best);
  const set = sageSet({ meal: untagged.key });
  const menu = setMealMenuView(evaluateInSheet(sheetOf('SGE', [set]), set), set, mealBestKeys({ ...set, bestMeals: keys }));
  assert.equal(menu.hasBest, true, 'the switch is offered although the set holds an untagged meal');
  const on = mealList(menu, { stats: [], query: '', sortBy: 'ilvl', bestOnly: true }).groups.flatMap(g => g.items);
  assert.deepEqual(on.map(x => x.key).sort(), [...keys, untagged.key].sort());
  assert.equal(on.find(x => x.key === untagged.key).rowClass, 'on');
  // the held meal leads alone in its own group, switch on or off
  const groups = mealList(menu, { stats: [], query: '', sortBy: 'ilvl', bestOnly: true }).groups;
  assert.deepEqual([groups[0].key, groups[0].label, groups[0].items.map(x => x.key)], ['pick', 'Your pick', [untagged.key]]);
  assert.equal(groups.slice(1).flatMap(g => g.items).length, keys.length);
  const off = mealList(menu, { stats: [], query: '', sortBy: 'ilvl', bestOnly: false }).groups;
  assert.deepEqual([off[0].key, off[0].items.map(x => x.key)], ['pick', [untagged.key]]);
  assert.equal(off.flatMap(g => g.items).length, probeMenu.groups.flatMap(g => g.items).length, 'every meal is listed once');
  // a search the held meal does not match leaves it out
  const other = mealList(menu, { stats: [], query: 'zzz-no-such-meal', sortBy: 'ilvl', bestOnly: false }).groups;
  assert.equal(
    other.some(g => g.key === 'pick'),
    false,
  );
});

test('"best for goal" on the Food row: the note; a meal not tagged, no meal or no tags shows nothing', () => {
  const tagged = mealBestNote('a', ['a', 'b', 'c']).note;
  assert.ok(tagged.length > 0, 'a tagged meal gets a note');
  assert.deepEqual(mealBestNote('a', ['a']), { note: tagged });
  assert.deepEqual(mealBestNote('z', ['a', 'b']), { note: '' }, 'a meal picked by hand');
  assert.deepEqual(mealBestNote('z', []), { note: '' }, 'none tagged');
  assert.deepEqual(mealBestNote(null, ['a']), { note: '' });
});

test('mealBestKeys: the saved list, whatever meal the set holds; a damaged value is none', () => {
  assert.deepEqual(mealBestKeys({ meal: 'b', bestMeals: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(mealBestKeys({ meal: 'z', bestMeals: ['a', 'b'] }), ['a', 'b'], 'a meal picked by hand: the list stays');
  assert.deepEqual(mealBestKeys({ meal: null, bestMeals: ['a'] }), ['a'], 'no food chosen');
  for (const bestMeals of [undefined, null, 'a', [1], { a: 1 }]) {
    assert.deepEqual(mealBestKeys({ meal: 'a', bestMeals }), []);
  }
});
