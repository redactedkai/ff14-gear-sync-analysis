"""Shared helpers for the data generators.

The generated-data format (job bit order, raw stat order, slot codes) lives in src/core/item-format.json,
which the page's JavaScript reads too, so the two sides cannot drift apart.
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FORMAT_PATH = ROOT / 'src' / 'core' / 'item-format.json'


def load_format():
    with open(FORMAT_PATH, encoding='utf-8') as f:
        return json.load(f)


def read_csv(path):
    """All rows of a datamining CSV as dicts keyed by the header row."""
    with open(path, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))
