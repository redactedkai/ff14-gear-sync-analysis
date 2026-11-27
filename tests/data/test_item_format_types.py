"""item_format.py's ItemFormat types against the real src/core/item-format.json: the file and the TypedDict classes list
the same keys with the same kinds of value, so a key added to either side without the other fails here."""

import json
import typing
import unittest

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import item_format
from common import Json
from item_format import FORMAT_PATH, ItemFormat, load_format


def name_of(expected: object) -> str:
    """The class name of `expected` (a TypedDict class or a scalar type)."""
    return str(getattr(expected, '__name__', expected))


def key_set(expected: object, attribute: str) -> frozenset[str]:
    """The `__required_keys__` or `__optional_keys__` of a TypedDict class."""
    keys = getattr(expected, attribute, None)
    assert isinstance(keys, frozenset), f'{name_of(expected)} has no {attribute}'
    return keys


def problems_of(value: Json, expected: object, where: str) -> list[str]:
    """What differs between a parsed JSON `value` and the type `expected` (a TypedDict class, list[...], dict[str, ...]
    or a scalar type), as a list of messages that name the path `where`."""
    if typing.is_typeddict(expected):
        if not isinstance(value, dict):
            return [f'{where}: expected an object, found {type(value).__name__}']
        hints = typing.get_type_hints(expected)
        problems = [f'{where}.{key}: in the file, not in {name_of(expected)}' for key in value if key not in hints]
        problems += [
            f'{where}.{key}: in {name_of(expected)}, not in the file' for key in key_set(expected, '__required_keys__') if key not in value
        ]
        for key, item in value.items():
            if key in hints:
                problems += problems_of(item, hints[key], f'{where}.{key}')
        return problems
    origin = typing.get_origin(expected)
    if origin is list:
        if not isinstance(value, list):
            return [f'{where}: expected a list, found {type(value).__name__}']
        (item_type,) = typing.get_args(expected)
        return [p for i, item in enumerate(value) for p in problems_of(item, item_type, f'{where}[{i}]')]
    if origin is dict:
        if not isinstance(value, dict):
            return [f'{where}: expected an object, found {type(value).__name__}']
        _key_type, value_type = typing.get_args(expected)
        return [p for key, item in value.items() for p in problems_of(item, value_type, f'{where}.{key}')]
    # a scalar: bool is an int in Python, so a number must not stand where a bool is expected, or the other way round
    if type(value) is not expected:
        return [f'{where}: expected {name_of(expected)}, found {type(value).__name__}']
    return []


class ItemFormatTypesTest(unittest.TestCase):
    def test_the_types_match_the_file(self) -> None:
        with FORMAT_PATH.open(encoding='utf-8') as f:
            raw = json.load(f)
        self.assertEqual(problems_of(raw, ItemFormat, 'item-format'), [])

    def test_load_format_reads_that_file(self) -> None:
        self.assertEqual(set(load_format()), set(ItemFormat.__annotations__))

    def test_only_comments_and_two_slot_keys_are_optional(self) -> None:
        """A missing key breaks a reader, so NotRequired is for the `_` comment keys and the two optional slot keys."""
        classes: list[type] = [
            c for c in vars(item_format).values() if typing.is_typeddict(c) and c is not item_format.Piece
        ]  # Piece is not in the file
        self.assertIn(ItemFormat, classes)
        for cls in classes:
            for key in key_set(cls, '__optional_keys__'):
                self.assertTrue(
                    key.startswith('_') or (cls is item_format.Slot and key in ('twoHanded', 'blocks')), f'{cls.__name__}.{key}'
                )

    def test_a_wrong_type_is_reported(self) -> None:
        """The checker itself: a missing key, an extra key and a wrong kind of value each show up."""
        raw: dict[str, Json] = json.loads(FORMAT_PATH.read_text(encoding='utf-8'))
        broken = {**raw, 'extra': 1, 'formatVersion': '1'}
        del broken['jobs']
        found = problems_of(broken, ItemFormat, 'f')
        self.assertIn('f.extra: in the file, not in ItemFormat', found)
        self.assertIn('f.jobs: in ItemFormat, not in the file', found)
        self.assertIn('f.formatVersion: expected int, found str', found)


if __name__ == '__main__':
    unittest.main()
