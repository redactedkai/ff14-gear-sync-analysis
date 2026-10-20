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
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'food'
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))

import gen_food  # noqa: E402
from item_format import SchemaError  # noqa: E402


def generate(csv_dir):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'food.json'
        gen_food.main(str(csv_dir), str(out), None)
        return json.loads(out.read_text(encoding='utf-8'))


class GenFoodTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = generate(FIXTURES)

    def test_kept_meals_with_their_hq_substats(self):
        # HQ values of the real ItemFood rows; Vitality carried apart, as [percent, max]
        self.assertEqual(
            self.doc['foods'],
            [
                ['Royal Toast', 656, [['crit', 10, 107]], [10, 158]],
                ['Prune Ponzecake', 770, [['piety', 10, 151], ['det', 10, 91]], [10, 297]],
                ['Rroneek au Gratin', 770, [['sps', 10, 151], ['dh', 10, 91]], [10, 297]],
            ],
        )

    def test_left_out(self):
        names = {f[0] for f in self.doc['foods']}
        for name in ['Grade 4 Gemdraught of Mind', 'Popoto', 'Battered Fish', 'Honey Bun', 'Princess Pudding', 'Salt Cod']:
            self.assertNotIn(name, names)

    def test_provenance_unknown_for_fixtures(self):
        self.assertIsNone(self.doc['source'])
        self.assertIn('commit unknown', self.doc['_generated'])


class FoodSchemaTest(unittest.TestCase):
    """Edited copies of the fixtures stop the generator."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        for f in FIXTURES.iterdir():
            shutil.copy(f, self.dir / f.name)

    def tearDown(self):
        self.tmp.cleanup()

    def edit(self, sheet, fn):
        path = self.dir / f'{sheet}.csv'
        with open(path, encoding='utf-8', newline='') as f:
            rows = list(csv.reader(f))
        rows = fn(rows)
        with open(path, 'w', encoding='utf-8', newline='') as f:
            csv.writer(f, lineterminator='\n').writerows(rows)

    def test_renamed_column(self):
        self.edit('ItemFood', lambda rows: [[c.replace('MaxHQ[0]', 'MaxHq[0]') for c in rows[0]], *rows[1:]])
        with self.assertRaisesRegex(SchemaError, r'ItemFood.csv is missing column\(s\): MaxHQ\[0\]'):
            generate(self.dir)

    def test_missing_food_row(self):
        # drop Rroneek au Gratin's ItemFood row (705)
        self.edit('ItemFood', lambda rows: [r for r in rows if r[0] != '705'])
        with self.assertRaisesRegex(SchemaError, r'Rroneek au Gratin.*ItemFood row 705'):
            generate(self.dir)

    def test_boolean_columns_other_than_true_false(self):
        # the exporter writing 1/0 for CanBeHq or IsRelative must stop the generator, not leave out every meal
        def to_digits(column):
            def fn(rows):
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

    def test_bad_percent(self):
        def zero(rows):
            i = rows[0].index('ValueHQ[0]')
            return [rows[0], *[[*r[:i], '0', *r[i + 1 :]] if r[0] == '705' else r for r in rows[1:]]]

        self.edit('ItemFood', zero)
        with self.assertRaisesRegex(SchemaError, r'ItemFood row 705: sps HQ 0%'):
            generate(self.dir)


if __name__ == '__main__':
    unittest.main()
