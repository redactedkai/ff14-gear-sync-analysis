"""Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 400 px. Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) and the FFXIV Wiki's item level 475 caps;
  - the optimizer over every piece a healer and a tank can wear: the page's best Spell/Skill Speed, synced to 123 and
    unsynced, equals what src/core computes for the same gear in Node (the core is checked against a brute force over
    every loadout in tests/unit), and so do the totals with crafted gear left out and with materia off;
  - a 130 head piece (Spell Speed / Piety) reproducing the ranked stats of a real item level 130 healer head piece
    (Mind 33, Vitality 32, substats 31/22; its fixed Direct Hit 6 is not a rank; tests/unit/views.test.js finds it in
    the item database);
  - level sync (synced level 90, item level sync off): level 100 healer head pieces capped at the item level 660
    head values (Mind 248; tests/unit/level-sync.test.js derives them from the ItemLevel row), and the Sync limits
    tab at item level 660 (ParamGrow.ItemLevelSync for level 90).

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

JOBS = ['SGE', 'WAR', 'PLD', 'BLM', 'NIN', 'DRG', 'BST', 'BLU']
ONE_HANDED = {'PLD', 'BST'}  # one-handed weapon + shield
BAD_WORDS = ['undefined', 'NaN', 'null']
TIMEOUT = 10_000  # ms for any single wait
STORE_KEY = 'ilvl-stat-lab-v4'  # localStorage key of the saved state (src/ui/state.js)

# Defaults owe nothing to any player's setup: no job chosen, no sync cap (sync off), level 100.
DEFAULT_JOB, DEFAULT_CAP, DEFAULT_LEVEL = '', '', '100'
# Gear groups left out by default, in the optimizer and the browser (owner's decision; DEFAULT_EXCLUDE in
# src/ui/state.js), and every group in SOURCES order (src/core/item-format.json).
DEFAULT_EXCLUDE = ['savage', 'ultimate', 'pvp']
SOURCE_KEYS = ['crafted', 'tomestone', 'relic', 'savage', 'ultimate', 'pvp']

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
    """Alpine has rendered: the job picker has its buttons and the settings panel names the job (or "none chosen")."""
    expect(pg.locator('[data-job-id]').first).to_be_attached()
    expect(pg.locator('#job-name')).not_to_have_text('')


def job_name(pg, job):
    return pg.get_attribute(f'[data-job-id="{job}"]', 'aria-label')


def current_job(pg):
    """The job the picker shows as selected, '' when none is."""
    sel = pg.locator('[data-job-id][aria-checked="true"]')
    return sel.get_attribute('data-job-id') if sel.count() else ''


def field_value(pg, sel):
    """An input's value; '#job' means the job picker's selection."""
    return current_job(pg) if sel == '#job' else pg.input_value(sel)


