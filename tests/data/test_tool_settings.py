"""Tests that the Python tool settings agree with each other: pyproject.toml (read with tomllib), the CI Python matrix in
.github/workflows/pages.yml, the floor named in CLAUDE.md and README.md, `.python-version`, and the pins in
requirements-dev.txt. The workflow is read as text (no YAML parser): the one `python-version: [...]` line of the matrix.

Run: npm run test:py (npm run check:all runs them too)
"""

import re
import tomllib
import unittest

from common import ROOT

# What the Ruff section of pyproject.toml holds today (the lint rule families are described in its comment).
RULE_FAMILIES: set[str] = {
    'F',
    'E',
    'W',
    'I',
    'B',
    'UP',
    'RUF',
    'SIM',
    'C4',
    'PIE',
    'PERF',
    'FLY',
    'FURB',
    'PLE',
    'PLW',
    'PTH',
    'BLE',
    'DTZ',
    'PGH',
    'T10',
    'ISC',
    'RSE',
    'LOG',
    'PLW1514',
    'ANN',
}
PINNED_TOOLS: list[str] = ['ruff', 'pyrefly', 'hypothesis']


def version_tuple(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split('.'))


class ToolSettingsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))
        workflow: str = (ROOT / '.github' / 'workflows' / 'pages.yml').read_text(encoding='utf-8')
        matrix_lines = re.findall(r'^\s*python-version:\s*\[([^\]]*)\]\s*$', workflow, re.MULTILINE)
        assert len(matrix_lines) == 1, 'the workflow has one python-version matrix line'
        cls.matrix = sorted(re.findall(r'\d+\.\d+', matrix_lines[0]), key=version_tuple)

    def test_the_ci_matrix_names_a_floor_and_the_python_version_file(self) -> None:
        self.assertGreaterEqual(len(self.matrix), 2)
        self.assertIn((ROOT / '.python-version').read_text(encoding='utf-8').strip(), self.matrix)

    def test_pyrefly_targets_the_oldest_python_of_the_ci_matrix(self) -> None:
        self.assertEqual(self.config['tool']['pyrefly']['python-version'], self.matrix[0])

    def test_ruff_targets_the_same_python(self) -> None:
        self.assertEqual(self.config['tool']['ruff']['target-version'], 'py' + self.matrix[0].replace('.', ''))

    def test_the_docs_name_the_same_floor(self) -> None:
        floor: str = self.matrix[0]
        claude: str = (ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        readme: str = (ROOT / 'README.md').read_text(encoding='utf-8')
        self.assertIn(f'Python {floor}+', claude)
        self.assertIn(f'Python {floor} or later', readme)
        self.assertIn(f'on {floor} (the oldest supported)', readme)

    def test_each_pinned_tool_appears_once_with_an_exact_pin(self) -> None:
        lines: list[str] = [
            line.strip()
            for line in (ROOT / 'requirements-dev.txt').read_text(encoding='utf-8').splitlines()
            if (line.strip()) != '' and not line.startswith('#')
        ]
        for tool in PINNED_TOOLS:
            with self.subTest(tool=tool):
                own: list[str] = [line for line in lines if re.split(r'[=<>!~\[ ]', line, maxsplit=1)[0].lower() == tool]
                self.assertEqual(len(own), 1, f'{tool} must be listed exactly once')
                self.assertRegex(own[0], rf'^{tool}==\d+(\.\d+)*$')
        self.assertEqual(len(lines), len(PINNED_TOOLS), 'a new tool needs its name in PINNED_TOOLS here')

    def test_the_ruff_keys_are_the_expected_ones(self) -> None:
        ruff = self.config['tool']['ruff']
        self.assertEqual(set(ruff), {'line-length', 'target-version', 'extend-exclude', 'format', 'lint'})
        self.assertEqual(ruff['line-length'], 140)
        self.assertEqual(ruff['format'], {'quote-style': 'single', 'line-ending': 'lf'})
        lint = ruff['lint']
        self.assertEqual(set(lint), {'select', 'preview', 'explicit-preview-rules', 'per-file-ignores'})
        self.assertEqual(set(lint['per-file-ignores']), {'tests/**', 'scripts/validate/**', '.claude/**'})
        self.assertEqual(set(lint['select']), RULE_FAMILIES)
        self.assertEqual(len(lint['select']), len(RULE_FAMILIES), 'a rule family is listed twice')
        self.assertTrue(lint['preview'] and lint['explicit-preview-rules'])

    def test_ruff_leaves_out_the_folders_that_are_not_ours(self) -> None:
        for folder in ('./data', './dist', './node_modules', './docs/scratchpad'):
            self.assertIn(folder, self.config['tool']['ruff']['extend-exclude'])

    def test_pyrefly_uses_the_strict_preset_with_every_clean_check_on(self) -> None:
        pyrefly = self.config['tool']['pyrefly']
        self.assertEqual(pyrefly['preset'], 'strict')
        self.assertTrue(all(pyrefly['errors'].values()), 'the errors table only turns checks on')
        for kind in (
            'unknown-variable-type',
            'unknown-argument-type',
            'unknown-attribute-access',
            'unannotated-return',
            'implicit-any',
            'implicit-bool',
            'unused-call-result',
        ):
            self.assertIs(pyrefly['errors'][kind], True, kind)

    def test_pyrefly_has_one_exception_the_override_decorator_in_tests(self) -> None:
        sub_configs = {sub['matches']: sub['errors'] for sub in self.config['tool']['pyrefly']['sub-config']}
        self.assertEqual(sub_configs, {'tests/**': {'missing-override-decorator': False}})

    def test_pyrefly_searches_the_script_and_test_folders(self) -> None:
        self.assertEqual(self.config['tool']['pyrefly']['search-path'], ['scripts/data', 'tests/data'])


if __name__ == '__main__':
    _ = unittest.main()
