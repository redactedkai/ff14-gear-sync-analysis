#!/usr/bin/env python3
"""Check that src/data/ is what the generators make from the data clones in data/ (local only: it needs the clones at the
commits the generated files name, which CI does not have).

Usage: python scripts/data/verify.py [--full]

Runs each generator into a temporary directory, the way regen.py does (the same inputs, the same order), and compares
every file byte for byte with src/data/. Nothing in the project is written. Prints one line per file and exits 1 when a
file differs, or when a data clone has local edits (the output would not be the named commit's data).

The most-speed table (gen_max_speed.mjs) is an optimizer search of about five minutes that reads the item and food
tables through src/core, and its `inputs` hash also covers the src/core code. So by default only its hash is checked
(`gen_max_speed.mjs --check`), and a stale one is a warning, not a difference. --full runs the search too and compares
the file byte for byte (against the committed items.json and food.json, not the ones made here)."""

import argparse
import contextlib
import difflib
import io
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

import gen_food
import gen_gear_groups
import gen_item_level
import gen_items
import gen_job_icons
import gen_patches
import provenance
import summary
from item_format import ROOT

CSV = ROOT / 'data' / 'ffxiv-datamining' / 'csv' / 'en'
PATCHES_DIR = ROOT / 'data' / 'ffxiv-datamining-patches'
ICON_DIR = ROOT / 'data' / 'icons'
COMMITTED = ROOT / 'src' / 'data'
MAX_SPEED_SCRIPT = ROOT / 'scripts' / 'data' / 'gen_max_speed.mjs'
MAX_DIFF_LINES = 6  # lines of a text difference shown per file


def first_difference(committed: str, made: str) -> str:
    """A few lines that show where two texts differ (unified diff, cut short), or a note on the length when only the
    ending differs."""
    diff = list(difflib.unified_diff(committed.splitlines(), made.splitlines(), 'src/data', 'generated', n=0, lineterm=''))
    if not diff:
        return f'  same lines, different bytes (committed {len(committed)} characters, generated {len(made)})'
    shown = [line[:200] for line in diff[:MAX_DIFF_LINES]]
    return '\n'.join('  ' + line for line in shown) + ('\n  ...' if len(diff) > MAX_DIFF_LINES else '')


def generate(work: Path, full: bool) -> list[str]:
    """Run every generator into the directory `work` and return the names of the files made, in regen.py's order. Output
    the generators print (drop reports, warnings) is held back. `full`: also make max-speed.json (the long search)."""
    with contextlib.redirect_stdout(io.StringIO()):
        gen_item_level.main(CSV, work / 'item-level.json')
        gen_items.main(CSV, work / 'items.json', report=str(work / 'items-report.json'))
        gen_gear_groups.main(work / 'items.json', work / 'gear-groups.json')
        gen_food.main(CSV, work / 'food.json')
        gen_job_icons.main(ICON_DIR, work / 'job-icons.js')
        gen_patches.main(PATCHES_DIR / 'patchlist.json', work / 'patches.json')
        # summary.py reads the item and food tables from these module constants: point them at the ones made here
        summary.ITEMS, summary.FOOD = work / 'items.json', work / 'food.json'
        summary.main(CSV, work / 'items-report.json', changelog=False, summary_path=work / 'summary.json')
    names = ['item-level.json', 'items.json', 'gear-groups.json', 'food.json', 'job-icons.js', 'patches.json', 'summary.json']
    if full:
        subprocess.run(['node', str(MAX_SPEED_SCRIPT), str(work / 'max-speed.json')], check=True, stdout=subprocess.DEVNULL)
        names.append('max-speed.json')
    return names


def max_speed_is_current() -> bool:
    """Whether src/data/max-speed.json's `inputs` hash matches the data and the src/core code now (a quick check; the
    table itself is not searched again)."""
    result = subprocess.run(
        ['node', str(MAX_SPEED_SCRIPT), '--check', str(COMMITTED / 'max-speed.json')], capture_output=True, text=True, check=False
    )
    return result.returncode == 0


def main(argv: Sequence[str] | None = None) -> int:
    """Exit code 0 when every generated file equals its committed copy, 1 otherwise."""
    ap = argparse.ArgumentParser(description='Compare src/data/ with what the generators make from the data clones.')
    ap.add_argument('--full', action='store_true', help='also run the five-minute search for max-speed.json and compare it byte for byte')
    args = ap.parse_args(argv)
    if not CSV.exists() or not (PATCHES_DIR / 'patchlist.json').exists():
        sys.exit('No CSVs or no patch list yet. Run: python scripts/data/fetch.py')
    for directory in (CSV, PATCHES_DIR):
        if provenance.local_edits(directory):
            sys.exit(f'{directory.relative_to(ROOT)} has local edits, so its data is not that of the commit it names. Undo them first.')
    different = 0
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for name in generate(work, args.full):
            made = (work / name).read_bytes()
            committed = (COMMITTED / name).read_bytes() if (COMMITTED / name).exists() else None
            if made == committed:
                print(f'identical  {name}')
                continue
            different += 1
            print(f'DIFFERENT  {name}')
            if committed is not None:
                print(first_difference(committed.decode('utf-8'), made.decode('utf-8')))
    if not args.full:
        if max_speed_is_current():
            print('current    max-speed.json (inputs hash only; --full searches again)')
        else:
            print('Warning: max-speed.json is stale (its data or the src/core code changed since it was made): run regen.py.')
    if different:
        print(f'{different} file(s) differ from src/data/.')
        return 1
    print('byte-identical: src/data/ is what the generators make from the data clones.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
