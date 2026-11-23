/* The page's addresses: which screen a hash names, and the hash of a screen. Pure: no DOM, no Alpine and no store, so Node
   can test it. The router (router.js) reads and writes the browser's address with these two functions.

   A route says where the page is, and on two screens how it is set up:
     { tab: 'sheets', screen: 'sheets' }                      #/sheets
     { tab: 'sheets', screen: 'sheet', sheetId }              #/sheets/<sheetId>
     { tab: 'sheets', screen: 'set', sheetId, setId }         #/sheets/<sheetId>/sets/<setId>
     { tab: 'browse', params? }                               #/gear?<query>
     { tab: 'math', mathTab, params? }                        #/math/<piece|gcd|tiers>?<query>
   `tab` and `mathTab` are the app store's values (state.js TABS and MATH_TABS), `screen`, `sheetId` and `setId` the sheets
   store's. A route holds only the fields its screen uses. `params` is the settings the address names after the route, a
   query ({name: text}, a name once, in the order written); a route without `params` names no settings (the page keeps its
   own). This file reads and writes the query as text; what its names mean is query.js's. Whether a sheet or a set with that id is saved is not decided
   here: the page shows a "not found" screen for an id it does not have. */
import { MATH_TABS } from '../state.js';

/* The route of the page's home: the Sheets list. A bare address and an address that names nothing go here. */
export const DEFAULT_ROUTE = Object.freeze({ tab: 'sheets', screen: 'sheets' });

/* The address words of the three tabs and of a gear set's page; tab words differ from the store's value only for the
   Gear browser, whose address word is `gear` (the store calls it `browse`). */
const SHEETS_WORD = 'sheets';
const SETS_WORD = 'sets';
const GEAR_WORD = 'gear';
const MATH_WORD = 'math';

/* The math view `#/math` alone opens: the first sub-tab. */
const DEFAULT_MATH_TAB = MATH_TABS[0];

/* A half of a surrogate pair with no other half: no character, and encodeURIComponent throws on it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/* `text` percent-encoded; a lone half of a surrogate pair becomes the replacement character, so no text (a saved search, an
   id) can make an address fail to build. */
function encodeText(text) {
  return encodeURIComponent(String(text).replace(LONE_SURROGATE, '\uFFFD'));
}

/* The segment `text` percent-decoded, or null when it is not valid percent-encoding or decodes to nothing. */
function decodeSegment(text) {
  try {
    const decoded = decodeURIComponent(text);
    return decoded === '' ? null : decoded;
  } catch {
    return null;
  }
}

/* The query text after the first '?' of `text` as {name: value}: each name once (the first), the pairs in the order written,
   names and values percent-decoded ('+' is a space). An empty query, and a pair with no name, give no entries. */
