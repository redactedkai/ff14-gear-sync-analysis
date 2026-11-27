"""Tests for the data pinning: fetch.py's --commit and --patches-commit options and provenance's local_edits and detect
(scripts/data/fetch.py and provenance.py). No fixtures.

Run: npm run test:py (npm run check:all runs them too)
"""

import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import fetch
import provenance
import summary


class PinningTest(unittest.TestCase):
    """fetch.py --commit takes a full commit id only; provenance.local_edits finds edits in the data clone, which
    regen.py refuses to run on."""

    def test_fetch_commit_option(self) -> None:
        self.assertIsNone(fetch.parse_args([]).commit)
        sha = 'd9582a624eaec69d45649366dee801c2f3a6e9b3'
        self.assertEqual(fetch.parse_args(['--commit', sha]).commit, sha)
        for bad in ('d9582a6', 'not-a-commit', sha + '0'):
            with self.subTest(bad=bad), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                fetch.parse_args(['--commit', bad])

    def test_fetch_patches_commit_option(self) -> None:
        self.assertIsNone(fetch.parse_args([]).patches_commit)
        sha = 'd6397410fa051a8a35827c6b7f97fc59dd00d5e5'
        args = fetch.parse_args(['--commit', 'a' * 40, '--patches-commit', sha])
        self.assertEqual((args.commit, args.patches_commit), ('a' * 40, sha))
        for bad in ('d639741', 'not-a-commit', sha + '0'):
            with self.subTest(bad=bad), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                fetch.parse_args(['--patches-commit', bad])

    def test_detect_tells_the_two_source_repositories_apart(self) -> None:
        """ffxiv-datamining-patches is not ffxiv-datamining: a clone is only the repository its origin names, exactly."""
        with tempfile.TemporaryDirectory() as tmp:
            clone = Path(tmp)

            def run(*args: str) -> None:
                cmd = ['git', '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-C', str(clone), *args]
                subprocess.run(cmd, check=True, capture_output=True)

            run('init', '--quiet')
            (clone / 'patchlist.json').write_text('[]\n', encoding='utf-8')
            run('add', '.')
            run('commit', '--quiet', '-m', 'patches')
            self.assertIsNone(provenance.detect(clone), 'no origin: not a data clone')
            has_origin = False
            for url, expect_data, expect_patches in (
                ('https://github.com/xivapi/ffxiv-datamining.git', True, False),
                ('https://github.com/xivapi/ffxiv-datamining', True, False),
                ('https://github.com/xivapi/ffxiv-datamining-patches.git', False, True),
                ('https://github.com/xivapi/ffxiv-datamining-patches/', False, True),
                ('https://github.com/someone/this-project.git', False, False),
            ):
                run('remote', 'set-url', 'origin', url) if has_origin else run('remote', 'add', 'origin', url)
                has_origin = True
                with self.subTest(url=url):
                    data, patches = provenance.detect(clone), provenance.detect(clone, provenance.PATCHES_REPO)
                    self.assertEqual(data is not None, expect_data)
                    self.assertEqual(patches is not None, expect_patches)
                    found = data or patches
                    if found:
                        self.assertEqual(found['repo'], provenance.REPO if expect_data else provenance.PATCHES_REPO)
                        self.assertRegex(found['commit'], r'^[0-9a-f]{40}$')

    def test_local_edits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            clone = Path(tmp)
            self.assertIsNone(provenance.local_edits(clone / 'missing'))

            def run(*args: str) -> None:
                cmd = ['git', '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-C', str(clone), *args]
                subprocess.run(cmd, check=True, capture_output=True)

            run('init', '--quiet')
            (clone / 'csv').mkdir()
            (clone / 'csv' / 'Item.csv').write_text('#,Name\n1,Test\n', encoding='utf-8')
            run('add', '.')
            run('commit', '--quiet', '-m', 'data')
            (clone / 'csv' / 'Scratch.csv').write_text('untracked\n', encoding='utf-8')
            self.assertEqual(provenance.local_edits(clone / 'csv'), [])  # untracked files are not edits
            (clone / 'csv' / 'Item.csv').write_text('#,Name\n1,Edited\n', encoding='utf-8')
            self.assertEqual(provenance.local_edits(clone / 'csv'), [' M csv/Item.csv'])

            # summary.json names each sheet's blob id at the commit (an untracked or missing sheet has none)
            blob = subprocess.run(['git', '-C', str(clone), 'rev-parse', 'HEAD:csv/Item.csv'], capture_output=True, text=True, check=False)
            self.assertEqual(summary.csv_blobs(clone / 'csv', ['Item', 'Scratch', 'Missing']), {'Item': blob.stdout.strip()})
            self.assertIsNone(summary.csv_blobs(clone / 'missing', ['Item']))
