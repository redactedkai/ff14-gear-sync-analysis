"""Tests for scripts/data/gen_food.py (src/data/food.json).

Fixtures in tests/data/fixtures/food/ are real rows of Item, ItemAction and ItemFood from xivapi/ffxiv-datamining (Item
text fields blanked), picked to hit every rule: three kept meals (Rroneek au Gratin and Prune Ponzecake, item level 770,
two substats; Royal Toast, 656, one), a tincture (Medicine, also an ItemFood row), an ingredient with no action, meals
with flat bonuses (Battered Fish, Honey Bun; neither HQ-able), a Vitality-only meal (Princess Pudding) and a crafter meal
(Salt Cod, Control).

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import json
import shutil
import tempfile
import unittest
from collections.abc import Callable
from pathlib import Path
from typing import Any  # any-ok: parsed JSON of a generated file

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gen_food
from common import FIXTURES as SHEET_FIXTURES
from common import edit_csv
from item_format import SchemaError

FIXTURES = SHEET_FIXTURES / 'food'


def generate(csv_dir: Path | str) -> dict[str, Any]:  # any-ok: the parsed food.json, read by key in every test
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'food.json'
        gen_food.main(str(csv_dir), str(out), None)
        return json.loads(out.read_text(encoding='utf-8'))


class GenFoodTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc = generate(FIXTURES)

    def test_kept_meals_with_their_hq_substats(self) -> None:
        # HQ values of the real ItemFood rows; Vitality carried apart, as [percent, max]
        self.assertEqual(
            self.doc['foods'],
            [
                ['Royal Toast', 656, [['crit', 10, 107]], [10, 158]],
                ['Prune Ponzecake', 770, [['piety', 10, 151], ['det', 10, 91]], [10, 297]],
                ['Rroneek au Gratin', 770, [['sps', 10, 151], ['dh', 10, 91]], [10, 297]],
            ],
        )

    def test_left_out(self) -> None:
        names = {f[0] for f in self.doc['foods']}
        for name in ['Grade 4 Gemdraught of Mind', 'Popoto', 'Battered Fish', 'Honey Bun', 'Princess Pudding', 'Salt Cod']:
            self.assertNotIn(name, names)

    def test_provenance_unknown_for_fixtures(self) -> None:
        self.assertIsNone(self.doc['source'])
        self.assertIn('commit unknown', self.doc['_generated'])


class FoodSortTiesTest(unittest.TestCase):
    """Two meals that tie on item level and name come out in item id order, whatever order Item.csv lists them."""

    def stats_of_royal_toasts(self, copy_id: int, put_copy_first: bool) -> list[str]:
        """The substat lists of every Royal Toast made from a copy of the fixtures where the meal also appears as `copy_id`,
        with the action (so the stats) of Prune Ponzecake, listed before the original or after it."""
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copytree(FIXTURES, tmp, dirs_exist_ok=True)

            def add_copy(rows: list[list[str]]) -> None:
                header = rows[0]
                by_name = {row[header.index('Name')]: row for row in rows[1:]}
                original = by_name['Royal Toast']
                copy = list(original)
                copy[0] = str(copy_id)
                copy[header.index('ItemAction')] = by_name['Prune Ponzecake'][header.index('ItemAction')]
                rows.insert(rows.index(original) + (0 if put_copy_first else 1), copy)

            edit_csv(Path(tmp) / 'Item.csv', add_copy)
            foods = generate(tmp)['foods']
            return [(food[2][0][0]) for food in foods if food[0] == 'Royal Toast']

    def test_a_tie_is_ordered_by_item_id_not_by_file_order(self) -> None:
        # the original (44082) has one substat, crit; the copy has Prune Ponzecake's, led by piety
        for copy_id, put_copy_first in ((1, False), (1, True), (99999, False), (99999, True)):
            with self.subTest(copy_id=copy_id, put_copy_first=put_copy_first):
                expected = ['piety', 'crit'] if copy_id < 44082 else ['crit', 'piety']
                self.assertEqual(self.stats_of_royal_toasts(copy_id, put_copy_first), expected)


class FoodSchemaTest(unittest.TestCase):
    """Edited copies of the fixtures stop the generator."""

    def setUp(self) -> None:
        self.tmp: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory()
        self.dir: Path = Path(self.tmp.name)
        for f in FIXTURES.iterdir():
            shutil.copy(f, self.dir / f.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def edit(self, sheet: str, fn: Callable[[list[list[str]]], list[list[str]]]) -> None:
        path = self.dir / f'{sheet}.csv'
        with path.open(encoding='utf-8', newline='') as f:
            rows = list(csv.reader(f))
        rows = fn(rows)
        with path.open('w', encoding='utf-8', newline='') as f:
            csv.writer(f, lineterminator='\n').writerows(rows)

    def test_renamed_column(self) -> None:
        self.edit('ItemFood', lambda rows: [[c.replace('MaxHQ[0]', 'MaxHq[0]') for c in rows[0]], *rows[1:]])
        with self.assertRaisesRegex(SchemaError, r'ItemFood.csv is missing column\(s\): MaxHQ\[0\]'):
            generate(self.dir)

    def test_missing_food_row(self) -> None:
        # drop Rroneek au Gratin's ItemFood row (705)
        self.edit('ItemFood', lambda rows: [r for r in rows if r[0] != '705'])
        with self.assertRaisesRegex(SchemaError, r'Rroneek au Gratin.*ItemFood row 705'):
            generate(self.dir)

    def test_boolean_columns_other_than_true_false(self) -> None:
        # the exporter writing 1/0 for CanBeHq or IsRelative must stop the generator, not leave out every meal
        def to_digits(column: str) -> Callable[[list[list[str]]], list[list[str]]]:
            def fn(rows: list[list[str]]) -> list[list[str]]:
                cols = [i for i, c in enumerate(rows[0]) if c.startswith(column)]
                return [rows[0], *[[{'True': '1', 'False': '0'}.get(v, v) if i in cols else v for i, v in enumerate(r)] for r in rows[1:]]]

            return fn

        for sheet, column in (('Item', 'CanBeHq'), ('ItemFood', 'IsRelative')):
            with self.subTest(column=column):
                for f in FIXTURES.iterdir():
                    shutil.copy(f, self.dir / f.name)
                self.edit(sheet, to_digits(column))
                with self.assertRaisesRegex(SchemaError, rf"{sheet}.csv: expected True or False: {column}.*'1'"):
                    generate(self.dir)

    def test_bad_percent(self) -> None:
        def zero(rows: list[list[str]]) -> list[list[str]]:
            i = rows[0].index('ValueHQ[0]')
            return [rows[0], *[[*r[:i], '0', *r[i + 1 :]] if r[0] == '705' else r for r in rows[1:]]]

        self.edit('ItemFood', zero)
        with self.assertRaisesRegex(SchemaError, r'ItemFood row 705: sps HQ 0%'):
            generate(self.dir)


if __name__ == '__main__':
    unittest.main()
