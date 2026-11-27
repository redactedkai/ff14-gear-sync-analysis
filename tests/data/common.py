"""Shared helpers and constants for the data generator tests (tests/data/test_*.py).

Importing this module first puts scripts/data on sys.path, so a test file can then `import gen_items` and the like.
unittest discover starts in tests/data, which makes `import common` work from every test file.

Fixtures in tests/data/fixtures/ use the real sheet headers from xivapi/ffxiv-datamining. EquipSlotCategory and
ClassJobCategory rows, and the BaseParam rows of the 12 stats, are copied from the real sheets; Item rows are test items
built on the real header, plus the 84 real materia items of the seven combat substats (text fields blanked). Materia
holds the real rows 0, 2 (Strength: items, no values), the seven combat substats, 18 (a gathering stat) and two decoys
(44, 48: values but no items); MateriaGrade is the whole real sheet. ItemLevel values are synthetic (row * 1000 + column
position) so a wrong column shows up as a wrong number. ClassJob holds the real rows of the 23 combat jobs and one base
class (Gladiator). ParamGrow is not a fixture file: `write_param_grow` writes it in a test's setUp. The fixtures of
gen_food.py are in tests/data/fixtures/food/ (see test_gen_food.py).
"""

import contextlib
import csv
import io
import json
import sys
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / 'fixtures'
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))

# Raw stat order of a generated row (src/core/item-format.json), written out independently here.
STAT_ORDER = ['str', 'dex', 'int', 'mind', 'vit', 'piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps', 'mainAttr', 'secAttr']
ALL_JOBS_MASK = (1 << 23) - 1


def stats(**kw: int) -> str:
    """The raw stat columns of a generated row (in STAT_ORDER) as a comma-separated string; stats not given are 0."""
    return ','.join(str(kw.get(k, 0)) for k in STAT_ORDER)


TANK = stats(str=55, vit=59, ten=54, det=38)
HEAL = stats(mind=33, vit=32, piety=22, dh=6, sps=31)


def read_export(path: str | Path, name: str) -> Any:
    """The JSON value of `export const <name>=...;` in a generated JS file (other lines are ignored)."""
    prefix = f'export const {name}='
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if line.startswith(prefix):
            return json.loads(line[len(prefix) :].rstrip().rstrip(';'))
    raise AssertionError(f'{name} not found in {path}')


def run_quiet(fn: Callable[..., object], *args: object) -> None:
    """Call fn(*args) with its printed output discarded."""
    with contextlib.redirect_stdout(io.StringIO()):
        fn(*args)


PARAM_GROW_HEADER = [
    '#',
    'ExpToNext',
    'MpModifier',
    'BaseSpeed',
    'LevelModifier',
    'HuntingLogExpReward',
    'MonsterNoteSeals',
    'ScaledQuestXP',
    'HpModifier',
    'ItemLevelSync',
    'ProperDungeon',
    'ProperGuildOrder',
    'CraftingLevel',
    'AdditionalActions',
    'ApplyAction',
    'QuestExpModifier',
]


def write_param_grow(path: str | Path, levels: Iterable[int]) -> None:
    """ParamGrow rows for the given levels: BaseSpeed 1000+l, LevelModifier 2000+l, ItemLevelSync 3000+l."""
    with Path(path).open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(PARAM_GROW_HEADER)
        for lv in levels:
            row: dict[str, str | int] = dict.fromkeys(PARAM_GROW_HEADER, '0')
            row.update({'#': lv, 'BaseSpeed': 1000 + lv, 'LevelModifier': 2000 + lv, 'ItemLevelSync': 3000 + lv})
            w.writerow([row[k] for k in PARAM_GROW_HEADER])


JOBS = json.loads((ROOT / 'src' / 'core' / 'item-format.json').read_text(encoding='utf-8'))['jobs']


def add_shop(rows: list[list[str]], shop_id: str, listings: Iterable[tuple[str, str]]) -> None:
    """Append a SpecialShop row selling each (item, cost item) pair; rows is the CSV as lists, header first."""
    h = rows[0]
    row = ['0'] * len(h)
    row[h.index('#')], row[h.index('Name')] = shop_id, f'Test Shop {shop_id}'
    for k, (give, cost) in enumerate(listings):
        row[h.index(f'Item[{k}].Item[0]')] = give
        row[h.index(f'Item[{k}].ItemCost[0]')] = cost
    rows.append(row)


def edit_csv(path: str | Path, fn: Callable[[list[list[str]]], object]) -> None:
    """Rewrite a CSV in place: fn(rows) gets the rows as lists (header first) and changes them."""
    with Path(path).open(encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))
    fn(rows)
    with Path(path).open('w', encoding='utf-8', newline='') as f:
        csv.writer(f, lineterminator='\n').writerows(rows)


def rename_column(path: str | Path, old: str, new: str) -> None:
    """Rename a column of a CSV in place (the header cell `old` becomes `new`)."""

    def fn(rows: list[list[str]]) -> None:
        rows[0][rows[0].index(old)] = new

    edit_csv(path, fn)


# Hypothesis (property tests, tests/data/test_*_properties.py): one profile for every test file, registered here so that
# importing `common` is enough. Deterministic (derandomize), no example database on disk (nothing written into the
# repo), no deadline (a generator run on fixtures takes tens of milliseconds, and machines differ), few examples
# (each one runs a generator on a copy of the fixtures; the whole suite stays near 40 seconds).
try:
    from hypothesis import HealthCheck, settings

    settings.register_profile(
        'generators',
        derandomize=True,
        database=None,
        deadline=None,
        max_examples=12,
        suppress_health_check=[HealthCheck.too_slow],
    )
    settings.load_profile('generators')
except ImportError:  # the property tests need Hypothesis (requirements-dev.txt); the other tests do not
    pass
