/* The end of an item level field's label line, drawn by a Lit element: the range ("1–795"), or in its place a flag while the cap was
   lowered or holds no cap: an icon and a few words ("1–795 only", "Max 288"). The same markup as src/partials/cap-flag.html, which
   the Job and sync panel still uses (TODO: both go when the cap field is one element, R38). The icons are Remix's error-warning-line
   and alert-line. */
import { html, nothing } from 'lit';

/* What level-cap.js capFlag returns: `kind` is 'error', 'lowered' or '' (none), `short` the few words, `full` the whole sentence. */
export interface CapFlag {
  kind: string;
  short: string;
  full: string;
}

const ERROR_ICON = html`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"/></svg>`;
const LOWERED_ICON = html`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.8659 3.00017L22.3922 19.5002C22.6684 19.9785 22.5045 20.5901 22.0262 20.8662C21.8742 20.954 21.7017 21.0002 21.5262 21.0002H2.47363C1.92135 21.0002 1.47363 20.5525 1.47363 20.0002C1.47363 19.8246 1.51984 19.6522 1.60761 19.5002L11.1339 3.00017C11.41 2.52187 12.0216 2.358 12.4999 2.63414C12.6519 2.72191 12.7782 2.84815 12.8659 3.00017ZM4.20568 19.0002H19.7941L11.9999 5.50017L4.20568 19.0002ZM10.9999 16.0002H12.9999V18.0002H10.9999V16.0002ZM10.9999 9.00017H12.9999V14.0002H10.9999V9.00017Z"/></svg>`;

/* The range text (with `rangeId` as its id) while `flag` is none, else the flag's icon and words. */
export function capFlagTemplate(rangeId: string, range: string, flag: CapFlag) {
  if (!flag.kind) {
    return html`<span class="f-range" id=${rangeId}>${range}</span>`;
  }
  return html`<span class="f-range" id=${rangeId} style="display: none">${range}</span
    ><span class="f-flag ${flag.kind}" aria-hidden="true">${flag.kind === 'error' ? ERROR_ICON : nothing}${flag.kind === 'lowered' ? LOWERED_ICON : nothing}<span>${flag.short}</span></span>`;
}
