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
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from csv import DictReader
from pathlib import Path
from typing import NotRequired, TypedDict

ROOT: Path = Path(__file__).resolve().parents[2]
FORMAT_PATH: Path = ROOT / 'src' / 'core' / 'item-format.json'
N_ITEM_PARAMS: int = 6  # stat pairs per Item row (BaseParam[0..5], plus the same number of HQ pairs)


# The shape of src/core/item-format.json. Keys starting with `_` are comments in the file, so they are NotRequired;
# tests/data/test_item_format_types.py checks that these classes and the file list the same keys.
class StatEntry(TypedDict):
    key: str
    baseParam: int
    itemLevelColumn: str


class CrafterGathererParam(TypedDict):
    baseParam: int
    name: str


class Slot(TypedDict):
    code: int
    type: str
    equipSlotColumn: str
    twoHanded: NotRequired[bool]
    blocks: NotRequired[list[str]]
    percent: int
    baseParamColumn: str


class Activity(TypedDict):
    key: str
    label: str
    section: str
    on: bool
    hint: str


class GearGroupsFormat(TypedDict):
    _comment: NotRequired[str]
    slotTypes: list[str]
    linkPercent: int
    unlinkedPercentMax: int


class ItemRowFormat(TypedDict):
    _comment: NotRequired[str]
    fields: list[str]


class OvermeldColumns(TypedDict):
    nq: str
    hq: str


class MateriaRowFields(TypedDict):
    meldSlots: int
    overmeld: int


class MateriaFormat(TypedDict):
    _comment: NotRequired[str]
    sheet: str
    itemColumn: str
    valueColumn: str
    statColumn: str
    grades: int
    statKeys: list[str]
    gateColumn: str
    gradeSheet: str
    highColumn: str
    overmeldColumns: OvermeldColumns
    overmeldSlots: int
    slotColumn: str
    overmeldColumn: str
    maxSlots: int
    rowFields: MateriaRowFields


class RarityFormat(TypedDict):
    _comment: NotRequired[str]
    itemColumn: str
    rowField: int


class GameIdFormat(TypedDict):
    _comment: NotRequired[str]
    itemColumn: str
    rowField: int


class LevelScaledFormat(TypedDict):
    _comment: NotRequired[str]
    itemColumn: str
    value: int
    known: list[int]
    rowField: int


class CategoryEntry(TypedDict):
    key: str
    label: str


class CategoryFormat(TypedDict):
    _comment: NotRequired[str]
    rowField: int
    list: list[CategoryEntry]


class DamageDefenseEntry(TypedDict):
    key: str
    itemColumn: str
    baseParam: int
    itemLevelColumn: str
    rowField: int


class DamageDefenseFormat(TypedDict):
    _comment: NotRequired[str]
    entries: list[DamageDefenseEntry]


class StatFactorFormat(TypedDict):
    _comment: NotRequired[str]
    itemColumn: str
    baseParamColumn: str
    count: int


class AttributeColumns(TypedDict):
    str: str
    dex: str
    int: str
    mind: str
    vit: str


def attribute_columns(columns: AttributeColumns) -> dict[str, str]:
    """{attribute key: CSV column name} of an AttributeColumns, as a plain dict a loop can go over (a TypedDict's items()
    are typed `object`)."""
    return {'str': columns['str'], 'dex': columns['dex'], 'int': columns['int'], 'mind': columns['mind'], 'vit': columns['vit']}


class JobModifiersFormat(TypedDict):
    _comment: NotRequired[str]
    columns: AttributeColumns


class ClansFormat(TypedDict):
    _comment: NotRequired[str]
    count: int
    raceCount: int
    tribesPerRace: int
    nameColumn: str
    columns: AttributeColumns


class FoodFormat(TypedDict):
    _comment: NotRequired[str]
    uiCategoryColumn: str
    uiCategory: int
    actionColumn: str
    actions: list[int]
    status: int
    foodRowColumn: str
    stats: list[str]
    carried: list[str]
    vitality: str


class ItemFormat(TypedDict):
    _comment: NotRequired[str]
    formatVersion: int
    jobs: list[str]
    _jobLevelCapsNote: NotRequired[str]
    jobLevelCaps: dict[str, int]
    _statlessWeaponJobsNote: NotRequired[str]
    statlessWeaponJobs: list[str]
    gearGroups: GearGroupsFormat
    stats: list[StatEntry]
    crafterGathererParams: list[CrafterGathererParam]
    slots: list[Slot]
    activities: list[Activity]
    itemRow: ItemRowFormat
    materia: MateriaFormat
    rarity: RarityFormat
    gameId: GameIdFormat
    levelScaled: LevelScaledFormat
    category: CategoryFormat
    damageDefense: DamageDefenseFormat
    statFactor: StatFactorFormat
    jobModifiers: JobModifiersFormat
    clans: ClansFormat
    food: FoodFormat


