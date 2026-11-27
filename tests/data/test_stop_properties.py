"""Property tests: the generators stop on anything unknown instead of skipping it (SchemaError, which `run_main` turns
into exit status 1), and drop a row only by the selection rules of docs/engineering/data-pipeline.md section 4.1.

Strategy bounds come from the real tables: SubcategorySort codes next to CATEGORY_BY_CODE, activity names next to
ACTIVITY_BOX, and the fixture rows (real sheet headers) for the item rules.

Settings: the 'generators' profile in common.py (deterministic, 12 examples, nothing written to the repo).

Run: npm run test:py (npm run check:all runs them too)
"""

import shutil
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path and registers the Hypothesis profile; first among our imports)
import gear_activities
import gear_categories
import gen_items
from common import FIXTURES, edit_csv
from hypothesis import given
from hypothesis import strategies as st
from item_format import SchemaError, check_bools, check_ids, load_format, read_csv

WEAPON_SLOTS = {0, 1, 2}
TANK_HELM = 'Test Tank Helm'  # a kept dungeon piece (code 270), item level 130


def fixture_copy(directory: Path | str) -> None:
    for path in FIXTURES.glob('*.csv'):
        shutil.copy(path, Path(directory) / path.name)


def item_id_of(csv_dir: Path | str, name: str) -> str:
    return next(r['#'] for r in read_csv(Path(csv_dir) / 'Item.csv') if r['Name'] == name)


def set_item_cells(csv_dir: Path | str, item_id: str, cells: dict[str, str]) -> None:
    """Set `cells` ({column: value}) on the Item.csv row with id `item_id`, in place."""

    def edit(rows: list[list[str]]) -> None:
        header = rows[0]
        row = next(r for r in rows[1:] if r[0] == item_id)
        for column, value in cells.items():
            row[header.index(column)] = value

    edit_csv(Path(csv_dir) / 'Item.csv', edit)


class UnknownCodeStopsTest(unittest.TestCase):
    """A code, category or id the tables do not know stops the run, whatever the value."""

    @given(
        code=st.integers(min_value=0, max_value=999).filter(lambda c: c not in gear_categories.CATEGORY_BY_CODE),
        role=st.integers(min_value=0, max_value=60),
    )
    def test_an_unknown_subcategory_code_stops_the_categories(self, code: int, role: int) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture_copy(tmp)
            set_item_cells(tmp, item_id_of(tmp, TANK_HELM), {'SubcategorySort': str(role * gear_categories.CODE_DIVISOR + code)})
            kept = gen_items.select(tmp).kept
            with self.assertRaises(SchemaError) as stop:
                gear_categories.categorize(tmp, kept, WEAPON_SLOTS)
            self.assertIn(f'{code} (1 pieces)', str(stop.exception))

    @given(activity=st.text(max_size=20).filter(lambda a: a not in gear_activities.ACTIVITY_BOX))
    def test_an_activity_with_no_box_stops_the_routes(self, activity: str) -> None:
        boxes = gear_activities.Boxes({1: 100}, set(), {1: 'x'})
        with self.assertRaises(SchemaError):
            boxes.bit(activity, 1)

    @given(activity=st.sampled_from(sorted(gear_activities.ACTIVITY_BOX)))
    def test_every_activity_with_a_box_maps_to_a_bit(self, activity: str) -> None:
        # the other side of the stop above: a known activity never raises, at the level cap or below it
        boxes = gear_activities.Boxes({1: 100, 2: 90}, set(), {})
        for item in (1, 2):
            self.assertGreater(boxes.bit(activity, item), 0)

    @given(category=st.text(min_size=1, max_size=20).filter(lambda c: c not in gear_activities.DROP_ACTIVITY))
    def test_a_category_with_no_drop_activity_stops_the_routes(self, category: str) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture_copy(tmp)
            kept = gen_items.select(tmp).kept
            cats = {row['#']: 'dungeon' for row, _ in kept}
            cats[kept[0][0]['#']] = category
            with self.assertRaises(SchemaError) as stop:
                gear_activities.routes(tmp, kept, cats)
            self.assertIn(repr(category), str(stop.exception))

    @given(wrong_name=st.text(max_size=12).filter(lambda n: n != 'Kept Name'), item_id=st.integers(min_value=1, max_value=10**6))
    def test_a_hand_kept_id_naming_another_item_stops(self, wrong_name: str, item_id: int) -> None:
        expected = {item_id: 'Kept Name'}
        check_ids({item_id: 'Kept Name'}, expected, 'Item.csv', 'currency', 'T')
        with self.assertRaises(SchemaError):
            check_ids({item_id: wrong_name}, expected, 'Item.csv', 'currency', 'T')
        with self.assertRaises(SchemaError):
            check_ids({}, expected, 'Item.csv', 'currency', 'T')  # the id is gone

    @given(value=st.text(max_size=8).filter(lambda v: v not in ('True', 'False')))
    def test_a_boolean_column_with_another_value_stops(self, value: str) -> None:
        check_bools([{'CanBeHq': 'True'}, {'CanBeHq': 'False'}], ['CanBeHq'], 'Item.csv')
        with self.assertRaises(SchemaError):
            check_bools([{'CanBeHq': 'True'}, {'CanBeHq': value}], ['CanBeHq'], 'Item.csv')

    @given(missing=st.sets(st.sampled_from(['#', 'Name', 'Extra']), min_size=1))
    def test_a_missing_required_column_stops_read_csv(self, missing: set[str]) -> None:
        columns = ['#', 'Name', 'Extra']
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'Sheet.csv'
            path.write_text(','.join(c for c in columns if c not in missing) + '\n', encoding='utf-8')
            with self.assertRaises(SchemaError) as stop:
                read_csv(path, columns)
            for column in missing:
                self.assertIn(column, str(stop.exception))

    @given(extra=st.text(min_size=1, max_size=10).filter(lambda k: k not in gear_categories.CATEGORIES), repeat=st.booleans())
    def test_the_category_list_of_the_format_must_match_the_categories(self, extra: str, repeat: bool) -> None:
        gen_items.category_index(load_format())  # the shipped list is accepted
        with_unknown = load_format()
        with_unknown['category']['list'].append({'key': extra, 'label': extra})
        with self.assertRaises(SchemaError):
            gen_items.category_index(with_unknown)
        changed = load_format()
        if repeat:
            changed['category']['list'].append(changed['category']['list'][0])
        else:
            changed['category']['list'].pop()
        with self.assertRaises(SchemaError):
            gen_items.category_index(changed)


