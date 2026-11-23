"""Tests for scripts/data/gen_job_icons.py (src/data/job-icons.js) and the job icon numbering in scripts/data/fetch.py.

No CSV fixtures: the icons are fake PNG headers written to a temporary folder (`fake_png`).

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import fetch
import gen_job_icons
from common import (
    JOBS,
    read_export,
    run_quiet,
)
from item_format import SchemaError


def fake_png(width=64, height=64):
    """The first bytes of a PNG: signature and IHDR chunk with the given size (enough for gen_job_icons' check)."""
    return b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\x0dIHDR' + width.to_bytes(4, 'big') + height.to_bytes(4, 'big') + b'\x08\x06\x00\x00\x00'


class GenJobIconsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.icons = self.tmp / 'icons'
        self.icons.mkdir()
        for i, job in enumerate(JOBS):
            (self.icons / f'{job}.png').write_bytes(fake_png() + bytes([i]))  # a different file per job
        self.out = self.tmp / 'job-icons.js'

    def test_every_job_embedded_as_its_own_png(self):
        run_quiet(gen_job_icons.main, self.icons, self.out)
        icons = read_export(self.out, 'JOB_ICONS')
        self.assertEqual(list(icons), JOBS)
        for job, url in icons.items():
            self.assertTrue(url.startswith('data:image/png;base64,'), job)
            data = __import__('base64').b64decode(url.split(',', 1)[1])
            self.assertEqual(data, (self.icons / f'{job}.png').read_bytes(), job)

    def test_header_names_fetch_date_and_hashes(self):
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

    def test_missing_icon_fails(self):
        (self.icons / 'SGE.png').unlink()
        with self.assertRaisesRegex(SchemaError, 'SGE: no SGE.png'):
            gen_job_icons.main(self.icons, self.out)
        self.assertFalse(self.out.exists())

    def test_wrong_size_or_not_png_fails(self):
        (self.icons / 'PLD.png').write_bytes(fake_png(40, 40))
        (self.icons / 'WAR.png').write_bytes(b'<html>error page</html>')
        with self.assertRaisesRegex(SchemaError, r'PLD: PLD.png is 40 x 40, expected 64 x 64; WAR: WAR.png is not a PNG'):
            gen_job_icons.main(self.icons, self.out)

    def test_icon_number_is_62100_plus_class_job_row(self):
        # ClassJob rows from the real sheet: Paladin is row 19, Sage 40 (icons 062119 and 062140)
        rows = {'PLD': 19, 'WAR': 21, 'SGE': 40}
        with open(self.tmp / 'ClassJob.csv', 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            w.writerow(['#', 'Name', 'Abbreviation'])
            for k, job in enumerate(JOBS):
                w.writerow([rows.get(job, 100 + k), job.lower(), job])
        numbers = fetch.job_icon_numbers(self.tmp)
        self.assertEqual([numbers['PLD'], numbers['WAR'], numbers['SGE']], [62119, 62121, 62140])
        self.assertEqual(fetch.icon_url(62119), 'https://v2.xivapi.com/api/asset?path=ui/icon/062000/062119_hr1.tex&format=png')
