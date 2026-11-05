// lib/escape-regex.ts — makes user text literal inside a Postgres regex, for
// the searches that filter with PostgREST `imatch` (case-insensitive `~*`).
// Searches use imatch, not ilike, because PostgREST rewrites every `*` in an
// ilike value to `%`, and that rewrite cannot be escaped (#1029).
export const escapeRegex = (s: string) => s.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");

/** A regex for a PostgREST or() filter. Quote it so commas and parentheses
 * stay text, then escape quotes and backslashes again. */
export const quotedRegex = (regex: string) => `"${regex.replace(/["\\]/g, (character) => `\\${character}`)}"`;

/** A literal contains pattern for a PostgREST or() filter. */
export const quotedSearchPattern = (value: string) => quotedRegex(escapeRegex(value));
