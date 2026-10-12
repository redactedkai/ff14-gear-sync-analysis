"""Shared helpers for the data generators.

The generated-data format (job bit order, raw stat order, slot codes, slot shares) lives in src/core/item-format.json,
which the page's JavaScript reads too, so the two sides cannot drift apart.

The generators check the CSVs against that format before using them: a column renamed or dropped
by a game patch, or a slot share in BaseParam that no longer matches the page, stops the generator with a SchemaError
instead of producing quietly wrong data.
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORMAT_PATH = ROOT / 'src' / 'core' / 'item-format.json'
N_ITEM_PARAMS = 6  # stat pairs per Item row (BaseParam[0..5], plus the same number of HQ pairs)


class SchemaError(Exception):
    """The datamining CSVs no longer match what the generators and src/core/item-format.json expect."""


def load_format():
    with open(FORMAT_PATH, encoding='utf-8') as f:
        return json.load(f)


def read_csv(path, required=()):
    """All rows of a datamining CSV as dicts keyed by the header row. Raises SchemaError naming the sheet and every
    column of `required` that the header lacks."""
    path = Path(path)
    with open(path, encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        header = set(reader.fieldnames or ())
        missing = [c for c in dict.fromkeys(required) if c not in header]
        if missing:
            hint = f'Did a game patch rename them? Update {FORMAT_PATH.name} or the generator.'
            raise SchemaError(f'{path.name} is missing column(s): {", ".join(missing)}. {hint}')
        return list(reader)


def item_columns():
    """The Item.csv columns gen_items.py reads."""
    pairs = [
        f'{c}[{i}]' for c in ('BaseParam', 'BaseParamValue', 'BaseParamSpecial', 'BaseParamValueSpecial') for i in range(N_ITEM_PARAMS)
    ]
    return ['Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique', *pairs]


def check_slot_percents(base_param_csv, fmt):
    """Every stat's BaseParam row must give each slot the `percent` of that slot in item-format.json (the slot share the
    page uses). Raises SchemaError listing each mismatch."""
    rows = {r['#']: r for r in read_csv(base_param_csv, ['#', *(s['baseParamColumn'] for s in fmt['slots'])])}
    problems = []
    for st in fmt['stats']:
        r = rows.get(str(st['baseParam']))
        if r is None:
            problems.append(f'no row {st["baseParam"]} ({st["key"]})')
            continue
        for s in fmt['slots']:
            if r[s['baseParamColumn']] != str(s['percent']):
                problems.append(f'{st["key"]} {s["baseParamColumn"]} = {r[s["baseParamColumn"]]}, page uses {s["percent"]}')
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} slot shares differ from {FORMAT_PATH.name}: ' + '; '.join(problems))


def run_main(main, *args):
    """Run a generator's main(); a SchemaError exits with status 1 and a one-line message instead of a traceback."""
    try:
        main(*args)
    except SchemaError as e:
        sys.exit(f'error: {e}')
