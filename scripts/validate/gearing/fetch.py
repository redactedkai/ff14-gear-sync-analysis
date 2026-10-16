"""Clone ffxiv-gearing at the pinned commit into data/ffxiv-gearing and build its page (for run.mjs --site local).

Their code is third-party: dependencies are installed with --ignore-scripts, and only their own build runs. Needs git
and Node. Re-pin COMMIT (and run.mjs DATA_VERSION) to check against a newer version.

Run: python scripts/validate/gearing/fetch.py
"""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CLONE = ROOT / 'data' / 'ffxiv-gearing'
REPO = 'https://github.com/Asvel/ffxiv-gearing.git'
COMMIT = '8d75ef8'  # 2026-10-13, "Update game data to 7.57."


def run(*cmd):
    subprocess.run(cmd, cwd=CLONE, check=True, shell=False)


def main():
    npm = shutil.which('npm')
    if not npm:
        raise SystemExit('npm not found')
    if not (CLONE / '.git').exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '-q', REPO, str(CLONE)], check=True)
    run('git', 'fetch', '-q', 'origin')
    run('git', 'checkout', '-q', COMMIT)
    run(npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
    run(npm, 'run', 'build')
    print(f'Built {CLONE / "dist"} at {COMMIT}')


if __name__ == '__main__':
    main()
