"""Check our synced stats against xivgear's, every piece, job and sync setting.

xivgear (github.com/xiv-gear-planner/gear-planner) runs its own TypeScript core under its own test runner in the clone
fetch.py made; our core is bundled from scripts/validate/xivgear/ours.js and loaded into that process, so both tools
compute each stat side by side (xg_sync_test.ts). For every job, every piece both tools have, and the 139 sync settings
of settings.json (the duty syncs the ffxiv-gearing check uses), each stat is compared and every difference is tagged
with the known cause it matches (ours.js). Pass: no difference tagged 'unexplained' or 'target'.

Their item data comes from their data API (data.xivgear.app), cached per URL in data/xivgear-cache: the first run
fetches, later runs are offline. Delete the cache to re-read the API.

Output: scripts/validate/out/xivgear/<job>.json per job and scripts/validate/out/xivgear.json (all jobs), and a summary.

Run: python scripts/validate/xivgear/fetch.py (once), then python scripts/validate/xivgear/run.py [--jobs SGE,PLD]
"""

import argparse
import functools
import json
import os
import shutil
import subprocess
from collections import Counter
from pathlib import Path

print = functools.partial(print, flush=True)

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CLONE = ROOT / 'data' / 'xivgear'
CORE = CLONE / 'packages' / 'core'
CACHE = ROOT / 'data' / 'xivgear-cache'
OUT = ROOT / 'scripts' / 'validate' / 'out'
BUNDLE = OUT / 'xivgear-ours.cjs'
TEST = CORE / 'src' / 'test' / 'zz_gear_sync_analysis_test.ts'
JOBS = 'PLD WAR DRK GNB WHM SCH AST SGE MNK DRG SAM RPR NIN VPR BRD MCH DNC BLM SMN RDM PCT BLU BST'.split()
# X1 (level sync item level) and X2 (level-scaling gear) are corrected on their side before comparing (ours.js)
PASS_TAGS = {'X3', 'D1', 'D2'}


def bundle():
    script = (
        "import('esbuild').then(e => e.build({entryPoints: [process.argv[1]], bundle: true, format: 'cjs', "
        "platform: 'node', target: 'node18', outfile: process.argv[2], logLevel: 'warning'}))"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node', '-e', script, str(HERE / 'ours.js'), str(BUNDLE)], cwd=ROOT, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', default=','.join(JOBS))
    args = ap.parse_args()
    jobs = args.jobs.split(',')
    if not (CORE / 'node_modules').exists():
        raise SystemExit('No xivgear clone. Run: python scripts/validate/xivgear/fetch.py')
    bundle()
    shutil.copyfile(HERE / 'xg_sync_test.ts', TEST)
    out_dir = OUT / 'xivgear'
    out_dir.mkdir(parents=True, exist_ok=True)
    levels = sorted({lv for lv, _ in json.loads((HERE / 'settings.json').read_text(encoding='utf-8'))['settings']})
    base = {
        **os.environ,
        'XG_OURS': str(BUNDLE),
        'XG_OUT': str(out_dir),
        'XG_CACHE': str(CACHE),
        'XG_SETTINGS': str(HERE / 'settings.json'),
    }
    npx = shutil.which('npx')
    if not npx:
        raise SystemExit('npx not found')
    cmd = [npx, 'ts-mocha', '--no-experimental-strip-types', '--timeout', '0', '--exit', str(TEST.relative_to(CORE))]
    for j in jobs:  # only the jobs run now; the others keep their last results
        for f in out_dir.glob(f'{j}-*.json'):
            f.unlink()
    try:
        # one process per job and level: their data managers are not freed between settings
        for j in jobs:
            for lv in levels:
                subprocess.run(cmd, cwd=CORE, check=True, env={**base, 'XG_JOBS': j, 'XG_LEVEL': str(lv)}, stdout=subprocess.DEVNULL)
    finally:
        TEST.unlink(missing_ok=True)
    report = {'jobs': {}}
    for j in JOBS:  # every job with results, including ones not run this time
        parts = [
            json.loads(f.read_text(encoding='utf-8')) for f in sorted(out_dir.glob(f'{j}-*.json'), key=lambda f: int(f.stem.split('-')[1]))
        ]
        if parts:
            report['jobs'][j] = {'job': j, 'pieces': parts[0]['pieces'], 'settings': [s for p in parts for s in p['settings']]}
    (OUT / 'xivgear.json').write_text(json.dumps(report), encoding='utf-8')
    tags, stats, equal, pieces, fixed = Counter(), 0, 0, 0, Counter()
    for j, r in report['jobs'].items():
        t = Counter()
        for s in r['settings']:
            t.update(s['tags'])
            fixed.update(s.get('corrected', {}))
            stats += s['stats']
            equal += s['equal']
            pieces += s['pieces']
        tags.update(t)
        s0 = r['settings'][0]
        print(
            f'{j}: {s0["pieces"]} pieces in both, {s0["oursOnly"]} only ours, {s0["theirsOnly"]} only theirs; '
            f'differences {dict(t) or "none"}'
        )
    print(f'\n{pieces:,} piece checks, {stats:,} stats compared, {equal:,} equal ({equal / max(stats, 1):.4%})')
    print(f'  pieces re-synced on their side first: {dict(fixed) or "none"} (X1 level item level, X2 scaling gear)')
    for k, v in sorted(tags.items()):
        print(f'  {k}: {v:,}')
    bad = {k: v for k, v in tags.items() if k not in PASS_TAGS}
    print('PASS: every difference has a known cause' if not bad else f'FAIL: {bad}')
    if bad:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
