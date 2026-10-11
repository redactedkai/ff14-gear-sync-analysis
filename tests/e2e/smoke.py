"""Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 400 px. Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) and the FFXIV Wiki's item level 475 caps;
  - real gear pools (a healer and a tank, a small item level window each): the page's best Spell/Skill Speed,
    synced to 123 and unsynced, equals what src/core computes for the same rows, and a brute force over
    every loadout (tests/unit/helpers/exhaustive.js), run in Node;
  - a 130 head piece (Spell Speed / Piety / Direct Hit) reproducing a real item level 130 healer head piece
    (Mind 33, Vitality 32, substats 31/22/6; tests/unit/views.test.js finds it in the item database).

Setup once: pip install playwright && python -m playwright install chromium
Run: npm run build && python tests/e2e/smoke.py
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'dist' / 'index.html'  # run `npm run build` first
OUT = ROOT / 'tests' / 'e2e' / 'out'  # screenshots (gitignored)

JOBS = ['SGE', 'WAR', 'PLD', 'BLM', 'NIN', 'DRG']
BAD_WORDS = ['undefined', 'NaN', 'null']
TIMEOUT = 10_000  # ms for any single wait
STORE_KEY = 'ilvl-stat-lab-v3'  # localStorage key of the saved state (src/ui/state.js)

# Sync caps at item level 123: slot -> (substat cap, main stat cap). Same for every job (slot shares are job-neutral).
CAPS_123 = {
    'Head': (29, 30),
    'Hands': (29, 30),
    'Feet': (29, 30),
    'Body': (47, 48),
    'Legs': (47, 48),
    'Earring': (23, 24),
    'Necklace': (23, 24),
    'Bracelet': (23, 24),
    'Ring': (23, 24),
}
CAPS_123_2H_WEAPON = (48, 50)

failures = []
errors = []  # JS page and console errors, recorded by listeners set up in main()


def check(cond, msg):
    if not cond:
        failures.append(msg)
    return cond


# ---------- navigation helpers (each waits for a concrete condition, never a fixed sleep) ----------


def wait_ready(pg):
    """Alpine has rendered: the job select has options and the job info line is filled."""
    expect(pg.locator('#job option').first).to_be_attached()
    expect(pg.locator('#jobinfo')).not_to_have_text('')


def job_name(pg, job):
    return pg.locator(f'#job option[value="{job}"]').inner_text().strip()


def set_job(pg, job):
    """Switch job; when the pool is not empty the page asks first, and this confirms."""
    pg.select_option('#job', job)
    if pg.locator('#job-warning').count():
        pg.click('#job-confirm')
    expect(pg.locator('#jobinfo')).to_contain_text(job_name(pg, job) + ':')


def show_tab(pg, tab):
    pg.click(f'[data-tab={tab}]')
    expect(pg.locator(f'#tab-{tab}')).to_be_visible()


def show_math(pg, sub):
    show_tab(pg, 'math')
    pg.click(f'[data-sub={sub}]')
    expect(pg.locator(f'#tab-{sub}')).to_be_visible()


def wait_optimizer(pg):
    """The optimizer output is debounced and only renders on its tab: wait until a result panel is shown."""
    show_tab(pg, 'opt')
    expect(pg.locator('#o-out .panel')).to_be_visible()


def table_rows(pg, selector):
    """Body rows of a table (CSS selector or Locator) as lists of the texts of its visible cells. Hidden cells (such as
    the Sync caps special-substat column when it is not needed) are skipped, so positions match what a user sees."""
    table = pg.locator(selector) if isinstance(selector, str) else selector
    return table.locator('tbody tr').evaluate_all(
        "rows => rows.map(r => Array.from(r.cells).filter(c => getComputedStyle(c).display !== 'none').map(c => c.innerText.trim()))"
    )


# ---------- checks ----------


def check_sync_caps(pg, job):
    """Sync caps view at cap 123: substat and main-stat caps per slot match the known values."""
    show_math(pg, 'sync')
    expect(pg.locator('#s-table tbody tr').first).to_be_visible()
    rows = {r[0].replace(' ×2', ''): r for r in table_rows(pg, '#s-table')}  # "Ring ×2" -> "Ring"
    for slot, (sub, main) in CAPS_123.items():
        r = rows.get(slot)
        if r is None:
            check(False, f'{job}: Sync caps has no {slot} row')
            continue
        check(r[2] == str(sub), f'{job}: {slot} substat cap {r[2]!r}, expected {sub}')
        check(r[3] == str(main), f'{job}: {slot} main stat cap {r[3]!r}, expected {main}')
    has_offhand = 'Off-hand' in rows
    if job == 'PLD':
        check(has_offhand, 'PLD: Sync caps has no Off-hand row')
    else:
        check(not has_offhand, f'{job}: Sync caps shows an Off-hand row for a two-handed job')
        w = rows.get('Weapon')
        if w is None:
            check(False, f'{job}: Sync caps has no Weapon row')
        else:
            check(
                (w[2], w[3]) == tuple(map(str, CAPS_123_2H_WEAPON)),
                f'{job}: 2H weapon caps {w[2]}/{w[3]}, expected {CAPS_123_2H_WEAPON[0]}/{CAPS_123_2H_WEAPON[1]}',
            )


def check_wiki_validation(pg):
    """'Checked against real gear': every Wiki item level 475 cap row says 'match'."""
    show_math(pg, 'sync')
    pg.click('#s-valid summary')
    out = pg.locator('#s-valid-out')
    expect(out.locator('table').nth(1).locator('tbody tr').first).to_be_visible()
    wiki = table_rows(pg, out.locator('table').nth(1))
    check(len(wiki) >= 3, f'Wiki 475 table has {len(wiki)} rows')
    for r in wiki:
        check(r[-1] == 'match' and r[1] == r[2], f'Wiki 475 cap differs: {r}')
    bands = table_rows(pg, out.locator('table').nth(0))
    check(len(bands) > 0, 'real-gear accuracy table is empty')


def check_piece_lab(pg):
    """SGE, ilvl 130 head, Spell Speed / Piety / Direct Hit = a real item level 130 healer head piece."""
    show_math(pg, 'piece')
    pg.select_option('#p-slot', 'head')
    pg.select_option('#p-s1', 'spd')
    pg.select_option('#p-s2', 'spec')
    pg.select_option('#p-s3', 'dh')
    pg.fill('#p-ilvl', '130')
    pg.locator('#p-ilvl').dispatch_event('change')
    head = pg.locator('#p-out thead')
    expect(head).to_contain_text('Table @ ilvl 130')
    expect(pg.locator('#p-out tbody tr')).to_have_count(5)
    expected = {'Mind': 33, 'Vitality': 32, 'Spell Speed': 31, 'Piety': 22, 'Direct Hit': 6}
    got = {}
    for r in table_rows(pg, '#p-out'):
        label = r[0].rsplit(' ', 1)[0]  # "Spell Speed 100%" -> "Spell Speed"
        got[label] = r[3]
    for stat, v in expected.items():
        check(got.get(stat) == str(v), f'Piece lab ilvl 130 head {stat} raw {got.get(stat)!r}, expected {v}')
    # 130 is above the 123 cap: the head caps (29 substat, 30 main) must apply in the synced column
    synced = {r[0].rsplit(' ', 1)[0]: r[4].split(' ')[0] for r in table_rows(pg, '#p-out')}
    check(
        synced.get('Mind') == '30' and synced.get('Spell Speed') == '29',
        f'Piece lab synced Mind/Spell Speed {synced.get("Mind")}/{synced.get("Spell Speed")}, expected 30/29',
    )
    expect(pg.locator('#p-chart svg')).to_be_visible()


# Real gear windows for the optimizer check: (job, item level from, item level to, equip level up to).
OPT_POOLS = [('SGE', 120, 130, 50), ('WAR', 130, 135, 50)]

# Node script: the browse rows for one window and the best speed stat synced to 123 and unsynced, from src/core
# (optimize) and from the exhaustive reference. Prints JSON.
NODE_EXPECT = """
const [jobId, ilvlMin, ilvlMax, lvlMax] = %s;
const { makeJobContext } = await import(%s);
const { browseItems } = await import(%s);
const { optimize } = await import(%s);
const { exhaustive, gamePool } = await import(%s);
const job = makeJobContext(jobId);
const filter = { ilvlMin, ilvlMax, lvlMax };
const pool = gamePool(job, filter);
const out = { count: browseItems(job, filter).length };
for (const sync of [true, false]) {
  const s = { cap: 123, sync };
  const opts = { target: 'spd', tiebreak: ['main', 'vit'] };
  out[sync ? 'synced' : 'unsynced'] = [optimize(job, pool, s, opts).totals.spd, exhaustive(job, pool, s, opts)[0]];
}
console.log(JSON.stringify(out));
"""


def run_node(script, args):
    """Run a Node ES module script (formatted with the JSON args and the core module URLs) and parse its JSON output."""
    mod = lambda rel: json.dumps((ROOT / rel).as_uri())  # noqa: E731
    script = script % (
        json.dumps(args),
        mod('src/core/job-context.js'),
        mod('src/core/items.js'),
        mod('src/core/optimizer/index.js'),
        mod('tests/unit/helpers/exhaustive.js'),
    )
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise AssertionError(f'node expectation script failed: {out.stderr.strip().splitlines()[-1:]}')
    return json.loads(out.stdout)


def core_expectation(job, lo, hi, lvl):
    """Expected values for one window, computed by src/core in Node (independent of the page)."""
    return run_node(NODE_EXPECT, [job, lo, hi, lvl])


def check_real_gear_optimizer(pg):
    """For a healer and a tank: add every item in a small item level window, and the page's best speed stat
    (synced to 123 and unsynced) equals the core's optimizer and the brute force for the same rows."""
    for job, lo, hi, lvl in OPT_POOLS:
        want = core_expectation(job, lo, hi, lvl)
        for key in ('synced', 'unsynced'):
            check(want[key][0] == want[key][1], f'{job}: core optimizer {want[key][0]} != brute force {want[key][1]} ({key})')
        set_job(pg, job)
        show_tab(pg, 'pool')
        pg.locator('#b-clear').click()
        pg.fill('#b-q', '')
        pg.select_option('#b-type', 'any')
        pg.fill('#b-min', str(lo))
        pg.fill('#b-max', str(hi))
        pg.fill('#b-lvl', str(lvl))
        expect(pg.locator('#b-count')).to_have_text(f'{want["count"]} matches')
        pg.click('#b-addall')
        expect(pg.locator('#b-count')).to_contain_text(f'Added {want["count"]} items')
        expect(pg.locator('#pool-table tbody tr')).to_have_count(want['count'])

        wait_optimizer(pg)
        pg.select_option('#o-target', 'spd')
        if pg.locator('#o-avg').is_checked():  # compare without an average item level requirement
            pg.locator('#o-avg').uncheck()
        speed = pg.locator('#o-target option[value="spd"]').inner_text().strip()
        total = pg.locator('#o-out .readout > div').first.locator('b')
        if not pg.locator('#sync').is_checked():
            pg.locator('#sync').check()
        try:
            expect(total).to_have_text(str(want['synced'][0]))
        except AssertionError:
            check(False, f'{job} synced {speed} {total.inner_text()!r}, expected {want["synced"][0]}')
        check(speed in pg.locator('#o-out h3').inner_text(), f'{job}: optimizer heading does not name {speed}')
        pg.screenshot(path=str(OUT / f'optimizer-{job}.png'), full_page=True)

        pg.locator('#sync').uncheck()
        try:
            expect(total).to_have_text(str(want['unsynced'][0]))
        except AssertionError:
            check(False, f'{job} unsynced {speed} {total.inner_text()!r}, expected {want["unsynced"][0]}')
        pg.locator('#sync').check()
        # the ceiling table renders for a non-empty pool
        expect(pg.locator('#o-ceil table')).to_be_visible()


