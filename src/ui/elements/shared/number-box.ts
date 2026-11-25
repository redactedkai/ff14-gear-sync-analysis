/* The Lit side of the page's number boxes: a directive that gives an `<input type="number">` the value a `numberBox`
   (ui/number-field.js) says it should show. The rule is the box's, written once for Alpine and Lit: the stored value, except
   that text typed in the focused box (or left in it) that still means the stored value stays as typed ("60.7" for 61).
   Use: `<input type="number" .value=${shownNumber(box)} @input=${box.onInput} @change=${box.onChange}>`. */
import { nothing } from 'lit';
import type { PartInfo, PropertyPart } from 'lit/directive.js';
import { Directive, PartType, directive } from 'lit/directive.js';

/* What a numberBox gives the template: `shownValue(input)` is the value the box shows. */
export interface NumberBoxShape {
  shownValue(input: HTMLInputElement): string | number;
}

class ShownNumberDirective extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.PROPERTY) {
      throw new Error('shownNumber sets the value property of an input');
    }
  }

  /* Never used on its own (the server-side render path): the part's `update` below decides. */
  render(_box: NumberBoxShape): typeof nothing {
    return nothing;
  }

  override update(part: PropertyPart, [box]: [NumberBoxShape]): string | number {
    return box.shownValue(part.element as HTMLInputElement);
  }
}

/* The directive: `shownNumber(box)` as the `.value` of a number input. */
export const shownNumber = directive(ShownNumberDirective);
