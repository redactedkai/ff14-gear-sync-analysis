"""Tests for scripts/data/gen_gear_groups.py (src/data/gear-groups.json): the gear groups, from item rows built in the
tests and from the shipped item database. No CSV fixtures.

Run: npm run test:py (npm run check:all runs them too)
"""

import json
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gen_gear_groups
from common import (
    ROOT,
    run_quiet,
)
from item_format import ItemCell, ItemFormat, SchemaError, load_format, row_fields


class GenGearGroupsTest(unittest.TestCase):
    """gen_gear_groups.py: the gear groups (jobs sharing 80 percent of their head, body, hands, legs and feet pieces, with
    the same level cap) from item rows, and from the shipped item database."""

    def setUp(self) -> None:
        self.fmt: ItemFormat = load_format()
        self.fields: dict[str, int] = row_fields(self.fmt)

    def row(self, slot_code: int, jobs: list[str]) -> list[ItemCell]:
        """An item row (name, slot code and job mask only; the generator reads nothing else) wearable by `jobs`."""
        row: list[ItemCell] = [0] * len(self.fmt['itemRow']['fields'])
        row[self.fields['name']] = 'x'
        row[self.fields['slotCode']] = slot_code
        row[self.fields['jobMask']] = sum(1 << self.fmt['jobs'].index(j) for j in jobs)
        return row

    def rows(self, shares: list[tuple[list[str], int]]) -> list[list[ItemCell]]:
        """Rows for `shares`, [(jobs, how many body pieces only those jobs wear)]: a body piece (slot code 4) per entry
        copy, plus one weapon (code 0) for every job, which is left out of the count."""
        every_job: list[str] = self.fmt['jobs']
        out = [self.row(0, every_job)]
        for jobs, count in shares:
            out += [self.row(4, jobs) for _ in range(count)]
        return out

    def test_groups_are_jobs_linked_pairwise_with_the_same_level_cap(self) -> None:
        # PLD and WAR share 100 of 101 pieces; BLM, RDM and BLU share all theirs, but BLU has another level cap
        every_other: list[str] = [j for j in self.fmt['jobs'] if j not in ('PLD', 'WAR', 'BLM', 'RDM', 'BLU')]
        rows: list[list[ItemCell]] = self.rows(
            [(['PLD', 'WAR'], 100), (['PLD'], 1), (['BLM', 'RDM', 'BLU'], 100)] + [([j], 100) for j in every_other]
        )
        groups: list[list[str]] = gen_gear_groups.gear_groups(rows, self.fmt)
        self.assertIn(['PLD', 'WAR'], groups)
        self.assertIn(['BLM', 'RDM'], groups)
        self.assertIn(['BLU'], groups)  # same gear, but level cap 80
        self.assertEqual(sorted(j for g in groups for j in g), sorted(self.fmt['jobs']))

    def test_threshold_is_shared_over_either(self) -> None:
        # PLD wears 100 pieces, WAR wears 80 of them: 80 / 100 shared, exactly the link percent
        rest: list[tuple[list[str], int]] = [([j], 100) for j in self.fmt['jobs'] if j not in ('PLD', 'WAR')]
        groups: list[list[str]] = gen_gear_groups.gear_groups(self.rows([(['PLD', 'WAR'], 80), (['PLD'], 20), *rest]), self.fmt)
        self.assertIn(['PLD', 'WAR'], groups)
        # 79 percent is in the gap between linked and clearly apart, so the generator stops
        with self.assertRaisesRegex(SchemaError, 'not clear'):
            _ = gen_gear_groups.gear_groups(self.rows([(['PLD', 'WAR'], 79), (['PLD'], 21), *rest]), self.fmt)
        # 40 / 140 shared: apart
        groups = gen_gear_groups.gear_groups(self.rows([(['PLD', 'WAR'], 40), (['PLD'], 60), (['WAR'], 60), *rest]), self.fmt)
        self.assertIn(['PLD'], groups)

    def test_unclear_data_stops_the_generator(self) -> None:
        rest: list[tuple[list[str], int]] = [([j], 100) for j in self.fmt['jobs'] if j not in ('PLD', 'WAR')]
        # 70 shared of 130 pieces either wears (54 percent) is neither linked nor clearly apart
        with self.assertRaisesRegex(SchemaError, 'not clear'):
            _ = gen_gear_groups.gear_groups(self.rows([(['PLD', 'WAR'], 70), (['PLD'], 30), (['WAR'], 30), *rest]), self.fmt)
        # a job that can wear nothing: the job mask order is probably wrong
        with self.assertRaisesRegex(SchemaError, 'can wear no piece'):
            _ = gen_gear_groups.gear_groups([self.row(0, self.fmt['jobs'])], self.fmt)

    def test_shipped_groups_follow_the_shipped_items(self) -> None:
        items = json.loads((ROOT / 'src' / 'data' / 'items.json').read_text(encoding='utf-8'))
        shipped = json.loads((ROOT / 'src' / 'data' / 'gear-groups.json').read_text(encoding='utf-8'))
        groups: list[list[str]] = gen_gear_groups.gear_groups(items['items'], self.fmt)
        self.assertEqual(shipped['groups'], groups)
        self.assertEqual(shipped['source'], items['source'])
        # the measured table: nine groups, the two limited jobs alone
        self.assertEqual(
            groups,
            [['PLD', 'WAR', 'DRK', 'GNB'], ['WHM', 'SCH', 'AST', 'SGE'], ['MNK', 'SAM'], ['DRG', 'RPR'], ['NIN', 'VPR'],
             ['BRD', 'MCH', 'DNC'], ['BLM', 'SMN', 'RDM', 'PCT'], ['BLU'], ['BST']],
        )  # fmt: skip

    def test_output_is_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / 'a.json', Path(tmp) / 'b.json'
            run_quiet(gen_gear_groups.main, str(ROOT / 'src' / 'data' / 'items.json'), str(first))
            run_quiet(gen_gear_groups.main, str(ROOT / 'src' / 'data' / 'items.json'), str(second))
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(first.read_bytes(), (ROOT / 'src' / 'data' / 'gear-groups.json').read_bytes())