def check_job_switch_clears_pool(pg):
    """With gear in the pool, switching job (even within the same role) warns first; Cancel keeps the job and the
    pool, confirming switches and clears the pool (docs/audit-2.md A1)."""
    set_job(pg, 'WAR')
    show_tab(pg, 'pool')
    if not pg.locator('#pool-table tbody tr td:not(.empty)').count():
        pg.fill('#b-q', '')
        pg.fill('#b-min', '130')
        pg.fill('#b-max', '135')
        pg.fill('#b-lvl', '50')
        pg.click('#b-addall')
    rows = pg.locator('#pool-table tbody tr').count()
    check(rows > 0, 'pool is empty before the job switch check')
    warrior = job_name(pg, 'WAR')

    pg.select_option('#job', 'GNB')  # same role as WAR
    expect(pg.locator('#job-warning')).to_be_visible()
    expect(pg.locator('#job-warning')).to_contain_text(job_name(pg, 'GNB'))
    check(pg.input_value('#job') == 'WAR', f'job menu shows {pg.input_value("#job")!r} before the switch is confirmed')
    pg.click('#job-cancel')
    expect(pg.locator('#job-warning')).to_have_count(0)
    expect(pg.locator('#jobinfo')).to_contain_text(warrior + ':')
    expect(pg.locator('#pool-table tbody tr')).to_have_count(rows)

    pg.select_option('#job', 'GNB')
    pg.click('#job-confirm')
    expect(pg.locator('#jobinfo')).to_contain_text(job_name(pg, 'GNB') + ':')
    expect(pg.locator('#pool-count')).to_contain_text('0 items')
    expect(pg.locator('#pool-table td.empty')).to_be_visible()