function parseQuery(text) {
  const at = text.indexOf('?');
  if (at < 0) return {};
  const entries = [];
  const seen = new Set();
  for (const [name, value] of new URLSearchParams(text.slice(at + 1))) {
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}

/* `route` with `params` set when the address wrote any (a query with no pair names no settings). */
function withParams(route, params) {
  return Object.keys(params).length > 0 ? { ...route, params } : route;
}

/* The route `hash` names (the page's `location.hash`: '#/sheets/s_1', with or without the leading '#'), or null when it
   names nothing the page has. An empty hash, '#' and '#/' are the home address. A trailing slash and empty segments are
   ignored. A query after the route ('?sort=det') becomes the route's `params` on the Gear browser and the math views; the
   Sheets screens ignore it. Ids are percent-decoded. Returns a new object. */
export function parseRoute(hash) {
  const withoutHash = String(hash ?? '').replace(/^#/, '');
  const path = withoutHash.split('?')[0];
  const words = path.split('/').filter(word => word !== '');
  if (words.length === 0) return { ...DEFAULT_ROUTE };

  const [head, ...rest] = words;
  const params = parseQuery(withoutHash);
  if (head === SHEETS_WORD) return parseSheetsRoute(rest);
  if (head === GEAR_WORD) return rest.length === 0 ? withParams({ tab: 'browse' }, params) : null;
  if (head === MATH_WORD) {
    if (rest.length === 0) return withParams({ tab: 'math', mathTab: DEFAULT_MATH_TAB }, params);
    return rest.length === 1 && MATH_TABS.includes(rest[0]) ? withParams({ tab: 'math', mathTab: rest[0] }, params) : null;
  }
  return null;
}

/* The route of the words after `sheets` in an address: none (the list), a sheet id, or a sheet id, `sets` and a set id. */
function parseSheetsRoute(words) {
  if (words.length === 0) return { ...DEFAULT_ROUTE };
  const sheetId = decodeSegment(words[0]);
  if (sheetId === null) return null;
  if (words.length === 1) return { tab: 'sheets', screen: 'sheet', sheetId };
  if (words.length === 3 && words[1] === SETS_WORD) {
    const setId = decodeSegment(words[2]);
    return setId === null ? null : { tab: 'sheets', screen: 'set', sheetId, setId };
  }
  return null;
}

/* The hash of `route` without its query: '#/gear', '#/math/gcd', '#/sheets/s_1'. A route that is not one of the page's
   screens comes out as the home address. Ids are percent-encoded. */
export function formatPath(route) {
  if (route?.tab === 'browse') return `#/${GEAR_WORD}`;
  if (route?.tab === 'math') {
    const view = MATH_TABS.includes(route.mathTab) ? route.mathTab : DEFAULT_MATH_TAB;
    return `#/${MATH_WORD}/${view}`;
  }
  if (route?.tab === 'sheets' && route.sheetId) {
    const sheet = `#/${SHEETS_WORD}/${encodeText(route.sheetId)}`;
    if (route.screen === 'set' && route.setId) return `${sheet}/${SETS_WORD}/${encodeText(route.setId)}`;
    return sheet;
  }
  return `#/${SHEETS_WORD}`;
}

/* The query text of `params` ({name: text}): '' for none, else '?name=text&...' in the order of the object. A value is
   percent-encoded except its commas, which separate the items of a list ('noexp=ARR,HW'). */
function formatQuery(params) {
  const pairs = Object.entries(params ?? {}).map(([name, value]) => `${name}=${encodeText(value).replaceAll('%2C', ',')}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/* The hash of `route` (a route object, as parseRoute returns): its path and, on the Gear browser and the math views, the
   query of its `params`. */
export function formatRoute(route) {
  const hasQuery = route?.tab === 'browse' || route?.tab === 'math';
  return formatPath(route) + (hasQuery ? formatQuery(route.params) : '');
}

/* Whether routes `a` and `b` name the same screen with the same settings (path and query equal). */
export function sameRoute(a, b) {
  return formatRoute(a) === formatRoute(b);
}

/* Whether routes `a` and `b` name the same screen, whatever settings their query names. */
export function samePath(a, b) {
  return formatPath(a) === formatPath(b);
}

/* The page's name, the end of every title and the whole title before the router has run. */
export const APP_TITLE = 'Gear Sync Analysis';

/* The names of the math views on the page (the sub-tab buttons of partials/math-page.html), for the page title. */
export const MATH_TAB_LABEL = Object.freeze({ piece: 'Stat Allocation', gcd: 'GCD Scaling', tiers: 'Substat tiers' });

/* The page title for the screen `route` (a route object) names: the screen's name first, then APP_TITLE, joined by " · ".
   `names`: {sheet, set}, the saved sheet's and gear set's names (a sheet or set that is not saved has none), and `missing`:
   whether the "not found" screen is showing. The names are the player's own text: the caller sets the title as text. */
export function titleOf(route, { sheet = null, set = null, missing = false } = {}) {
  let parts = ['Sheets'];
  if (missing) parts = ['Not found'];
  else if (route?.tab === 'browse') parts = ['Gear browser'];
  else if (route?.tab === 'math') parts = [MATH_TAB_LABEL[route.mathTab] ?? 'How the math works'];
  else if (route?.screen === 'sheet' && sheet) parts = [sheet];
  else if (route?.screen === 'set' && sheet && set) parts = [set, sheet];
  return [...parts, APP_TITLE].join(' · ');
}