class Piece(TypedDict):
    """A kept piece of gear while the item database is built (gen_items.make_piece): the row's fields by their
    `itemRow.fields` name, plus `flags` (gear_sources.FLAGS bits, for the categories, not written to items.json). `routes`
    and `category` are added by gen_items.main once the routes and categories are known. The output rows stay plain
    lists; this type is only for the in-memory step."""

    name: str
    slotCode: int
    ilvl: int
    equipLevel: int
    jobMask: int
    stats: str
    unique: int
    hq: int
    kind: int
    meldSlots: int
    overmeld: int
    rarity: int
    gameId: int
    scales: int
    damagePhys: int
    damageMag: int
    defensePhys: int
    defenseMag: int
    flags: int
    routes: NotRequired[list[int]]
    category: NotRequired[int]


class BaseParamRef(TypedDict):
    """What stat_factors and slot_shares need of an entry: the stat or value's `key` and its BaseParam row. StatEntry and
    DamageDefenseEntry both fit it."""

    key: str
    baseParam: int


class SchemaError(Exception):
    """The datamining CSVs no longer match what the generators and src/core/item-format.json expect."""


def load_format() -> ItemFormat:
    """The parsed src/core/item-format.json, typed as ItemFormat (the types are checked against the file by a test)."""
    with FORMAT_PATH.open(encoding='utf-8') as f:
        return json.load(f)


Row = dict[str, str]  # one CSV row: header name -> cell text (every cell is a string, empty when blank)
ItemCell = str | int | list[int]  # one cell of an items.json row: the name, a whole number, or the stat list
ItemRow = Sequence[ItemCell]  # one row of items.json (read only), its cells in the order of `itemRow.fields`


def whole(row: ItemRow, index: int) -> int:
    """The whole number in cell `index` of an items.json row; raises SchemaError when the cell holds anything else (a name or
    the stat list), which means `itemRow.fields` no longer matches the rows."""
    cell: int | list[int] | str = row[index]
    if isinstance(cell, bool) or not isinstance(cell, int):
        raise SchemaError(f'items.json row {row[0]!r}: cell {index} is {cell!r}, expected a whole number')
    return cell


def whole_list(row: ItemRow, index: int) -> list[int]:
    """The list of whole numbers in cell `index` of an items.json row (the stats, the routes); raises SchemaError when the
    cell holds anything else."""
    cell: int | list[int] | str = row[index]
    if not isinstance(cell, list):
        raise SchemaError(f'items.json row {row[0]!r}: cell {index} is {cell!r}, expected a list of whole numbers')
    return cell


def read_csv(path: str | Path, required: Iterable[str] = ()) -> list[Row]:
    """All rows of a datamining CSV as dicts keyed by the header row. Raises SchemaError naming the sheet and every
    column of `required` that the header lacks."""
    path = Path(path)
    with path.open(encoding='utf-8', newline='') as f:
        reader: DictReader[str] = csv.DictReader(f)
        header: set[str] = set(reader.fieldnames or ())
        missing: list[str] = [c for c in dict.fromkeys(required) if c not in header]
        if missing:
            hint: str = f'Did a game patch rename them? Update {FORMAT_PATH.name} or the generator.'
            raise SchemaError(f'{path.name} is missing column(s): {", ".join(missing)}. {hint}')
        return list(reader)


def check_bools(rows: Iterable[Row], columns: Iterable[str], sheet: str) -> None:
    """Raises SchemaError when any of `columns` holds a value other than 'True' or 'False' in `rows` (dicts from
    read_csv), naming the sheet, the column and a few of the values found. The generators compare these columns with
    the string 'True', so an exporter that wrote booleans another way (1/0, true/false) would otherwise turn every
    value into false without notice (every HQ bonus gone, every piece tradeable)."""
    bad: list[str] = []
    for column in columns:
        found: list[str] = sorted({r[column] for r in rows} - {'True', 'False'})
        if found:
            bad.append(f'{column} has {", ".join(repr(v) for v in found[:5])}')
    if bad:
        raise SchemaError(
            f'{sheet}: expected True or False: {"; ".join(bad)}. Did the exporter change how it writes booleans? '
            'Update the generators that read these columns.'
        )