# Rings-only window for the copies check: (job, item level from, item level to, equip level up to).
COPIES_POOL = ('SGE', 140, 150, 60)

# Node script: for the rings in one window, the best synced Spell/Skill Speed as added (non-Unique rings get 2 copies)
# and with one non-Unique ring cut to 1 copy, chosen so the total changes; each from optimize() and the brute force.
NODE_COPIES = """
const [jobId, ilvlMin, ilvlMax, lvlMax] = %s;
const { makeJobContext } = await import(%s);
const { browseItems } = await import(%s);
const { optimize } = await import(%s);
const { exhaustive, gamePool } = await import(%s);
const job = makeJobContext(jobId);
const filter = { type: 'ring', ilvlMin, ilvlMax, lvlMax };
const pool = gamePool(job, filter);
const s = { cap: 123, sync: true };
const opts = { target: 'spd', tiebreak: ['main', 'vit'] };
const best = p => [optimize(job, p, s, opts).totals.spd, exhaustive(job, p, s, opts)[0]];
const out = { count: browseItems(job, filter).length, two: best(pool), ring: null };
for (const r of pool.filter(i => i.copies === 2 && pool.filter(j => j.name === i.name).length === 1)) {
  const one = best(pool.map(i => (i === r ? { ...i, copies: 1 } : i)));
  if (one[0] !== out.two[0]) { Object.assign(out, { ring: r.name, one }); break; }
}
console.log(JSON.stringify(out));
"""


