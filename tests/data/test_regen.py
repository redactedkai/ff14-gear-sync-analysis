"""regen.py: importing it does nothing, its step list, and that its Python steps can print any name (scripts/data/regen.py).
regen.py itself is never run here: it would rewrite src/data."""

import contextlib
import io
import os
import subprocess
import sys
import unittest

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import regen
from provenance import Source

SOURCE: Source = {'repo': 'xivapi/ffxiv-datamining', 'commit': 'a' * 40, 'date': '2026-01-01T00:00:00Z'}
PATCH_SOURCE: Source = {'repo': 'xivapi/ffxiv-datamining-patches', 'commit': 'b' * 40, 'date': '2026-02-02T00:00:00Z'}


class RegenTest(unittest.TestCase):
    def steps(self, edited: bool = False) -> list[tuple[str, list[str]]]:
        return regen.build_steps(SOURCE, PATCH_SOURCE, edited, 'report.json')

    def test_steps_run_in_the_documented_order(self) -> None:
        labels = [label for label, _ in self.steps()]
        self.assertEqual(
            labels,
            [
                'Generating the item level table',
                'Generating the item database',
                'Generating the gear groups',
                'Generating the food table',
                'Generating the job icons',
                'Generating the patch table',
                'Generating the most speed per level',
                'Comparing the counts with the last run',
                'Building the page',
            ],
        )

    def test_python_steps_use_utf8_and_the_node_steps_do_not(self) -> None:
        for label, command in self.steps():
            self.assertEqual(regen.is_python_step(command), command[0] == sys.executable, label)
            if regen.is_python_step(command):
                self.assertEqual(command[:3], [sys.executable, '-X', 'utf8'], label)
            else:
                self.assertEqual(command[0], 'node', label)

    def test_each_source_is_stamped_on_its_own_generators(self) -> None:
        commands = dict(self.steps())
        self.assertIn('a' * 40, commands['Generating the item database'])
        self.assertIn('b' * 40, commands['Generating the patch table'])
        self.assertNotIn('b' * 40, commands['Generating the item database'])

    def test_an_edited_clone_skips_the_changelog_line(self) -> None:
        summary = 'Comparing the counts with the last run'
        self.assertNotIn('--no-changelog', dict(self.steps(edited=False))[summary])
        self.assertIn('--no-changelog', dict(self.steps(edited=True))[summary])

    def test_help_exits_cleanly(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()) as out, self.assertRaises(SystemExit) as stop:
            regen.main(['--help'])
        self.assertEqual(stop.exception.code, 0)
        self.assertIn('--allow-dirty', out.getvalue())

    def test_a_python_step_prints_a_name_outside_the_console_code_page(self) -> None:
        """A child with -X utf8 can print a character cp1252 lacks (a Windows pipe's default), and the parent reads it back
        as UTF-8. On other systems the default is UTF-8 already, so this passes there as well."""
        env = {k: v for k, v in os.environ.items() if k not in ('PYTHONUTF8', 'PYTHONIOENCODING')}
        done = subprocess.run(
            [*regen.PYTHON, '-c', 'print("\u2605 \u00dcber")'],
            stdout=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            env=env,
            check=False,
        )
        self.assertEqual(done.returncode, 0)
        self.assertEqual(done.stdout.strip(), '\u2605 \u00dcber')


if __name__ == '__main__':
    unittest.main()
