"""Tests for scripts/data/summary.py (summary.json): the counts, the drift between two runs and the changelog line. No
fixtures.

Run: npm run test:py (npm run check:all runs them too)
"""

import unittest
from typing import Any, ClassVar

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import provenance
import summary


class SummaryTest(unittest.TestCase):
    """summary.py: the counts of summary.json, the drift between two runs and the changelog line."""

    FMT: ClassVar[dict[str, Any]] = {
        'itemRow': {'fields': ['name', 'slotCode', 'ilvl', 'routes', 'category']},
        'activities': [{'key': 'quests'}, {'key': 'crafted'}],
        'category': {'list': [{'key': 'crafted'}, {'key': 'dungeon'}]},
    }
    REPORT: ClassVar[dict[str, Any]] = {
        'itemSheetRows': 10,
        'dropped': {'name': 4},
        'leftOut': {},
        'dangling': {},
        'inferredPieces': {'Dungeon': 1},
    }

    def test_counts(self):
        # routes: bit 0 quests, bit 1 crafted, bit 2 the market board
        rows = [['A', 3, 100, [2, 4], 0], ['B', 3, 90, [1], 1], ['C', 11, 50, [], 1]]
        counts = summary.summarize({'items': rows}, {'foods': [[], []]}, {**self.REPORT, 'inferredCurrencies': {}}, self.FMT)
        self.assertEqual((counts['rows'], counts['maxIlvl'], counts['noRoute'], counts['meals']), (3, 100, 1, 2))
        self.assertEqual(counts['bySlot'], {'3': 2, '11': 1})
        self.assertEqual(counts['byCategory'], {'crafted': 1, 'dungeon': 2})
        self.assertEqual(counts['byBox'], {'quests': 1, 'crafted': 1, 'market_board': 1})
        self.assertEqual(counts['dropped'], {'name': 4})

    def test_drift(self):
        old = {'rows': 20000, 'byCategory': {'savage': 1000, 'event': 4, 'old': 7}}
        new = {'rows': 21000, 'byCategory': {'savage': 500, 'event': 9, 'fresh': 12}}
        # rows +5% and event +5 stay quiet; savage -50% is reported, so are a category gone and a new one
        self.assertEqual(
            summary.drift(old, new),
            ['byCategory.fresh new: 12', 'byCategory.old gone (was 7)', 'byCategory.savage 1,000 -> 500 (-50%)'],
        )
        self.assertEqual(summary.drift(new, new), [])

    def test_changelog_line(self):
        source = provenance.make('d9582a624eaec69d45649366dee801c2f3a6e9b3', '2026-09-30T03:03:49-05:00')
        counts, old = {'rows': 20031, 'meals': 296}, {'rows': 19000, 'meals': 300}
        self.assertEqual(
            summary.changelog_line(source, 'TC 7.25', counts, old),
            '- 2026-09-30, `d9582a6` "TC 7.25": 20,031 rows (+1,031), 296 meals (-4)',
        )
        self.assertEqual(summary.changelog_line(source, '', counts, None), '- 2026-09-30, `d9582a6`: 20,031 rows, 296 meals')


if __name__ == '__main__':
    unittest.main()