def fill_browser(pg, lo, hi, lvl, slot='any'):
    """Set the browser filter to an item level window (name filter cleared)."""
    show_tab(pg, 'pool')
    pg.fill('#b-q', '')
    pg.select_option('#b-type', slot)
    pg.fill('#b-min', str(lo))
    pg.fill('#b-max', str(hi))
    pg.fill('#b-lvl', str(lvl))


def copies_input(pg, name):
    """The Copies field on the pool row whose item is `name`."""
    cell = pg.locator('td:first-child').filter(has_text=re.compile('^' + re.escape(name) + '$'))
    row = pg.locator('#pool-table tbody tr').filter(has=cell)
    return row.locator('input[data-copies]')


def set_copies(pg, name, n):
    field = copies_input(pg, name)
    field.fill(str(n))
    field.dispatch_event('change')


def opt_total(pg):
    return pg.locator('#o-out .readout > div').first.locator('b')


def check_copies_change_optimizer(pg):
    """In a rings-only pool whose best pair is one non-Unique ring worn twice, cutting that ring to 1 copy lowers the
    optimizer's total to what the core computes, and setting it back to 2 restores it."""
    job, lo, hi, lvl = COPIES_POOL
    want = run_node(NODE_COPIES, [job, lo, hi, lvl])
    if not check(want['ring'], f'{job} rings {lo}-{hi}: no non-Unique ring whose copies change the best total; pick another window'):
        return
    for key in ('two', 'one'):
        check(want[key][0] == want[key][1], f'{job} rings: core optimizer {want[key][0]} != brute force {want[key][1]} ({key} copies)')
    set_job(pg, job)
    show_tab(pg, 'pool')
    pg.locator('#b-clear').click()
    fill_browser(pg, lo, hi, lvl, 'ring')
    expect(pg.locator('#b-count')).to_have_text(f'{want["count"]} matches')
    pg.click('#b-addall')
    expect(pg.locator('#pool-table tbody tr')).to_have_count(want['count'])
    ring = want['ring']
    expect(copies_input(pg, ring)).to_have_value('2')  # non-Unique rings are added with 2 copies

    wait_optimizer(pg)
    if pg.locator('#o-avg').is_checked():
        pg.locator('#o-avg').uncheck()
    if not pg.locator('#sync').is_checked():
        pg.locator('#sync').check()
    total = opt_total(pg)
    for n, key in ((2, 'two'), (1, 'one'), (2, 'two')):
        show_tab(pg, 'pool')
        set_copies(pg, ring, n)
        expect(copies_input(pg, ring)).to_have_value(str(n))
        wait_optimizer(pg)
        try:
            expect(total).to_have_text(str(want[key][0]))
        except AssertionError:
            check(False, f'{job}: {ring} at {n} copies, optimizer total {total.inner_text()!r}, expected {want[key][0]}')


