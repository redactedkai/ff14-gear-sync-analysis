"""Browser timing of the gear optimizer (stress-test plan, docs/scratchpad/perf/plan.md, section 3, P4).

Loads dist/index.html from file:// in Chromium (Playwright) and reads the page's User Timing measures:
'optimizer' (one optimizer run: src/ui/components/optimizer.js) and 'save' (serializing the saved state: src/main.js).

  1. seed: picks a job, adds every database piece it can wear ("Add all matches", the largest pool), opens the Gear
     optimizer; then switches to the next job and does it again (a job switch with add-all). Keeps each saved state.
  2. cold: a fresh browser context per run, with the saved state already in localStorage, so the page opens straight
     on the optimizer with a full pool: the first optimizer run is fully cold (no compiled code, no caches).
  3. warm: in that page, cycles the target stat and times each run, and the settle time (change -> result shown,
     minus the 120 ms debounce).
  4. memory: 100 target changes, JS heap before and after (with garbage collection).
Each at CPU throttle 1x (this machine), 4x and 6x (Chrome DevTools' slow-device emulation).

Run: npm run build && python scripts/perf/browser.py [--runs 5] [--jobs PLD,SGE]
"""

import argparse
import functools
import json
import statistics
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

print = functools.partial(print, flush=True)  # progress shows while the run goes, even into a file

ROOT = Path(__file__).resolve().parents[2]
PAGE = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'scripts' / 'perf' / 'out'
STORE_KEY = 'ilvl-stat-lab-v4'  # src/ui/state.js
DEBOUNCE_MS = 120  # src/ui/components/optimizer.js
TIMEOUT = 120_000

# long tasks (main thread blocked over 50 ms), recorded from the first moment of every page
LONGTASKS = """
window.__long = [];
try {
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); })
    .observe({ type: 'longtask', buffered: true });
} catch (e) {}
"""


def measures(pg, name):
    return pg.evaluate(f"performance.getEntriesByName('{name}').map(e => e.duration)")


def throttle(pg, rate):
    cdp = pg.context.new_cdp_session(pg)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
    return cdp


def wait_measure(pg, name, count):
    pg.wait_for_function(f"performance.getEntriesByName('{name}').length >= {count}", timeout=TIMEOUT)


def show_tab(pg, tab):
    pg.click(f'[data-tab={tab}]')
    expect(pg.locator(f'#tab-{tab}')).to_be_visible()


def set_job(pg, job):
    pg.click(f'[data-job-id="{job}"]')
    if pg.locator('#job-warning').count():
        pg.click('#job-confirm')
    expect(pg.locator('[data-job]')).to_have_attribute('data-job', job)


def add_all(pg):
    """Every database piece the job can wear: no filter, then Add all. Returns (pool size, ms from click to the
    pool count shown)."""
    show_tab(pg, 'pool')
    pg.click('#show-all')
    pg.fill('#b-q', '')
    pg.select_option('#b-type', 'any')
    for sel in ('#b-min', '#b-max', '#b-lvl'):
        pg.fill(sel, '')
    expect(pg.locator('#b-addall')).to_be_enabled()
    t0 = pg.evaluate('performance.now()')
    pg.click('#b-addall')
    pg.wait_for_function("!/\\(0\\)/.test(document.querySelector('#show-pool').textContent)", timeout=TIMEOUT)
    t1 = pg.evaluate('performance.now()')
    n = int(pg.locator('#show-pool').inner_text().split('(')[1].rstrip(')').replace(',', ''))
    return n, t1 - t0


def saved_state(pg, n):
    """The saved state once the save debounce has written the full pool."""
    check = (
        f"(() => {{ try {{ const s = JSON.parse(localStorage.getItem('{STORE_KEY}')); "
        f"return s.pool.length === {n} && s.tab === 'opt'; }} catch (e) {{ return false; }} }})()"
    )
    pg.wait_for_function(check, timeout=TIMEOUT)
    return pg.evaluate(f"localStorage.getItem('{STORE_KEY}')")


def seed(browser, jobs, rate):
    """Fill each job's full pool through the UI; the second job onward is a job switch with add-all."""
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script(LONGTASKS)
    pg = ctx.new_page()
    pg.goto(PAGE)
    throttle(pg, rate)
    expect(pg.locator('[data-job-id]').first).to_be_attached()
    states, rows = {}, []
    for job in jobs:
        # from the pool tab, so the optimizer does not also run on the pool the job switch empties
        if pg.locator('[data-tab=pool]').is_visible():  # no tabs before the first job is picked
            show_tab(pg, 'pool')
        t_job = pg.evaluate('performance.now()')
        set_job(pg, job)
        n, add_ms = add_all(pg)
        before = len(measures(pg, 'optimizer'))
        show_tab(pg, 'opt')
        wait_measure(pg, 'optimizer', before + 1)
        expect(pg.locator('#o-out .panel')).to_be_visible()
        total = pg.evaluate('performance.now()') - t_job
        opt = measures(pg, 'optimizer')[-1]
        rows.append({'job': job, 'pool': n, 'add_all_ms': add_ms, 'optimizer_ms': opt, 'switch_total_ms': total})
        states[job] = saved_state(pg, n)
    save = max(measures(pg, 'save') or [0])
    long_max = max(pg.evaluate('window.__long') or [0])
    ctx.close()
    return states, rows, save, long_max


