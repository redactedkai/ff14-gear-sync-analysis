/* Stories of <gsa-slot-menu>: the keyboard model of a menu button with radio items (the WAI-ARIA menu button pattern), the
   focus rules (back on the button after a pick or Escape, on to the next control after Tab) and axe. */
import { test, expect } from '../fixtures.ts';
import { CHOICES, type BesideAppMenu, type Default } from './slot-menu.story.js';
import { ANY_SLOT_KEY, ANY_SLOT_LABEL, slotButtonName } from '../../../src/ui/elements/gear-browser/slot-menu-names.ts';

const STORY = 'gear-browser/slot-menu/Default';

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
    await expect(menu.getByRole('menuitemradio', { name: /^Any slot/ })).toHaveAttribute('data-highlighted', '');
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
    await page.keyboard.press('ArrowDown'); // Weapon
    await expect(menu.getByRole('menuitemradio', { name: /^Weapon/ })).toHaveAttribute('data-highlighted', '');
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
    await expect(menu.getByRole('menuitemradio', { name: /^Any slot/ })).toHaveAttribute('aria-checked', 'false');
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
    await expect(component.getByRole('textbox', { name: 'Search gear by name' })).toBeFocused();
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

  test('the open menu keeps its place above the page while the pointer lights the rows', async ({ mount, page }) => {
    // a sticky table header stands for the page's own: it has a z-index of 1, and the menu's layer must stay above it
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const menu = page.locator('#b-slots');
    await expect(menu).toBeVisible();
    const layerZIndex = () => menu.evaluate(element => getComputedStyle(element.parentElement as Element).zIndex);
    expect(Number(await layerZIndex())).toBeGreaterThan(1);
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
      expect(await styleOf(/^Weapon/), 'plain row').toBe('none');
    } finally {
      await page.emulateMedia({ forcedColors: 'none' });
    }
  });

  test('a drag over the rows selects no text', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    const rows = page.locator('#b-slots').getByRole('menuitemradio');
    const from = await rows.first().boundingBox();
    const to = await rows.last().boundingBox();
    if (!from || !to) throw new Error('the rows have no box');
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
    await component.getByRole('textbox', { name: 'Search gear by name' }).press('a');
    await button.click();
    await page.locator('#b-slots').getByRole('menuitemradio', { name: /^Head/ }).click();
    await expect(button).toBeFocused();
    expect(await outlineStyle(), 'the pick was a mouse click').toBe('none');

    await page.keyboard.press('Enter');
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(button).toBeFocused();
    expect(await outlineStyle(), 'the pick was by key').not.toBe('none');
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
    await page.evaluate(() => (document.querySelector('input') as HTMLInputElement).focus());
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByRole('textbox', { name: 'Search gear by name' })).toBeFocused();
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
    await expect(component.getByRole('button', { name: 'App menu' })).toHaveAttribute('aria-expanded', 'true');

    // the other way: the Slot menu opened over the open page menu closes it, and one Escape closes the one on top
    await button.click();
    await expect(page.locator('#b-slots')).toBeVisible();
    await expect(component.getByRole('button', { name: 'App menu' })).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('#b-slots')).toBeHidden();
  });

  test('taking the element off the page while its menu is open lets go of its layer in the page manager', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).click();
    await expect(page.locator('#b-slots')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { gsaOpenLayerIds(): string[] }).gsaOpenLayerIds())).toHaveLength(1);
    await page.evaluate(() => document.querySelector('gsa-slot-menu')?.remove());
    expect(await page.evaluate(() => (globalThis as unknown as { gsaOpenLayerIds(): string[] }).gsaOpenLayerIds())).toEqual([]);
  });

  test('every row of a long list can be brought into view in a short window', async ({ mount, page }) => {
    await page.setViewportSize({ width: 960, height: 300 });
    const choices = Array.from({ length: 14 }, (_, index) => ({ key: `s${index}`, label: `Slot ${index}`, count: 3, countText: '3' }));
    const component = await mount<typeof Default>(STORY, { choices });
    await component.getByRole('button', { name: slotButtonName('Slot 0') }).click();
    const rows = page.locator('#b-slots').getByRole('menuitemradio');
    for (let index = 0; index < choices.length; index++) {
      await rows.nth(index).scrollIntoViewIfNeeded();
      const box = await rows.nth(index).evaluate(row => row.getBoundingClientRect());
      expect(box.top, `row ${index} is below the top of the window once scrolled to`).toBeGreaterThanOrEqual(0);
      expect(box.bottom, `row ${index} is above the bottom`).toBeLessThanOrEqual(300 + 1);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test.describe('<gsa-slot-menu> with touch', () => {
  test.use({ hasTouch: true });

  test('a tap on the button opens the menu and a tap on a slot picks it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await component.getByRole('button', { name: slotButtonName(ANY_SLOT_LABEL) }).tap();
    await expect(page.locator('#b-slots')).toBeVisible();
    await page.locator('#b-slots').getByRole('menuitemradio', { name: /^Head/ }).tap();
    await expect(page.locator('#b-slots')).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["head"]');
  });
});
