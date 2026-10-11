#!/usr/bin/env python3
"""Regenerate src/data/item-level.js and src/data/items.js from data/ffxiv-datamining (see fetch_data.py), then rebuild dist/."""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
if not CSV.exists():
    sys.exit('No CSVs yet. Run: python scripts/data/fetch.py')
py = sys.executable
subprocess.run([py, str(ROOT / 'scripts' / 'data' / 'gen_item_level.py'), str(CSV), str(ROOT / 'src' / 'data' / 'item-level.js')], check=True)
subprocess.run([py, str(ROOT / 'scripts' / 'data' / 'gen_items.py'), str(CSV), str(ROOT / 'src' / 'data' / 'items.js')], check=True)
subprocess.run(['node', str(ROOT / 'scripts' / 'build' / 'build.mjs')], check=True)
