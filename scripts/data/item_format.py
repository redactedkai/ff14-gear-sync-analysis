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


def check_bools(rows, columns, sheet):
    """Raises SchemaError when any of `columns` holds a value other than 'True' or 'False' in `rows` (dicts from
    read_csv), naming the sheet, the column and a few of the values found. The generators compare these columns with
    the string 'True', so an exporter that wrote booleans another way (1/0, true/false) would otherwise turn every
    value into false without notice (every HQ bonus gone, every piece tradeable)."""
    bad = []
    for column in columns:
        found = sorted({r[column] for r in rows} - {'True', 'False'})
        if found:
            bad.append(f'{column} has {", ".join(repr(v) for v in found[:5])}')
    if bad:
        raise SchemaError(
            f'{sheet}: expected True or False: {"; ".join(bad)}. Did the exporter change how it writes booleans? '
            'Update the generators that read these columns.'
        )


def item_columns():
    """The Item.csv columns gen_items.py reads (read_csv raises SchemaError on any that is missing)."""
    fmt = load_format()
    pairs = [
        f'{c}[{i}]' for c in ('BaseParam', 'BaseParamValue', 'BaseParamSpecial', 'BaseParamValueSpecial') for i in range(N_ITEM_PARAMS)
    ]
    cols = ['Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique', *pairs]
    materia = fmt['materia']
    trailing = [fmt['statFactor']['itemColumn'], materia['slotColumn'], materia['overmeldColumn']]
    extra = [e['itemColumn'] for e in fmt['damageDefense']['entries']]
    return [*cols, *trailing, fmt['rarity']['itemColumn'], fmt['levelScaled']['itemColumn'], *extra]


WEAPON_TYPES = ('weapon', 'offhand')  # slot types of weapons and shields
ACCESSORY_TYPES = ('ear', 'neck', 'wrist', 'ring')  # slot types of accessories (no dye slots on any of them)


def slot_codes(fmt, types):
    """The slot codes (item-format.json `slots`) whose type is one of `types`, for example slot_codes(fmt,
    ACCESSORY_TYPES) = {8, 9, 10, 11}."""
    return {s['code'] for s in fmt['slots'] if s['type'] in types}


def check_ids(names, expected, sheet, what, table):
    """Raises SchemaError when a hand-kept id no longer names what it was kept for. names: {id: name} of `sheet`;
    expected: {id: expected name}; what: what the ids are (for the message, e.g. 'currency'); table: the table and file
    to update, e.g. 'CURRENCIES (scripts/data/gear_activities.py)'. A patch that reuses an id thus stops the run
    instead of placing another item."""
    wrong = [f'{i} is {names.get(i)!r}, expected {name!r}' for i, name in expected.items() if names.get(i) != name]
    if wrong:
        hint = f'A patch reused the ids: find each by name in {sheet} and update its id in {table}.'
        raise SchemaError(f'{sheet}: {what} ids changed: ' + '; '.join(wrong) + '. ' + hint)


def row_fields(fmt):
    """{field name: position} of an items.json row, from `itemRow.fields` of item-format.json (name 0, slotCode 1, ...,
    defenseMag 19). The generators build and read rows by these names, never by position. Raises SchemaError when the
    `rowField` of another entry (materia.rowFields, rarity, gameId, levelScaled, category, the damageDefense entries)
    is not the position of its name in the list, so the two places in the file cannot disagree."""
    fields = fmt['itemRow']['fields']
    position = {name: i for i, name in enumerate(fields)}
    declared = {
        **fmt['materia']['rowFields'],
        'rarity': fmt['rarity']['rowField'],
        'gameId': fmt['gameId']['rowField'],
        'scales': fmt['levelScaled']['rowField'],
        'category': fmt['category']['rowField'],
        **{e['key']: e['rowField'] for e in fmt['damageDefense']['entries']},
    }
    wrong = [
        f'{name} rowField {at}, itemRow.fields has it at {position.get(name)}' for name, at in declared.items() if position.get(name) != at
    ]
    if len(position) != len(fields):
        wrong.append('a name is listed twice')
    if wrong:
        raise SchemaError(f'{FORMAT_PATH.name}: itemRow.fields and the rowField entries disagree: ' + '; '.join(wrong))
    return position


def meld_fields(row, fmt):
    """(meldSlots, overmeld) of an Item.csv row: the guaranteed materia slots (0 to `maxSlots`) and 1 when overmelding is
    allowed. None when either value is out of range or not of the expected form; the caller lists those and raises."""
    m = fmt['materia']
    slots, over = row[m['slotColumn']], row[m['overmeldColumn']]
    if not (slots.isdigit() and int(slots) <= m['maxSlots']) or over not in ('True', 'False'):
        return None
    return int(slots), 1 if over == 'True' else 0


def stat_factors(base_param_csv, fmt, entries=None):
    """The per-item stat factor table: {stat key: [percent for item kind 0..count-1]}, read from each stat's BaseParam
    row (`statFactor` in item-format.json). An Item row's BaseParamModifier picks the kind. `entries`: the {key,
    baseParam} rows to read, the stats by default (gen_item_level.py also reads the `damageDefense` entries). Raises
    SchemaError on a missing column or stat row, or a value that is not a percent from 1 to 100."""
    sf = fmt['statFactor']
    cols = [f'{sf["baseParamColumn"]}[{i}]' for i in range(sf['count'])]
    rows = {r['#']: r for r in read_csv(base_param_csv, ['#', *cols])}
    table, problems = {}, []
    for st in fmt['stats'] if entries is None else entries:
        r = rows.get(str(st['baseParam']))
        if r is None:
            problems.append(f'no row {st["baseParam"]} ({st["key"]})')
            continue
        vals = [r[c] for c in cols]
        if not all(v.isdigit() and 1 <= int(v) <= 100 for v in vals):
            problems.append(f'{st["key"]} {sf["baseParamColumn"]} = {",".join(vals)}, expected percents 1 to 100')
            continue
        table[st['key']] = [int(v) for v in vals]
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} stat factors: ' + '; '.join(problems))
    return table


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


def slot_shares(base_param_csv, fmt, entries):
    """{key: [slot share in thousandths per slot code]} for each {key, baseParam} entry, read from its BaseParam row's
    slot columns (each slot's `baseParamColumn`, in slot code order). For values whose shares differ from the stats'
    (`damageDefense` in item-format.json: weapon damage only on weapons, defense only on armor). Raises SchemaError on
    a missing row or a share that is not a whole number."""
    slots = sorted(fmt['slots'], key=lambda s: s['code'])
    if [s['code'] for s in slots] != list(range(len(slots))):
        raise SchemaError(f'{FORMAT_PATH.name} slot codes are not 0..{len(slots) - 1}')
    rows = {r['#']: r for r in read_csv(base_param_csv, ['#', *(s['baseParamColumn'] for s in slots)])}
    table, problems = {}, []
    for e in entries:
        r = rows.get(str(e['baseParam']))
        if r is None:
            problems.append(f'no row {e["baseParam"]} ({e["key"]})')
            continue
        vals = [r[s['baseParamColumn']] for s in slots]
        if not all(v.isdigit() for v in vals):
            problems.append(f'{e["key"]} slot shares {",".join(vals)}, expected whole numbers')
            continue
        table[e['key']] = [int(v) for v in vals]
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} slot shares: ' + '; '.join(problems))
    return table


def run_main(main, *args):
    """Run a generator's main(); a SchemaError exits with status 1 and a one-line message instead of a traceback."""
    try:
        main(*args)
    except SchemaError as e:
        sys.exit(f'error: {e}')
