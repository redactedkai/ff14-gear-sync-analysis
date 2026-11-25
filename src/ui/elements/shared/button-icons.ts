/* The icons of the Edit, Copy and Delete buttons of a sheet's page and of a set page (16 px) and the X of a dialog (18 px): Remix paths
   in a 24 px box, drawn in the button's text colour. */
import { html } from 'lit';

const EDIT_ICON =
  'M15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89H6.41421L15.7279 9.57627ZM17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785L17.1421 8.16206ZM7.24264 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L7.24264 20.89Z';
const COPY_ICON =
  'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z';
const DELETE_ICON =
  'M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z';
const CLOSE_ICON =
  'M12 10.5858L16.9497 5.63604L18.364 7.05025L13.4142 12L18.364 16.9497L16.9497 18.364L12 13.4142L7.05025 18.364L5.63604 16.9497L10.5858 12L5.63604 7.05025L7.05025 5.63604L12 10.5858Z';

/* A button's icon: a 16 px Remix path. */
function buttonIcon(path: string) {
  return html`<svg class="btnicon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${path} /></svg>`;
}

/* The Edit, Copy and Delete icons, ready to put in a button. */
export const editIcon = () => buttonIcon(EDIT_ICON);
export const copyIcon = () => buttonIcon(COPY_ICON);
export const deleteIcon = () => buttonIcon(DELETE_ICON);

/* The X of a dialog, ready to put in its close button. */
export const closeIcon = () =>
  html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d=${CLOSE_ICON} /></svg>`;
