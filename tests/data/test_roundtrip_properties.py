"""Property tests: generated JSON round-trips (the text written parses back to the same data, and writing that data again
gives the same text) and every generated file is LF text with a final newline, whatever characters the data holds.

Settings: the 'generators' profile in common.py (deterministic, 12 examples, nothing written to the repo).

Run: npm run test:py (npm run check:all runs them too)
"""

import json
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path and registers the Hypothesis profile; first among our imports)
import gen_food
import gen_items
import provenance
from common import FIXTURES, Json, run_quiet
from hypothesis import given
from hypothesis import strategies as st
from hypothesis.strategies import SearchStrategy

# JSON values as the generators write them: numbers, strings of any characters (line breaks, quotes, non-ASCII), lists.
SCALARS: SearchStrategy[bool | int | str | None] = st.one_of(
    st.integers(min_value=-(10**9), max_value=10**9), st.text(max_size=12), st.booleans(), st.none()
)
ROWS: SearchStrategy[list[list[bool | int | str | None]]] = st.lists(st.lists(SCALARS, max_size=6), max_size=8)
KEYS: SearchStrategy[str] = st.sampled_from(['items', 'foods', 'groups', 'note', 'source', 'formatVersion'])
DOCS: SearchStrategy[dict[str, bool | dict[str, bool | int | str | None] | int | list[list[bool | int | str | None]] | str | None]] = (
    st.dictionaries(KEYS, st.one_of(ROWS, SCALARS, st.dictionaries(st.text(max_size=6), SCALARS, max_size=4)), max_size=6)
)


class JsonLinesRoundTripTest(unittest.TestCase):
    @given(doc=DOCS, expand=st.sets(KEYS), ensure_ascii=st.booleans())
    def test_the_text_parses_back_to_the_same_data(self, doc: dict[str, Json], expand: set[str], ensure_ascii: bool) -> None:
        text: str = provenance.json_lines(doc, expand=tuple(expand), ensure_ascii=ensure_ascii)
        self.assertEqual(json.loads(text), doc)
        # writing the parsed data again gives the same text: the format is a function of the data alone
        self.assertEqual(provenance.json_lines(json.loads(text), expand=tuple(expand), ensure_ascii=ensure_ascii), text)

    @given(doc=DOCS, expand=st.sets(KEYS), ensure_ascii=st.booleans())
    def test_written_file_is_lf_with_a_final_newline(self, doc: dict[str, Json], expand: set[str], ensure_ascii: bool) -> None:
        text: str = provenance.json_lines(doc, expand=tuple(expand), ensure_ascii=ensure_ascii)
        with tempfile.TemporaryDirectory() as tmp:
            out: Path = Path(tmp) / 'out.json'
            provenance.write_generated(out, text)
            data: bytes = out.read_bytes()
        self.assertNotIn(b'\r', data)
        self.assertTrue(data.endswith(b'\n'))
        self.assertFalse(data.endswith(b'\n\n'))
        self.assertEqual(data, text.encode('utf-8'))

    @given(rows=ROWS)
    def test_an_expanded_list_has_one_row_per_line(self, rows: list[list[Json]]) -> None:
        text: str = provenance.json_lines({'items': rows}, expand=('items',))
        lines: list[str] = text.splitlines()
        if len(rows) > 0:
            self.assertEqual(len(lines), len(rows) + 4)  # '{', 'items:[', the rows, ']', '}'
        for line, row in zip(lines[2:], rows, strict=False):
            self.assertEqual(json.loads(line.rstrip(',')), row)


class GeneratedFilesRoundTripTest(unittest.TestCase):
    """The item and meal files the generators write from the fixtures are fixed points of their own writer."""

    def check(self, path: Path, expand: tuple[str, ...], ensure_ascii: bool) -> dict[str, Json]:
        data: bytes = Path(path).read_bytes()
        self.assertNotIn(b'\r', data)
        self.assertTrue(data.endswith(b'\n'))
        text: str = data.decode('utf-8')
        doc = json.loads(text)
        self.assertEqual(provenance.json_lines(doc, expand=expand, ensure_ascii=ensure_ascii), text)
        return doc

    def test_items_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out: Path = Path(tmp) / 'items.json'
            run_quiet(gen_items.main, str(FIXTURES), str(out), None)
            doc: dict[str, Json] = self.check(out, ('items',), ensure_ascii=False)
        self.assertTrue(doc['items'])

    def test_food_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out: Path = Path(tmp) / 'food.json'
            gen_food.main(str(FIXTURES / 'food'), str(out), None)
            doc: dict[str, Json] = self.check(out, ('foods',), ensure_ascii=True)
        self.assertTrue(doc['foods'])


if __name__ == '__main__':
    _ = unittest.main()
