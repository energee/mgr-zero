// components/mgr/screen-frame.tsx — one screen record inside the surface it
// actually ships in: the app or portal shell, a pinned-open CommandForm for a
// sheet, a bare card for an entry screen, or the vendor's own chrome for a
// venue frame. The published inventory (components/mgr/screen-index.tsx)
// renders through this, so a frame cannot look like two different things
// wherever it is shown.
import { AppShell, PortalShell } from "@/components/mgr/app-shell";
import { CommandForm } from "@/components/mgr/command-form";
import { E, splitPinned } from "@/components/mgr/e";
import { MeSheet } from "@/components/mgr/me-sheet";
import { MeView } from "@/components/mgr/views/me";
import { PortalMeView } from "@/components/mgr/views/portal-me";
import { UserAvatar } from "@/components/mgr/user-avatar";
import type { Screen } from "@/components/mgr/screens";
import { VenueFrame } from "@/components/mgr/venue";
import "@/components/mgr/venue.css";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/mgr/icon";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import { PERSONAS, type Persona, PORTAL_BUYER } from "@/lib/mgr/demo-personas";

/** A sheet record as the command form it ships in. Pinned open unless `onClose`
 * is given (the explorer passes it, and `container` to keep the portal in its box). */
export function ScreenSheet({ screen: s, container, onClose }: { screen: Screen; container?: HTMLElement | null; onClose?: () => void }) {
  if (s.name === "Me" || s.name === "Portal Me") {
    return <MeSheet open onOpenChange={(open) => !open && onClose?.()}>{s.body}</MeSheet>;
  }
  const { rest, pin } = splitPinned(s.body);
  return (
    <CommandForm open onOpenChange={onClose && ((open) => !open && onClose())} container={container} title={s.name} footer={pin.length ? pin : undefined}>
      <div className="flex flex-col gap-2">{rest}</div>
    </CommandForm>
  );
}

/** `persona` is the demo user the shell is drawn as (the explorer's switch,
 * lib/mgr/demo-personas.ts): their face and name in the header, their role's
 * rail. The default is the inventory's fixture, Maria the admin. */
export function ScreenFrame({ screen: s, persona = PERSONAS[0] }: { screen: Screen; persona?: Persona }) {
  // A venue frame is not an MGR screen: it brings its own product's chrome and
  // never the app shell (components/mgr/venue.tsx).
  if (s.venue) {
    return (
      <div className="flex flex-col justify-center bg-background p-4">
        <VenueFrame venue={s.venue}>{s.body}</VenueFrame>
      </div>
    );
  }
  if (s.surface === "entry") {
    return (
      <div className="flex flex-col justify-end bg-background p-4 md:items-center md:justify-center">
        <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-6 [&_[data-slot=button]]:w-full md:max-w-[420px]">
          {s.hd}
          {s.body}
        </div>
      </div>
    );
  }
  const body = s.surface === "sheet" ? <ScreenSheet screen={s} /> : s.body;
  // The staff user is the chosen persona's face; the portal user is the
  // customer's buyer (PORTAL_BUYER), a different person, shown by initials.
  const me = (
    <MeSheet avatar={{ src: persona.avatar, name: persona.name }}>
      <MeView
        model={{ name: persona.name, role: persona.role, email: `${persona.handle.slice(1)}@demobrewing.com`, breweries: [{ name: "Demo Brewing", current: true }] }}
        avatar={<UserAvatar src={persona.avatar} name={persona.name} className="size-10" />}
      />
    </MeSheet>
  );
  return s.portal ? (
    <PortalShell brand="Demo Brewing wholesale" headerRight={<MeSheet avatar={{ name: PORTAL_BUYER.name }}><PortalMeView model={{ email: PORTAL_BUYER.email, account: PORTAL_BUYER.account }} /></MeSheet>} composer={E.comp(true)} active={s.portal}>
      {body}
    </PortalShell>
  ) : (
    <AppShell
      brand="Demo Brewing"
      items={navFor(STAFF_NAV, persona.role)}
      headerRight={<><Button variant="ghost" size="sm"><Icon icon={Search01Icon} />Search</Button>{me}</>}
      composer={E.comp()}
      active={s.tab}
    >
      {body}
    </AppShell>
  );
}
