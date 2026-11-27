#!/usr/bin/env python3
"""Regenerate src/data/item-level.json, src/data/items.json, src/data/food.json, src/data/job-icons.js,
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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
PATCHES_DIR = ROOT / 'data' / 'ffxiv-datamining-patches'
PATCHLIST = PATCHES_DIR / 'patchlist.json'
if not CSV.exists() or not PATCHLIST.exists():
    sys.exit('No CSVs or no patch list yet. Run: python scripts/data/fetch.py')
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))
import progress  # noqa: E402
import provenance  # noqa: E402

ap = argparse.ArgumentParser(description='Regenerate src/data/ from the data clones in data/, then rebuild dist/.')
ap.add_argument('--allow-dirty', action='store_true', help='run even when a data clone has local edits (do not commit the result)')
args = ap.parse_args()


def read_clone(directory, repo, what, restore):
    """(source, edits) of the clone that holds `directory`: its {repo, commit, date} and its local edits (git status
    lines, [] when clean). Exits when git cannot tell, and when there are edits (unless --allow-dirty, which warns).
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
        if not args.allow_dirty:
            sys.exit(message)
        print('Warning: ' + message, flush=True)
    return source, edits


src, edits = read_clone(CSV, provenance.REPO, 'data', 'csv')
patch_src, _patch_edits = read_clone(PATCHES_DIR, provenance.PATCHES_REPO, 'patch list', 'patchlist.json')
prov = ['--source-commit', src['commit'], '--source-date', src['date']]
patch_prov = ['--source-commit', patch_src['commit'], '--source-date', patch_src['date']]
py = sys.executable
DATA = ROOT / 'scripts' / 'data'
OUT = ROOT / 'src' / 'data'
work = tempfile.TemporaryDirectory()
REPORT = str(Path(work.name) / 'items-report.json')  # the item generator's counts, for the summary step
STEPS = [
    ('Generating the item level table', [py, str(DATA / 'gen_item_level.py'), str(CSV), str(OUT / 'item-level.json'), *prov]),
    ('Generating the item database', [py, str(DATA / 'gen_items.py'), str(CSV), str(OUT / 'items.json'), *prov, '--report', REPORT]),
    # which jobs share gear (Copy sheet), from the item database made above
    ('Generating the gear groups', [py, str(DATA / 'gen_gear_groups.py'), str(OUT / 'items.json'), str(OUT / 'gear-groups.json')]),
    ('Generating the food table', [py, str(DATA / 'gen_food.py'), str(CSV), str(OUT / 'food.json'), *prov]),
    ('Generating the job icons', [py, str(DATA / 'gen_job_icons.py')]),
    # the patch each sheet's game data belongs to (the sheet manager): the release day of every patch
    ('Generating the patch table', [py, str(DATA / 'gen_patches.py'), str(PATCHLIST), str(OUT / 'patches.json'), *patch_prov]),
    # the most speed per level comes from the optimizer (JavaScript), over the item and food tables made above
    ('Generating the most speed per level', ['node', str(DATA / 'gen_max_speed.mjs'), str(OUT / 'max-speed.json')]),
    # src/data/summary.json: counts compared with the last run, CSV blob ids, and a docs/data-changelog.md line for a
    # new commit (not for an edited clone, whose data should not be committed)
    (
        'Comparing the counts with the last run',
        [py, str(DATA / 'summary.py'), str(CSV), REPORT, *(['--no-changelog'] if edits else [])],
    ),
    ('Building the page', ['node', str(ROOT / 'scripts' / 'build' / 'build.mjs')]),
]

for _label, cmd in progress.steps(STEPS, label=lambda s: s[0]):
    # stdout is held back so a progress bar stays intact, then shown: the item generator's drop report, the counts
    # that moved and any warning (the build's file size is dropped). Errors go to stderr as they happen.
    p = subprocess.run(cmd, stdout=subprocess.PIPE, text=True, check=False)  # a failure is reported below, after the output
    if cmd[0] == py and p.stdout.strip():
        progress.note(p.stdout.rstrip())
    if p.returncode:
        sys.exit(p.returncode)
work.cleanup()
print('Done.')
