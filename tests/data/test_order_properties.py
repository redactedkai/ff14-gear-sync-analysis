"""Property tests: a generator's output does not depend on the order of its input rows (item database, meal table, gear
groups). Hypothesis shuffles the data rows of every fixture CSV (the header stays first), or the item rows given to
gear_groups, and the output must be the same bytes. The item and meal fixtures carry a copy of one kept row under
another id, so ties on item level, slot and name are in play (the generators end their sort keys with the game id).

Settings: the 'generators' profile in common.py (deterministic, 12 examples, nothing written to the repo).

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import shutil
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path and registers the Hypothesis profile; first among our imports)
import gen_food
import gen_gear_groups
import gen_items
from common import FIXTURES, run_quiet
from hypothesis import given
from hypothesis import strategies as st
from item_format import SchemaError, load_format, row_fields

FOOD_FIXTURES = FIXTURES / 'food'
COPY_ID = '900001'  # the id of the copied row; no fixture item has it


def read_rows(path):
    with Path(path).open(encoding='utf-8', newline='') as f:
        return list(csv.reader(f))


def write_rows(path, rows):
    with Path(path).open('w', encoding='utf-8', newline='') as f:
        csv.writer(f, lineterminator='\n').writerows(rows)


def copy_with_tie(source_dir, target_dir, original_name):
    """Copy every CSV of source_dir into target_dir, adding to Item.csv a copy (id COPY_ID) of the row named
    `original_name` (a tie on every sort key but the id)."""
    for path in Path(source_dir).glob('*.csv'):
        shutil.copy(path, Path(target_dir) / path.name)
    rows = read_rows(Path(target_dir) / 'Item.csv')
    name_column = rows[0].index('Name')
    original = next(r for r in rows[1:] if r[name_column] == original_name)
    rows.append([COPY_ID, *original[1:]])
    write_rows(Path(target_dir) / 'Item.csv', rows)


def shuffle_all(csv_dir, rng):
    """Shuffle the data rows of every CSV in csv_dir, in place, with the Hypothesis-provided random generator."""
    for path in sorted(Path(csv_dir).glob('*.csv')):
        rows = read_rows(path)
        header, body = rows[0], rows[1:]
        rng.shuffle(body)
        write_rows(path, [header, *body])


class ItemDatabaseOrderTest(unittest.TestCase):
    """gen_items.main gives the same items.json whatever order the rows of the sheets are in."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.tmp.name) / 'base'
        cls.base.mkdir()
        copy_with_tie(FIXTURES, cls.base, 'Test Tank Helm')
        cls.expected = cls.generate(cls.base)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @staticmethod
    def generate(csv_dir):
        out = Path(csv_dir) / 'items.json.out'
        run_quiet(gen_items.main, str(csv_dir), str(out), None)
        return out.read_bytes()

    def test_the_tie_is_in_the_output(self):
        # the property is only worth something if the copied row is kept and ties with its original
        names = [line for line in self.expected.decode('utf-8').splitlines() if line.startswith('["Test Tank Helm"')]
        self.assertEqual(len(names), 2)

    @given(rng=st.randoms(use_true_random=False))
    def test_shuffled_sheets_give_the_same_file(self, rng):
        with tempfile.TemporaryDirectory() as tmp:
            for path in self.base.glob('*.csv'):
                shutil.copy(path, Path(tmp) / path.name)
            shuffle_all(tmp, rng)
            self.assertEqual(self.generate(tmp), self.expected)


class FoodOrderTest(unittest.TestCase):
    """gen_food.main gives the same food.json whatever order the rows of Item, ItemAction and ItemFood are in."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.tmp.name) / 'base'
        cls.base.mkdir()
        copy_with_tie(FOOD_FIXTURES, cls.base, 'Royal Toast')
        cls.expected = cls.generate(cls.base)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @staticmethod
    def generate(csv_dir):
        out = Path(csv_dir) / 'food.json.out'
        gen_food.main(str(csv_dir), str(out), None)
        return out.read_bytes()

    def test_the_tie_is_in_the_output(self):
        self.assertEqual(self.expected.decode('utf-8').count('["Royal Toast"'), 2)

    @given(rng=st.randoms(use_true_random=False))
    def test_shuffled_sheets_give_the_same_file(self, rng):
        with tempfile.TemporaryDirectory() as tmp:
            for path in self.base.glob('*.csv'):
                shutil.copy(path, Path(tmp) / path.name)
            shuffle_all(tmp, rng)
            self.assertEqual(self.generate(tmp), self.expected)


FMT = load_format()
FIELDS = row_fields(FMT)
JOB_COUNT = len(FMT['jobs'])
GROUP_SLOT_CODES = sorted(s['code'] for s in FMT['slots'] if s['type'] in FMT['gearGroups']['slotTypes'])


def item_row(slot_code, job_mask):
    """An item row with only the two fields gear_groups reads set."""
    row = [0] * len(FMT['itemRow']['fields'])
    row[FIELDS['slotCode']] = slot_code
    row[FIELDS['jobMask']] = job_mask
    return row


def outcome(rows):
    """The groups of `rows`, or the SchemaError message when the data is not clean (both must not depend on order)."""
    try:
        return gen_gear_groups.gear_groups(rows, FMT)
    except SchemaError as e:
        return str(e)


class GearGroupsOrderTest(unittest.TestCase):
    """gear_groups gives the same groups (or the same stop) whatever order the item rows are in."""

    @given(
        extra_rows=st.lists(
            st.tuples(st.sampled_from(GROUP_SLOT_CODES), st.integers(min_value=1, max_value=(1 << JOB_COUNT) - 1)),
            max_size=60,
        ),
        rng=st.randoms(use_true_random=False),
    )
    def test_shuffled_rows_give_the_same_groups(self, extra_rows, rng):
        # one piece every job wears in each slot, so no job is left without a piece, plus the random pieces
        rows = [item_row(slot, (1 << JOB_COUNT) - 1) for slot in GROUP_SLOT_CODES] + [item_row(*r) for r in extra_rows]
        shuffled = list(rows)
        rng.shuffle(shuffled)
        self.assertEqual(outcome(shuffled), outcome(rows))


if __name__ == '__main__':
    unittest.main()
