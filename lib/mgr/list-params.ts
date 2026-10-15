// lib/mgr/list-params.ts — a list page's search, sort and filter live in the URL.
// listParams parses them with a zod schema whose fields each `.catch(default)`,
// so one hand-edited bad value falls back instead of failing the page, and
// hrefWith builds the link for one changed control while keeping the others.
import type { z } from "zod";

type Raw = Record<string, string | string[] | undefined>;

export function listParams<S extends z.ZodObject>(schema: S, raw: Raw) {
  const first = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const params = schema.parse(first) as z.infer<S>;
  const defaults = schema.parse({}) as Record<string, unknown>;
  /** The page's own URL with `patch` applied; a default or empty value is left out. */
  const hrefWith = (path: string, patch: Partial<z.infer<S>>) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) {
      if (v !== "" && v != null && v !== defaults[k]) query.set(k, String(v));
    }
    return query.size ? `${path}?${query}` : path;
  };
  return { params, hrefWith };
}