def set_job(pg, job):
    """Switch job (the page does not ask: nothing is lost but the job-specific choices)."""
    pg.click(f'[data-job-id="{job}"]')
    expect(pg.locator('[data-job]')).to_have_attribute('data-job', job)


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
    the Sync limits special-substat column when it is not needed) are skipped, so positions match what a user sees."""
    table = pg.locator(selector) if isinstance(selector, str) else selector
    return table.locator('tbody tr').evaluate_all(
        "rows => rows.map(r => Array.from(r.cells).filter(c => getComputedStyle(c).display !== 'none').map(c => c.innerText.trim()))"
    )


# ---------- checks ----------


def check_sync_caps(pg, job):
    """Sync limits view at cap 123: substat and main-stat caps per slot match the known values."""
    show_math(pg, 'sync')
    expect(pg.locator('#s-table tbody tr').first).to_be_visible()
    rows = {r[0].replace(' ×2', ''): r for r in table_rows(pg, '#s-table')}  # "Ring ×2" -> "Ring"
    for slot, (sub, main) in CAPS_123.items():
        r = rows.get(slot)
        if r is None:
            check(False, f'{job}: Sync limits has no {slot} row')
            continue
        check(r[2] == str(sub), f'{job}: {slot} substat cap {r[2]!r}, expected {sub}')
        check(r[3] == str(main), f'{job}: {slot} main stat cap {r[3]!r}, expected {main}')
    has_offhand = 'Off-hand' in rows
    if job in ONE_HANDED:
        check(has_offhand, f'{job}: Sync limits has no Off-hand row')
    else:
        check(not has_offhand, f'{job}: Sync limits shows an Off-hand row for a two-handed job')
        w = rows.get('Weapon')
        if w is None:
            check(False, f'{job}: Sync limits has no Weapon row')
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
    """SGE, ilvl 130 head, Spell Speed / Piety = the ranked stats of a real item level 130 healer head piece."""
    show_math(pg, 'piece')
    pg.select_option('#p-slot', 'head')
    pg.select_option('#p-s1', 'spd')
    pg.select_option('#p-s2', 'spec')
    pg.fill('#p-ilvl', '130')
    pg.locator('#p-ilvl').dispatch_event('change')
    head = pg.locator('#p-out thead')
    expect(head).to_contain_text('Table @ ilvl 130')
    expect(pg.locator('#p-out tbody tr')).to_have_count(4)
    expect(pg.locator('#p-s3')).to_have_count(0)  # no third rank: a third line exists only as healer Direct Hit
    expected = {'Mind': 33, 'Vitality': 32, 'Spell Speed': 31, 'Piety': 22}
    got = {}
    for r in table_rows(pg, '#p-out'):
        label = r[0].rsplit(' ', 1)[0]  # "Spell Speed 100%" -> "Spell Speed"
        got[label] = r[3]
    for stat, v in expected.items():
        check(got.get(stat) == str(v), f'Piece stats ilvl 130 head {stat} raw {got.get(stat)!r}, expected {v}')
    # 130 is above the 123 cap: the head caps (29 substat, 30 main) must apply in the synced column
    synced = {r[0].rsplit(' ', 1)[0]: r[4].split(' ')[0] for r in table_rows(pg, '#p-out')}
    check(
        synced.get('Mind') == '30' and synced.get('Spell Speed') == '29',
        f'Piece stats synced Mind/Spell Speed {synced.get("Mind")}/{synced.get("Spell Speed")}, expected 30/29',
    )
    expect(pg.locator('#p-chart svg')).to_be_visible()


# The optimizer searches every piece the job can wear, minus the gear groups unticked under Gear to search (Current
# Savage, Ultimate and PvP by default). Node scripts compute the same from src/core and print JSON; run_node fills in
# the JSON args and the module URLs (job-context, items, optimizer).
NODE_GEAR = """
const [jobId, sync, target, def, extra] = %s;
const { makeJobContext } = await import(%s);
const { browseItems, poolItemFromRow, withoutSources } = await import(%s);
const { optimize } = await import(%s);
const job = makeJobContext(jobId);
const gear = browseItems(job, {}).map(r => poolItemFromRow(job, r));
const pool = withoutSources(gear, def);
const best = (p, melds) => optimize(job, p, sync, { target, melds }).totals[target];
console.log(JSON.stringify({
  all: gear.length, searched: pool.length, on: best(pool, true), off: best(pool, false),
  without: best(withoutSources(pool, extra), true),
}));
"""


def run_node(script, args):
    """Run a Node ES module script (formatted with the JSON args and the core module URLs) and parse its JSON output."""
    mod = lambda rel: json.dumps((ROOT / rel).as_uri())  # noqa: E731
    script = script % (
        json.dumps(args),
        mod('src/core/job-context.js'),
        mod('src/core/items.js'),
        mod('src/core/optimizer/index.js'),
    )
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        raise AssertionError(f'node expectation script failed: {out.stderr.strip().splitlines()[-1:]}')
    return json.loads(out.stdout)


def core_gear(job, sync, target, extra=()):
    """The core's best `target` over every piece `job` can wear minus the default left-out groups, with materia on
    (on) and off (off), and with the `extra` groups left out too (without); plus the piece counts."""
    return run_node(NODE_GEAR, [job, sync, target, DEFAULT_EXCLUDE, list(extra)])


def opt_total(pg):
    return pg.locator('#o-out .readout > div').first.locator('b')


def expect_total(pg, want, what):
    try:
        expect(opt_total(pg)).to_have_text(str(want))
    except AssertionError:
        check(False, f'{what}: optimizer total {opt_total(pg).inner_text()!r}, expected {want}')


def count_text(searched, total):
    return f'Searching {searched:,} of {total:,} pieces.'


# Optimizer checks: (job, target), at the shared setup (level 50, cap 123), synced and with item level sync off.
OPT_CASES = [('SGE', 'spd'), ('WAR', 'spd')]


def check_real_gear_optimizer(pg):
    """For a healer and a tank, with no gear chosen by hand: the page searches every piece the job can wear (minus the
    default left-out groups), says how many, and its best speed stat, synced to 123 and with item level sync off (level
    sync to 50 still applies), equals the core's optimizer over the same gear. The optimizer itself is checked against a
    brute force over every loadout in tests/unit."""
    for job, target in OPT_CASES:
        set_job(pg, job)
        wait_optimizer(pg)
        pg.select_option('#o-target', target)
        speed = pg.locator(f'#o-target option[value="{target}"]').inner_text().strip()
        expect(pg.locator('#o-result')).to_have_attribute('data-target', target)
        for synced in (True, False):
            want = core_gear(job, {'cap': 123, 'sync': synced, 'level': 50}, target)
            pg.locator('#sync').set_checked(synced)
            expect(pg.locator('#o-count')).to_have_text(count_text(want['searched'], want['all']))
            expect_total(pg, want['on'], f'{job} {"synced" if synced else "unsynced"} {speed}')
            check(speed in pg.locator('#o-out .readout').inner_text(), f'{job}: optimizer result does not name {speed}')
            if synced:
                pg.screenshot(path=str(OUT / f'optimizer-{job}.png'), full_page=True)
        pg.locator('#sync').check()


def check_typing_debounce(pg):
    """Typing a number commits once, after a pause: typing a cap of 123 key by key runs the optimizer once (for 123),
    not for 1 and 12 on the way; the result says how long the solve took."""
    set_job(pg, 'SGE')
    wait_optimizer(pg)
    set_cap(pg, '200')
    expect(pg.locator('#o-time')).to_have_text(re.compile(r'^Solved in \d+ ms\.$'))
    pg.wait_for_timeout(600)  # longer than the typing and optimizer waits: nothing pending
    runs = lambda: pg.evaluate("performance.getEntriesByName('optimizer').length")  # noqa: E731
    before = runs()
    pg.locator('#cap').select_text()  # typing replaces the selected 200, as a user would
    pg.locator('#cap').press_sequentially('123', delay=60)  # faster than the 300 ms typing wait
    wait_saved(pg, 's => s.cap === 123')
    pg.wait_for_timeout(600)
    check(runs() - before == 1, f'typing a cap of 123 ran the optimizer {runs() - before} times, expected once')
    expect(pg.locator('#o-time')).to_have_text(re.compile(r'^Solved in \d+ ms\.$'))


def check_job_switch(pg):
    """Switching job takes effect at once (nothing is lost but the job-specific choices, so the page does not ask) and
    puts the optimizer target back to the main stat."""
    set_job(pg, 'WAR')
    wait_optimizer(pg)
    pg.select_option('#o-target', 'crit')
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'crit')
    pg.click('[data-job-id="GNB"]')  # same role as WAR
    expect(pg.locator('[data-job]')).to_have_attribute('data-job', 'GNB')
    check(pg.input_value('#o-target') == 'main', f'after a job switch the target is {pg.input_value("#o-target")!r}')
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'main')


# Gear browser rings window: (job, item level from, item level to, equip level up to).
RINGS_WINDOW = ('SGE', 140, 150, 60)
NODE_RINGS = """
const [jobId, ilvlMin, ilvlMax, lvlMax, def] = %s;
const { makeJobContext } = await import(%s);
const { browseItems, sourcesMask } = await import(%s);
await import(%s);
const job = makeJobContext(jobId);
const rows = browseItems(job, { type: 'ring', ilvlMin, ilvlMax, lvlMax }).filter(r => !(r.sources & sourcesMask(def)));
console.log(JSON.stringify({ count: rows.length, x2: rows.filter(r => !r.unique).length }));
"""


def fill_browser(pg, lo, hi, lvl, slot='any'):
    """Set the gear browser's filters to an item level window (name filter cleared)."""
    show_tab(pg, 'browse')
    pg.fill('#b-q', '')
    pg.select_option('#b-type', slot)
    all_expansions(pg)
    pg.fill('#b-min', str(lo))
    pg.fill('#b-max', str(hi))
    pg.fill('#b-lvl', str(lvl))


