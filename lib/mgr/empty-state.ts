// lib/mgr/empty-state.ts — what a list says when it has no rows. Adapters own
// the words (title, and the sentence telling the reader what to do next); the
// view component owns the icon, because icons live with the components.
export type EmptyState = {
  /** The fact: "No brands yet". */
  title: string;
  /** The next step, one sentence. Omit when there is nothing useful to say. */
  description?: string;
};
