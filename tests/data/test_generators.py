"""Tests for the data generators (scripts/data/gen_items.py, scripts/data/gen_item_level.py).

Fixtures in tests/data/fixtures/ use the real sheet headers from xivapi/ffxiv-datamining. EquipSlotCategory and
ClassJobCategory rows, and the BaseParam rows of the 12 stats, are copied from the real sheets; Item rows are test items
built on the real header; ItemLevel values are synthetic (row * 1000 + column position) so a wrong column shows up as a
wrong number. ParamGrow (levels 0..100) is written in setUp. SchemaDriftTest edits copies of the fixtures to check that
renamed columns and changed slot shares stop the generators.

Run: npm test (runs these after the unit tests)
"""

import contextlib
import csv
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / 'fixtures'
sys.path.insert(0, str(ROOT / 'scripts' / 'data'))

import gen_item_level  # noqa: E402
import gen_items  # noqa: E402
from item_format import SchemaError  # noqa: E402

# Raw stat order of a generated row (src/core/item-format.json), written out independently here.
STAT_ORDER = ['str', 'dex', 'int', 'mind', 'vit', 'piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps']
ALL_JOBS_MASK = (1 << 22) - 1


def stats(**kw):
    return ','.join(str(kw.get(k, 0)) for k in STAT_ORDER)


TANK = stats(str=55, vit=59, ten=54, det=38)
HEAL = stats(mind=33, vit=32, piety=22, dh=6, sps=31)


def read_export(path, name):
    """The JSON value of `export const <name>=...;` in a generated JS file (other lines are ignored)."""
    prefix = f'export const {name}='
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        if line.startswith(prefix):
            return json.loads(line[len(prefix) :].rstrip().rstrip(';'))
    raise AssertionError(f'{name} not found in {path}')


def run_quiet(fn, *args):
    with contextlib.redirect_stdout(io.StringIO()):
        fn(*args)


class GenItemsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        out = Path(cls.tmp.name) / 'items.js'
        run_quiet(gen_items.main, str(FIXTURES), str(out))
        cls.rows = read_export(out, 'ITEMS')
        cls.by_name = {r[0]: r for r in cls.rows}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def row(self, name):
        self.assertIn(name, self.by_name)
        return self.by_name[name]

    def test_row_shape(self):
        for r in self.rows:
            self.assertEqual(len(r), 7, r)
            name, slot, ilvl, lvl, mask, st, unique = r
            self.assertIsInstance(name, str)
            self.assertIn(slot, range(12))
            self.assertEqual(len(st.split(',')), 12)
            self.assertIn(unique, (0, 1))

    def test_slot_detection(self):
        expect = {
            'Test Greataxe': 0,  # MainHand 1, OffHand -1: two-handed
            'Test Sword': 1,  # MainHand 1, OffHand 0: one-handed
            'Test Shield': 2,
            'Test Hood of Healing': 3,
            'Test Robe': 4,
            'Test Gloves': 5,
            'Test Tonban': 6,
            'Test Shoes': 7,
            'Test Earring': 8,
            'Test Choker': 9,
            'Test Bracelet': 10,
            'Test Ring Unique': 11,  # FingerL 1 (and FingerR 1)
            'Test Ring Plain': 11,
        }
        for name, slot in expect.items():
            self.assertEqual(self.row(name)[1], slot, name)

    def test_excluded_slots(self):
        for name in ('Test Belt', 'Test Soul Crystal', 'Test Missing Slot Category', 'Test Non-gear'):
            self.assertNotIn(name, self.by_name)

    def test_multi_slot_gear_excluded(self):
        # Category 15: Body 1, Head -1 (a cloak that also covers the head). Left out rather than modelled as a body piece.
        self.assertNotIn('Test Cloak', self.by_name)
        self.assertIn('Test Robe', self.by_name)  # same item on a plain body category is kept

    def test_stat_mapping(self):
        self.assertEqual(self.row('Test Hood of Healing')[5], HEAL)
        self.assertEqual(self.row('Test Greataxe')[5], TANK)
        self.assertEqual(self.row('Test Sword')[5], stats(str=39, vit=42, crit=39, ten=27))
        self.assertEqual(self.row('Test Shield')[5], stats(str=16, vit=17, sks=15, det=11))
        self.assertEqual(self.row('Test Caster Hat')[5], stats(int=33, vit=32, sks=31, crit=22))
        # BaseParam in slot 5 after empty slots 3-4 (a layout real Unique rings use)
        self.assertEqual(self.row('Test Ring Unique')[5], stats(str=26, vit=28, crit=24, dh=17))
        self.assertEqual(self.row('Test Ring Plain')[5], stats(str=26, vit=28, ten=24, det=17))

    def test_hq_bonus_only_when_can_be_hq(self):
        # NQ str 23 vit 23 ten 24 det 17; HQ bonus str 3 vit 3 ten 3 det 2 plus Defense / Magic Defense (ignored)
        self.assertEqual(self.row('Test Sallet HQ')[5], stats(str=26, vit=26, ten=27, det=19))
        self.assertEqual(self.row('Test Sallet NoHQ')[5], stats(str=23, vit=23, ten=24, det=17))

    def test_minimum_item_level(self):
        self.assertEqual(self.row('Test Min Ilvl')[2], 100)
        self.assertNotIn('Test Below Min Ilvl', self.by_name)
        self.assertTrue(all(r[2] >= 100 for r in self.rows))

    def test_excluded_jobs(self):
        for name in ('Test No Category', 'Test Gladiator Only', 'Test Crafter Only', 'Test Unknown Category'):
            self.assertNotIn(name, self.by_name)

    def test_job_mask_bits(self):
        expect = {
            'Test Sword': 1 << 0,  # GLA PLD
            'Test Greataxe': 1 << 1,  # MRD WAR
            'Test Tank Helm': 0b1111,  # PLD WAR DRK GNB
            'Test Hood of Healing': 0b1111 << 4,  # WHM SCH AST SGE
            'Test Caster Hat': (1 << 17) | (1 << 18) | (1 << 19) | (1 << 20) | (1 << 21),  # BLM SMN RDM PCT BLU
            'Test Earring': ALL_JOBS_MASK,  # All Classes
        }
        for name, mask in expect.items():
            self.assertEqual(self.row(name)[4], mask, name)
        self.assertTrue(all(0 < r[4] <= ALL_JOBS_MASK for r in self.rows))

    def test_unique_flag(self):
        self.assertEqual(self.row('Test Ring Unique')[6], 1)
        self.assertEqual(self.row('Test Ring Plain')[6], 0)
        self.assertEqual(self.row('Test Hood of Healing')[6], 1)
        self.assertEqual(self.row('Test Robe')[6], 0)

    def test_equip_level(self):
        self.assertEqual(self.row('Test Robe')[3], 50)

    def test_no_stats_excluded(self):
        for name in ('Test No Stats', 'Test Defense Only', 'Test No Stats Not HQ'):
            self.assertNotIn(name, self.by_name)

    def test_empty_name_excluded(self):
        self.assertNotIn('', self.by_name)

    def test_sort_order(self):
        expect = [
            'Test Alpha Helm',
            'Test Zeta Helm',
            'Test Alpha Mail',
            'Test Greataxe',
            'Test Sword',
            'Test Shield',
            'Test Caster Hat',
            'Test Hood of Healing',
            'Test Tank Helm',
            'Test Robe',
            'Test Gloves',
            'Test Tonban',
            'Test Shoes',
            'Test Earring',
            'Test Choker',
            'Test Bracelet',
            'Test Ring Plain',
            'Test Ring Unique',
            'Test Sallet HQ',
            'Test Sallet NoHQ',
            'Test Min Ilvl',
        ]
        self.assertEqual([r[0] for r in self.rows], expect)


