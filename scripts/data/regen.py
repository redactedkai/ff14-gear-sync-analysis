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
import provenance  # noqa: E402

src = provenance.detect(CSV)
if src is None:
    sys.exit(f'Could not read the git commit of {CSV}. Run: python scripts/data/fetch.py')
print(f'Data source: {src["repo"]} {src["commit"]} ({src["date"]})')
prov = ['--source-commit', src['commit'], '--source-date', src['date']]
py = sys.executable
subprocess.run(
    [py, str(ROOT / 'scripts' / 'data' / 'gen_item_level.py'), str(CSV), str(ROOT / 'src' / 'data' / 'item-level.json'), *prov], check=True
)
subprocess.run(
    [py, str(ROOT / 'scripts' / 'data' / 'gen_items.py'), str(CSV), str(ROOT / 'src' / 'data' / 'items.json'), *prov], check=True
)
subprocess.run([py, str(ROOT / 'scripts' / 'data' / 'gen_job_icons.py')], check=True)
subprocess.run(['node', str(ROOT / 'scripts' / 'build' / 'build.mjs')], check=True)