def browser_rows(pg):
    return pg.locator('#gear-table tbody tr[data-key]')


def check_ring_copies(pg):
    """The gear browser marks every non-Unique ring x2 (it can be worn on both hands) and no Unique one."""
    job, lo, hi, lvl = RINGS_WINDOW
    want = run_node(NODE_RINGS, [job, lo, hi, lvl, DEFAULT_EXCLUDE])
    if not check(0 < want['x2'] < want['count'], f'{job} rings {lo}-{hi}: no mix of Unique and non-Unique rings; pick another window'):
        return
    set_job(pg, job)
    fill_browser(pg, lo, hi, lvl, 'ring')
    expect(pg.locator('#b-count')).to_have_text(f'{want["count"]} matches')
    expect(browser_rows(pg)).to_have_count(want['count'])
    expect(pg.locator('#gear-table .x2:visible')).to_have_count(want['x2'])


def group_boxes(pg, where):
    """The gear-group checkboxes of the optimizer ('o-gear') or the browser ('b-groups')."""
    return pg.locator(f'#{where} input[data-source]')


def group_box(pg, where, key):
    return pg.locator(f'#{where} input[data-source="{key}"]')


def ticked(pg, where):
    return [b.get_attribute('data-source') for b in group_boxes(pg, where).all() if b.is_checked()]


# A setting where crafted gear and materia both change the best Critical Hit (Sage, level 100, no sync).
GROUPS_CASE = ('SGE', {'cap': None, 'sync': False, 'level': 100}, 'crit')


