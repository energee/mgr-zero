/** Decides whether a key press accepts a field's suggestion. */

type KeyPress = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** The suggestion to set, or null. Only a plain Tab on an empty field accepts:
 *  Shift+Tab goes back, and a modified Tab belongs to the browser or the OS. */
export function acceptedSuggestion(event: KeyPress, value: string, suggestion: string | undefined): string | null {
  const plain = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
  return event.key === "Tab" && plain && value === "" && suggestion ? suggestion : null;
}
