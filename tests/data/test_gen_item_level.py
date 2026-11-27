"""Tests for scripts/data/gen_item_level.py (src/data/item-level.json): the per-item-level budgets and the per-level
parameters.

The fixture ItemLevel.csv values are synthetic (row * 1000 + column position) so a wrong column shows up as a wrong
number. ParamGrow (levels 0..100) is written in setUp.

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any  # any-ok: parsed JSON

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gen_item_level
from common import (
    FIXTURES,
    PARAM_GROW_HEADER,
    STAT_ORDER,
    run_quiet,
    write_param_grow,
)
from item_format import SchemaError

ITEM_LEVEL_COLUMNS: dict[str, str] = {
    'str': 'Strength',
    'dex': 'Dexterity',
    'int': 'Intelligence',
    'mind': 'Mind',
    'vit': 'Vitality',
    'piety': 'Piety',
    'ten': 'Tenacity',
    'dh': 'DirectHitRate',
    'crit': 'CriticalHit',
    'det': 'Determination',
    'sks': 'SkillSpeed',
    'sps': 'SpellSpeed',
    # no ItemLevel column of their own: the main-stat and substat columns (equal to Strength and Direct Hit)
    'mainAttr': 'Strength',
    'secAttr': 'DirectHitRate',
    # weapon damage and defense (`damageDefense` in item-format.json)
    'damagePhys': 'PhysicalDamage',
    'damageMag': 'MagicalDamage',
    'defensePhys': 'Defense',
    'defenseMag': 'MagicDefense',
}


class GenItemLevelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory()
        self.dir: Path = Path(self.tmp.name)
        _ = shutil.copy(FIXTURES / 'ItemLevel.csv', self.dir / 'ItemLevel.csv')
        _ = shutil.copy(FIXTURES / 'BaseParam.csv', self.dir / 'BaseParam.csv')
        _ = shutil.copy(FIXTURES / 'ClassJob.csv', self.dir / 'ClassJob.csv')
        _ = shutil.copy(FIXTURES / 'Tribe.csv', self.dir / 'Tribe.csv')
        _ = shutil.copy(FIXTURES / 'Race.csv', self.dir / 'Race.csv')
        write_param_grow(self.dir / 'ParamGrow.csv', range(101))
        with (FIXTURES / 'ItemLevel.csv').open(encoding='utf-8', newline='') as f:
            self.header: list[str] = next(csv.reader(f))

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def generate(self) -> tuple[dict[str, list[int]], list[list[int]]]:
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        doc: dict[str, Any] = json.loads(out.read_text(encoding='utf-8'))  # any-ok: parsed JSON
        return doc['IL'], doc['PG']

    def test_provenance_fields(self) -> None:
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out), None)
        doc: dict[str, Any] = json.loads(out.read_text(encoding='utf-8'))  # any-ok: parsed JSON
        self.assertEqual(list(doc), ['_generated', 'source', 'formatVersion', 'IL', 'PG', 'MP', 'SHARES', 'JOBS', 'CLANS'])
        self.assertIsNone(doc['source'])
        self.assertIn('commit unknown', doc['_generated'])
        src: dict[str, str | str] = {'repo': 'xivapi/ffxiv-datamining', 'commit': 'a' * 40, 'date': '2026-01-01T00:00:00Z'}
        run_quiet(gen_item_level.main, str(self.dir), str(out), src)
        doc = json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(doc['source'], src)
        self.assertIn('a' * 40, doc['_generated'])

    def test_one_entry_per_line(self) -> None:
        """IL, MP, SHARES and JOBS hold one key per line, PG one level and CLANS one clan per line, so a patch's diff names them."""
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        text: str = out.read_text(encoding='utf-8')
        doc: dict[str, Any] = json.loads(text)  # any-ok: parsed JSON
        lines: list[str] = text.splitlines()
        for key in ('IL', 'MP', 'SHARES', 'JOBS'):
            start: int = lines.index(f'"{key}":{{')
            self.assertEqual(lines[start + 1].split(':', 1)[0], json.dumps(next(iter(doc[key]))), key)
        start = lines.index('"PG":[')
        self.assertEqual(json.loads(lines[start + 1].rstrip(',')), doc['PG'][0])
        self.assertEqual(lines[start + 1 + len(doc['PG'])], '],')
        start = lines.index('"CLANS":[')
        self.assertEqual(json.loads(lines[start + 1].rstrip(',')), doc['CLANS'][0])

    def test_stat_factor_table(self) -> None:
        """MP: each stat's BaseParam MeldParam[0..12] row (the fixture holds the real rows), keyed by stat."""
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        mp: dict[str, list[int]] = json.loads(out.read_text(encoding='utf-8'))['MP']
        self.assertEqual(list(mp), [*STAT_ORDER, 'damagePhys', 'damageMag', 'defensePhys', 'defenseMag'])
        self.assertEqual(mp['vit'], [90, 100, 100, 100, 100, 90, 90, 100, 90, 100, 100, 100, 100])
        # the real BaseParam rows 13 (Magic Damage) and 21 (Defense)
        self.assertEqual(mp['damageMag'], [50, 50, 50, 50, 50, 100, 100, 50, 100, 30, 50, 50, 50])
        self.assertEqual(mp['defensePhys'], [66, 100, 70, 55, 55, 40, 40, 100, 40, 33, 55, 55, 55])
        self.assertEqual(mp['mind'], [90, 70, 70, 70, 70, 70, 100, 70, 100, 100, 70, 70, 70])
        self.assertEqual(mp['str'][0], 90)  # kind 0: all four main stats at 90
        self.assertEqual(mp['crit'], [100] * 13)

    def test_damage_defense_slot_shares(self) -> None:
        """SHARES: the real BaseParam slot shares per slot code for weapon damage (weapons only) and defense (armor only)."""
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        shares: dict[str, list[int]] = json.loads(out.read_text(encoding='utf-8'))['SHARES']
        damage: list[int] = [1000, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        defense: list[int] = [0, 0, 0, 176, 236, 176, 236, 176, 0, 0, 0, 0, 412, 412, 824]
        self.assertEqual(shares, {'damagePhys': damage, 'damageMag': damage, 'defensePhys': defense, 'defenseMag': defense})

    def test_job_modifiers(self) -> None:
        """JOBS: each combat job's attribute modifiers from the real ClassJob rows; base classes left out."""
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        jobs: dict[str, dict[str, int]] = json.loads(out.read_text(encoding='utf-8'))['JOBS']
        self.assertEqual(len(jobs), 23)
        self.assertNotIn('GLA', jobs)
        self.assertEqual(jobs['SGE'], {'str': 60, 'dex': 100, 'int': 115, 'mind': 115, 'vit': 100})
        self.assertEqual(jobs['WAR'], {'str': 105, 'dex': 95, 'int': 40, 'mind': 55, 'vit': 110})
        self.assertEqual(jobs['DRG']['vit'], 105)

    def test_clans(self) -> None:
        """CLANS: the 16 real Tribe rows in order, each with its race (Race row ceil(Tribe row / 2)) and the five attribute
        offsets; the values are the ones the Wiki's Starting Attributes page lists (22 Strength for a Midlander is a base 20 plus 2)."""
        out: Path = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        clans: list[dict[str, Any]] = json.loads(out.read_text(encoding='utf-8'))['CLANS']  # any-ok: parsed JSON
        self.assertEqual(len(clans), 16)
        self.assertEqual(clans[0], {'race': 'Hyur', 'clan': 'Midlander', 'str': 2, 'dex': -1, 'int': 3, 'mind': -1, 'vit': 0})
        self.assertEqual(clans[7], {'race': "Miqo'te", 'clan': 'Keeper of the Moon', 'str': -1, 'dex': 2, 'int': 1, 'mind': 3, 'vit': -2})
        self.assertEqual(clans[12], {'race': 'Hrothgar', 'clan': 'Helions', 'str': 3, 'dex': -3, 'int': -3, 'mind': 3, 'vit': 3})
        self.assertEqual(clans[15]['race'], 'Viera')
        races: list[str] = ['Hyur', 'Elezen', 'Lalafell', "Miqo'te", 'Roegadyn', 'Au Ra', 'Hrothgar', 'Viera']
        self.assertEqual([c['race'] for c in clans][::2], races)
        # a clan's attributes add to a base of 20 on the Wiki's page: every total is between 17 and 23
        for c in clans:
            for key in ('str', 'dex', 'int', 'mind', 'vit'):
                self.assertTrue(17 <= 20 + c[key] <= 23, (c['clan'], key))

    def test_clan_with_a_non_integer_offset_fails(self) -> None:
        text: str = (self.dir / 'Tribe.csv').read_text(encoding='utf-8')
        text = text.replace('1,Midlander,Midlander,0,0,2,', '1,Midlander,Midlander,0,0,two,', 1)
        _ = (self.dir / 'Tribe.csv').write_text(text, encoding='utf-8')
        with self.assertRaisesRegex(SchemaError, 'Midlander'):
            _ = self.generate()

    def test_missing_clan_row_fails(self) -> None:
        lines: list[str] = [row for row in (self.dir / 'Tribe.csv').read_text(encoding='utf-8').splitlines() if not row.startswith('16,')]
        _ = (self.dir / 'Tribe.csv').write_text('\n'.join(lines) + '\n', encoding='utf-8')
        with self.assertRaisesRegex(SchemaError, 'Tribe 16'):
            _ = self.generate()

    def test_item_level_columns(self) -> None:
        il, _ = self.generate()
        self.assertEqual(set(il), set(ITEM_LEVEL_COLUMNS))
        for key, column in ITEM_LEVEL_COLUMNS.items():
            pos: int = self.header.index(column)
            self.assertEqual(il[key], [row * 1000 + pos for row in range(4)], key)

    def test_param_grow_levels_1_to_100(self) -> None:
        _, pg = self.generate()
        self.assertEqual(len(pg), 100)
        self.assertEqual(pg[0], [1001, 2001, 3001])  # level 1 (row 0 is skipped)
        self.assertEqual(pg[89], [1090, 2090, 3090])  # level 90
        self.assertEqual(pg[99], [1100, 2100, 3100])  # level 100

    def test_param_grow_top_level_follows_the_data(self) -> None:
        """The top level is the highest row with an ItemLevelSync: a level cap of 110 gives 110 levels, and rows above
        the cap with no ItemLevelSync (like the real rows 101 to 200, and row 201's 100/100) are left out."""
        write_param_grow(self.dir / 'ParamGrow.csv', range(111))
        self.assertEqual(len(self.generate()[1]), 110)
        write_param_grow(self.dir / 'ParamGrow.csv', range(101))
        with (self.dir / 'ParamGrow.csv').open('a', encoding='utf-8', newline='') as f:
            w = csv.writer(f, lineterminator='\n')
            for lv, speed in ((101, 0), (102, 0), (201, 100)):
                row: dict[str, str] = dict.fromkeys(PARAM_GROW_HEADER, '0')
                row.update({'#': str(lv), 'BaseSpeed': str(speed), 'LevelModifier': str(speed)})
                w.writerow([row[k] for k in PARAM_GROW_HEADER])
        _, pg = self.generate()
        self.assertEqual(len(pg), 100)
        self.assertEqual(pg[-1], [1100, 2100, 3100])

    def test_param_grow_missing_level_fails(self) -> None:
        write_param_grow(self.dir / 'ParamGrow.csv', [lv for lv in range(101) if lv != 57])
        with self.assertRaisesRegex(SchemaError, r'ParamGrow.csv: level\(s\) 57 missing'):
            _ = self.generate()

    def test_non_contiguous_item_level_ids_fail(self) -> None:
        with (self.dir / 'ItemLevel.csv').open('a', encoding='utf-8', newline='') as f:
            csv.writer(f, lineterminator='\n').writerow(['9'] + ['0'] * (len(self.header) - 1))
        with self.assertRaisesRegex(SchemaError, 'ItemLevel.csv ids'):
            _ = self.generate()
