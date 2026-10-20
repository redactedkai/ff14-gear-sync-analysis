/* Builds a review page: one card per UI change, each with its options' screenshots, buttons to pick an option or
   Drop, a notes box, and "Copy my picks". The schema of the cards JSON is in SKILL.md next to this file.

Run: node .claude/skills/review-page/make-page.mjs <cards.json> [--out <page.html>]
Writes index.html next to the JSON unless --out is given. Shot paths in the JSON are read relative to the JSON file
(or absolute) and written into the page relative to the page, so keep the shots where they are. Plain Node, no
dependencies. Exits 1 on a schema error; a missing shot file is only a warning (the card shows a broken image).
*/

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// Step 1: read the arguments and the JSON.
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outArg = outFlag >= 0 ? args.splice(outFlag, 2)[1] : null;
const jsonPath = args[0];
if (!jsonPath) {
  console.error('usage: node make-page.mjs <cards.json> [--out <page.html>]');
  process.exit(1);
}
const jsonDir = dirname(resolve(jsonPath));
const pagePath = resolve(outArg || resolve(jsonDir, 'index.html'));
const pageDir = dirname(pagePath);
const review = JSON.parse(readFileSync(jsonPath, 'utf8'));

// Step 2: check the schema, so a typo stops here instead of making a page with a hole in it.
const problems = [];
const missingShots = [];
const need = (cond, message) => cond || problems.push(message);
need(typeof review.title === 'string' && review.title, 'title: a non-empty string');
need(Array.isArray(review.cards) && review.cards.length, 'cards: a non-empty array');
need(review.dropped === undefined || Array.isArray(review.dropped), 'dropped: an array of strings');
const seenIds = new Set();

// Shot paths: JSON-relative in, page-relative (forward slashes) out.
function pageRelative(shotPath) {
  const onDisk = isAbsolute(shotPath) ? shotPath : resolve(jsonDir, shotPath);
  if (!existsSync(onDisk)) missingShots.push(shotPath);
  return relative(pageDir, onDisk).split('\\').join('/');
}

// A shots object maps a view name ("1440 light") to a path; keep its order.
function checkShots(shots, where) {
  if (shots === undefined) return {};
  need(shots && typeof shots === 'object' && !Array.isArray(shots), `${where}.shots: an object of view name to path`);
  const out = {};
  for (const [view, shotPath] of Object.entries(shots || {})) {
    need(typeof shotPath === 'string', `${where}.shots["${view}"]: a path`);
    if (typeof shotPath === 'string') out[view] = pageRelative(shotPath);
  }
  return out;
}

