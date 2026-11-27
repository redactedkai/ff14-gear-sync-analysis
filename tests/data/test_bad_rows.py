"""Tests that one deliberately bad row or table stops a generator (the "stop on anything unknown" branches that the
fixture-based tests left unrun, see docs/engineering/data-pipeline.md section 10), and a test of summary.main() on small
files.

Each test edits a copy of the fixtures in tests/data/fixtures/ (described in common.py) or passes a bad table to the
function that checks it.

Run: npm run test:py (npm run check:all runs them too)
"""

import contextlib
import copy
import io
import json
import shutil
import tempfile
import unittest
from collections.abc import Callable, Iterable
from io import StringIO
from pathlib import Path
from typing import Any  # any-ok: parsed JSON
from unittest import mock

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gear_categories
import gen_gear_groups
import gen_items
import item_format
import provenance
import summary
from common import FIXTURES, edit_csv, run_quiet
from item_format import BaseParamRef, ItemCell, ItemFormat, Piece, Row, SchemaError, StatEntry, load_format, row_fields
from provenance import Source


class BadRowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory()
        self.dir: Path = Path(self.tmp.name)
        for f in FIXTURES.glob('*.csv'):
            _ = shutil.copy(f, self.dir / f.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def assert_stops(self, fn: Callable[[], object], *needles: str) -> None:
        with self.assertRaises(SchemaError) as stop:
            _ = fn()
        for needle in needles:
            self.assertIn(needle, str(stop.exception))

    def edit_combat_materia_rows(self, change: Callable[[list[str], list[str]], object]) -> None:
        """Apply change(row, header) to each Materia row that has both items and values (the combat stats, not the decoys
        or the Strength row)."""

        def edit(rows: list[list[str]]) -> None:
            header: list[str] = rows[0]
            for row in rows[1:]:
                if row[header.index('Value[0]')] != '0' and row[header.index('Item[0]')] != '0':
                    _ = change(row, header)

        edit_csv(self.dir / 'Materia.csv', edit)

    def generate_items(self) -> None:
        run_quiet(gen_items.main, str(self.dir), str(self.dir / 'out.json'), None)

    # gen_items: the materia table
    def test_a_materia_value_that_is_not_positive_stops(self) -> None:
        self.edit_combat_materia_rows(lambda row, header: row.__setitem__(header.index('Value[0]'), '0'))
        self.assert_stops(self.generate_items, 'Materia.csv', 'positive numbers')

    def test_a_materia_item_with_no_gate_stops(self) -> None:
        self.edit_combat_materia_rows(lambda row, header: row.__setitem__(header.index('Item[3]'), '999999999'))
        self.assert_stops(self.generate_items, 'Materia.csv', 'no materia item with a')

    def test_gates_that_decrease_stop(self) -> None:
        def swap(row: list[str], header: list[str]) -> None:
            first, second = header.index('Item[0]'), header.index('Item[1]')
            row[first], row[second] = row[second], row[first]

        self.edit_combat_materia_rows(swap)
        self.assert_stops(self.generate_items, 'Materia.csv', 'decrease')

    def test_a_missing_overmeld_grade_row_stops(self) -> None:
        fmt: ItemFormat = load_format()
        grade_csv: Path = self.dir / 'MateriaGrade.csv'
        edit_csv(grade_csv, lambda rows: rows.remove(next(r for r in rows if r[0] == '5')))
        self.assert_stops(lambda: gen_items.overmeld_rates(grade_csv, fmt), 'MateriaGrade.csv', 'grade row(s) 5')

    # item_format
    def test_a_stat_with_no_factor_row_stops(self) -> None:
        fmt: ItemFormat = load_format()
        stat: StatEntry = fmt['stats'][0]
        edit_csv(self.dir / 'BaseParam.csv', lambda rows: rows.remove(next(r for r in rows if r[0] == str(stat['baseParam']))))
        self.assert_stops(
            lambda: item_format.stat_factors(self.dir / 'BaseParam.csv', fmt), 'BaseParam.csv stat factors', f'no row {stat["baseParam"]}'
        )

    def test_a_slot_share_entry_with_no_row_stops(self) -> None:
        fmt: ItemFormat = load_format()
        entries: list[BaseParamRef] = [{'key': 'ghost', 'baseParam': 99999}]
        self.assert_stops(lambda: item_format.slot_shares(self.dir / 'BaseParam.csv', fmt, entries), 'slot shares', 'no row 99999 (ghost)')

    def test_slot_codes_with_a_gap_stop(self) -> None:
        fmt = load_format()
        fmt['slots'][-1]['code'] += 1
        self.assert_stops(lambda: item_format.slot_shares(self.dir / 'BaseParam.csv', fmt, []), 'slot codes are not 0..')

    def test_a_field_name_listed_twice_stops(self) -> None:
        fmt: ItemFormat = load_format()
        fmt['itemRow']['fields'].append(fmt['itemRow']['fields'][0])
        self.assert_stops(lambda: row_fields(fmt), 'a name is listed twice')

    def test_run_main_turns_a_schema_error_into_exit_status_1_and_one_line(self) -> None:
        def failing(message: str) -> None:
            raise SchemaError(message)

        with self.assertRaises(SystemExit) as exit_info:
            item_format.run_main(failing, 'sheet is wrong')
        self.assertEqual(exit_info.exception.code, 'error: sheet is wrong')  # a string code: printed to stderr, status 1

    def test_run_main_lets_other_errors_through(self) -> None:
        def failing() -> None:
            raise KeyError('bug')

        with self.assertRaises(KeyError):
            item_format.run_main(failing)

    # gear_categories: the cross-checks
    def kept_pieces(self) -> list[tuple[Row, Piece]]:
        return gen_items.select(self.dir).kept

    def test_a_savage_piece_with_no_dye_slot_is_a_problem(self) -> None:
        kept: list[tuple[dict[str, str], Piece]] = self.kept_pieces()
        body: tuple[dict[str, str], Piece] = next(
            (r, p) for r, p in kept if p['slotCode'] not in (0, 1, 2) and r['DyeCount'] in ('', '0') and p['slotCode'] < 8
        )
        problems: list[str] = gear_categories.check([body], {body[0]['#']: 'savage'})
        self.assertEqual(len(problems), 1)
        self.assertIn('categorized savage but has no dye slot', problems[0])

    def test_an_ultimate_totem_piece_in_another_category_is_a_problem(self) -> None:
        row, piece = self.kept_pieces()[0]
        piece = copy.copy(piece)
        piece['flags'] = gear_categories.FLAGS['ultimate']
        problems: list[str] = gear_categories.check([(row, piece)], {row['#']: 'dungeon'})
        self.assertEqual(len(problems), 1)
        self.assertIn('bought with an ultimate totem but categorized dungeon', problems[0])

    def test_a_recipe_result_in_another_category_is_a_problem_and_stops_main(self) -> None:
        kept: list[tuple[dict[str, str], Piece]] = self.kept_pieces()
        row: dict[str, str] = next(r for r, _ in kept if r['Name'] == 'Test Tank Helm')  # a dungeon piece
        with (self.dir / 'Recipe.csv').open(encoding='utf-8', newline='') as f:
            header = f.readline().rstrip('\n').split(',')
        recipe = ['0'] * len(header)
        recipe[0], recipe[header.index('ItemResult')] = '99999', row['#']
        edit_csv(self.dir / 'Recipe.csv', lambda rows: rows.append(recipe))
        self.assert_stops(
            lambda: run_quiet(gear_categories.main, str(self.dir)),
            '1 cross-check problem(s)',
            'Test Tank Helm: a recipe result but categorized dungeon',
        )
        self.assert_stops(self.generate_items, 'gear category cross-check problem', 'a recipe result but categorized dungeon')

    # gen_gear_groups
    def test_item_data_of_another_format_version_stops_the_gear_groups(self) -> None:
        items: Path = self.dir / 'items.json'
        _ = items.write_text(
            json.dumps({'formatVersion': load_format()['formatVersion'] + 1, 'source': None, 'items': []}), encoding='utf-8'
        )
        self.assert_stops(
            lambda: gen_gear_groups.main(str(items), str(self.dir / 'groups.json')), 'format version', 'run gen_items.py first'
        )
        self.assertFalse((self.dir / 'groups.json').exists())


class SummaryMainTest(unittest.TestCase):
    """summary.main() on small files: the items, meals and report it reads, the summary and changelog it writes."""

    SOURCE: Source = provenance.make('d9582a624eaec69d45649366dee801c2f3a6e9b3', '2026-09-30T03:03:49-05:00')

    def setUp(self) -> None:
        self.tmp: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory()
        self.dir: Path = Path(self.tmp.name)
        self.fmt: ItemFormat = load_format()
        self.fields: dict[str, int] = row_fields(self.fmt)
        self.items: Path = self.dir / 'items.json'
        self.food: Path = self.dir / 'food.json'
        self.report: Path = self.dir / 'report.json'
        self.summary_path: Path = self.dir / 'summary.json'
        self.changelog_path: Path = self.dir / 'data-changelog.md'
        self.write_inputs(item_levels=[100, 90], meals=2)
        _ = self.changelog_path.write_text('# Data changelog\n\n- 2026-01-01, `abcdef0`: 1 rows, 1 meals\n', encoding='utf-8', newline='\n')

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def item_row(self, ilvl: int) -> list[ItemCell]:
        row: list[ItemCell] = [0] * len(self.fmt['itemRow']['fields'])
        row[self.fields['name']], row[self.fields['ilvl']], row[self.fields['slotCode']] = 'x', ilvl, 3
        row[self.fields['routes']] = [1]
        return row

    def write_inputs(self, item_levels: Iterable[int], meals: int) -> None:
        base: dict[str, Source | int] = {'source': self.SOURCE, 'formatVersion': self.fmt['formatVersion']}
        _ = self.items.write_text(json.dumps({**base, 'items': [self.item_row(i) for i in item_levels]}), encoding='utf-8')
        _ = self.food.write_text(json.dumps({**base, 'foods': [['m', 1, [], None]] * meals}), encoding='utf-8')
        report: summary.ItemReport = {
            'itemSheetRows': 10,
            'dropped': {'name': 1},
            'leftOut': {},
            'dangling': {},
            'inferredPieces': {},
            'inferredCurrencies': {},
        }
        _ = self.report.write_text(json.dumps(report), encoding='utf-8')

    def run_main(self) -> str:
        output: StringIO = io.StringIO()
        with (
            mock.patch.object(summary, 'ITEMS', self.items),
            mock.patch.object(summary, 'FOOD', self.food),
            mock.patch.object(provenance, 'detect', return_value=self.SOURCE),
            contextlib.redirect_stdout(output),
        ):
            summary.main(self.dir, self.report, True, self.summary_path, self.changelog_path)
        return output.getvalue()

    def test_first_run_writes_the_summary_and_one_changelog_line(self) -> None:
        printed: str = self.run_main()
        data: bytes = self.summary_path.read_bytes()
        self.assertNotIn(b'\r', data)
        self.assertTrue(data.endswith(b'\n'))
        doc: dict[str, Any] = json.loads(data)  # any-ok: parsed JSON
        self.assertEqual((doc['source'], doc['formatVersion']), (self.SOURCE, self.fmt['formatVersion']))
        self.assertIsNone(doc['csv'])  # the temporary directory is no git clone
        counts: dict[str, Any] = doc['counts']  # any-ok: parsed JSON
        self.assertEqual((counts['rows'], counts['maxIlvl'], counts['meals'], counts['itemSheetRows']), (2, 100, 2, 10))
        self.assertEqual(counts['bySlot'], {'3': 2})
        self.assertIn('Added to data-changelog.md', printed)
        lines: list[str] = self.changelog_path.read_text(encoding='utf-8').splitlines()
        self.assertEqual(lines[-1], '- 2026-09-30, `d9582a6`: 2 rows, 2 meals')
        self.assertEqual(len(lines), 4)

    def test_a_second_run_with_moved_counts_warns_and_adds_no_second_changelog_line(self) -> None:
        _ = self.run_main()
        self.write_inputs(item_levels=[100] * 40, meals=2)  # rows 2 -> 40: far past the drift limit
        printed: str = self.run_main()
        self.assertIn('Warning: ', printed)
        self.assertIn('rows 2 -> 40', printed)
        self.assertNotIn('Added to', printed)
        self.assertEqual(len(self.changelog_path.read_text(encoding='utf-8').splitlines()), 4)

    def test_a_second_run_with_the_same_counts_reports_no_drift(self) -> None:
        _ = self.run_main()
        self.assertIn('No count moved by more than', self.run_main())

    def test_no_changelog_flag_leaves_the_changelog_alone(self) -> None:
        before: bytes = self.changelog_path.read_bytes()
        with (
            mock.patch.object(summary, 'ITEMS', self.items),
            mock.patch.object(summary, 'FOOD', self.food),
            mock.patch.object(provenance, 'detect', return_value=self.SOURCE),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            summary.main(self.dir, self.report, False, self.summary_path, self.changelog_path)
        self.assertEqual(self.changelog_path.read_bytes(), before)
        self.assertTrue(self.summary_path.exists())

    def test_a_report_missing_its_counts_raises_a_bare_key_error_today(self) -> None:
        _ = self.report.write_text('{}', encoding='utf-8')
        with self.assertRaises(KeyError):
            _ = self.run_main()


if __name__ == '__main__':
    _ = unittest.main()
