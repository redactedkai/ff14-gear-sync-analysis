"""Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 400 px. Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) and the FFXIV Wiki's item level 475 caps;
  - the real Dreadwyrm "of Healing" set (item level 130): Spell Speed 171 synced to 123, 176 unsynced;
  - a 130 head piece (Spell Speed / Piety / Direct Hit) reproducing the real Dreadwyrm Hood of Healing.

Setup once: pip install playwright && python -m playwright install chromium
Run: npm run build && python tests/e2e/smoke.py
"""

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
    pg.select_option('#job', job)
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
    """Body rows of a table (CSS selector or Locator) as lists of cell texts."""
    table = pg.locator(selector) if isinstance(selector, str) else selector
    return table.locator('tbody tr').evaluate_all('rows => rows.map(r => Array.from(r.cells, c => c.innerText.trim()))')


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
    """SGE, ilvl 130 head, Spell Speed / Piety / Direct Hit = the real Dreadwyrm Hood of Healing."""
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


def check_dreadwyrm_optimizer(pg):
    """Add the 9 Dreadwyrm 'of Healing' pieces; best Spell Speed is 171 synced to 123, 176 unsynced."""
    show_tab(pg, 'pool')
    pg.fill('#b-q', 'Dreadwyrm')
    pg.fill('#b-min', '130')
    pg.fill('#b-max', '130')
    pg.fill('#b-lvl', '50')
    expect(pg.locator('#b-count')).to_have_text('9 matches')
    names = [r[0] for r in table_rows(pg, '#b-table')]
    check(len(names) == 9 and all(n.endswith('of Healing') for n in names), f'Dreadwyrm browse rows are not the 9 Healing pieces: {names}')
    pg.click('#b-addall')
    expect(pg.locator('#b-count')).to_contain_text('Added 9 items')
    expect(pg.locator('#pool-table tbody tr')).to_have_count(9)

    wait_optimizer(pg)
    pg.select_option('#o-target', 'spd')
    if pg.locator('#o-avg').is_checked():  # the set has no weapon, so drop the average item level requirement
        pg.locator('#o-avg').uncheck()
    total = pg.locator('#o-out .readout > div').first.locator('b')
    try:
        expect(total).to_have_text('171')
    except AssertionError:
        check(False, f'Dreadwyrm synced Spell Speed {total.inner_text()!r}, expected 171')
    check('Spell Speed' in pg.locator('#o-out h3').inner_text(), 'optimizer heading does not name Spell Speed')
    pg.screenshot(path=str(OUT / 'optimizer.png'), full_page=True)

    pg.locator('#sync').uncheck()
    try:
        expect(total).to_have_text('176')
    except AssertionError:
        check(False, f'Dreadwyrm unsynced Spell Speed {total.inner_text()!r}, expected 176')
    pg.locator('#sync').check()
    # the ceiling table renders for a non-empty pool
    expect(pg.locator('#o-ceil table')).to_be_visible()


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

    errors = []
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

        steps = [check_piece_lab, check_wiki_validation, check_dreadwyrm_optimizer, check_pld_offhand, walk_jobs]
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
