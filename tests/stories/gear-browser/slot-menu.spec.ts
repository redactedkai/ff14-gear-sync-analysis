/* Stories of <gsa-slot-menu>: the keyboard model of a menu button with radio items (the WAI-ARIA menu button pattern), the
   focus rules (back on the button after a pick or Escape, on to the next control after Tab), the list's place in short windows
   and axe. The touch story does not run in Firefox: Playwright's Firefox fails to close a touch context under parallel workers. */
import { test, expect } from '../fixtures.ts';
import type { Locator, Page } from 'playwright/test';
import {
  APP_MENU_LABEL,
  CHOICES,
  SEARCH_LABEL,
  WEAPON_LABEL,
  type BesideAppMenu,
  type Default,
  type LowOnPage,
} from './slot-menu.story.ts';
import { layerArmed, layerPlaced } from '../layers.ts';
import { ANY_SLOT_KEY, ANY_SLOT_LABEL, slotButtonName } from '../../../src/ui/elements/gear-browser/slot-menu-names.ts';

const STORY = 'gear-browser/slot-menu/Default';

/* A pattern for a row or a button whose name starts with `label` (the counts follow the name in a row). */
function startsWith(label: string): RegExp {
  return new RegExp(`^${label}`);
}

test.describe('<gsa-slot-menu>', () => {
  test('ArrowDown opens the menu with the first slot lit, and the button says it is expanded', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const menu = page.locator('#b-slots');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();

    // WebKit does not focus a button on click: focus it explicitly before using the keyboard
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitemradio', { name: startsWith(ANY_SLOT_LABEL) })).toHaveAttribute('data-highlighted', '');
  });

  test('the arrows and End move through the slots and skip a slot with no match; Enter picks and gives the focus back to the button', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const menu = page.locator('#b-slots');
    await button.focus();
    await page.keyboard.press('ArrowDown'); // Any slot
    await expect(menu).toBeFocused(); // Zag moves the focus into the list a frame after it opens
    await page.keyboard.press('ArrowDown'); // Weapon
    await expect(menu.getByRole('menuitemradio', { name: startsWith(WEAPON_LABEL) })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown'); // Off-hand has no match: Head
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown'); // Ring, the last
    await expect(menu.getByRole('menuitemradio', { name: /^Ring/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowUp'); // back over the same slots
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitemradio', { name: /^Ring/ })).toHaveAttribute('data-highlighted', '');

    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["ring"]');
  });

  test('a slot with no match cannot be picked, unless it is the chosen one', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('#b-slots');
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const empty = menu.getByRole('menuitemradio', { name: /^Off-hand/ });
    await layerPlaced(menu);
    await expect(empty).toHaveAttribute('aria-disabled', 'true');
    await empty.click({ force: true });
    await expect(menu, 'a click on a slot with no match leaves the menu open').toBeVisible();
    await expect(component.getByTestId('events')).toHaveText('');

    // the chosen slot stays pickable and is marked, even when it has no match any more
    await component.update({ value: 'offhand' });
    await expect(component.getByRole('button', { name: slotButtonName('Off-hand') })).toBeVisible();
    await expect(empty).not.toHaveAttribute('aria-disabled', 'true');
    await expect(empty).toHaveAttribute('aria-checked', 'true');
  });

  test('a click on a slot picks it; the page sets the value back and the button names it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('#b-slots');
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    await button.click();
    await menu.getByRole('menuitemradio', { name: /^Head/ }).click();
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["head"]');

    await component.update({ value: 'head' });
    await expect(component.getByRole('button', { name: slotButtonName('Head') })).toHaveText('Head');
    await component.getByRole('button', { name: slotButtonName('Head') }).click();
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: startsWith(ANY_SLOT_LABEL) })).toHaveAttribute('aria-checked', 'false');
  });

  test('Escape closes the menu with the focus back on the button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    await button.click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('');
  });

  test('Tab closes the menu and the focus moves on to the next control', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    // Zag moves the focus into the list a frame after it opens; a Tab before that would start from the button
    await expect(page.locator('#b-slots')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(component.getByRole('textbox', { name: SEARCH_LABEL })).toBeFocused();
  });

  test('a press outside closes the menu', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await component.getByRole('button', { name: 'Before' }).click();
    await expect(page.locator('#b-slots')).toBeHidden();
  });

  test('the open menu is as wide as its button, and the button keeps its width when the choice changes', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const width = (element: Element) => element.getBoundingClientRect().width;
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const closedWidth = await button.evaluate(width);
    await button.click();
    expect(await page.locator('#b-slots').evaluate(width)).toBeCloseTo(closedWidth, 0);
    await page.keyboard.press('Escape');

    await component.update({ value: 'ring' });
    expect(await component.getByRole('button', { name: slotButtonName('Ring') }).evaluate(width)).toBeCloseTo(closedWidth, 0);
  });

  /* The Slot button and its open menu, in px: the widths, where the menu starts against the button, whether a row is clipped, and
     where the menu ends. */
  async function fitOf(page: Page) {
    return page.evaluate(() => {
      const button = document.querySelector('gsa-slot-menu .slot-btn') as HTMLElement;
      const menu = document.querySelector('#b-slots') as HTMLElement;
      const buttonBox = button.getBoundingClientRect();
      const menuBox = menu.getBoundingClientRect();
      return {
        buttonWidth: buttonBox.width,
        menuWidth: menuBox.width,
        menuLeft: menuBox.left - buttonBox.left,
        menuRight: menuBox.right,
        rowsClipped: [...menu.querySelectorAll('.multi-opt')].some(row => row.scrollWidth > row.clientWidth),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  }

  for (const { width, height } of [
    { width: 960, height: 900 },
    { width: 1280, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`at ${width} px the open menu is as wide and as far left as its button, whichever slot is chosen and also when every count is 88,888`, async ({
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height });
      try {
        const widest = CHOICES.map(choice => ({ ...choice, count: 88888, countText: '88,888' }));
        const seen = [];
        // the chosen row is bold, which is wider than the other rows' weight: each slot is chosen in turn
        for (const choices of [CHOICES, widest]) {
          for (const chosen of choices) {
            const where = `${chosen.label} chosen, counts of ${choices[0].countText}`;
            const component = await mount<typeof Default>(STORY, { choices, value: chosen.key });
            await component.getByRole('button', { name: slotButtonName(chosen.label) }).click();
            await expect(page.locator('#b-slots')).toBeVisible();
            const fit = await fitOf(page);
            expect(fit.menuWidth, `the open menu is as wide as its button (${where})`).toBeCloseTo(fit.buttonWidth, 0);
            expect(Math.abs(fit.menuLeft), `the open menu starts where its button starts (${where})`).toBeLessThan(1);
            expect(fit.rowsClipped, `no row is clipped (${where})`).toBe(false);
            expect(fit.menuRight, `the menu ends inside the window (${where})`).toBeLessThanOrEqual(width);
            expect(fit.sideways, `the page does not scroll sideways (${where})`).toBe(false);
            seen.push(fit);
            await page.keyboard.press('Escape');
          }
        }
        // neither the widest counts nor the choice change the button or the menu: the button is sized for them from the start
        for (const fit of seen) {
          expect(fit.buttonWidth).toBeCloseTo(seen[0].buttonWidth, 0);
          expect(fit.menuWidth).toBeCloseTo(seen[0].menuWidth, 0);
        }
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });
  }

  test('the bar has the one border: 1 px on the bar, none on the Slot button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const borderOf = (locator: Locator) => locator.evaluate(element => getComputedStyle(element).borderTopWidth);
    expect(await borderOf(page.locator('.searchbar'))).toBe('1px');
    expect(await borderOf(component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }))).toBe('0px');
  });

  test('the open menu keeps its place above the page while the pointer lights the rows', async ({ mount, page }) => {
    // a sticky table header stands for the page's own: it has a z-index of 1, and the menu's layer must stay above it
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const menu = page.locator('#b-slots');
    await expect(menu).toBeVisible();
    const layerZIndex = () => menu.evaluate(element => getComputedStyle(element.parentElement as Element).zIndex);
    await expect.poll(async () => Number(await layerZIndex()), { message: 'the layer is placed above the page' }).toBeGreaterThan(1);
    await menu.getByRole('menuitemradio', { name: /^Head/ }).hover();
    await expect(menu.getByRole('menuitemradio', { name: /^Head/ })).toHaveAttribute('data-highlighted', '');
    await menu.getByRole('menuitemradio', { name: /^Ring/ }).hover();
    await expect(menu.getByRole('menuitemradio', { name: /^Ring/ })).toHaveAttribute('data-highlighted', '');
    expect(Number(await layerZIndex()), 'drawing the menu again took away its layer z-index').toBeGreaterThan(1);
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    const component = await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    expect(await axe()).toEqual([]);
  });

  test('opens and closes with Escape ten times in a row, each time with the focus back on the button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    for (let round = 0; round < 10; round++) {
      await button.click();
      await expect(page.locator('#b-slots')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#b-slots')).toBeHidden();
      await expect(button).toBeFocused();
    }
  });

  test('the count column shows the pieces with thousands separators, as the page gives them', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const biggest = CHOICES.reduce((most, choice) => (choice.count > most.count ? choice : most));
    expect(biggest.count, 'the story needs a count over 999').toBeGreaterThan(999);
    const row = page.locator('#b-slots').getByRole('menuitemradio', { name: new RegExp(`^${biggest.label}`) });
    await expect(row.locator('.n')).toHaveText(biggest.count.toLocaleString('en-US'));
  });

  test('every slot of the menu, off-hand and weapon included, reports its own key when picked', async ({ mount, page }) => {
    const everySlot = CHOICES.map(choice => ({ ...choice, count: 5, countText: '5' }));
    const component = await mount<typeof Default>(STORY, { choices: everySlot });
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const picked: string[] = [];
    for (const choice of everySlot.filter(each => each.key !== ANY_SLOT_KEY)) {
      await button.click();
      await page
        .locator('#b-slots')
        .getByRole('menuitemradio', { name: new RegExp(`^${choice.label}`) })
        .click();
      picked.push(choice.key);
      await expect(component.getByTestId('events')).toHaveText(JSON.stringify(picked));
    }
    expect(picked).toEqual(['weapon', 'offhand', 'head', 'ring']);
  });

  test('the row lit by the arrow keys has a focus ring that the chosen row does not have', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY, { value: 'head' });
    await component.getByRole('button', { name: slotButtonName('Head') }).focus();
    await page.keyboard.press('ArrowDown');
    const rows = page.locator('#b-slots').getByRole('menuitemradio');
    const outlineOf = (name: RegExp) =>
      rows
        .filter({ hasText: name })
        .evaluate(row => ({ style: getComputedStyle(row).outlineStyle, width: parseFloat(getComputedStyle(row).outlineWidth) }));
    // the first key press lights the chosen row; the next moves the light to Ring
    await page.keyboard.press('ArrowDown');
    await expect(rows.filter({ hasText: /^Ring/ })).toHaveAttribute('data-highlighted', '');
    const lit = await outlineOf(/^Ring/);
    expect(lit.style, 'the row lit by the keys has an outline').not.toBe('none');
    expect(lit.width).toBeGreaterThanOrEqual(2);
    expect((await outlineOf(/^Head/)).style, 'the chosen row, not lit, has none').toBe('none');
  });

  test('in forced colours the lit row and the chosen row each have an outline, and a plain row has none', async ({
    mount,
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'WebKit does not force colours');
    await page.emulateMedia({ forcedColors: 'active' });
    try {
      const component = await mount<typeof Default>(STORY, { value: 'head' });
      await component.getByRole('button', { name: slotButtonName('Head') }).focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const rows = page.locator('#b-slots').getByRole('menuitemradio');
      await expect(rows.filter({ hasText: /^Ring/ })).toHaveAttribute('data-highlighted', '');
      const styleOf = (name: RegExp) => rows.filter({ hasText: name }).evaluate(row => getComputedStyle(row).outlineStyle);
      expect(await styleOf(/^Ring/), 'lit row').not.toBe('none');
      expect(await styleOf(/^Head/), 'chosen row').not.toBe('none');
      expect(await styleOf(startsWith(WEAPON_LABEL)), 'plain row').toBe('none');
    } finally {
      await page.emulateMedia({ forcedColors: 'none' });
    }
  });

  test('a drag over the rows selects no text', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const rows = page.locator('#b-slots').getByRole('menuitemradio');
    await layerPlaced(page.locator('#b-slots'));
    const from = await rows.first().boundingBox();
    const to = await rows.last().boundingBox();
    if (!from || !to) {
      throw new Error('the rows have no box');
    }
    await page.mouse.move(from.x + 4, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 4, to.y + to.height / 2, { steps: 6 });
    expect(await page.evaluate(() => String(getSelection()))).toBe('');
    await page.mouse.up();
    await page.keyboard.press('Escape');
  });

  test('after a pick with the mouse the button shows no focus ring, even after a key was pressed; after a pick by key it does', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const outlineStyle = () => button.evaluate(element => getComputedStyle(element).outlineStyle);

    // a key pressed earlier makes the browser treat the next scripted focus as a keyboard one
    await component.getByRole('textbox', { name: SEARCH_LABEL }).press('a');
    await button.click();
    await page.locator('#b-slots').getByRole('menuitemradio', { name: /^Head/ }).click();
    await expect(button).toBeFocused();
    expect(await outlineStyle(), 'the pick was a mouse click').toBe('none');

    await page.keyboard.press('Enter');
    // Zag moves the focus into the list a frame after it opens: keys pressed before that would go to the button
    await expect(page.locator('#b-slots')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#b-slots').locator('[data-highlighted]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(button).toBeFocused();
    await expect.poll(outlineStyle, { message: 'the pick was by key' }).not.toBe('none');
  });

  test('opening by key lights the chosen slot, and ArrowUp lights the last', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY, { value: 'head' });
    const button = component.getByRole('button', { name: slotButtonName('Head') });
    const rows = page.locator('#b-slots').getByRole('menuitemradio');
    for (const key of ['Enter', 'Space', 'ArrowDown']) {
      await button.focus();
      await page.keyboard.press(key);
      await expect(rows.filter({ hasText: /^Head/ }), key).toHaveAttribute('data-highlighted', '');
      await page.keyboard.press('Escape');
      await expect(page.locator('#b-slots')).toBeHidden();
    }
    await button.focus();
    await page.keyboard.press('ArrowUp');
    await expect(rows.filter({ hasText: /^Ring/ })).toHaveAttribute('data-highlighted', '');
  });

  test('Shift+Tab from the open list moves to the control before the button', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#b-slots')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByRole('button', { name: 'Before' })).toBeFocused();
  });

  test('a script that moves the focus to another control while the menu is open closes it and leaves the focus there', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#b-slots')).toBeFocused();
    await layerArmed(page); // Zag watches for the focus leaving the menu a frame after the opening
    await page.evaluate(() => (document.querySelector('input') as HTMLInputElement).focus());
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByRole('textbox', { name: SEARCH_LABEL })).toBeFocused();
  });

  test('opening a page menu closes the Slot menu, opening the Slot menu closes the page menu, and one Escape closes one layer', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof BesideAppMenu>('gear-browser/slot-menu/BesideAppMenu');
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#b-slots')).toBeFocused();
    // a click with no pointer or focus move, as an assistive technology makes it
    await page.evaluate(() => (document.querySelector('app-menu-stub button') as HTMLElement).click());
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByRole('button', { name: APP_MENU_LABEL })).toHaveAttribute('aria-expanded', 'true');

    // the other way: the Slot menu opened over the open page menu closes it, and one Escape closes the one on top
    await button.click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await expect(component.getByRole('button', { name: APP_MENU_LABEL })).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('#b-slots')).toBeHidden();
  });

  test('taking the element off the page while its menu is open lets go of its layer in the page manager', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    expect(await page.evaluate(() => globalThis.gsaOpenLayerIds())).toHaveLength(1);
    await page.evaluate(() => document.querySelector('gsa-slot-menu')?.remove());
    expect(await page.evaluate(() => globalThis.gsaOpenLayerIds())).toEqual([]);
  });

  test('the focus ring shows when the keyboard reaches the button after the pointer was over or inside the widget', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
    const search = component.getByRole('textbox', { name: SEARCH_LABEL });
    const ringShows = () => button.evaluate(element => getComputedStyle(element).outlineStyle !== 'none');

    // the pointer rests over the button while the keyboard comes back from the search box
    await search.click();
    await button.hover();
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    expect(await ringShows(), 'Shift+Tab from the search box with the pointer over the button').toBe(true);

    // a mouse pick, then a click elsewhere, then the keyboard back to the button
    await button.click();
    await page.locator('#b-slots').getByRole('menuitemradio', { name: /^Head/ }).click();
    await search.click();
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    expect(await ringShows(), 'Shift+Tab after a mouse pick').toBe(true);

    // the pointer moving over the button does not take the ring away from a focus that came by key
    await page.mouse.move(0, 0);
    await button.hover();
    expect(await ringShows(), 'a pointer move over a button focused by key').toBe(true);
  });

  /* The window sizes the page is used in, from a short laptop window to a big monitor. The button is about 300 px from the top
     and the list is about 400 px tall, so the list fits below the button only from about 720 px of height up. */
  const WINDOWS = [
    { width: 1366, height: 650 },
    { width: 1280, height: 500 },
    { width: 960, height: 420 },
    { width: 960, height: 700 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ];

  /* What is wrong with how the open list and the row named `name` stand in the window, as a list of sentences (empty when the
     player can see the row): the row must lie inside the window and inside the part of the list that shows, the list inside
     the window, and the page must not scroll sideways. Polled by the callers: the list's own scroll and placement settle. */
  async function whatIsWrong(page: Page, name: RegExp): Promise<string[]> {
    const box = await page.evaluate(source => {
      const list = document.querySelector('#b-slots') as HTMLElement;
      const row = [...list.querySelectorAll('[role="menuitemradio"]')].find(each => new RegExp(source).test(each.textContent ?? ''));
      const listBox = list.getBoundingClientRect();
      const rowBox = (row as Element).getBoundingClientRect();
      return {
        windowHeight: innerHeight,
        listTop: listBox.top,
        listBottom: listBox.bottom,
        rowTop: rowBox.top,
        rowBottom: rowBox.bottom,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }, name.source);
    const slack = 0.5;
    const wrong: string[] = [];
    if (box.listTop < -slack) {
      wrong.push('the list starts above the window top');
    }
    if (box.listBottom > box.windowHeight + slack) {
      wrong.push('the list ends below the window bottom');
    }
    if (box.rowTop < -slack || box.rowBottom > box.windowHeight + slack) {
      wrong.push('the row is outside the window');
    }
    if (box.rowTop < box.listTop - slack || box.rowBottom > box.listBottom + slack) {
      wrong.push('the row is outside the list');
    }
    if (box.sideways) {
      wrong.push('the page scrolls sideways');
    }
    return wrong;
  }

  /* Turns the wheel over the list, a notch at a time, until the list's own scroll has reached its end or its start (it stops
     there, so the page is not scrolled by wheel turns the list could not use). */
  async function wheelListTo(page: Page, where: 'start' | 'end') {
    const atTarget = () =>
      page
        .locator('#b-slots')
        .evaluate(
          (list, target) => (target === 'end' ? list.scrollTop + list.clientHeight >= list.scrollHeight - 1 : list.scrollTop <= 0),
          where,
        );
    for (let notch = 0; notch < 40 && !(await atTarget()); notch++) {
      await page.mouse.wheel(0, where === 'end' ? 100 : -100);
      // two frames: the scroll of the notch has been applied
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    }
    expect(await atTarget(), `the wheel brought the list to its ${where}`).toBe(true);
  }

  for (const { width, height } of WINDOWS) {
    test(`at ${width} x ${height} the keys light rows the player can see: End, Home, type-ahead, ArrowUp from closed`, async ({
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height });
      try {
        const component = await mount<typeof LowOnPage>('gear-browser/slot-menu/LowOnPage');
        const button = component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) });
        const rows = page.locator('#b-slots').getByRole('menuitemradio');
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#b-slots')).toBeFocused();

        await page.keyboard.press('End');
        await expect(rows.filter({ hasText: /^Ring/ })).toHaveAttribute('data-highlighted', '');
        await expect.poll(() => whatIsWrong(page, /^Ring/), { message: 'End' }).toEqual([]);
        // the list opens on the roomier side of the button and keeps a few rows in sight, even in the shortest window
        const listAndRowHeights = await page.locator('#b-slots').evaluate(list => ({
          list: list.getBoundingClientRect().height,
          row: (list.querySelector('[role="menuitemradio"]') as Element).getBoundingClientRect().height,
        }));
        expect(listAndRowHeights.list, 'the list shows at least five rows').toBeGreaterThanOrEqual(5 * listAndRowHeights.row);

        await page.keyboard.press('Home');
        await expect(rows.filter({ hasText: startsWith(ANY_SLOT_LABEL) })).toHaveAttribute('data-highlighted', '');
        await expect.poll(() => whatIsWrong(page, startsWith(ANY_SLOT_LABEL)), { message: 'Home' }).toEqual([]);

        await page.keyboard.type('ea');
        await expect(rows.filter({ hasText: /^Earrings/ })).toHaveAttribute('data-highlighted', '');
        await expect.poll(() => whatIsWrong(page, /^Earrings/), { message: 'type-ahead' }).toEqual([]);

        // closed again, ArrowUp opens with the last row lit
        await page.keyboard.press('Escape');
        await expect(page.locator('#b-slots')).toBeHidden();
        await page.keyboard.press('ArrowUp');
        await expect(rows.filter({ hasText: /^Ring/ })).toHaveAttribute('data-highlighted', '');
        await expect.poll(() => whatIsWrong(page, /^Ring/), { message: 'ArrowUp from closed' }).toEqual([]);
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });

    test(`at ${width} x ${height} the wheel over the list reaches the last row and then the first`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height });
      try {
        const component = await mount<typeof LowOnPage>('gear-browser/slot-menu/LowOnPage');
        await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
        await expect(page.locator('#b-slots')).toBeVisible();
        await layerPlaced(page.locator('#b-slots'));
        const centre = await page.locator('#b-slots').evaluate(list => {
          const box = list.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2 };
        });
        await page.mouse.move(centre.x, centre.y);
        // a list that fits has nothing to scroll (the wheel then moves the page, as over any other part of it): the rows are all in view
        const scrollsInside = await page.locator('#b-slots').evaluate(list => list.scrollHeight > list.clientHeight);
        if (scrollsInside) {
          await wheelListTo(page, 'end');
        }
        await expect.poll(() => whatIsWrong(page, /^Ring/), { message: 'wheel down' }).toEqual([]);
        if (scrollsInside) {
          await wheelListTo(page, 'start');
        }
        await expect.poll(() => whatIsWrong(page, startsWith(ANY_SLOT_LABEL)), { message: 'wheel up' }).toEqual([]);
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });
  }
});

test.describe('<gsa-slot-menu> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run: the harness's own
  // `Browser.removeBrowserContext` fails, not an assertion. The tap fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the button opens the menu and a tap on a slot picks it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).tap();
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.locator('#b-slots').getByRole('menuitemradio', { name: /^Head/ }).tap();
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["head"]');
  });
});
