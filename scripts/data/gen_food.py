#!/usr/bin/env python3
"""Build src/data/food.json (the meals that raise combat substats) from the datamining CSVs.

Usage: python scripts/data/gen_food.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "foods": [[name, item level, [[stat key, percent, max], ...]], ...]}
One row per meal, sorted by item level, then name. Stats are the HQ values of the meal's substats in the order of its
ItemFood row (primary first). Which rows count as meals, and which are kept: `food` in src/core/item-format.json.

Stops with exit status 1 (SchemaError) on a missing column, a meal whose ItemFood row does not exist, or a kept stat
whose HQ percent is not 1 to 100 or whose HQ maximum is not positive.
"""

import argparse
import json
from pathlib import Path

import provenance
from item_format import SchemaError, load_format, read_csv, run_main

N_FOOD_PARAMS = 3  # stats per ItemFood row


def food_columns():
    return [f'{c}[{i}]' for c in ('BaseParam', 'IsRelative', 'ValueHQ', 'MaxHQ') for i in range(N_FOOD_PARAMS)]


def meal_stats(food_row, stat_of, carried):
    """[[key, percent, max], ...] of a kept meal's carried stats, or None when the meal is left out: a stat that is not a
    combat stat, a flat (non-relative) bonus, or no substat at all."""
    out, any_sub = [], False
    for i in range(N_FOOD_PARAMS):
        param = int(food_row[f'BaseParam[{i}]'])
        if not param:
            continue
        key = stat_of.get(param)
        if key is None or food_row[f'IsRelative[{i}]'] != 'True':
            return None
        if key not in carried:
            continue
        any_sub = True
        pct, mx = int(food_row[f'ValueHQ[{i}]']), int(food_row[f'MaxHQ[{i}]'])
        if not (1 <= pct <= 100 and mx > 0):
            raise SchemaError(
                f'ItemFood row {food_row["#"]}: {key} HQ {pct}% up to {mx}, expected a percent 1 to 100 and a positive maximum'
            )
        out.append([key, pct, mx])
    return out if any_sub else None


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    d = Path(csv_dir)
    fmt = load_format()
    fd = fmt['food']
    stat_of = {s['baseParam']: s['key'] for s in fmt['stats'] if s['key'] in fd['stats']}
    items = read_csv(d / 'Item.csv', ['#', 'Name', 'LevelItem', 'CanBeHq', fd['uiCategoryColumn'], fd['actionColumn']])
    actions = {r['#']: r for r in read_csv(d / 'ItemAction.csv', ['#', 'Action', 'Data[0]', fd['foodRowColumn']])}
    food_rows = {r['#']: r for r in read_csv(d / 'ItemFood.csv', ['#', *food_columns()])}
    foods = []
    for it in items:
        if it[fd['uiCategoryColumn']] != str(fd['uiCategory']) or it['CanBeHq'] != 'True':
            continue
        act = actions.get(it[fd['actionColumn']])
        if act is None or int(act['Action']) not in fd['actions'] or act['Data[0]'] != str(fd['status']):
            continue
        row = food_rows.get(act[fd['foodRowColumn']])
        if row is None:
            raise SchemaError(f'meal {it["#"]} ({it["Name"]}) points at ItemFood row {act[fd["foodRowColumn"]]}, which does not exist')
        st = meal_stats(row, stat_of, fd['carried'])
        if st is not None:
            foods.append([it['Name'], int(it['LevelItem']), st])
    foods.sort(key=lambda f: (f[1], f[0]))
    doc = {'_generated': provenance.note(source), 'source': source, 'foods': foods}
    provenance.write_generated(out, json.dumps(doc, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/food.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
