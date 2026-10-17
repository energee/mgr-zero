/** Whether any held role is explicitly allowed. Admin belongs in the allowed list. */
export const hasAnyRole = (held: readonly string[], allowed: readonly string[]): boolean =>
  held.some(role => allowed.includes(role));

/** A restriction applies only to a nonempty set made entirely of excluded roles. */
export const onlyRoles = (held: readonly string[], excluded: readonly string[]): boolean =>
  held.length > 0 && held.every(role => excluded.includes(role));