def cold_and_warm(browser, state, rate, targets, warm):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script(LONGTASKS)
    ctx.add_init_script(f'try {{ localStorage.setItem({json.dumps(STORE_KEY)}, {json.dumps(state)}); }} catch (e) {{}}')
    pg = ctx.new_page()
    cdp = throttle(pg, rate)  # before navigation, so page start-up is throttled too
    pg.goto(PAGE)
    wait_measure(pg, 'optimizer', 1)
    expect(pg.locator('#o-out .panel')).to_be_visible()
    shown = pg.evaluate('performance.now()')  # since navigation start
    cold = measures(pg, 'optimizer')[0]
    out = {'cold_ms': cold, 'load_to_result_ms': shown}
    if warm:
        runs, settles = [], []
        for t in targets:
            before = len(measures(pg, 'optimizer'))
            t0 = pg.evaluate('performance.now()')
            pg.select_option('#o-target', t)
            wait_measure(pg, 'optimizer', before + 1)
            pg.wait_for_function(f"document.querySelector('#o-result')?.dataset.target === '{t}'", timeout=TIMEOUT)
            settles.append(pg.evaluate('performance.now()') - t0 - DEBOUNCE_MS)
            runs.append(measures(pg, 'optimizer')[-1])
        out['warm_ms'] = runs
        out['settle_ms'] = settles
        # memory: 100 more target changes, heap before and after garbage collection
        cdp.send('HeapProfiler.enable')
        cdp.send('HeapProfiler.collectGarbage')
        h0 = pg.evaluate('performance.memory.usedJSHeapSize')
        for i in range(100):
            t = targets[i % len(targets)]
            before = len(measures(pg, 'optimizer'))
            pg.select_option('#o-target', t)
            wait_measure(pg, 'optimizer', before + 1)
        cdp.send('HeapProfiler.collectGarbage')
        h1 = pg.evaluate('performance.memory.usedJSHeapSize')
        out['heap_mb'] = (h0 / 2**20, h1 / 2**20)
    out['longtask_max_ms'] = max(pg.evaluate('window.__long') or [0])
    ctx.close()
    return out


def fmt(xs):
    return f'median {statistics.median(xs):.0f}, max {max(xs):.0f}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=5)
    ap.add_argument('--jobs', default='PLD,SGE')
    ap.add_argument('--rates', default='1,4,6')
    a = ap.parse_args()
    jobs = a.jobs.split(',')
    rates = [int(r) for r in a.rates.split(',')]
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        states, _, _, _ = seed(browser, jobs, 1)
        for rate in rates:
            print(f'\nCPU {rate}x' + (' (this machine)' if rate == 1 else ' slower'))
            _, rows, save, long_max = seed(browser, jobs, rate)
            for r in rows:
                print(
                    f'  job switch to {r["job"]} + add all ({r["pool"]:,} pieces): add all {r["add_all_ms"]:.0f} ms, '
                    f'optimizer {r["optimizer_ms"]:.0f} ms, click to result {r["switch_total_ms"]:.0f} ms'
                )
            print(f'  slowest save {save:.0f} ms, longest blocked main thread {long_max:.0f} ms')
            for job in jobs:
                targets = ['crit', 'det', 'dh', 'spd', 'main']
                runs = [cold_and_warm(browser, states[job], rate, targets, warm=(i == 0)) for i in range(a.runs)]
                cold = [r['cold_ms'] for r in runs]
                load = [r['load_to_result_ms'] for r in runs]
                w = runs[0]
                print(f'  {job}: cold optimizer run {fmt(cold)} ms; page open to result {fmt(load)} ms')
                print(
                    f'  {job}: warm runs {fmt(w["warm_ms"])} ms; settle after a change {fmt(w["settle_ms"])} ms '
                    f'beyond the {DEBOUNCE_MS} ms wait; heap {w["heap_mb"][0]:.1f} -> {w["heap_mb"][1]:.1f} MB after 100 changes; '
                    f'longest blocked main thread {max(r["longtask_max_ms"] for r in runs):.0f} ms'
                )
                results.append({'rate': rate, 'job': job, 'runs': runs, 'switch': rows, 'save_ms': save})
        browser.close()
    (OUT / 'browser.json').write_text(json.dumps(results, indent=1))


if __name__ == '__main__':
    main()
