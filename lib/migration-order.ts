// lib/migration-order.ts — the pure half of scripts/check-migration-order.ts.
//
// `supabase db push` (scripts/vercel-build.sh) refuses to apply a local
// migration whose timestamp sorts before the newest one hosted has already
// applied. Sixteen 20260928* files landed after later ones and blocked every
// production deploy from 2026-09-28. So a branch may only ADD migrations newer
// than every migration already on main.

/** The 14-digit timestamp a migration file name starts with ("" if none). */
const stamp = (path: string) => path.split("/").pop()!.slice(0, 14);

/** Added migrations whose timestamp is not after the newest one on main. */
export function outOfOrder(onMain: string[], added: string[]): string[] {
  const newest = onMain.map(stamp).sort().at(-1) ?? "";
  return added.filter((f) => stamp(f) <= newest);
}