def check_gear_groups(pg):
    """Gear to search: six gear groups in two aligned columns of three, every group but Current Savage (named with its
    patch series), Ultimate and PvP ticked (searched) by default. Unticking crafted gear changes the total to what the
    core computes without it and the count line with it; the choice is saved. The browser has its own groups: the
    optimizer's choice does not change them."""
    job, sync, target = GROUPS_CASE
    want = core_gear(job, sync, target, ['crafted'])
    if not check(want['without'] < want['on'], f'{job}: leaving crafted gear out does not lower the total; pick another case'):
        return
    set_job(pg, job)
    pg.locator('#sync').uncheck()
    set_number(pg, '#level', str(sync['level']))
    wait_optimizer(pg)
    pg.select_option('#o-target', target)
    searched_default = [s for s in SOURCE_KEYS if s not in DEFAULT_EXCLUDE]
    check(ticked(pg, 'o-gear') == searched_default, f'searched by default: {ticked(pg, "o-gear")}, expected {searched_default}')
    labels = [t.strip() for t in pg.locator('#o-gear .groups label').all_inner_texts()]
    check(labels[3:4] == ['Current Savage (7.x)'], f'the Current Savage box reads {labels[3:4]}')
    boxes = pg.locator('#o-gear .groups label').evaluate_all(
        'ls => ls.map(l => { const r = l.getBoundingClientRect(); return [r.left, r.top]; })'
    )
    lefts = [round(b[0]) for b in boxes]
    tops = [round(b[1]) for b in boxes]
    check(
        len(boxes) == 6 and len(set(lefts[:3])) == 1 and len(set(lefts[3:])) == 1 and lefts[3] > lefts[0] and tops[:3] == tops[3:],
        f'gear groups are not two aligned columns of three: {boxes}',
    )
    expect_total(pg, want['on'], f'{job} {target}, default groups')
    crafted = group_box(pg, 'o-gear', 'crafted')
    crafted.uncheck()
    expect_total(pg, want['without'], f'{job} {target}, crafted left out')
    n_crafted = want['searched'] - run_node(NODE_GEAR, [job, sync, target, ['crafted', *DEFAULT_EXCLUDE], []])['searched']
    expect(pg.locator('#o-count')).to_have_text(count_text(want['searched'] - n_crafted, want['all']))
    wait_saved(pg, f's => s.opt.exclude.join() === {json.dumps(",".join(["crafted", *DEFAULT_EXCLUDE]))}')
    show_tab(pg, 'browse')
    check(ticked(pg, 'b-groups') == searched_default, f'the browser groups followed the optimizer: {ticked(pg, "b-groups")}')
    wait_optimizer(pg)
    crafted.check()
    expect_total(pg, want['on'], f'{job} {target}, crafted back in')
    pg.locator('#sync').check()
    set_number(pg, '#level', '50')


def check_melds(pg):
    """Melds are on by default: the total equals the core's with melds, and each melded pick names its stones; the
    switch off gives the core's total without melds and no meld lines. The choice is saved."""
    job, sync, target = GROUPS_CASE
    want = core_gear(job, sync, target)
    if not check(want['on'] > want['off'], f'{job}: melds do not raise {target}; pick another case'):
        return
    set_job(pg, job)
    pg.locator('#sync').uncheck()
    set_number(pg, '#level', str(sync['level']))
    wait_optimizer(pg)
    pg.select_option('#o-target', target)
    melds = pg.locator('#o-melds')
    check(melds.is_checked(), 'melds are on by default')
    check(not pg.locator('#o-food').is_checked(), 'Food is on by default')
    expect_total(pg, want['on'], 'melds on')
    expect(pg.locator('#o-result .meld').first).to_be_visible()
    expect(pg.locator('#o-meld-note')).to_be_visible()
    # every pick has its target at its cap here (melded up to it), so each target cell is marked and the legend shows
    rows = pg.locator('#o-result tbody tr:not(.total):not(.tier)').count()
    expect(pg.locator('#o-result td.gold .atcap')).to_have_count(rows)
    expect(pg.locator('#o-cap-note')).to_be_visible()
    expect(pg.locator('#o-effect')).to_contain_text('%')  # the tier rows: Critical Hit rate
    check_no_bad_text(pg, 'melds/on')
    melds.uncheck()
    expect_total(pg, want['off'], 'melds off')
    expect(pg.locator('#o-result .meld')).to_have_count(0)
    wait_saved(pg, 's => s.opt.melds === false')
    melds.check()
    expect_total(pg, want['on'], 'melds back on')
    # leave the target on the main stat: the result is only recomputed while this tab is open, and a later check that
    # waits for a Critical Hit result would otherwise read this one
    pg.select_option('#o-target', 'main')
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'main')
    pg.locator('#sync').check()
    set_number(pg, '#level', '50')


def column_values(pg, row_sel, header):
    """The numbers of the result table's row `row_sel` under the stat column headed `header` (SpS, DET, ...)."""
    heads = [h.strip().upper() for h in pg.locator('#o-result thead th').all_inner_texts()]  # shown in capitals
    cell = pg.locator(f'{row_sel} td').nth(heads.index(header.upper())).inner_text()
    return int(cell.split()[0].lstrip('+') or 0)