def wait_saved(pg, js_condition):
    """Wait until the (debounced) saved state satisfies a JS predicate over it, s => ..."""
    pg.wait_for_function(
        f"""k => {{ let s; try {{ s = JSON.parse(localStorage.getItem(k)); }} catch {{ return false; }}
        return !!s && ({js_condition})(s); }}""",
        arg=STORE_KEY,
    )


def check_reload_persists(pg):
    """Build a non-default state (job, cap, sync off, level, pool with one ring's copies edited, optimizer target and
    tiebreaks, browse filter, Piece lab slot and item level, Optimizer tab open), reload, and every part comes back:
    the inputs, the pool rows and copies, the open tab and the same optimizer total."""
    job, lo, hi, lvl = 'DRG', 130, 135, 50  # not the default job, a different role from the other checks
    set_job(pg, job)
    show_tab(pg, 'pool')
    pg.locator('#b-clear').click()
    fill_browser(pg, lo, hi, lvl)
    pg.click('#b-addall')
    expect(pg.locator('#pool-table tbody tr td.empty')).to_have_count(0)
    rows = pg.locator('#pool-table tbody tr').count()
    rings = pg.locator('#pool-table input[data-copies]').evaluate_all('els => els.filter(e => e.value === "2").map(e => e.dataset.copies)')
    if not check(rings, f'{job} {lo}-{hi}: no ring with 2 copies in the pool to edit'):
        return
    ring_id = rings[0]
    field = pg.locator(f'#pool-table input[data-copies="{ring_id}"]')
    field.fill('1')
    field.dispatch_event('change')

    show_math(pg, 'piece')
    pg.select_option('#p-slot', 'body')
    pg.fill('#p-ilvl', '200')
    pg.locator('#p-ilvl').dispatch_event('change')
    pg.fill('#cap', '130')
    pg.locator('#cap').dispatch_event('change')
    pg.fill('#level', '60')
    pg.locator('#level').dispatch_event('change')
    if pg.locator('#sync').is_checked():
        pg.locator('#sync').uncheck()
    wait_optimizer(pg)
    pg.select_option('#o-tb1', 'det')
    pg.select_option('#o-tb2', '')
    pg.select_option('#o-target', 'crit')  # last, so the heading below shows a result that includes every change
    # the result is debounced: wait until it names the new target before reading the total
    crit = pg.locator('#o-target option[value="crit"]').inner_text().strip()
    expect(pg.locator('#o-out h3')).to_have_text(f'Best loadout for {crit}')
    total = opt_total(pg)
    before = total.inner_text()

    inputs = {
        '#job': job,
        '#cap': '130',
        '#level': '60',
        '#b-type': 'any',
        '#b-min': str(lo),
        '#b-max': str(hi),
        '#b-lvl': str(lvl),
        '#p-slot': 'body',
        '#p-ilvl': '200',
        '#o-target': 'crit',
        '#o-tb1': 'det',
        '#o-tb2': '',
    }
    for sel, v in inputs.items():
        check(pg.input_value(sel) == v, f'reload setup: {sel} is {pg.input_value(sel)!r} before reload, expected {v!r}')
    # wait for the debounced save of the last change, rather than sleeping
    wait_saved(
        pg,
        f"""s => s.job === '{job}' && s.cap === 130 && s.level === 60 && s.sync === false && s.tab === 'opt'
        && s.opt.target === 'crit' && s.opt.tb === 'det' && s.opt.tb2 === '' && s.piece.slot === 'body'
        && s.piece.ilvl === 200 && Array.isArray(s.pool) && s.pool.length === {rows}
        && s.pool.some(i => i.id === '{ring_id}' && i.copies === 1)""",
    )

    pg.reload()
    wait_ready(pg)
    selected = pg.get_attribute('[data-tab=opt]', 'aria-selected') == 'true'
    check(selected and pg.locator('#tab-opt').is_visible(), 'after reload the Optimizer tab is not the open tab')
    for sel, v in inputs.items():
        got = pg.input_value(sel)
        check(got == v, f'after reload {sel} is {got!r}, expected {v!r}')
    check(not pg.locator('#sync').is_checked(), 'after reload sync is on, expected off')
    wait_optimizer(pg)
    try:
        expect(total).to_have_text(before)
    except AssertionError:
        got = total.inner_text() if total.count() else 'no result'
        check(False, f'after reload the optimizer total is {got!r}, expected {before!r} as before reload')
    show_tab(pg, 'pool')
    got_rows = pg.locator('#pool-table tbody tr').count()
    check(got_rows == rows, f'after reload the pool has {got_rows} rows, expected {rows}')
    field = pg.locator(f'#pool-table input[data-copies="{ring_id}"]')
    check(field.count() == 1 and field.input_value() == '1', 'after reload the edited ring copies is not 1')
    pg.locator('#sync').check()  # leave sync on for the later checks


