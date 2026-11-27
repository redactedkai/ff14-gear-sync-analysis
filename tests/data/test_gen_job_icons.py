"""Tests for scripts/data/gen_job_icons.py (src/data/job-icons.ts) and the job icon numbering in scripts/data/fetch.py.

No CSV fixtures: the icons are fake PNG headers written to a temporary folder (`fake_png`).

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import fetch
import gen_job_icons
from common import (
    JOBS,
    read_export,
    run_quiet,
)
from item_format import SchemaError


def fake_png(width: int = 64, height: int = 64, tag: int = 0, whole: bool = True) -> bytes:
    """The bytes of a PNG: signature, an IHDR chunk with the given size, one byte `tag` (so each icon differs) and the end
    chunk (enough for gen_job_icons' checks). whole=False cuts the end chunk off, as a download that stopped early does."""
    ihdr = (13).to_bytes(4, 'big') + b'IHDR' + width.to_bytes(4, 'big') + height.to_bytes(4, 'big') + bytes([8, 6, 0, 0, 0])
    return gen_job_icons.PNG_SIGNATURE + ihdr + bytes([tag]) + (gen_job_icons.PNG_END if whole else b'')


class GenJobIconsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.icons = self.tmp / 'icons'
        self.icons.mkdir()
        for i, job in enumerate(JOBS):
            (self.icons / f'{job}.png').write_bytes(fake_png(tag=i))  # a different file per job
        self.out = self.tmp / 'job-icons.ts'

    def test_every_job_embedded_as_its_own_png(self) -> None:
        run_quiet(gen_job_icons.main, self.icons, self.out)
        icons = read_export(self.out, 'JOB_ICONS')
        self.assertEqual(list(icons), JOBS)
        for job, url in icons.items():
            self.assertTrue(url.startswith('data:image/png;base64,'), job)
            data = __import__('base64').b64decode(url.split(',', 1)[1])
            self.assertEqual(data, (self.icons / f'{job}.png').read_bytes(), job)

    def test_header_names_fetch_date_and_hashes(self) -> None:
        """The header records the fetch date (fetch.py's record, else the newest file date) and each PNG's sha256."""
        (self.icons / gen_job_icons.FETCH_RECORD).write_text('2026-10-12\n', encoding='utf-8')
        run_quiet(gen_job_icons.main, self.icons, self.out)
        text = self.out.read_text(encoding='utf-8')
        self.assertIn('Fetched 2026-10-12 (fetch.py)', text)
        sage = __import__('hashlib').sha256((self.icons / 'SGE.png').read_bytes()).hexdigest()
        self.assertIn(f'   SGE {sage}\n', text)
        (self.icons / gen_job_icons.FETCH_RECORD).unlink()
        os.utime(self.icons / 'PLD.png', (0, 1767225600))  # 2026-01-01 00:00 UTC
        for job in JOBS[1:]:
            os.utime(self.icons / f'{job}.png', (0, 0))
        run_quiet(gen_job_icons.main, self.icons, self.out)
        self.assertIn('Fetched 2026-01-01 (newest file date)', self.out.read_text(encoding='utf-8'))

    def test_missing_icon_fails(self) -> None:
        (self.icons / 'SGE.png').unlink()
        with self.assertRaisesRegex(SchemaError, 'SGE: no SGE.png'):
            gen_job_icons.main(self.icons, self.out)
        self.assertFalse(self.out.exists())

    def test_a_png_cut_short_with_a_good_header_fails(self) -> None:
        (self.icons / 'SGE.png').write_bytes(fake_png(whole=False))
        with self.assertRaisesRegex(SchemaError, r'SGE: SGE.png is cut short \(no PNG end chunk\)'):
            gen_job_icons.main(self.icons, self.out)
        self.assertFalse(self.out.exists())

    def test_wrong_size_or_not_png_fails(self) -> None:
        (self.icons / 'PLD.png').write_bytes(fake_png(40, 40))
        (self.icons / 'WAR.png').write_bytes(b'<html>error page</html>')
        with self.assertRaisesRegex(SchemaError, r'PLD: PLD.png is 40 x 40, expected 64 x 64; WAR: WAR.png is not a PNG'):
            gen_job_icons.main(self.icons, self.out)

    def test_icon_number_is_62100_plus_class_job_row(self) -> None:
        # ClassJob rows from the real sheet: Paladin is row 19, Sage 40 (icons 062119 and 062140)
        rows = {'PLD': 19, 'WAR': 21, 'SGE': 40}
        with (self.tmp / 'ClassJob.csv').open('w', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            w.writerow(['#', 'Name', 'Abbreviation'])
            for k, job in enumerate(JOBS):
                w.writerow([rows.get(job, 100 + k), job.lower(), job])
        numbers = fetch.job_icon_numbers(self.tmp)
        self.assertEqual([numbers['PLD'], numbers['WAR'], numbers['SGE']], [62119, 62121, 62140])
        self.assertEqual(fetch.icon_url(62119), 'https://v2.xivapi.com/api/asset?path=ui/icon/062000/062119_hr1.tex&format=png')


class IconDownloadTest(unittest.TestCase):
    """fetch.download_icon: a download is renamed into place only when it is a whole 64 x 64 PNG."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.dest = self.tmp / 'SGE.png'

    def download(self, body: bytes) -> None:
        """Run download_icon against a fake server that answers with `body`."""
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = body
        with mock.patch.object(fetch.urllib.request, 'urlopen', return_value=response):
            fetch.download_icon('https://example.invalid/icon.png', self.dest)

    def test_a_whole_png_replaces_the_old_icon_and_leaves_no_temp_file(self) -> None:
        self.dest.write_bytes(b'old')
        self.download(fake_png(tag=7))
        self.assertEqual(self.dest.read_bytes(), fake_png(tag=7))
        self.assertEqual([p.name for p in self.tmp.iterdir()], ['SGE.png'])

    def test_a_cut_short_png_is_refused_and_the_old_icon_stays(self) -> None:
        self.dest.write_bytes(fake_png(tag=1))
        with self.assertRaisesRegex(SystemExit, 'SGE.png: the download .* is not a whole 64 x 64 PNG'):
            self.download(fake_png(tag=2, whole=False))
        self.assertEqual(self.dest.read_bytes(), fake_png(tag=1))
        self.assertEqual([p.name for p in self.tmp.iterdir()], ['SGE.png'])

    def test_an_error_page_or_a_wrong_size_is_refused(self) -> None:
        for body in (b'<html>error page</html>', fake_png(40, 40)):
            with self.subTest(body=body[:10]), self.assertRaises(SystemExit):
                self.download(body)
        self.assertFalse(self.dest.exists())