ITEM_LEVEL_COLUMNS = {
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
}
PARAM_GROW_HEADER = (
    '#,ExpToNext,MpModifier,BaseSpeed,LevelModifier,HuntingLogExpReward,MonsterNoteSeals,ScaledQuestXP,HpModifier,'
    'ItemLevelSync,ProperDungeon,ProperGuildOrder,CraftingLevel,AdditionalActions,ApplyAction,QuestExpModifier'
).split(',')


def write_param_grow(path, levels):
    """ParamGrow rows for the given levels: BaseSpeed 1000+l, LevelModifier 2000+l, ItemLevelSync 3000+l."""
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(PARAM_GROW_HEADER)
        for lv in levels:
            row = dict.fromkeys(PARAM_GROW_HEADER, '0')
            row.update({'#': lv, 'BaseSpeed': 1000 + lv, 'LevelModifier': 2000 + lv, 'ItemLevelSync': 3000 + lv})
            w.writerow([row[k] for k in PARAM_GROW_HEADER])


class GenItemLevelTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        shutil.copy(FIXTURES / 'ItemLevel.csv', self.dir / 'ItemLevel.csv')
        shutil.copy(FIXTURES / 'BaseParam.csv', self.dir / 'BaseParam.csv')
        write_param_grow(self.dir / 'ParamGrow.csv', range(0, 101))
        with open(FIXTURES / 'ItemLevel.csv', encoding='utf-8', newline='') as f:
            self.header = next(csv.reader(f))

    def tearDown(self):
        self.tmp.cleanup()

    def generate(self):
        out = self.dir / 'item-level.js'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        return read_export(out, 'IL'), read_export(out, 'PG')

    def test_item_level_columns(self):
        il, _ = self.generate()
        self.assertEqual(set(il), set(ITEM_LEVEL_COLUMNS))
        for key, column in ITEM_LEVEL_COLUMNS.items():
            pos = self.header.index(column)
            self.assertEqual(il[key], [row * 1000 + pos for row in range(4)], key)

    def test_param_grow_levels_1_to_100(self):
        _, pg = self.generate()
        self.assertEqual(len(pg), 100)
        self.assertEqual(pg[0], [1001, 2001, 3001])  # level 1 (row 0 is skipped)
        self.assertEqual(pg[89], [1090, 2090, 3090])  # level 90
        self.assertEqual(pg[99], [1100, 2100, 3100])  # level 100

    def test_param_grow_missing_level_fails(self):
        write_param_grow(self.dir / 'ParamGrow.csv', [lv for lv in range(0, 101) if lv != 57])
        with self.assertRaises(KeyError):
            self.generate()

    def test_non_contiguous_item_level_ids_fail(self):
        with open(self.dir / 'ItemLevel.csv', 'a', encoding='utf-8', newline='') as f:
            csv.writer(f, lineterminator='\n').writerow(['9'] + ['0'] * (len(self.header) - 1))
        with self.assertRaises(AssertionError):
            self.generate()


