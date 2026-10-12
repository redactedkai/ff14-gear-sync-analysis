"""Tests for the data generators (scripts/data/gen_items.py, gen_item_level.py, gen_job_icons.py), the gear categories
(gear_categories.py) and the job icon numbering in fetch.py.

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

import fetch  # noqa: E402
import gear_categories  # noqa: E402
import gen_item_level  # noqa: E402
import gen_items  # noqa: E402
import gen_job_icons  # noqa: E402
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
        out = Path(cls.tmp.name) / 'items.json'
        run_quiet(gen_items.main, str(FIXTURES), str(out))
        cls.doc = json.loads(out.read_text(encoding='utf-8'))
        cls.rows = cls.doc['items']
        cls.by_name = {r[0]: r for r in cls.rows}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def row(self, name):
        self.assertIn(name, self.by_name)
        return self.by_name[name]

    def test_row_shape(self):
        for r in self.rows:
            self.assertEqual(len(r), 9, r)
            name, slot, ilvl, lvl, mask, st, unique, hq, sources = r
            self.assertIsInstance(name, str)
            self.assertIn(slot, range(13))
            self.assertEqual(len(st.split(',')), 12)
            self.assertIn(unique, (0, 1))
            self.assertIn(hq, (0, 1))
            self.assertIn(sources, range(32))

    def test_sources(self):
        """Each SpecialShop and Recipe rule in the fixtures (scripts/data/gear_sources.py), plus the bits that come from
        the category (gear_categories.py). Bits: 1 crafted, 2 tomestone, 4 relic, 8 savage, 16 ultimate."""
        expect = {
            'Test Sallet HQ': 1,  # a recipe result
            'Test Hood of Healing': 2 | 8,  # type 4, code 1 (Poetics); code 20 with a dye slot: Savage
            'Test Alpha Mail': 2,  # type 4, code 2 (the second current tomestone)
            'Test Sword': 16,  # Dreadwyrm Totem
            'Test Gloves': 4,  # type 8: gil; code 10 armor: field_op, in the relic group
            'Test Tonban': 0,  # type 16, code 2: a crafter scrip
            'Test Shoes': 2,  # type 16, code 1 (Poetics)
            'Test Earring': 2,  # type 2, code 1 (Poetics) plus a piece traded in
            'Test Choker': 0,  # the piece traded in: not flagged
            'Test Bracelet': 2,  # type 2, code 2
            'Test Ring Plain': 0,  # traded in for Test Bracelet: not flagged
            'Test Shield': 2,  # Poetics by item id
            'Test Robe': 2,  # an old tomestone by item id
            'Test Zeta Helm': 2,  # Heliometry by item id, and Poetics plus Test Alpha Helm
            'Test Alpha Helm': 0,  # the base piece an exchange turns into Test Zeta Helm: not flagged
            'Test Tank Helm': 2,  # made by trading in Test Zeta Helm (tomestone gear) plus a non-gear item
            'Test Greataxe': 4,  # in no shop and no recipe; code 10 weapon: relic
        }
        for name, bits in expect.items():
            with self.subTest(name=name):
                self.assertEqual(self.row(name)[8], bits)

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

    def test_multi_slot_gear(self):
        # Category 15: Body 1, Head -1 (a cloak that also covers the head) has its own slot code, 12
        self.assertEqual(self.row('Test Cloak')[1], 12)
        self.assertEqual(self.row('Test Robe')[1], 4)  # a plain body piece
        # Category 18: Legs 1, Feet -1 has no slot code: left out and listed
        self.assertNotIn('Test Flanchard', self.by_name)
        _, multi_slot = gen_items.select(FIXTURES)
        self.assertEqual(multi_slot, ['Test Flanchard (item level 130)'])

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
        # the HQ flag (last field) follows CanBeHq, so the page can mark rows whose stats are the HQ ones
        self.assertEqual(self.row('Test Sallet HQ')[7], 1)
        self.assertEqual(self.row('Test Sallet NoHQ')[7], 0)

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
            'Test Cloak',
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
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        doc = json.loads(out.read_text(encoding='utf-8'))
        return doc['IL'], doc['PG']

    def test_provenance_fields(self):
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out), None)
        doc = json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(list(doc), ['_generated', 'source', 'IL', 'PG'])
        self.assertIsNone(doc['source'])
        self.assertIn('commit unknown', doc['_generated'])
        src = {'repo': 'xivapi/ffxiv-datamining', 'commit': 'a' * 40, 'date': '2026-01-01T00:00:00Z'}
        run_quiet(gen_item_level.main, str(self.dir), str(out), src)
        doc = json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(doc['source'], src)
        self.assertIn('a' * 40, doc['_generated'])

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


def fake_png(width=64, height=64):
    """The first bytes of a PNG: signature and IHDR chunk with the given size (enough for gen_job_icons' check)."""
    return b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\x0dIHDR' + width.to_bytes(4, 'big') + height.to_bytes(4, 'big') + b'\x08\x06\x00\x00\x00'


JOBS = json.loads((ROOT / 'src' / 'core' / 'item-format.json').read_text(encoding='utf-8'))['jobs']


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


def add_shop(rows, shop_id, listings):
    """Append a SpecialShop row selling each (item, cost item) pair; rows is the CSV as lists, header first."""
    h = rows[0]
    row = ['0'] * len(h)
    row[h.index('#')], row[h.index('Name')] = shop_id, f'Test Shop {shop_id}'
    for k, (give, cost) in enumerate(listings):
        row[h.index(f'Item[{k}].Item[0]')] = give
        row[h.index(f'Item[{k}].ItemCost[0]')] = cost
    rows.append(row)


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


class GearCategoriesTest(unittest.TestCase):
    """gear_categories.py on a copy of the fixtures plus a raid-book shop set. The fixture Item.csv carries the codes
    (SubcategorySort; the role prefix in front of the last three digits is ignored) and dye slots:
    Test Greataxe 8010 (relic weapon), Test Sword 2060 (bought with a totem -> ultimate), Test Shield 2060 (trial),
    Test Hood of Healing 47020 with a dye slot (Savage seed), Test Robe 47020 (raid, bought with a Normal token),
    Test Gloves 8010 (not a weapon -> field_op), Test Earring 49020 (no dye, bought with the Savage book -> savage),
    Test Sallet HQ 8320 (a recipe result -> crafted); every other piece 8270 (dungeon)."""

    WEAPON_SLOTS = {0, 1, 2}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        for f in FIXTURES.glob('*.csv'):
            shutil.copy(f, self.dir / f.name)

        def items(rows):
            h = rows[0]
            book, token = list(rows[1]), list(rows[1])  # copies of the empty row 0, as non-gear items
            book[0], book[h.index('Name')] = '1098', 'Test Savage Book'
            token[0], token[h.index('Name')] = '1099', 'Test Normal Token'
            rows += [book, token]

        # as in the game, Savage gear (raid books) and Normal gear (tokens) are sold in separate shops
        edit_csv(self.dir / 'SpecialShop.csv', lambda rows: add_shop(rows, '1769098', [('1004', '1098'), ('1009', '1098')]))
        edit_csv(self.dir / 'SpecialShop.csv', lambda rows: add_shop(rows, '1769099', [('1005', '1099')]))

        edit_csv(self.dir / 'Item.csv', items)

    def tearDown(self):
        self.tmp.cleanup()

    def categories(self):
        kept, _ = gen_items.select(self.dir)
        cats = gear_categories.categorize(self.dir, kept, self.WEAPON_SLOTS)
        names = {r['#']: r['Name'] for r, _ in kept}
        return {names[i]: c for i, c in cats.items()}, kept, cats

    def test_rules(self):
        cats, kept, ids = self.categories()
        expect = {
            'Test Greataxe': 'relic',
            'Test Gloves': 'field_op',
            'Test Sword': 'ultimate',
            'Test Shield': 'trial',
            'Test Hood of Healing': 'savage',
            'Test Earring': 'savage',
            'Test Robe': 'raid',
            'Test Sallet HQ': 'crafted',
            'Test Tank Helm': 'dungeon',
        }
        for name, cat in expect.items():
            with self.subTest(name=name):
                self.assertEqual(cats[name], cat)
        self.assertEqual(gear_categories.check(kept, ids), [])

    def test_source_masks(self):
        # category groups (item-format.json `sources`) on top of the shop and recipe flags; field_op is in the relic group
        cats, kept, ids = self.categories()
        names = {r['#']: r['Name'] for r, _ in kept}
        masks = {names[i]: m for i, m in gear_categories.source_masks(kept, ids).items()}
        expect = {
            'Test Sallet HQ': 1,  # crafted
            'Test Sword': 16,  # ultimate
            'Test Earring': 2 | 8,  # tomestone flag, and savage (bought with the Savage book)
            'Test Robe': 2,  # tomestone flag; Normal raid is in no group
            'Test Greataxe': 4,  # relic
            'Test Gloves': 4,  # field_op
            'Test Shield': 2,  # tomestone flag; trial is in no group
            'Test Tank Helm': 2,  # tomestone flag; dungeon is in no group
        }
        for name, mask in expect.items():
            with self.subTest(name=name):
                self.assertEqual(masks[name], mask)

    def test_savage_group_takes_only_the_current_expansion(self):
        # Savage is `currentOnly`: a Savage piece below the highest equip level in the data (an older expansion) is
        # still categorized savage but left out of the group
        def fn(rows):
            lv = rows[0].index('LevelEquip')
            next(r for r in rows if r[0] == '1009')[lv] = '40'

        edit_csv(self.dir / 'Item.csv', fn)
        cats, kept, ids = self.categories()
        names = {r['#']: r['Name'] for r, _ in kept}
        masks = {names[i]: m for i, m in gear_categories.source_masks(kept, ids).items()}
        self.assertEqual(cats['Test Earring'], 'savage')
        self.assertEqual(masks['Test Earring'], 2)  # tomestone flag only
        self.assertEqual(masks['Test Hood of Healing'], 2 | 8)  # equip level 50, the highest: current

    def test_shared_shop_is_caught(self):
        # a Normal token taken by the Savage shop makes the Normal robe "savage"; the dye check reports it
        edit_csv(self.dir / 'SpecialShop.csv', lambda rows: add_shop(rows, '1769097', [('1004', '1099')]))
        cats, kept, ids = self.categories()
        self.assertEqual(cats['Test Robe'], 'savage')
        self.assertTrue(any('Test Robe' in p and 'dye' in p for p in gear_categories.check(kept, ids)))

    def test_currency_override(self):
        # gear bought with Proto Ultima Heat Shielding is alliance raid gear whatever its code says
        edit_csv(self.dir / 'SpecialShop.csv', lambda rows: add_shop(rows, '1769096', [('1003', '17521')]))
        cats, _, _ = self.categories()
        self.assertEqual(cats['Test Shield'], 'alliance_raid')  # code 60 would make it trial

    def test_override_id_with_a_new_name_stops(self):
        def fn(rows):
            n = rows[0].index('Name')
            next(r for r in rows if r[0] == '17521')[n] = 'Something Else'

        edit_csv(self.dir / 'Item.csv', fn)
        with self.assertRaises(SchemaError) as cm:
            self.categories()
        self.assertIn('Proto Ultima Heat Shielding', str(cm.exception))

    def test_unknown_code_stops(self):
        def fn(rows):
            sc = rows[0].index('SubcategorySort')
            next(r for r in rows if r[0] == '1015')[sc] = '8999'

        edit_csv(self.dir / 'Item.csv', fn)
        with self.assertRaises(SchemaError) as cm:
            self.categories()
        self.assertIn('999 (1 pieces)', str(cm.exception))

    def test_cross_check_flags_a_recipe_result_outside_crafted(self):
        def fn(rows):
            sc = rows[0].index('SubcategorySort')
            next(r for r in rows if r[0] == '1020')[sc] = '8270'

        edit_csv(self.dir / 'Item.csv', fn)
        _, kept, ids = self.categories()
        self.assertTrue(any('Test Sallet HQ' in p for p in gear_categories.check(kept, ids)))


class SchemaDriftTest(unittest.TestCase):
    """A game patch that renames or drops a column, or changes a slot share, must stop the generators."""

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
        run_quiet(gen_items.main, str(self.dir), str(self.dir / 'items.json'))
        run_quiet(gen_item_level.main, str(self.dir), str(self.dir / 'item-level.json'))

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

    def test_changed_totem_id(self):
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '44743')[col] = 'Something Else'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'ultimate totem', 'Oracle Totem')

    def test_missing_source_columns(self):
        for sheet, col in (('Recipe.csv', 'ItemResult'), ('SpecialShop.csv', 'UseCurrencyType'), ('TomestonesItem.csv', 'Item')):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / sheet, self.dir / sheet)
                rename_column(self.dir / sheet, col, col + 'X')
                self.assert_fails(gen_items, sheet, col)
                shutil.copy(FIXTURES / sheet, self.dir / sheet)

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
