"""Check our synced stats against ffxiv-gearing's, every piece, job and sync setting (roadmap A5).

ffxiv-gearing (github.com/Asvel/ffxiv-gearing) runs its own code in its own page; our core is bundled from
scripts/validate/gearing/ours.js and injected into that page, so both tools compute each stat side by side. For every
job, every database piece it can wear, and every sync setting ffxiv-gearing offers (each job level 50 to 100 up to the
job's cap, "level only" and each duty item level it lists), each stat is compared and every difference is tagged with
the known cause it matches (ours.js). Pass: no difference tagged 'unexplained' or 'target'.

  --site local  their page built from the pinned clone (fetch.py), served from data/ffxiv-gearing/dist (default)
  --site live   their published page, https://asvel.github.io/ffxiv-gearing/ (one page load per job)

Output: scripts/validate/out/gearing-<site>.json (counts per job and setting, examples of each tag, every unexplained
difference) and a summary on stdout. With both files present, a live run also reports whether the two agree.

Run: python scripts/validate/gearing/fetch.py (once), then python scripts/validate/gearing/run.py [--site live] [--jobs SGE,PLD]
"""

import argparse
import functools
import http.server
import json
import subprocess
import threading
from collections import Counter
from pathlib import Path

from playwright.sync_api import sync_playwright

print = functools.partial(print, flush=True)

ROOT = Path(__file__).resolve().parents[3]
CLONE = ROOT / 'data' / 'ffxiv-gearing'
OUT = ROOT / 'scripts' / 'validate' / 'out'
BUNDLE = OUT / 'gearing-ours.js'
LIVE_URL = 'https://asvel.github.io/ffxiv-gearing/'
DATA_VERSION = '7.57'  # the data version the pinned commit carries (fetch.py COMMIT); the live page must show it too
JOBS = 'PLD WAR DRK GNB WHM SCH AST SGE MNK DRG SAM RPR NIN VPR BRD MCH DNC BLM SMN RDM PCT BLU BST'.split()
TIMEOUT = 120_000
# D3 (level-scaling gear) fixed on our side; D4 (tank Main Attribute) and D6 (bonus stats) corrected on theirs
PASS_TAGS = {'D1', 'D2', 'D5'}


def bundle():
    script = (
        "import('esbuild').then(e => e.build({entryPoints: [process.argv[1]], bundle: true, format: 'iife', "
        "target: 'es2020', outfile: process.argv[2], logLevel: 'warning'}))"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', '-e', script, str(ROOT / 'scripts' / 'validate' / 'gearing' / 'ours.js'), str(BUNDLE)], cwd=ROOT, check=True)


def serve(directory):
    """Serve `directory` on a free local port in a background thread. Returns (server, url)."""
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}/'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def open_page(browser, url):
    pg = browser.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(url)
    pg.wait_for_function('window.store !== undefined && window.game !== undefined', timeout=TIMEOUT)
    version = pg.evaluate(f"document.body.innerText.includes('{DATA_VERSION}')")
    if not version:
        raise SystemExit(f'{url}: the page does not show data version {DATA_VERSION}; re-pin fetch.py and DATA_VERSION')
    pg.add_script_tag(path=str(BUNDLE))
    return pg, errors


def run_job(browser, url, job):
    pg, errors = open_page(browser, url)
    counts = pg.evaluate('job => OURS.setup(window.store, window.game, job)', job)
    settings = pg.evaluate('job => OURS.settings(window.game, job)', job)
    results = [pg.evaluate('([job, l, c]) => OURS.compare(window.store, job, l, c)', [job, level, cap]) for level, cap in settings]
    pg.close()
    if errors:
        raise SystemExit(f'{job}: page errors: {errors[:3]}')
    return {**counts, 'settings': results}


def summarize(report):
    tags, stats, equal, pieces, bonus = Counter(), 0, 0, 0, 0
    for job in report['jobs'].values():
        for s in job['settings']:
            tags.update(s['tags'])
            stats += s['stats']
            equal += s['equal']
            pieces += s['pieces']
            bonus += s.get('bonus', 0)
    return tags, stats, equal, pieces, bonus


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', choices=('local', 'live'), default='local')
    ap.add_argument('--jobs', default=','.join(JOBS))
    args = ap.parse_args()
    jobs = args.jobs.split(',')
    bundle()
    server = None
    if args.site == 'local':
        if not (CLONE / 'dist' / 'index.html').exists():
            raise SystemExit('No local build of ffxiv-gearing. Run: python scripts/validate/gearing/fetch.py')
        server, url = serve(CLONE / 'dist')
    else:
        url = LIVE_URL
    report = {'site': args.site, 'url': url, 'dataVersion': DATA_VERSION, 'jobs': {}}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg, errors = open_page(browser, url)
        caps = report['caps'] = pg.evaluate('OURS.capsSweep(window.game)')
        pg.close()
        print(
            f'caps: {caps["levels"]} item levels, {caps["compared"]:,} caps compared, {caps["equal"]:,} equal, '
            f'{caps["off1"]:,} off by 1, {caps["more"]:,} off by more; [compared, differing] {caps["byGroup"]}'
        )
        for job in jobs:
            r = run_job(browser, url, job)
            report['jobs'][job] = r
            t = Counter()
            for s in r['settings']:
                t.update(s['tags'])
            print(
                f'{job}: {r["ours"]} pieces ({r["theirs"]} in their data, {r["notWearable"]} not wearable there), '
                f'{len(r["settings"])} settings, differences {dict(t) or "none"}'
            )
        browser.close()
    if server:
        server.shutdown()
    out = OUT / f'gearing-{args.site}.json'
    out.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    tags, stats, equal, pieces, bonus = summarize(report)
    print(f'\n{pieces:,} piece checks, {stats:,} stats compared, {equal:,} equal ({equal / stats:.4%})')
    print(f'  their Crucible / Occult bonus taken off before comparing (D6): {bonus:,} stats')
    for k, v in sorted(tags.items()):
        print(f'  {k}: {v:,}')
    bad = {k: v for k, v in tags.items() if k not in PASS_TAGS}
    print('PASS: every difference has a known cause' if not bad else f'FAIL: {bad}')
    other = OUT / f'gearing-{"local" if args.site == "live" else "live"}.json'
    if other.exists():
        o = json.loads(other.read_text(encoding='utf-8'))
        same = all(o['jobs'].get(j, {}).get('settings') == report['jobs'][j]['settings'] for j in jobs)
        print(f'{other.name}: {"same results" if same else "DIFFERENT results"} for these jobs')
    if bad:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