def check_food(pg):
    """Food off by default; switched on it picks the best meal for the goal: the gear rows stay, the With food row is
    gear plus the Food row, the GCD line names the food, the choice is saved. A chosen meal without speed leaves speed
    alone. Left on, so walk_jobs checks every job with food."""
    set_job(pg, 'SGE')
    pg.locator('#sync').check()
    set_cap(pg, '123')
    set_number(pg, '#level', '50')
    wait_optimizer(pg)
    pg.select_option('#o-target', 'spd')
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'spd')
    food = pg.locator('#o-food')
    check(not food.is_checked(), 'Food is on by default')
    expect(pg.locator('#o-food-row')).to_have_count(0)
    gear_items = pg.locator('#o-result tbody td:nth-child(2) > span').all_inner_texts()
    food.check()
    expect(pg.locator('#o-food-row')).to_be_visible()
    expect(pg.locator('#o-food-row')).to_contain_text('best for the goal')
    check(pg.locator('#o-result tbody td:nth-child(2) > span').all_inner_texts()[: len(gear_items)] == gear_items, 'Food changed the gear')
    gear_spd = column_values(pg, '#o-result tr.total:not(#o-food-total)', 'SpS')
    bonus = column_values(pg, '#o-food-row', 'SpS')
    with_food = column_values(pg, '#o-food-total', 'SpS')
    check(bonus > 0 and with_food == gear_spd + bonus, f'Spell Speed with food {with_food} is not {gear_spd} + {bonus}')
    expect(pg.locator('#o-result .readout')).to_contain_text(f'{with_food} Spell Speed ({gear_spd} gear, {bonus} food)')
    expect(pg.locator('#o-effect')).to_contain_text('gear and food')
    expect(pg.locator('#o-food-note')).to_be_visible()
    wait_saved(pg, "s => s.opt.food === true && s.opt.foodPair === ''")
    pg.select_option('#o-food-pair', 'det+crit')
    expect(pg.locator('#o-food-row')).not_to_contain_text('best for the goal')
    check(column_values(pg, '#o-food-total', 'SpS') == gear_spd, 'a meal without speed changed Spell Speed')
    check(column_values(pg, '#o-food-row', 'DET') > 0, 'the Determination meal adds no Determination')
    wait_saved(pg, "s => s.opt.foodPair === 'det+crit'")
    check_no_bad_text(pg, 'food')
    pg.select_option('#o-food-pair', '')
    pg.select_option('#o-target', 'main')
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'main')


def wait_saved(pg, js_condition):
    """Wait until the (debounced) saved state satisfies a JS predicate over it, s => ..."""
    pg.wait_for_function(
        f"""k => {{ let s; try {{ s = JSON.parse(localStorage.getItem(k)); }} catch {{ return false; }}
        return !!s && ({js_condition})(s); }}""",
        arg=STORE_KEY,
    )


def check_reload_persists(pg):
    """Build a non-default state (job, cap, sync off, level, optimizer target, tiebreaks and gear groups, browser
    filters and gear groups, Piece stats slot and item level, Gear optimizer tab open), reload, and every part comes
    back: the inputs, the open tab and the same optimizer total. Nothing like a gear pool is saved."""
    job, lo, hi, lvl = 'DRG', 130, 135, 50  # not the default job, a different role from the other checks
    set_job(pg, job)
    fill_browser(pg, lo, hi, lvl)
    group_box(pg, 'b-groups', 'tomestone').uncheck()

    show_math(pg, 'piece')
    pg.select_option('#p-slot', 'body')
    pg.fill('#p-ilvl', '200')
    pg.locator('#p-ilvl').dispatch_event('change')
    set_cap(pg, '130')
    set_number(pg, '#level', '60')
    if pg.locator('#sync').is_checked():
        pg.locator('#sync').uncheck()
    expect(pg.locator('#cap')).to_be_disabled()  # no sync, so no cap to set
    wait_optimizer(pg)
    group_box(pg, 'o-gear', 'relic').uncheck()
    pg.select_option('#o-tb1', 'det')
    pg.select_option('#o-tb2', 'vit')
    pg.select_option('#o-target', 'crit')  # last, so the result below includes every change
    # the result is debounced: wait until it is for the new target before reading the total
    expect(pg.locator('#o-result')).to_have_attribute('data-target', 'crit')
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
        '#o-tb2': 'vit',
    }
    groups = {'o-gear': ticked(pg, 'o-gear'), 'b-groups': ticked(pg, 'b-groups')}
    check('relic' not in groups['o-gear'] and 'tomestone' in groups['o-gear'], f'optimizer groups before reload: {groups["o-gear"]}')
    check('tomestone' not in groups['b-groups'] and 'relic' in groups['b-groups'], f'browser groups before reload: {groups["b-groups"]}')
    for sel, v in inputs.items():
        check(field_value(pg, sel) == v, f'reload setup: {sel} is {field_value(pg, sel)!r} before reload, expected {v!r}')
    # wait for the debounced save of the last change, rather than sleeping
    wait_saved(
        pg,
        f"""s => s.job === '{job}' && s.cap === 130 && s.level === 60 && s.sync === false && s.tab === 'opt'
        && s.opt.target === 'crit' && s.opt.tb === 'det' && s.opt.tb2 === 'vit' && s.piece.slot === 'body'
        && s.piece.ilvl === 200 && s.opt.exclude.includes('relic') && s.browse.exclude.includes('tomestone')
        && !('pool' in s)""",
    )

    pg.reload()
    wait_ready(pg)
    selected = pg.get_attribute('[data-tab=opt]', 'aria-selected') == 'true'
    check(selected and pg.locator('#tab-opt').is_visible(), 'after reload the Gear optimizer tab is not the open tab')
    for sel, v in inputs.items():
        got = field_value(pg, sel)
        check(got == v, f'after reload {sel} is {got!r}, expected {v!r}')
    for where, want in groups.items():
        check(ticked(pg, where) == want, f'after reload the {where} groups are {ticked(pg, where)}, expected {want}')
    check(not pg.locator('#sync').is_checked(), 'after reload sync is on, expected off')
    wait_optimizer(pg)
    try:
        expect(total).to_have_text(before)
    except AssertionError:
        got = total.inner_text() if total.count() else 'no result'
        check(False, f'after reload the optimizer total is {got!r}, expected {before!r} as before reload')
    group_box(pg, 'o-gear', 'relic').check()
    show_tab(pg, 'browse')
    group_box(pg, 'b-groups', 'tomestone').check()
    pg.locator('#sync').check()  # leave sync on for the later checks
    expect(pg.locator('#cap')).to_be_enabled()
    check(pg.input_value('#cap') == '130', f'the cap is {pg.input_value("#cap")!r} after sync came back on, expected 130')


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
                'opt': {'target': 5, 'tb': None, 'tb2': 'x', 'exclude': 'pvp'},
                'poolFilter': 3,
                'pool': {'0': {'id': 'x'}},
            }
        ),
    ),
    # a save from the gear pool days, with broken pool items: the pool is dropped
    (
        'an old save with a broken pool',
        json.dumps({'job': 'SGE', 'tab': 'pool', 'pool': [None, 5, {'id': 3}, {'id': 'a', 'type': 'ring', 'ilvl': 'big'}]}),
    ),
]


