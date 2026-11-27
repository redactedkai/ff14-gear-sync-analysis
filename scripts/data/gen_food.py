#!/usr/bin/env python3
"""Build src/data/food.json (the meals that raise combat substats) from the datamining CSVs.

Usage: python scripts/data/gen_food.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "formatVersion": n,
         "foods": [[name, item level, [[stat key, percent, max], ...], vitality], ...]}
One row per meal, sorted by item level, then name. Stats are the HQ values of the meal's substats in the order of its
ItemFood row (primary first); vitality is its HQ Vitality as [percent, max], or null when it has none. Which rows
count as meals, and which are kept: `food` in src/core/item-format.json.

Stops with exit status 1 (SchemaError) on a missing column, a meal whose ItemFood row does not exist, or a kept stat
whose HQ percent is not 1 to 100 or whose HQ maximum is not positive.
"""

import argparse
from argparse import ArgumentParser, Namespace
from pathlib import Path

import provenance
from item_format import FoodFormat, ItemFormat, Row, SchemaError, check_bools, load_format, read_csv, run_main
from provenance import Source

N_FOOD_PARAMS: int = 3  # stats per ItemFood row


def food_columns() -> list[str]:
    return [f'{c}[{i}]' for c in ('BaseParam', 'IsRelative', 'ValueHQ', 'MaxHQ') for i in range(N_FOOD_PARAMS)]


def meal_stats(
    food_row: Row, stat_of: dict[int, str], carried: list[str], vitality: str | None = None
) -> tuple[list[list[str | int]], list[int] | None] | None:
    """([[key, percent, max], ...], [percent, max] or None): a kept meal's carried stats and its Vitality (key
    `vitality`), or None when the meal is left out: a stat that is not a combat stat, a flat (non-relative) bonus, or no
    substat at all."""
    out: list[list[str | int]] = []
    any_sub: bool = False
    vit: list[int] | None = None
    for i in range(N_FOOD_PARAMS):
        param: int = int(food_row[f'BaseParam[{i}]'])
        if not param:
            continue
        key: str | None = stat_of.get(param)
        if key is None or food_row[f'IsRelative[{i}]'] != 'True':
            return None
        if key not in carried and key != vitality:
            continue
        pct, mx = int(food_row[f'ValueHQ[{i}]']), int(food_row[f'MaxHQ[{i}]'])
        if not (1 <= pct <= 100 and mx > 0):
            raise SchemaError(
                f'ItemFood row {food_row["#"]}: {key} HQ {pct}% up to {mx}, expected a percent 1 to 100 and a positive maximum'
            )
        if key == vitality:
            vit = [pct, mx]
            continue
        any_sub = True
        out.append([key, pct, mx])
    return (out, vit) if any_sub else None


def main(csv_dir: Path | str, out: Path | str, source: provenance.SourceArg = 'detect') -> None:
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    source = provenance.resolve(source, csv_dir)
    csv_path: Path = Path(csv_dir)
    fmt: ItemFormat = load_format()
    food: FoodFormat = fmt['food']
    stat_of: dict[int, str] = {s['baseParam']: s['key'] for s in fmt['stats'] if s['key'] in food['stats']}
    items: list[dict[str, str]] = read_csv(
        csv_path / 'Item.csv', ['#', 'Name', 'LevelItem', 'CanBeHq', food['uiCategoryColumn'], food['actionColumn']]
    )
    actions: dict[str, dict[str, str]] = {
        r['#']: r for r in read_csv(csv_path / 'ItemAction.csv', ['#', 'Action', 'Data[0]', food['foodRowColumn']])
    }
    food_rows: dict[str, dict[str, str]] = {r['#']: r for r in read_csv(csv_path / 'ItemFood.csv', ['#', *food_columns()])}
    check_bools(items, ['CanBeHq'], 'Item.csv')
    check_bools(food_rows.values(), [f'IsRelative[{i}]' for i in range(N_FOOD_PARAMS)], 'ItemFood.csv')
    numbered_foods: list[tuple[int, list[object]]] = []  # (Item.csv row id, meal) pairs, the id only for the sort below
    for item in items:
        if item[food['uiCategoryColumn']] != str(food['uiCategory']) or item['CanBeHq'] != 'True':
            continue
        action: dict[str, str] | None = actions.get(item[food['actionColumn']])
        if action is None or int(action['Action']) not in food['actions'] or action['Data[0]'] != str(food['status']):
            continue
        row: dict[str, str] | None = food_rows.get(action[food['foodRowColumn']])
        if row is None:
            missing: str = action[food['foodRowColumn']]
            raise SchemaError(f'meal {item["#"]} ({item["Name"]}) points at ItemFood row {missing}, which does not exist')
        kept: tuple[list[list[int | str]], list[int] | None] | None = meal_stats(row, stat_of, food['carried'], food['vitality'])
        if kept is not None:
            numbered_foods.append((int(item['#']), [item['Name'], int(item['LevelItem']), *kept]))
    numbered_foods.sort(
        key=lambda entry: (entry[1][1], entry[1][0], entry[0])
    )  # item level, name, then the row id so a tie never depends on file order
    foods: list[list[object]] = [meal for _, meal in numbered_foods]
    doc: dict[str, Source | int | list[list[object]] | str | None] = {
        '_generated': provenance.note(source),
        'source': source,
        'formatVersion': fmt['formatVersion'],
        'foods': foods,
    }
    provenance.write_generated(out, provenance.json_lines(doc, expand=('foods',)))  # one meal per line


if __name__ == '__main__':
    ap: ArgumentParser = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/food.json')
    provenance.add_cli_args(ap)
    args: Namespace = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
