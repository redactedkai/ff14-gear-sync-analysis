/* Stories of the Zag controller and the overlay bridge, with the test elements of layer-elements.ts: a Zag popover next to,
   inside and around a layer opened by the page's own overlay manager. The rule they guard: one Escape closes one layer. */
import { test, expect } from '../fixtures.ts';
import { APP_MENU_LABEL } from './layer-elements.story.ts';
import type { Alone, BesideAppMenu, HoldingAppMenu, InsideAppMenu } from './layer-elements.story.ts';

const STORY = (name: string) => `shared/layer-elements/${name}`;

test.describe('Zag popover through the controller', () => {
  test('opens from the trigger, names its parts with zg- ids, and Escape closes it with the focus back on the trigger', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Alone>(STORY('Alone'));
    const trigger = component.getByRole('button', { name: 'Popover', exact: true });
    const content = component.getByText('Popover content');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toBeHidden();

    await trigger.click();
    await expect(content).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // the machine's ids (`<kind>:<machine id>:<part>`) carry the prefix that keeps them away from the page's own ids
    expect(await trigger.getAttribute('aria-controls')).toMatch(/^popover:zg-popover-\d+:content$/);
    expect(await page.locator('zag-test-popover').getAttribute('data-zag-host')).toMatch(/^zg-popover-\d+$/);

    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  });

  test('the keyboard opens it, and a press outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Alone>(STORY('Alone'));
    const trigger = component.getByRole('button', { name: 'Popover', exact: true });
    const content = component.getByText('Popover content');
    // WebKit does not focus a button on click: focus it explicitly before using the keyboard
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(content).toBeVisible();
    await component.getByRole('button', { name: 'Outside' }).click();
    await expect(content).toBeHidden();
  });

  test('open and Escape ten times in a row always returns the focus to the trigger', async ({ mount, page }) => {
    const component = await mount<typeof Alone>(STORY('Alone'));
    const trigger = component.getByRole('button', { name: 'Popover', exact: true });
    const content = component.getByText('Popover content');
    for (let round = 0; round < 10; round++) {
      await trigger.click();
      await expect(content).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(content).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test('has no axe violations, closed and open', async ({ mount, axe }) => {
    const component = await mount<typeof Alone>(STORY('Alone'));
    expect(await axe()).toEqual([]);
    await component.getByRole('button', { name: 'Popover', exact: true }).click();
    await expect(component.getByText('Popover content')).toBeVisible();
    expect(await axe()).toEqual([]);
  });
});

test.describe('one Escape closes one layer when a page layer is open too', () => {
  test('a Zag popover inside a page menu: Escape closes the popover, a second one the menu', async ({ mount, page }) => {
    const component = await mount<typeof InsideAppMenu>(STORY('InsideAppMenu'));
    const menuButton = component.getByRole('button', { name: APP_MENU_LABEL, exact: true });
    const menuPanel = component.getByRole('group', { name: `${APP_MENU_LABEL} panel` });
    const trigger = component.getByRole('button', { name: 'Zag in menu', exact: true });
    const popoverContent = component.getByText('Zag in menu content');
    await menuButton.click();
    await expect(menuPanel).toBeVisible();
    await trigger.click();
    await expect(popoverContent).toBeVisible();
    await expect(menuPanel, 'the popover belongs to the menu: opening it leaves the menu open').toBeVisible();

    await page.keyboard.press('Escape');
    await expect(popoverContent).toBeHidden();
    await expect(menuPanel, 'one Escape, one layer').toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menuPanel).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test('a page menu inside a Zag popover: Escape closes the menu, a second one the popover', async ({ mount, page }) => {
    const component = await mount<typeof HoldingAppMenu>(STORY('HoldingAppMenu'));
    const trigger = component.getByRole('button', { name: 'Popover', exact: true });
    const popoverContent = component.getByText('Popover content');
    const menuButton = component.getByRole('button', { name: 'Inner menu', exact: true });
    const menuPanel = component.getByRole('group', { name: 'Inner menu panel' });
    await trigger.click();
    await expect(popoverContent).toBeVisible();
    await menuButton.click();
    await expect(menuPanel).toBeVisible();
    await expect(popoverContent, 'the menu belongs to the popover: opening it leaves the popover open').toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menuPanel).toBeHidden();
    await expect(popoverContent, 'one Escape, one layer').toBeVisible();
    await expect(menuButton).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(popoverContent).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('an unrelated page menu and a Zag popover are never open together, and Escape closes the one that is', async ({ mount, page }) => {
    const component = await mount<typeof BesideAppMenu>(STORY('BesideAppMenu'));
    const menuButton = component.getByRole('button', { name: APP_MENU_LABEL, exact: true });
    const menuPanel = component.getByRole('group', { name: `${APP_MENU_LABEL} panel` });
    const trigger = component.getByRole('button', { name: 'Popover', exact: true });
    const popoverContent = component.getByText('Popover content');

    await menuButton.click();
    await expect(menuPanel).toBeVisible();
    await trigger.click();
    await expect(popoverContent).toBeVisible();
    await expect(menuPanel, 'opening the popover closed the menu').toBeHidden();
    await page.keyboard.press('Escape');
    await expect(popoverContent).toBeHidden();

    // and the other way round: the manager closes the Zag layer when a page layer opens
    await trigger.click();
    await expect(popoverContent).toBeVisible();
    await menuButton.click();
    await expect(menuPanel).toBeVisible();
    await expect(popoverContent, 'opening the menu closed the popover').toBeHidden();
    await page.keyboard.press('Escape');
    await expect(menuPanel).toBeHidden();
  });

  test('a layer of each kind open together has no axe violations', async ({ mount, axe }) => {
    const component = await mount<typeof InsideAppMenu>(STORY('InsideAppMenu'));
    await component.getByRole('button', { name: APP_MENU_LABEL, exact: true }).click();
    await component.getByRole('button', { name: 'Zag in menu', exact: true }).click();
    await expect(component.getByText('Zag in menu content')).toBeVisible();
    expect(await axe()).toEqual([]);
  });
});
