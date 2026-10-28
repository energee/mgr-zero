// lib/mgr/catalog-categories-view.ts — list edits the inventory Manage
// categories adapter simulates locally; the live path calls the category commands.

/** Why `next` can't be saved: another category (not `previous`) has the same name in any letter case. */
export function categoryNameError(names: string[], next: string, previous?: string): string | undefined {
  const key = next.trim().toLowerCase();
  const duplicate = names.find(name => name !== previous && name.toLowerCase() === key);
  return duplicate ? `A category named ${duplicate} already exists` : undefined;
}

/** Add `next`, or rename `previous` to it; a name another category already has is refused. */
export function saveCategory(names: string[], next: string, previous?: string): { names: string[] } | { error: string } {
  const error = categoryNameError(names, next, previous);
  if (error) return { error };
  return { names: previous ? names.map(name => name === previous ? next : name) : [...names, next] };
}

export const deleteCategory = (names: string[], name: string) => names.filter(value => value !== name);
