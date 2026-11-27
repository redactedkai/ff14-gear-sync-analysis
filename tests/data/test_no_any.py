"""The guard that keeps the Python types explicit: no `Any`, no `cast(...)`, no unannotated `self.x = ...` in scripts/ or
tests/. A value from outside is
typed by what it holds (item_format.ItemRow, common.Json, a TypedDict of the file) and read through a helper that checks it
(item_format.whole, summary.total), not declared `Any` or cast. A line that must keep one carries `# any-ok: <why>`.

Run: npm run test:py
"""

import re
import unittest
from pathlib import Path

import common

USES = re.compile(r'\bAny\b|\bcast\(')
BARE_ATTRIBUTE = re.compile(r'^\s+self\.\w+ = ')


class NoAnyTest(unittest.TestCase):
    def test_no_any_or_cast_in_python(self) -> None:
        found: list[str] = []
        for folder in ('scripts', 'tests'):
            for path in sorted((common.ROOT / folder).rglob('*.py')):
                if 'node_modules' in path.parts or 'out' in path.parts or path == Path(__file__):
                    continue
                for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                    if USES.search(line) and '# any-ok:' not in line:
                        found.append(f'{path.relative_to(common.ROOT)}:{number}: {line.strip()}')
        self.assertEqual(found, [], 'type it by what it holds, or mark the line `# any-ok: <why>`')

    def test_attributes_are_annotated(self) -> None:
        """`self.name: Type = value`, not `self.name = value`, so the type is written where the attribute is made."""
        found: list[str] = []
        for folder in ('scripts', 'tests'):
            for path in sorted((common.ROOT / folder).rglob('*.py')):
                if 'node_modules' in path.parts or 'out' in path.parts:
                    continue
                for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                    if BARE_ATTRIBUTE.match(line):
                        found.append(f'{path.relative_to(common.ROOT)}:{number}: {line.strip()}')
        self.assertEqual(found, [], 'write the type: `self.name: Type = value`')


if __name__ == '__main__':
    unittest.main()
