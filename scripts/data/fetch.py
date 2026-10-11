#!/usr/bin/env python3
"""Fetch only the datamining CSVs this project needs (sparse, shallow clone) into data/ffxiv-datamining.

Re-run after a game patch to pull the new sheets, then `python scripts/data/regen.py`.
"""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'data' / 'ffxiv-datamining'
URL = 'https://github.com/xivapi/ffxiv-datamining.git'
FILES = ['Item', 'ItemLevel', 'ParamGrow', 'BaseParam', 'ClassJobCategory', 'EquipSlotCategory']

def git(*args, cwd=None):
    subprocess.run(['git', *args], cwd=cwd, check=True)

def main():
    if not (DEST / '.git').exists():
        DEST.parent.mkdir(exist_ok=True)
        git('clone', '--depth', '1', '--filter=blob:none', '--sparse', URL, str(DEST))
        git('sparse-checkout', 'set', '--no-cone', *[f'/csv/en/{f}.csv' for f in FILES], cwd=DEST)
    else:
        git('pull', '--ff-only', cwd=DEST)
    missing = [f for f in FILES if not (DEST / 'csv' / 'en' / f'{f}.csv').exists()]
    if missing:
        sys.exit(f'missing CSVs after fetch: {missing}')
    print('CSV dir:', DEST / 'csv' / 'en')

if __name__ == '__main__':
    main()
