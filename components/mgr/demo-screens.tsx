// components/mgr/demo-screens.tsx — the two screens whose drawing is about
// the signed-in person, redrawn for the explorer's chosen persona
// (lib/mgr/demo-personas.ts): Me, and Permission denied for the screen the
// persona was just refused. Demo only: the inventory keeps its fixture
// drawings (Maria, "Invoices"); nothing under app/ imports this.
import { E } from "@/components/mgr/e";
import type { Screen } from "@/components/mgr/screens";
import { UserAvatar } from "@/components/mgr/user-avatar";
import { needsFor, type Persona } from "@/lib/mgr/demo-personas";

const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs[0] ?? "admin");

/** `screen` as `persona` would see it; any other screen comes back untouched. */
export function asPersona(screen: Screen, persona: Persona, refused?: string): Screen {
  if (screen.name === "Me") {
    return {
      ...screen,
      body: (
        <>
          {E.row(persona.name, persona.role, "", "", <UserAvatar src={persona.avatar} name={persona.name} className="size-10" />)}
          {E.fld("Signed in as", `${persona.handle.slice(1)}@demobrewing.com`)}
          {E.ttl("Brewery")}
          {E.row("Demo Brewing", "current", "✓", "ok")}
          {E.sp()}
          {E.btn("Change password", "g")}
          {E.btn("Sign out", "irr")}
        </>
      ),
    };
  }
  if (screen.name === "Permission denied" && refused) {
    return {
      ...screen,
      body: (
        <>
          {E.back("Today", "No access")}
          {E.note(`You do not have access to ${refused}.`)}
          {E.fld("Signed in as", `${persona.handle} · ${persona.role}`)}
          {E.fld("Needs", list(needsFor(refused)))}
          {E.info("An admin can change your role in Settings, then Team.")}
          {E.btns([["Back to Today", "p"]])}
          {E.sp()}
        </>
      ),
    };
  }
  return screen;
}
