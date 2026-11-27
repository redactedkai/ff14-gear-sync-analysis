#!/usr/bin/env python3
"""Fetch what the generators need into data/:

- the datamining CSVs (sparse, shallow clone) into data/ffxiv-datamining;
- the patch list (patchlist.json: each patch with its release date, a sparse, shallow clone of
  xivapi/ffxiv-datamining-patches) into data/ffxiv-datamining-patches;
- the game's framed job icons (the square, role-coloured ones) into data/icons/<JOB>.png. The datamining CSVs hold no
  image files, so these come from xivapi's asset endpoint, which converts the game's own icon textures. Icon number =
  62100 + the job's ClassJob row (Paladin, row 19, is icon 062119), for every job in src/core/item-format.json.

Re-run after a game patch to pull the new sheets and icons, then `python scripts/data/regen.py`. With
`--commit <sha>` it checks out that datamining commit instead of the newest one, to reproduce the data a generated file
names (and `--patches-commit <sha>` the patch list's; the icons are always today's).
"""

import argparse
import re
import subprocess
import sys
import urllib.request
from argparse import ArgumentParser, Namespace
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from subprocess import CompletedProcess
from urllib.request import Request

import gear_activities
import gear_sources
import gen_job_icons
import progress
from item_format import load_format, read_csv

ROOT: Path = Path(__file__).resolve().parents[2]
DEST: Path = ROOT / 'data' / 'ffxiv-datamining'
URL: str = 'https://github.com/xivapi/ffxiv-datamining.git'
PATCHES_DEST: Path = ROOT / 'data' / 'ffxiv-datamining-patches'
PATCHES_URL: str = 'https://github.com/xivapi/ffxiv-datamining-patches.git'
PATCHLIST: str = 'patchlist.json'
FILES: list[str] = [
    'Item',
    'ItemLevel',
    'ParamGrow',
    'BaseParam',
    'ClassJobCategory',
    'EquipSlotCategory',
    'ClassJob',
    'Tribe',
    'Race',
    'Materia',
    'MateriaGrade',
    'ItemAction',
    'ItemFood',
    *gear_sources.FILES,
    *gear_activities.FILES,
]
ICON_DIR: Path = ROOT / 'data' / 'icons'
USER_AGENT: str = 'ff14-gear-sync-analysis data fetch (+https://github.com/redactedkai/ff14-gear-sync-analysis)'
FRAMED_JOB_ICON: int = 62100  # + ClassJob row
ICON_URL: str = 'https://v2.xivapi.com/api/asset?path=ui/icon/{folder:06d}/{icon:06d}_hr1.tex&format=png'  # _hr1: 64 x 64


def git(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(['git', *args], cwd=cwd, check=True)


def icon_url(icon: int) -> str:
    return ICON_URL.format(folder=icon // 1000 * 1000, icon=icon)


def job_icon_numbers(csv_dir: Path | str) -> dict[str, int]:
    """{job: icon number} for every job in item-format.json, from ClassJob.csv."""
    rows: dict[str, int] = {r['Abbreviation']: int(r['#']) for r in read_csv(Path(csv_dir) / 'ClassJob.csv', ['#', 'Abbreviation'])}
    missing: list[str] = [j for j in load_format()['jobs'] if j not in rows]
    if missing:
        sys.exit(f'ClassJob.csv has no row for {missing}')
    return {j: FRAMED_JOB_ICON + rows[j] for j in load_format()['jobs']}


def download_icon(url: str, dest: Path) -> None:
    """Download the PNG at `url` to `dest`. It is written to `dest` + '.part' first and renamed only when it is a whole 64 x
    64 PNG, so a failed or cut-short download never replaces a good icon (and the generator never sees half a file). Exits
    with a message naming the file when the download is not a whole icon."""
    part: Path = dest.with_name(dest.name + '.part')
    req: Request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})  # the default one is refused
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    size: int = gen_job_icons.SIZE
    if gen_job_icons.png_size(data) != (size, size) or not gen_job_icons.is_complete_png(data):
        sys.exit(f'{dest.name}: the download from {url} is not a whole {size} x {size} PNG; nothing was replaced.')
    part.write_bytes(data)
    part.replace(dest)


