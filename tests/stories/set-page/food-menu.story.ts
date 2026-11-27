/* Stories of <gsa-food-menu>: the set page's Food menu with a hand-made list of meals, standing in for the page (which builds the
   menu only while it is open: the story gives it on `food-open`). A button sits before and after it (where Tab goes). Every meal
   picked is appended to the `events` output (its key, or null for No food). */
import { html } from 'lit';
import { GsaFoodMenu } from '../../../src/ui/elements/set-page/food-menu.ts';
import type { MealMenuData } from '../../../src/ui/elements/set-page/food-menu-model.ts';
import type { StatKey } from '../../../src/core/types.ts';
import { recordEvents } from '../gallery/record.ts';

/* The words the specs look for. */
export const BUTTON_ID = 'sh-meal-btn';
export const MENU_ID = 'sh-meal-menu';

/* A meal of the hand-made menu: its stat keys in order, each with the points it adds, and the line the list draws of them. */
type MealItem = MealMenuData['groups'][number]['items'][number];
const meal = (key: string, name: string, ilvl: number, adds: [StatKey, number][], on = false): MealItem => ({
  key,
  name,
  ilvl,
  label: name,
  ilvlText: `i${ilvl}`,
  stats: adds.map(([stat]) => stat),
  adds: adds.map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  on,
  onClass: on ? 'on' : '',
  best: false,
});

/* Critical Hit + Spell Speed, Critical Hit + Determination and Critical Hit + Direct Hit in Dawntrail; Determination + Critical Hit
   in Endwalker, the one the set holds. */
export const MENU: MealMenuData = {
  groups: [
    {
      label: 'Dawntrail',
      items: [
        meal('potage', 'Popoto Potage', 770, [
          ['crit', 133],
          ['sps', 36],
        ]),
        meal('popcorn', 'Caramel Popcorn', 760, [
          ['det', 125],
          ['crit', 91],
        ]),
        meal('gratin', 'Rroneek au Gratin', 750, [
          ['crit', 91],
          ['dh', 36],
        ]),
      ],
    },
    {
      label: 'Endwalker',
      items: [
        meal(
          'eggplant',
          'Baked Eggplant',
          640,
          [
            ['det', 103],
            ['crit', 62],
          ],
          true,
        ),
      ],
    },
  ],
  pills: (['crit', 'det', 'dh', 'sps'] as const).map(stat => ({ stat, short: stat.toUpperCase(), label: stat })),
  hasBest: false,
  hasMeal: true,
};

/* The menu as the page gives it: the button names the meal the set holds. The story hands over `MENU` when the menu opens, and
   takes it back when it closes. */
export const Default = () => html`
  <button type="button">Before</button>
  <div style="padding: 8px">
    <gsa-food-menu
      class="same"
      .label=${'Baked Eggplant'}
      .empty=${false}
      @food-open=${(event: CustomEvent<boolean>) => {
        if (event.target instanceof GsaFoodMenu) {
          event.target.menu = event.detail ? MENU : null;
        }
      }}
      @meal-pick=${recordEvents('events')}
    ></gsa-food-menu>
  </div>
  <button type="button">After</button>
  <output data-testid="events" hidden></output>
`;
