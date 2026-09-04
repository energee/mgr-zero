// lib/mgr/demo-personas.ts — the screen explorer's demo users, one per staff
// role. Demo only: nothing under app/ or the shells imports this. The app has
// one signed-in user and asks Supabase who they are; the explorer instead
// draws the shell as one of these people so a reader can see what each role
// gets. Access follows the same rule the rail follows (lib/mgr/nav.ts): a
// route the role may not see is a route the role may not open.
import { MARIA } from "@/components/mgr/user-avatar";
import type { StaffRole } from "@/lib/commands/registry";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import { ROUTES } from "@/lib/mgr/screen-links";

export type Persona = { role: StaffRole; name: string; handle: string; avatar?: string };

export const PERSONAS: Persona[] = [
  { role: "admin", name: "Maria Alvarez", handle: "@maria", avatar: MARIA },
  { role: "sales", name: "Sam Ortiz", handle: "@sam" },
  { role: "warehouse", name: "Wes Kim", handle: "@wes" },
  { role: "brewer", name: "Dave Nguyen", handle: "@dave" },
];

export const personaFor = (role: StaffRole) => PERSONAS.find((p) => p.role === role) ?? PERSONAS[0];

/** The role's landing: its own Today where one is drawn (Sales, Brewer). */
export const homeFor = (role: StaffRole) => ({ sales: "Sales", brewer: "Brewer" } as Partial<Record<StaffRole, string>>)[role] ?? "Today";

const routesOf = (role: StaffRole) => new Set(navFor(STAFF_NAV, role).flatMap((t) => [t.href, ...(t.children ?? []).map((c) => c.href)]));

/** True when every route that leads to `screen` is hidden from `role`. A screen
 * with no route of its own (a sheet, a detail) is reached through its parent,
 * which was already checked. ponytail: route-level only; per-command
 * permissions (the registry's role lists) would refine a detail's verbs. */
/** The roles that may open `screen`, from the rail entries that route to it
 * (admin always may). Empty for a screen with no route. */
export function needsFor(screen: string): StaffRole[] {
  const routes = Object.entries(ROUTES).filter(([, name]) => name === screen).map(([href]) => href);
  const items = STAFF_NAV.flatMap((t) => [t, ...(t.children ?? [])]).filter((i) => routes.includes(i.href));
  if (!items.length) return [];
  const roles = new Set<StaffRole>(["admin"]);
  for (const i of items) for (const r of i.roles ?? ["sales", "warehouse", "brewer"]) roles.add(r);
  return (["admin", "sales", "warehouse", "brewer"] as StaffRole[]).filter((r) => roles.has(r));
}

export function deniedFor(role: StaffRole, screen: string): boolean {
  const routes = Object.entries(ROUTES).filter(([, name]) => name === screen).map(([href]) => href);
  if (!routes.length) return false;
  const ok = routesOf(role);
  return !routes.some((r) => ok.has(r));
}
