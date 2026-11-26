/* The page's addresses (src/ui/router/routes.ts): what a hash names and the hash of a screen. The ids are the forms the page
   makes (sheets/ops.js randomId: 's_' or 'g_', the time in base 36 and six letters) and the readable ones of the example
   sheets (ui/test-sheets.json). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATH_TABS, TABS } from '../../../../src/ui/state.ts';
import {
  APP_TITLE,
  DEFAULT_ROUTE,
  MATH_TAB_LABEL,
  formatPath,
  formatRoute,
  parseRoute,
  samePath,
  titleOf,
} from '../../../../src/ui/router/routes.ts';

const SHEET_ID = 's_mh3k2x9a1b2c3d';
const SET_ID = 'g_mh3k4p0q9r8s7t';

test('a bare address, # and #/ are the Sheets list', () => {
  for (const hash of ['', '#', '#/', '/', undefined, null]) {
    assert.deepEqual(parseRoute(hash), DEFAULT_ROUTE, String(hash));
  }
});

test('each screen parses to its route', () => {
  assert.deepEqual(parseRoute('#/sheets'), { tab: 'sheets', screen: 'sheets' });
  assert.deepEqual(parseRoute(`#/sheets/${SHEET_ID}`), { tab: 'sheets', screen: 'sheet', sheetId: SHEET_ID });
  assert.deepEqual(parseRoute(`#/sheets/${SHEET_ID}/sets/${SET_ID}`), { tab: 'sheets', screen: 'set', sheetId: SHEET_ID, setId: SET_ID });
  assert.deepEqual(parseRoute('#/gear'), { tab: 'browse' });
  for (const view of MATH_TABS) {
    assert.deepEqual(parseRoute(`#/math/${view}`), { tab: 'math', mathTab: view });
  }
});

test('#/math alone opens the first math view', () => {
  assert.deepEqual(parseRoute('#/math'), { tab: 'math', mathTab: MATH_TABS[0] });
});

test("the example sheets' readable ids work", () => {
  assert.deepEqual(parseRoute('#/sheets/s_bahamut/sets/g_1'), { tab: 'sheets', screen: 'set', sheetId: 's_bahamut', setId: 'g_1' });
});

test('format and parse round trip for every screen', () => {
  const routes = [
    { tab: 'sheets', screen: 'sheets' },
    { tab: 'sheets', screen: 'sheet', sheetId: SHEET_ID },
    { tab: 'sheets', screen: 'set', sheetId: SHEET_ID, setId: SET_ID },
    { tab: 'browse' },
    ...MATH_TABS.map(mathTab => ({ tab: 'math', mathTab })),
  ];
  for (const route of routes) {
    assert.deepEqual(parseRoute(formatRoute(route)), route, formatRoute(route));
  }
});

test('every tab has an address', () => {
  for (const tab of TABS) {
    assert.notEqual(parseRoute(formatRoute({ tab, mathTab: MATH_TABS[0] })), null, tab);
  }
});

test('the address words', () => {
  assert.equal(formatRoute({ tab: 'browse' }), '#/gear');
  assert.equal(formatRoute({ tab: 'math', mathTab: 'gcd' }), '#/math/gcd');
  assert.equal(formatRoute({ tab: 'sheets', screen: 'sheets' }), '#/sheets');
  assert.equal(formatRoute({ tab: 'sheets', screen: 'set', sheetId: SHEET_ID, setId: SET_ID }), `#/sheets/${SHEET_ID}/sets/${SET_ID}`);
});

test('a trailing slash, empty segments and a missing # are ignored', () => {
  assert.deepEqual(parseRoute('#/gear/'), { tab: 'browse' });
  assert.deepEqual(parseRoute('/gear'), { tab: 'browse' });
  assert.deepEqual(parseRoute('#//sheets//'), { tab: 'sheets', screen: 'sheets' });
  assert.deepEqual(parseRoute(`#/sheets/${SHEET_ID}/`), { tab: 'sheets', screen: 'sheet', sheetId: SHEET_ID });
});

test('a query after the route is the params of the Gear browser and the math views, in the order written, each name once', () => {
  assert.deepEqual(parseRoute('#/gear?sort=det&min=700&sort=dh'), { tab: 'browse', params: { sort: 'det', min: '700' } });
  assert.deepEqual(parseRoute('#/math/gcd?haste=SAM&speed=300'), { tab: 'math', mathTab: 'gcd', params: { haste: 'SAM', speed: '300' } });
  assert.deepEqual(parseRoute('#/math?slot=ear'), { tab: 'math', mathTab: 'piece', params: { slot: 'ear' } });
});

test('a query is decoded: percent codes and + are text, an empty value is kept, an empty query names nothing', () => {
  assert.deepEqual(parseRoute('#/gear?q=Moon%20Staff&noexp=ARR,HW&skip=').params, { q: 'Moon Staff', noexp: 'ARR,HW', skip: '' });
  assert.equal(parseRoute('#/gear?q=a+b').params.q, 'a b');
  assert.equal(parseRoute('#/gear?q=100%25%ZZ').params.q, '100%%ZZ');
  assert.deepEqual(parseRoute('#/gear?'), { tab: 'browse' });
  assert.deepEqual(parseRoute('#/gear?=x&&'), { tab: 'browse' });
});

test('the Sheets screens ignore a query', () => {
  assert.deepEqual(parseRoute(`#/sheets/${SHEET_ID}?x=1`), { tab: 'sheets', screen: 'sheet', sheetId: SHEET_ID });
  assert.deepEqual(parseRoute('#/sheets?x=1'), DEFAULT_ROUTE);
});

test('a name that is also an Object property is a plain name', () => {
  const route = parseRoute('#/gear?__proto__=x&constructor=y&toString=z');
  assert.deepEqual(Object.keys(route.params), ['__proto__', 'constructor', 'toString']);
  assert.equal(Object.getPrototypeOf(route.params), Object.prototype);
});

test('formatRoute writes the params after the path, in order; commas of a list stay, other characters are encoded', () => {
  assert.equal(
    formatRoute({ tab: 'browse', params: { q: 'Moon Staff & co', noexp: 'ARR,HW', skip: '' } }),
    '#/gear?q=Moon%20Staff%20%26%20co&noexp=ARR,HW&skip=',
  );
  assert.equal(formatRoute({ tab: 'math', mathTab: 'tiers', params: { tierlevel: '90' } }), '#/math/tiers?tierlevel=90');
  assert.equal(formatRoute({ tab: 'browse', params: {} }), '#/gear');
  assert.equal(formatRoute({ tab: 'sheets', screen: 'sheet', sheetId: SHEET_ID, params: { x: '1' } }), `#/sheets/${SHEET_ID}`);
});

test('a query survives parse and format, whatever the text holds', () => {
  for (const q of ['', 'Moon Staff', 'a&b=c', '100%', 'é ü', '#/x?y', 'a,b', '+']) {
    const route = { tab: 'browse', params: { q, sort: 'det' } };
    const back = parseRoute(formatRoute(route));
    assert.equal(back.params.q ?? '', q, JSON.stringify(q));
    assert.equal(back.params.sort, 'det');
  }
});

test('samePath ignores the query', () => {
  const a = { tab: 'browse', params: { sort: 'det' } };
  const b = { tab: 'browse', params: { sort: 'dh' } };
  assert.equal(samePath(a, b), true);
  assert.equal(formatPath(a), '#/gear');
  assert.equal(samePath(a, { tab: 'math', mathTab: 'piece' }), false);
});

test('an address that names nothing the page has is null', () => {
  const unknown = [
    '#/nope',
    '#/gear/extra',
    '#/math/stats',
    '#/math/piece/extra',
    '#/sheets/s_1/sets',
    '#/sheets/s_1/sets/g_1/extra',
    '#/sheets/s_1/notsets/g_1',
    '#/sheets/s_1/g_1',
    '#/Sheets',
    '#/%E0%A4%A',
    '#/sheets/%E0%A4%A',
    `#/sheets/${SHEET_ID}/sets/%`,
  ];
  for (const hash of unknown) {
    assert.equal(parseRoute(hash), null, hash);
  }
});

test('ids are percent-encoded and decoded', () => {
  const route = { tab: 'sheets', screen: 'set', sheetId: 's 1/x', setId: 'g?#é' };
  const hash = formatRoute(route);
  assert.ok(!/[ ?]/.test(hash.slice(2)) && hash.split('/').length === 5, hash);
  assert.deepEqual(parseRoute(hash), route);
});

test('a route that is not a screen formats as the Sheets list', () => {
  for (const route of [null, undefined, {}, { tab: 'nope' }, { tab: 'sheets', screen: 'sheet' }]) {
    assert.equal(formatRoute(route), '#/sheets');
  }
});

test('a math route with no known view formats as the first view', () => {
  assert.equal(formatRoute({ tab: 'math' }), `#/math/${MATH_TABS[0]}`);
  assert.equal(formatRoute({ tab: 'math', mathTab: 'zzz' }), `#/math/${MATH_TABS[0]}`);
});

test('the page title names the screen, then the page', () => {
  assert.equal(titleOf(DEFAULT_ROUTE), `Sheets · ${APP_TITLE}`);
  assert.equal(titleOf({ tab: 'browse' }), `Gear browser · ${APP_TITLE}`);
  for (const view of MATH_TABS) {
    assert.equal(titleOf({ tab: 'math', mathTab: view }), `${MATH_TAB_LABEL[view]} · ${APP_TITLE}`);
  }
  assert.equal(titleOf({ tab: 'sheets', screen: 'sheet', sheetId: 'a' }, { sheet: 'Sage 123' }), `Sage 123 · ${APP_TITLE}`);
  assert.equal(
    titleOf({ tab: 'sheets', screen: 'set', sheetId: 'a', setId: 'b' }, { sheet: 'Sage 123', set: 'Set 1' }),
    `Set 1 · Sage 123 · ${APP_TITLE}`,
  );
  assert.equal(titleOf({ tab: 'sheets', screen: 'sheet', sheetId: 'a' }, { missing: true }), `Not found · ${APP_TITLE}`);
  // a sheet or set with no saved name falls back to the list's title
  assert.equal(titleOf({ tab: 'sheets', screen: 'set', sheetId: 'a', setId: 'b' }, { sheet: 'X' }), `Sheets · ${APP_TITLE}`);
});

test('half of a character never stops an address from being built: a lone surrogate becomes the replacement character', () => {
  const lone = 'x'.repeat(99) + '\uD83D';
  const hash = formatRoute({ tab: 'browse', params: { q: lone } });
  assert.equal(hash, `#/gear?q=${'x'.repeat(99)}%EF%BF%BD`);
  assert.equal(parseRoute(hash).params.q, 'x'.repeat(99) + '\uFFFD');
  assert.equal(formatRoute({ tab: 'sheets', screen: 'sheet', sheetId: 's_\uDE00a' }), '#/sheets/s_%EF%BF%BDa');
  // a whole emoji is kept
  assert.equal(parseRoute(formatRoute({ tab: 'browse', params: { q: '\u{1F600}' } })).params.q, '\u{1F600}');
});

test('a query of 20,000 names parses, each name once', () => {
  const names = Array.from({ length: 20000 }, (_, i) => `n${i}=${i}`).join('&');
  const route = parseRoute(`#/gear?${names}`);
  assert.equal(Object.keys(route.params).length, 20000);
});
