/* The set page's Food menu as a Lit element in light DOM, with a Zag popover (filter-popover.ts) for Escape, a press outside, a close
   when the focus leaves it, the focus back on the button and the place. It sits inside the set page
   (docs/engineering/architecture.md section 3):
   - the set page gives it properties (`label`, `empty`, `disabled` for the button, and `menu`, the meals); the
     element sends `food-open` (whether the menu is open: the page builds `menu` only while it is, since it is a big list) and
     `meal-pick` (the key of the meal picked, or null for No food); it never reads a store;
   - the menu holds a search box, the stat pills, the "Best for goal" switch (while some meal is tagged), a Sort row (while a pill is on)
     and the list of meals by expansion (food-menu-model.ts has the state; views/meal-menu.js the filters). The list is drawn in steps
     (a window of rows first, the rest one step per frame while the menu stays open: views/limit-rows.ts);
   - opened, the search box takes the focus and the list scrolls to the meal the row shows;
   - inside the Auto-fill settings popover the menu is a child layer of it (filter-popover.ts). */
import { LitElement, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { drawInSteps } from '../../draw-in-steps.ts';
import { ROWS_PER_STEP } from '../../views/limit-rows.ts';
import { createFilterPopover } from '../gear-browser/filter-popover.ts';
import {
  FOOD_MENU_NAME,
  FOOD_OPEN_EVENT,
  FOOD_SEARCH_LABEL,
  FoodMenuModel,
  MEAL_PICK_EVENT,
  type MealMenuData,
  type MealRow,
  mealKeyOfClick,
} from './food-menu-model.ts';

/* How far below the list's top the shown meal lands when the menu opens (px): the meal above it stays in sight. */
const SHOWN_MEAL_OFFSET_PX = 40;

/* The `gsa-food-menu` element (registered below); see the file header. Properties: `label` (the words on the button: the meal's name,
   or what to say when there is none), `empty` (the row has no meal), `disabled`, `menu` (the meals, or null while closed) and `viewTop` (a function: the window's line the menu stays under, where the
   page's pinned headers end; it flips and shrinks to stay in the room under it). Attributes:
   `button-id` and `menu-id` (the ids the page's tests and labels name). */
export class GsaFoodMenu extends LitElement {
  static properties = {
    label: { type: String },
    empty: { type: Boolean },
    disabled: { type: Boolean },
    menu: { attribute: false },
    viewTop: { attribute: false },
    buttonId: { type: String, attribute: 'button-id' },
    menuId: { type: String, attribute: 'menu-id' },
  };

  declare label: string;
  declare empty: boolean;
  declare disabled: boolean;
  declare menu: MealMenuData | null;
  declare viewTop: (() => number) | null;
  declare buttonId: string;
  declare menuId: string;
  readonly layer: ReturnType<typeof createFilterPopover>;
  readonly model = new FoodMenuModel();
  // whether the last draw saw the menu open (the change is what opens and closes it for the page)
  #wasOpen = false;
  // a menu that opened and has not yet been given its first draw with meals: the search box takes the focus and the list scrolls
  #opening = false;
  #focusPending = false;

  constructor() {
    super();
    this.label = '';
    this.empty = true;
    this.disabled = false;
    this.menu = null;
    this.viewTop = null;
    this.buttonId = 'sh-meal-btn';
    this.menuId = 'sh-meal-menu';
    // one handler for the whole list, not one per meal
    this.addEventListener('click', event => this.onListClick(event));
    this.layer = createFilterPopover({
      element: this,
      triggerId: () => this.buttonId,
      contentId: () => this.menuId,
      name: FOOD_MENU_NAME,
      viewTop: () => this.viewTop?.() ?? 0,
      placement: 'bottom-start',
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.layer.bridge.release();
  }

  private get isOpen(): boolean {
    return this.layer.zag.machine !== null && this.layer.zag.api.open;
  }

  /* Before each draw: the model reads the page's menu; a menu that has just opened (and has its meals) starts from the pills the
     player left and the first rows. */
  protected override willUpdate(): void {
    this.model.menu = this.menu;
    const open = this.isOpen;
    if (open && !this.#wasOpen) {
      this.#opening = true;
    }
    if (!open) {
      this.#opening = false;
    }
    if (this.#opening && this.menu) {
      this.#opening = false;
      this.model.startOpen();
      this.#focusPending = true;
      this.drawRestInSteps();
    }
  }

  /* After each draw (Zag's attributes are on the parts by now): the layer is registered with the page's manager, or dropped; the page
     is told when the menu opened or closed; a menu just drawn takes the focus. */
  protected override updated(): void {
    this.layer.bridge.sync();
    const open = this.isOpen;
    if (open !== this.#wasOpen) {
      this.#wasOpen = open;
      this.dispatchEvent(new CustomEvent(FOOD_OPEN_EVENT, { detail: open, bubbles: true, composed: true }));
    }
    if (this.#focusPending && open) {
      this.#focusPending = false;
      // after the browser has laid the rows out
      requestAnimationFrame(() => this.focusSearchAndScrollToShown());
    }
  }

  /* Draws the meals past the first window, one step per frame while the menu stays open. */
  private drawRestInSteps(): void {
    drawInSteps(() => {
      if (!this.isConnected || !this.isOpen) {
        return false;
      }
      this.model.rows += ROWS_PER_STEP;
      this.requestUpdate();
      return this.model.rows < this.model.items.length;
    });
  }

  /* The search box takes the focus and the list starts at the shown meal. The menu may have closed again (a quick close) before the
     frame: then there is nothing to do. */
  private focusSearchAndScrollToShown(): void {
    if (!this.isConnected || !this.isOpen) {
      return;
    }
    this.querySelector<HTMLInputElement>('.menu-search input')?.focus({ preventScroll: true });
    const list = this.querySelector<HTMLElement>('.menu-list');
    const shown = list?.querySelector<HTMLElement>('.on');
    if (list && shown) {
      list.scrollTop += shown.getBoundingClientRect().top - list.getBoundingClientRect().top - SHOWN_MEAL_OFFSET_PX;
    }
  }

  /* A click inside the list: a meal row (or No food) is a pick, the menu closes with the focus back on the button and the page is told. */
  private onListClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (!target?.closest('.menu-list')) {
      return;
    }
    const key = mealKeyOfClick(target);
    if (key === undefined) {
      return;
    }
    this.layer.zag.api.setOpen(false);
    this.dispatchEvent(new CustomEvent(MEAL_PICK_EVENT, { detail: key, bubbles: true, composed: true }));
  }

  /* A change of the model's state: draw again. */
  private change(update: () => void): void {
    update();
    this.requestUpdate();
  }

  private renderLine(chips: MealRow['line']) {
    return chips.map(chip => html`<span class=${chip.cls}>${chip.text}</span>`);
  }

  private renderTools() {
    const model = this.model;
    return html`
      <div class="menu-tools">
        <span class="menu-search"><input
          type="text"
          placeholder=${FOOD_SEARCH_LABEL}
          autocomplete="off"
          aria-label=${FOOD_SEARCH_LABEL}
          .value=${live(model.query)}
          @input=${(event: Event) => this.change(() => (model.query = (event.target as HTMLInputElement).value))}></span>
        <div class="meal-pills" role="group" aria-label="Meal stats">${model.pills.map(
          pill => html`<button
            type="button"
            class="meal-pill ${model.stats.includes(pill.stat) ? 'on' : ''}"
            aria-pressed=${String(model.stats.includes(pill.stat))}
            ?disabled=${model.pillOff(pill.stat)}
            title=${pill.label}
            @click=${() => this.change(() => model.toggleStat(pill.stat))}>${pill.short}</button>`,
        )}</div>
        ${
          this.menu?.hasBest
            ? html`<label class="toggle"><input
                type="checkbox"
                role="switch"
                class="switch"
                aria-checked=${String(model.bestOnly)}
                .checked=${live(model.bestOnly)}
                @change=${(event: Event) => this.change(() => model.setBestOnly((event.target as HTMLInputElement).checked))}><span><span class="star" aria-hidden="true"></span>Best for goal</span></label>`
            : nothing
        }
      </div>`;
  }

  private renderSort(sorts: { key: string; label: string }[]) {
    const model = this.model;
    if (sorts.length === 0) {
      return nothing;
    }
    return html`<div class="meal-sort"><span id="sh-meal-sort-label">Sort</span><div class="seg" role="radiogroup" aria-labelledby="sh-meal-sort-label">${sorts.map(
      option => html`<label><input
        type="radio"
        name="sh-meal-sort"
        .value=${option.key}
        .checked=${live(model.sortBy === option.key)}
        @change=${() => this.change(() => (model.sortBy = option.key))}><span>${option.label}</span></label>`,
    )}</div></div>`;
  }

  private renderList() {
    const model = this.model;
    const view = model.shown;
    return html`
      <div class="menu-list">
        ${this.menu?.hasMeal ? html`<button type="button" class="same-item" data-meal=""><span>No food</span><span class="same-lvl"></span></button>` : nothing}
        ${repeat(
          view.groups,
          group => group.key,
          group => html`<div data-group=${group.key}>
            ${group.label ? html`<div class="same-head">${group.label}</div>` : nothing}
            ${repeat(
              group.items,
              meal => meal.key,
              meal =>
                html`<button type="button" class="same-item meal-item ${meal.rowClass}" data-meal=${meal.key}><span class="meal-lead"><span class="meal-ilvl">${meal.ilvlText}</span><span class="meal-name">${meal.name}</span></span><span class="same-lvl meal-line">${this.renderLine(meal.line)}</span></button>`,
            )}
          </div>`,
        )}
        ${
          view.empty
            ? html`<div class="menu-empty"><span>${view.empty.text}</span> <button type="button" class="linkbtn" @click=${() => this.change(() => (model.query = ''))}>Clear search</button></div>`
            : nothing
        }
      </div>`;
  }

  protected override render() {
    const open = this.isOpen && this.menu !== null;
    return html`
      <button
        type="button"
        class="same-btn ${this.empty ? 'choose-empty' : ''}"
        data-zag-part="trigger"
        data-empty=${String(this.empty)}
        ?disabled=${this.disabled}><span><span>${this.label}</span>${this.empty ? nothing : html`<span class="hqg" role="img" aria-label="High quality"></span>`}</span></button>
      <div data-zag-part="positioner">
        <div class="same-menu search-menu meal-menu" data-zag-part="content">
          ${open ? html`${this.renderTools()}${this.renderSort(this.model.shown.sorts)}${this.renderList()}` : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-food-menu', GsaFoodMenu);
