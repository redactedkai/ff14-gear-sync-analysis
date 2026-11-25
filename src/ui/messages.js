/* The page's notes, in one place: the toast with the note after an action ("Deleted “UwU” sheet.") and the message of a failed
   save. Both are shown in one element at the window's bottom, outside the tabs, so a note set while leaving a tab is still seen.
   The text lives in the sheets store (`$store.sheets.note`, `saveMessage`), where the screens that say a note set it; this module
   shows it, clears it after NOTE_MS and holds the always-present polite live region a screen reader announces it from. */

/* How long a note after an action stays (ms). A failed save's message is not timed: it stays until a save succeeds. */
export const NOTE_MS = 6000;

/* The notes' component (x-data="notes" on the element that holds the toast and the save message). Members: `text` (the note
   shown, '') and `saveMessage` ('' when every edit is saved). */
export function notes() {
  let timer = null;
  return {
    init() {
      // a note clears itself NOTE_MS after it was last said (a second, identical note restarts the wait: each set counts in noteSeq)
      this.$watch('$store.sheets.noteSeq', () => {
        clearTimeout(timer);
        if (this.$store.sheets.note) {
          timer = setTimeout(() => this.$store.sheets.setNote(''), NOTE_MS);
        }
      });
    },
    get text() {
      return this.$store.sheets.note;
    },
    get saveMessage() {
      return this.$store.sheets.saveMessage;
    },
  };
}
