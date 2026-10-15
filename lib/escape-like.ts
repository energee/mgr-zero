// lib/escape-like.ts — makes user text literal inside a Postgres LIKE/ilike
// pattern, so a typed "%" or "_" matches itself instead of acting as a wildcard.
export const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);
