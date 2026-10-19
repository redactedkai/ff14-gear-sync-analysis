#!/usr/bin/env python3
"""Regenerate src/data/item-level.json, src/data/items.json, src/data/food.json, src/data/job-icons.js,
src/data/max-speed.json and src/data/summary.json from what fetch.py saved in data/, then rebuild dist/. The summary
step prints the counts that moved since the last run and adds a line to docs/data-changelog.md for a new commit.

Usage: python scripts/data/regen.py [--allow-dirty]

It refuses to run when a tracked file in the data clone has local edits: the generated files name the clone's commit,
so they would claim that commit's data while holding other data. --allow-dirty runs anyway (to try out an edit); don't
commit what it writes."""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
if not CSV.exists():
    sys.exit('No CSVs yet. Run: python scripts/data/fetch.py')
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))
import progress  # noqa: E402
import provenance  # noqa: E402

ap = argparse.ArgumentParser(description='Regenerate src/data/ from the datamining clone in data/, then rebuild dist/.')
ap.add_argument('--allow-dirty', action='store_true', help='run even when the data clone has local edits (do not commit the result)')
args = ap.parse_args()

src = provenance.detect(CSV)
if src is None:
    sys.exit(f'Could not read the git commit of {CSV}. Run: python scripts/data/fetch.py')
edits = provenance.local_edits(CSV)
if edits is None:
    sys.exit(f'Could not read the git status of {CSV}. Run: python scripts/data/fetch.py')
if edits:
    listed = '\n  '.join(edits[:10]) + ('\n  ...' if len(edits) > 10 else '')
    message = (
        f'The data clone has local edits, so the generated files would name commit {src["commit"][:7]} but hold other '
        f'data:\n  {listed}\nUndo them (git checkout -- csv, in data/ffxiv-datamining), or pass --allow-dirty to '
        'regenerate from them anyway and not commit the result.'
    )
    if not args.allow_dirty:
        sys.exit(message)
    print('Warning: ' + message, flush=True)
prov = ['--source-commit', src['commit'], '--source-date', src['date']]
py = sys.executable
DATA = ROOT / 'scripts' / 'data'
OUT = ROOT / 'src' / 'data'
work = tempfile.TemporaryDirectory()
REPORT = str(Path(work.name) / 'items-report.json')  # the item generator's counts, for the summary step
STEPS = [
    ('Generating the item level table', [py, str(DATA / 'gen_item_level.py'), str(CSV), str(OUT / 'item-level.json'), *prov]),
    ('Generating the item database', [py, str(DATA / 'gen_items.py'), str(CSV), str(OUT / 'items.json'), *prov, '--report', REPORT]),
    ('Generating the food table', [py, str(DATA / 'gen_food.py'), str(CSV), str(OUT / 'food.json'), *prov]),
    ('Generating the job icons', [py, str(DATA / 'gen_job_icons.py')]),
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
    p = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    if cmd[0] == py and p.stdout.strip():
        progress.note(p.stdout.rstrip())
    if p.returncode:
        sys.exit(p.returncode)
work.cleanup()
print('Done.')
