"""Clone xivgear (gear-planner) at the pinned commit into data/xivgear and install its dependencies (for run.py).

Their code is third-party: dependencies are installed with --ignore-scripts, and only their TypeScript core runs, under
their own test runner (ts-mocha). pnpm comes through npx at the version their package.json names. Needs git and Node.
Re-pin COMMIT to check against a newer version. Item data is not part of the clone: run.py reads it from xivgear's data
API (data.xivgear.app) and caches each response in data/xivgear-cache, so later runs work offline.

Run: python scripts/validate/xivgear/fetch.py
"""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CLONE = ROOT / 'data' / 'xivgear'
REPO = 'https://github.com/xiv-gear-planner/gear-planner.git'
COMMIT = '6c3c878e708b9d98f1c4cb091723a2a0a6343603'  # 2026-10-11, "Use specific items endpoint for basedata. (#963)"; main on 2026-10-16
PNPM = 'pnpm@9.12.3'  # package.json packageManager at COMMIT


def run(*cmd):
    subprocess.run(cmd, cwd=CLONE, check=True, shell=False)


def main():
    npx = shutil.which('npx')
    if not npx:
        raise SystemExit('npx not found')
    if not (CLONE / '.git').exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '-q', REPO, str(CLONE)], check=True)
    run('git', 'fetch', '-q', 'origin')
    run('git', 'checkout', '-q', COMMIT)
    run(npx, '--yes', PNPM, 'install', '--frozen-lockfile', '--ignore-scripts')
    print(f'Installed {CLONE} at {COMMIT}')


if __name__ == '__main__':
    main()
