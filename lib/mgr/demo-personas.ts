// lib/mgr/demo-personas.ts — the screen explorer's demo users, one per staff
// role. Demo only: nothing under app/ or the shells imports this. The app has
// one signed-in user and asks Supabase who they are; the explorer instead
// draws the shell as one of these people so a reader can see what each role
// gets. Access follows the same rule the rail follows (lib/mgr/nav.ts): a
// route the role may not see is a route the role may not open.
import { MARIA } from "@/components/mgr/user-avatar";
import { SCREENS, type Screen } from "@/components/mgr/screens";
import type { StaffRole } from "@/lib/commands/registry";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import { ROUTES } from "@/lib/mgr/screen-links";

export type Persona = { role: StaffRole; name: string; handle: string; avatar?: string };

// The people on the Team screen (components/mgr/screens.tsx), one per role,
// with the faces in public/mock; tests/screen-persona.test.ts holds them to it.
export const PERSONAS: Persona[] = [
  { role: "admin", name: "Maria Alvarez", handle: "@maria", avatar: MARIA },
  { role: "sales", name: "Ted", handle: "@ted", avatar: "/mock/ted.jpg" },
  { role: "warehouse", name: "Sam Ortiz", handle: "@sam", avatar: "/mock/sam.jpg" },
  { role: "brewer", name: "Dave Chen", handle: "@dave", avatar: "/mock/dave.jpg" },
];

export const personaFor = (role: StaffRole) => PERSONAS.find((p) => p.role === role) ?? PERSONAS[0];

/** The role's landing: its own Today where one is drawn (Sales, Brewer). */
export const homeFor = (role: StaffRole) => ({ sales: "Sales", brewer: "Brewer" } as Partial<Record<StaffRole, string>>)[role] ?? "Today";

const routesOf = (role: StaffRole) => new Set(navFor(STAFF_NAV, role).flatMap((t) => [t.href, ...(t.children ?? []).map((c) => c.href)]));

/** Every drawn landing; the persona switch swaps one for the new role's. */
export const LANDINGS = ["Today", "Sales", "Brewer", "Driver", "Taproom"];

const ROLES: StaffRole[] = ["admin", "sales", "warehouse", "brewer"];
const byName = (name: string) => SCREENS.find((s) => s.name === name);

/** The roles a record's own `permission:` state names ("sales or admin
 * required", "warehouse membership + assigned route", "admin only"); admin
 * always. Empty when the record has no permission state. */
function permittedBy(screen?: Screen): StaffRole[] {
  const note = screen?.states?.find(([state]) => state === "permission")?.[1]?.toLowerCase();
  const named = ROLES.filter((r) => note?.includes(r));
  // "Role cannot record here" names nobody: not a rule this switch can apply.
  return named.length ? ROLES.filter((r) => r === "admin" || named.includes(r)) : [];
}

const routesTo = (screen: string) => Object.entries(ROUTES).filter(([, name]) => name === screen).map(([href]) => href);

/** The roles that may open `screen`: its record's permission state, else the
 * rail entries that route to it (admin always may). Empty for a screen with
 * neither. */
export function needsFor(screen: string): StaffRole[] {
  const own = permittedBy(byName(screen));
  if (own.length) return own;
  const routes = routesTo(screen);
  const items = STAFF_NAV.flatMap((t) => [t, ...(t.children ?? [])]).filter((i) => routes.includes(i.href));
  if (!items.length) return [];
  const roles = new Set<StaffRole>(["admin"]);
  for (const i of items) for (const r of i.roles ?? ["sales", "warehouse", "brewer"]) roles.add(r);
  return ROLES.filter((r) => roles.has(r));
}

/** True when `role` may not open `screen`: its record's permission state
 * leaves the role out, or every route that leads to it is hidden from the
 * role's rail. A screen with neither is reached through its parent, which was
 * already checked. */
export function deniedFor(role: StaffRole, screen: string): boolean {
  const own = permittedBy(byName(screen));
  if (own.length) return !own.includes(role);
  const routes = routesTo(screen);
  if (!routes.length) return false;
  const ok = routesOf(role);
  return !routes.some((r) => ok.has(r));
}

/** The sleuth: MGR screens whose record says the content depends on the
 * role, but which the persona switch cannot change — no drawn variant and no
 * permission state to refuse on. They need a drawing per role, not wiring.
 * (REPORT=<file> on tests/screen-persona.test.ts writes the list.) */
export function roleGaps(): { name: string; why: string }[] {
  const claims = /role[- ]filtered|role hidden|per role|by role|hidden entries|default rows/i;
  return SCREENS.filter((s) => !s.venue && !LANDINGS.includes(s.name) && !permittedBy(s).length).flatMap((s) => {
    const text = [s.job, s.spec, ...(s.states ?? []).map(([a, b]) => `${a}: ${b}`)].filter((t): t is string => typeof t === "string").join(" · ");
    const m = claims.exec(text);
    return m ? [{ name: s.name, why: text.slice(Math.max(0, m.index - 40), m.index + 60).trim() }] : [];
  });
}