# Stored values that are not usable state: each must load as the defaults without a JS error.
BAD_STORAGE = [
    ('invalid JSON', '{"job": "WAR", "cap": 13'),
    ('a JSON array', '[1, 2, 3]'),
    (
        'wrong-typed fields',
        json.dumps(
            {
                'job': 42,
                'cap': 'abc',
                'sync': 'yes',
                'level': None,
                'tab': 7,
                'mathTab': {},
                'piece': 'head',
                'browse': [1],
                'opt': {'target': 5, 'tb': None, 'avg': 'no', 'avgMin': 'x'},
                'poolFilter': 3,
                'pool': {'0': {'id': 'x'}},
            }
        ),
    ),
    ('a pool of broken items', json.dumps({'job': 'SGE', 'pool': [None, 5, {'id': 3}, {'id': 'a', 'type': 'ring', 'ilvl': 'big'}]})),
]


def check_corrupted_storage(pg):
    """Invalid JSON or wrong-typed saved values: the page loads with the default settings, an empty pool and no JS
    error. The bad value is written from a separate blank page (same file:// storage), so no pending save of this
    page can overwrite it before the load."""
    blank = OUT / 'blank.html'
    blank.write_text('<!doctype html><title>blank</title>', encoding='utf-8')
    defaults = {'#job': 'SGE', '#cap': '123', '#level': '50', '#b-min': '100', '#b-lvl': '100', '#o-target': 'spd'}
    for what, raw in BAD_STORAGE:
        n_errors = len(errors)
        pg.goto(blank.as_uri())
        pg.evaluate('([k, v]) => localStorage.setItem(k, v)', [STORE_KEY, raw])
        pg.goto(PAGE.as_uri())
        wait_ready(pg)
        expect(pg.locator('#tab-pool')).to_be_visible()
        for sel, v in defaults.items():
            got = pg.input_value(sel)
            check(got == v, f'stored {what}: {sel} is {got!r}, expected the default {v!r}')
        check(pg.locator('#sync').is_checked(), f'stored {what}: sync is off, expected the default on')
        expect(pg.locator('#pool-table td.empty')).to_be_visible()
        check_no_bad_text(pg, f'page loaded from stored {what}')
        check(len(errors) == n_errors, f'stored {what}: JS errors on load: {errors[n_errors:]}')
        # the page repairs storage: the next save holds valid state
        wait_saved(pg, "s => s.job === 'SGE' && Array.isArray(s.pool)")


