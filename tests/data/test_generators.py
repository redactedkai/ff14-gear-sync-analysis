"""Tests for the data generators (scripts/data/gen_items.py, gen_item_level.py, gen_job_icons.py), the gear categories
(gear_categories.py) and the job icon numbering in fetch.py.

Fixtures in tests/data/fixtures/ use the real sheet headers from xivapi/ffxiv-datamining. EquipSlotCategory and
ClassJobCategory rows, and the BaseParam rows of the 12 stats, are copied from the real sheets; Item rows are test items
built on the real header, plus the 84 real materia items of the seven combat substats (text fields blanked). Materia
holds the real rows 0, 2 (Strength: items, no values), the seven combat substats, 18 (a gathering stat) and two decoys
(44, 48: values but no items); MateriaGrade is the whole real sheet. ItemLevel values are synthetic (row * 1000 + column
position) so a wrong column shows up as a wrong number. ClassJob holds the real rows of the 23 combat jobs and one base
class (Gladiator). ParamGrow (levels 0..100) is written in setUp. SchemaDriftTest
edits copies of the fixtures to check that renamed columns and changed slot shares stop the generators.

Run: npm run test:data
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
import gear_activities  # noqa: E402
import gear_categories  # noqa: E402
import gen_item_level  # noqa: E402
import gen_items  # noqa: E402
import gen_job_icons  # noqa: E402
from item_format import SchemaError, load_format  # noqa: E402

# Raw stat order of a generated row (src/core/item-format.json), written out independently here.
STAT_ORDER = ['str', 'dex', 'int', 'mind', 'vit', 'piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps', 'mainAttr', 'secAttr']
ALL_JOBS_MASK = (1 << 23) - 1


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
        cls.text = out.read_text(encoding='utf-8')
        cls.doc = json.loads(cls.text)
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
            self.assertEqual(len(r), 20, r)
            name, slot, ilvl, lvl, mask, st, unique, hq, routes, kind, meld_slots, overmeld, rarity, game_id, scales, cat, *dd = r
            self.assertIsInstance(name, str)
            self.assertIn(slot, range(15))
            self.assertEqual(len(st.split(',')), len(STAT_ORDER))
            self.assertIn(unique, (0, 1))
            self.assertIn(hq, (0, 1))
            n_boxes = len(load_format()['activities'])
            self.assertTrue(isinstance(routes, list) and all(0 < m < 1 << (n_boxes + 1) for m in routes), r)
            self.assertIn(kind, range(13))
            self.assertIn(meld_slots, range(6))
            self.assertIn(overmeld, (0, 1))
            self.assertIsInstance(rarity, int)
            self.assertIsInstance(game_id, int)
            self.assertIn(scales, (0, 1))
            self.assertIn(cat, range(len(load_format()['category']['list'])))
            self.assertTrue(all(isinstance(v, int) and v >= 0 for v in dd), r)
        ids = [r[13] for r in self.rows]
        self.assertEqual(len(set(ids)), len(ids))

    def test_one_row_per_line(self):
        """Each item row is a line of its own (so a patch's diff lists the rows that changed), and the text parses to the
        same value as compact JSON."""
        lines = self.text.splitlines()
        start = lines.index('"items":[')
        self.assertEqual([json.loads(line.rstrip(',')) for line in lines[start + 1 : start + 1 + len(self.rows)]], self.rows)
        self.assertEqual(lines[start + 1 + len(self.rows) :], [']', '}'])
        self.assertTrue(self.text.endswith('\n'))

    def test_drop_report(self):
        """select() counts the rows each rule left out; with the kept rows they add up to the whole Item.csv. The report
        line names each rule that left something out, the LEFT_OUT categories, and the rows kept."""
        kept, _, dropped = gen_items.select(FIXTURES)
        with open(FIXTURES / 'Item.csv', encoding='utf-8', newline='') as f:
            n_items = sum(1 for _ in csv.DictReader(f))
        self.assertEqual(list(dropped), list(gen_items.DROP_RULES))
        self.assertEqual(len(kept) + sum(dropped.values()), n_items)
        # the fixture's empty names, belt, soul crystal and non-gear rows, item level 14 piece, base-class-only pieces,
        # no-stat pieces, crafter and gatherer pieces and unsupported multi-slot piece
        self.assertEqual(dropped, {'name': 2, 'slot': 147, 'ilvl': 1, 'job': 4, 'stats': 3, 'crafter_gatherer': 2, 'multi_slot': 1})
        report = gen_items.drop_report(n_items, dropped, {'diadem': 2}, 22)
        self.assertEqual(
            report,
            f'Item.csv {n_items} rows: no name -2, no slot code (belts, soul crystals, not gear) -147, item level under 15 -1, '
            'no combat job -4, no stats -3, crafter or gatherer stat -2, multi-slot with no slot code -1, '
            'category diadem (LEFT_OUT) -2; kept 22',
        )

    def test_damage_defense_fields(self):
        """Fields 16-19 are DamagePhys, DamageMag, DefensePhys, DefenseMag, plus the HQ bonus (BaseParamSpecial pairs 12, 13,
        21, 24) only when the item can be HQ: Test Sallet HQ and NoHQ carry the same +14 defense pairs and 300/200 base."""
        self.assertEqual(self.row('Test Greataxe')[16:], [120, 60, 0, 0])
        self.assertEqual(self.row('Test Sallet HQ')[16:], [0, 0, 314, 214])
        self.assertEqual(self.row('Test Sallet NoHQ')[16:], [0, 0, 300, 200])
        self.assertEqual(self.row('Test Sword')[16:], [0, 0, 0, 0])

    def test_meld_fields(self):
        """meldSlots and overmeld are Item.MateriaSlotCount and IsAdvancedMeldingPermitted, after the routes and kind."""
        expect = {
            'Test Sallet HQ': (2, 1),
            'Test Robe': (5, 0),
            'Test Shield': (0, 1),  # no guaranteed slot, flagged anyway
            'Test Hood of Healing': (2, 0),
            'Test Greataxe': (0, 0),
        }
        for name, meld in expect.items():
            with self.subTest(name=name):
                self.assertEqual(tuple(self.row(name)[10:12]), meld)

    def test_materia_table(self):
        """The real values and gates (Materia sheet, materia items' LevelItem); the decoy rows are skipped."""
        self.assertEqual(
            self.doc['materia'],
            {
                'values': [1, 2, 3, 4, 6, 16, 8, 24, 12, 36, 18, 54],
                'gate': [15, 30, 45, 70, 160, 290, 420, 420, 560, 560, 690, 690],
                'high': [6, 8, 10, 12],
            },
        )
        _, decoys = gen_items.materia_table(FIXTURES, gen_items.load_format())
        self.assertEqual(decoys, 2)
        self.assertNotIn('Quicktongue Materia XII', self.by_name)  # materia items are not gear

    def test_stat_factor_kind(self):
        """The last field is the item's BaseParamModifier as written in Item.csv (the fixture sets a few)."""
        expect = {
            'Test Hood of Healing': 6,  # Mind gear: Vitality 90
            'Test Caster Hat': 5,  # Intelligence gear: Vitality 90
            'Test Tank Helm': 1,  # Strength gear
            'Test Earring': 8,  # Intelligence and Mind gear
            'Test Greataxe': 2,
            'Test Shoes': 0,  # all four main stats at 90
        }
        for name, kind in expect.items():
            with self.subTest(name=name):
                self.assertEqual(self.row(name)[9], kind)

    def test_routes(self):
        """Each "Gear from" rule in the fixtures (scripts/data/gear_activities.py), as box keys; every fixture piece but
        Test Ring Unique is tradeable, so each also has the market board route ('market')."""
        expect = {
            'Test Greataxe': ['relics'],  # category relic: a relic, whatever its other ways in
            'Test Sword': ['ultimate'],  # Dreadwyrm Totem: no way in, buys ultimate gear
            'Test Shield': ['tomes_legacy'],  # Poetics by item id
            'Test Hood of Healing': ['tomes_legacy'],  # type 4, code 1 (Poetics)
            'Test Robe': ['normal_duties'],  # an old tomestone by item id (slot 0: retired): a raid drop
            'Test Gloves': [],  # type 8 (gil), tradeable: the market board decides
            'Test Tonban': ['hunts'],  # Allied Seals
            'Test Shoes': ['tomes_legacy'],  # type 16, code 1 (Poetics)
            'Test Earring': ['normal_duties+tomes_legacy'],  # Test Choker (a dungeon drop) traded in, plus Poetics
            'Test Choker': ['normal_duties'],  # no way in: its category's drop
            'Test Bracelet': ['normal_duties'],  # code 2 at item level 130 while code 2 sells 140: retired listing
            'Test Ring Unique': ['misc'],  # an untradeable piece from a gil vendor; no market board route
            'Test Ring Plain': [],  # a tradeable piece from a gil vendor
            'Test Caster Hat': ['quests'],  # a quest reward
            'Test Min Ilvl': ['quests'],  # a job quest reward (QuestClassJobReward)
            'Test Preorder Earring': ['quests'],  # an achievement reward
            'Test Sallet HQ': ['crafted'],  # a recipe result
            'Test Sallet NoHQ': ['grand_company'],  # company seals
            'Test Alpha Helm': ['events'],  # a seasonal event gil shop (GilShop.FestivalId)
            'Test Alpha Mail': ['tomes_current'],  # code 2 at the newest item level
            'Test Zeta Helm': ['tomes_legacy+events', 'tomes_current'],  # Alpha Helm plus Poetics, or Heliometry
            'Test Tank Helm': ['normal_duties+tomes_legacy+events', 'normal_duties+tomes_current'],  # Zeta Helm + an item
            'Test Flanchard': ['quests'],  # a Calamity Salvager rebuy: the quest it asks for
            'Test Cloak': ['events'],  # a rebuy gated by a seasonal event quest
        }
        keys = [a['key'] for a in load_format()['activities']]
        market = 1 << len(keys)

        def as_keys(masks):
            return sorted('+'.join(k for i, k in enumerate(keys) if m >> i & 1) for m in masks if m != market)  # keys in box order

        for name, want in expect.items():
            with self.subTest(name=name):
                routes = self.row(name)[8]
                self.assertEqual(as_keys(routes), sorted(want))
                self.assertEqual(market in routes, name != 'Test Ring Unique')
        self.assertEqual(self.doc['currentTomes'], ['Heliometry', 'Mathematics'])  # TomestonesItem slots 2 and 3

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
        # Category 18: Legs 1, Feet -1 (legs that also cover the feet) has slot code 13
        self.assertEqual(self.row('Test Flanchard')[1], 13)
        # Category 20: Body 1, Gloves -1, Legs -1 has no slot code: left out and listed
        self.assertNotIn('Test Overall', self.by_name)
        _, multi_slot, _ = gen_items.select(FIXTURES)
        self.assertEqual(multi_slot, ['Test Overall (item level 130)'])

    def test_stat_mapping(self):
        self.assertEqual(self.row('Test Hood of Healing')[5], HEAL)
        self.assertEqual(self.row('Test Greataxe')[5], TANK)
        self.assertEqual(self.row('Test Sword')[5], stats(str=39, vit=42, crit=39, ten=27))
        self.assertEqual(self.row('Test Shield')[5], stats(str=16, vit=17, sks=15, det=11))
        self.assertEqual(self.row('Test Caster Hat')[5], stats(int=33, vit=32, sks=31, crit=22))
        # BaseParam in slot 5 after empty slots 3-4 (a layout real Unique rings use)
        self.assertEqual(self.row('Test Ring Unique')[5], stats(str=26, vit=28, crit=24, dh=17))
        self.assertEqual(self.row('Test Ring Plain')[5], stats(str=26, vit=28, ten=24, det=17))
        # the game's generic Main Attribute (55) and Secondary Attribute (56), as on the pre-order earrings
        self.assertEqual(self.row('Test Preorder Earring')[5], stats(mainAttr=115, vit=115, secAttr=111, det=111))

    def test_hq_bonus_only_when_can_be_hq(self):
        # NQ str 23 vit 23 ten 24 det 17; HQ bonus str 3 vit 3 ten 3 det 2 plus Defense / Magic Defense (ignored)
        self.assertEqual(self.row('Test Sallet HQ')[5], stats(str=26, vit=26, ten=27, det=19))
        self.assertEqual(self.row('Test Sallet NoHQ')[5], stats(str=23, vit=23, ten=24, det=17))
        # the HQ flag (last field) follows CanBeHq, so the page can mark rows whose stats are the HQ ones
        self.assertEqual(self.row('Test Sallet HQ')[7], 1)
        self.assertEqual(self.row('Test Sallet NoHQ')[7], 0)

    def test_minimum_item_level(self):
        self.assertEqual(gen_items.MIN_ILVL, 15)  # Sastasha's entry level, the lowest dungeon
        self.assertEqual(self.row('Test Min Ilvl')[2], 15)
        self.assertNotIn('Test Below Min Ilvl', self.by_name)
        self.assertTrue(all(r[2] >= 15 for r in self.rows))

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

    def test_rarity(self):
        # field 12 is Item.Rarity as written in the fixture
        self.assertEqual(self.row('Test Robe')[12], 2)
        self.assertEqual(self.row('Test Hood of Healing')[12], 3)
        self.assertEqual(self.row('Test Sword')[12], 0)

    def test_game_id(self):
        # field 13 is the Item.csv row id, the id other tools use
        self.assertEqual(self.row('Test Robe')[13], 1005)

    def test_level_scaled(self):
        # field 14 is 1 for SubStatCategory 2 (item level follows the wearer's level), as on the real pre-order earrings
        self.assertEqual(self.row('Test Preorder Earring')[14], 1)
        self.assertEqual([r[0] for r in self.rows if r[14]], ['Test Preorder Earring'])

    def test_category(self):
        # field 15 is the gear category (gear_categories.py) as an index into item-format.json's category.list
        keys = [c['key'] for c in load_format()['category']['list']]
        expect = {'Test Robe': 'raid', 'Test Greataxe': 'relic', 'Test Gloves': 'field_op', 'Test Tank Helm': 'dungeon'}
        for name, cat in expect.items():
            with self.subTest(name=name):
                self.assertEqual(keys[self.row(name)[15]], cat)

    def test_category_list_must_match(self):
        # a category with no label, a key gear_categories.py doesn't know, or a key listed twice stops the generator
        fmt = load_format()
        gen_items.category_index(fmt)
        cases = {
            'missing': [c for c in fmt['category']['list'] if c['key'] != 'dungeon'],
            'unknown': [*fmt['category']['list'], {'key': 'raid_finder', 'label': 'Raid finder'}],
            'twice': [*fmt['category']['list'], {'key': 'raid', 'label': 'Raid'}],
        }
        for word, lst in cases.items():
            with self.subTest(word=word), self.assertRaises(SchemaError) as e:
                gen_items.category_index({**fmt, 'category': {**fmt['category'], 'list': lst}})
            self.assertIn(word, str(e.exception))

    def test_crafter_gatherer_gear_excluded(self):
        # All Classes pieces with a combat stat (Vitality) are still left out when they carry a crafter or gatherer
        # stat, normal (Gathering) or HQ only (CP)
        for name in ('Test Gatherer Hat', 'Test Crafter HQ Ring'):
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
            'Test Preorder Earring',
            'Test Choker',
            'Test Bracelet',
            'Test Ring Plain',
            'Test Ring Unique',
            'Test Cloak',
            'Test Flanchard',
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
    # no ItemLevel column of their own: the main-stat and substat columns (equal to Strength and Direct Hit)
    'mainAttr': 'Strength',
    'secAttr': 'DirectHitRate',
    # weapon damage and defense (`damageDefense` in item-format.json)
    'damagePhys': 'PhysicalDamage',
    'damageMag': 'MagicalDamage',
    'defensePhys': 'Defense',
    'defenseMag': 'MagicDefense',
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
        shutil.copy(FIXTURES / 'ClassJob.csv', self.dir / 'ClassJob.csv')
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
        self.assertEqual(list(doc), ['_generated', 'source', 'IL', 'PG', 'MP', 'SHARES', 'JOBS'])
        self.assertIsNone(doc['source'])
        self.assertIn('commit unknown', doc['_generated'])
        src = {'repo': 'xivapi/ffxiv-datamining', 'commit': 'a' * 40, 'date': '2026-01-01T00:00:00Z'}
        run_quiet(gen_item_level.main, str(self.dir), str(out), src)
        doc = json.loads(out.read_text(encoding='utf-8'))
        self.assertEqual(doc['source'], src)
        self.assertIn('a' * 40, doc['_generated'])

    def test_one_entry_per_line(self):
        """IL, MP, SHARES and JOBS hold one key per line and PG one level per line, so a patch's diff names them."""
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        text = out.read_text(encoding='utf-8')
        doc = json.loads(text)
        lines = text.splitlines()
        for key in ('IL', 'MP', 'SHARES', 'JOBS'):
            start = lines.index(f'"{key}":{{')
            self.assertEqual(lines[start + 1].split(':', 1)[0], json.dumps(next(iter(doc[key]))), key)
        start = lines.index('"PG":[')
        self.assertEqual(json.loads(lines[start + 1].rstrip(',')), doc['PG'][0])
        self.assertEqual(lines[start + 1 + len(doc['PG'])], '],')

    def test_stat_factor_table(self):
        """MP: each stat's BaseParam MeldParam[0..12] row (the fixture holds the real rows), keyed by stat."""
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        mp = json.loads(out.read_text(encoding='utf-8'))['MP']
        self.assertEqual(list(mp), [*STAT_ORDER, 'damagePhys', 'damageMag', 'defensePhys', 'defenseMag'])
        self.assertEqual(mp['vit'], [90, 100, 100, 100, 100, 90, 90, 100, 90, 100, 100, 100, 100])
        # the real BaseParam rows 13 (Magic Damage) and 21 (Defense)
        self.assertEqual(mp['damageMag'], [50, 50, 50, 50, 50, 100, 100, 50, 100, 30, 50, 50, 50])
        self.assertEqual(mp['defensePhys'], [66, 100, 70, 55, 55, 40, 40, 100, 40, 33, 55, 55, 55])
        self.assertEqual(mp['mind'], [90, 70, 70, 70, 70, 70, 100, 70, 100, 100, 70, 70, 70])
        self.assertEqual(mp['str'][0], 90)  # kind 0: all four main stats at 90
        self.assertEqual(mp['crit'], [100] * 13)

    def test_damage_defense_slot_shares(self):
        """SHARES: the real BaseParam slot shares per slot code for weapon damage (weapons only) and defense (armor only)."""
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        shares = json.loads(out.read_text(encoding='utf-8'))['SHARES']
        damage = [1000, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        defense = [0, 0, 0, 176, 236, 176, 236, 176, 0, 0, 0, 0, 412, 412, 824]
        self.assertEqual(shares, {'damagePhys': damage, 'damageMag': damage, 'defensePhys': defense, 'defenseMag': defense})

    def test_job_modifiers(self):
        """JOBS: each combat job's attribute modifiers from the real ClassJob rows; base classes left out."""
        out = self.dir / 'item-level.json'
        run_quiet(gen_item_level.main, str(self.dir), str(out))
        jobs = json.loads(out.read_text(encoding='utf-8'))['JOBS']
        self.assertEqual(len(jobs), 23)
        self.assertNotIn('GLA', jobs)
        self.assertEqual(jobs['SGE'], {'str': 60, 'dex': 100, 'int': 115, 'mind': 115, 'vit': 100})
        self.assertEqual(jobs['WAR'], {'str': 105, 'dex': 95, 'int': 40, 'mind': 55, 'vit': 110})
        self.assertEqual(jobs['DRG']['vit'], 105)

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

    def test_param_grow_top_level_follows_the_data(self):
        """The top level is the highest row with an ItemLevelSync: a level cap of 110 gives 110 levels, and rows above
        the cap with no ItemLevelSync (like the real rows 101 to 200, and row 201's 100/100) are left out."""
        write_param_grow(self.dir / 'ParamGrow.csv', range(0, 111))
        self.assertEqual(len(self.generate()[1]), 110)
        write_param_grow(self.dir / 'ParamGrow.csv', range(0, 101))
        with open(self.dir / 'ParamGrow.csv', 'a', encoding='utf-8', newline='') as f:
            w = csv.writer(f, lineterminator='\n')
            for lv, speed in ((101, 0), (102, 0), (201, 100)):
                row = dict.fromkeys(PARAM_GROW_HEADER, '0')
                row.update({'#': lv, 'BaseSpeed': speed, 'LevelModifier': speed})
                w.writerow([row[k] for k in PARAM_GROW_HEADER])
        _, pg = self.generate()
        self.assertEqual(len(pg), 100)
        self.assertEqual(pg[-1], [1100, 2100, 3100])

    def test_param_grow_missing_level_fails(self):
        write_param_grow(self.dir / 'ParamGrow.csv', [lv for lv in range(0, 101) if lv != 57])
        with self.assertRaisesRegex(SchemaError, r'ParamGrow.csv: level\(s\) 57 missing'):
            self.generate()

    def test_non_contiguous_item_level_ids_fail(self):
        with open(self.dir / 'ItemLevel.csv', 'a', encoding='utf-8', newline='') as f:
            csv.writer(f, lineterminator='\n').writerow(['9'] + ['0'] * (len(self.header) - 1))
        with self.assertRaisesRegex(SchemaError, 'ItemLevel.csv ids'):
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
    Test Sallet HQ 8320 (a recipe result -> crafted); every other piece 8270 (dungeon). Hood and Earring are also sold
    for the Savage book, which has no way in and buys Savage gear: their "Gear from" routes include Savage."""

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
        kept, *_ = gen_items.select(self.dir)
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

    def routes(self):
        """{name: routes as box keys} from gear_activities.py on this test's copy of the fixtures."""
        cats, kept, ids = self.categories()
        kept = [(r, row) for r, row in kept if ids[r['#']] not in gear_categories.LEFT_OUT]
        keys = [a['key'] for a in load_format()['activities']]
        out = gear_activities.routes(self.dir, kept, ids)
        return {r['Name']: sorted('+'.join(k for i, k in enumerate(keys) if m >> i & 1) for m in out[r['#']]) for r, _ in kept}

    def test_savage_splits_at_the_level_cap(self):
        # Savage at the highest equip level of the kept gear (the level cap) is Savage (Current), below it Savage (Legacy)
        routes = self.routes()
        self.assertIn('savage_current', routes['Test Earring'])
        self.assertIn('savage_current', routes['Test Hood of Healing'])

        def fn(rows):
            lv = rows[0].index('LevelEquip')
            next(r for r in rows if r[0] == '1009')[lv] = '40'

        edit_csv(self.dir / 'Item.csv', fn)
        routes = self.routes()
        self.assertIn('savage_legacy', routes['Test Earring'])
        self.assertIn('savage_current', routes['Test Hood of Healing'])  # equip level 50, the highest: current

    def test_code_250_and_990_are_left_out(self):
        # code 250 is Diadem gear at equip level 60 and Aetherial gear at 50 or below (both random secondary
        # attributes); code 990 is legacy gear. All three categories are dropped from the database.
        def fn(rows):
            h = rows[0]
            sort, lv = h.index('SubcategorySort'), h.index('LevelEquip')
            for gid, code, level in (('1006', '8250', '60'), ('1007', '8250', '50'), ('1008', '8990', '50')):
                r = next(r for r in rows if r[0] == gid)
                r[sort], r[lv] = code, level

        edit_csv(self.dir / 'Item.csv', fn)
        cats, _, _ = self.categories()
        self.assertEqual((cats['Test Gloves'], cats['Test Tonban'], cats['Test Shoes']), ('diadem', 'aetherial', 'legacy'))
        self.assertTrue({'diadem', 'aetherial', 'legacy'} <= gear_categories.LEFT_OUT)

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

    def test_boolean_columns_other_than_true_false(self):
        """CanBeHq, IsUnique and IsUntradable are read as the string 'True'; an exporter that wrote 1/0 instead must stop
        the generator rather than make every piece non-HQ, non-Unique or tradeable."""
        for col in ('CanBeHq', 'IsUnique', 'IsUntradable'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')

                def fn(rows, col=col):
                    i = rows[0].index(col)
                    for r in rows[1:]:
                        r[i] = {'True': '1', 'False': '0'}[r[i]]

                edit_csv(self.dir / 'Item.csv', fn)
                self.assert_fails(gen_items, 'Item.csv', col, "'0', '1'", 'True or False')

    def test_missing_equip_slot_column(self):
        for col in ('Gloves', 'OffHand', 'MainHand', 'FingerL'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'EquipSlotCategory.csv', self.dir / 'EquipSlotCategory.csv')
                rename_column(self.dir / 'EquipSlotCategory.csv', col, col + 'X')
                self.assert_fails(gen_items, 'EquipSlotCategory.csv', col)

    def test_missing_item_column(self):
        cols = ('Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique', 'Rarity')
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
        cols = (
            ('Recipe.csv', 'ItemResult'),
            ('SpecialShop.csv', 'UseCurrencyType'),
            ('TomestonesItem.csv', 'Item'),
            ('TomestonesItem.csv', 'Tomestones'),
            ('Quest.csv', 'Reward[0]'),
            ('Quest.csv', 'Festival'),
            ('QuestClassJobReward.csv', 'RewardItem[0]'),
            ('Achievement.csv', 'Item'),
            ('GCScripShopItem.csv', 'Item'),
            ('GilShop.csv', 'FestivalId'),
            ('GilShopItem.csv', 'QuestRequired[1]'),
            ('GilShopItem.csv', 'AchievementRequired'),
        )
        for sheet, col in cols:
            with self.subTest(col=col):
                shutil.copy(FIXTURES / sheet, self.dir / sheet)
                rename_column(self.dir / sheet, col, col + 'X')
                self.assert_fails(gen_items, sheet, col)
                shutil.copy(FIXTURES / sheet, self.dir / sheet)

    def test_changed_currency_id(self):
        # a currency the game files cannot place is keyed by id with its name: a patch that reuses the id stops the run
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '26533')[col] = 'Something Else'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'currency', 'Sack of Nuts')

    def test_changed_retired_shop_id(self):
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '1769983')[col] = 'Something Else'

        edit_csv(self.dir / 'SpecialShop.csv', fn)
        self.assert_fails(gen_items, 'retired shop', 'Deepshadow Gear Exchange')

    def test_activity_with_no_box(self):
        # combat gear sold for a crafters' scrip (type 16, code 2) has no "Gear from" box: a new kind of source stops the run
        def fn(rows):
            h = rows[0]
            r = next(r for r in rows if r[0] == '1769003')
            k = next(k for k in range(60) if r[h.index(f'Item[{k}].Item[0]')] == '1007')
            r[h.index(f'Item[{k}].ItemCost[0]')] = '2'

        edit_csv(self.dir / 'SpecialShop.csv', fn)
        self.assert_fails(gen_items, 'Scrips', 'Test Tonban', 'has no box')

    def test_missing_item_level_stat_column(self):
        rename_column(self.dir / 'ItemLevel.csv', 'DirectHitRate', 'DirectHit')
        self.assert_fails(gen_item_level, 'ItemLevel.csv', 'DirectHitRate')

    def test_missing_class_job_column(self):
        rename_column(self.dir / 'ClassJob.csv', 'ModifierVitality', 'ModifierVit')
        self.assert_fails(gen_item_level, 'ClassJob.csv', 'ModifierVitality')

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

    def test_rarity_not_a_number(self):
        def fn(rows):
            col = rows[0].index('Rarity')
            next(r for r in rows if r[0] == '1005')[col] = 'green'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'Rarity', 'not a whole number', 'Test Robe')

    def test_unknown_level_scaled_value(self):
        """A SubStatCategory value the format does not know stops gen_items: it might be a new kind of scaling."""

        def fn(rows):
            col = rows[0].index('SubStatCategory')
            next(r for r in rows if r[0] == '1005')[col] = '3'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'SubStatCategory outside [0, 1, 2]', "Test Robe ('3')")

    def test_crafter_gatherer_param_renamed(self):
        """A crafter/gatherer stat row id that now names something else stops gen_items (item-format.json is stale)."""

        def fn(rows):
            next(r for r in rows if r[0] == '72')[1] = 'Gathering Rate'

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_items, 'BaseParam.csv', '72 (Gathering)', 'Gathering Rate')

    def test_unknown_stat_factor_kind(self):
        """An item kind (BaseParamModifier) with no MeldParam column stops gen_items: its stat factors are unknown."""

        def fn(rows):
            col = rows[0].index('BaseParamModifier')
            next(r for r in rows if r[0] == '1015')[col] = '13'  # Test Tank Helm

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'BaseParamModifier', 'MeldParam[0..12]', 'Test Tank Helm (13)')

    def test_stat_factor_columns(self):
        rename_column(self.dir / 'BaseParam.csv', 'MeldParam[12]', 'MeldParam12')
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'MeldParam[12]')
        self.assert_fails(gen_items, 'BaseParam.csv', 'MeldParam[12]')
        shutil.copy(FIXTURES / 'BaseParam.csv', self.dir / 'BaseParam.csv')
        rename_column(self.dir / 'Item.csv', 'BaseParamModifier', 'Modifier')
        self.assert_fails(gen_items, 'Item.csv', 'BaseParamModifier')

    def test_stat_factor_not_a_percent(self):
        def fn(rows):
            col = rows[0].index('MeldParam[5]')
            next(r for r in rows if r[0] == '3')[col] = '0'  # Vitality

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'vit MeldParam', 'percents 1 to 100')

    def test_missing_meld_columns(self):
        for col in ('MateriaSlotCount', 'IsAdvancedMeldingPermitted'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
                rename_column(self.dir / 'Item.csv', col, col + 'X')
                self.assert_fails(gen_items, 'Item.csv', col)
        shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
        for sheet, col in (('Materia.csv', 'Item[11]'), ('Materia.csv', 'Value[0]'), ('MateriaGrade.csv', 'OvermeldNQPercent[1]')):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / sheet, self.dir / sheet)
                rename_column(self.dir / sheet, col, col + 'X')
                self.assert_fails(gen_items, sheet, col)
                shutil.copy(FIXTURES / sheet, self.dir / sheet)

    def test_meld_slots_above_five(self):
        def fn(rows):
            col = rows[0].index('MateriaSlotCount')
            next(r for r in rows if r[0] == '1005')[col] = '6'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'MateriaSlotCount 0 to 5', 'Test Robe (6, False)')

    def test_bad_overmeld_value(self):
        def fn(rows):
            col = rows[0].index('IsAdvancedMeldingPermitted')
            next(r for r in rows if r[0] == '1005')[col] = '1'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'IsAdvancedMeldingPermitted True or False', 'Test Robe (5, 1)')

    def test_combat_materia_rows_disagree(self):
        def fn(rows):
            col = rows[0].index('Value[11]')
            next(r for r in rows if r[0] == '15')[col] = '55'  # Critical Hit

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'crit values or gates differ from piety')

    def test_materia_gate_disagrees(self):
        """A materia item whose LevelItem differs from the other stats' item of that grade."""

        def fn(rows):
            col = rows[0].index('LevelItem')
            next(r for r in rows if r[0] == '41782')[col] = '700'  # Quicktongue Materia XII

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'values or gates differ')

    def test_decoy_is_not_counted_but_a_second_item_row_is(self):
        def fn(rows):
            col = rows[0].index('Item[0]')
            next(r for r in rows if r[0] == '44')[col] = '5629'  # the Direct Hit decoy gets an item

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'dh: 2 rows with items, expected 1')

    def test_missing_combat_materia_row(self):
        edit_csv(self.dir / 'Materia.csv', lambda rows: rows.remove(next(r for r in rows if r[0] == '24')))
        self.assert_fails(gen_items, 'Materia.csv', 'sks: 0 rows with items')

    def test_thirteenth_grade(self):
        def fn(rows):
            h = rows[0]
            r = next(r for r in rows if r[0] == '7')  # Piety
            r[h.index('Item[12]')], r[h.index('Value[12]')] = '41770', '60'

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'more than 12 grades', 'Item[12]', 'Value[12]')

    def test_high_grades_mismatch(self):
        def fn(rows):
            col = rows[0].index('OvermeldNQPercent[1]')
            next(r for r in rows if r[0] == '5')[col] = '6'  # grade VI now allowed past the first overmeld slot

        edit_csv(self.dir / 'MateriaGrade.csv', fn)
        self.assert_fails(gen_items, 'MateriaGrade.csv', 'grades [8, 10, 12]', '[6, 8, 10, 12]')

    def test_command_line_exits_nonzero(self):
        rename_column(self.dir / 'ClassJobCategory.csv', 'SGE', 'SAGE')
        script = ROOT / 'scripts' / 'data' / 'gen_items.py'
        p = subprocess.run([sys.executable, str(script), str(self.dir), str(self.dir / 'out.js')], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)
        self.assertIn('SGE', p.stderr)
        self.assertNotIn('Traceback', p.stderr)


if __name__ == '__main__':
    unittest.main()