class DropRulesTest(unittest.TestCase):
    """select() leaves a row out only for a rule of section 4.1: no name, no slot, item level under 1, no combat job, no
    stats. The oracle is written from the doc, not from select()."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.tmp.name)
        fixture_copy(cls.base)
        rows = read_csv(cls.base / 'Item.csv')
        cls.stat_columns = [c for c in rows[0] if c.startswith(('BaseParamValue[', 'BaseParamValueSpecial['))]
        cls.total_rows = len(rows)
        cls.tank_id = item_id_of(cls.base, TANK_HELM)
        tank = next(r for r in rows if r['#'] == cls.tank_id)
        cls.tank_slot, cls.tank_job_category = tank['EquipSlotCategory'], tank['ClassJobCategory']
        cls.baseline = gen_items.select(cls.base)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_the_funnel_of_the_fixtures_adds_up(self) -> None:
        self.assertEqual(len(self.baseline.kept) + sum(self.baseline.dropped.values()), self.total_rows)
        self.assertIn(self.tank_id, {row['#'] for row, _ in self.baseline.kept})

    @given(
        has_name=st.booleans(),
        item_level=st.integers(min_value=0, max_value=3),
        has_job=st.booleans(),
        has_slot=st.booleans(),
        has_stats=st.booleans(),
    )
    def test_a_row_is_kept_exactly_when_it_passes_every_rule(
        self, has_name: bool, item_level: int, has_job: bool, has_slot: bool, has_stats: bool
    ) -> None:
        cells = {
            'Name': TANK_HELM if has_name else '',
            'LevelItem': str(item_level),
            'ClassJobCategory': self.tank_job_category if has_job else '0',
            'EquipSlotCategory': self.tank_slot if has_slot else '0',
        }
        if not has_stats:
            cells.update(dict.fromkeys(self.stat_columns, '0'))
        with tempfile.TemporaryDirectory() as tmp:
            fixture_copy(tmp)
            set_item_cells(tmp, self.tank_id, cells)
            selection = gen_items.select(tmp)
        kept_ids = {row['#'] for row, _ in selection.kept}
        self.assertEqual(self.tank_id in kept_ids, has_name and has_slot and item_level >= 1 and has_job and has_stats)
        # every other row is kept or dropped as before, and the funnel still adds up to the whole sheet
        self.assertEqual(kept_ids - {self.tank_id}, {row['#'] for row, _ in self.baseline.kept} - {self.tank_id})
        self.assertEqual(len(selection.kept) + sum(selection.dropped.values()), self.total_rows)


if __name__ == '__main__':
    unittest.main()