def check_pld_offhand(pg):
    """PLD (1H weapon + shield) offers an Off-hand slot in the browser; two-handed jobs do not."""
    set_job(pg, 'PLD')
    show_tab(pg, 'pool')
    opts = pg.locator('#b-type option').all_inner_texts()
    check('Off-hand' in opts, f'PLD slot filter has no Off-hand: {opts}')
    pg.screenshot(path=str(OUT / 'pool.png'), full_page=True)
    set_job(pg, 'WAR')
    opts = pg.locator('#b-type option').all_inner_texts()
    check('Off-hand' not in opts, f'WAR slot filter offers Off-hand: {opts}')


def check_no_bad_text(pg, where):
    txt = pg.inner_text('body')
    for bad in BAD_WORDS:
        check(bad not in txt, f'"{bad}" visible in {where}')


def walk_jobs(pg):
    """Every tab for each job: no undefined/NaN/null text, correct sync caps, page fits 400 px."""
    pg.set_viewport_size({'width': 400, 'height': 800})
    for job in JOBS:
        set_job(pg, job)
        show_tab(pg, 'pool')
        expect(pg.locator('#b-count')).not_to_have_text('')
        check_no_bad_text(pg, f'{job}/pool')
        wait_optimizer(pg)
        check_no_bad_text(pg, f'{job}/opt')
        show_math(pg, 'piece')
        expect(pg.locator('#p-out tbody tr').first).to_be_visible()
        check_no_bad_text(pg, f'{job}/math:piece')
        check_sync_caps(pg, job)
        check_no_bad_text(pg, f'{job}/math:sync')
        hs = pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        check(not hs, f'{job}: horizontal page scroll at 400 px')
    pg.screenshot(path=str(OUT / 'phone.png'), full_page=True)


def main():
    if not PAGE.exists():
        print(f'{PAGE} not found; run `npm run build` first')
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    expect.set_options(timeout=TIMEOUT)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={'width': 1000, 'height': 900})
        pg.set_default_timeout(TIMEOUT)
        pg.on('pageerror', lambda e: errors.append('page error: ' + str(e)))
        # ERR_* console errors are network failures (Google Fonts offline), not page bugs
        pg.on('console', lambda m: errors.append('console error: ' + m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
        pg.goto(PAGE.as_uri())
        wait_ready(pg)
        check(pg.title() == 'Item Level Stat Lab', f'title is {pg.title()!r}')
        check(pg.input_value('#cap') == '123', f'default cap {pg.input_value("#cap")!r}, expected 123')

        steps = [
            check_piece_lab,
            check_wiki_validation,
            check_real_gear_optimizer,
            check_job_switch_clears_pool,
            check_copies_change_optimizer,
            check_reload_persists,
            check_corrupted_storage,
            check_pld_offhand,
            walk_jobs,
        ]
        set_job(pg, 'SGE')
        for step in steps:
            try:
                step(pg)
            except (AssertionError, PlaywrightError) as e:
                failures.append(f'{step.__name__}: {str(e).splitlines()[0]}')
                pg.screenshot(path=str(OUT / f'fail-{step.__name__}.png'), full_page=True)
        browser.close()

    problems = errors + failures
    print('\n'.join(problems) or 'no errors')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
