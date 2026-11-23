"""Tests for scripts/data/gear_categories.py (and the activities in gear_activities.py): the routes for the Gear categories filter and the
gear category of each piece.

Fixtures in tests/data/fixtures/ (described in common.py) hold the codes; each test copies them and adds a raid-book
shop set.

Run: npm run test:py (npm run check:all runs them too)
"""

import shutil
import tempfile
import unittest
from pathlib import Path

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gear_activities
import gear_categories
import gen_items
from common import (
    FIXTURES,
    add_shop,
    edit_csv,
)
from item_format import SchemaError, load_format


class GearCategoriesTest(unittest.TestCase):
    """gear_categories.py on a copy of the fixtures plus a raid-book shop set. The fixture Item.csv carries the codes
    (SubcategorySort; the role prefix in front of the last three digits is ignored) and dye slots:
    Test Greataxe 8010 (relic weapon), Test Sword 2060 (bought with a totem -> ultimate), Test Shield 2060 (trial),
    Test Hood of Healing 47020 with a dye slot (Savage seed), Test Robe 47020 (raid, bought with a Normal token),
    Test Gloves 8010 (not a weapon -> field_op), Test Earring 49020 (no dye, bought with the Savage book -> savage),
    Test Sallet HQ 8320 (a recipe result -> crafted); every other piece 8270 (dungeon). Hood and Earring are also sold
    for the Savage book, which has no way in and buys Savage gear: their routes for the Gear categories filter include Savage."""

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
        kept = gen_items.select(self.dir).kept
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
        out, _ = gear_activities.routes(self.dir, kept, ids)
        return {r['Name']: sorted('+'.join(k for i, k in enumerate(keys) if m >> i & 1) for m in out[r['#']]) for r, _ in kept}

    def test_inferred_routes_are_counted(self):
        """Pieces and currencies placed by a fallback rule are counted by activity for the report printed on every
        run: the Savage book has no way in and buys Savage gear, so it counts as a Savage currency."""
        _, kept, ids = self.categories()
        kept = [(r, row) for r, row in kept if ids[r['#']] not in gear_categories.LEFT_OUT]
        _, inferred = gear_activities.routes(self.dir, kept, ids)
        self.assertEqual(inferred['currencies']['Savage'], 1)
        self.assertEqual(inferred['pieces'], {'Dungeon': 2})
        report = gear_activities.inferred_report(inferred)
        self.assertTrue(report.startswith('Routes inferred: 2 pieces with no way in the game files (Dungeon 2); 4 currencies'), report)

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
