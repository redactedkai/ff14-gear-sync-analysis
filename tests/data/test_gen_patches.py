"""Tests for scripts/data/gen_patches.py (src/data/patches.json): the patches and their release days, from the patch list of
xivapi/ffxiv-datamining-patches.

The entries are written here in the shape of the real patchlist.json (Banner, ExVersion and the names in other languages left
out); the timestamps are the real ones: Patch 7.56 is 1788852416 (2026-09-08 07:26 UTC), Patch 2.0 is 1376611200 (2013-08-16
00:00 UTC, listed twice, ids 0 and 2).

Run: npm run test:py (npm run check:all runs them too)
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gen_patches
import provenance
from common import ROOT, run_quiet
from item_format import SchemaError

UTC_MIDNIGHT_0908 = 1788825600  # 2026-09-08 00:00:00 UTC


def entry(patch_id: int, version: str, stamp: int | str, name: str | None = None) -> dict[str, Any]:
    """One entry of patchlist.json with the fields the generator reads."""
    return {'ID': patch_id, 'Version': version, 'Name_en': name or f'Patch {version}', 'ReleaseDate': stamp}


REAL_START = [
    entry(0, '2.0', 1376611200, 'Patch 2.0: A Realm Reborn'),
    entry(2, '2.0', 1376611200, 'Patch 2.0: A Realm Reborn'),
    entry(3, '2.05', 1381968000),
    entry(4, '2.1', 1387238400, 'Patch 2.1: A Realm Awoken'),
    entry(5, '2.1b', 1387238400, 'Patch 2.1b: A Realm Awoken'),
]


class PatchTableTest(unittest.TestCase):
    def test_release_day_is_the_utc_day(self) -> None:
        self.assertEqual(gen_patches.release_day(1788852416), '2026-09-08')  # Patch 7.56
        self.assertEqual(gen_patches.release_day(UTC_MIDNIGHT_0908), '2026-09-08')
        self.assertEqual(gen_patches.release_day(UTC_MIDNIGHT_0908 - 1), '2026-09-07')

    def test_a_repeated_entry_is_kept_once_and_the_order_is_the_lists(self) -> None:
        table = gen_patches.patch_table(REAL_START)
        self.assertEqual(table, [['2.0', '2013-08-16'], ['2.05', '2013-10-17'], ['2.1', '2013-12-17'], ['2.1b', '2013-12-17']])

    def test_stops_on_anything_unexpected(self) -> None:
        later = entry(10, '7.56', 1788852416)
        bad: dict[str, Any] = {
            'not a list': {'a': 1},
            'empty': [],
            'a missing field': [{'ID': 1, 'Version': '7.0', 'Name_en': 'Patch 7.0'}],
            'a version that is no patch number': [entry(1, 'seven', 1788852416, 'Patch seven')],
            'a name of another patch': [entry(1, '7.56', 1788852416, 'Patch 7.5')],
            'a name that is no patch': [entry(1, '7.56', 1788852416, 'Version 7.56')],
            'a date that is text': [entry(1, '7.56', '1788852416')],
            'a date of 0': [entry(1, '7.56', 0)],
            'ids that do not rise': [later, entry(9, '7.57', 1791895156)],
            'dates that go back': [later, entry(11, '7.5', 1777447634)],
            'a version with two dates': [entry(1, '7.56', 1777447634), entry(2, '7.57', 1788852416), entry(3, '7.56', 1791895156)],
        }
        for what, entries in bad.items():
            with self.subTest(what), self.assertRaises(SchemaError):
                gen_patches.patch_table(entries)

    def test_a_version_with_a_letter_is_a_patch(self) -> None:
        self.assertEqual(gen_patches.patch_table([entry(1, '2.1b', 1387238400, 'Patch 2.1b: A Realm Awoken')]), [['2.1b', '2013-12-17']])


class GenPatchesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.patchlist = self.dir / 'patchlist.json'
        self.patchlist.write_text(json.dumps(REAL_START), encoding='utf-8')
        self.out = self.dir / 'patches.json'

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_provenance_fields_and_one_patch_per_line(self) -> None:
        run_quiet(gen_patches.main, str(self.patchlist), str(self.out), None)
        doc = json.loads(self.out.read_text(encoding='utf-8'))
        self.assertEqual(list(doc), ['_generated', 'source', 'formatVersion', 'PATCHES'])
        self.assertIsNone(doc['source'])
        self.assertIn('xivapi/ffxiv-datamining-patches (commit unknown)', doc['_generated'])
        source = provenance.make('b' * 40, '2026-10-13T14:39:44+02:00', provenance.PATCHES_REPO)
        run_quiet(gen_patches.main, str(self.patchlist), str(self.out), source)
        text = self.out.read_text(encoding='utf-8')
        doc = json.loads(text)
        self.assertEqual(doc['source'], source)
        self.assertIn('xivapi/ffxiv-datamining-patches ' + 'b' * 40, doc['_generated'])
        lines = text.splitlines()
        start = lines.index('"PATCHES":[')
        self.assertEqual([json.loads(line.rstrip(',')) for line in lines[start + 1 : start + 5]], doc['PATCHES'])
        self.assertEqual(lines[start + 5], ']')

    def test_command_line_stamps_the_source_and_stops_on_a_bad_list(self) -> None:
        script = ROOT / 'scripts' / 'data' / 'gen_patches.py'
        run = subprocess.run(
            [
                sys.executable,
                str(script),
                str(self.patchlist),
                str(self.out),
                '--source-commit',
                'c' * 40,
                '--source-date',
                '2026-10-13T00:00:00Z',
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        doc = json.loads(self.out.read_text(encoding='utf-8'))
        self.assertEqual(doc['source'], {'repo': 'xivapi/ffxiv-datamining-patches', 'commit': 'c' * 40, 'date': '2026-10-13T00:00:00Z'})
        self.patchlist.write_text(json.dumps([entry(1, '7.56', 'soon')]), encoding='utf-8')
        run = subprocess.run([sys.executable, str(script), str(self.patchlist), str(self.out)], capture_output=True, text=True, check=False)
        self.assertEqual(run.returncode, 1)
        self.assertIn('ReleaseDate', run.stderr)

    def test_the_committed_table_is_in_the_generators_shape(self) -> None:
        doc = json.loads((ROOT / 'src' / 'data' / 'patches.json').read_text(encoding='utf-8'))
        self.assertEqual(doc['source']['repo'], 'xivapi/ffxiv-datamining-patches')
        self.assertIn(doc['source']['commit'], doc['_generated'])
        versions = [version for version, _day in doc['PATCHES']]
        self.assertEqual(len(set(versions)), len(versions))
        self.assertIn(['7.56', '2026-09-08'], doc['PATCHES'])


if __name__ == '__main__':
    unittest.main()
