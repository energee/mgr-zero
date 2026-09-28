// lib/mgr/catalog-categories-view.ts — list edits the inventory Manage
// categories adapter simulates locally; the live path calls the category commands.

/** Add `next`, or rename `previous` to it; a name already in the list is refused. */
export function saveCategory(names: string[], next: string, previous?: string): { names: string[] } | { error: string } {
  if (names.includes(next)) return { error: "A category with this name already exists" };
  return { names: previous ? names.map(name => name === previous ? next : name) : [...names, next] };
}

export const deleteCategory = (names: string[], name: string) => names.filter(value => value !== name);