def set_number(pg, sel, value):
    pg.fill(sel, value)
    pg.locator(sel).dispatch_event('change')


def set_cap(pg, value):
    """Turn item level sync on (the cap field is disabled while it is off) and set the cap."""
    if not pg.locator('#sync').is_checked():
        pg.locator('#sync').check()
    set_number(pg, '#cap', value)


def check_corrupted_storage(pg):
    """Invalid JSON, wrong-typed saved values or an old save with a gear pool: the page loads with the default settings
    and no JS error. The bad value is written from a separate blank page (same file:// storage), so no pending save of
    this page can overwrite it before the load."""
    blank = OUT / 'blank.html'
    blank.write_text('<!doctype html><title>blank</title>', encoding='utf-8')
    for what, raw in BAD_STORAGE:
        want_job = 'SGE' if what == 'an old save with a broken pool' else DEFAULT_JOB  # only that case stores a valid job
        defaults = {'#job': want_job, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL}
        if want_job:
            defaults.update({'#b-min': '', '#b-lvl': '100', '#o-target': 'main', '#o-tb1': '', '#o-tb2': ''})
        n_errors = len(errors)
        pg.goto(blank.as_uri())
        pg.evaluate('([k, v]) => localStorage.setItem(k, v)', [STORE_KEY, raw])
        pg.goto(PAGE.as_uri())
        wait_ready(pg)
        if want_job:
            expect(pg.locator('#tab-browse')).to_be_visible()  # the old Gear pool tab opens as the Gear browser
            expect(browser_rows(pg).first).to_be_visible()
            show_tab(pg, 'opt')
            expect(pg.locator('#o-result')).to_be_visible()
        else:
            expect(pg.locator('#no-job')).to_be_visible()
        for sel, v in defaults.items():
            got = field_value(pg, sel)
            check(got == v, f'stored {what}: {sel} is {got!r}, expected the default {v!r}')
        check(not pg.locator('#sync').is_checked(), f'stored {what}: sync is on, expected the default off')
        check_no_bad_text(pg, f'page loaded from stored {what}')
        check(len(errors) == n_errors, f'stored {what}: JS errors on load: {errors[n_errors:]}')
        # the page repairs storage: the next save holds valid state, with no pool
        job_js = f"'{want_job}'" if want_job else 'null'
        wait_saved(pg, f"s => s.job === {job_js} && !('pool' in s) && Array.isArray(s.opt.exclude)")


