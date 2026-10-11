#!/usr/bin/env python3
"""Build src/data/item-level.js (ItemLevel budget table + ParamGrow level data) from the datamining CSVs.

Usage: python scripts/data/gen_item_level.py <path-to-ffxiv-datamining>/csv/en  [out.js]  [--source-commit SHA --source-date ISO]

IL = per-stat budget by item level (index = item level, 921 rows as of patch 7.50), one array per stat key
     in src/core/item-format.json.
DATA_SOURCE = {repo, commit, date} of the datamining commit the CSVs come from, or null when unknown.
PG = [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1..100 (index = level - 1).
"""

import argparse
import json
from pathlib import Path

import provenance
from item_format import load_format, read_csv


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    d = Path(csv_dir)
    il_cols = {s['key']: s['itemLevelColumn'] for s in load_format()['stats']}
    il_rows = read_csv(d / 'ItemLevel.csv')
    assert [int(r['#']) for r in il_rows] == list(range(len(il_rows))), 'ItemLevel ids not contiguous'
    IL = {k: [int(r[c]) for r in il_rows] for k, c in il_cols.items()}
    pg_rows = {int(r['#']): r for r in read_csv(d / 'ParamGrow.csv')}
    PG = [[int(pg_rows[lvl]['BaseSpeed']), int(pg_rows[lvl]['LevelModifier']), int(pg_rows[lvl]['ItemLevelSync'])] for lvl in range(1, 101)]
    js = provenance.header(source)
    js += 'export const DATA_SOURCE=' + json.dumps(source, separators=(',', ':')) + ';\n'
    js += 'export const IL=' + json.dumps(IL, separators=(',', ':')) + ';\nexport const PG=' + json.dumps(PG, separators=(',', ':')) + ';\n'
    provenance.write_generated(out, js)
    print(f'ItemLevel rows 0..{len(il_rows) - 1}, ParamGrow levels 1..100 -> {out}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/item-level.js')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    main(args.csv_dir, args.out, provenance.from_args(args))