def edit_csv(path, fn):
    """Rewrite a CSV in place: fn(rows) gets the rows as lists (header first) and changes them."""
    with open(path, encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))
    fn(rows)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        csv.writer(f, lineterminator='\n').writerows(rows)


def rename_column(path, old, new):
    def fn(rows):
        rows[0][rows[0].index(old)] = new

    edit_csv(path, fn)


class SchemaDriftTest(unittest.TestCase):
    """A game patch that renames or drops a column, or changes a slot share, must stop the generators (audit A14)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        for f in FIXTURES.glob('*.csv'):
            shutil.copy(f, self.dir / f.name)
        write_param_grow(self.dir / 'ParamGrow.csv', range(0, 101))

    def tearDown(self):
        self.tmp.cleanup()

    def assert_fails(self, gen, *needles):
        with self.assertRaises(SchemaError) as cm:
            run_quiet(gen.main, str(self.dir), str(self.dir / 'out.js'))
        for n in needles:
            self.assertIn(n, str(cm.exception))
        self.assertFalse((self.dir / 'out.js').exists(), 'no output is written on a schema error')

    def test_unmodified_fixtures_pass(self):
        run_quiet(gen_items.main, str(self.dir), str(self.dir / 'items.js'))
        run_quiet(gen_item_level.main, str(self.dir), str(self.dir / 'item-level.js'))

    def test_renamed_job_column(self):
        rename_column(self.dir / 'ClassJobCategory.csv', 'SGE', 'SAGE')
        self.assert_fails(gen_items, 'ClassJobCategory.csv', 'SGE')

    def test_changed_job_values(self):
        def fn(rows):
            for r in rows[1:]:
                r[:] = ['1' if v == 'True' else v for v in r]

        edit_csv(self.dir / 'ClassJobCategory.csv', fn)
        self.assert_fails(gen_items, 'ClassJobCategory.csv', 'PLD', 'BLU')

    def test_missing_equip_slot_column(self):
        for col in ('Gloves', 'OffHand', 'MainHand', 'FingerL'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'EquipSlotCategory.csv', self.dir / 'EquipSlotCategory.csv')
                rename_column(self.dir / 'EquipSlotCategory.csv', col, col + 'X')
                self.assert_fails(gen_items, 'EquipSlotCategory.csv', col)

    def test_missing_item_column(self):
        cols = ('Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique')
        cols += ('BaseParam[0]', 'BaseParamValue[5]', 'BaseParamSpecial[2]', 'BaseParamValueSpecial[5]')
        for col in cols:
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
                rename_column(self.dir / 'Item.csv', col, 'Renamed' + col)
                self.assert_fails(gen_items, 'Item.csv', col)

    def test_missing_item_level_stat_column(self):
        rename_column(self.dir / 'ItemLevel.csv', 'DirectHitRate', 'DirectHit')
        self.assert_fails(gen_item_level, 'ItemLevel.csv', 'DirectHitRate')

    def test_missing_param_grow_column(self):
        rename_column(self.dir / 'ParamGrow.csv', 'LevelModifier', 'LevelMod')
        self.assert_fails(gen_item_level, 'ParamGrow.csv', 'LevelModifier')

    def test_base_param_slot_share_mismatch(self):
        def fn(rows):
            col = rows[0].index('RingPercent')
            next(r for r in rows if r[0] == '5')[col] = '70'  # Mind

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'mind RingPercent = 70, page uses 67')

    def test_base_param_missing_column(self):
        rename_column(self.dir / 'BaseParam.csv', 'TwoHandWeaponPercent', 'TwoHandPercent')
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'TwoHandWeaponPercent')

    def test_base_param_missing_stat_row(self):
        edit_csv(self.dir / 'BaseParam.csv', lambda rows: rows.remove(next(r for r in rows if r[0] == '46')))
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'no row 46 (sps)')

    def test_command_line_exits_nonzero(self):
        rename_column(self.dir / 'ClassJobCategory.csv', 'SGE', 'SAGE')
        script = ROOT / 'scripts' / 'data' / 'gen_items.py'
        p = subprocess.run([sys.executable, str(script), str(self.dir), str(self.dir / 'out.js')], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)
        self.assertIn('SGE', p.stderr)
        self.assertNotIn('Traceback', p.stderr)


if __name__ == '__main__':
    unittest.main()