def check_reset(pg):
    """Reset to defaults asks with the browser's own dialog: Cancel keeps everything, OK restores every default."""
    set_job(pg, 'SGE')
    set_cap(pg, '200')
    fill_browser(pg, 100, '', 100)
    pg.fill('#b-q', 'Ring')
    wait_saved(pg, "s => s.browse.q === 'Ring' && +s.browse.min === 100")  # typed filters commit after a short wait
    messages = []

    def answer(accept):
        def on_dialog(d):
            messages.append(d.message)
            d.accept() if accept else d.dismiss()

        pg.once('dialog', on_dialog)

    answer(False)
    pg.click('#reset')
    expect(pg.locator('[data-job]')).to_have_attribute('data-job', 'SGE')
    check(pg.input_value('#cap') == '200', 'Cancel changed the cap')
    check(pg.input_value('#b-q') == 'Ring', 'Cancel changed the name filter')
    answer(True)
    pg.click('#reset')
    expect(pg.locator('#no-job')).to_be_visible()
    check(messages == ['Reset every setting to its default?'] * 2, f'reset dialog messages: {messages}')
    check(current_job(pg) == '', f'after reset the job is {current_job(pg)!r}, expected none')
    check(not pg.locator('#sync').is_checked(), 'after reset sync is on, expected off')
    for sel, v in {'#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL}.items():
        check(pg.input_value(sel) == v, f'after reset {sel} is {pg.input_value(sel)!r}, expected {v!r}')
    set_job(pg, 'SGE')
    show_tab(pg, 'browse')
    for sel in ('#b-q', '#b-min'):
        check(pg.input_value(sel) == '', f'after reset {sel} is {pg.input_value(sel)!r}, expected empty')
    set_cap(pg, '123')  # back to the caps the later checks expect
    set_number(pg, '#level', '50')


def check_cap_validation(pg):
    """With sync on, the cap field asks for a cap while empty and for a whole item level in range. The message sits
    under the field, so the label stays on one line and the cap input lines up with the synced level input."""
    pg.locator('#sync').check()
    expect(pg.locator('#cap-error')).to_have_text('Enter a sync cap')
    check(pg.get_attribute('#cap', 'aria-invalid') == 'true', 'an empty cap with sync on is not marked invalid')
    lay = pg.evaluate("""() => {
      const lab = document.querySelector('label[for=cap]'), top = s => document.querySelector(s).getBoundingClientRect().top;
      return { em: lab.getBoundingClientRect().height / parseFloat(getComputedStyle(lab).fontSize), dy: top('#cap') - top('#level') };
    }""")
    check(lay['em'] < 2, f'the sync cap label wraps ({lay["em"]:.1f} em high) while it asks for a cap')
    check(abs(lay['dy']) < 1, f'the cap input is {lay["dy"]:.0f} px off the synced level input')
    pg.fill('#cap', '9999')
    expect(pg.locator('#cap-error')).to_contain_text('Enter a whole item level from 1 to')
    pg.fill('#cap', '123')
    expect(pg.locator('#cap-error')).to_be_hidden()
    pg.locator('#sync').uncheck()


def exp_boxes(pg):
    """The Expansion dropdown's checkboxes, with the dropdown opened."""
    if pg.locator('#b-exp').get_attribute('aria-expanded') != 'true':
        pg.click('#b-exp')
    return pg.locator('#b-exp-menu input')


def all_expansions(pg):
    """Tick every expansion in the gear browser again, then close the dropdown."""
    for box in exp_boxes(pg).all():
        if not box.is_checked():
            box.check()
    pg.keyboard.press('Escape')


def check_expansion_filter(pg):
    """Every expansion is ticked by default; with only Endwalker ticked, the browser keeps gear of its equip level band
    (81 to 90) and the button names it; the choice is saved."""
    set_job(pg, 'WHM')
    fill_browser(pg, '', '', 100)
    expect(pg.locator('#b-exp')).to_have_text('All expansions')
    boxes = exp_boxes(pg)
    check(boxes.count() == 6 and all(b.is_checked() for b in boxes.all()), 'every expansion is ticked by default')
    for b in boxes.all():
        if b.get_attribute('data-exp') != 'EW':
            b.uncheck()
    pg.keyboard.press('Escape')
    expect(pg.locator('#b-exp-menu')).to_be_hidden()
    expect(pg.locator('#b-exp')).to_have_text('Endwalker')
    wait_saved(pg, "s => s.browse.expOff.join() === 'ARR,HW,SB,ShB,DT'")
    lv = pg.locator('#gear-table tbody tr td:nth-child(3)').all_inner_texts()
    check(lv and all(81 <= int(x) <= 90 for x in lv), f'Endwalker rows outside equip level 81-90: {sorted(set(lv))}')
    all_expansions(pg)


def check_pld_offhand(pg):
    """PLD (1H weapon + shield) offers an Off-hand slot in the browser; two-handed jobs do not."""
    set_job(pg, 'PLD')
    show_tab(pg, 'browse')
    opts = pg.locator('#b-type option').all_inner_texts()
    check('Off-hand' in opts, f'PLD slot filter has no Off-hand: {opts}')
    pg.screenshot(path=str(OUT / 'browser.png'), full_page=True)
    set_job(pg, 'WAR')
    opts = pg.locator('#b-type option').all_inner_texts()
    check('Off-hand' not in opts, f'WAR slot filter offers Off-hand: {opts}')


# Level sync: level 100 healer head pieces at item level 780 or more, at synced level 90 (item level sync off), are
# capped at the item level 660 head values; Mind 248 and the head substat cap 184 come from ItemLevel row 660 x 85 per
# mille (level-sync.test.js).
HEAD_MAIN_CAP_660 = 248
HEAD_SUB_CAP_660 = '184'


def check_level_sync(pg):
    """Synced level 90 with item level sync off, at 400 px: the gear browser shows the level-synced value, the
    optimizer total is marked synced, Sync limits shows the item level 660 caps; no bad text, no horizontal scroll."""
    pg.set_viewport_size({'width': 400, 'height': 800})
    set_job(pg, 'SGE')
    pg.locator('#sync').uncheck()
    set_number(pg, '#level', '90')
    fill_browser(pg, 780, '', 100, 'head')
    expect(browser_rows(pg).first).to_contain_text(f'→{HEAD_MAIN_CAP_660}')
    check_no_bad_text(pg, 'level sync/browse')
    wait_optimizer(pg)
    expect(pg.locator('#o-out .readout')).to_contain_text('synced')
    expect(opt_total(pg)).not_to_have_text('')
    check_no_bad_text(pg, 'level sync/opt')
    show_math(pg, 'sync')
    expect(pg.locator('#s-lead')).to_contain_text('synced to item level 660')
    head = next((r for r in table_rows(pg, '#s-table') if r[0] == 'Head'), None)
    check(head is not None and head[2] == HEAD_SUB_CAP_660, f'level 90 head substat cap {head and head[2]!r}, expected {HEAD_SUB_CAP_660}')
    show_math(pg, 'piece')
    check_no_bad_text(pg, 'level sync/piece')
    for where in ('browse', 'opt'):
        show_tab(pg, where)
        hs = pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        check(not hs, f'level sync: horizontal page scroll at 400 px ({where})')
    pg.screenshot(path=str(OUT / 'level-sync.png'), full_page=True)
    # back to the shared setup: level 50, sync to 123, no browser filters
    fill_browser(pg, '', '', 100)
    set_number(pg, '#level', '50')
    set_cap(pg, '123')
    pg.set_viewport_size({'width': 1000, 'height': 900})


def check_job_level_cap(pg):
    """Limited jobs: picking Blue Mage (level cap 80) or Beastmaster (50) clamps the synced level and the equip level
    filter to the cap, both inputs' maximum follows it, and a typed level above the cap is not taken."""
    set_job(pg, 'SGE')
    show_tab(pg, 'browse')
    set_number(pg, '#level', '100')
    set_number(pg, '#b-lvl', '100')
    for job, cap in (('BLU', '80'), ('BST', '50')):
        set_job(pg, job)
        for sel in ('#level', '#b-lvl'):
            expect(pg.locator(sel)).to_have_value(cap)
            check(pg.get_attribute(sel, 'max') == cap, f'{job}: {sel} max is {pg.get_attribute(sel, "max")!r}, expected {cap}')
    wait_saved(pg, "s => s.job === 'BST' && s.level === 50")
    set_number(pg, '#level', '70')
    pg.wait_for_timeout(400)  # longer than the save debounce
    level = pg.evaluate(f'JSON.parse(localStorage.getItem("{STORE_KEY}")).level')
    check(level == 50, f'BST: a typed level 70 was taken (saved level {level!r})')
    set_number(pg, '#level', '40')
    wait_saved(pg, 's => s.level === 40')
    set_number(pg, '#level', '50')  # the shared setup
    set_job(pg, 'SGE')


def check_no_bad_text(pg, where):
    txt = pg.inner_text('body')
    for bad in BAD_WORDS:
        check(bad not in txt, f'"{bad}" visible in {where}')


def walk_jobs(pg):
    """Every tab for each job: no undefined/NaN/null text, correct sync caps, page fits 400 px."""
    pg.set_viewport_size({'width': 400, 'height': 800})
    set_cap(pg, '123')  # check_sync_caps expects the item level 123 caps
    set_number(pg, '#level', '50')
    for job in JOBS:
        set_job(pg, job)
        show_tab(pg, 'browse')
        expect(pg.locator('#b-count')).not_to_have_text('')
        check_no_bad_text(pg, f'{job}/browse')
        wait_optimizer(pg)
        expect(pg.locator('#o-count')).to_contain_text(' pieces.')
        check_no_bad_text(pg, f'{job}/opt')
        expect(pg.locator('#o-food-row')).to_be_visible()  # check_food left Food on
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
        check(pg.title() == 'Gear Sync Analysis', f'title is {pg.title()!r}')
        for sel, v in {'#job': DEFAULT_JOB, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL}.items():
            check(field_value(pg, sel) == v, f'default {sel} is {field_value(pg, sel)!r}, expected {v!r}')
        check(not pg.locator('#sync').is_checked(), 'sync is on by default')
        check(pg.locator('#cap').is_disabled(), 'the cap field is enabled while sync is off')
        expect(pg.locator('#no-job')).to_be_visible()  # no job yet: no gear table
        check_cap_validation(pg)

        steps = [
            check_piece_lab,
            check_wiki_validation,
            check_real_gear_optimizer,
            check_typing_debounce,
            check_job_switch,
            check_ring_copies,
            check_gear_groups,
            check_melds,
            check_expansion_filter,
            check_reload_persists,
            check_corrupted_storage,
            check_reset,
            check_pld_offhand,
            check_level_sync,
            check_job_level_cap,
            check_food,
            walk_jobs,
        ]
        set_job(pg, 'SGE')
        set_cap(pg, '123')  # the checks below use the item level 123 caps
        set_number(pg, '#level', '50')
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
