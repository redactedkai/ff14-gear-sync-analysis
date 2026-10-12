#!/usr/bin/env python3
"""Fetch what the generators need into data/:

- the datamining CSVs (sparse, shallow clone) into data/ffxiv-datamining;
- the game's framed job icons (the square, role-coloured ones) into data/icons/<JOB>.png. The datamining CSVs hold no
  image files, so these come from xivapi's asset endpoint, which converts the game's own icon textures. Icon number =
  62100 + the job's ClassJob row (Paladin, row 19, is icon 062119), for every job in src/core/item-format.json.

Re-run after a game patch to pull the new sheets and icons, then `python scripts/data/regen.py`.
"""

import subprocess
import sys
import urllib.request
from pathlib import Path

import gear_sources
from item_format import load_format, read_csv

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'data' / 'ffxiv-datamining'
URL = 'https://github.com/xivapi/ffxiv-datamining.git'
FILES = ['Item', 'ItemLevel', 'ParamGrow', 'BaseParam', 'ClassJobCategory', 'EquipSlotCategory', 'ClassJob', *gear_sources.FILES]
ICON_DIR = ROOT / 'data' / 'icons'
USER_AGENT = 'ff14-gear-sync-analysis data fetch (+https://github.com/redactedkai/ff14-gear-sync-analysis)'
FRAMED_JOB_ICON = 62100  # + ClassJob row
ICON_URL = 'https://v2.xivapi.com/api/asset?path=ui/icon/{folder:06d}/{icon:06d}_hr1.tex&format=png'  # _hr1: 64 x 64


def git(*args, cwd=None):
    subprocess.run(['git', *args], cwd=cwd, check=True)


def icon_url(icon):
    return ICON_URL.format(folder=icon // 1000 * 1000, icon=icon)


def job_icon_numbers(csv_dir):
    """{job: icon number} for every job in item-format.json, from ClassJob.csv."""
    rows = {r['Abbreviation']: int(r['#']) for r in read_csv(Path(csv_dir) / 'ClassJob.csv', ['#', 'Abbreviation'])}
    missing = [j for j in load_format()['jobs'] if j not in rows]
    if missing:
        sys.exit(f'ClassJob.csv has no row for {missing}')
    return {j: FRAMED_JOB_ICON + rows[j] for j in load_format()['jobs']}


def fetch_icons(csv_dir):
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for job, icon in job_icon_numbers(csv_dir).items():
        req = urllib.request.Request(icon_url(icon), headers={'User-Agent': USER_AGENT})  # the default one is refused
        with urllib.request.urlopen(req, timeout=30) as r:
            (ICON_DIR / f'{job}.png').write_bytes(r.read())
    print('Icon dir:', ICON_DIR)


def main():
    if not (DEST / '.git').exists():
        DEST.parent.mkdir(exist_ok=True)
        git('clone', '--depth', '1', '--filter=blob:none', '--sparse', URL, str(DEST))
    else:
        git('pull', '--ff-only', cwd=DEST)
    # every run, so a clone made before a sheet was added to FILES picks it up
    git('sparse-checkout', 'set', '--no-cone', *[f'/csv/en/{f}.csv' for f in FILES], cwd=DEST)
    missing = [f for f in FILES if not (DEST / 'csv' / 'en' / f'{f}.csv').exists()]
    if missing:
        sys.exit(f'missing CSVs after fetch: {missing}')
    print('CSV dir:', DEST / 'csv' / 'en')
    fetch_icons(DEST / 'csv' / 'en')


if __name__ == '__main__':
    main()
