// lib/mgr/empty-state.ts — what a list says when it has no rows. Adapters own
// the words; the view component owns the icon, because icons live with the
// components. One line and no helper sentence: the list's own create action
// (or its absence) says what to do next.
export type EmptyState = {
  /** The fact: "No brands yet". */
  title: string;
};
