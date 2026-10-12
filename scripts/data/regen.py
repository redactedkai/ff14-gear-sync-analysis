#!/usr/bin/env python3
"""Regenerate src/data/item-level.json, src/data/items.json and src/data/job-icons.js from what fetch.py saved in data/, then
rebuild dist/."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
if not CSV.exists():
    sys.exit('No CSVs yet. Run: python scripts/data/fetch.py')
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))
import progress  # noqa: E402
import provenance  # noqa: E402

src = provenance.detect(CSV)
if src is None:
    sys.exit(f'Could not read the git commit of {CSV}. Run: python scripts/data/fetch.py')
prov = ['--source-commit', src['commit'], '--source-date', src['date']]
py = sys.executable
DATA = ROOT / 'scripts' / 'data'
OUT = ROOT / 'src' / 'data'
STEPS = [
    ('Generating the item level table', [py, str(DATA / 'gen_item_level.py'), str(CSV), str(OUT / 'item-level.json'), *prov]),
    ('Generating the item database', [py, str(DATA / 'gen_items.py'), str(CSV), str(OUT / 'items.json'), *prov]),
    ('Generating the job icons', [py, str(DATA / 'gen_job_icons.py')]),
    ('Building the page', ['node', str(ROOT / 'scripts' / 'build' / 'build.mjs')]),
]

for _label, cmd in progress.steps(STEPS, label=lambda s: s[0]):
    # stdout is held back so a progress bar stays intact; the generators print only warnings (the build its file size,
    # which is dropped). Errors go to stderr as they happen.
    p = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    if cmd[0] == py and p.stdout.strip():
        progress.note(p.stdout.rstrip())
    if p.returncode:
        sys.exit(p.returncode)
print('Done.')