const cards = (review.cards || []).map((card, index) => {
  const where = `cards[${index}]${card?.id ? ` (${card.id})` : ''}`;
  need(typeof card.id === 'string' && card.id, `${where}.id: a non-empty string`);
  need(!seenIds.has(card.id), `${where}.id: used twice`);
  seenIds.add(card.id);
  need(typeof card.title === 'string', `${where}.title: a string`);
  need(Array.isArray(card.options) && card.options.length, `${where}.options: a non-empty array`);
  const keys = new Set();
  const options = (card.options || []).map((option, optionIndex) => {
    const optionWhere = `${where}.options[${optionIndex}]`;
    need(/^[a-z]$/.test(option.key || ''), `${optionWhere}.key: one lower-case letter`);
    need(!keys.has(option.key) && option.key !== 'drop', `${optionWhere}.key: used twice`);
    keys.add(option.key);
    return {
      key: option.key,
      label: option.label || `Option ${option.key}`,
      text: option.text || '',
      shots: checkShots(option.shots, optionWhere),
    };
  });
  return {
    id: card.id,
    group: card.group || '',
    title: card.title || '',
    problem: card.problem || '',
    before: card.before ? { text: card.before.text || '', shots: checkShots(card.before.shots, `${where}.before`) } : null,
    options,
    drop: card.drop !== false,
    dependsOn: card.dependsOn || '',
    notes: card.notes || '',
  };
});
if (problems.length) {
  console.error(`${jsonPath}: schema errors\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// Step 3: write the page. The data goes in a JSON script tag ("</" escaped so no text can close it).
const data = {
  title: review.title,
  intro: review.intro || '',
  dropped: review.dropped || [],
  storageKey: review.storageKey || `review-${review.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-picks`,
  cards,
};
const escapeHtml = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
// function replacers, so a "$" in the text is not read as a replacement pattern
const dataJson = JSON.stringify(data).replace(/<\//g, '<\\/');
const page = template()
  .replace('%%TITLE%%', () => escapeHtml(review.title))
  .replace('%%DATA%%', () => dataJson);
writeFileSync(pagePath, page);
console.log(`${pagePath}: ${cards.length} cards`);
if (missingShots.length) console.warn(`missing shots:\n  ${missingShots.join('\n  ')}`);

/* The page. Colors only through the tokens on :root, with dark mode for the OS setting and for data-theme. The
   shots of every card follow one view switch at the top (1440 light, 960 dark, ...), so a card with three options
   shows three shots side by side instead of twelve. Picks and notes are saved in localStorage (try/catch; the page
   works without it). */
function template() {
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%%TITLE%%</title>
<style>
:root {
  --bg: #f4f1ea; --surface: #fffdf7; --fg: #1d2421; --muted: #66706b; --line: #d9d4c7;
  --accent: #0f6e6e; --accent-soft: #d6ebe8; --bad: #9c3b2e; --bad-soft: #f3dcd6; --gold: #8a6a12;
  --shade: rgba(0, 0, 0, 0.75);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161a19; --surface: #1f2423; --fg: #e6e4dc; --muted: #9aa39e; --line: #353c3a;
    --accent: #5cbcb3; --accent-soft: #1d3634; --bad: #e08a7b; --bad-soft: #3a2420; --gold: #d8b45a;
  }
}
:root[data-theme="dark"] {
  --bg: #161a19; --surface: #1f2423; --fg: #e6e4dc; --muted: #9aa39e; --line: #353c3a;
  --accent: #5cbcb3; --accent-soft: #1d3634; --bad: #e08a7b; --bad-soft: #3a2420; --gold: #d8b45a;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { margin: 0 0 4px; font-size: 1.6rem; }
.sub { margin: 0 0 16px; color: var(--muted); }
.top { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center;
  padding: 10px 0; background: var(--bg); border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.top .count { font-weight: 600; margin-right: auto; }
.views { display: flex; flex-wrap: wrap; gap: 4px; }
.views button, .choice button { padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--surface); color: var(--fg); font: inherit; cursor: pointer; }
.views button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
.dropped { margin: 0 0 16px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.dropped h2 { margin: 0 0 4px; font-size: 0.95rem; }
.dropped ul { margin: 0; padding-left: 18px; color: var(--muted); }
.group { margin: 28px 0 8px; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.card { margin: 0 0 18px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.card.picked { border-color: var(--accent); }
.card.dropped-card { border-color: var(--bad); }
.card h3 { margin: 0 0 6px; font-size: 1.1rem; }
.card h3 .id { margin-right: 8px; color: var(--accent); font-family: ui-monospace, Consolas, monospace; }
.card p { margin: 4px 0; }
.lab { font-weight: 600; }
.note { color: var(--muted); font-size: 0.9rem; }
.dep { color: var(--gold); font-size: 0.9rem; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin: 12px 0; }
.column { min-width: 0; padding: 8px; border: 1px solid transparent; border-radius: 8px; }
.column.chosen { border-color: var(--accent); background: var(--accent-soft); }
.column h4 { margin: 0 0 4px; font-size: 0.95rem; }
.column h4 .key { color: var(--accent); font-family: ui-monospace, Consolas, monospace; }
.column p { font-size: 0.92rem; }
.column figure { margin: 6px 0 0; }
.column figcaption { font-size: 0.8rem; color: var(--muted); }
.column img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px;
  cursor: zoom-in; background: var(--bg); }
.choice { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.choice button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
.choice button[data-v="drop"][aria-pressed="true"] { background: var(--bad-soft); border-color: var(--bad); }
.choice textarea { flex: 1 1 260px; min-height: 34px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--fg); font: inherit; resize: vertical; }
.primary { padding: 7px 16px; border: 0; border-radius: 6px; background: var(--accent); color: var(--surface);
  font: inherit; font-weight: 600; cursor: pointer; }
.copied { color: var(--accent); font-size: 0.9rem; }
.lightbox { position: fixed; inset: 0; z-index: 10; display: none; align-items: center; justify-content: center;
  padding: 16px; background: var(--shade); cursor: zoom-out; }
.lightbox.open { display: flex; }
.lightbox img { max-width: 100%; max-height: 100%; background: var(--surface); }
</style>
</head>
<body>
<div class="wrap">
  <h1 id="title"></h1>
  <p class="sub" id="intro"></p>
  <div class="dropped" id="dropped" hidden><h2>Dropped by the owner</h2><ul></ul></div>
  <div class="top">
    <span class="count" id="count"></span>
    <span class="views" id="views" aria-label="Shots shown"></span>
    <button type="button" class="primary" id="copy">Copy my picks</button>
    <span class="copied" id="copied" hidden>Copied</span>
  </div>
  <div id="cards"></div>
</div>
<div class="lightbox" id="lightbox"><img alt=""></div>
<script type="application/json" id="review-data">%%DATA%%</script>
<script>
const REVIEW = JSON.parse(document.getElementById('review-data').textContent);
const CARDS = REVIEW.cards;
const VIEW_KEY = REVIEW.storageKey + '-view';
const escapeHtml = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// picks: { cardId: { choice: option key or 'drop' or '', note } }, saved per page
let picks = {};
try { picks = JSON.parse(localStorage.getItem(REVIEW.storageKey)) || {}; } catch { picks = {}; }
const save = () => { try { localStorage.setItem(REVIEW.storageKey, JSON.stringify(picks)); } catch { /* storage unavailable */ } };

// every view name used by any shot, in first-seen order; the switch shows one at a time
const VIEWS = [];
for (const card of CARDS)
  for (const column of [card.before, ...card.options])
    for (const view of Object.keys(column?.shots || {})) if (!VIEWS.includes(view)) VIEWS.push(view);
let currentView = VIEWS[0] || '';
try { if (VIEWS.includes(localStorage.getItem(VIEW_KEY))) currentView = localStorage.getItem(VIEW_KEY); } catch { /* keep the first */ }

// The label of a pick in the copied text and on its button: "Keep (a)", "Drop", "undecided".
function pickLabel(card, choice) {
  if (choice === 'drop') return 'Drop';
  const option = card.options.find(o => o.key === choice);
  return option ? option.label + ' (' + option.key + ')' : 'undecided';
}

// One column: a heading, its text, and its shot for the current view (or a line saying it has none).
function columnHtml(card, column, heading, chosen) {
  const views = Object.keys(column.shots);
  const shotHtml = !views.length ? ''
    : column.shots[currentView]
      ? '<figure><img src="' + escapeHtml(column.shots[currentView]) + '" alt="' + escapeHtml(card.id + ' ' + heading.replace(/<[^>]+>/g, '') + ', ' + currentView) + '" loading="lazy"></figure>'
      : '<p class="note">No ' + escapeHtml(currentView) + ' shot.</p>';
  return '<div class="column' + (chosen ? ' chosen' : '') + '"><h4>' + heading + '</h4>'
    + (column.text ? '<p>' + escapeHtml(column.text) + '</p>' : '') + shotHtml + '</div>';
}

function cardHtml(card) {
  const pick = picks[card.id] || {};
  const columns = (card.before ? [columnHtml(card, card.before, 'Before', false)] : [])
    .concat(card.options.map(option => columnHtml(card, option,
      '<span class="key">' + option.key + '</span> ' + escapeHtml(option.label), pick.choice === option.key)));
  const buttons = card.options.map(option => [option.key, option.label + ' (' + option.key + ')'])
    .concat(card.drop ? [['drop', 'Drop']] : [])
    .map(([value, label]) => '<button type="button" data-v="' + value + '" aria-pressed="' + (pick.choice === value) + '">' + escapeHtml(label) + '</button>');
  const state = pick.choice === 'drop' ? ' dropped-card' : pick.choice ? ' picked' : '';
  return '<section class="card' + state + '" data-id="' + escapeHtml(card.id) + '">'
    + '<h3><span class="id">' + escapeHtml(card.id) + '</span>' + escapeHtml(card.title) + '</h3>'
    + (card.problem ? '<p><span class="lab">Problem.</span> ' + escapeHtml(card.problem) + '</p>' : '')
    + (card.dependsOn ? '<p class="dep">Depends on: ' + escapeHtml(card.dependsOn) + '</p>' : '')
    + (card.notes ? '<p class="note">' + escapeHtml(card.notes) + '</p>' : '')
    + '<div class="columns">' + columns.join('') + '</div>'
    + '<div class="choice">' + buttons.join('')
    + '<textarea placeholder="Notes" aria-label="Notes for ' + escapeHtml(card.id) + '">' + escapeHtml(pick.note || '') + '</textarea></div>'
    + '</section>';
}

// Draws the cards (keeping the notes boxes' focus is not needed: only a pick or a view change redraws).
function render() {
  let html = '', group = '';
  for (const card of CARDS) {
    if (card.group && card.group !== group) { group = card.group; html += '<h2 class="group">' + escapeHtml(group) + '</h2>'; }
    html += cardHtml(card);
  }
  document.getElementById('cards').innerHTML = html;
  document.getElementById('views').innerHTML = VIEWS.length > 1
    ? VIEWS.map(view => '<button type="button" data-view="' + escapeHtml(view) + '" aria-pressed="' + (view === currentView) + '">' + escapeHtml(view) + '</button>').join('')
    : '';
  const picked = CARDS.filter(card => picks[card.id]?.choice).length;
  document.getElementById('count').textContent = picked + ' picked · ' + (CARDS.length - picked) + ' undecided';
}

// Header: title, intro, the owner's earlier drops.
document.getElementById('title').textContent = REVIEW.title;
document.title = REVIEW.title;
document.getElementById('intro').textContent = REVIEW.intro;
if (REVIEW.dropped.length) {
  const box = document.getElementById('dropped');
  box.querySelector('ul').innerHTML = REVIEW.dropped.map(line => '<li>' + escapeHtml(line) + '</li>').join('');
  box.hidden = false;
}

// Clicks: a shot opens large; a pick button sets or clears the card's pick; a view button switches every card's shots.
document.addEventListener('click', event => {
  const image = event.target.closest('.column img');
  if (image) {
    const box = document.getElementById('lightbox');
    box.querySelector('img').src = image.src;
    box.classList.add('open');
    return;
  }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    currentView = viewButton.dataset.view;
    try { localStorage.setItem(VIEW_KEY, currentView); } catch { /* storage unavailable */ }
    render();
    return;
  }
  const button = event.target.closest('.choice button');
  if (!button) return;
  const id = button.closest('.card').dataset.id;
  const pick = picks[id] || (picks[id] = {});
  pick.choice = pick.choice === button.dataset.v ? '' : button.dataset.v;
  save();
  render();
});
document.getElementById('cards').addEventListener('input', event => {
  if (!event.target.matches('textarea')) return;
  const id = event.target.closest('.card').dataset.id;
  (picks[id] || (picks[id] = {})).note = event.target.value;
  save();
});
document.getElementById('lightbox').addEventListener('click', event => event.currentTarget.classList.remove('open'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') document.getElementById('lightbox').classList.remove('open'); });

// The text the owner pastes back: one line per card, "id: Label (key) — note".
function picksText() {
  return CARDS.map(card => {
    const pick = picks[card.id] || {};
    const note = (pick.note || '').trim().replace(/\s+/g, ' ');
    return card.id + ': ' + pickLabel(card, pick.choice) + (note ? ' — ' + note : '');
  }).join('\n');
}
document.getElementById('copy').addEventListener('click', async () => {
  const text = picksText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const done = document.getElementById('copied');
  done.hidden = false;
  setTimeout(() => { done.hidden = true; }, 1500);
});

render();
</script>
</body>
</html>
`;
}
