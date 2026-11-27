#!/usr/bin/env python3
"""Regenerate src/data/item-level.json, src/data/items.json, src/data/food.json, src/data/job-icons.ts,
src/data/gear-groups.json, src/data/max-speed.json, src/data/patches.json and src/data/summary.json from what fetch.py saved
in data/, then rebuild dist/. The summary step prints the counts that moved since the last run and adds a line to
docs/data-changelog.md for a new commit.

Usage: python scripts/data/regen.py [--allow-dirty]

It refuses to run when a tracked file in a data clone (the datamining CSVs, the patch list) has local edits: the generated
files name the clone's commit, so they would claim that commit's data while holding other data. --allow-dirty runs anyway
(to try out an edit); don't commit what it writes."""

import argparse
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

import progress
import provenance
from provenance import Source

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
PATCHES_DIR = ROOT / 'data' / 'ffxiv-datamining-patches'
PATCHLIST = PATCHES_DIR / 'patchlist.json'
DATA = ROOT / 'scripts' / 'data'
OUT = ROOT / 'src' / 'data'
# The Python steps run with UTF-8 input and output whatever the console's code page is (a Windows console is cp1252), so an
# item name outside it cannot crash a generator's print. Their output is decoded as UTF-8 below.
PYTHON = [sys.executable, '-X', 'utf8']


def read_clone(directory: Path, repo: str, what: str, restore: str, allow_dirty: bool) -> tuple[Source, list[str]]:
    """(source, edits) of the clone that holds `directory`: its {repo, commit, date} and its local edits (git status
    lines, [] when clean). Exits when git cannot tell, and when there are edits (unless `allow_dirty`, which warns).
    `repo`: "owner/name" it must be a clone of; `what`: its name in messages; `restore`: the path to undo edits of."""
    source = provenance.detect(directory, repo)
    if source is None:
        sys.exit(f'Could not read the git commit of {directory}. Run: python scripts/data/fetch.py')
    edits = provenance.local_edits(directory)
    if edits is None:
        sys.exit(f'Could not read the git status of {directory}. Run: python scripts/data/fetch.py')
    if edits:
        listed = '\n  '.join(edits[:10]) + ('\n  ...' if len(edits) > 10 else '')
        message = (
            f'The {what} clone has local edits, so the generated files would name commit {source["commit"][:7]} but hold other '
            f'data:\n  {listed}\nUndo them (git checkout -- {restore}, in {Path(directory).relative_to(ROOT)}), or pass --allow-dirty to '
            'regenerate from them anyway and not commit the result.'
        )
        if not allow_dirty:
            sys.exit(message)
        print('Warning: ' + message, flush=True)
    return source, edits


def build_steps(source: Source, patch_source: Source, edited: bool, report_path: str) -> list[tuple[str, list[str]]]:
    """[(label, command)] for every step, in the order they run. `source`, `patch_source`: the provenance of the data
    clone and of the patch list clone; `edited`: whether the data clone has local edits (the changelog line is then
    skipped); `report_path`: where the item generator writes its counts, for the summary step."""
    prov = ['--source-commit', source['commit'], '--source-date', source['date']]
    patch_prov = ['--source-commit', patch_source['commit'], '--source-date', patch_source['date']]
    return [
        ('Generating the item level table', [*PYTHON, str(DATA / 'gen_item_level.py'), str(CSV), str(OUT / 'item-level.json'), *prov]),
        (
            'Generating the item database',
            [*PYTHON, str(DATA / 'gen_items.py'), str(CSV), str(OUT / 'items.json'), *prov, '--report', report_path],
        ),
        # which jobs share gear (Copy sheet), from the item database made above
        ('Generating the gear groups', [*PYTHON, str(DATA / 'gen_gear_groups.py'), str(OUT / 'items.json'), str(OUT / 'gear-groups.json')]),
        ('Generating the food table', [*PYTHON, str(DATA / 'gen_food.py'), str(CSV), str(OUT / 'food.json'), *prov]),
        ('Generating the job icons', [*PYTHON, str(DATA / 'gen_job_icons.py')]),
        # the patch each sheet's game data belongs to (the sheet manager): the release day of every patch
        ('Generating the patch table', [*PYTHON, str(DATA / 'gen_patches.py'), str(PATCHLIST), str(OUT / 'patches.json'), *patch_prov]),
        # the most speed per level comes from the optimizer (JavaScript), over the item and food tables made above
        ('Generating the most speed per level', ['node', str(DATA / 'gen_max_speed.ts'), str(OUT / 'max-speed.json')]),
        # src/data/summary.json: counts compared with the last run, CSV blob ids, and a docs/data-changelog.md line for a
        # new commit (not for an edited clone, whose data should not be committed)
        (
            'Comparing the counts with the last run',
            [*PYTHON, str(DATA / 'summary.py'), str(CSV), report_path, *(['--no-changelog'] if edited else [])],
        ),
        ('Building the page', ['node', str(ROOT / 'scripts' / 'build' / 'build.ts')]),
    ]


def is_python_step(command: Sequence[str]) -> bool:
    """Whether a step's command runs Python (as built from PYTHON), whose output is UTF-8 and is shown."""
    return command[: len(PYTHON)] == PYTHON


def main(argv: Sequence[str] | None = None) -> None:
    """Regenerate src/data/ and rebuild dist/ (see the module docstring). Exits with the first failing step's status."""
    ap = argparse.ArgumentParser(description='Regenerate src/data/ from the data clones in data/, then rebuild dist/.')
    ap.add_argument('--allow-dirty', action='store_true', help='run even when a data clone has local edits (do not commit the result)')
    args = ap.parse_args(argv)
    if not CSV.exists() or not PATCHLIST.exists():
        sys.exit('No CSVs or no patch list yet. Run: python scripts/data/fetch.py')

    source, edits = read_clone(CSV, provenance.REPO, 'data', 'csv', args.allow_dirty)
    patch_source, _patch_edits = read_clone(PATCHES_DIR, provenance.PATCHES_REPO, 'patch list', 'patchlist.json', args.allow_dirty)
    with tempfile.TemporaryDirectory() as work:
        report_path = str(Path(work) / 'items-report.json')  # the item generator's counts, for the summary step
        steps = build_steps(source, patch_source, bool(edits), report_path)
        for _label, command in progress.steps(steps, label=lambda step: step[0]):
            # stdout is held back so a progress bar stays intact, then shown: the item generator's drop report, the counts
            # that moved and any warning (the build's file size is dropped). Errors go to stderr as they happen.
            python = is_python_step(command)
            done = subprocess.run(command, stdout=subprocess.PIPE, text=True, encoding='utf-8' if python else None, check=False)
            if python and done.stdout.strip():
                progress.note(done.stdout.rstrip())
            if done.returncode:
                sys.exit(done.returncode)
    print('Done.')


if __name__ == '__main__':
    main()
