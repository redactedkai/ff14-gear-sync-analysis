"""Tests for scripts/data/summary.py (summary.json): the counts, the drift between two runs and the changelog line. No
fixtures.

Run: npm run test:py (npm run check:all runs them too)
"""

import unittest
from typing import ClassVar

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import provenance
import summary
from item_format import ItemCell, ItemFormat, ItemRow, load_format


class SummaryTest(unittest.TestCase):
    """summary.py: the counts of summary.json, the drift between two runs and the changelog line."""

    FMT: ClassVar[ItemFormat] = load_format()
    REPORT: ClassVar[summary.ItemReport] = {
        'itemSheetRows': 10,
        'dropped': {'name': 4},
        'leftOut': {},
        'dangling': {},
        'inferredPieces': {'Dungeon': 1},
        'inferredCurrencies': {},
    }

    def item_row(self, name: str, slot_code: int, ilvl: int, routes: list[int], category: int) -> ItemRow:
        """A row of items.json in the real field order: the given cells, every other one 0."""
        fields = self.FMT['itemRow']['fields']
        cells: dict[str, ItemCell] = {field: 0 for field in fields}  # noqa: C420 (the value type is wider than int)
        cells.update({'name': name, 'slotCode': slot_code, 'ilvl': ilvl, 'routes': routes, 'category': category})
        return [cells[field] for field in fields]

    def test_counts(self) -> None:
        # routes: one mask per source, bit i for the i-th box; the market board is the bit after the last activity
        boxes = [a['key'] for a in self.FMT['activities']]
        market_bit = 1 << len(boxes)
        categories = [c['key'] for c in self.FMT['category']['list']]
        crafted, dungeon = categories.index('crafted'), categories.index('dungeon')
        rows = [
            self.item_row('A', 3, 100, [1 << boxes.index('crafted'), market_bit], crafted),
            self.item_row('B', 3, 90, [1 << boxes.index('quests')], dungeon),
            self.item_row('C', 11, 50, [], dungeon),
        ]
        counts = summary.summarize({'items': rows}, {'foods': [[], []]}, self.REPORT, self.FMT)
        self.assertEqual((counts['rows'], counts['maxIlvl'], counts['noRoute'], counts['meals']), (3, 100, 1, 2))
        self.assertEqual(counts['bySlot'], {'3': 2, '11': 1})
        self.assertEqual(counts['byCategory'], {'crafted': 1, 'dungeon': 2})
        by_box = counts['byBox']
        assert isinstance(by_box, dict)
        self.assertEqual(
            {box: by_box[box] for box in ('quests', 'crafted', 'market_board')}, {'quests': 1, 'crafted': 1, 'market_board': 1}
        )
        self.assertEqual(counts['dropped'], {'name': 4})

    def test_drift(self) -> None:
        old = {'rows': 20000, 'byCategory': {'savage': 1000, 'event': 4, 'old': 7}}
        new = {'rows': 21000, 'byCategory': {'savage': 500, 'event': 9, 'fresh': 12}}
        # rows +5% and event +5 stay quiet; savage -50% is reported, so are a category gone and a new one
        self.assertEqual(
            summary.drift(old, new),
            ['byCategory.fresh new: 12', 'byCategory.old gone (was 7)', 'byCategory.savage 1,000 -> 500 (-50%)'],
        )
        self.assertEqual(summary.drift(new, new), [])

    def test_changelog_line(self) -> None:
        source = provenance.make('d9582a624eaec69d45649366dee801c2f3a6e9b3', '2026-09-30T03:03:49-05:00')
        counts, old = {'rows': 20031, 'meals': 296}, {'rows': 19000, 'meals': 300}
        self.assertEqual(
            summary.changelog_line(source, 'TC 7.25', counts, old),
            '- 2026-09-30, `d9582a6` "TC 7.25": 20,031 rows (+1,031), 296 meals (-4)',
        )
        self.assertEqual(summary.changelog_line(source, '', counts, None), '- 2026-09-30, `d9582a6`: 20,031 rows, 296 meals')


if __name__ == '__main__':
    unittest.main()
