"""Tests for scripts/data/gen_items.py (src/data/items.js): the item rows, their stats, slots, jobs, materia and sources.

Fixtures in tests/data/fixtures/ use the real sheet headers from xivapi/ffxiv-datamining (described in common.py). Item
rows are test items built on the real header, plus the 84 real materia items of the seven combat substats (text fields
blanked). ParamGrow (levels 0..100) is written in setUp.

Run: npm run test:py (npm run check:all runs them too)
"""

import csv
import json
import shutil
import tempfile
import unittest
from collections.abc import Iterable
from pathlib import Path
from typing import Any  # any-ok: parsed JSON rows

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gen_items
from common import (
    ALL_JOBS_MASK,
    FIXTURES,
    HEAL,
    STAT_ORDER,
    TANK,
    edit_csv,
    run_quiet,
    stats,
)
from item_format import CategoryEntry, ItemFormat, SchemaError, load_format, row_fields


class GenItemsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        out: Path = Path(cls.tmp.name) / 'items.json'
        run_quiet(gen_items.main, str(FIXTURES), str(out))
        cls.text = out.read_text(encoding='utf-8')
        cls.doc = json.loads(cls.text)
        cls.rows = cls.doc['items']
        cls.by_name = {r[0]: r for r in cls.rows}

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def row(self, name: str) -> list[Any]:  # any-ok: a parsed row: its cells are str, int or list by field, read by the test
        self.assertIn(name, self.by_name)
        return self.by_name[name]

    def test_row_shape(self) -> None:
        for r in self.rows:
            self.assertEqual(len(r), 20, r)
            name, slot, _ilvl, _lvl, _mask, st, unique, hq, routes, kind, meld_slots, overmeld, rarity, game_id, scales, cat, *dd = r
            self.assertIsInstance(name, str)
            self.assertIn(slot, range(15))
            self.assertEqual(len(st.split(',')), len(STAT_ORDER))
            self.assertIn(unique, (0, 1))
            self.assertIn(hq, (0, 1))
            n_boxes: int = len(load_format()['activities'])
            self.assertIsInstance(routes, list, r)
            masks: list[int] = routes
            self.assertTrue(all(0 < mask < 1 << (n_boxes + 1) for mask in masks), r)
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

    def test_row_fields_come_from_the_format(self) -> None:
        """Rows are built by the field names of itemRow.fields; a rowField elsewhere in the format file that disagrees
        with that list stops the generator."""
        fmt = load_format()
        self.assertEqual(list(row_fields(fmt)), fmt['itemRow']['fields'])
        self.assertEqual(row_fields(fmt)['category'], fmt['category']['rowField'])
        fmt['rarity']['rowField'] = 13
        with self.assertRaises(SchemaError) as cm:
            _ = row_fields(fmt)
        self.assertIn('rarity rowField 13', str(cm.exception))

    def test_one_row_per_line(self) -> None:
        """Each item row is a line of its own (so a patch's diff lists the rows that changed), and the text parses to the
        same value as compact JSON."""
        lines: list[str] = self.text.splitlines()
        start: int = lines.index('"items":[')
        self.assertEqual([json.loads(line.rstrip(',')) for line in lines[start + 1 : start + 1 + len(self.rows)]], self.rows)
        self.assertEqual(lines[start + 1 + len(self.rows) :], [']', '}'])
        self.assertTrue(self.text.endswith('\n'))

    def test_drop_report(self) -> None:
        """select() counts the rows each rule left out; with the kept rows they add up to the whole Item.csv. The report
        line names each rule that left something out, the LEFT_OUT categories, and the rows kept."""
        kept, _, dropped, dangling = gen_items.select(FIXTURES)
        with (FIXTURES / 'Item.csv').open(encoding='utf-8', newline='') as f:
            n_items: int = sum(1 for _ in csv.DictReader(f))
        self.assertEqual(list(dropped), list(gen_items.DROP_RULES))
        self.assertEqual(len(kept) + sum(dropped.values()), n_items)
        # the fixture's empty names, belt, soul crystal and non-gear rows, item level 14 piece, base-class-only pieces,
        # no-stat pieces, crafter and gatherer pieces and unsupported multi-slot piece
        self.assertEqual(dropped, {'name': 2, 'slot': 149, 'ilvl': 1, 'job': 4, 'stats': 3, 'crafter_gatherer': 2, 'multi_slot': 1})
        # one piece names an EquipSlotCategory id with no row, one a ClassJobCategory id with no row
        self.assertEqual(dangling, {'EquipSlotCategory': 1, 'ClassJobCategory': 1})
        report: str = gen_items.drop_report(n_items, dropped, {'diadem': 2}, 22)
        self.assertEqual(
            report,
            f'Item.csv {n_items} rows: no name -2, no slot code (belts, soul crystals, not gear) -149, item level under 1 -1, '
            'no combat job -4, no stats -3, crafter or gatherer stat -2, multi-slot with no slot code -1, '
            'category diadem (LEFT_OUT) -2; kept 22',
        )
        report = gen_items.drop_report(n_items, dropped, {}, 22, dangling)
        self.assertIn('-149 (1 with an id that has no EquipSlotCategory row)', report)
        self.assertIn('no combat job -4 (1 with an id that has no ClassJobCategory row)', report)

    def test_damage_defense_fields(self) -> None:
        """Fields 16-19 are DamagePhys, DamageMag, DefensePhys, DefenseMag, plus the HQ bonus (BaseParamSpecial pairs 12, 13,
        21, 24) only when the item can be HQ: Test Sallet HQ and NoHQ carry the same +14 defense pairs and 300/200 base."""
        self.assertEqual(self.row('Test Greataxe')[16:], [120, 60, 0, 0])
        self.assertEqual(self.row('Test Sallet HQ')[16:], [0, 0, 314, 214])
        self.assertEqual(self.row('Test Sallet NoHQ')[16:], [0, 0, 300, 200])
        self.assertEqual(self.row('Test Sword')[16:], [0, 0, 0, 0])

    def test_meld_fields(self) -> None:
        """meldSlots and overmeld are Item.MateriaSlotCount and IsAdvancedMeldingPermitted, after the routes and kind."""
        expect: dict[str, tuple[int, int]] = {
            'Test Sallet HQ': (2, 1),
            'Test Robe': (5, 0),
            'Test Shield': (0, 1),  # no guaranteed slot, flagged anyway
            'Test Hood of Healing': (2, 0),
            'Test Greataxe': (0, 0),
        }
        for name, meld in expect.items():
            with self.subTest(name=name):
                self.assertEqual(tuple(self.row(name)[10:12]), meld)

    def test_materia_table(self) -> None:
        """The real values and gates (Materia sheet, materia items' LevelItem); the decoy rows are skipped."""
        self.assertEqual(
            self.doc['materia'],
            {
                'values': [1, 2, 3, 4, 6, 16, 8, 24, 12, 36, 18, 54],
                'gate': [15, 30, 45, 70, 160, 290, 420, 420, 560, 560, 690, 690],
                'high': [6, 8, 10, 12],
                'overmeld': {
                    # MateriaGrade rows 0 to 11; the HQ rows for grades I to V+ are the Wiki's Advanced Materia Melding table
                    'nq': [[80, 40, 20, 10], [72, 36, 18, 10], [60, 30, 16, 8], [48, 24, 12, 6]] + [[12, 6, 3, 2], [12, 0, 0, 0]] * 4,
                    'hq': [[90, 48, 28, 16], [82, 44, 26, 16], [70, 38, 22, 14], [58, 32, 20, 12]] + [[17, 10, 7, 5], [17, 0, 0, 0]] * 4,
                },
            },
        )
        _, decoys = gen_items.materia_table(FIXTURES, gen_items.load_format())
        self.assertEqual(decoys, 2)
        self.assertNotIn('Quicktongue Materia XII', self.by_name)  # materia items are not gear

    def test_stat_factor_kind(self) -> None:
        """The last field is the item's BaseParamModifier as written in Item.csv (the fixture sets a few)."""
        expect: dict[str, int] = {
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

    def test_routes(self) -> None:
        """Each "Gear categories" rule in the fixtures (scripts/data/gear_activities.py), as box keys; every fixture piece but
        Test Ring Unique is tradeable, so each also has the market board route ('market')."""
        expect: dict[str, list[str]] = {
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
        keys: list[str] = [a['key'] for a in load_format()['activities']]
        market: int = 1 << len(keys)

        def as_keys(masks: Iterable[int]) -> list[str]:
            return sorted('+'.join(k for i, k in enumerate(keys) if (m >> i & 1) != 0) for m in masks if m != market)  # keys in box order

        for name, want in expect.items():
            with self.subTest(name=name):
                routes = self.row(name)[8]
                self.assertEqual(as_keys(routes), sorted(want))
                self.assertEqual(market in routes, name != 'Test Ring Unique')
        self.assertEqual(self.doc['currentTomes'], ['Heliometry', 'Mathematics'])  # TomestonesItem slots 2 and 3

    def test_slot_detection(self) -> None:
        expect: dict[str, int] = {
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

    def test_excluded_slots(self) -> None:
        for name in ('Test Belt', 'Test Soul Crystal', 'Test Missing Slot Category', 'Test Non-gear'):
            self.assertNotIn(name, self.by_name)

    def test_multi_slot_gear(self) -> None:
        # Category 15: Body 1, Head -1 (a cloak that also covers the head) has its own slot code, 12
        self.assertEqual(self.row('Test Cloak')[1], 12)
        self.assertEqual(self.row('Test Robe')[1], 4)  # a plain body piece
        # Category 18: Legs 1, Feet -1 (legs that also cover the feet) has slot code 13
        self.assertEqual(self.row('Test Flanchard')[1], 13)
        # Category 20: Body 1, Gloves -1, Legs -1 has no slot code: left out and listed
        self.assertNotIn('Test Overall', self.by_name)
        multi_slot: list[str] = gen_items.select(FIXTURES).multi_slot
        self.assertEqual(multi_slot, ['Test Overall (item level 130)'])

    def test_stat_mapping(self) -> None:
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

    def test_hq_bonus_only_when_can_be_hq(self) -> None:
        # NQ str 23 vit 23 ten 24 det 17; HQ bonus str 3 vit 3 ten 3 det 2 plus Defense / Magic Defense (ignored)
        self.assertEqual(self.row('Test Sallet HQ')[5], stats(str=26, vit=26, ten=27, det=19))
        self.assertEqual(self.row('Test Sallet NoHQ')[5], stats(str=23, vit=23, ten=24, det=17))
        # the HQ flag (last field) follows CanBeHq, so the page can mark rows whose stats are the HQ ones
        self.assertEqual(self.row('Test Sallet HQ')[7], 1)
        self.assertEqual(self.row('Test Sallet NoHQ')[7], 0)

    def test_minimum_item_level(self) -> None:
        self.assertEqual(gen_items.MIN_ILVL, 1)  # the lowest item level the game has (starter gear)
        self.assertEqual(self.row('Test Min Ilvl')[2], 1)
        self.assertNotIn('Test Below Min Ilvl', self.by_name)  # item level 0
        self.assertTrue(all(r[2] >= 1 for r in self.rows))

    def test_excluded_jobs(self) -> None:
        for name in ('Test No Category', 'Test Gladiator Only', 'Test Crafter Only', 'Test Unknown Category'):
            self.assertNotIn(name, self.by_name)

    def test_job_mask_bits(self) -> None:
        expect: dict[str, int] = {
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

    def test_unique_flag(self) -> None:
        self.assertEqual(self.row('Test Ring Unique')[6], 1)
        self.assertEqual(self.row('Test Ring Plain')[6], 0)
        self.assertEqual(self.row('Test Hood of Healing')[6], 1)
        self.assertEqual(self.row('Test Robe')[6], 0)

    def test_equip_level(self) -> None:
        self.assertEqual(self.row('Test Robe')[3], 50)

    def test_no_stats_excluded(self) -> None:
        for name in ('Test No Stats', 'Test Defense Only', 'Test No Stats Not HQ'):
            self.assertNotIn(name, self.by_name)

    def test_rarity(self) -> None:
        # field 12 is Item.Rarity as written in the fixture
        self.assertEqual(self.row('Test Robe')[12], 2)
        self.assertEqual(self.row('Test Hood of Healing')[12], 3)
        self.assertEqual(self.row('Test Sword')[12], 0)

    def test_game_id(self) -> None:
        # field 13 is the Item.csv row id, the id other tools use
        self.assertEqual(self.row('Test Robe')[13], 1005)

    def test_level_scaled(self) -> None:
        # field 14 is 1 for SubStatCategory 2 (item level follows the wearer's level), as on the real pre-order earrings
        self.assertEqual(self.row('Test Preorder Earring')[14], 1)
        self.assertEqual([r[0] for r in self.rows if r[14]], ['Test Preorder Earring'])

    def test_category(self) -> None:
        # field 15 is the gear category (gear_categories.py) as an index into item-format.json's category.list
        keys: list[str] = [c['key'] for c in load_format()['category']['list']]
        expect: dict[str, str] = {'Test Robe': 'raid', 'Test Greataxe': 'relic', 'Test Gloves': 'field_op', 'Test Tank Helm': 'dungeon'}
        for name, cat in expect.items():
            with self.subTest(name=name):
                category_index: int = self.row(name)[15]
                self.assertEqual(keys[category_index], cat)

    def test_category_list_must_match(self) -> None:
        # a category with no label, a key gear_categories.py doesn't know, or a key listed twice stops the generator
        fmt: ItemFormat = load_format()
        _ = gen_items.category_index(fmt)
        cases: dict[str, list[CategoryEntry]] = {
            'missing': [c for c in fmt['category']['list'] if c['key'] != 'dungeon'],
            'unknown': [*fmt['category']['list'], {'key': 'raid_finder', 'label': 'Raid finder'}],
            'twice': [*fmt['category']['list'], {'key': 'raid', 'label': 'Raid'}],
        }
        for word, lst in cases.items():
            with self.subTest(word=word), self.assertRaises(SchemaError) as e:
                _ = gen_items.category_index({**fmt, 'category': {**fmt['category'], 'list': lst}})
            self.assertIn(word, str(e.exception))

    def test_crafter_gatherer_gear_excluded(self) -> None:
        # All Classes pieces with a combat stat (Vitality) are still left out when they carry a crafter or gatherer
        # stat, normal (Gathering) or HQ only (CP)
        for name in ('Test Gatherer Hat', 'Test Crafter HQ Ring'):
            self.assertNotIn(name, self.by_name)

    def test_empty_name_excluded(self) -> None:
        self.assertNotIn('', self.by_name)

    def test_sort_order(self) -> None:
        expect: list[str] = [
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


class ItemSortTiesTest(unittest.TestCase):
    """Two pieces that tie on item level, slot code and name come out in game id order, whatever order Item.csv lists them."""

    def pieces_after_copying_the_first_piece(self, copy_id: int, put_copy_first: bool) -> list[int]:
        """The rows of the items.json made from a copy of the fixtures where Test Greataxe (id 1001) also appears as `copy_id`
        with one more point of Strength, listed before the original or after it."""
        with tempfile.TemporaryDirectory() as tmp:
            _ = shutil.copytree(FIXTURES, tmp, dirs_exist_ok=True)

            def add_copy(rows: list[list[str]]) -> None:
                header = rows[0]
                at: int = next(i for i, row in enumerate(rows) if row[0] == '1001')
                copy = list(rows[at])
                copy[0] = str(copy_id)
                copy[header.index('BaseParamValue[0]')] = str(int(copy[header.index('BaseParamValue[0]')]) + 1)
                rows.insert(at if put_copy_first else at + 1, copy)

            edit_csv(Path(tmp) / 'Item.csv', add_copy)
            out: Path = Path(tmp) / 'items.json'
            run_quiet(gen_items.main, tmp, str(out))
            fields: dict[str, int] = row_fields(load_format())
            rows = [r for r in json.loads(out.read_text(encoding='utf-8'))['items'] if r[fields['name']] == 'Test Greataxe']
            return [r[fields['gameId']] for r in rows]

    def test_a_tie_is_ordered_by_game_id_not_by_file_order(self) -> None:
        for copy_id, put_copy_first in ((1, False), (1, True), (9999, False), (9999, True)):
            with self.subTest(copy_id=copy_id, put_copy_first=put_copy_first):
                self.assertEqual(self.pieces_after_copying_the_first_piece(copy_id, put_copy_first), sorted([1001, copy_id]))
