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
import { MARIA } from "@/components/mgr/user-avatar";
import type { Screen } from "@/components/mgr/screens";
import { VenueFrame } from "@/components/mgr/venue";
import "@/components/mgr/venue.css";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/mgr/icon";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

export function ScreenFrame({ screen: s }: { screen: Screen }) {
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
      <div className="flex flex-col justify-end bg-background p-4 @md:items-center @md:justify-center">
        <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-6 @md:max-w-[420px]">
          {s.hd}
          {s.body}
        </div>
      </div>
    );
  }
  const { rest, pin } = splitPinned(s.body);
  const body =
    s.surface === "sheet" ? (
      <CommandForm open title={s.name} footer={pin.length ? pin : undefined}>
        <div className="flex flex-col gap-2">{rest}</div>
      </CommandForm>
    ) : (
      s.body
    );
  // The staff user is the fixture face (Maria); the portal user is the customer's
  // buyer, a different person, so that header keeps the icon.
  const me = <MeSheet avatar={{ src: MARIA, name: "Maria Alvarez" }} fields={[["Brewery", "Demo Brewing"], ["Role", "admin"]]} />;
  return s.portal ? (
    <PortalShell brand="Demo Brewing wholesale" headerRight={<MeSheet fields={[["Account", "Ridgeline Tap Room"]]} />} composer={E.comp(true)} active={s.portal}>
      {body}
    </PortalShell>
  ) : (
    <AppShell
      brand="Demo Brewing"
      items={navFor(STAFF_NAV, "admin")}
      headerRight={<><Button variant="ghost" size="sm"><Icon icon={Search01Icon} />Search</Button>{me}</>}
      composer={E.comp()}
      active={s.tab}
    >
      {body}
    </AppShell>
  );
}