def item_columns() -> list[str]:
    """The Item.csv columns the item database generator reads: gen_items.py and, through it, gear_categories.py and
    gear_activities.py (read_csv raises SchemaError on any that is missing)."""
    fmt: ItemFormat = load_format()
    pairs: list[str] = [
        f'{c}[{i}]' for c in ('BaseParam', 'BaseParamValue', 'BaseParamSpecial', 'BaseParamValueSpecial') for i in range(N_ITEM_PARAMS)
    ]
    cols: list[str] = ['Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique', *pairs]
    materia: MateriaFormat = fmt['materia']
    trailing: list[str] = [fmt['statFactor']['itemColumn'], materia['slotColumn'], materia['overmeldColumn']]
    extra: list[str] = [e['itemColumn'] for e in fmt['damageDefense']['entries']]
    categories: list[str] = ['SubcategorySort', 'DyeCount']  # gear_categories.py
    routes: list[str] = ['IsUntradable']  # gear_activities.py
    item_row: list[str] = [fmt['rarity']['itemColumn'], fmt['levelScaled']['itemColumn'], *extra]
    return ['#', *cols, *trailing, *item_row, *categories, *routes, materia['gateColumn']]


def read_item_sheet(csv_dir: str | Path, items: list[Row] | None = None) -> list[Row]:
    """All rows of Item.csv (dicts, as read_csv gives them), checked for every column of item_columns(). `items`: rows
    read already, returned as they are, so the item database generator reads the largest sheet once and passes it on
    to the functions that need it; each of them reads it itself when called alone (tests, gear_categories.py)."""
    return items if items is not None else read_csv(Path(csv_dir) / 'Item.csv', item_columns())


WEAPON_TYPES: tuple[str, str] = ('weapon', 'offhand')  # slot types of weapons and shields
ACCESSORY_TYPES: tuple[str, str, str, str] = ('ear', 'neck', 'wrist', 'ring')  # slot types of accessories (no dye slots on any of them)


def slot_codes(fmt: ItemFormat, types: Collection[str]) -> set[int]:
    """The slot codes (item-format.json `slots`) whose type is one of `types`, for example slot_codes(fmt,
    ACCESSORY_TYPES) = {8, 9, 10, 11}."""
    return {s['code'] for s in fmt['slots'] if s['type'] in types}


def check_ids(names: Mapping[int, str], expected: Mapping[int, str], sheet: str, what: str, table: str) -> None:
    """Raises SchemaError when a hand-kept id no longer names what it was kept for. names: {id: name} of `sheet`;
    expected: {id: expected name}; what: what the ids are (for the message, e.g. 'currency'); table: the table and file
    to update, e.g. 'CURRENCIES (scripts/data/gear_activities.py)'. A patch that reuses an id thus stops the run
    instead of placing another item."""
    wrong: list[str] = [f'{i} is {names.get(i)!r}, expected {name!r}' for i, name in expected.items() if names.get(i) != name]
    if wrong:
        hint: str = f'A patch reused the ids: find each by name in {sheet} and update its id in {table}.'
        raise SchemaError(f'{sheet}: {what} ids changed: ' + '; '.join(wrong) + '. ' + hint)


def row_fields(fmt: ItemFormat) -> dict[str, int]:
    """{field name: position} of an items.json row, from `itemRow.fields` of item-format.json (name 0, slotCode 1, ...,
    defenseMag 19). The generators build and read rows by these names, never by position. Raises SchemaError when the
    `rowField` of another entry (materia.rowFields, rarity, gameId, levelScaled, category, the damageDefense entries)
    is not the position of its name in the list, so the two places in the file cannot disagree."""
    fields: list[str] = fmt['itemRow']['fields']
    position: dict[str, int] = {name: i for i, name in enumerate(fields)}
    declared: dict[str, int | object] = {
        **fmt['materia']['rowFields'],
        'rarity': fmt['rarity']['rowField'],
        'gameId': fmt['gameId']['rowField'],
        'scales': fmt['levelScaled']['rowField'],
        'category': fmt['category']['rowField'],
        **{e['key']: e['rowField'] for e in fmt['damageDefense']['entries']},
    }
    wrong: list[str] = [
        f'{name} rowField {at}, itemRow.fields has it at {position.get(name)}' for name, at in declared.items() if position.get(name) != at
    ]
    if len(position) != len(fields):
        wrong.append('a name is listed twice')
    if wrong:
        raise SchemaError(f'{FORMAT_PATH.name}: itemRow.fields and the rowField entries disagree: ' + '; '.join(wrong))
    return position


def meld_fields(row: Row, fmt: ItemFormat) -> tuple[int, int] | None:
    """(meldSlots, overmeld) of an Item.csv row: the guaranteed materia slots (0 to `maxSlots`) and 1 when overmelding is
    allowed. None when either value is out of range or not of the expected form; the caller lists those and raises."""
    m: MateriaFormat = fmt['materia']
    slots, over = row[m['slotColumn']], row[m['overmeldColumn']]
    if not (slots.isdigit() and int(slots) <= m['maxSlots']) or over not in ('True', 'False'):
        return None
    return int(slots), 1 if over == 'True' else 0