def fetch_icons(csv_dir: Path) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    icons = job_icon_numbers(csv_dir).items()
    for job, icon in progress.bar(icons, 'Downloading the job icons', unit='icon'):
        download_icon(icon_url(icon), ICON_DIR / f'{job}.png')
    # the endpoint has no version: the job icon generator writes this date and each icon's sha256 into its header
    (ICON_DIR / gen_job_icons.FETCH_RECORD).write_text(datetime.now(UTC).date().isoformat() + '\n', encoding='utf-8')


def git_out(*args: str, cwd: Path | None = None) -> str | None:
    """A git command's output, stripped, or None when it fails."""
    r: CompletedProcess[str] = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, check=False)
    return r.stdout.strip() if r.returncode == 0 else None


def parse_args(argv: Sequence[str] | None = None) -> Namespace:
    """Command line options: --commit SHA checks out that datamining commit instead of the newest one."""
    ap: ArgumentParser = argparse.ArgumentParser(description='Fetch the datamining CSVs, the patch list and the job icons into data/.')
    ap.add_argument(
        '--commit',
        help='check out this ffxiv-datamining commit (the full 40-digit id, which a generated file names) instead of the newest one',
    )
    ap.add_argument(
        '--patches-commit',
        help='check out this ffxiv-datamining-patches commit (the full 40-digit id, which patches.json names) instead of the newest one',
    )
    args: Namespace = ap.parse_args(argv)
    # GitHub serves a single commit by its full id only
    for flag, value in (('--commit', args.commit), ('--patches-commit', args.patches_commit)):
        if value is not None and not re.fullmatch(r'[0-9a-fA-F]{40}', value):
            ap.error(f'{flag} {value!r} is not a full commit id (40 hex digits)')
    return args


def update_clone(commit: str | None = None, dest: Path = DEST, url: str = URL, paths: Sequence[str] | None = None) -> None:
    """Clone, or update, the sparse, shallow clone of `url` in `dest` (the datamining one by default), keeping the files
    `paths` (patterns from the repository's root; by default the CSVs of FILES). Without `commit`, move to the newest
    commit of its branch (a fast-forward pull). With `commit`, fetch just that commit and check it out (a detached HEAD);
    a later run without one goes back to the branch first."""
    if paths is None:
        paths = [f'/csv/en/{f}.csv' for f in FILES]
    if not (dest / '.git').exists():
        dest.parent.mkdir(exist_ok=True)
        git('clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', url, str(dest))
    elif commit is None:
        if git_out('symbolic-ref', '-q', 'HEAD', cwd=dest) is None:  # on a commit an earlier --commit run checked out
            branch: str = (git_out('for-each-ref', '--format=%(refname:short)', 'refs/heads/', cwd=dest) or '').split('\n')[0]
            if not branch:
                sys.exit(f'{dest} is on a detached commit and has no branch to go back to; delete it and fetch again.')
            git('checkout', '--quiet', branch, cwd=dest)
        git('pull', '--quiet', '--ff-only', cwd=dest)
    # every run, so a clone made before a sheet was added to FILES picks it up
    git('sparse-checkout', 'set', '--no-cone', *paths, cwd=dest)
    if commit is not None:
        git('fetch', '--quiet', '--depth', '1', 'origin', commit, cwd=dest)
        git('checkout', '--quiet', '--detach', 'FETCH_HEAD', cwd=dest)


def main(argv: Sequence[str] | None = None) -> None:
    args: Namespace = parse_args(argv)
    print('Fetching the game data' + (f' at commit {args.commit}' if args.commit else '') + '...', flush=True)
    update_clone(args.commit)
    missing: list[str] = [f for f in FILES if not (DEST / 'csv' / 'en' / f'{f}.csv').exists()]
    if missing:
        sys.exit(f'missing CSVs after fetch: {missing}')
    print('Fetching the patch list' + (f' at commit {args.patches_commit}' if args.patches_commit else '') + '...', flush=True)
    update_clone(args.patches_commit, PATCHES_DEST, PATCHES_URL, [f'/{PATCHLIST}'])
    if not (PATCHES_DEST / PATCHLIST).exists():
        sys.exit(f'missing {PATCHLIST} after fetch')
    fetch_icons(DEST / 'csv' / 'en')


if __name__ == '__main__':
    main()
