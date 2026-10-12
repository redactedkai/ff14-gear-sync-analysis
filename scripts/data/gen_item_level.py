#!/usr/bin/env python3
"""Build src/data/item-level.json (ItemLevel budget table + ParamGrow level data) from the datamining CSVs.

Usage: python scripts/data/gen_item_level.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "IL": ..., "PG": ..., "MP": ...}
_generated = one-line "do not edit" notice naming the source commit.
source = {repo, commit, date} of the datamining commit the CSVs come from, or null when unknown (the page's DATA_SOURCE).
IL = per-stat budget by item level (index = item level, 921 rows as of patch 7.50), one array per stat key
     in src/core/item-format.json.
PG = [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1..100 (index = level - 1).
MP = per-item stat factor table, {stat key: [percent for BaseParamModifier 0..12]}, from each stat's BaseParam row
     (MeldParam columns; `statFactor` in src/core/item-format.json). An item row's last field indexes it.

Also checks BaseParam.csv: every stat's slot shares must equal the slot `percent`s in src/core/item-format.json, which
the page uses. Missing columns or a mismatch stop the generator with exit status 1.
"""

import argparse
import json
from pathlib import Path

import provenance
from item_format import check_slot_percents, load_format, read_csv, run_main, stat_factors


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    d = Path(csv_dir)
    fmt = load_format()
    check_slot_percents(d / 'BaseParam.csv', fmt)
    MP = stat_factors(d / 'BaseParam.csv', fmt)
    il_cols = {s['key']: s['itemLevelColumn'] for s in fmt['stats']}
    il_rows = read_csv(d / 'ItemLevel.csv', ['#', *il_cols.values()])
    assert [int(r['#']) for r in il_rows] == list(range(len(il_rows))), 'ItemLevel ids not contiguous'
    IL = {k: [int(r[c]) for r in il_rows] for k, c in il_cols.items()}
    pg_rows = {int(r['#']): r for r in read_csv(d / 'ParamGrow.csv', ['#', 'BaseSpeed', 'LevelModifier', 'ItemLevelSync'])}
    PG = [[int(pg_rows[lvl]['BaseSpeed']), int(pg_rows[lvl]['LevelModifier']), int(pg_rows[lvl]['ItemLevelSync'])] for lvl in range(1, 101)]
    # one line, compact: {"_generated": notice, "source": provenance, "IL": {stat: [budget]}, "PG": [[...]], "MP": {stat: [%]}}
    doc = {'_generated': provenance.note(source), 'source': source, 'IL': IL, 'PG': PG, 'MP': MP}
    provenance.write_generated(out, json.dumps(doc, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/item-level.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
