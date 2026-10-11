#!/usr/bin/env python3
"""Regenerate src/data.js and src/items.js from data/ffxiv-datamining (see fetch_data.py), then rebuild dist/."""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
if not CSV.exists():
    sys.exit('No CSVs yet. Run: python scripts/fetch_data.py')
py = sys.executable
subprocess.run([py, str(ROOT / 'scripts' / 'gen_data.py'), str(CSV), str(ROOT / 'src' / 'data.js')], check=True)
subprocess.run([py, str(ROOT / 'scripts' / 'gen_items.py'), str(CSV), str(ROOT / 'src' / 'items.js')], check=True)
subprocess.run([py, str(ROOT / 'scripts' / 'build.py')], check=True)
