/* A modal dialog as a Lit element in light DOM, with a Zag dialog for the focus trap, the page behind (hidden from assistive
   technology, with the pointer blocked and its scroll locked) and the press outside. It wraps the page's own markup:
   the screen's template draws it only while a dialog is open (so closing removes it) and puts its own
   markup inside, so the element renders nothing of its own; it marks the parts the machine styles:
     <gsa-dialog content-id="sh-dialog" title-id="sh-dlg-title" initial-focus="#first" @dialog-close="..." @dialog-escape="...">
       <div data-zag-part="backdrop"></div>
       <div data-zag-part="positioner">
         <div data-zag-part="content">... <h3 id="sh-dlg-title"> ... <button data-zag-part="close-trigger"> ...</div>
       </div>
     </gsa-dialog>
   The dialog is open as long as the element is in the page, so the page decides when it closes. Attributes: `content-id` and
   `title-id` (the ids of the box and of its title, which the page's tests and styles name), `initial-focus` (a selector for the
   control that takes the focus when it opens; the first one the box holds when it is empty), `alert` (a question that asks for
   an answer: role `alertdialog`). Events: `dialog-close` (the X or a press outside; the page closes it) and `dialog-escape`
   (Escape; the page decides, since a note inside the box may take the Escape first). A text box that takes the focus when the
   dialog opens has its caret at the end of its text (Zag's focus trap would select the whole text, so that the first key typed
   replaces a sheet's name). The element gives the focus nowhere when it goes: the page puts it back on the control that opened
   the dialog, which it knows better than the machine does (Safari does not focus a clicked button), and does not when a change of
   page closes the dialog. */
import * as dialog from '@zag-js/dialog';
import { LitElement } from 'lit';
import { ZagController } from './zag-controller.ts';

/* The events the element sends. */
export const DIALOG_CLOSE_EVENT = 'dialog-close';
export const DIALOG_ESCAPE_EVENT = 'dialog-escape';

/* The Zag dialog of `host`: its props and the attributes of each part. */
function makeZag(host: GsaDialog) {
  return new ZagController(host, {
    name: 'dialog',
    machine: dialog.machine,
    connect: (service, normalize) => dialog.connect(service, normalize),
    getProps: () => ({
      ids: { content: host.contentId || undefined, title: host.titleId || undefined },
      role: host.alert ? ('alertdialog' as const) : ('dialog' as const),
      // open while the element is in the page: a close asks the page (the events), which removes the element
      open: true,
      restoreFocus: false,
      // a question also closes on a press outside the box (Zag's default for an alertdialog is to stay open)
      closeOnInteractOutside: true,
      initialFocusEl: () => {
        const control = host.initialFocus ? host.querySelector<HTMLElement>(host.initialFocus) : null;
        host.expectFocus(control);
        return control;
      },
      onOpenChange: ({ open }) => {
        if (!open) {
          host.dispatchEvent(new CustomEvent(DIALOG_CLOSE_EVENT, { bubbles: true }));
        }
      },
      onEscapeKeyDown: event => {
        event.preventDefault();
        host.dispatchEvent(new CustomEvent(DIALOG_ESCAPE_EVENT, { bubbles: true }));
      },
    }),
    parts: api => ({
      backdrop: api.getBackdropProps(),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      'close-trigger': api.getCloseTriggerProps(),
    }),
  });
}

/* The `gsa-dialog` element (registered below); see the file header. */
export class GsaDialog extends LitElement {
  static properties = {
    contentId: { type: String, attribute: 'content-id' },
    titleId: { type: String, attribute: 'title-id' },
    initialFocus: { type: String, attribute: 'initial-focus' },
    alert: { type: Boolean },
  };

  declare contentId: string;
  declare titleId: string;
  declare initialFocus: string;
  declare alert: boolean;
  readonly zag: ReturnType<typeof makeZag>;

  constructor() {
    super();
    this.contentId = '';
    this.titleId = '';
    this.initialFocus = '';
    this.alert = false;
    this.zag = makeZag(this);
    this.addEventListener('focusin', event => this.keepCaretAtEnd(event));
  }

  // the control that Zag is about to focus as the first one (set by `initialFocusEl`, cleared in the same task)
  #expectedFocus: HTMLElement | null = null;

  /* Called with the control that the focus trap is about to focus (and select the text of): the next focus of that control is the
     trap's, and the caret goes to the end of its text once the trap has selected it. A focus of the same control by anything else
     (a click, a script) is left alone. */
  expectFocus(control: HTMLElement | null): void {
    this.#expectedFocus = control;
    queueMicrotask(() => {
      this.#expectedFocus = null;
    });
  }

  /* The trap selects the text of the box it focuses, in the same task as the focus, so the caret waits for a microtask. */
  private keepCaretAtEnd(event: FocusEvent): void {
    const field = event.target;
    if (field !== this.#expectedFocus) {
      return;
    }
    if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.selectionStart !== null) {
      queueMicrotask(() => field.setSelectionRange(field.value.length, field.value.length));
    }
  }

  /* Light DOM: the page's markup is the element's own children. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

customElements.define('gsa-dialog', GsaDialog);