def stat_factors(base_param_csv: str | Path, fmt: ItemFormat, entries: Sequence[BaseParamRef] | None = None) -> dict[str, list[int]]:
    """The per-item stat factor table: {stat key: [percent for item kind 0..count-1]}, read from each stat's BaseParam
    row (`statFactor` in item-format.json). An Item row's BaseParamModifier picks the kind. `entries`: the {key,
    baseParam} rows to read, the stats by default (gen_item_level.py also reads the `damageDefense` entries). Raises
    SchemaError on a missing column or stat row, or a value that is not a percent from 1 to 100."""
    sf: StatFactorFormat = fmt['statFactor']
    cols: list[str] = [f'{sf["baseParamColumn"]}[{i}]' for i in range(sf['count'])]
    rows: dict[str, dict[str, str]] = {r['#']: r for r in read_csv(base_param_csv, ['#', *cols])}
    table: dict[str, list[int]] = {}
    problems: list[str] = []
    for st in fmt['stats'] if entries is None else entries:
        r = rows.get(str(st['baseParam']))
        if r is None:
            problems.append(f'no row {st["baseParam"]} ({st["key"]})')
            continue
        vals: list[str] = [r[c] for c in cols]
        if not all(v.isdigit() and 1 <= int(v) <= 100 for v in vals):
            problems.append(f'{st["key"]} {sf["baseParamColumn"]} = {",".join(vals)}, expected percents 1 to 100')
            continue
        table[st['key']] = [int(v) for v in vals]
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} stat factors: ' + '; '.join(problems))
    return table


def check_slot_percents(base_param_csv: str | Path, fmt: ItemFormat) -> None:
    """Every stat's BaseParam row must give each slot the `percent` of that slot in item-format.json (the slot share the
    page uses). Raises SchemaError listing each mismatch."""
    rows: dict[str, dict[str, str]] = {r['#']: r for r in read_csv(base_param_csv, ['#', *(s['baseParamColumn'] for s in fmt['slots'])])}
    problems: list[str] = []
    for st in fmt['stats']:
        r = rows.get(str(st['baseParam']))
        if r is None:
            problems.append(f'no row {st["baseParam"]} ({st["key"]})')
            continue
        problems.extend(
            f'{st["key"]} {s["baseParamColumn"]} = {r[s["baseParamColumn"]]}, page uses {s["percent"]}'
            for s in fmt['slots']
            if r[s['baseParamColumn']] != str(s['percent'])
        )
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} slot shares differ from {FORMAT_PATH.name}: ' + '; '.join(problems))


def slot_shares(base_param_csv: str | Path, fmt: ItemFormat, entries: Sequence[BaseParamRef]) -> dict[str, list[int]]:
    """{key: [slot share in thousandths per slot code]} for each {key, baseParam} entry, read from its BaseParam row's
    slot columns (each slot's `baseParamColumn`, in slot code order). For values whose shares differ from the stats'
    (`damageDefense` in item-format.json: weapon damage only on weapons, defense only on armor). Raises SchemaError on
    a missing row or a share that is not a whole number."""
    slots: list[Slot] = sorted(fmt['slots'], key=lambda s: s['code'])
    if [s['code'] for s in slots] != list(range(len(slots))):
        raise SchemaError(f'{FORMAT_PATH.name} slot codes are not 0..{len(slots) - 1}')
    rows: dict[str, dict[str, str]] = {r['#']: r for r in read_csv(base_param_csv, ['#', *(s['baseParamColumn'] for s in slots)])}
    table: dict[str, list[int]] = {}
    problems: list[str] = []
    for e in entries:
        r = rows.get(str(e['baseParam']))
        if r is None:
            problems.append(f'no row {e["baseParam"]} ({e["key"]})')
            continue
        vals: list[str] = [r[s['baseParamColumn']] for s in slots]
        if not all(v.isdigit() for v in vals):
            problems.append(f'{e["key"]} slot shares {",".join(vals)}, expected whole numbers')
            continue
        table[e['key']] = [int(v) for v in vals]
    if problems:
        raise SchemaError(f'{Path(base_param_csv).name} slot shares: ' + '; '.join(problems))
    return table


def run_main(main: Callable[..., object], *args: object) -> None:
    """Run a generator's main(); a SchemaError exits with status 1 and a one-line message instead of a traceback."""
    try:
        main(*args)
    except SchemaError as e:
        sys.exit(f'error: {e}')
