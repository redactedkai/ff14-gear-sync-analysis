"""Generated files are LF text: no carriage return anywhere and a final newline (scripts/data/provenance.py write_generated,
src/data/*)."""

import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import provenance
from common import ROOT

GENERATED: list[Path] = sorted((ROOT / 'src' / 'data').iterdir())


class LineEndingsTest(unittest.TestCase):
    def test_there_are_generated_files_to_check(self) -> None:
        self.assertEqual(
            {path.name for path in GENERATED},
            {
                'item-level.json',
                'items.json',
                'food.json',
                'job-icons.ts',
                'gear-groups.json',
                'max-speed.json',
                'patches.json',
                'summary.json',
            },
        )

    def test_committed_generated_files_have_lf_endings_and_a_final_newline(self) -> None:
        for path in GENERATED:
            with self.subTest(file=path.name):
                data: bytes = path.read_bytes()
                self.assertNotIn(b'\r', data)
                self.assertTrue(data.endswith(b'\n'))

    def test_write_generated_writes_lf_on_every_platform(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out: Path = Path(tmp) / 'out.txt'
            provenance.write_generated(out, 'one\ntwo \u2605\n')
            self.assertEqual(out.read_bytes(), 'one\ntwo \u2605\n'.encode())


if __name__ == '__main__':
    _ = unittest.main()
